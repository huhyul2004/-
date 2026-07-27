#!/usr/bin/env python3
"""IUCN Red List v4 → species.db 전체 동기화 (큐레이션 4,230종).

sync_iucn_test.py 파이프라인을 확장:
  - 레이트리밋 준수 (종당 0.5s, 429 지수 백오프)
  - tqdm 진행률 + 100종마다 요약
  - 중단/재개 (iucn_synced_at IS NOT NULL 스킵)
  - 배치 커밋 (50종마다)
  - 실패 사유별 로그 (append/dedupe)
  - 최종 요약

대상: is_curated=1 AND category IS NOT NULL AND iucn_synced_at IS NULL
안전: 기존 컬럼 절대 미변경, iucn_* 컬럼만 UPDATE. Ctrl+C 안전(재개 가능).

실행:
    python3 sync_iucn_all.py            # 남은 종 전체
    python3 sync_iucn_all.py --limit 50 # 앞 50종만 (부분 테스트)
"""
import argparse
import json
import os
import signal
import sqlite3
import sys
import time
from collections import Counter
from datetime import datetime, timezone

import requests
from dotenv import load_dotenv
from tqdm import tqdm

ROOT = os.path.dirname(__file__)
DB_PATH = os.path.join(ROOT, "data", "species.db")
FAIL_LOG = os.path.join(ROOT, "data", "iucn-sync-failures.json")
BASE = "https://api.iucnredlist.org/api/v4"

# 레이트리밋 파라미터
PER_CALL_SLEEP = 0.5        # 종당(호출 사이) 최소 간격 → 약 4콜/초 이하
BACKOFF_BASE = 2.0         # 429/5xx 지수 백오프 시작 (2→4→8→16s)
MAX_RETRIES = 5
COMMIT_EVERY = 50          # 배치 커밋 간격 (UPDATE 기준)
SUMMARY_EVERY = 100        # 요약 로그 간격 (처리 종 기준)

# 실패 사유 카테고리 (요약에 항상 표시)
FAIL_KINDS = ["not_found", "multiple_matches", "synonym_needed", "network_error",
              "not_in_db", "db_integrity"]

load_dotenv(os.path.join(ROOT, ".env"))
TOKEN = os.getenv("IUCN_API_TOKEN")
HEADERS = {"Authorization": f"Bearer {TOKEN}", "accept": "application/json"}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def hms(seconds: float) -> str:
    seconds = int(seconds)
    return f"{seconds // 3600:02d}:{(seconds % 3600) // 60:02d}:{seconds % 60:02d}"


def api_get(path: str, params: dict | None = None):
    """(json|None, error_kind|None). 429/5xx 지수 백오프, 네트워크 오류는 network_error."""
    url = f"{BASE}/{path}"
    for attempt in range(MAX_RETRIES):
        try:
            r = requests.get(url, headers=HEADERS, params=params, timeout=30)
        except requests.RequestException:
            if attempt == MAX_RETRIES - 1:
                return None, "network_error"
            time.sleep(BACKOFF_BASE * (2 ** attempt))
            continue
        if r.status_code == 429 or r.status_code >= 500:
            # 지수 백오프: 2 → 4 → 8 → 16 → 32
            if attempt == MAX_RETRIES - 1:
                return None, "network_error"
            time.sleep(BACKOFF_BASE * (2 ** attempt))
            continue
        if r.status_code == 404:
            return None, "not_found"
        if not r.ok:
            return None, "network_error"
        return r.json(), None
    return None, "network_error"


def split_name(sci: str):
    parts = sci.split()
    if len(parts) < 2:
        return None, None, None
    infra = parts[2] if len(parts) >= 3 else None
    return parts[0], parts[1], infra


def pick_latest(assessments: list):
    if not assessments:
        return None
    return next((a for a in assessments if a.get("latest")), assessments[0])


