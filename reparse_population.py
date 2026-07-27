#!/usr/bin/env python3
"""IUCN population_size 재파싱 — 범위형 대응 후 raw값 재파싱해 DB 갱신.

parse_pop 형식 처리:
  "18"            → 18            (simple)
  "2608-3905,3140"→ 3140          (range_best: 콤마 뒤 최적추정)
  "500-1000"      → 750           (range_mid: best 없으면 중간값)
  "Unknown"/""/{} → None          (empty)
  그 외 예외형식   → None + 로그    (unparseable)

usage:
  python3 reparse_population.py --test    # 유닛 테스트만
  python3 reparse_population.py            # 결과 JSON raw 재파싱 → DB UPDATE
"""
import json, os, re, sqlite3, sys

ROOT = os.path.dirname(__file__)
DB = os.path.join(ROOT, "data", "species.db")
RESULTS = os.path.join(ROOT, "data", "iucn-population-fetch.json")


def parse_pop(raw):
    """returns (value:int|None, mode:str). mode: simple|range_best|range_mid|empty|unparseable"""
    if raw is None:
        return None, "empty"
    s = str(raw).strip()
    if s == "" or not re.search(r"\d", s) or s.lower() in ("unknown", "na", "n/a", "none"):
        return None, "empty"
    parts = [p.strip() for p in s.split(",") if p.strip()]
    if not parts:
        return None, "empty"
    last = parts[-1]
    # range_best: 앞부분이 범위(-포함) + 마지막이 순수 정수 → 최적추정치 사용
    if len(parts) >= 2 and re.fullmatch(r"\d+", last) and "-" in "".join(parts[:-1]):
        return int(last), "range_best"
    # simple: 단일 순수 정수 (IUCN population_size 는 천단위 콤마 미사용)
    if len(parts) == 1 and re.fullmatch(r"\d+", last):
        return int(last), "simple"
    # range_mid: "L-U" (best 없음) → 중간값
    m = re.fullmatch(r"(\d+)\s*-\s*(\d+)", last)
    if m:
        return (int(m.group(1)) + int(m.group(2))) // 2, "range_mid"
    return None, "unparseable"


def run_tests():
    cases = [
        ("18", 18, "simple"),
        ("2608-3905,3140", 3140, "range_best"),
        ("500-1000", 750, "range_mid"),
        ("Unknown", None, "empty"),
        ("", None, "empty"),
        ({}, None, "empty"),          # 빈 딕셔너리
        (None, None, "empty"),
    ]
    ok = True
    for raw, exp_v, exp_m in cases:
        v, m = parse_pop(raw)
        status = "✓" if (v == exp_v and m == exp_m) else "✗"
        if status == "✗":
            ok = False
        print(f"  {status} parse_pop({raw!r}) = ({v}, {m})  기대=({exp_v}, {exp_m})")
    print("\n" + ("전체 통과 ✓" if ok else "실패 있음 ✗"))
    return ok


def reparse():
    if not os.path.exists(RESULTS):
        print(f"✗ 결과 JSON 없음: {RESULTS} (fetch 완료 후 실행)")
        return 1
    results = json.load(open(RESULTS))
    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    # assessment_id → species id 매핑
    id_by_aid = {}
    for sid, aid in cur.execute(
        "SELECT id, iucn_assessment_id FROM species WHERE is_curated=1 AND iucn_assessment_id IS NOT NULL"
    ).fetchall():
        id_by_aid.setdefault(str(aid), []).append(sid)

    from collections import Counter
    modes = Counter()
    updated = 0
    unparseable = []
    for aid, rec in results.items():
        raw = rec.get("raw")
        v, mode = parse_pop(raw)
        modes[mode] += 1
        if mode == "unparseable":
            unparseable.append(raw)
        if v is not None:
            for sid in id_by_aid.get(aid, []):
                cur.execute("UPDATE species SET iucn_population_size=? WHERE id=?", (v, sid))
                updated += 1
    conn.commit()
    conn.close()

    print("=== 재파싱 결과 ===")
    print(f"  결과 JSON 항목: {len(results)}")
    print(f"  DB UPDATE(값 저장): {updated}")
    print("  형식별 분포:")
    for m, n in modes.most_common():
        print(f"     {m}: {n}")
    if unparseable:
        print(f"  ⚠ 예외형식(로그) {len(unparseable)}건:", unparseable[:10])
    return 0


if __name__ == "__main__":
    if "--test" in sys.argv:
        sys.exit(0 if run_tests() else 1)
    sys.exit(reparse())
