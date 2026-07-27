#!/usr/bin/env python3
"""IUCN Red List v4 → species.db 동기화 (검증용 4종 테스트).

전체 4,230종 실행 전에 소수 종으로 파이프라인을 검증한다.
각 종: /taxa/scientific_name (2단어로 분리) → latest assessment 찾기
        → /assessment/{id} 상세 → iucn_* 컬럼 UPDATE.

실행:
    python3 sync_iucn_test.py
"""
import json
import os
import sqlite3
import sys
import time
from datetime import datetime, timezone

import requests
from dotenv import load_dotenv

ROOT = os.path.dirname(__file__)
DB_PATH = os.path.join(ROOT, "data", "species.db")
FAIL_LOG = os.path.join(ROOT, "data", "iucn-sync-failures.json")
BASE = "https://api.iucnredlist.org/api/v4"

# 검증 대상 4종 (아종/일반종 섞음)
TEST_SPECIES = [
    "Phocoena sinus",          # 바키타돌고래
    "Rhinoceros sondaicus",    # 자바코뿔소
    "Panthera tigris altaica", # 시베리아호랑이 (아종 — 3단어, 매칭 주의)
    "Haliaeetus leucocephalus",# 흰머리수리
]

load_dotenv(os.path.join(ROOT, ".env"))
TOKEN = os.getenv("IUCN_API_TOKEN")
HEADERS = {"Authorization": f"Bearer {TOKEN}", "accept": "application/json"}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def api_get(path: str, params: dict | None = None):
    """(status_code, json|None, error_kind|None). 네트워크 오류는 예외로 구분."""
    url = f"{BASE}/{path}"
    for attempt in range(3):
        try:
            r = requests.get(url, headers=HEADERS, params=params, timeout=30)
        except requests.RequestException as e:
            if attempt == 2:
                return None, None, f"network_error: {e}"
            time.sleep(1.5 * (attempt + 1))
            continue
        if r.status_code in (429, 500, 502, 503, 504):
            time.sleep(2.0 * (attempt + 1))
            continue
        if r.status_code == 404:
            return 404, None, None
        if not r.ok:
            return r.status_code, None, f"http_{r.status_code}"
        return r.status_code, r.json(), None
    return None, None, "network_error: retries exhausted"


def split_name(sci: str):
    """학명을 genus/species 로 분리. 3단어(아종)는 앞 2단어만 사용."""
    parts = sci.split()
    if len(parts) < 2:
        return None, None, None
    genus, species = parts[0], parts[1]
    infra = parts[2] if len(parts) >= 3 else None  # subspecies
    return genus, species, infra


def pick_latest(assessments: list) -> dict | None:
    if not assessments:
        return None
    latest = next((a for a in assessments if a.get("latest")), None)
    return latest or assessments[0]


