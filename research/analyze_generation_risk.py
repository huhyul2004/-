#!/usr/bin/env python3
"""H2: 세대시간 vs IUCN 등급 상관 분석 (전체 + 분류군별, 기본+검증). read-only.

사전 확정 방법(결과 무관 고정):
- X = 세대시간(년), 범위=중앙값, log10
- Y = RLI (LC=0·NT=1·VU=2·EN=3·CR=4·EW=5·EX=5)
- 기본표본: 단일값+범위중앙값 / 검증표본: 단일값만
- Pearson r·p·95%CI, Spearman ρ, R² · 전체 및 분류군별
"""
import os, sqlite3, json
import numpy as np, pandas as pd
from scipy import stats

ROOT="/Users/huhyul0524/Desktop/last-watch"
RLI={"LC":0,"NT":1,"VU":2,"EN":3,"CR":4,"EW":5,"EX":5}
GRP={"MAMMALIA":"포유류","AVES":"조류","REPTILIA":"파충류","AMPHIBIA":"양서류",
     "ACTINOPTERYGII":"어류","CHONDRICHTHYES":"어류","PETROMYZONTI":"어류"}
def grp(c): return GRP.get(c,"무척추/식물/기타")

def parse_mid(raw):
    """단일값 or 범위중앙값 → float | None. (single_flag 반환)"""
    if raw is None: return None,None
    s=str(raw).strip().replace(",","")
    if s=="" or s.lower() in ("unknown","na","n/a"): return None,None
    try: return float(s),True          # 단일값
    except ValueError: pass
    if "-" in s:
        try:
            a,b=s.split("-",1); return (float(a)+float(b))/2, False   # 범위중앙값
        except: return None,None
    return None,None

con=sqlite3.connect(f"{ROOT}/data/species.db")
df=pd.read_sql_query("""
SELECT scientific_name, iucn_class, iucn_category, iucn_generation_length_raw AS raw
FROM species
WHERE is_curated=1 AND iucn_category IN ('LC','NT','VU','EN','CR','EW','EX')
  AND iucn_generation_length_raw IS NOT NULL
""", con); con.close()

parsed=df.raw.map(parse_mid)
df["gen"]=parsed.map(lambda t:t[0])
df["is_single"]=parsed.map(lambda t:t[1])
df=df[df.gen.notna() & (df.gen>0)].copy()
df["log_gen"]=np.log10(df.gen)
df["iucn_score"]=df.iucn_category.map(RLI)
df["taxon"]=df.iucn_class.map(grp)

CSV=f"{ROOT}/research/data/dataset_generation_risk.csv"
df[["scientific_name","taxon","iucn_class","iucn_category","iucn_score","gen","is_single"]].to_csv(CSV,index=False)
print(f"CSV → {CSV}")
print(f"기본표본(중앙값 포함) n={len(df)} · 검증표본(단일값만) n={int(df.is_single.sum())}\n")

def corr(sub):
    x=sub.log_gen.values; y=sub.iucn_score.values.astype(float); n=len(sub)
    if n<10: return None
    pr=stats.pearsonr(x,y); sr=stats.spearmanr(x,y); ci=pr.confidence_interval(0.95)
    return dict(n=n, r=pr.statistic, p=pr.pvalue, lo=ci.low, hi=ci.high,
               rho=sr.statistic, rp=sr.pvalue, R2=pr.statistic**2)

def report(title, data):
    print(f"===== {title} =====")
    print(f"{'구분':18s} {'n':>5s} {'Pearson r':>10s} {'p':>9s} {'95%CI':>18s} {'ρ':>8s} {'R²':>7s} 판정")
    # 전체
    for label, sub in [("전체", data)] + [(g, data[data.taxon==g]) for g in
            ["포유류","조류","어류","파충류","무척추/식물/기타"]]:
        c=corr(sub)
        if not c:
            print(f"{label:18s}  (n<10 제외)"); continue
        sig="유의" if c["p"]<0.05 else "무의미"
        direc="+" if c["r"]>=0 else "−"
        print(f"{label:18s} {c['n']:5d} {c['r']:+10.3f} {c['p']:9.2e} [{c['lo']:+.2f},{c['hi']:+.2f}] {c['rho']:+8.3f} {c['R2']:7.3f} {sig}({direc})")
    print()

report("기본 분석 (단일값 + 범위중앙값)", df)
report("검증 분석 (단일값만)", df[df.is_single==True])
