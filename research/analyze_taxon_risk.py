#!/usr/bin/env python3
"""Step 2·3: 분류군별 IUCN 위험점수 분포 (집계·박스플롯). read-only.

오늘 범위: 그림·평균만. 순위 판정·해석은 다음 세션.
Y = RLI 위험점수 (LC=0·NT=1·VU=2·EN=3·CR=4·EW=5·EX=5). RE 제외(지역절멸).
X = IUCN class 를 한글 대분류로 그룹핑.
"""
import os, sqlite3
import numpy as np, pandas as pd
import matplotlib
matplotlib.use("Agg"); import matplotlib.pyplot as plt
matplotlib.rcParams["font.family"]="AppleGothic"; matplotlib.rcParams["axes.unicode_minus"]=False

ROOT="/Users/huhyul0524/Desktop/last-watch"
DB=os.path.join(ROOT,"data/species.db")
CSV=os.path.join(ROOT,"research/data/dataset_taxon_risk.csv")
PNG=os.path.join(ROOT,"research/results/boxplot_taxon_risk.png")

RLI={"LC":0,"NT":1,"VU":2,"EN":3,"CR":4,"EW":5,"EX":5}   # RE 제외

# IUCN class(대문자) → 한글 대분류
GROUP={
 "MAMMALIA":"포유류","AVES":"조류","REPTILIA":"파충류","AMPHIBIA":"양서류",
 "ACTINOPTERYGII":"어류","CHONDRICHTHYES":"어류","PETROMYZONTI":"어류","MYXINI":"어류",
 "GASTROPODA":"무척추","INSECTA":"무척추","BIVALVIA":"무척추","MALACOSTRACA":"무척추",
 "ANTHOZOA":"무척추","ARACHNIDA":"무척추","CLITELLATA":"무척추","MAXILLOPODA":"무척추",
 "HEXANAUPLIA":"무척추","MEROSTOMATA":"무척추",
 "MAGNOLIOPSIDA":"식물","LILIOPSIDA":"식물","PINOPSIDA":"식물","CYCADOPSIDA":"식물",
 "POLYPODIOPSIDA":"식물","BRYOPSIDA":"식물","TAKAKIOPSIDA":"식물","JUNGERMANNIOPSIDA":"식물",
 "ANTHOCEROTOPSIDA":"식물","LYCOPODIOPSIDA":"식물","GNETOPSIDA":"식물",
 "FLORIDEOPHYCEAE":"조류·균류","AGARICOMYCETES":"조류·균류","LECANOROMYCETES":"조류·균류",
}

con=sqlite3.connect(DB)
df=pd.read_sql_query("""
SELECT scientific_name, iucn_class, iucn_category
FROM species
WHERE is_curated=1 AND iucn_class IS NOT NULL
  AND iucn_category IN ('LC','NT','VU','EN','CR','EW','EX')
""", con); con.close()

df["iucn_score"]=df.iucn_category.map(RLI)
df["taxon_group"]=df.iucn_class.map(lambda c: GROUP.get(c,"기타"))

# CSV 저장 (계획 컬럼 + taxon_group)
df[["scientific_name","iucn_class","taxon_group","iucn_category","iucn_score"]].to_csv(CSV,index=False)
print(f"CSV → {CSV}  (총 {len(df)}종)")

# 박스플롯 대상: n>=10 인 대분류만 (그 외 소수 그룹 로그로 명시)
counts=df.taxon_group.value_counts()
ORDER=["포유류","조류","파충류","양서류","어류","무척추","식물"]   # 중립 순서(순위 아님)
show=[g for g in ORDER if counts.get(g,0)>=10]
dropped={g:int(counts[g]) for g in counts.index if g not in show}
print("포함 그룹(n>=10):", {g:int(counts[g]) for g in show})
if dropped: print("제외(소수/기타):", dropped)

# 집계표 (평균·중앙값)
print("\n=== 분류군별 위험점수 요약 (오늘: 집계만) ===")
print(f"{'분류군':8s} {'n':>5s} {'평균':>6s} {'중앙값':>6s} {'Q1':>4s} {'Q3':>4s}")
rows=[]
for g in show:
    v=df[df.taxon_group==g].iucn_score.values.astype(float)
    q1,med,q3=np.percentile(v,[25,50,75])
    print(f"{g:8s} {len(v):5d} {v.mean():6.2f} {med:6.1f} {q1:4.1f} {q3:4.1f}")
    rows.append((g,v))

# ---------- 박스플롯 ----------
GCOL={"포유류":"#4C72B0","조류":"#DD8452","파충류":"#55A868","양서류":"#8172B3",
      "어류":"#64B5CD","무척추":"#937860","식물":"#8C8C00"}
fig,ax=plt.subplots(figsize=(11,6.5),dpi=150)
data=[v for _,v in rows]; labels=[g for g,_ in rows]
rng=np.random.default_rng(7)
bp=ax.boxplot(data, patch_artist=True, widths=0.55, showmeans=True,
    meanprops=dict(marker="D",markerfacecolor="white",markeredgecolor="black",markersize=7,zorder=5),
    medianprops=dict(color="black",lw=2),
    flierprops=dict(marker="",alpha=0),   # 개별 이상치 점은 생략(지터로 대체)
    whiskerprops=dict(color="#555"), capprops=dict(color="#555"))
for patch,g in zip(bp["boxes"],labels):
    patch.set_facecolor(GCOL.get(g,"#999")); patch.set_alpha(0.55); patch.set_edgecolor("#333")
# 지터 산점 (실제 분포 감각)
for i,(g,v) in enumerate(rows,1):
    x=rng.normal(i,0.06,len(v))
    ax.scatter(x, v+rng.normal(0,0.06,len(v)), s=8, color=GCOL.get(g,"#999"),
               alpha=0.25, edgecolors="none", zorder=1)
ax.set_xticks(range(1,len(labels)+1))
ax.set_xticklabels([f"{g}\n(n={len(v)})" for g,v in rows], fontsize=11)
ax.set_ylabel("IUCN 위험점수 (RLI 가중치)")
ax.set_yticks([0,1,2,3,4,5])
ax.set_yticklabels(["LC(0)","NT(1)","VU(2)","EN(3)","CR(4)","EW·EX(5)"])
ax.set_ylim(-0.5,5.6)
ax.set_title("분류군별 IUCN 위험점수 분포  (◇ = 평균, ─ = 중앙값)")
ax.grid(True,axis="y",alpha=0.25)
ax.text(0.995,-0.14,"※ 순위 판정·해석은 다음 세션 · 상자=IQR(Q1~Q3), 수염=1.5×IQR",
    transform=ax.transAxes,ha="right",va="top",fontsize=8.5,color="#666")
plt.tight_layout(); plt.savefig(PNG,bbox_inches="tight"); print(f"\nPNG → {PNG}")
