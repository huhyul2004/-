#!/usr/bin/env python3
"""threats 테이블에 threat_parent · threat_category · timing 컬럼을 추가하고 채운다.

IUCN 위협 이름(threat_name)은 말단 항목 이름뿐이라 "Named species" 처럼 여러 코드가 같은 이름을 쓴다
(8_1_2 외래 침입종 / 8_2_2 문제성 토착종 …). 기존 threat_name 은 그대로 두고 새 컬럼에 상위를 담는다.

- threat_parent / threat_category : threat_code 에서 역산 (data/iucn-threat-codes.json, API 재조회 없음)
- timing (Ongoing / Future / Past, … / Unknown) : data/iucn-details-fetch.json 에 없어 재조회.
  수집 때와 같은 평가(저장된 iucn_assessment_id)를 받아 같은 parse_details() 로 읽고
  (species_id, threat_code) 로 맞춘다. 캐시 data/iucn-threat-timing-fetch.json 으로 재개.
- 수기 시드 22종(threat_code 가 NULL 인 행)은 읽지도 고치지도 않는다.
- idempotent: 이미 있는 컬럼은 스킵, timing 은 NULL 인 행만 UPDATE.

실행:
    python3 migrate_threat_hierarchy.py                    # 컬럼 추가 + 상위 분류 채우기
    python3 migrate_threat_hierarchy.py --timing --limit 10 # timing 재조회 (부분)
    python3 migrate_threat_hierarchy.py --timing           # timing 재조회 (남은 종 전체)
"""
import argparse
import json
import os
import signal
import sqlite3
import sys
import time
from collections import Counter

from tqdm import tqdm

from sync_iucn_all import (COMMIT_EVERY, DB_PATH, DETAIL_CACHE, PER_CALL_SLEEP, ROOT,
                           SUMMARY_EVERY, TOKEN, api_get, hms, load_seed_ids, now_iso,
                           parse_details, threat_hierarchy, threat_names)

TIMING_CACHE = os.path.join(ROOT, "data", "iucn-threat-timing-fetch.json")
NEW_COLUMNS = [("threat_parent", "TEXT"), ("threat_category", "TEXT"), ("timing", "TEXT")]


def add_columns(cur) -> None:
    existing = {r[1] for r in cur.execute("PRAGMA table_info(threats)")}
    for name, coltype in NEW_COLUMNS:
        if name in existing:
            print(f"  · {name} 이미 존재 → 스킵")
        else:
            cur.execute(f"ALTER TABLE threats ADD COLUMN {name} {coltype}")
            print(f"  + {name} {coltype} 추가")


def fill_hierarchy(cur, seed_ids) -> None:
    names = threat_names()
    rows = cur.execute(
        "SELECT id, species_id, threat_code FROM threats WHERE threat_code IS NOT NULL").fetchall()
    unknown = Counter()
    n = 0
    for rid, sid, code in rows:
        if sid in seed_ids:
            continue
        if code not in names:
            unknown[code] += 1
            continue
        parent, category = threat_hierarchy(code)
        cur.execute("UPDATE threats SET threat_parent=?, threat_category=? WHERE id=?",
                    (parent, category, rid))
        n += 1
    print(f"  상위 분류 채움 {n}행 · 코드 목록에 없는 코드 {sum(unknown.values())}행 {dict(unknown)}")


