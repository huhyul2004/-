#!/usr/bin/env python3
"""Step 1·2: 분류군 내 자체 상관(체중 vs IUCN 등급) + 산점도 격자. read-only."""
import os
import numpy as np, pandas as pd
from scipy import stats
import matplotlib
matplotlib.use("Agg"); import matplotlib.pyplot as plt
matplotlib.rcParams["font.family"]="AppleGothic"; matplotlib.rcParams["axes.unicode_minus"]=False

ROOT="/Users/huhyul0524/Desktop/last-watch"
df=pd.read_csv(f"{ROOT}/research/data/dataset_iucn_score_vs_mass_v2.csv")
PNG=f"{ROOT}/research/results/scatter_within_taxon.png"
CATCOL={"LC":"#60C659","NT":"#CCE226","VU":"#F9E814","EN":"#FC7F3F","CR":"#D81E05"}
GROUPS=["포유류","조류"]

fig,axes=plt.subplots(1,len(GROUPS),figsize=(13,6),dpi=150,sharey=True)
rng=np.random.default_rng(3)
stats_out=[]
for ax,g in zip(axes,GROUPS):
    s=df[df.class_name==g]
    x=s.log_mass_g.values; y=s.iucn_score.values.astype(float); n=len(s)
    pr=stats.pearsonr(x,y); sr=stats.spearmanr(x,y); ci=pr.confidence_interval(0.95)
    r,p,R2=pr.statistic,pr.pvalue,pr.statistic**2
    stats_out.append((g,n,r,p,ci.low,ci.high,sr.statistic,sr.pvalue,R2,int(y.min()),int(y.max())))
    for cat in ["LC","NT","VU","EN","CR"]:
        gg=s[s.iucn_category==cat]
        if len(gg)==0: continue
        ax.scatter(gg.log_mass_g, gg.iucn_score+rng.normal(0,0.06,len(gg)),
            s=38,alpha=0.72,color=CATCOL[cat],label=f"{cat} ({len(gg)})",edgecolors="none")
    b,a=np.polyfit(x,y,1); xs=np.array([x.min(),x.max()])
    ax.plot(xs,a+b*xs,color="#d62728",lw=2.2,label=f"회귀선 r={r:.3f}")
    ax.set_title(f"{g}  (n={n})",fontsize=14,pad=10)
    ax.set_xlabel("log10(성체 체중, g)")
    ax.grid(True,alpha=0.25)
    ax.legend(loc="upper right",fontsize=8,framealpha=0.9)
    sigtxt="유의하지 않음" if p>=0.05 else ("유의(방향 반대)" if r<0 else "유의")
    ax.text(0.03,0.03,f"Pearson r={r:.3f}, p={p:.3f}\nSpearman ρ={sr.statistic:.3f}\nR²={R2:.3f}  →  {sigtxt}",
        transform=ax.transAxes,ha="left",va="bottom",fontsize=9.5,
        bbox=dict(boxstyle="round",fc="white",ec="#ccc"))
axes[0].set_ylabel("IUCN 위험점수 (RLI)")
axes[0].set_yticks([0,1,2,3,4]); axes[0].set_yticklabels(["LC(0)","NT(1)","VU(2)","EN(3)","CR(4)"])
axes[0].set_ylim(-0.5,4.6)
fig.suptitle("분류군 내 자체 상관: 체중 vs IUCN 등급 (분류군 간 편향 제거)",fontsize=15,y=1.00)
fig.text(0.5,-0.02,"※ 조류는 실측개체수 위협종만 수집되어 Y범위가 VU~CR(2~4)로 압축됨 — 검정력 제한",
    ha="center",fontsize=9,color="#666")
plt.tight_layout(); plt.savefig(PNG,bbox_inches="tight"); print(f"PNG → {PNG}")
# 통계 요약 재출력
print("\n분류군   n  Y범위   Pearson_r   p       95%CI            Spearman_ρ  R²")
for g,n,r,p,lo,hi,rho,rp,R2,ymn,ymx in stats_out:
    print(f"{g:6s} {n:4d}  {ymn}~{ymx}   {r:+.3f}  {p:.3f}  [{lo:+.3f},{hi:+.3f}]  {rho:+.3f}      {R2:.3f}")
