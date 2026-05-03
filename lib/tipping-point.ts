// LastWatch EWS-PVA Hybrid Engine — TypeScript 포팅
//
// References:
//   [1] Drake & Griffen (2010) Nature 467, 456-459
//   [2] Frankham, Bradshaw & Brook (2014) Biol Conservation 170, 56-63
//   [3] Scheffer et al. (2009) Nature 461, 53-59
//   [4] Lacy (1993) Wildlife Research 20, 45-65 — VORTEX
//   [5] IUCN (2012) Red List Categories and Criteria v3.1
//   [7] Beissinger & McCullough (2002) PVA, U. of Chicago Press
//
// 구현 노트: 사이트 DB 에는 시계열이 없음. EWS Layer 는 confidence 낮춰
// population_trend 만 약한 신호로 활용. PVA 와 IUCN 이 주 기여.

import type { SpeciesRow } from "./db";

// ===== 분류군별 기본 생활사 파라미터 (학명→기본값 추정용) =====
// generation_time, growth_rate 추정 — 정확치 데이터 없을 때 사용
// 출처: IUCN PVA workshop defaults + Cole 1954 + Stearns 1992
const LIFE_HISTORY: Record<
  string,
  { generation_time: number; r_max: number; ne_nc: number }
> = {
  // 포유류 — 큰 개체 / 늦은 성숙
  포유류: { generation_time: 8, r_max: 0.05, ne_nc: 0.15 },
  // 조류 — 중간
  조류: { generation_time: 5, r_max: 0.1, ne_nc: 0.2 },
  // 파충류 — 늦은 성숙, 긴 수명
  파충류: { generation_time: 10, r_max: 0.06, ne_nc: 0.15 },
  // 양서류 — 빠른 세대
  양서류: { generation_time: 3, r_max: 0.25, ne_nc: 0.1 },
  // 어류 — 매우 빠른 번식 가능
  "어류 (조기어류)": { generation_time: 4, r_max: 0.3, ne_nc: 0.05 },
  "어류 (경골어류)": { generation_time: 4, r_max: 0.3, ne_nc: 0.05 },
  "어류 (연골어류)": { generation_time: 12, r_max: 0.05, ne_nc: 0.1 },
  어류: { generation_time: 5, r_max: 0.2, ne_nc: 0.05 },
  곤충: { generation_time: 1, r_max: 0.5, ne_nc: 0.1 },
  거미류: { generation_time: 2, r_max: 0.4, ne_nc: 0.1 },
  갑각류: { generation_time: 2, r_max: 0.35, ne_nc: 0.08 },
  복족류: { generation_time: 2, r_max: 0.3, ne_nc: 0.1 },
  이매패류: { generation_time: 5, r_max: 0.15, ne_nc: 0.05 },
  "산호류 (육방산호)": { generation_time: 10, r_max: 0.05, ne_nc: 0.05 },
  // 식물
  "식물 (침엽수)": { generation_time: 30, r_max: 0.02, ne_nc: 0.2 },
  "식물 (소철)": { generation_time: 25, r_max: 0.03, ne_nc: 0.2 },
  "식물 (쌍떡잎)": { generation_time: 8, r_max: 0.1, ne_nc: 0.2 },
  양치식물: { generation_time: 5, r_max: 0.15, ne_nc: 0.15 },
  "양치식물 (속새류)": { generation_time: 5, r_max: 0.15, ne_nc: 0.15 },
  "이끼류 (우산이끼)": { generation_time: 2, r_max: 0.3, ne_nc: 0.15 },
  지의류: { generation_time: 10, r_max: 0.03, ne_nc: 0.15 },
};

const DEFAULT_LIFE: { generation_time: number; r_max: number; ne_nc: number } =
  { generation_time: 5, r_max: 0.1, ne_nc: 0.15 };

function lifeFor(className: string | null) {
  if (!className) return DEFAULT_LIFE;
  return LIFE_HISTORY[className] ?? DEFAULT_LIFE;
}

