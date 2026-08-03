#!/usr/bin/env python3
"""LastWatch(v5) vs IUCN 개별 종 비교 — 표본·상관·분류군별·상위차이. read-only.

- LastWatch 점수: tipping_points.consensus_score (0~100) → lw5 = /20 (0~5 정규화).
- IUCN: RLI (LC=0·NT=1·VU=2·EN=3·CR=4·EW=5·EX=5).
- diff = lw5 - rli  (양수=LastWatch가 더 위험 판단).
- 절멸(EX/EW)은 양 시스템 자명 일치 → 포함/제외 양쪽 보고.
"""
import os, sqlite3, json
import numpy as np, pandas as pd
from scipy import stats

ROOT="/Users/huhyul0524/Desktop/last-watch"
RLI={"LC":0,"NT":1,"VU":2,"EN":3,"CR":4,"EW":5,"EX":5}
GRP={"MAMMALIA":"포유류","AVES":"조류","REPTILIA":"파충류","AMPHIBIA":"양서류",
     "ACTINOPTERYGII":"어류","CHONDRICHTHYES":"어류","PETROMYZONTI":"어류"}
def grp(c): return GRP.get(c,"무척추/식물/기타")

con=sqlite3.connect(f"{ROOT}/data/species.db")
rows=con.execute("""
SELECT s.scientific_name, s.iucn_class, s.iucn_category,
       s.mature_individuals, s.iucn_population_size, s.iucn_population_trend,
       tp.consensus_score, tp.intervention_tier, tp.payload_json
FROM tipping_points tp JOIN species s ON tp.species_id=s.id
WHERE s.is_curated=1 AND s.iucn_category IS NOT NULL AND s.iucn_category NOT IN ('NA','DD')
""").fetchall()
con.close()

recs=[]
for sci,cls,cat,mat,ips,trend,cs,tier,pj in rows:
    try: p=json.loads(pj)
    except: p={}
    ls=p.get("layer_scores") or {}
    def lscore(k):
        v=ls.get(k); return (v or {}).get("score") if isinstance(v,dict) else None
    pop_source = "mature_individuals" if (mat and mat>0) else ("iucn_population_size" if (ips and ips>0) else "none/extinct")
    recs.append(dict(
        scientific_name=sci, iucn_class=cls, taxon=grp(cls),
        iucn_category=cat, iucn_rli=RLI[cat],
        consensus_score=cs, lw5=cs/20.0, intervention_tier=tier,
        diff=cs/20.0 - RLI[cat],
        is_extinct=cat in ("EX","EW"),
        pop_source=pop_source, iucn_trend=trend,
        ews=lscore("ews"), pva=lscore("pva"), iucn_layer=lscore("iucn"),
        primary_driver=p.get("primary_driver"), confidence=p.get("confidence"),
    ))
df=pd.DataFrame(recs)
df.to_csv(f"{ROOT}/research/data/dataset_vs_iucn.csv", index=False)
print(f"CSV → dataset_vs_iucn.csv (n={len(df)})\n")

# ---------- Step 4: 분포 ----------
print("=== 표본 분포 ===")
print("등급:", {k:int((df.iucn_category==k).sum()) for k in ['LC','NT','VU','EN','CR','EW','EX'] if (df.iucn_category==k).any()})
print("분류군:", df.taxon.value_counts().to_dict())
print(f"절멸 {int(df.is_extinct.sum())} · 생존 {int((~df.is_extinct).sum())}\n")

# ---------- Step 5: 전체 상관 (포함/제외) ----------
def corr(sub, xcol="consensus_score", ycol="iucn_rli"):
    x=sub[xcol].values.astype(float); y=sub[ycol].values.astype(float); n=len(sub)
    if n<10: return None
    pr=stats.pearsonr(x,y); sr=stats.spearmanr(x,y); ci=pr.confidence_interval(0.95)
    return dict(n=n,r=pr.statistic,p=pr.pvalue,lo=ci.low,hi=ci.high,rho=sr.statistic,rp=sr.pvalue,R2=pr.statistic**2)

