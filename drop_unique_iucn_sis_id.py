#!/usr/bin/env python3
"""iucn_sis_id 의 UNIQUE 인덱스를 제거하고 일반(비UNIQUE) 인덱스로 교체.

배경: 아종/synonym 여러 종이 하나의 IUCN sis_id(종 레벨)로 매핑되는 것이
정상이므로 UNIQUE 는 틀린 불변식이었다. 성능용 일반 인덱스로 대체한다.

- idempotent: 이미 비UNIQUE면 스킵.
- 실행 후 sqlite_master 로 인덱스 상태 검증.
"""
import os
import sqlite3
import sys

DB_PATH = os.path.join(os.path.dirname(__file__), "data", "species.db")
INDEX = "idx_species_iucn_sis_id"


def log(msg):
    print(f"[drop-unique] {msg}")


def current_index_sql(cur):
    row = cur.execute(
        "SELECT sql FROM sqlite_master WHERE type='index' AND name=?", (INDEX,)
    ).fetchone()
    return row[0] if row else None


def main():
    if not os.path.exists(DB_PATH):
        log(f"✗ DB 없음: {DB_PATH}")
        return 1

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    sql = current_index_sql(cur)
    is_unique = sql is not None and "UNIQUE" in sql.upper()
    log(f"현재 인덱스: {sql!r}")

    if sql is None:
        log("인덱스 없음 → 일반 인덱스 신규 생성")
        cur.execute(f"CREATE INDEX {INDEX} ON species(iucn_sis_id)")
    elif is_unique:
        log("UNIQUE 인덱스 감지 → DROP 후 일반 인덱스 재생성")
        cur.execute(f"DROP INDEX {INDEX}")
        cur.execute(f"CREATE INDEX {INDEX} ON species(iucn_sis_id)")
    else:
        log("이미 비UNIQUE 인덱스 → 스킵 (idempotent)")

    conn.commit()

    # 검증
    final_sql = current_index_sql(cur)
    still_unique = final_sql is not None and "UNIQUE" in final_sql.upper()
    log(f"결과 인덱스: {final_sql!r}")
    if final_sql and not still_unique:
        log("✓ 검증 통과 — iucn_sis_id 는 이제 비UNIQUE 인덱스")
        rc = 0
    else:
        log("✗ 검증 실패 — 인덱스 상태 확인 필요")
        rc = 1

    conn.close()
    return rc


if __name__ == "__main__":
    sys.exit(main())