// ===== population_trend 문자열 → λ_mean / λ_sd =====
function trendToLambda(trend: string | null, r_max: number) {
  // λ = e^r 에서 r 추정
  // 감소 → r ≈ -0.05 (연 5% 감소), λ ≈ 0.95
  // 안정 → r ≈ 0
  // 증가 → r ≈ 0.05~0.10 (회복중)
  const t = (trend ?? "").toLowerCase();
  let r: number;
  if (t.includes("감소") || t.includes("decreas")) r = -0.06;
  else if (t.includes("증가") || t.includes("increas") || t.includes("회복")) r = 0.04;
  else if (t.includes("안정") || t.includes("stable")) r = 0;
  else r = -0.02; // 정보 없음 — 약간 보수적
  // λ_sd: 환경 확률성 (lognormal in log scale) — 야생 척추동물 메타분석 평균 ~0.15
  return { lambda_mean: Math.exp(r), lambda_sd: 0.15, r };
}

// ===== Layer 2: Stochastic PVA =====
// Ricker dynamics with environmental + demographic stochasticity + Allee
//
// N(t+1) = round(Poisson( N(t) * λ_env * exp(r * (1 - N/K)) ))
// λ_env  ~ LogNormal(log(λ_mean), λ_sd)
// Allee: if N < N_allee, multiply by (N/N_allee)
//
// 시뮬레이션은 numpy 대신 단순 루프 (n_sim=2000 으로 줄여 성능 확보)

function poissonSample(lambda: number): number {
  if (lambda <= 0) return 0;
  if (lambda > 30) {
    // Normal approximation for large lambda
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * z));
  }
  // Knuth algorithm
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= Math.random();
  } while (p > L);
  return k - 1;
}

function lognormalSample(meanLog: number, sdLog: number): number {
  const u1 = Math.max(1e-10, Math.random());
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.exp(meanLog + sdLog * z);
}

interface PvaParams {
  N0: number;
  K: number;
  r: number;
  lambda_mean: number;
  lambda_sd: number;
  T: number;
  n_sim: number;
  N_qext: number;
  N_allee: number;
}

interface PvaResult {
  P_ext_T: number;            // P(extinction by year T)
  P_ext_50yr: number;
  P_ext_100yr: number;
  median_T_ext: number | null;
  mean_final_N: number;
  pva_score: number;
  trajectory_mean: number[];   // 평균 궤적 by year
  trajectory_p10: number[];    // 10퍼센타일 (비관)
  trajectory_p90: number[];    // 90퍼센타일 (낙관)
  T_to_qext_p10: number | null; // 10퍼센타일 (비관)에서 quasi-ext 도달 연도
  T_to_qext_median: number | null;
}

