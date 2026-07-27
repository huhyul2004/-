#!/usr/bin/env python3
"""species.db 에 IUCN Red List v4 데이터용 iucn_* 컬럼 9개를 추가한다.

- 기존 컬럼(category, population_trend 등)은 절대 건드리지 않는다.
- idempotent: 이미 있는 컬럼/인덱스는 스킵.
- iucn_sis_id 에 UNIQUE 인덱스 생성.

실행:
    python3 migrate_iucn_columns.py
"""
import os
import sqlite3
import sys

DB_PATH = os.path.join(os.path.dirname(__file__), "data", "species.db")

# (컬럼명, 타입) — 기존 컬럼과 절대 겹치지 않는 iucn_ 접두 신규 9개
NEW_COLUMNS = [
    ("iucn_sis_id", "INTEGER"),           # 안정적 고유 종 ID
    ("iucn_category", "TEXT"),            # 공식 최신 등급 코드 (CR/EN/...)
    ("iucn_criteria", "TEXT"),           # 평가 기준코드 (예: "D", "A2cd")
    ("iucn_assessment_id", "INTEGER"),   # 평가 ID (URL/상세조회용)
    ("iucn_assessment_year", "INTEGER"), # 최신 평가 발행연도
    ("iucn_population_trend", "TEXT"),   # 표준 영문 추세 (Increasing/Stable/Decreasing/Unknown)
    ("iucn_possibly_extinct", "INTEGER"),# 0/1
    ("iucn_url", "TEXT"),                # 공식 Red List 페이지 URL
    ("iucn_synced_at", "TEXT"),          # 마지막 동기화 시각(ISO)
]

# iucn_sis_id UNIQUE 인덱스 (NULL 은 UNIQUE 에서 중복 허용되므로 미동기화 행은 무관)
INDEX_NAME = "idx_species_iucn_sis_id"


def log(msg: str) -> None:
    print(f"[migrate] {msg}")


def main() -> int:
    if not os.path.exists(DB_PATH):
        log(f"✗ DB 없음: {DB_PATH}")
        return 1

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # 현재 컬럼 목록
    cur.execute("PRAGMA table_info(species)")
    existing = {row[1] for row in cur.fetchall()}
    log(f"기존 컬럼 {len(existing)}개 확인")

    added, skipped = 0, 0
    for name, coltype in NEW_COLUMNS:
        if name in existing:
            log(f"  · {name} 이미 존재 → 스킵")
            skipped += 1
            continue
        cur.execute(f"ALTER TABLE species ADD COLUMN {name} {coltype}")
        log(f"  + {name} {coltype} 추가")
        added += 1

    # UNIQUE 인덱스 (idempotent)
    cur.execute(
        "SELECT name FROM sqlite_master WHERE type='index' AND name=?",
        (INDEX_NAME,),
    )
    if cur.fetchone():
        log(f"  · 인덱스 {INDEX_NAME} 이미 존재 → 스킵")
    else:
        cur.execute(
            f"CREATE UNIQUE INDEX {INDEX_NAME} ON species(iucn_sis_id)"
        )
        log(f"  + UNIQUE 인덱스 {INDEX_NAME} 생성")

    conn.commit()

    # 검증 출력
    cur.execute("PRAGMA table_info(species)")
    final_cols = [r[1] for r in cur.fetchall()]
    iucn_cols = [c for c in final_cols if c.startswith("iucn_")]
    log(f"완료 — 추가 {added} · 스킵 {skipped}")
    log(f"현재 iucn_* 컬럼 {len(iucn_cols)}개: {', '.join(iucn_cols)}")

    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
