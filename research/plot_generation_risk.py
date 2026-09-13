#!/usr/bin/env python3
"""Step 3: 세대시간 vs IUCN 등급 산점도 (전체 1장 + 분류군별 subplot). read-only."""
import os
import numpy as np, pandas as pd
from scipy import stats
import matplotlib
matplotlib.use("Agg"); import matplotlib.pyplot as plt
matplotlib.rcParams["font.family"]="AppleGothic"; matplotlib.rcParams["axes.unicode_minus"]=False

ROOT="/Users/huhyul0524/Desktop/last-watch"
df=pd.read_csv(f"{ROOT}/research/data/dataset_generation_risk.csv")
df["log_gen"]=np.log10(df.gen)
CATCOL={"LC":"#60C659","NT":"#CCE226","VU":"#F9E814","EN":"#FC7F3F","CR":"#D81E05"}
# EW/EX(=5) 색
def catcolor(cat): return CATCOL.get(cat,"#7B0000")
TAXCOL={"포유류":"#4C72B0","조류":"#DD8452","어류":"#64B5CD","파충류":"#55A868",
        "무척추/식물/기타":"#937860"}

def stat(sub):
    x=sub.log_gen.values; y=sub.iucn_score.values.astype(float)
    pr=stats.pearsonr(x,y); return pr.statistic, pr.pvalue

rng=np.random.default_rng(5)

# ---------- ① 전체 산점도 ----------
fig,ax=plt.subplots(figsize=(11,7),dpi=150)
for t in ["포유류","조류","어류","파충류","무척추/식물/기타"]:
    s=df[df.taxon==t]
    if len(s)==0: continue
    ax.scatter(s.log_gen, s.iucn_score+rng.normal(0,0.06,len(s)),
        s=14,alpha=0.35,color=TAXCOL.get(t,"#999"),edgecolors="none",label=f"{t} ({len(s)})")
x=df.log_gen.values; y=df.iucn_score.values.astype(float)
b,a=np.polyfit(x,y,1); xs=np.array([x.min(),x.max()])
r,p=stat(df)
ax.plot(xs,a+b*xs,color="#d62728",lw=2.5,label=f"회귀선 r={r:.3f}")
ax.set_xlabel("log10(세대시간, 년)"); ax.set_ylabel("IUCN 위험점수 (RLI)")
ax.set_yticks([0,1,2,3,4,5]); ax.set_yticklabels(["LC(0)","NT(1)","VU(2)","EN(3)","CR(4)","EW·EX(5)"])
ax.set_title(f"세대시간 vs IUCN 등급 — 전체 (n={len(df)})")
ax.grid(True,alpha=0.25); ax.legend(loc="upper left",fontsize=9,framealpha=0.9)
ax.text(0.98,0.03,f"Pearson r={r:.3f}, p={p:.2e}\nR²={r**2:.3f}",
    transform=ax.transAxes,ha="right",va="bottom",fontsize=10,
    bbox=dict(boxstyle="round",fc="white",ec="#ccc"))
plt.tight_layout(); plt.savefig(f"{ROOT}/research/results/scatter_generation_overall.png",bbox_inches="tight")
print("PNG → scatter_generation_overall.png")

# ---------- ② 분류군별 subplot ----------
PANELS=["포유류","조류","어류","파충류"]
fig,axes=plt.subplots(2,2,figsize=(13,10),dpi=150)
for ax,t in zip(axes.flat,PANELS):
    s=df[df.taxon==t]
    for cat in ["LC","NT","VU","EN","CR","EW","EX"]:
        g=s[s.iucn_category==cat]
        if len(g)==0: continue
        ax.scatter(g.log_gen, g.iucn_score+rng.normal(0,0.06,len(g)),
            s=26,alpha=0.6,color=catcolor(cat),edgecolors="none")
    xx=s.log_gen.values; yy=s.iucn_score.values.astype(float)
    r,p=stat(s); b,a=np.polyfit(xx,yy,1); xs=np.array([xx.min(),xx.max()])
    ax.plot(xs,a+b*xs,color="#d62728",lw=2.2)
    sig="유의" if p<0.05 else "무의미"
    ax.set_title(f"{t} (n={len(s)})",fontsize=13)
    ax.set_xlabel("log10(세대시간, 년)"); ax.set_ylabel("IUCN 위험점수")
    ax.set_yticks([0,1,2,3,4,5]); ax.set_yticklabels(["LC","NT","VU","EN","CR","EW·EX"])
    ax.grid(True,alpha=0.25)
    ax.text(0.03,0.97,f"r={r:.3f}, p={p:.3f}\n{sig}",transform=ax.transAxes,
        ha="left",va="top",fontsize=10,bbox=dict(boxstyle="round",fc="white",ec="#ccc"))
fig.suptitle("세대시간 vs IUCN 등급 — 분류군별 (분류군 간 편향 제거)",fontsize=15,y=0.995)
plt.tight_layout(); plt.savefig(f"{ROOT}/research/results/scatter_generation_by_taxon.png",bbox_inches="tight")
print("PNG → scatter_generation_by_taxon.png")