function runPva(p: PvaParams): PvaResult {
  const { N0, K, r, lambda_mean, lambda_sd, T, n_sim, N_qext, N_allee } = p;
  const meanLog = Math.log(lambda_mean);

  const finalNs: number[] = [];
  const extTimes: number[] = [];
  // trajectory[year][sim]
  const traj: number[][] = Array.from({ length: T + 1 }, () => new Array(n_sim).fill(0));

  for (let s = 0; s < n_sim; s++) {
    let N = N0;
    traj[0][s] = N;
    let extinctAt: number | null = null;
    for (let t = 1; t <= T; t++) {
      if (N <= 0) {
        traj[t][s] = 0;
        continue;
      }
      const lambdaEnv = lognormalSample(meanLog, lambda_sd);
      const dens = Math.exp(r * (1 - N / K));
      const expected = N * lambdaEnv * dens;
      // demographic stochasticity
      N = poissonSample(expected);
      // Allee
      if (N < N_allee && N > 0) {
        N = Math.round(N * (N / N_allee));
      }
      N = Math.max(0, Math.round(N));
      traj[t][s] = N;
      if (N < N_qext && extinctAt === null) {
        extinctAt = t;
        // continue tracking (don't break — for trajectory)
      }
    }
    finalNs.push(N);
    if (extinctAt !== null) extTimes.push(extinctAt);
  }

  const extCount50 = extTimes.filter((t) => t <= 50).length;
  const extCount100 = extTimes.filter((t) => t <= 100).length;
  const extCountT = extTimes.filter((t) => t <= T).length;
  const P_ext_50 = extCount50 / n_sim;
  const P_ext_100 = extCount100 / n_sim;
  const P_ext_T = extCountT / n_sim;

  let median_T: number | null = null;
  if (extTimes.length > 0) {
    const sorted = [...extTimes].sort((a, b) => a - b);
    median_T = sorted[Math.floor(sorted.length / 2)];
  }

  const survFinal = finalNs.filter((n) => n >= N_qext);
  const meanFinal = survFinal.length > 0 ? survFinal.reduce((a, b) => a + b, 0) / survFinal.length : 0;

  // Trajectory percentiles per year
  const trajMean: number[] = [];
  const trajP10: number[] = [];
  const trajP90: number[] = [];
  for (let t = 0; t <= T; t++) {
    const sorted = [...traj[t]].sort((a, b) => a - b);
    trajMean.push(traj[t].reduce((a, b) => a + b, 0) / n_sim);
    trajP10.push(sorted[Math.floor(0.1 * n_sim)]);
    trajP90.push(sorted[Math.floor(0.9 * n_sim)]);
  }

  // Year when p10 trajectory hits N_qext — pessimistic 멸종 연도
  let T_to_qext_p10: number | null = null;
  for (let t = 1; t <= T; t++) {
    if (trajP10[t] < N_qext) { T_to_qext_p10 = t; break; }
  }

  // PVA score
  const N_safe = Math.max(K * 0.1, 50);
  const ratio = Math.min(1, N0 / N_safe);
  const pvaRaw = 0.45 * P_ext_50 + 0.35 * P_ext_100 + 0.20 * (1 - ratio);
  const pvaScore = Math.max(0, Math.min(100, pvaRaw * 100));

  return {
    P_ext_T,
    P_ext_50yr: P_ext_50,
    P_ext_100yr: P_ext_100,
    median_T_ext: median_T,
    mean_final_N: meanFinal,
    pva_score: pvaScore,
    trajectory_mean: trajMean,
    trajectory_p10: trajP10,
    trajectory_p90: trajP90,
    T_to_qext_p10,
    T_to_qext_median: median_T,
  };
}

// ===== Layer 3: IUCN + 50/500 Rule =====
interface IucnResult {
  Ne: number;
  genetic_status: "CRITICAL" | "ENDANGERED" | "VULNERABLE" | "NEAR_THREAT" | "SAFE";
  genetic_score: number;
  criterion_D_score: number;
  category_score: number;
  iucn_score: number;
  confidence: number;
}

function evaluateIucn(N: number, category: string, ne_nc: number): IucnResult {
  const Ne = Math.round(N * ne_nc);

  let genetic_status: IucnResult["genetic_status"];
  let genetic_score: number;
  if (Ne < 50)        { genetic_status = "CRITICAL";    genetic_score = 95; }
  else if (Ne < 100)  { genetic_status = "ENDANGERED";  genetic_score = 80; }
  else if (Ne < 500)  { genetic_status = "VULNERABLE";  genetic_score = 55; }
  else if (Ne < 1000) { genetic_status = "NEAR_THREAT"; genetic_score = 30; }
  else                { genetic_status = "SAFE";        genetic_score = 10; }

  // Criterion D — absolute thresholds
  let criterion_D_score: number;
  if (N < 50)        criterion_D_score = 90;
  else if (N < 250)  criterion_D_score = 70;
  else if (N < 1000) criterion_D_score = 45;
  else               criterion_D_score = 5;

  // Category-based score (현재 등급이 이미 평가된 결과)
  const categoryScores: Record<string, number> = {
    EX: 100, EW: 100, CR: 90, EN: 70, VU: 50, NT: 30, LC: 10, DD: 40, NE: 30,
  };
  const category_score = categoryScores[category] ?? 50;

  const iucn_score = Math.max(genetic_score, criterion_D_score, category_score);
  const confidence = N > 0 ? 0.85 : 0.4;

  return { Ne, genetic_status, genetic_score, criterion_D_score, category_score, iucn_score, confidence };
}

