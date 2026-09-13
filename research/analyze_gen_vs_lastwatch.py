#!/usr/bin/env python3
"""Step 7·8: 세대시간 vs LastWatch 점수 재검증 (+ 같은 표본 gen-vs-IUCN 공정비교). read-only.

핵심 질문: 전 세션에서 세대시간이 IUCN 등급과 +0.514 상관. LastWatch v5 점수도
세대시간과 상관하는가? (v5는 종별 세대시간이 아니라 분류군 고정 기본값 사용.)
공정 비교 위해 동일 표본 B에서 gen-vs-IUCN·gen-vs-LastWatch 둘 다 계산.
"""
import os, sqlite3
import numpy as np, pandas as pd
from scipy import stats
import matplotlib
matplotlib.use("Agg"); import matplotlib.pyplot as plt
matplotlib.rcParams["font.family"]="AppleGothic"; matplotlib.rcParams["axes.unicode_minus"]=False

ROOT="/Users/huhyul0524/Desktop/last-watch"
RLI={"LC":0,"NT":1,"VU":2,"EN":3,"CR":4,"EW":5,"EX":5}
GRP={"MAMMALIA":"포유류","AVES":"조류","REPTILIA":"파충류","AMPHIBIA":"양서류",
     "ACTINOPTERYGII":"어류","CHONDRICHTHYES":"어류","PETROMYZONTI":"어류"}
def grp(c): return GRP.get(c,"무척추/식물/기타")
def mid(r):
    s=str(r).strip().replace(",","")
    if s=="" or s.lower() in ("unknown","na","n/a"): return None
    try: return float(s)
    except: pass
    if "-" in s:
        try: a,b=s.split("-",1); return (float(a)+float(b))/2
        except: return None
    return None

con=sqlite3.connect(f"{ROOT}/data/species.db")
df=pd.read_sql_query("""
SELECT s.scientific_name, s.iucn_class, s.iucn_category,
       s.iucn_generation_length_raw AS raw, tp.consensus_score
FROM tipping_points tp JOIN species s ON tp.species_id=s.id
WHERE s.is_curated=1 AND s.iucn_category IN ('LC','NT','VU','EN','CR','EW','EX')
  AND s.iucn_generation_length_raw IS NOT NULL""", con); con.close()
df["gen"]=df.raw.map(mid); df=df[df.gen>0].copy()
df["log_gen"]=np.log10(df.gen)
df["taxon"]=df.iucn_class.map(grp)
df["iucn_rli"]=df.iucn_category.map(RLI)
df["is_extinct"]=df.iucn_category.isin(["EX","EW"])
df.to_csv(f"{ROOT}/research/data/dataset_gen_vs_lastwatch.csv", index=False)
print(f"표본 B n={len(df)} (절멸 {int(df.is_extinct.sum())} · 생존 {int((~df.is_extinct).sum())})\n")

def corr(sub, y):
    x=sub.log_gen.values; yv=sub[y].values.astype(float); n=len(sub)
    if n<10: return None
    pr=stats.pearsonr(x,yv); sr=stats.spearmanr(x,yv); ci=pr.confidence_interval(0.95)
    return dict(n=n,r=pr.statistic,p=pr.pvalue,lo=ci.low,hi=ci.high,rho=sr.statistic,R2=pr.statistic**2)

for scope,d in [("전체(절멸포함)",df),("생존만",df[~df.is_extinct])]:
    print(f"===== 표본 B {scope} (n={len(d)}) — 세대시간 상관 =====")
    ci=corr(d,"iucn_rli"); cl=corr(d,"consensus_score")
    print(f"  vs IUCN RLI      : r={ci['r']:+.3f} p={ci['p']:.2e} ρ={ci['rho']:+.3f} R²={ci['R2']:.3f}")
    print(f"  vs LastWatch점수 : r={cl['r']:+.3f} p={cl['p']:.2e} ρ={cl['rho']:+.3f} R²={cl['R2']:.3f}")
    print()

# 분류군별 (생존, LastWatch 기준) — 심슨의 역설 점검
print("===== 분류군별 (생존, 세대시간 vs LastWatch) — 심슨 점검 =====")
alive=df[~df.is_extinct]
for g in ["전체(생존)"]+list(alive.taxon.value_counts().index):
    sub=alive if g=="전체(생존)" else alive[alive.taxon==g]
    c=corr(sub,"consensus_score")
    if not c: print(f"  {g:16s} (n<10, n={len(sub)})"); continue
    sig="유의" if c['p']<0.05 else "무의미"
    print(f"  {g:16s} n={c['n']:4d} r={c['r']:+.3f} p={c['p']:.2e} ρ={c['rho']:+.3f} R²={c['R2']:.3f} {sig}")

