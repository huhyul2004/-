// 완전판 검증 패키지 — 38K 종 모든 필드 + 알고리즘 명세 + 임계점 4-tuple 일자 모두 포함
// AI 한 번에 전체 검증 가능. 빠짐없이.
import fs from "fs";
import path from "path";
import { getDb } from "../lib/db";

const OUT = path.join(process.cwd(), "data", "export");
fs.mkdirSync(OUT, { recursive: true });

interface FullRow {
  // species 기본
  id: string;
  scientific_name: string;
  common_name_en: string | null;
  common_name_ko: string | null;
  category: string;
  class_name: string | null;
  family: string | null;
  region: string | null;
  population_trend: string | null;
  mature_individuals: number | null;
  summary_ko: string | null;
  photo_url: string | null;
  wikipedia_title: string | null;
  extinction_year: number | null;
  extinction_cause: string | null;

  // tipping point 결과
  consensus_score: number | null;
  intervention_tier: string | null;
  deadline_days: number | null;        // D-day = N₀×0.4 도달 시점
  extinction_days: number | null;       // p10 비관 시나리오 멸종 일자
  intervention_open_date: string | null;
  intervention_deadline_date: string | null;
  golden_window_date: string | null;
  extinction_estimate_date: string | null;

  // layer 점수
  ews_score: number | null;
  pva_score: number | null;
  iucn_score: number | null;
  P_ext_50yr: number | null;
  P_ext_100yr: number | null;
  Ne: number | null;
  genetic_status: string | null;
  confidence: number | null;
  primary_driver: string | null;
}

const db = getDb();

console.log("쿼리 시작...");
const rows = db
  .prepare(
    `SELECT s.*, t.consensus_score, t.intervention_tier, t.deadline_days, t.extinction_days, t.payload_json
     FROM species s LEFT JOIN tipping_points t ON t.species_id = s.id
     ORDER BY
       COALESCE(t.deadline_days, 999999) ASC,
       CASE t.intervention_tier WHEN 'T4' THEN 5 WHEN 'T3' THEN 4 WHEN 'T2' THEN 3 WHEN 'T1' THEN 2 WHEN 'T0' THEN 1 ELSE 0 END DESC,
       s.scientific_name COLLATE NOCASE`
  )
  .all() as Array<{
  id: string;
  scientific_name: string;
  common_name_en: string | null;
  common_name_ko: string | null;
  category: string;
  class_name: string | null;
  family: string | null;
  region: string | null;
  population_trend: string | null;
  mature_individuals: number | null;
  summary_ko: string | null;
  photo_url: string | null;
  wikipedia_title: string | null;
  extinction_year: number | null;
  extinction_cause: string | null;
  consensus_score: number | null;
  intervention_tier: string | null;
  deadline_days: number | null;
  extinction_days: number | null;
  payload_json: string | null;
}>;

console.log(`쿼리 완료: ${rows.length} 종`);

// payload_json 에서 layer 점수 + 4-tuple 일자 추출
const full: FullRow[] = rows.map((r, i) => {
  let payload: {
    layer_scores?: {
      ews?: { score: number };
      pva?: { score: number; P_ext_50yr: number; P_ext_100yr: number };
      iucn?: { score: number; Ne: number; genetic_status: string };
    };
    dates?: {
      intervention_open_date: string;
      intervention_deadline_date: string;
      golden_window_date: string | null;
      extinction_estimate_date: string | null;
    };
    confidence?: number;
    primary_driver?: string;
  } = {};
  if (r.payload_json) {
    try {
      payload = JSON.parse(r.payload_json);
    } catch {
      // ignore
    }
  }

  if ((i + 1) % 5000 === 0) console.log(`  ${i + 1}/${rows.length} 처리 중...`);

  return {
    id: r.id,
    scientific_name: r.scientific_name,
    common_name_en: r.common_name_en,
    common_name_ko: r.common_name_ko,
    category: r.category,
    class_name: r.class_name,
    family: r.family,
    region: r.region,
    population_trend: r.population_trend,
    mature_individuals: r.mature_individuals,
    summary_ko: r.summary_ko,
    photo_url: r.photo_url,
    wikipedia_title: r.wikipedia_title,
    extinction_year: r.extinction_year,
    extinction_cause: r.extinction_cause,

    consensus_score: r.consensus_score,
    intervention_tier: r.intervention_tier,
    deadline_days: r.deadline_days,
    extinction_days: r.extinction_days,
    intervention_open_date: payload.dates?.intervention_open_date ?? null,
    intervention_deadline_date: payload.dates?.intervention_deadline_date ?? null,
    golden_window_date: payload.dates?.golden_window_date ?? null,
    extinction_estimate_date: payload.dates?.extinction_estimate_date ?? null,

    ews_score: payload.layer_scores?.ews?.score ?? null,
    pva_score: payload.layer_scores?.pva?.score ?? null,
    iucn_score: payload.layer_scores?.iucn?.score ?? null,
    P_ext_50yr: payload.layer_scores?.pva?.P_ext_50yr ?? null,
    P_ext_100yr: payload.layer_scores?.pva?.P_ext_100yr ?? null,
    Ne: payload.layer_scores?.iucn?.Ne ?? null,
    genetic_status: payload.layer_scores?.iucn?.genetic_status ?? null,
    confidence: payload.confidence ?? null,
    primary_driver: payload.primary_driver ?? null,
  };
});

