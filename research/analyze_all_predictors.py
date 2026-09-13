#!/usr/bin/env python3
"""전 변수 × IUCN 등급 연관성 회귀 스윕 (read-only).

Y = IUCN RLI 서열 (LC=0·NT=1·VU=2·EN=3·CR=4).
각 변수 유형에 맞는 통계:
  - 연속(체중·연도·개체수): Pearson r + Spearman ρ + R² (+95%CI)
  - 순서형(개체수추세): Spearman ρ (Increasing<Stable<Decreasing)
  - 범주형(분류군): one-way ANOVA η² + Kruskal-Wallis
  - 이진(기준 A~E 발동): point-biserial(=Pearson) + Mann-Whitney
각 변수에 순환성(내생/독립) 라벨 부착. 결과: 종합표 CSV·MD + 요약 막대그래프.
"""
import os, sqlite3, math
import numpy as np, pandas as pd
from scipy import stats
import matplotlib
matplotlib.use("Agg"); import matplotlib.pyplot as plt
matplotlib.rcParams["font.family"]="AppleGothic"; matplotlib.rcParams["axes.unicode_minus"]=False

ROOT="/Users/huhyul0524/Desktop/last-watch"
DB=os.path.join(ROOT,"data/species.db")
OUTCSV=os.path.join(ROOT,"research/results/predictors_vs_iucn.csv")
OUTPNG=os.path.join(ROOT,"research/results/predictors_vs_iucn.png")
RLI={"LC":0,"NT":1,"VU":2,"EN":3,"CR":4}

con=sqlite3.connect(DB)
df=pd.read_sql_query("""
SELECT scientific_name, class_name, iucn_category, iucn_criteria,
       iucn_population_trend, iucn_population_size, iucn_assessment_year,
       iucn_possibly_extinct, mass_g, mass_g_external
FROM species
WHERE is_curated=1 AND iucn_category IN ('LC','NT','VU','EN','CR')
""", con)
con.close()
df["Y"]=df.iucn_category.map(RLI)
df["mass_effective"]=df.mass_g.where(df.mass_g.notna(), df.mass_g_external)
N=len(df)
print(f"=== 분석 모집단 N={N} ===\n")

rows=[]
def rec(var, kind, circ, n, stat_name, stat, p, extra=""):
    rows.append(dict(변수=var, 유형=kind, 순환성=circ, n=n,
        지표=stat_name, 값=round(stat,4), p_value=p, 비고=extra))
    sig = "유의" if (p is not None and p<0.05) else "무의미"
    pstr = f"{p:.2e}" if p is not None else "—"
    print(f"[{circ:4s}] {var:22s} n={n:4d}  {stat_name}={stat:+.4f} (p={pstr}, {sig}) {extra}")

# ---------- 연속 변수: Pearson + Spearman ----------
def cont(var, series, circ, log=False, note=""):
    s=df[[var if False else "Y"]].copy()
    x=pd.to_numeric(series, errors="coerce")
    m=x.notna() & df.Y.notna()
    xv=x[m].values.astype(float); yv=df.Y[m].values.astype(float)
    if log: xv=np.log10(xv[xv>0]); yv=yv[np.where(x[m].values>0)[0]]
    n=len(xv)
    if n<10: rec(var,"연속",circ,n,"Pearson r",float("nan"),None,"표본<10"); return
    pr=stats.pearsonr(xv,yv); sr=stats.spearmanr(xv,yv)
    ci=pr.confidence_interval(0.95)
    rec(var+(" (log10)" if log else ""),"연속",circ,n,"Pearson r",pr.statistic,pr.pvalue,
        f"ρ={sr.statistic:+.3f}(p={sr.pvalue:.1e}) R²={pr.statistic**2:.3f} CI[{ci.low:.2f},{ci.high:.2f}] {note}")

cont("mass_effective", df.mass_effective, "독립", log=True, note="체중(외생)")
cont("iucn_assessment_year", df.iucn_assessment_year, "독립", note="평가연도(외생)")
cont("iucn_population_size", df.iucn_population_size, "순환", log=True, note="성숙개체수(기준C/D)")

