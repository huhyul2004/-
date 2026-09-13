#!/usr/bin/env python3
"""면접 답변용 종별 사례표 — 실제 DB·CSV 에서만 값을 뽑는다. 읽기 전용.

원칙: 데이터에 없으면 빈칸. 추측·생성 금지.
실행: python3 research/interview_species_table.py
"""
import sqlite3, csv, statistics, os

DB = "data/species.db"
CSV = "research/data/dataset_iucn_score_vs_mass_v2.csv"

con = sqlite3.connect(f"file:{DB}?immutable=1", uri=True)
con.row_factory = sqlite3.Row

def q(sql, args=()):
    return con.execute(sql, args).fetchall()

BLANK = "(빈칸)"
def g(v):
    return BLANK if v is None else v

def kg(m):
    return "" if m is None else f"{m/1000:,.2f}"

print("=" * 78)
print("STEP 0. 표본(n=204) 정의 확인")
print("=" * 78)
with open(CSV, encoding="utf-8") as f:
    sample = list(csv.DictReader(f))
print(f"CSV: {CSV}")
print(f"행 수: {len(sample)}")
names = [r["scientific_name"] for r in sample]
print(f"학명 중복: {len(names) - len(set(names))}")
from collections import Counter
print("class_name 분포:", dict(Counter(r["class_name"] for r in sample)))
print("mass_source 분포:", dict(Counter(r["mass_source"] for r in sample)))
print("iucn_category 분포:", dict(Counter(r["iucn_category"] for r in sample)))

# 표본 학명 → DB 조인
ph = ",".join("?" * len(names))
rows = q(f"""
  SELECT s.id, s.scientific_name, s.common_name_ko, s.common_name_en,
         s.mass_g, s.mass_g_external, s.mass_g_external_source,
         s.iucn_category, s.category, s.iucn_class, s.class_name,
         s.mature_individuals, s.iucn_population_size, s.iucn_population_trend,
         t.consensus_score, t.intervention_tier
  FROM species s LEFT JOIN tipping_points t ON t.species_id = s.id
  WHERE s.scientific_name IN ({ph})
""", names)
by_sci = {r["scientific_name"]: r for r in rows}
print(f"DB 조인 성공: {len(by_sci)} / {len(set(names))}")
missing = sorted(set(names) - set(by_sci))
if missing:
    print(f"DB 에서 못 찾은 학명 {len(missing)}종:", missing[:5])

print()
print("=" * 78)
print("STEP 1. 심슨의 역설 대표 4종 (표본 204종 안에서)")
print("=" * 78)

def eff_mass(r):
    return r["mass_g"] if r["mass_g"] else r["mass_g_external"]

def pop(r):
    return r["mature_individuals"] or r["iucn_population_size"]

samp_rows = [by_sci[n] for n in names if n in by_sci]

birds = [r for r in samp_rows
         if (r["iucn_class"] or "").upper() == "AVES"
         and (r["iucn_category"] or "") in ("CR", "EN", "VU")
         and eff_mass(r)]
birds.sort(key=lambda r: eff_mass(r))
print(f"\n[A] 작으면서 위기등급인 조류 — 조건 충족 {len(birds)}종, 체중 오름차순 상위 2")
for r in birds[:2]:
    print(f"  {g(r['common_name_ko'])} / {r['scientific_name']}")
    print(f"    체중 {eff_mass(r):,.1f} g = {kg(eff_mass(r))} kg   IUCN {r['iucn_category']}"
          f"   개체수 {g(pop(r))}   v5 {g(r['consensus_score'])} ({g(r['intervention_tier'])})")
    print(f"    mass 출처: mass_g={g(r['mass_g'])} / external={g(r['mass_g_external'])} ({g(r['mass_g_external_source'])})")

mams = [r for r in samp_rows
        if (r["iucn_class"] or "").upper() == "MAMMALIA"
        and (r["iucn_category"] or "") in ("LC", "NT")
        and eff_mass(r)]
mams.sort(key=lambda r: -eff_mass(r))
print(f"\n[B] 크면서 안전등급(LC/NT)인 포유류 — 조건 충족 {len(mams)}종, 체중 내림차순 상위 2")
for r in mams[:2]:
    print(f"  {g(r['common_name_ko'])} / {r['scientific_name']}")
    print(f"    체중 {eff_mass(r):,.1f} g = {kg(eff_mass(r))} kg   IUCN {r['iucn_category']}"
          f"   개체수 {g(pop(r))}   v5 {g(r['consensus_score'])} ({g(r['intervention_tier'])})")
    print(f"    mass 출처: mass_g={g(r['mass_g'])} / external={g(r['mass_g_external'])} ({g(r['mass_g_external_source'])})")