// 카테고리별 통계
const byCategory: Record<string, number> = {};
const byTier: Record<string, number> = {};
for (const r of full) {
  byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
  if (r.intervention_tier) byTier[r.intervention_tier] = (byTier[r.intervention_tier] ?? 0) + 1;
}

const meta = {
  generated_at: new Date().toISOString(),
  total_species: full.length,
  by_category: byCategory,
  by_tier: byTier,
  algorithm_version: "v3 (2026-05-06)",
  spec_source: "사용자 참조 계산식 100% (Drake 2010, Beissinger 2002, Frankham 2014)",
  algorithm: {
    layer1_ews: {
      formula: "ews_score = sigmoid(0.5·τ_AR1 + 0.3·τ_Var + 0.2·τ_Skew) · 100",
      reference: "Drake & Griffen (2010) Nature 467:456 — Critical Slowing Down",
      indicators: ["Lag-1 autocorrelation", "Rolling variance", "Rolling |skewness|"],
      weights: { tau_ar1: 0.5, tau_var: 0.3, tau_skew: 0.2 },
      timeseries_absent_fallback: "r 부호로 τ 추정",
    },
    layer2_pva: {
      reference: "Beissinger & McCullough (2002) PVA, U Chicago Press",
      n_sim: 1500,
      T: 100,
      pseudocode: [
        "for sim in 1..n_sim:",
        "  N = N₀",
        "  for t in 1..T:",
        "    lam = Normal(lambda_mean, lambda_sd)  # 환경 확률성",
        "    N = Poisson(N · lam)                   # 인구 확률성",
        "    N = N · exp(r · (1 - N/K))             # Ricker 밀도의존",
        "    if N < N_allee: N = N · (N/N_allee)    # Allee 효과",
        "    if N < 2: extinction at t, break",
      ],
      output: "P_ext_50yr, P_ext_100yr, median_T_ext, MVP_estimate",
    },
    layer3_iucn: {
      reference: "Frankham et al. (2014) Biol Conservation 170:56 — 50/500 Rule",
      formula: "Ne = Nc × (Ne/Nc ratio, default 0.15)",
      thresholds: {
        Ne_lt_50: { status: "CRITICAL", score: 95 },
        Ne_lt_100: { status: "ENDANGERED", score: 80 },
        Ne_lt_500: { status: "VULNERABLE", score: 55 },
        Ne_lt_1000: { status: "NEAR_THREAT", score: 30 },
        Ne_ge_1000: { status: "SAFE", score: 10 },
      },
      criterion_D: { Nc_lt_50: 90, Nc_lt_250: 70, Nc_lt_1000: 45 },
      category_score: { CR: 90, EN: 70, VU: 50, NT: 30, LC: 10, EX: 100, EW: 100 },
    },
    layer4_consensus: {
      formula: "score = 0.30·EWS + 0.45·PVA + 0.25·IUCN",
      weights: { ews: 0.3, pva: 0.45, iucn: 0.25 },
      generate_then_verify: {
        thresholds: { ews: 70, pva: 50, iucn: 60 },
        adjustment: {
          high_alerts_ge_2: { multiplier: 1.0, confidence: 0.95 },
          high_alerts_eq_1: { multiplier: 0.85, confidence: 0.7 },
          high_alerts_eq_0: { multiplier: 0.6, confidence: 0.5 },
        },
      },
    },
    layer5_bottleneck_floor: {
      description: "절대 개체수 기반 강제 보정 (PVA 가 안정 추세 때 작은 N₀ 과소평가 방지)",
      thresholds: {
        N_lt_50: 90,
        N_lt_100: 78,
        N_lt_250: 70,
        N_lt_500: 60,
        CR_N_lt_2500: 60,
        CR_default: 50,
      },
      trend_bonus: { 급감: 8, "CR/EN 감소": 4, 증가: -10, 안정: 0 },
    },
    layer6_tier: {
      T0: "0 ≤ score < 20 (Low risk)",
      T1: "20 ≤ score < 40 (Monitoring)",
      T2: "40 ≤ score < 60 (Medium)",
      T3: "60 ≤ score < 80 (Urgent)",
      T4: "80 ≤ score ≤ 100 (Immediate)",
    },
    layer7_4tuple: {
      description: "단일 PVA trajectory 로부터 복수 임계값 도달 일자 동시 역산",
      intervention_open_date: "today (현재 시점)",
      intervention_deadline_date: "today + t(N₀×0.4) · 365.25일 — D-day",
      golden_window_date: "today + t(N₀×0.15) · 365.25일 — T4 진입",
      extinction_estimate_date: "today + t_p10_qext · 365.25일 — p10 비관 멸종",
      species_jitter: "FNV-1a 해시 기반 ±0.9년 (mature_individuals=NULL 인 종에만 적용)",
      time_consistency: "deadline ≤ golden ≤ extinction 강제",
    },
    sort_rule: {
      primary: "D-day 오름차순 (작은 숫자 = 1위)",
      secondary: "D-day 동률 → T-level 높은 순 (T4 > T3 > T2 > T1 > T0)",
      tertiary: "학명 알파벳 순",
    },
  },
};

