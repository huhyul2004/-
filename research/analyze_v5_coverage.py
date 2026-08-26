#!/usr/bin/env python3
"""v5 커버리지 사전조사 — 개체수 없는 종에 IUCN 이 주는 다른 필드가 얼마나 남아있는지 센다.

읽기 전용(sqlite mode=ro). lib/tipping-point.ts 는 건드리지 않는다.

v5 의 N0 조건(inferPopulationWithSource): mature_individuals>0 또는
iucn_population_size>0. 둘 다 없으면 점수 산출 안 함(EX/EW 는 예외로 100점).

코호트를 셋으로 나눠 본다. 뒤로 갈수록 좁고, 뒤로 갈수록 실제로 손댈 가치가 있다.
  L1 전체 결손      — 개체수 없고 EX/EW 아닌 모든 종
  L2 IUCN 동기화분  — 그중 IUCN 에서 실제로 데이터를 받아온 종
  L3 위협등급분     — 그중 CR/EN/VU (LC 를 빼면 남는 진짜 대상)
"""
import re
import sqlite3
from collections import Counter

DB = "data/species.db"
con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)

HAS_POP = ("((mature_individuals IS NOT NULL AND mature_individuals > 0) OR "
           "(iucn_population_size IS NOT NULL AND iucn_population_size > 0))")
NOT_EXT = "category NOT IN ('EX','EW')"
# criteria / 세대시간 / 체중은 IUCN 동기화 종에만 붙어 있다.
# 나머지는 Wikidata 에서 긁어온 껍데기라 등급 말고 거의 아무것도 없다.
SYNCED = "iucn_synced_at IS NOT NULL"

COHORTS = [
    ("L1 전체 결손",     f"NOT {HAS_POP} AND {NOT_EXT}"),
    ("L2 IUCN 동기화분", f"NOT {HAS_POP} AND {NOT_EXT} AND {SYNCED}"),
    ("L3 위협등급분",    f"NOT {HAS_POP} AND {SYNCED} AND category IN ('CR','EN','VU')"),
]

FIELDS = [
    ("iucn_criteria",          "평가 근거 문자열 (A2acd 등)"),
    ("iucn_population_trend",  "IUCN 개체수 추세"),
    ("iucn_generation_length", "세대시간 (년)"),
    ("mass_g",                 "체중"),
    ("mass_g_external",        "체중 (외부 출처)"),
    ("iucn_assessment_year",   "평가 연도"),
    ("life_habit",             "생활형"),
    ("summary_ko",             "한글 요약"),
]

# ---------- criteria 파서 ----------
# 대문자 A~E 가 Criterion, 뒤 숫자가 하위번호. '+' 로 이어진 조각은 앞 글자를 상속한다.
#   "B1ab(iii,v)+2ab(iii,v)" → B1, B2      "A2acd+3cd+4acd" → A2, A3, A4
# 괄호 안 소문자 로마숫자는 구조 판정에 필요 없어서 먼저 지운다.
PAREN = re.compile(r"\([^)]*\)")

def parse_criteria(s: str) -> dict:
    out: dict = {}
    if not s:
        return out
    s = PAREN.sub("", s)
    for seg in re.split(r"[;,]", s):
        cur = None
        for tok in seg.split("+"):
            tok = tok.strip()
            if not tok:
                continue
            m = re.match(r"^([A-E])\s*(\d*)", tok)
            if m:
                cur, num = m.group(1), m.group(2)
            elif cur:
                num = (re.match(r"^(\d*)", tok) or [None, ""])[1]
            else:
                continue
            out.setdefault(cur, set()).add(num or "")
    return out

# IUCN Red List 3.1 정량 임계
C_BOUND = {"CR": 250, "EN": 2500, "VU": 10000}   # C: 성숙개체수 상한
D_BOUND = {"CR": 50, "EN": 250, "VU": 1000}      # D: 성숙개체수 상한 (VU 는 D1 한정)
A_RATE = {("CR", "1"): 90, ("CR", "2"): 80, ("CR", "3"): 80, ("CR", "4"): 80,
          ("EN", "1"): 70, ("EN", "2"): 50, ("EN", "3"): 50, ("EN", "4"): 50,
          ("VU", "1"): 50, ("VU", "2"): 30, ("VU", "3"): 30, ("VU", "4"): 30}

def bounds_for(cat, parsed):
    """(성숙개체수 상한, 감소율 하한%) — 못 뽑으면 None."""
    bound = None
    if cat in D_BOUND and "D" in parsed:
        # VU D2 는 분포(AOO) 기준이라 개체수 상한이 아니다. D 또는 D1 일 때만 인정.
        if cat != "VU" or ({"", "1"} & parsed["D"]):
            bound = D_BOUND[cat]
    if bound is None and cat in C_BOUND and "C" in parsed:
        bound = C_BOUND[cat]
    rate = None
    if "A" in parsed and cat in ("CR", "EN", "VU"):
        cands = [A_RATE[(cat, n)] for n in parsed["A"] if (cat, n) in A_RATE]
        if cands:
            rate = min(cands)      # 가장 보수적(낮은) 값
    return bound, rate

