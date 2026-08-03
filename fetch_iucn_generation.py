#!/usr/bin/env python3
"""IUCN v4 /assessment/{id} 에서 supplementary_info.generational_length 재조회 → 저장.

- 대상: is_curated=1 · iucn_assessment_id 있는 종.
- 재개: 처리분을 결과 JSON에 기록 → 재실행 시 스킵.
- 레이트리밋 0.5s, 429/5xx 지수 백오프, 50건마다 커밋.
- 원본 무손상. iucn_generation_length(파싱 float)·iucn_generation_length_raw(원문)에만 기록.

실행: python3 fetch_iucn_generation.py
"""
import json, os, sqlite3, sys, time
import requests

ROOT = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(ROOT, "data", "species.db")
RESULTS = os.path.join(ROOT, "data", "iucn-generation-fetch.json")
BASE = "https://api.iucnredlist.org/api/v4"
SLEEP = 0.5; BACKOFF = 2.0; MAX_RETRIES = 5; COMMIT_EVERY = 50

TOKEN = None
for line in open(os.path.join(ROOT, ".env")):
    if line.startswith("IUCN_API_TOKEN"):
        TOKEN = line.split("=", 1)[1].strip(); break
H = {"Authorization": f"Bearer {TOKEN}", "accept": "application/json"}


def api_get(path):
    for a in range(MAX_RETRIES):
        try:
            r = requests.get(f"{BASE}/{path}", headers=H, timeout=30)
        except requests.RequestException:
            if a == MAX_RETRIES - 1: return None, "network"
            time.sleep(BACKOFF * (2 ** a)); continue
        if r.status_code == 429 or r.status_code >= 500:
            if a == MAX_RETRIES - 1: return None, "network"
            time.sleep(BACKOFF * (2 ** a)); continue
        if r.status_code == 404: return None, "404"
        if not r.ok: return None, f"http_{r.status_code}"
        return r.json(), None
    return None, "network"


def parse_gen(raw):
    """generational_length 문자열 → float(years) | None. 범위/빈값은 None(raw 보존)."""
    if raw is None: return None
    s = str(raw).strip().replace(",", "")
    if s == "" or s.lower() in ("unknown", "na", "n/a"): return None
    try:
        return float(s)
    except ValueError:
        return None  # "10-15" 등 범위 → None (raw 보존)


def load_results():
    if os.path.exists(RESULTS):
        try: return json.load(open(RESULTS))
        except Exception: return {}
    return {}


UPD = "UPDATE species SET iucn_generation_length=?, iucn_generation_length_raw=? WHERE id=?"


def main():
    conn = sqlite3.connect(DB); cur = conn.cursor()
    rows = cur.execute(
        """SELECT id, scientific_name, iucn_assessment_id FROM species
           WHERE is_curated=1 AND iucn_assessment_id IS NOT NULL
           ORDER BY scientific_name"""
    ).fetchall()
    results = load_results()
    todo = [r for r in rows if str(r[2]) not in results]
    print(f"대상 {len(rows)}종 · 이미 처리 {len(rows)-len(todo)} · 이번 {len(todo)}종", flush=True)
    if not todo:
        print("모두 처리됨."); return 0

    got = miss = err = pending = 0
    for i, (sid, name, aid) in enumerate(todo, 1):
        d, e = api_get(f"assessment/{aid}")
        time.sleep(SLEEP)
        if e:
            results[str(aid)] = {"gen": None, "raw": None, "err": e}; err += 1
        else:
            raw = (d.get("supplementary_info") or {}).get("generational_length")
            g = parse_gen(raw)
            results[str(aid)] = {"gen": g, "raw": raw}
            if g is not None:
                cur.execute(UPD, (g, raw, sid)); got += 1; pending += 1
            elif raw is not None:
                cur.execute(UPD, (None, raw, sid)); pending += 1; miss += 1  # raw만 보존
            else:
                miss += 1
        if pending >= COMMIT_EVERY:
            conn.commit(); json.dump(results, open(RESULTS, "w"), ensure_ascii=False); pending = 0
        if (i % 200) == 0:
            print(f"  [{i}/{len(todo)}] 값확보={got} 없음/범위={miss} 오류={err}", flush=True)

    conn.commit(); json.dump(results, open(RESULTS, "w"), ensure_ascii=False)
    conn.close()
    print(f"\n완료: 값확보 {got} · 없음/범위 {miss} · 오류 {err}")
    print(f"결과 → {RESULTS}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
