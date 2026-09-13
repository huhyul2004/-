#!/usr/bin/env python3
"""같은 등급·분류군 비교 그룹의 크기를 조사한다. 읽기 전용.

그룹 키 = (species.category, species.iucn_class)
  - 등급은 챗봇 프롬프트가 "IUCN 등급"으로 표시하는 category 를 쓴다.
  - 분류군은 iucn_class 를 쓴다. class_name 은 점수 산출 310종 중 109종이 비어 있고
    조류 22종이 '파충류'로 잘못 붙어 있어 비교 기준으로 쓸 수 없다.
대상 = tipping_points 에 점수가 있고 category 가 EX/EW 가 아닌 종.
  EX/EW 는 점수가 100 으로 고정이라(계산값이 아님) 비교에서 뺀다.

실행: python3 research/analyze_peer_groups.py
"""
import sqlite3, statistics
from collections import defaultdict

MIN_GROUP = 3  # lib/peer-comparison.ts 의 MIN_GROUP_SIZE 와 같아야 한다

con = sqlite3.connect("file:data/species.db?immutable=1", uri=True)
con.row_factory = sqlite3.Row
rows = con.execute("""
  SELECT s.id, s.common_name_ko, s.scientific_name, s.category, s.iucn_class,
         t.consensus_score AS score
  FROM tipping_points t JOIN species s ON s.id = t.species_id
""").fetchall()

ext = [r for r in rows if r["category"] in ("EX", "EW")]
live = [r for r in rows if r["category"] not in ("EX", "EW")]
no_cls = [r for r in live if not (r["iucn_class"] or "").strip()]
print(f"tipping_points 전체        {len(rows)}")
print(f"  EX/EW (100 고정, 제외)   {len(ext)}  점수 종류 {sorted(set(r['score'] for r in ext))}")
print(f"  계산된 점수 (비교 대상)  {len(live)}")
print(f"    iucn_class 없음 (제외) {len(no_cls)}")

groups = defaultdict(list)
for r in live:
    c = (r["iucn_class"] or "").strip()
    if c:
        groups[(r["category"], c)].append(r)

sizes = sorted(((k, len(v)) for k, v in groups.items()), key=lambda x: -x[1])
print(f"\n그룹 수 {len(groups)}  (그룹에 든 종 {sum(n for _, n in sizes)})")
print(f"\n{'등급':<4}{'iucn_class':<20}{'종 수':>5}  {'점수 최소':>8}{'중앙':>8}{'최대':>8}")
for (cat, cls), n in sizes:
    sc = [r["score"] for r in groups[(cat, cls)]]
    print(f"{cat:<4}{cls:<20}{n:>5}  {min(sc):>8.1f}{statistics.median(sc):>8.1f}{max(sc):>8.1f}")

small = [(k, n) for k, n in sizes if n < MIN_GROUP]
print(f"\n그룹 크기 < {MIN_GROUP} (블록 미포함): {len(small)}개 그룹, {sum(n for _, n in small)}종")
for (cat, cls), n in small:
    names = ", ".join(f"{r['common_name_ko'] or r['scientific_name']}" for r in groups[(cat, cls)])
    print(f"  {cat} {cls:<18} {n}종  {names}")
strict = [(k, n) for k, n in sizes if n - 1 < MIN_GROUP]
print(f"\n(참고) 자기 자신을 뺀 비교 상대 < {MIN_GROUP} 로 셀 경우: {len(strict)}개 그룹, {sum(n for _, n in strict)}종")

blocked = sum(n for _, n in small) + len(no_cls)
print(f"\n블록이 붙는 종 {len(live) - blocked} / 계산된 점수 {len(live)}"
      f"  (그룹 작음 {sum(n for _, n in small)} + iucn_class 없음 {len(no_cls)} 제외)")

g = groups[("CR", "MAMMALIA")]
sc = sorted((r["score"] for r in g), reverse=True)
print(f"\n자바코뿔소 그룹 CR MAMMALIA: {len(g)}종")
print(f"  점수 최소 {min(sc)} / 중앙 {statistics.median(sc)} / 최대 {max(sc)}")
from collections import Counter
print("  동점 분포 (2종 이상):", {k: v for k, v in Counter(sc).most_common() if v > 1})
print("  티어별:", dict(Counter(
    con.execute("SELECT intervention_tier FROM tipping_points WHERE species_id=?", (r["id"],)).fetchone()[0]
    for r in g)))