def one(sql):
    return con.execute(sql).fetchone()[0]

total = one("SELECT COUNT(*) FROM species")
ext = one("SELECT COUNT(*) FROM species WHERE category IN ('EX','EW')")
scored = one(f"SELECT COUNT(*) FROM species WHERE {HAS_POP} AND {NOT_EXT}")

print("=" * 70)
print("0. 현재 v5 커버리지")
print("=" * 70)
print(f"  전체 종                        {total:>7,}")
print(f"  EX/EW (무조건 100점)           {ext:>7,}")
print(f"  개체수 있음 → 점수 산출        {scored:>7,}")
print(f"  커버리지                       {(ext+scored)/total*100:>6.1f}%")

for label, where in COHORTS:
    n = one(f"SELECT COUNT(*) FROM species WHERE {where}")
    print()
    print("=" * 70)
    print(f"{label} — {n:,} 종")
    print("=" * 70)

    print("  [필드 충전율]")
    for col, desc in FIELDS:
        c = one(f"SELECT COUNT(*) FROM species WHERE {where} AND {col} IS NOT NULL "
                f"AND TRIM(CAST({col} AS TEXT)) <> ''")
        print(f"    {col:<24} {c:>7,} {c/n*100:>6.1f}%   {desc}")

    print("  [등급 분포 / criteria 보유]")
    for cat, c, wc in con.execute(
            f"SELECT category, COUNT(*), SUM(CASE WHEN iucn_criteria IS NOT NULL "
            f"AND TRIM(iucn_criteria)<>'' THEN 1 ELSE 0 END) FROM species "
            f"WHERE {where} GROUP BY category ORDER BY COUNT(*) DESC"):
        print(f"    {cat or '(없음)':<8} {c:>7,} 종   criteria {wc:>6,} ({wc/c*100:>5.1f}%)")

    letters = Counter()
    n_bound = rate_only = either = only_b = mass_only = 0
    bound_hist, rate_hist = Counter(), Counter()
    rate_and_gl = 0
    for cat, crit, gl, mass in con.execute(
            f"SELECT category, iucn_criteria, iucn_generation_length, "
            f"COALESCE(mass_g, mass_g_external) FROM species WHERE {where}"):
        parsed = parse_criteria(crit) if crit else {}
        for L in parsed:
            letters[L] += 1
        bound, rate = bounds_for(cat, parsed)
        if bound is not None:
            n_bound += 1
            bound_hist[bound] += 1
        elif rate is not None:
            rate_only += 1
        if bound is not None or rate is not None:
            either += 1
        if rate is not None:
            rate_hist[rate] += 1
            if gl:
                rate_and_gl += 1
        if bound is None and rate is None:
            if set(parsed) == {"B"}:
                only_b += 1
            if mass:
                mass_only += 1

    print("  [criteria 에서 뽑아낼 수 있는 것]")
    print("    Criterion 글자별: " + ", ".join(f"{L}={letters[L]:,}" for L in "ABCDE"))
    print(f"    ▶ 성숙개체수 상한 (C/D)      {n_bound:>6,} 종 ({n_bound/n*100:>5.1f}%)  "
          + ", ".join(f"<{k}:{v}종" for k, v in sorted(bound_hist.items())))
    print(f"    ▶ 감소율만 (A)               {rate_only:>6,} 종 ({rate_only/n*100:>5.1f}%)  "
          + ", ".join(f"≥{k}%:{v}종" for k, v in sorted(rate_hist.items())))
    print(f"       그중 세대시간 있어 연율 환산 가능 {rate_and_gl:,} 종")
    print(f"    ▶ 둘 중 하나                 {either:>6,} 종 ({either/n*100:>5.1f}%)")
    print(f"    ▶ B(분포)만 — 개체수 무관    {only_b:>6,} 종")
    print(f"    ▶ criteria 불가 + 체중만     {mass_only:>6,} 종 ({mass_only/n*100:>5.1f}%)")

print()
print("=" * 70)
print("criteria 문자열 실제 예시 (IUCN 동기화 & 개체수 없음, 상위 15)")
print("=" * 70)
for s, c in con.execute(
        f"SELECT iucn_criteria, COUNT(*) FROM species "
        f"WHERE NOT {HAS_POP} AND {NOT_EXT} AND {SYNCED} "
        f"AND iucn_criteria IS NOT NULL AND TRIM(iucn_criteria)<>'' "
        f"GROUP BY iucn_criteria ORDER BY COUNT(*) DESC LIMIT 15"):
    print(f"  {c:>5,}회  {s}")

con.close()