// ===== Layer 1: EWS (시계열 부재 → trend 만 약한 신호로) =====
interface EwsResult {
  composite_score: number;
  confidence: number;
  interpretation: string;
}

function evaluateEws(trend: string | null, r: number): EwsResult {
  // 시계열 없음 → confidence 0.2~0.3
  // r < 0 (감소) 만 신호로 변환
  const negSignal = Math.max(0, -r);  // 0~0.06
  const score = Math.min(100, (negSignal / 0.06) * 50); // 0~50 max
  let interp = "시계열 없음 — 약한 신호";
  if (score > 30) interp = "감소 추세 — 검토 필요";
  return { composite_score: score, confidence: 0.25, interpretation: interp };
}

// ===== Aggregator =====
const TIERS = [
  { tier: "T0", label: "안정", color: "#60C659", min: 0,  max: 20, action: "정기 모니터링" },
  { tier: "T1", label: "주의", color: "#CCE226", min: 20, max: 40, action: "모니터링 강화" },
  { tier: "T2", label: "경계 — 개입 검토", color: "#F9E814", min: 40, max: 60, action: "위협 정밀조사" },
  { tier: "T3", label: "위급 — 즉시 개입", color: "#FC7F3F", min: 60, max: 80, action: "긴급 보호조치" },
  { tier: "T4", label: "임박 — 골든타임", color: "#D81E05", min: 80, max: 101, action: "포획 / ex-situ" },
] as const;

function tierForScore(score: number) {
  for (const t of TIERS) {
    if (score >= t.min && score < t.max) return t;
  }
  return TIERS[TIERS.length - 1];
}

export interface TippingPointResult {
  consensus_score: number;
  intervention_tier: string;
  tier_label: string;
  tier_color: string;
  layer_scores: {
    ews: { score: number; confidence: number; interpretation: string };
    pva: {
      score: number;
      P_ext_50yr: number;
      P_ext_100yr: number;
      median_T_ext: number | null;
      confidence: number;
    };
    iucn: { score: number; Ne: number; genetic_status: string; confidence: number };
  };
  // 절대 날짜 (today 기준)
  dates: {
    intervention_open_date: string;       // 개입 가능 시작
    intervention_deadline_date: string;   // 개입 마감 (T3 진입 예상)
    extinction_estimate_date: string | null; // 무대응 시 예상 멸종 (p10 비관 또는 median)
    golden_window_date: string | null;    // T4 진입 (last call)
  };
  years_until: {
    deadline: number;
    extinction: number | null;
    golden_window: number | null;
  };
  confidence: number;
  primary_driver: string;
  rationale: string;
}

const TODAY = new Date("2026-05-03"); // CLAUDE.md currentDate

