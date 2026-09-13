#!/usr/bin/env python3
"""Step 4: 확대 표본(n≈204) IUCN 등급 vs 체중 통계 재분석.
CSV·산점도·통계 산출. read-only(DB 조회만), 결과물은 research/ 에 저장."""
import sqlite3, os, csv
import numpy as np, pandas as pd
from scipy import stats
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
matplotlib.rcParams["font.family"]="AppleGothic"      # macOS 한글 폰트
matplotlib.rcParams["axes.unicode_minus"]=False

ROOT="/Users/huhyul0524/Desktop/last-watch"
DB=os.path.join(ROOT,"data/species.db")
CSV=os.path.join(ROOT,"research/data/dataset_iucn_score_vs_mass_v2.csv")
PNG=os.path.join(ROOT,"research/results/scatter_iucn_vs_mass_v2.png")
os.makedirs(os.path.dirname(CSV),exist_ok=True); os.makedirs(os.path.dirname(PNG),exist_ok=True)

RLI={"LC":0,"NT":1,"VU":2,"EN":3,"CR":4,"EW":5,"EX":5}
con=sqlite3.connect(DB)
rows=con.execute("""
SELECT scientific_name, class_name, mass_g, mass_g_external, mass_g_external_source,
       iucn_category, mature_individuals, iucn_population_size
FROM species
WHERE is_curated=1 AND iucn_population_trend IS NOT NULL
  AND iucn_category IN ('LC','NT','VU','EN','CR')
  AND (mature_individuals IS NOT NULL OR iucn_population_size IS NOT NULL)
  AND (mass_g IS NOT NULL OR mass_g_external IS NOT NULL)
""").fetchall()
con.close()

recs=[]
for sci,cls,mg,mge,mgesrc,cat,mat,ips in rows:
    mass=mg if mg is not None else mge
    if mg is not None: msrc="PHYLACINE"
    elif mgesrc and "AVONET" in mgesrc: msrc="AVONET"
    elif mgesrc and "PHYLACINE" in mgesrc: msrc="PHYLACINE(backfill)"
    else: msrc="기타"
    taxon="조류" if msrc=="AVONET" else "포유류"   # 소스기반 정확 분류(class_name 오류 회피)
    pop=mat if (mat and mat>0) else ips
    psrc="mature_individuals" if (mat and mat>0) else "iucn_population_size"
    recs.append(dict(scientific_name=sci, class_name=taxon, mass_effective=mass,
        mass_source=msrc, log_mass_g=np.log10(mass), iucn_category=cat,
        iucn_score=RLI[cat], measured_population=pop, population_source=psrc))
df=pd.DataFrame(recs)
df.to_csv(CSV,index=False)

n=len(df)
print(f"=== n = {n} ===")
print("등급 분포:", df["iucn_category"].value_counts().reindex(["LC","NT","VU","EN","CR"]).to_dict())
print("분류군 분포:", df["class_name"].value_counts().to_dict())
print("소스 분포:", df["mass_source"].value_counts().to_dict())
print(f"log_mass: 평균 {df.log_mass_g.mean():.3f} SD {df.log_mass_g.std():.3f} 범위 [{df.log_mass_g.min():.2f}, {df.log_mass_g.max():.2f}]")

x=df.log_mass_g.values; y=df.iucn_score.values.astype(float)
pr=stats.pearsonr(x,y); sr=stats.spearmanr(x,y)
ci=pr.confidence_interval(0.95)
r=pr.statistic; p=pr.pvalue; R2=r**2
print(f"\nPearson r={r:.4f}, p={p:.3e}, 95%CI=[{ci.low:.4f},{ci.high:.4f}], R²={R2:.4f} ({R2*100:.1f}%)")
print(f"Spearman ρ={sr.statistic:.4f}, p={sr.pvalue:.3e}")
print(f"유의성(α=0.05): {'유의(가설 지지)' if p<0.05 and r>0 else '유의하지 않음' if p>=0.05 else '유의하나 방향 반대'}")

# 산점도
fig,ax=plt.subplots(figsize=(8,6),dpi=150)
colors={"포유류":"#1f77b4","조류":"#ff7f0e"}
for t,g in df.groupby("class_name"):
    ax.scatter(g.log_mass_g, g.iucn_score+np.random.default_rng(1).normal(0,0.05,len(g)),
        s=28, alpha=0.6, label=f"{t} (n={len(g)})", color=colors.get(t,"#888"), edgecolors="none")
b,a=np.polyfit(x,y,1)
xs=np.array([x.min(),x.max()]); ax.plot(xs,a+b*xs,color="#d62728",lw=2,label=f"회귀선 (r={r:.3f})")
ax.set_xlabel("log10(성체 체중, g)"); ax.set_ylabel("IUCN RLI 점수 (LC=0 … CR=4)")
ax.set_yticks([0,1,2,3,4]); ax.set_yticklabels(["LC(0)","NT(1)","VU(2)","EN(3)","CR(4)"])
ax.set_title(f"IUCN 등급 vs 체중 (n={n}, 포유류·조류)")
ax.grid(True,alpha=0.25); ax.legend(loc="upper left",fontsize=9)
ax.text(0.98,0.03,f"Pearson r={r:.3f}, p={p:.2e}\nSpearman ρ={sr.statistic:.3f}\nR²={R2:.3f}",
    transform=ax.transAxes,ha="right",va="bottom",fontsize=9,
    bbox=dict(boxstyle="round",fc="white",ec="#ccc"))
plt.tight_layout(); plt.savefig(PNG); print(f"\nCSV → {CSV}\nPNG → {PNG}")