def fetch_species(sci: str):
    """returns (record|None, fail_reason|None, note|None)."""
    genus, species, infra = split_name(sci)
    if not genus:
        return None, "not_found", None

    data, err = api_get("taxa/scientific_name",
                        {"genus_name": genus, "species_name": species})
    if err == "network_error":
        return None, "network_error", None
    if err == "not_found" or not data:
        return None, "not_found", None

    taxon = data.get("taxon") or {}
    assessments = data.get("assessments") or []
    if not assessments:
        return None, "not_found", None

    note = "subspecies_matched_at_species_level" if infra else None
    latest = pick_latest(assessments)
    if not latest:
        return None, "not_found", None
    aid = latest.get("assessment_id")

    # 상세 평가 (population_trend 등)
    detail, err2 = api_get(f"assessment/{aid}")
    if err2 == "network_error":
        return None, "network_error", None
    # 상세가 404여도 taxa 응답의 요약값으로 진행 (detail=None 허용)

    category = latest.get("red_list_category_code")
    criteria = latest.get("criteria")
    url = latest.get("url")
    possibly_extinct = latest.get("possibly_extinct")
    pop_trend = None
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
    }
    return rec, None, note


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
WHERE id=:id
"""


def load_existing_failures() -> dict:
    """기존 실패 로그를 {scientific_name: {...}} 로 로드 (append/dedupe 용)."""
    if not os.path.exists(FAIL_LOG):
        return {}
    try:
        with open(FAIL_LOG, encoding="utf-8") as f:
            data = json.load(f)
        out = {}
        for it in data.get("failures", []):
            if it.get("scientific_name"):
                out[it["scientific_name"]] = it
        return out
    except Exception:
        return {}


def write_failures(failures: dict) -> None:
    with open(FAIL_LOG, "w", encoding="utf-8") as f:
        json.dump(
            {"updated": now_iso(),
             "count": len(failures),
             "failures": list(failures.values())},
            f, ensure_ascii=False, indent=2,
        )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None, help="처리할 최대 종 수 (부분 실행)")
    args = ap.parse_args()

    if not TOKEN:
        print("✗ IUCN_API_TOKEN 없음 (.env 확인)")
        return 1

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # 재개: 아직 동기화 안 된 큐레이션 종만
    cur.execute(
        """SELECT id, scientific_name FROM species
           WHERE is_curated=1 AND category IS NOT NULL AND iucn_synced_at IS NULL
           ORDER BY scientific_name"""
    )
    rows = cur.fetchall()
    if args.limit:
        rows = rows[: args.limit]

    # 전체/남은 현황
    total_curated = cur.execute(
        "SELECT COUNT(*) FROM species WHERE is_curated=1 AND category IS NOT NULL"
    ).fetchone()[0]
    already = total_curated - cur.execute(
        """SELECT COUNT(*) FROM species
           WHERE is_curated=1 AND category IS NOT NULL AND iucn_synced_at IS NULL"""
    ).fetchone()[0]
    print(f"큐레이션 대상 {total_curated}종 · 이미 완료 {already}종 · 이번 처리 {len(rows)}종")
    if not rows:
        print("처리할 종이 없습니다 (모두 동기화 완료).")
        return 0

    failures = load_existing_failures()
    fail_counter = Counter()
    ok = 0
    subspecies_notes = 0
    pending_commit = 0
    t0 = time.time()

    # Ctrl+C 안전 종료 플래그
    interrupted = {"flag": False}

    def handle_sigint(signum, frame):
        interrupted["flag"] = True
        print("\n⚠ 중단 요청 감지 — 현재 배치 커밋 후 안전 종료합니다…")

    signal.signal(signal.SIGINT, handle_sigint)

    bar = tqdm(rows, unit="종", ncols=90)
    for i, (sid, sci) in enumerate(bar, 1):
        rec, reason, note = fetch_species(sci)
        time.sleep(PER_CALL_SLEEP)

        if reason:
            fail_counter[reason] += 1
            failures[sci] = {"scientific_name": sci, "reason": reason, "at": now_iso()}
        else:
            # DB 무결성 오류(예: sis_id 충돌) 등 어떤 예외도 프로세스를 죽이지 않고
            # 실패로 기록 후 다음 종으로 진행 — sync 지속성 보장
            try:
                cur.execute(UPDATE_SQL, {**rec, "id": sid})
            except sqlite3.IntegrityError as e:
                fail_counter["db_integrity"] += 1
                failures[sci] = {"scientific_name": sci, "reason": "db_integrity",
                                 "detail": str(e),
                                 "iucn_sis_id": rec.get("iucn_sis_id"), "at": now_iso()}
                bar.set_postfix(성공=ok, 실패=sum(fail_counter.values()))
                if pending_commit >= COMMIT_EVERY:
                    conn.commit(); write_failures(failures); pending_commit = 0
                if interrupted["flag"]:
                    break
                continue
            if cur.rowcount == 0:
                fail_counter["not_in_db"] += 1
                failures[sci] = {"scientific_name": sci, "reason": "not_in_db", "at": now_iso()}
            else:
                ok += 1
                pending_commit += 1
                if note:
                    subspecies_notes += 1
                # 성공했다가 이전 실패기록이 있으면 제거
                failures.pop(sci, None)

        bar.set_postfix(성공=ok, 실패=sum(fail_counter.values()))

        # 배치 커밋
        if pending_commit >= COMMIT_EVERY:
            conn.commit()
            write_failures(failures)
            pending_commit = 0

        # 요약 로그
        if i % SUMMARY_EVERY == 0:
            el = time.time() - t0
            rate = i / el if el > 0 else 0
            eta = (len(rows) - i) / rate if rate > 0 else 0
            tqdm.write(
                f"  [{i}/{len(rows)}] 성공={ok} 실패={sum(fail_counter.values())} "
                f"| {rate:.1f}종/s | 남은시간 ~{hms(eta)}"
            )

        if interrupted["flag"]:
            break

    # 마지막 커밋
    conn.commit()
    write_failures(failures)
    conn.close()

    # 최종 요약
    elapsed = time.time() - t0
    processed = i
    print("\n" + "=" * 60)
    print("IUCN 동기화 요약")
    print("=" * 60)
    print(f"  총 처리   : {processed}종" + ("  (중단됨)" if interrupted["flag"] else ""))
    print(f"  성공      : {ok}종" + (f"  (아종→종 매칭 {subspecies_notes}건 포함)" if subspecies_notes else ""))
    print(f"  실패      : {sum(fail_counter.values())}종")
    for kind in FAIL_KINDS:
        print(f"     - {kind:16s}: {fail_counter.get(kind, 0)}")
    print(f"  소요 시간 : {hms(elapsed)}")
    print(f"  실패 로그 : {FAIL_LOG} (누적 {len(failures)}종)")
    if interrupted["flag"]:
        print("\n  ↻ 재실행하면 남은 종부터 이어서 처리됩니다.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
