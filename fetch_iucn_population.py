#!/usr/bin/env python3
"""IUCN v4 /assessment/{id} 에서 supplementary_info.population_size 재조회 → iucn_population_size 저장.

- 대상: iucn_assessment_id 있는 종 (taxa 조회 생략, assessment 1콜/종).
- 재개: 처리분을 결과 JSON에 기록 → 재실행 시 스킵 (값 null이어도 '시도함'으로 추적).
- 레이트리밋 0.5s, 429/5xx 지수 백오프, 50건마다 커밋.

실행: python3 fetch_iucn_population.py
"""
import json, os, sqlite3, sys, time
from datetime import datetime, timezone
import requests
from tqdm import tqdm

ROOT = os.path.dirname(__file__)
DB = os.path.join(ROOT, "data", "species.db")
RESULTS = os.path.join(ROOT, "data", "iucn-population-fetch.json")
BASE = "https://api.iucnredlist.org/api/v4"
SLEEP = 0.5
BACKOFF = 2.0
MAX_RETRIES = 5
COMMIT_EVERY = 50

TOKEN = open(os.path.join(ROOT, ".env")).read().split("=", 1)[1].strip()
H = {"Authorization": f"Bearer {TOKEN}", "accept": "application/json"}


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def api_get(path):
    for a in range(MAX_RETRIES):
        try:
            r = requests.get(f"{BASE}/{path}", headers=H, timeout=30)
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


def parse_pop(raw):
    """population_size 문자열 → int | None (파싱 불가/범위/빈값은 None, raw 별도 보존)."""
    if raw is None:
        return None
    s = str(raw).strip().replace(",", "")
    if s == "" or s.lower() in ("unknown", "na", "n/a"):
        return None
    try:
        return int(float(s))
    except ValueError:
        return None  # 범위("100-500") 등 → int 실패 → None (raw는 결과 JSON에 보존)


def load_results():
    if os.path.exists(RESULTS):
        try:
            return json.load(open(RESULTS))
        except Exception:
            return {}
    return {}


def main():
    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    rows = cur.execute(
        """SELECT id, scientific_name, iucn_assessment_id FROM species
           WHERE is_curated=1 AND iucn_assessment_id IS NOT NULL ORDER BY scientific_name"""
    ).fetchall()

    results = load_results()  # {assessment_id(str): {"pop": int|None, "raw": str|None}}
    todo = [r for r in rows if str(r[2]) not in results]
    print(f"대상 {len(rows)}종 · 이미 처리 {len(rows)-len(todo)} · 이번 {len(todo)}종")
    if not todo:
        print("모두 처리됨."); return 0

    setpop = cur.execute  # alias
    UPD = "UPDATE species SET iucn_population_size=? WHERE id=?"

    got = 0; nullv = 0; err = 0; pending = 0
    bar = tqdm(todo, unit="종", ncols=90)
    for i, (sid, name, aid) in enumerate(bar, 1):
        d, e = api_get(f"assessment/{aid}")
        time.sleep(SLEEP)
        if e:
            err += 1
            results[str(aid)] = {"pop": None, "raw": None, "err": e}
        else:
            raw = (d.get("supplementary_info") or {}).get("population_size")
            pop = parse_pop(raw)
            results[str(aid)] = {"pop": pop, "raw": raw}
            if pop is not None:
                cur.execute(UPD, (pop, sid)); got += 1; pending += 1
            else:
                nullv += 1
        bar.set_postfix(값있음=got, 값없음=nullv, 오류=err)
        if pending >= COMMIT_EVERY:
            conn.commit(); json.dump(results, open(RESULTS, "w"), ensure_ascii=False); pending = 0
        if (i % 200) == 0:
            tqdm.write(f"  [{i}/{len(todo)}] 값있음={got} 값없음={nullv} 오류={err}")

    conn.commit(); json.dump(results, open(RESULTS, "w"), ensure_ascii=False)
    conn.close()
    print(f"\n완료: 값있음 {got} · 값없음 {nullv} · 오류 {err}")
    print(f"결과 → {RESULTS}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
