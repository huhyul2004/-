#!/usr/bin/env python3
"""Step 5·6 시각화: LastWatch vs IUCN. read-only."""
import os
import numpy as np, pandas as pd
from scipy import stats
import matplotlib
matplotlib.use("Agg"); import matplotlib.pyplot as plt
matplotlib.rcParams["font.family"]="AppleGothic"; matplotlib.rcParams["axes.unicode_minus"]=False

ROOT="/Users/huhyul0524/Desktop/last-watch"
df=pd.read_csv(f"{ROOT}/research/data/dataset_vs_iucn.csv")
alive=df[~df.is_extinct]
rng=np.random.default_rng(9)

# ---------- Fig 1: 전체 산점도 (consensus vs RLI) ----------
fig,ax=plt.subplots(figsize=(11,7),dpi=150)
for lab,sub,c in [("절멸(EX/EW)",df[df.is_extinct],"#7B0000"),("생존종",alive,"#2b6cb0")]:
    ax.scatter(sub.iucn_rli+rng.normal(0,0.07,len(sub)), sub.consensus_score+rng.normal(0,0.8,len(sub)),
        s=16,alpha=0.4,color=c,edgecolors="none",label=f"{lab} (n={len(sub)})")
# 회귀선 (생존종)
x=alive.iucn_rli.values.astype(float); y=alive.consensus_score.values.astype(float)
b,a=np.polyfit(x,y,1); xs=np.array([x.min(),x.max()])
pr=stats.pearsonr(x,y); sr=stats.spearmanr(x,y)
ax.plot(xs,a+b*xs,color="#d62728",lw=2.5,label=f"회귀선(생존) r={pr.statistic:.3f}")
ax.set_xticks([0,1,2,3,4,5]); ax.set_xticklabels(["LC","NT","VU","EN","CR","EW·EX"])
ax.set_xlabel("IUCN 등급 (RLI)"); ax.set_ylabel("LastWatch consensus_score (0~100)")
ax.set_title("LastWatch v5 점수 vs IUCN 등급 — 전체")
ax.grid(True,alpha=0.25); ax.legend(loc="upper left",fontsize=9)
ax.text(0.98,0.03,f"생존종 Pearson r={pr.statistic:.3f}\nSpearman ρ={sr.statistic:.3f}\n(절멸 포함 ρ=0.945)",
    transform=ax.transAxes,ha="right",va="bottom",fontsize=10,bbox=dict(boxstyle="round",fc="white",ec="#ccc"))
plt.tight_layout(); plt.savefig(f"{ROOT}/research/results/scatter_vs_iucn_overall.png",bbox_inches="tight")
print("PNG → scatter_vs_iucn_overall.png")

# ---------- Fig 2: 분류군별 subplot (생존종) ----------
PANELS=[g for g in ["포유류","무척추/식물/기타","조류","파충류"] if (alive.taxon==g).sum()>=15]
fig,axes=plt.subplots(2,2,figsize=(13,10),dpi=150)
for ax,g in zip(axes.flat,PANELS):
    s=alive[alive.taxon==g]
    ax.scatter(s.iucn_rli+rng.normal(0,0.07,len(s)), s.consensus_score+rng.normal(0,0.8,len(s)),
        s=26,alpha=0.5,color="#2b6cb0",edgecolors="none")
    xx=s.iucn_rli.values.astype(float); yy=s.consensus_score.values.astype(float)
    pr=stats.pearsonr(xx,yy); b,a=np.polyfit(xx,yy,1); xs=np.array([xx.min(),xx.max()])
    ax.plot(xs,a+b*xs,color="#d62728",lw=2.2)
    sig="유의" if pr.pvalue<0.05 else "무의미"
    ax.set_title(f"{g} (n={len(s)})",fontsize=13)
    ax.set_xticks([0,1,2,3,4]); ax.set_xticklabels(["LC","NT","VU","EN","CR"])
    ax.set_xlabel("IUCN 등급"); ax.set_ylabel("LastWatch score")
    ax.grid(True,alpha=0.25)
    ax.text(0.03,0.97,f"r={pr.statistic:.3f}, p={pr.pvalue:.2e}\n{sig}",transform=ax.transAxes,
        ha="left",va="top",fontsize=10,bbox=dict(boxstyle="round",fc="white",ec="#ccc"))
for ax in axes.flat[len(PANELS):]: ax.axis("off")
fig.suptitle("LastWatch vs IUCN — 분류군별 (생존종, 심슨의 역설 점검: 전 분류군 유지)",fontsize=15,y=0.995)
plt.tight_layout(); plt.savefig(f"{ROOT}/research/results/scatter_vs_iucn_by_taxon.png",bbox_inches="tight")
print("PNG → scatter_vs_iucn_by_taxon.png")

# ---------- Fig 3: 정규화 일치도 (lw5 vs rli, y=x 기준 + 상위 divergence 라벨) ----------
fig,ax=plt.subplots(figsize=(11,8),dpi=150)
ax.plot([0,5],[0,5],ls="--",color="#888",lw=1.5,label="완전 일치선 (y=x)")
sc=ax.scatter(alive.iucn_rli+rng.normal(0,0.06,len(alive)), alive.lw5,
    c=alive["diff"],cmap="coolwarm",vmin=-3,vmax=3,s=30,alpha=0.7,edgecolors="none")
plt.colorbar(sc,label="diff = LastWatch − IUCN (양수=LW가 더 위험)")
# 상위 divergence 라벨
top=alive.reindex(alive["diff"].abs().sort_values(ascending=False).index).head(10)
for _,r in top.iterrows():
    ax.annotate(r['scientific_name'].split()[0][:10], (r['iucn_rli'], r['lw5']),
        fontsize=7,alpha=0.8,xytext=(3,3),textcoords="offset points")
ax.set_xticks([0,1,2,3,4]); ax.set_xticklabels(["LC","NT","VU","EN","CR"])
ax.set_yticks([0,1,2,3,4,5]); ax.set_yticklabels(["0","1","2","3","4","5"])
ax.set_xlabel("IUCN 등급 (RLI)"); ax.set_ylabel("LastWatch 정규화 점수 (score/20)")
ax.set_title("일치·불일치 지도 (생존종) — 대각선 위=LW가 더 위험, 아래=IUCN이 더 위험")
ax.grid(True,alpha=0.25); ax.legend(loc="lower right",fontsize=9)
plt.tight_layout(); plt.savefig(f"{ROOT}/research/results/scatter_vs_iucn_agreement.png",bbox_inches="tight")
print("PNG → scatter_vs_iucn_agreement.png")