print()
print("=" * 78)
print("STEP 2. 검증 3종")
print("=" * 78)
for sci in ["Phocoena sinus", "Rhinoceros sondaicus", "Panthera tigris altaica"]:
    r = q("""SELECT s.*, t.consensus_score, t.intervention_tier
             FROM species s LEFT JOIN tipping_points t ON t.species_id=s.id
             WHERE s.scientific_name = ?""", (sci,))
    if not r:
        print(f"\n{sci}: DB 에 없음")
        continue
    r = r[0]
    mi, ips = r["mature_individuals"], r["iucn_population_size"]
    print(f"\n{g(r['common_name_ko'])} / {sci}")
    print(f"  체중 mass_g={g(r['mass_g'])}  external={g(r['mass_g_external'])} ({g(r['mass_g_external_source'])})")
    print(f"  mature_individuals={g(mi)}   iucn_population_size={g(ips)}"
          + ("   ← 두 값이 다름" if (mi is not None and ips is not None and mi != ips) else ""))
    print(f"  IUCN 등급 {g(r['iucn_category'])} (category 컬럼 {g(r['category'])})"
          f"   평가연도 {g(r['iucn_assessment_year'])}")
    print(f"  v5 현재 점수 {g(r['consensus_score'])} ({g(r['intervention_tier'])})")
    print(f"  표본 204종 포함 여부: {'포함' if sci in by_sci and sci in names else '미포함'}")

print()
print("=" * 78)
print("STEP 3. 204종 표본 유래")
print("=" * 78)
n107 = q("""SELECT COUNT(*) c FROM species
            WHERE mass_g > 0
              AND (mature_individuals > 0 OR iucn_population_size > 0)
              AND iucn_category NOT IN ('EX','EW','NA','DD')""")[0]["c"]
print(f"\n[제시하신 SQL 그대로] mass_g>0 AND 개체수>0 AND 등급 유효 : {n107}종")

n107b = q("""SELECT COUNT(*) c FROM species
             WHERE is_curated=1 AND mass_g > 0
               AND (mature_individuals > 0 OR iucn_population_size > 0)
               AND iucn_category NOT IN ('EX','EW','NA','DD')""")[0]["c"]
print(f"[+ is_curated=1]                                        : {n107b}종")

n107c = q("""SELECT COUNT(*) c FROM species
             WHERE is_curated=1 AND mass_g > 0
               AND (mature_individuals > 0 OR iucn_population_size > 0)
               AND iucn_category NOT IN ('EX','EW','NA','DD')
               AND iucn_population_trend IS NOT NULL""")[0]["c"]
print(f"[+ iucn_population_trend 有] (문서 기재 조건)            : {n107c}종")

print("\n왜 107종뿐이었나 — mass_g 결측 현황")
tot = q("SELECT COUNT(*) c FROM species")[0]["c"]
cur = q("SELECT COUNT(*) c FROM species WHERE is_curated=1")[0]["c"]
mg = q("SELECT COUNT(*) c FROM species WHERE mass_g>0")[0]["c"]
mge = q("SELECT COUNT(*) c FROM species WHERE mass_g_external>0")[0]["c"]
print(f"  전체 종 {tot:,} / 큐레이티드 {cur:,}")
print(f"  mass_g 보유 {mg:,}  ({mg/tot*100:.2f}%)")
print(f"  mass_g_external 보유 {mge:,}")
print("  mass_g 보유 종의 분류군:",
      dict(Counter(r["class_name"] for r in q("SELECT class_name FROM species WHERE mass_g>0"))))

print("\n  IUCN 이 체중을 주는가 — species 테이블의 IUCN 동기화 컬럼 목록:")
cols = [c[1] for c in con.execute("PRAGMA table_info(species)")]
print("   ", [c for c in cols if c.startswith("iucn_")])
print("    → 체중 관련 iucn_* 컬럼:",
      [c for c in cols if c.startswith("iucn_") and ("mass" in c or "weight" in c)] or "없음")

print("\n  개체수 결측 현황")
p1 = q("SELECT COUNT(*) c FROM species WHERE mature_individuals>0")[0]["c"]
p2 = q("SELECT COUNT(*) c FROM species WHERE iucn_population_size>0")[0]["c"]
p3 = q("SELECT COUNT(*) c FROM species WHERE mature_individuals>0 OR iucn_population_size>0")[0]["c"]
print(f"    mature_individuals>0 {p1:,} / iucn_population_size>0 {p2:,} / 둘 중 하나 {p3:,}")

print("\n204 로 늘리기 위해 추가한 소스 (CSV mass_source 실측)")
for k, v in Counter(r["mass_source"] for r in sample).most_common():
    print(f"    {k:<26} {v}")
print("  DB mass_g_external_source 실측:",
      dict(Counter(r["mass_g_external_source"]
           for r in q("SELECT mass_g_external_source FROM species WHERE mass_g_external>0"))))

print()
print("=" * 78)
print("STEP 4. 등급별 체중 중앙값")
print("=" * 78)
print("\n[4-A] 표본 204종 기준 (mass_effective)")
per = {}
for r in sample:
    per.setdefault(r["iucn_category"], []).append(float(r["mass_effective"]))