def fetch_species(sci: str):
    """returns (record|None, fail_reason|None)."""
    genus, species, infra = split_name(sci)
    if not genus:
        return None, "not_found"  # 학명 형식 이상

    st, data, err = api_get(
        "taxa/scientific_name",
        {"genus_name": genus, "species_name": species},
    )
    if err and err.startswith("network_error"):
        return None, "network_error"
    if st == 404 or not data:
        return None, "not_found"

    taxon = data.get("taxon") or {}
    assessments = data.get("assessments") or []
    if not assessments:
        return None, "not_found"

    # 아종인데 종 레벨로만 매칭된 경우 표시 (참고용, 여기선 종 레벨 값 사용)
    note = "subspecies_matched_at_species_level" if infra else None

    latest = pick_latest(assessments)
    if not latest:
        return None, "not_found"

    aid = latest.get("assessment_id")

    # 상세 평가
    st2, detail, err2 = api_get(f"assessment/{aid}")
    if err2 and err2.startswith("network_error"):
        return None, "network_error"

    pop_trend = None
    category = latest.get("red_list_category_code")
    criteria = latest.get("criteria")
    url = latest.get("url")
    possibly_extinct = latest.get("possibly_extinct")
    if detail:
        pt = detail.get("population_trend") or {}
        pop_trend = (pt.get("description") or {}).get("en")
        rc = detail.get("red_list_category") or {}
        category = rc.get("code") or category
        criteria = detail.get("criteria") or criteria
        url = detail.get("url") or url
        if detail.get("possibly_extinct") is not None:
            possibly_extinct = detail.get("possibly_extinct")

    rec = {
        "iucn_sis_id": taxon.get("sis_id"),
        "iucn_category": category,
        "iucn_criteria": criteria,
        "iucn_assessment_id": aid,
        "iucn_assessment_year": int(latest["year_published"]) if latest.get("year_published") else None,
        "iucn_population_trend": pop_trend,
        "iucn_possibly_extinct": 1 if possibly_extinct else 0,
        "iucn_url": url,
        "iucn_synced_at": now_iso(),
        "_note": note,
        "_common": next((c.get("name") for c in (taxon.get("common_names") or []) if c.get("main")),
                        (taxon.get("common_names") or [{}])[0].get("name") if taxon.get("common_names") else None),
    }
    return rec, None


UPDATE_SQL = """
UPDATE species SET
  iucn_sis_id=:iucn_sis_id,
  iucn_category=:iucn_category,
  iucn_criteria=:iucn_criteria,
  iucn_assessment_id=:iucn_assessment_id,
  iucn_assessment_year=:iucn_assessment_year,
  iucn_population_trend=:iucn_population_trend,
  iucn_possibly_extinct=:iucn_possibly_extinct,
  iucn_url=:iucn_url,
  iucn_synced_at=:iucn_synced_at
WHERE scientific_name=:sci AND is_curated=1
"""


def main() -> int:
    if not TOKEN:
        print("✗ IUCN_API_TOKEN 없음 (.env 확인)")
        return 1

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    failures = []
    ok = 0
    for sci in TEST_SPECIES:
        print("\n" + "=" * 60)
        print(f"▶ {sci}")
        rec, reason = fetch_species(sci)
        if reason:
            print(f"  ✗ 실패: {reason}")
            failures.append({"scientific_name": sci, "reason": reason})
            continue

        # 콘솔 예쁘게 출력
        print(f"  일반명(EN)     : {rec['_common']}")
        print(f"  SIS ID         : {rec['iucn_sis_id']}")
        print(f"  IUCN 등급       : {rec['iucn_category']}  (기준 {rec['iucn_criteria']})")
        print(f"  평가 연도       : {rec['iucn_assessment_year']}  (assessment {rec['iucn_assessment_id']})")
        print(f"  개체수 추세     : {rec['iucn_population_trend']}")
        print(f"  possibly_extinct: {rec['iucn_possibly_extinct']}")
        print(f"  URL            : {rec['iucn_url']}")
        if rec.get("_note"):
            print(f"  ⚠ note         : {rec['_note']}")

        # UPDATE
        params = {k: v for k, v in rec.items() if not k.startswith("_")}
        params["sci"] = sci
        cur.execute(UPDATE_SQL, params)
        if cur.rowcount == 0:
            print(f"  ⚠ DB에 매칭되는 curated 행 없음 (rowcount=0) — UPDATE 건너뜀")
            failures.append({"scientific_name": sci, "reason": "not_in_db"})
        else:
            print(f"  ✓ DB 반영 (rowcount={cur.rowcount})")
            ok += 1

    conn.commit()
    conn.close()

    if failures:
        with open(FAIL_LOG, "w", encoding="utf-8") as f:
            json.dump({"generated": now_iso(), "failures": failures}, f,
                      ensure_ascii=False, indent=2)
        print(f"\n실패 {len(failures)}건 → {FAIL_LOG}")

    print(f"\n{'='*60}\n결과: 성공 {ok} / {len(TEST_SPECIES)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
