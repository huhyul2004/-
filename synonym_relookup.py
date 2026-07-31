#!/usr/bin/env python3
"""not_found 269종 synonym 재조회 — GBIF backbone(species/match) 경유.

흐름:
  1) iucn-sync-failures.json 의 not_found 종 로드
  2) GBIF species/match → status/accepted name 판정
     - SYNONYM & accepted != 원학명 → accepted name 으로 IUCN 재조회
     - ACCEPTED (원학명과 동일) → IUCN 진짜 미등재 → skip
     - matchType=NONE → GBIF 실패 → skip
  3) IUCN taxa→assessment 재조회로 iucn_* 확보 → 원 species 행 UPDATE
  4) docs/synonym-mapping-log.json 기록 + 통계

실행: python3 synonym_relookup.py
"""
import json, os, sqlite3, sys, time
from datetime import datetime, timezone
import requests
from reparse_population import parse_pop  # 범위형 대응 파서 재사용

ROOT = os.path.dirname(__file__)
DB = os.path.join(ROOT, "data", "species.db")
FAIL = os.path.join(ROOT, "data", "iucn-sync-failures.json")
LOG = os.path.join(ROOT, "docs", "synonym-mapping-log.json")
IUCN = "https://api.iucnredlist.org/api/v4"
GBIF = "https://api.gbif.org/v1/species/match"
TOK = open(os.path.join(ROOT, ".env")).read().split("=", 1)[1].strip()
H = {"Authorization": f"Bearer {TOK}", "accept": "application/json"}


def now():
    return datetime.now(timezone.utc).isoformat()


def iucn_get(path):
    for a in range(4):
        try:
            r = requests.get(f"{IUCN}/{path}", headers=H, timeout=30)
        except requests.RequestException:
            if a == 3: return None, "network"
            time.sleep(2 * (a + 1)); continue
        if r.status_code == 429 or r.status_code >= 500:
            if a == 3: return None, "network"
            time.sleep(2 * (a + 1)); continue
        if r.status_code == 404: return None, "404"
        if not r.ok: return None, f"http_{r.status_code}"
        return r.json(), None
    return None, "network"


def gbif_match(name):
    for a in range(3):
        try:
            r = requests.get(GBIF, params={"name": name}, timeout=20)
            if r.ok: return r.json(), None
        except requests.RequestException:
            time.sleep(1 * (a + 1))
    return None, "gbif_error"


def iucn_lookup(accepted):
    """accepted 학명 → iucn_* dict | (None, reason)."""
    parts = accepted.split()
    if len(parts) < 2:
        return None, "bad_name"
    data, err = iucn_get(f"taxa/scientific_name?genus_name={parts[0]}&species_name={parts[1]}")
    if err == "network": return None, "iucn_network"
    if err or not data: return None, "iucn_not_found"
    taxon = data.get("taxon") or {}
    assessments = data.get("assessments") or []
    if not assessments: return None, "iucn_not_found"
    latest = next((a for a in assessments if a.get("latest")), assessments[0])
    aid = latest.get("assessment_id")
    detail, e2 = iucn_get(f"assessment/{aid}")
    if e2 == "network": return None, "iucn_network"
    category = latest.get("red_list_category_code")
    criteria = latest.get("criteria")
    url = latest.get("url")
    pe = latest.get("possibly_extinct")
    pop_trend = None; pop_size = None
    if detail:
        pt = detail.get("population_trend") or {}
        pop_trend = (pt.get("description") or {}).get("en")
        rc = detail.get("red_list_category") or {}
        category = rc.get("code") or category
        criteria = detail.get("criteria") or criteria
        url = detail.get("url") or url
        if detail.get("possibly_extinct") is not None: pe = detail.get("possibly_extinct")
        raw = (detail.get("supplementary_info") or {}).get("population_size")
        pop_size, _ = parse_pop(raw)
    return {
        "iucn_sis_id": taxon.get("sis_id"),
        "iucn_category": category,
        "iucn_criteria": criteria,
        "iucn_assessment_id": aid,
        "iucn_assessment_year": int(latest["year_published"]) if latest.get("year_published") else None,
        "iucn_population_trend": pop_trend,
        "iucn_possibly_extinct": 1 if pe else 0,
        "iucn_url": url,
        "iucn_population_size": pop_size,
        "iucn_synced_at": now(),
    }, None


