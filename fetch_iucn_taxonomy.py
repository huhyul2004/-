#!/usr/bin/env python3
"""IUCN v4 /taxa/scientific_name 에서 taxonomy(kingdom~family) 재조회 → iucn_* 컬럼 저장.

- 대상: is_curated=1 · iucn_category 유효(NA/DD/NE 제외) 종.
- 재개: 처리분을 결과 JSON에 기록 → 재실행 시 스킵.
- 레이트리밋 0.5s, 429/5xx 지수 백오프, 50건마다 커밋.
- 원본 컬럼 무손상. iucn_kingdom/phylum/class/order/family 에만 기록.

실행: python3 fetch_iucn_taxonomy.py
"""
import json, os, sqlite3, sys, time

import requests

ROOT = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(ROOT, "data", "species.db")
RESULTS = os.path.join(ROOT, "data", "iucn-taxonomy-fetch.json")
BASE = "https://api.iucnredlist.org/api/v4"
SLEEP = 0.5
BACKOFF = 2.0
MAX_RETRIES = 5
COMMIT_EVERY = 50

# .env 직접 파싱 (find_dotenv 우회)
TOKEN = None
for line in open(os.path.join(ROOT, ".env")):
    if line.startswith("IUCN_API_TOKEN"):
        TOKEN = line.split("=", 1)[1].strip()
        break
H = {"Authorization": f"Bearer {TOKEN}", "accept": "application/json"}


def api_get(path, params=None):
    for a in range(MAX_RETRIES):
        try:
            r = requests.get(f"{BASE}/{path}", headers=H, params=params, timeout=30)
        except requests.RequestException:
            if a == MAX_RETRIES - 1:
                return None, "network"
            time.sleep(BACKOFF * (2 ** a)); continue
        if r.status_code == 429 or r.status_code >= 500:
            if a == MAX_RETRIES - 1:
                return None, "network"
            time.sleep(BACKOFF * (2 ** a)); continue
        if r.status_code == 404:
            return None, "404"
        if not r.ok:
            return None, f"http_{r.status_code}"
        return r.json(), None
    return None, "network"


def split_name(sci):
    parts = sci.split()
    if len(parts) < 2:
        return None, None
    return parts[0], parts[1]


def load_results():
    if os.path.exists(RESULTS):
        try:
            return json.load(open(RESULTS))
        except Exception:
            return {}
    return {}


UPD = """UPDATE species SET
  iucn_kingdom=:k, iucn_phylum=:p, iucn_class=:c, iucn_order=:o, iucn_family=:f
WHERE id=:id"""


def main():
    conn = sqlite3.connect(DB); cur = conn.cursor()
    rows = cur.execute(
        """SELECT id, scientific_name FROM species
           WHERE is_curated=1 AND iucn_category IS NOT NULL
             AND iucn_category NOT IN ('NA','DD','NE')
           ORDER BY scientific_name"""
    ).fetchall()

    results = load_results()  # {scientific_name: {"class":..., ...} | {"err":...}}
    todo = [r for r in rows if r[1] not in results]
    print(f"대상 {len(rows)}종 · 이미 처리 {len(rows)-len(todo)} · 이번 {len(todo)}종", flush=True)
    if not todo:
        print("모두 처리됨."); return 0

    got = miss = err = pending = 0
    for i, (sid, sci) in enumerate(todo, 1):
        genus, species = split_name(sci)
        if not genus:
            results[sci] = {"err": "badname"}; miss += 1; continue
        d, e = api_get("taxa/scientific_name",
                       {"genus_name": genus, "species_name": species})
        time.sleep(SLEEP)
        if e:
            results[sci] = {"err": e}; err += 1
        else:
            tx = (d or {}).get("taxon") or {}
            rec = {
                "k": tx.get("kingdom_name"), "p": tx.get("phylum_name"),
                "c": tx.get("class_name"), "o": tx.get("order_name"),
                "f": tx.get("family_name"),
            }
            results[sci] = {"kingdom": rec["k"], "phylum": rec["p"],
                            "class": rec["c"], "order": rec["o"], "family": rec["f"]}
            if rec["c"]:
                rec["id"] = sid; cur.execute(UPD, rec); got += 1; pending += 1
            else:
                miss += 1
        if pending >= COMMIT_EVERY:
            conn.commit(); json.dump(results, open(RESULTS, "w"), ensure_ascii=False); pending = 0
        if (i % 200) == 0:
            print(f"  [{i}/{len(todo)}] class확보={got} 없음={miss} 오류={err}", flush=True)

    conn.commit(); json.dump(results, open(RESULTS, "w"), ensure_ascii=False)
    conn.close()
    print(f"\n완료: class확보 {got} · 없음 {miss} · 오류 {err}")
    print(f"결과 → {RESULTS}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
