// AI 교차검증 패키지 — 다른 AI 한테 던지면 한 번에 검증 가능한 단일 파일 생성
// 출력: data/export/verification-package.md (수식 + 검증 가이드 + 데이터 일부)
//      data/export/verification-data.json (전체 종 슬림 데이터)
import fs from "fs";
import path from "path";
import { getDb } from "../lib/db";

const OUT = path.join(process.cwd(), "data", "export");
fs.mkdirSync(OUT, { recursive: true });

const db = getDb();

// 슬림 데이터 — 검증 핵심 필드만
const rows = db
  .prepare(
    `SELECT s.id, s.scientific_name, s.common_name_en, s.common_name_ko,
            s.category, s.class_name, s.mature_individuals, s.population_trend,
            s.extinction_year, s.extinction_cause,
            t.consensus_score, t.intervention_tier, t.deadline_days, t.extinction_days
     FROM species s LEFT JOIN tipping_points t ON t.species_id = s.id
     ORDER BY s.category, s.id`
  )
  .all() as Array<{
  id: string;
  scientific_name: string;
  common_name_en: string | null;
  common_name_ko: string | null;
  category: string;
  class_name: string | null;
  mature_individuals: number | null;
  population_trend: string | null;
  extinction_year: number | null;
  extinction_cause: string | null;
  consensus_score: number | null;
  intervention_tier: string | null;
  deadline_days: number | null;
  extinction_days: number | null;
}>;

const slim = rows.map((r) => ({
  id: r.id,
  sci: r.scientific_name,
  en: r.common_name_en,
  ko: r.common_name_ko,
  cat: r.category,
  cls: r.class_name,
  N0: r.mature_individuals,
  trend: r.population_trend,
  ext_year: r.extinction_year,
  tier: r.intervention_tier,
  score: r.consensus_score,
  deadline_days: r.deadline_days,
  extinction_days: r.extinction_days,
}));

fs.writeFileSync(path.join(OUT, "verification-data.json"), JSON.stringify(slim, null, 0), "utf-8");

// 통계
const total = rows.length;
const byCat = rows.reduce<Record<string, number>>((acc, r) => {
  acc[r.category] = (acc[r.category] ?? 0) + 1;
  return acc;
}, {});
const byTier = rows.reduce<Record<string, number>>((acc, r) => {
  if (r.intervention_tier) acc[r.intervention_tier] = (acc[r.intervention_tier] ?? 0) + 1;
  return acc;
}, {});

// 시급도 TOP 20
const top20 = rows
  .filter((r) => r.deadline_days != null && r.intervention_tier !== "EX")
  .sort((a, b) => (a.deadline_days ?? 999999) - (b.deadline_days ?? 999999))
  .slice(0, 20);

const topTable = top20
  .map(
    (r, i) =>
      `| ${i + 1} | \`${r.id}\` | ${r.common_name_ko ?? r.scientific_name} | *${r.scientific_name}* | ${r.category} | ${r.intervention_tier} | ${r.consensus_score?.toFixed(1)} | ${r.mature_individuals ?? "—"} | ${r.deadline_days}일 |`
  )
  .join("\n");