print("=== Step 5: 전체 상관 (LastWatch consensus_score vs IUCN RLI) ===")
for label, sub in [("절멸 포함 (전체)", df), ("절멸 제외 (생존만)", df[~df.is_extinct])]:
    c=corr(sub)
    print(f"[{label}] n={c['n']}  Pearson r={c['r']:+.3f}(p={c['p']:.2e}) 95%CI[{c['lo']:+.2f},{c['hi']:+.2f}]  Spearman ρ={c['rho']:+.3f}  R²={c['R2']:.3f}")
print()

# ---------- Step 6: 분류군별 상관 (생존종, 심슨의 역설 점검) ----------
print("=== Step 6: 분류군별 상관 (생존종 기준, 심슨의 역설 점검) ===")
alive=df[~df.is_extinct]
print(f"{'분류군':16s} {'n':>4s} {'Pearson r':>10s} {'p':>9s} {'Spearman':>9s} {'R²':>7s} 판정")
c=corr(alive); print(f"{'전체(생존)':16s} {c['n']:4d} {c['r']:+10.3f} {c['p']:9.2e} {c['rho']:+9.3f} {c['R2']:7.3f}")
for g in alive.taxon.value_counts().index:
    sub=alive[alive.taxon==g]
    c=corr(sub)
    if not c: print(f"{g:16s}  (n<10 제외, n={len(sub)})"); continue
    sig="유의" if c['p']<0.05 else "무의미"
    print(f"{g:16s} {c['n']:4d} {c['r']:+10.3f} {c['p']:9.2e} {c['rho']:+9.3f} {c['R2']:7.3f} {sig}")
print()

# ---------- Step 7: 개별 차이 상위 (생존종, |diff| 상위 30) ----------
alive2=alive.copy()
top=alive2.reindex(alive2["diff"].abs().sort_values(ascending=False).index).head(30)
cols=["scientific_name","taxon","iucn_category","iucn_rli","consensus_score","lw5","intervention_tier",
      "diff","pop_source","iucn_trend","ews","pva","iucn_layer","primary_driver"]
top[cols].to_csv(f"{ROOT}/research/data/top_diff_species.csv", index=False)
print("=== Step 7: 개별 차이 상위 30 (생존종) → top_diff_species.csv ===")
morelw=top[top['diff']>0]; moreiucn=top[top['diff']<0]
print(f"LastWatch가 더 위험(diff>0): {len(morelw)}종 · IUCN이 더 위험(diff<0): {len(moreiucn)}종")
print("\n[LastWatch가 더 위험하다고 본 상위 8]")
for _,r in morelw.head(8).iterrows():
    print(f"  {r['scientific_name'][:28]:28s} {r['taxon'][:4]:4s} IUCN {r['iucn_category']}(rli{r['iucn_rli']}) vs LW {r['consensus_score']:.0f}({r['intervention_tier']}) diff{r['diff']:+.1f} · {r['pop_source']} · trend={r['iucn_trend']}")
print("\n[IUCN이 더 위험하다고 본 상위 8]")
for _,r in moreiucn.head(8).iterrows():
    print(f"  {r['scientific_name'][:28]:28s} {r['taxon'][:4]:4s} IUCN {r['iucn_category']}(rli{r['iucn_rli']}) vs LW {r['consensus_score']:.0f}({r['intervention_tier']}) diff{r['diff']:+.1f} · {r['pop_source']} · trend={r['iucn_trend']}")

# 일치 종 (diff≈0) 대조용 후보
agree=alive2[alive2['diff'].abs()<0.15].sort_values('consensus_score',ascending=False)
print(f"\n[정확 일치 후보 (|diff|<0.15): {len(agree)}종] 상위 5:")
for _,r in agree.head(5).iterrows():
    print(f"  {r['scientific_name'][:28]:28s} IUCN {r['iucn_category']} vs LW {r['consensus_score']:.0f} diff{r['diff']:+.2f}")