UPD = """UPDATE species SET iucn_sis_id=:iucn_sis_id, iucn_category=:iucn_category,
  iucn_criteria=:iucn_criteria, iucn_assessment_id=:iucn_assessment_id,
  iucn_assessment_year=:iucn_assessment_year, iucn_population_trend=:iucn_population_trend,
  iucn_possibly_extinct=:iucn_possibly_extinct, iucn_url=:iucn_url,
  iucn_population_size=:iucn_population_size, iucn_synced_at=:iucn_synced_at
  WHERE scientific_name=:orig AND is_curated=1"""


def main():
    fails = json.load(open(FAIL))["failures"]
    names = [f["scientific_name"] for f in fails if f["reason"] == "not_found"]
    conn = sqlite3.connect(DB); cur = conn.cursor()
    print(f"not_found {len(names)}종 synonym 재조회 시작")

    mapping = []
    gbif_syn = gbif_acc = gbif_err = 0
    iucn_ok = iucn_miss = 0
    api_calls = api_errors = 0
    for i, name in enumerate(names, 1):
        g, gerr = gbif_match(name); api_calls += 1
        if gerr or not g or g.get("matchType") == "NONE":
            gbif_err += 1; api_errors += 1 if gerr else 0
            mapping.append({"orig": name, "gbif": "none", "accepted": None, "iucn_sis_id": None, "outcome": "gbif_no_match"})
            time.sleep(0.2); continue
        status = g.get("status"); accepted = g.get("species") or g.get("canonicalName")
        if status != "SYNONYM" or (accepted and accepted.lower() == name.lower()):
            gbif_acc += 1
            mapping.append({"orig": name, "gbif": status, "accepted": accepted, "iucn_sis_id": None, "outcome": "gbif_accepted_iucn_missing"})
            time.sleep(0.2); continue
        # synonym → accepted 로 IUCN 재조회
        gbif_syn += 1
        rec, rerr = iucn_lookup(accepted); api_calls += 2
        time.sleep(0.5)
        if rerr:
            if "network" in (rerr or ""): api_errors += 1
            iucn_miss += 1
            mapping.append({"orig": name, "gbif": "SYNONYM", "accepted": accepted, "iucn_sis_id": None, "outcome": rerr})
            continue
        cur.execute(UPD, {**rec, "orig": name})
        iucn_ok += 1
        mapping.append({"orig": name, "gbif": "SYNONYM", "accepted": accepted,
                        "iucn_sis_id": rec["iucn_sis_id"], "iucn_category": rec["iucn_category"],
                        "iucn_population_size": rec["iucn_population_size"], "outcome": "recovered", "rowcount": cur.rowcount})
        if iucn_ok % 20 == 0:
            conn.commit()
        if i % 40 == 0:
            print(f"  [{i}/{len(names)}] synonym={gbif_syn} 회복={iucn_ok} gbif_accepted={gbif_acc} gbif_none={gbif_err}")
    conn.commit(); conn.close()

    os.makedirs(os.path.dirname(LOG), exist_ok=True)
    json.dump({"generated": now(), "count": len(mapping), "mapping": mapping},
              open(LOG, "w"), ensure_ascii=False, indent=1)
    err_rate = (api_errors / api_calls * 100) if api_calls else 0
    print(f"\n=== 결과 ===")
    print(f"  GBIF synonym 판정: {gbif_syn} · GBIF accepted(미등재): {gbif_acc} · GBIF no-match: {gbif_err}")
    print(f"  IUCN 재조회 성공(회복): {iucn_ok} · IUCN 재조회 실패: {iucn_miss}")
    print(f"  API 오류율: {err_rate:.1f}% ({api_errors}/{api_calls})")
    print(f"  매핑 로그 → {LOG}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