for c in ["LC", "NT", "VU", "EN", "CR", "EW", "EX"]:
    if c in per:
        v = sorted(per[c])
        print(f"  {c:<3} n={len(v):<4} 중앙값 {statistics.median(v)/1000:>12,.3f} kg"
              f"   (최소 {min(v)/1000:,.3f} / 최대 {max(v)/1000:,.1f})")
    else:
        print(f"  {c:<3} n=0    {BLANK} — 표본에 해당 등급 없음")

print("\n[4-B] DB 전체 기준 (mass_g 또는 mass_g_external 보유 종 전부)")
for c in ["LC", "NT", "VU", "EN", "CR", "EW", "EX"]:
    v = [r["m"] for r in q("""
        SELECT COALESCE(mass_g, mass_g_external) AS m FROM species
        WHERE iucn_category = ? AND COALESCE(mass_g, mass_g_external) > 0""", (c,))]
    if v:
        v.sort()
        print(f"  {c:<3} n={len(v):<4} 중앙값 {statistics.median(v)/1000:>12,.3f} kg"
              f"   (최소 {min(v)/1000:,.4f} / 최대 {max(v)/1000:,.1f})")
    else:
        print(f"  {c:<3} n=0    {BLANK}")

print("\n[4-C] category 컬럼(사이트 표시 등급) 기준 — EX/EW 포함")
for c in ["LC", "NT", "VU", "EN", "CR", "EW", "EX"]:
    v = [r["m"] for r in q("""
        SELECT COALESCE(mass_g, mass_g_external) AS m FROM species
        WHERE category = ? AND COALESCE(mass_g, mass_g_external) > 0""", (c,))]
    if v:
        v.sort()
        print(f"  {c:<3} n={len(v):<4} 중앙값 {statistics.median(v)/1000:>12,.3f} kg")
    else:
        print(f"  {c:<3} n=0    {BLANK}")

print()
print("=" * 78)
print("STEP 5. 두 결과가 반대인 이유 — 표본 대조")
print("=" * 78)
rli = {"LC": 0, "NT": 1, "VU": 2, "EN": 3, "CR": 4}
import math
xs = [math.log10(float(r["mass_effective"])) for r in sample if r["iucn_category"] in rli]
ys = [rli[r["iucn_category"]] for r in sample if r["iucn_category"] in rli]
n = len(xs)
mx, my = sum(xs)/n, sum(ys)/n
cov = sum((a-mx)*(b-my) for a, b in zip(xs, ys))
sx = math.sqrt(sum((a-mx)**2 for a in xs)); sy = math.sqrt(sum((b-my)**2 for b in ys))
print(f"\n표본 204종 log10(체중) vs RLI 가중치  Pearson r = {cov/(sx*sy):+.4f}  (n={n})")

# 원시 체중으로도
xs2 = [float(r["mass_effective"]) for r in sample if r["iucn_category"] in rli]
mx2 = sum(xs2)/n
cov2 = sum((a-mx2)*(b-my) for a, b in zip(xs2, ys))
sx2 = math.sqrt(sum((a-mx2)**2 for a in xs2))
print(f"표본 204종 원시 체중(g) vs RLI 가중치  Pearson r = {cov2/(sx2*sy):+.4f}")

print("\n분류군 안에서만 (심슨 역설 확인)")
for cls in ["포유류", "조류"]:
    sub = [r for r in sample if r["class_name"] == cls and r["iucn_category"] in rli]
    if len(sub) < 3: continue
    a = [math.log10(float(r["mass_effective"])) for r in sub]
    b = [rli[r["iucn_category"]] for r in sub]
    k = len(a); ma, mb = sum(a)/k, sum(b)/k
    cv = sum((p-ma)*(qq-mb) for p, qq in zip(a, b))
    sa = math.sqrt(sum((p-ma)**2 for p in a)); sb = math.sqrt(sum((qq-mb)**2 for qq in b))
    print(f"  {cls:<4} n={k:<4} r = {cv/(sa*sb):+.4f}"
          + ("" if sb else "  (등급 분산 0)"))
    print(f"        등급 분포: {dict(Counter(r['iucn_category'] for r in sub))}")
    print(f"        체중 중앙값 {statistics.median([float(r['mass_effective']) for r in sub])/1000:,.3f} kg")

print("\n등급별 중앙값 계산의 표본 vs 204종 표본 — 같은 표본인가")
a = set(names)
b = set(r["scientific_name"] for r in q(
    "SELECT scientific_name FROM species WHERE COALESCE(mass_g, mass_g_external) > 0"))
print(f"  204종 표본                       : {len(a):,}")
print(f"  체중 보유 전체 (4-B 의 모집단)     : {len(b):,}")
print(f"  교집합                            : {len(a & b):,}")
print(f"  4-B 에만 있고 204 에 없는 종      : {len(b - a):,}")
con.close()