# ---------- 순서형: 개체수 추세 ----------
TREND={"Increasing":0,"Stable":1,"Decreasing":2}   # Unknown 제외
tv=df.iucn_population_trend.map(TREND)
m=tv.notna() & df.Y.notna()
sr=stats.spearmanr(tv[m].values.astype(float), df.Y[m].values.astype(float))
rec("iucn_population_trend","순서형","순환",int(m.sum()),"Spearman ρ",sr.statistic,sr.pvalue,
    "Increasing<Stable<Decreasing (기준A). Unknown 제외")

# ---------- 범주형: 분류군 (one-way ANOVA η² + Kruskal) ----------
g=df[df.class_name.notna()].groupby("class_name")["Y"]
groups=[v.values.astype(float) for k,v in g if len(v)>=10]
labels=[k for k,v in g if len(v)>=10]
if len(groups)>=2:
    F,pF=stats.f_oneway(*groups)
    # η² = SS_between / SS_total
    allv=np.concatenate(groups); gm=allv.mean()
    ssb=sum(len(gr)*(gr.mean()-gm)**2 for gr in groups)
    sst=((allv-gm)**2).sum()
    eta2=ssb/sst
    H,pH=stats.kruskal(*groups)
    rec("class_name(분류군)","범주형","독립",int(sum(len(x) for x in groups)),"η² (ANOVA)",eta2,pF,
        f"{len(groups)}개 분류군, Kruskal H={H:.1f}(p={pH:.1e})")

# ---------- 이진: 기준 A~E 발동 여부 (criteria 문자열에 해당 대문자 포함) ----------
crit=df[df.iucn_criteria.notna()].copy()
for L in ["A","B","C","D","E"]:
    present=crit.iucn_criteria.str.contains(L, regex=False)
    y0=crit.Y[~present].values.astype(float); y1=crit.Y[present].values.astype(float)
    if len(y1)<10 or len(y0)<10:
        rec(f"기준{L} 발동","이진","순환",len(present),"point-biserial",float("nan"),None,
            f"한쪽<10 (발동 {int(present.sum())}/{len(present)})"); continue
    x=present.astype(float).values; y=crit.Y.values.astype(float)
    pb=stats.pearsonr(x,y); mw=stats.mannwhitneyu(y1,y0)
    rec(f"기준{L} 발동","이진","순환",len(present),"point-biserial",pb.statistic,pb.pvalue,
        f"발동{int(present.sum())}종 등급평균{y1.mean():.2f} vs 미발동{y0.mean():.2f}")

# ---------- possibly_extinct (사실상 CR 동어반복) ----------
pe=df.iucn_possibly_extinct.fillna(0).astype(float)
pb=stats.pearsonr(pe.values, df.Y.values.astype(float))
rec("possibly_extinct","이진","순환",N,"point-biserial",pb.statistic,pb.pvalue,
    "CR/EW와 거의 동어반복")

# ---------- 저장 ----------
res=pd.DataFrame(rows)
res.to_csv(OUTCSV, index=False)
print(f"\nCSV → {OUTCSV}")

# ---------- 요약 막대그래프 (|효과크기|, 순환/독립 색분리) ----------
plot=res.dropna(subset=["값"]).copy()
plot["abs"]=plot["값"].abs()
plot=plot.sort_values("abs")
colors=plot["순환성"].map({"독립":"#2ca02c","순환":"#d62728","순서형":"#d62728","범주형":"#2ca02c"})
fig,ax=plt.subplots(figsize=(10,6),dpi=150)
ax.barh(plot["변수"], plot["abs"], color=colors, alpha=0.85)
for i,(v,val,p) in enumerate(zip(plot["변수"],plot["abs"],plot["p_value"])):
    star = "***" if (p is not None and p<0.001) else "**" if (p is not None and p<0.01) else "*" if (p is not None and p<0.05) else "n.s."
    ax.text(val+0.005, i, f"{val:.3f} {star}", va="center", fontsize=8)
ax.set_xlabel("|효과크기| (|r|, ρ, η²)")
ax.set_title("IUCN 등급과 각 변수의 연관성 (초록=독립/외생, 빨강=순환/내생)")
import matplotlib.patches as mp
ax.legend(handles=[mp.Patch(color="#2ca02c",label="독립(외생) — 진짜 예측요인"),
                   mp.Patch(color="#d62728",label="순환(내생) — 등급 결정 입력")],
          loc="lower right", fontsize=9)
ax.grid(True,axis="x",alpha=0.25)
plt.tight_layout(); plt.savefig(OUTPNG); print(f"PNG → {OUTPNG}")