function addYears(date: Date, years: number): Date {
  const d = new Date(date);
  const wholeYears = Math.floor(years);
  const fractionDays = Math.round((years - wholeYears) * 365);
  d.setFullYear(d.getFullYear() + wholeYears);
  d.setDate(d.getDate() + fractionDays);
  return d;
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function evaluateTippingPoint(
  species: SpeciesRow,
  opts: { n_sim?: number; T?: number; seed?: number } = {}
): TippingPointResult {
  const T = opts.T ?? 100;
  const n_sim = opts.n_sim ?? 1500;

  const life = lifeFor(species.class_name);
  const { lambda_mean, lambda_sd, r } = trendToLambda(species.population_trend, life.r_max);

  // 절멸은 별도 처리 — extinct species 는 점수 100 + 멸종 날짜 = extinction_year
  if (species.category === "EX" || species.category === "EW") {
    return makeExtinctResult(species);
  }

  // N0 추정: mature_individuals 가 있으면 사용, 없으면 등급 기반 보수 추정
  const N0 = inferPopulation(species);

  // K (환경 수용력) — N0 가 감소 추세면 과거 K 가 더 컸다고 가정
  let K: number;
  if (r < 0) K = Math.max(N0 * 1.5, N0 + 100);  // 회복 가능한 환경
  else K = Math.max(N0 * 1.2, N0 + 50);
  const N_qext = 2;
  const N_allee = Math.max(20, Math.round(N0 * 0.05));

  const pva = runPva({ N0, K, r, lambda_mean, lambda_sd, T, n_sim, N_qext, N_allee });
  const iucn = evaluateIucn(N0, species.category, life.ne_nc);
  const ews = evaluateEws(species.population_trend, r);

  // ===== Aggregator =====
  const w = { ews: 0.20, pva: 0.50, iucn: 0.30 }; // EWS 신뢰도 낮음 → PVA/IUCN 가중↑
  const raw = w.ews * ews.composite_score + w.pva * pva.pva_score + w.iucn * iucn.iucn_score;

  // Consensus filter
  const highAlerts = [ews.composite_score > 70, pva.pva_score > 50, iucn.iucn_score > 60].filter(Boolean).length;
  let consensus = raw;
  if (highAlerts === 0) consensus = raw * 0.6;
  else if (highAlerts === 1) consensus = raw * 0.85;
  // ≥2 → 그대로 (다중 신호 신뢰)

  // Confidence-weighted compression
  const overall_conf = w.ews * ews.confidence + w.pva * 0.7 + w.iucn * iucn.confidence;
  if (overall_conf < 0.5) consensus = consensus * 0.9 + 10;

  const tier = tierForScore(consensus);

  // ===== 날짜 계산 =====
  const trajMean = pva.trajectory_mean;

  // 각 시뮬레이션 평균 궤적이 다음 tier 임계 N 에 도달하는 연도
  // 점수는 decreasing N 함수 — 단순화: tier 진입 연도 = 평균 N 이 특정 비율로 떨어지는 시점
  // T2 = N(t)/N0 ≤ 0.7
  // T3 = N(t)/N0 ≤ 0.4
  // T4 = N(t)/N0 ≤ 0.15
  const yearsUntil = (ratio: number): number | null => {
    const target = N0 * ratio;
    for (let t = 1; t < trajMean.length; t++) {
      if (trajMean[t] <= target) return t;
    }
    return null;
  };

  // 현재 tier 보다 한 단계 위 진입 연도
  const tierIdx = TIERS.findIndex((t) => t.tier === tier.tier);
  let yearsToDeadline: number;
  if (tierIdx >= 3) yearsToDeadline = 0; // 이미 T3 이상 — 즉시 마감
  else if (tierIdx === 2) yearsToDeadline = yearsUntil(0.4) ?? 30; // T2 → T3
  else if (tierIdx === 1) yearsToDeadline = yearsUntil(0.55) ?? 40;
  else yearsToDeadline = yearsUntil(0.7) ?? 50;
  yearsToDeadline = Math.min(yearsToDeadline, 100);

  const yearsToExtinction = pva.T_to_qext_p10 ?? (pva.median_T_ext ?? null);
  const yearsToGolden = yearsUntil(0.15);

  const interventionOpen = TODAY; // 개입 가능 시작은 오늘
  const interventionDeadline = addYears(TODAY, Math.max(0, yearsToDeadline));
  const extinctionDate = yearsToExtinction != null ? addYears(TODAY, yearsToExtinction) : null;
  const goldenDate = yearsToGolden != null ? addYears(TODAY, yearsToGolden) : null;

  // Primary driver
  const driverScores = [
    { name: "PVA 시뮬레이션", value: pva.pva_score },
    { name: "IUCN/유전 임계값", value: iucn.iucn_score },
    { name: "EWS 신호", value: ews.composite_score },
  ].sort((a, b) => b.value - a.value);

  const rationale = buildRationale(species, N0, pva, iucn, tier);

  return {
    consensus_score: Math.round(consensus * 10) / 10,
    intervention_tier: tier.tier,
    tier_label: tier.label,
    tier_color: tier.color,
    layer_scores: {
      ews: { score: ews.composite_score, confidence: ews.confidence, interpretation: ews.interpretation },
      pva: {
        score: pva.pva_score,
        P_ext_50yr: pva.P_ext_50yr,
        P_ext_100yr: pva.P_ext_100yr,
        median_T_ext: pva.median_T_ext,
        confidence: 0.7,
      },
      iucn: { score: iucn.iucn_score, Ne: iucn.Ne, genetic_status: iucn.genetic_status, confidence: iucn.confidence },
    },
    dates: {
      intervention_open_date: fmt(interventionOpen),
      intervention_deadline_date: fmt(interventionDeadline),
      extinction_estimate_date: extinctionDate ? fmt(extinctionDate) : null,
      golden_window_date: goldenDate ? fmt(goldenDate) : null,
    },
    years_until: {
      deadline: yearsToDeadline,
      extinction: yearsToExtinction,
      golden_window: yearsToGolden,
    },
    confidence: Math.round(overall_conf * 100) / 100,
    primary_driver: driverScores[0].name,
    rationale,
  };
}

function inferPopulation(s: SpeciesRow): number {
  if (s.mature_individuals && s.mature_individuals > 0) return s.mature_individuals;
  // 등급별 IUCN 임계값 기반 보수적 추정 (Criterion D 중간값)
  const fallback: Record<string, number> = {
    CR: 200,    // < 250 으로 가정
    EN: 1500,   // < 2500
    VU: 5000,   // < 10000
    NT: 20000,
    LC: 100000,
    EX: 0,
    EW: 5,
    DD: 1000,
    NE: 1000,
  };
  return fallback[s.category] ?? 1000;
}

function buildRationale(
  s: SpeciesRow,
  N0: number,
  pva: PvaResult,
  iucn: IucnResult,
  tier: typeof TIERS[number]
): string {
  const name = s.common_name_ko ?? s.common_name_en ?? s.scientific_name;
  const Pe50 = (pva.P_ext_50yr * 100).toFixed(0);
  const Ne = iucn.Ne;
  return `현재 추정 개체수 ${N0.toLocaleString()}, 유효 개체군 Ne ≈ ${Ne}. 50년 멸종확률 ${Pe50}%. ${tier.label} (${tier.tier}) 단계로 평가됨. ${tier.action} 권고.`;
}

function makeExtinctResult(s: SpeciesRow): TippingPointResult {
  const year = s.extinction_year ?? null;
  const date = year ? `${year}-01-01` : null;
  return {
    consensus_score: 100,
    intervention_tier: "EX",
    tier_label: s.category === "EX" ? "절멸" : "야생절멸",
    tier_color: "#000000",
    layer_scores: {
      ews: { score: 100, confidence: 1, interpretation: "이미 절멸" },
      pva: { score: 100, P_ext_50yr: 1, P_ext_100yr: 1, median_T_ext: 0, confidence: 1 },
      iucn: { score: 100, Ne: 0, genetic_status: "CRITICAL", confidence: 1 },
    },
    dates: {
      intervention_open_date: date ?? fmt(TODAY),
      intervention_deadline_date: date ?? fmt(TODAY),
      extinction_estimate_date: date,
      golden_window_date: date,
    },
    years_until: { deadline: 0, extinction: 0, golden_window: 0 },
    confidence: 1,
    primary_driver: "이미 절멸 — 회고 단계",
    rationale: year
      ? `이 종은 ${year}년경 야생에서 사라진 것으로 기록되어 있습니다. ${s.extinction_cause ?? "복합적 요인"}이 원인으로 추정됩니다.`
      : "이 종은 이미 절멸 또는 야생절멸 상태입니다.",
  };
}

export { TIERS };