const md = `# LastWatch — AI 교차검증 패키지

> **이 문서를 다른 AI(Claude/GPT/Gemini 등)에게 그대로 붙여넣고 첨부 \`verification-data.json\` 과 함께 검증을 요청하세요.**

---

## 📋 검증 요청 프롬프트 (다른 AI에 붙여넣기)

\`\`\`
첨부된 verification-data.json (총 ${total.toLocaleString()}종)과 본 문서의 알고리즘 명세를 바탕으로,
LastWatch 시스템의 임계점 산출 결과를 검증해주세요.

검증 항목:
1. 학명(sci) 표기가 IUCN Red List 와 일치하는지
2. IUCN 등급(cat)이 최신 평가와 맞는지
3. 한글명(ko)이 자연스럽고 정확한지
4. 임계점 점수(score) + Tier(tier) + 마감일(deadline_days)이
   해당 종의 실제 보전상태와 합리적으로 매칭되는지
5. 본 문서의 알고리즘 (Step 1-7) 이 학술적으로 타당한지

명백한 오류만 ID와 이유를 표로 작성. 추측 제외.
\`\`\`

---

## 🔬 알고리즘 명세 (특허 출원 v2 기준)

본 시스템은 **3-Layer Hybrid Engine**으로 동작합니다. 각 레이어는 독립적이며,
합의 보정(Generate-then-Verify)을 거쳐 종합 위기점수와 4-tuple 임계점 일자를 산출합니다.

### Step 1 — Layer 1: EWS (Statistical Early Warning Signals)

**목적**: 시계열 개체수의 통계적 조기경보 신호 추출 — Critical Slowing Down 탐지.

**Reference**: Drake & Griffen (2010) Nature 467:456 / Dakos et al. (2012) PLoS ONE 7:e41010

\`\`\`
주어진 시계열 N(t)에 대해:

1. Detrending: residual(t) = N(t) - smooth(N, σ = max(5, len*0.1))
2. Rolling window 통계 (window = len * 0.5):
   AR1(t)        = Cov(r[t], r[t-1]) / Var(r)
   Variance(t)   = Var(r in window)
   Skewness(t)   = E[(r-μ)³] / σ³
   Kurtosis(t)   = E[(r-μ)⁴] / σ⁴ - 3
   ReturnRate(t) = 1 - AR1(t)
3. Kendall's τ 단조성 검정 (각 통계량의 시간 추세):
   τ = (concordant - discordant) / (n*(n-1)/2)
4. EWS 합성 점수:
   ews_raw = 0.30·τ(AR1) + 0.25·τ(Var) + 0.20·τ(Skew)
           + 0.10·τ(Kurt) - 0.10·τ(ReturnRate)
   ews_score = sigmoid(2 · ews_raw) · 100  (0~100)
\`\`\`

**현재 구현 한계**: 시계열 부재 → confidence 0.25, 약한 신호로만 반영.

### Step 2 — Layer 2: PVA (Population Viability Analysis)

**목적**: 확률적 개체군 동태 시뮬레이션으로 멸종확률 산출.

**Reference**: Beissinger & McCullough (2002) U Chicago Press / Lacy (1993) Wildlife Research 20:45

\`\`\`
parameters: N₀, K, r, λ_mean, λ_sd, T=100, n_sim=1500

for sim in 1..n_sim:
    N = N₀
    for t in 1..T:
        λ_env ~ LogNormal(log(λ_mean), λ_sd)         # 환경 확률성
        expected = N · λ_env · exp(r·(1 - N/K))      # Ricker dynamics
        N = Poisson(expected)                         # 인구 확률성
        if N < N_allee: N = N · (N/N_allee)          # Allee 효과
        if N < N_qext (=2): mark extinct, break

P_ext_50yr  = #extinct(t≤50)  / n_sim
P_ext_100yr = #extinct(t≤100) / n_sim
median_T_ext = median(extinction_times)

pva_raw = 0.45·P_ext_50yr + 0.35·P_ext_100yr + 0.20·(1 - min(N₀/MVP, 1))
pva_score = pva_raw · 100  (0~100)
\`\`\`

### Step 3 — Layer 3: IUCN + Genetic Threshold

**목적**: 정적 임계값으로 즉시 위험 평가 — IUCN Criterion D + 50/500 Rule.

**Reference**: Frankham et al. (2014) Biol Conservation 170:56 / IUCN Red List v3.1 (2012)

\`\`\`
Ne = Nc · (Ne/Nc ratio, default 0.15)

50/500 Rule:
  Ne < 50    → genetic_score = 95  (CRITICAL)
  Ne < 100   → 80                  (ENDANGERED 단기)
  Ne < 500   → 55                  (VULNERABLE)
  Ne < 1000  → 30                  (NEAR_THREAT 장기)
  Ne ≥ 1000  → 10                  (SAFE)

IUCN Criterion D (절대 임계값):
  Nc < 50    → 90 (CR)
  Nc < 250   → 70 (EN)
  Nc < 1000  → 45 (VU)
  Nc ≥ 1000  → 5

Category-based: CR=90 EN=70 VU=50 NT=30 LC=10 EX/EW=100

iucn_score = MAX(genetic_score, criterion_D, category_score)
\`\`\`

### Step 4 — Consensus 보정 (Generate-then-Verify)

**핵심 신규성**: 가중 평균에 다수결(2-of-3) 검증을 결합해 단일 레이어 거짓양성 차단.

\`\`\`
weights = { ews: 0.20, pva: 0.50, iucn: 0.30 }
raw = Σ wᵢ · scoreᵢ

high_alerts = #{i : scoreᵢ > thresholdᵢ}
  thresholds = { ews: 70, pva: 50, iucn: 60 }

if high_alerts ≥ 2:    consensus = raw, confidence = 0.95
elif high_alerts == 1: consensus = raw · 0.85, confidence = 0.7
elif high_alerts == 0: consensus = raw · 0.6,  confidence = 0.5

primary_signal = argmax(wᵢ · scoreᵢ)  # XAI 라벨
\`\`\`

### Step 5 — Bottleneck Floor 보정

**목적**: PVA 가 r=0(안정)일 때 작은 개체수 종을 과소평가하는 한계 보정.

\`\`\`
if N₀ known:
  N₀ < 50    → consensus = max(consensus, 90)  # T4 floor
  N₀ < 100   → max(_, 78)                      # T3 floor
  N₀ < 250   → max(_, 70)
  N₀ < 500   → max(_, 60)
  CR + N₀ < 2500 → max(_, 50)

trend bonus:
  '급감' → +8
  CR/EN '감소' → +4
\`\`\`

### Step 6 — Tier 변환

\`\`\`
T0 (안정):     0 ≤ score < 20
T1 (주의):    20 ≤ score < 40
T2 (경계):    40 ≤ score < 60
T3 (위급):    60 ≤ score < 80
T4 (임박):    80 ≤ score ≤ 100
\`\`\`

### Step 7 — 4-Tuple 임계점 일자 역산 (발명 핵심)

**핵심 신규성**: 단일 PVA trajectory 로부터 복수 임계값에 대한 일자를 동시 역산.

\`\`\`
trajMean = mean of n_sim trajectories  # shape (T+1,)
trajP10  = 10th percentile of trajectories per year

# 각 비율에 도달하는 연도 (선형 보간):
t(ratio) = first t where trajMean[t] ≤ N₀·ratio,
            interpolate between t-1 and t

intervention_open_date     = today
intervention_deadline_date = today + t(0.4)·365.25일   # T3 임계
golden_hour_entry_date     = today + t(0.15)·365.25일  # T4 임계
extinction_estimate_date   = today + t_p10_qext·365.25일

# t_p10_qext = first t where trajP10[t] < N_qext (=2), 선형 보간
\`\`\`

**시드(seed)**: 종 ID 의 FNV-1a 32-bit 해시로 결정적 PRNG 생성. 종마다 다른 분수년 결과 보장.

---

## 📊 데이터셋 요약

- **총 종 수**: ${total.toLocaleString()}
- **카테고리 분포**: ${Object.entries(byCat).map(([k, v]) => `${k}=${v.toLocaleString()}`).join(", ")}
- **Tier 분포**: ${Object.entries(byTier).map(([k, v]) => `${k}=${v.toLocaleString()}`).join(", ")}
- **데이터 출처**: IUCN Red List v3.1 + Wikidata SPARQL (P141 IUCN status) + 큐레이션 ${rows.filter((r) => !r.id.startsWith("wd-")).length}종

---

## 🔝 시급도 TOP 20 (검증 우선순위)

| 순위 | ID | 한글명 | 학명 | IUCN | Tier | Score | N₀ | 마감 |
|---|---|---|---|---|---|---|---|---|
${topTable}

**검증 포인트**: 위 TOP 종들이 실제 보전생물학에서 가장 위급으로 알려진 종들과 일치하는지 (예: 바키타돌고래 #1, 동부저지대고릴라, 자바코뿔소 등).

---

## 🎯 알려진 한계 (사전 공지)

1. **mature_individuals (N₀)** 가 NULL 인 wd-* 종은 카테고리 기반 fallback (CR=200, EN=1500, VU=5000) 사용. → bottleneck floor 미적용. 신뢰도 0.4 capped.
2. **시계열 데이터 부재** → EWS 레이어가 r(추세) 만으로 약한 신호. 확률 0.25.
3. **사진 / 분류군 / 서식지** — Wikidata 한계로 wd-* 종 다수 누락.
4. **번역**: 38,096/${total.toLocaleString()}종 한국어 보유 (Claude Haiku 4.5 음차).

---

## 📜 학술 출처

1. Drake, J.M. & Griffen, B.D. (2010). *Nature* **467**: 456-459.
2. Frankham, R., Bradshaw, C.J.A. & Brook, B.W. (2014). *Biological Conservation* **170**: 56-63.
3. Beissinger, S.R. & McCullough, D.R. (2002). *Population Viability Analysis*. U Chicago Press.
4. Lacy, R.C. (1993). *Wildlife Research* **20**: 45-65.
5. IUCN (2012). *IUCN Red List Categories and Criteria*: Version 3.1.
6. Scheffer, M. et al. (2009). *Nature* **461**: 53-59.
7. Dakos, V. et al. (2012). *PLoS ONE* **7**: e41010.
`;

fs.writeFileSync(path.join(OUT, "verification-package.md"), md, "utf-8");

console.log("✓ AI 검증 패키지 생성:");
console.log(`  ${path.join(OUT, "verification-package.md")} (${Math.round(md.length / 1024)} KB)`);
console.log(`  ${path.join(OUT, "verification-data.json")} (${rows.length.toLocaleString()} 종)`);
