#!/usr/bin/env python3
"""포유류 148종만 IUCN 등급 vs 체중 재분석."""
import os
import numpy as np, pandas as pd
from scipy import stats
import matplotlib
matplotlib.use("Agg"); import matplotlib.pyplot as plt
matplotlib.rcParams["font.family"]="AppleGothic"; matplotlib.rcParams["axes.unicode_minus"]=False

ROOT="/Users/huhyul0524/Desktop/last-watch"
df=pd.read_csv(os.path.join(ROOT,"research/data/dataset_iucn_score_vs_mass_v2.csv"))
m=df[df["class_name"]=="포유류"].copy()
n=len(m)
x=m.log_mass_g.values; y=m.iucn_score.values.astype(float)
pr=stats.pearsonr(x,y); sr=stats.spearmanr(x,y); ci=pr.confidence_interval(0.95)
r=pr.statistic; p=pr.pvalue; R2=r**2
print(f"=== 포유류 n={n} ===")
print(f"등급: {m['iucn_category'].value_counts().reindex(['LC','NT','VU','EN','CR']).to_dict()}")
print(f"Pearson r={r:.4f}, p={p:.4e}, 95%CI=[{ci.low:.4f},{ci.high:.4f}], R²={R2:.4f}")
print(f"Spearman ρ={sr.statistic:.4f}, p={sr.pvalue:.4e}")
print(f"방향: {'양(+)' if r>0 else '음(−)'} · 유의(α=0.05): {'예' if p<0.05 else '아니오'}")

CATCOL={"LC":"#60C659","NT":"#CCE226","VU":"#F9E814","EN":"#FC7F3F","CR":"#D81E05"}
fig,ax=plt.subplots(figsize=(9,6.5),dpi=150)
rng=np.random.default_rng(1)
for cat in ["LC","NT","VU","EN","CR"]:
    g=m[m.iucn_category==cat]
    if len(g)==0: continue
    ax.scatter(g.log_mass_g, g.iucn_score+rng.normal(0,0.05,len(g)),
        s=34, alpha=0.7, color=CATCOL[cat], label=f"{cat} (n={len(g)})", edgecolors="none")
b,a=np.polyfit(x,y,1); xs=np.array([x.min(),x.max()])
ax.plot(xs,a+b*xs,color="#d62728",lw=2,ls="-",label=f"회귀선 (r={r:.3f})")
ax.set_xlabel("log10(성체 체중, g)"); ax.set_ylabel("IUCN RLI 점수")
ax.set_yticks([0,1,2,3,4]); ax.set_yticklabels(["LC(0)","NT(1)","VU(2)","EN(3)","CR(4)"])
ax.set_title(f"IUCN 등급 vs 체중 (포유류 n={n})")
ax.grid(True,alpha=0.25); ax.legend(loc="center left",fontsize=8)
ax.text(0.98,0.03,f"Pearson r={r:.3f}, p={p:.2e}\nSpearman ρ={sr.statistic:.3f}\nR²={R2:.3f}",
    transform=ax.transAxes,ha="right",va="bottom",fontsize=9,
    bbox=dict(boxstyle="round",fc="white",ec="#ccc"))
out=os.path.join(ROOT,"research/results/scatter_iucn_vs_mass_mammals.png")
plt.tight_layout(); plt.savefig(out); print(f"PNG → {out}")