// 단일 파일 — 거대하지만 빠짐없이
const completePath = path.join(OUT, "verification-complete.json");
fs.writeFileSync(
  completePath,
  JSON.stringify({ meta, species: full }, null, 2),
  "utf-8"
);
const sizeKB = Math.round(fs.statSync(completePath).size / 1024);
console.log(`✓ 단일 파일 → ${completePath} (${sizeKB} KB)`);

// 추가: 카테고리별로도 분리 (필요시)
for (const cat of ["CR", "EN", "VU", "EX", "EW"]) {
  const subset = full.filter((r) => r.category === cat);
  const p = path.join(OUT, `verification-complete-${cat.toLowerCase()}.json`);
  fs.writeFileSync(p, JSON.stringify({ meta, species: subset }, null, 2), "utf-8");
  const kb = Math.round(fs.statSync(p).size / 1024);
  console.log(`  ${cat} (${subset.length} 종) → ${p} (${kb} KB)`);
}

// 검증 가이드
const guide = `# LastWatch — 완전판 AI 교차검증 패키지

> **38,082종 전체 데이터 + 알고리즘 명세를 한 파일에 모두 담았습니다. 빠짐없이.**

## 📋 다른 AI에 붙여넣을 검증 프롬프트

\`\`\`
첨부한 verification-complete.json (전체 38,082종, 알고리즘 명세 포함)을 검증해주세요.

JSON 구조:
- meta: 알고리즘 v3 명세 (Layer 1-7 모든 수식·가중치·임계값)
- species: 전체 종 배열, 각 항목에 학명·한글명·카테고리·N₀·trend·임계점 4-tuple 일자·점수 모두 포함

검증 항목:
1. 학명(scientific_name) 표기가 IUCN Red List 와 일치하는지
2. IUCN 등급(category) 이 최신 평가와 맞는지
3. 한글명(common_name_ko) 이 자연스럽고 외래어 표기법 준수하는지
4. 임계점 점수(consensus_score) + Tier(intervention_tier) + D-day(deadline_days)가
   해당 종의 실제 보전상태와 합리적으로 매칭되는지
5. 4-tuple 일자 (intervention_open_date, intervention_deadline_date, golden_window_date, extinction_estimate_date)
   가 시간 일관성 (open ≤ deadline ≤ golden ≤ extinction) 을 지키는지
6. meta.algorithm 의 Layer 1-7 수식이 학술적으로 타당한지
7. 정렬 규칙 (D-day → T-level → 학명) 결과가 합리적인지

명백한 오류만 ID + 이유 + 수정안 을 표로 작성. 추측 제외.
\`\`\`

## 📂 파일 구성

| 파일 | 종 수 | 크기 | 용도 |
|---|---|---|---|
| \`verification-complete.json\` | **38,082** | (큰 파일) | 한 번에 전체 검증 |
| \`verification-complete-cr.json\` | 9,470 | | CR 만 |
| \`verification-complete-en.json\` | 13,898 | | EN 만 |
| \`verification-complete-vu.json\` | 14,087 | | VU 만 |
| \`verification-complete-ex.json\` | 540 | | EX 만 |
| \`verification-complete-ew.json\` | 87 | | EW 만 |

큰 파일이 AI 채팅창에 안 들어가면 카테고리별로 나눠서 첨부하세요.

## 🔬 알고리즘 명세 요약

각 파일의 \`meta.algorithm\` 필드에 모든 수식·가중치·임계값 직렬화돼있어서 AI 가 그 자체로 검증 가능.

- Layer 1 EWS: sigmoid(0.5·τ_AR1 + 0.3·τ_Var + 0.2·τ_Skew) · 100
- Layer 2 PVA: Stochastic Ricker + Allee, n_sim=1500, T=100년
- Layer 3 IUCN: Frankham 50/500 Rule + Criterion D
- Layer 4 Consensus: 0.30·EWS + 0.45·PVA + 0.25·IUCN
- Layer 5 Bottleneck Floor: N₀ 기반 강제 보정
- Layer 6 Tier: T0-T4 (20점 단위)
- Layer 7 4-tuple: 단일 trajectory 에서 복수 임계값 일자 역산

## 🎯 검증 우선순위

1. **시급도 TOP 10** — 큐레이션 16종 (mature_individuals 정확값) 의 D-day 가 합리적인지
2. **CR/EN 종 분포** — 카테고리별 score 평균이 학술적으로 타당한지
3. **4-tuple 시간 일관성** — open ≤ deadline ≤ golden ≤ extinction 위반 종 0 인지
4. **클러스터링 분산** — 동일 D-day 에 묶인 종 비율 < 30% 인지

생성 시각: ${new Date().toISOString()}
`;

const guidePath = path.join(OUT, "verification-complete-guide.md");
fs.writeFileSync(guidePath, guide, "utf-8");
console.log(`✓ 가이드 → ${guidePath}`);