# ---------- Step 8 산점도 ----------
CATCOL={"LC":"#60C659","NT":"#CCE226","VU":"#F9E814","EN":"#FC7F3F","CR":"#D81E05","EW":"#7B0000","EX":"#5A0000"}
rng=np.random.default_rng(11)
# 전체 1장
fig,ax=plt.subplots(figsize=(11,7),dpi=150)
for t,cc in [("포유류","#4C72B0"),("조류","#DD8452"),("무척추/식물/기타","#937860"),("파충류","#55A868"),("어류","#64B5CD")]:
    s=df[df.taxon==t]
    if len(s)==0: continue
    ax.scatter(s.log_gen, s.consensus_score+rng.normal(0,0.8,len(s)),s=16,alpha=0.4,color=cc,edgecolors="none",label=f"{t}({len(s)})")
x=df.log_gen.values; y=df.consensus_score.values.astype(float)
b,a=np.polyfit(x,y,1); xs=np.array([x.min(),x.max()]); pr=stats.pearsonr(x,y)
ax.plot(xs,a+b*xs,color="#d62728",lw=2.5,label=f"회귀선 r={pr.statistic:.3f}")
ax.set_xlabel("log10(세대시간, 년)"); ax.set_ylabel("LastWatch 점수 (0~100)")
ax.set_title(f"세대시간 vs LastWatch 점수 — 전체 (n={len(df)})")
ax.grid(True,alpha=0.25); ax.legend(loc="upper left",fontsize=9)
ax.text(0.98,0.03,f"Pearson r={pr.statistic:.3f}\nR²={pr.statistic**2:.3f}\n(비교: gen-vs-IUCN등급 이 표본 r={corr(df,'iucn_rli')['r']:.3f})",
    transform=ax.transAxes,ha="right",va="bottom",fontsize=9.5,bbox=dict(boxstyle="round",fc="white",ec="#ccc"))
plt.tight_layout(); plt.savefig(f"{ROOT}/research/results/scatter_gen_vs_lastwatch_overall.png",bbox_inches="tight")
print("\nPNG → scatter_gen_vs_lastwatch_overall.png")

# 분류군별 subplot (생존, n>=15)
PANELS=[g for g in ["포유류","조류","무척추/식물/기타","파충류"] if (alive.taxon==g).sum()>=15]
fig,axes=plt.subplots(2,2,figsize=(13,10),dpi=150)
for ax,g in zip(axes.flat,PANELS):
    s=alive[alive.taxon==g]
    ax.scatter(s.log_gen, s.consensus_score+rng.normal(0,0.8,len(s)),s=26,alpha=0.5,color="#2b6cb0",edgecolors="none")
    xx=s.log_gen.values; yy=s.consensus_score.values.astype(float)
    pr=stats.pearsonr(xx,yy); b,a=np.polyfit(xx,yy,1); xs=np.array([xx.min(),xx.max()])
    ax.plot(xs,a+b*xs,color="#d62728",lw=2.2)
    sig="유의" if pr.pvalue<0.05 else "무의미"
    ax.set_title(f"{g} (n={len(s)})",fontsize=13); ax.set_xlabel("log10(세대시간, 년)"); ax.set_ylabel("LastWatch 점수")
    ax.grid(True,alpha=0.25)
    ax.text(0.03,0.97,f"r={pr.statistic:.3f}, p={pr.pvalue:.2e}\n{sig}",transform=ax.transAxes,ha="left",va="top",fontsize=10,bbox=dict(boxstyle="round",fc="white",ec="#ccc"))
for ax in axes.flat[len(PANELS):]: ax.axis("off")
fig.suptitle("세대시간 vs LastWatch 점수 — 분류군별 (생존종, 심슨 점검)",fontsize=15,y=0.995)
plt.tight_layout(); plt.savefig(f"{ROOT}/research/results/scatter_gen_vs_lastwatch_by_taxon.png",bbox_inches="tight")
print("PNG → scatter_gen_vs_lastwatch_by_taxon.png")