def fill_timing(conn, cur, seed_ids, limit) -> int:
    with open(DETAIL_CACHE, encoding="utf-8") as f:
        detail_cache = json.load(f)["species"]
    cache = {}
    if os.path.exists(TIMING_CACHE):
        with open(TIMING_CACHE, encoding="utf-8") as f:
            cache = json.load(f).get("species", {})

    rows = [r for r in cur.execute(
        """SELECT s.id, s.scientific_name, s.iucn_assessment_id FROM species s
           WHERE s.id IN (SELECT species_id FROM threats WHERE threat_code IS NOT NULL)
           ORDER BY s.scientific_name""")
            if r[0] not in seed_ids and r[0] not in cache]
    if limit:
        rows = rows[:limit]
    print(f"timing 재조회 — 이미 완료 {len(cache)}종 · 이번 처리 {len(rows)}종")
    if not rows:
        return 0

    def flush():
        conn.commit()
        with open(TIMING_CACHE, "w", encoding="utf-8") as f:
            json.dump({"updated": now_iso(), "count": len(cache), "species": cache},
                      f, ensure_ascii=False, indent=1)

    interrupted = {"flag": False}

    def handle_sigint(signum, frame):
        interrupted["flag"] = True
        print("\n⚠ 중단 요청 감지 — 현재 배치 커밋 후 안전 종료합니다…")

    signal.signal(signal.SIGINT, handle_sigint)

    outcome = Counter()
    pending = 0
    t0 = time.time()
    bar = tqdm(rows, unit="종", ncols=100)
    for i, (sid, sci, aid) in enumerate(bar, 1):
        # 행을 넣을 때와 같은 평가인지 확인 — 다르면 timing 을 다른 평가에서 가져오게 되므로 건너뛴다
        if (detail_cache.get(sid) or {}).get("aid") != aid:
            outcome["aid_changed"] += 1
            cache[sid] = {"aid": aid, "result": "aid_changed", "at": now_iso()}
            pending += 1
            continue
        detail, err = api_get(f"assessment/{aid}")
        time.sleep(PER_CALL_SLEEP)
        if err == "auth_error":
            tqdm.write(f"✗ 401/403 at {sci} (assessment {aid}) — 중단")
            flush()
            return 2
        if err:
            outcome[err] += 1  # 캐시에 넣지 않음 → 재실행 시 재시도
        else:
            api_timing = {t["code"]: t["timing"] for t in parse_details(detail)["threats"]}
            db_codes = {r[0] for r in cur.execute(
                "SELECT threat_code FROM threats WHERE species_id=? AND threat_code IS NOT NULL", (sid,))}
            n = 0
            for code in db_codes & api_timing.keys():
                cur.execute("UPDATE threats SET timing=? WHERE species_id=? AND threat_code=? "
                            "AND timing IS NULL", (api_timing[code], sid, code))
                n += cur.rowcount
            res = "updated" if db_codes == set(api_timing) else "code_mismatch"
            outcome[res] += 1
            cache[sid] = {"aid": aid, "result": res, "n_rows": n,
                          "n_null_timing": sum(api_timing[c] is None for c in db_codes & api_timing.keys()),
                          "at": now_iso()}
            pending += 1
        bar.set_postfix(갱신=outcome["updated"], 불일치=outcome["code_mismatch"],
                        실패=outcome["not_found"] + outcome["network_error"])
        if pending >= COMMIT_EVERY:
            flush()
            pending = 0
        if i % SUMMARY_EVERY == 0:
            el = time.time() - t0
            rate = i / el if el > 0 else 0
            eta = (len(rows) - i) / rate if rate > 0 else 0
            tqdm.write(f"  [{i}/{len(rows)}] {dict(outcome)} | {rate:.2f}종/s | 남은시간 ~{hms(eta)}")
        if interrupted["flag"]:
            break
    flush()

    print("\n" + "=" * 60)
    print("timing 재조회 요약")
    print("=" * 60)
    for k, v in outcome.most_common():
        print(f"  {k:18s}: {v}")
    print(f"  소요 시간 : {hms(time.time() - t0)}")
    print(f"  캐시     : {TIMING_CACHE} (누적 {len(cache)}종)")
    if interrupted["flag"]:
        print("\n  ↻ 재실행하면 남은 종부터 이어서 처리됩니다.")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--timing", action="store_true", help="timing 을 API 재조회로 채운다")
    ap.add_argument("--limit", type=int, default=None, help="timing 재조회 최대 종 수")
    args = ap.parse_args()

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    seed_ids = load_seed_ids(cur)

    print("[1] 컬럼 추가")
    add_columns(cur)
    print("[2] 상위 분류 (코드에서 역산)")
    fill_hierarchy(cur, seed_ids)
    conn.commit()

    if args.timing:
        if not TOKEN:
            print("✗ IUCN_API_TOKEN 없음 (.env / .env.local 확인)")
            return 1
        print("[3] timing")
        rc = fill_timing(conn, cur, seed_ids, args.limit)
        conn.close()
        return rc
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
