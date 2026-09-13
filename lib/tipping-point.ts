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

// ===== v5 계산 상수 =====
// 엔진이 실제로 쓰는 값 그대로다. /methodology 페이지와 lib/floor-transparency.ts 가 여기서 읽는다.
// 값을 바꾸면 v5 점수가 바뀐다 (2026-09-20 식 안의 숫자를 이름 붙인 상수로 옮김 — 값·연산 순서 무변경,
// 전 종 재계산 대조로 확인).
export const V5_SPEC = {
  /** 종합 가중치 — 점수₀ = Σ w·레이어 점수 */
  weights: { ews: 0.3, pva: 0.45, iucn: 0.25 },
  /** 다수결 — 레이어 점수가 이 값을 넘으면 경보 1표 */
  alertThresholds: { ews: 70, pva: 50, iucn: 60 },
  /** 경보 표 수에 따른 배율 (2표 이상은 그대로) */
  consensusMultiplier: { zero: 0.6, one: 0.85 },
  /** 신뢰도 압축 — Σ w·레이어 신뢰도 가 below 미만이면 점수·scale + add */
  lowConfidence: { below: 0.5, scale: 0.9, add: 10 },
  /** 개체수 하한 — N0 가 below 미만인 첫 구간의 floor 까지 점수를 끌어올린다 (특허 명세서 미기재 자체 규칙) */
  floorBands: [
    { below: 50, floor: 90 },
    { below: 100, floor: 78 },
    { below: 250, floor: 70 },
    { below: 500, floor: 60 },
  ],
  /** 추세 보정 — species.population_trend (한글 문자열) 기준 */
  trendAdjust: { sharpDecline: 8, recovering: -10, decline: 4 },
  /** Layer 1 EWS — 시계열이 없어 추세의 r 로 τ 를 추정 */
  ews: { tauScale: 0.06, tauWeights: { ar1: 0.5, variance: 0.3, skew: 0.2 }, gain: 2, confidence: 0.25 },
  /** Layer 2 PVA */
  pva: {
    nSim: 1500,
    years: 100,
    horizons: { short: 50, long: 100 },
    weights: { pExtShort: 0.45, pExtLong: 0.35, deficit: 0.2 },
    safeKFraction: 0.1,
    safeMinN: 50,
    confidence: 0.7,
  },
  /** Layer 3 유효개체군 — Ne = round(N0·ne_nc), Ne 가 below 미만인 첫 구간의 점수 (없으면 neSafe) */
  neBands: [
    { below: 50, score: 95, status: "CRITICAL" },
    { below: 100, score: 80, status: "ENDANGERED" },
    { below: 500, score: 55, status: "VULNERABLE" },
    { below: 1000, score: 30, status: "NEAR_THREAT" },
  ],
  neSafe: { score: 10, status: "SAFE" },
  neConfidence: 0.85,
} as const;

// ===== 분류군별 기본 생활사 파라미터 (학명→기본값 추정용) =====
// generation_time, growth_rate 추정 — 정확치 데이터 없을 때 사용
// 출처: IUCN PVA workshop defaults + Cole 1954 + Stearns 1992
//
// ne_nc 출처 주의: 위 출처는 generation_time·r_max 를 가리킨다. ne_nc 는
// 저장소에서 근거를 찾지 못했다 (2026-08-27 조사 — docs/patent/ne-nc-provenance-2026-08-27.md).
// 아래 각 줄에 Frankham 1995 (Genetical Research 66:95, 102종 192추정치) 대응값을
// 병기한다 — 대조용 기록일 뿐 계산에는 쓰지 않는다. 값은 바꾸지 않았다.
const LIFE_HISTORY: Record<
  string,
  { generation_time: number; r_max: number; ne_nc: number }
> = {
  // 포유류 — 큰 개체 / 늦은 성숙
  // ne_nc 0.15 — Frankham 1995 일반 0.10~0.11 보다 높음 (근거 미확인)
  포유류: { generation_time: 8, r_max: 0.05, ne_nc: 0.15 },
  // 조류 — 중간
  // ne_nc 0.20 — Frankham 1995 조류 0.21
  조류: { generation_time: 5, r_max: 0.1, ne_nc: 0.2 },
  // 파충류 — 늦은 성숙, 긴 수명
  // ne_nc 0.15 — Frankham 1995 일반 0.10~0.11 보다 높음 (근거 미확인)
  파충류: { generation_time: 10, r_max: 0.06, ne_nc: 0.15 },
  // 양서류 — 빠른 세대
  // ne_nc 0.10 — Frankham 1995 일반값과 일치
  양서류: { generation_time: 3, r_max: 0.25, ne_nc: 0.1 },
  // 어류 — 매우 빠른 번식 가능
  // ne_nc 0.05 — Frankham 1995 일반값보다 낮음 (근거 미확인)
  "어류 (조기어류)": { generation_time: 4, r_max: 0.3, ne_nc: 0.05 },
  // ne_nc 0.05 — Frankham 1995 일반값보다 낮음 (근거 미확인)
  "어류 (경골어류)": { generation_time: 4, r_max: 0.3, ne_nc: 0.05 },
  // ne_nc 0.10 — Frankham 1995 일반값과 일치
  "어류 (연골어류)": { generation_time: 12, r_max: 0.05, ne_nc: 0.1 },
  // ne_nc 0.05 — Frankham 1995 일반값보다 낮음 (근거 미확인)
  어류: { generation_time: 5, r_max: 0.2, ne_nc: 0.05 },
  // ne_nc 0.10 — Frankham 1995 일반값과 일치
  곤충: { generation_time: 1, r_max: 0.5, ne_nc: 0.1 },
  // ne_nc 0.10 — Frankham 1995 일반값과 일치
  거미류: { generation_time: 2, r_max: 0.4, ne_nc: 0.1 },
  // ne_nc 0.08 — Frankham 1995 일반값보다 낮음 (근거 미확인)
  갑각류: { generation_time: 2, r_max: 0.35, ne_nc: 0.08 },
  // ne_nc 0.10 — Frankham 1995 일반값과 일치
  복족류: { generation_time: 2, r_max: 0.3, ne_nc: 0.1 },
  // ne_nc 0.05 — Frankham 1995 일반값보다 낮음 (근거 미확인)
  이매패류: { generation_time: 5, r_max: 0.15, ne_nc: 0.05 },
  // ne_nc 0.05 — Frankham 1995 일반값보다 낮음 (근거 미확인)
  "산호류 (육방산호)": { generation_time: 10, r_max: 0.05, ne_nc: 0.05 },
  // 식물 — Frankham 1995 는 식물 대응값을 제시하지 않는다 (근거 미확인)
  "식물 (침엽수)": { generation_time: 30, r_max: 0.02, ne_nc: 0.2 },
  "식물 (소철)": { generation_time: 25, r_max: 0.03, ne_nc: 0.2 },
  "식물 (쌍떡잎)": { generation_time: 8, r_max: 0.1, ne_nc: 0.2 },
  양치식물: { generation_time: 5, r_max: 0.15, ne_nc: 0.15 },
  "양치식물 (속새류)": { generation_time: 5, r_max: 0.15, ne_nc: 0.15 },
  "이끼류 (우산이끼)": { generation_time: 2, r_max: 0.3, ne_nc: 0.15 },
  // 지의류 — Frankham 1995 대응값 없음 (근거 미확인)
  지의류: { generation_time: 10, r_max: 0.03, ne_nc: 0.15 },
};

// ne_nc 0.15 — Frankham 1995 일반 0.10~0.11 보다 높음 (근거 미확인)
const DEFAULT_LIFE: { generation_time: number; r_max: number; ne_nc: number } =
  { generation_time: 5, r_max: 0.1, ne_nc: 0.15 };

function lifeFor(className: string | null) {
  if (!className) return DEFAULT_LIFE;
  return LIFE_HISTORY[className] ?? DEFAULT_LIFE;
}

/** 분류군 전용 생활사 값(ne_nc 등)이 있는가 — 없으면 DEFAULT_LIFE. /methodology 커버리지 표시용 */
export function hasClassLifeHistory(className: string | null): boolean {
  return !!className && className in LIFE_HISTORY;
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

/**
 * v4 Phase 1: IUCN 공식 trend 우선, 한글 trend fallback
 * 우선순위: IUCN(Decreasing/Stable/Increasing) → 한글 population_trend → DEFAULT
 * 매핑: Decreasing=-0.06, Stable=0, Increasing=+0.06 (Decreasing과 대칭, 기존 일관성)
 * @param iucnTrend  "Decreasing" | "Stable" | "Increasing" | "Unknown" | null
 * @param koreanTrend 한글 population_trend (fallback용)
 * @param category IUCN 등급 (EX/EW 방어)
 */
export function trendToLambdaV4(
  iucnTrend: string | null,
  koreanTrend: string | null,
  category: string
): { lambda_mean: number; lambda_sd: number; r: number; source: string } {
  const SD = 0.15;
  // EX/EW 방어 — 실사용 경로에선 evaluateTippingPoint 상단 early-return 으로 도달 안 함
  if (category === "EX" || category === "EW") {
    return { lambda_mean: 1.0, lambda_sd: SD, r: 0, source: "extinct" };
  }
  // 우선순위 1: IUCN 공식 trend (Unknown 은 제외)
  if (iucnTrend === "Decreasing") return { lambda_mean: Math.exp(-0.06), lambda_sd: SD, r: -0.06, source: "iucn" };
  if (iucnTrend === "Stable")     return { lambda_mean: 1.0,             lambda_sd: SD, r: 0,     source: "iucn" };
  if (iucnTrend === "Increasing") return { lambda_mean: Math.exp(0.06),  lambda_sd: SD, r: 0.06,  source: "iucn" };
  // 우선순위 2: 한글 trend fallback (Unknown 또는 null)
  if (koreanTrend) return { ...trendToLambda(koreanTrend, 0), source: "korean" };
  // 우선순위 3: DEFAULT — v3 무정보 처리와 동일 (r=-0.02, 약간 보수적)
  return { ...trendToLambda(null, 0), source: "default" };
}

// ===== Layer 2: Stochastic PVA =====
// Ricker dynamics with environmental + demographic stochasticity + Allee
//
// N(t+1) = round(Poisson( N(t) * λ_env * exp(r * (1 - N/K)) ))
// λ_env  ~ LogNormal(log(λ_mean), λ_sd)
// Allee: if N < N_allee, multiply by (N/N_allee)
//
// 시뮬레이션은 numpy 대신 단순 루프 (n_sim=2000 으로 줄여 성능 확보)

// xorshift32 PRNG — 결정적, 종별 다른 시드로 재현 가능
function makeRng(seed: number) {
  let s = seed | 0;
  if (s === 0) s = 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    // Convert to [0, 1)
    return ((s >>> 0) / 4294967296);
  };
}

function poissonSample(lambda: number, rand: () => number): number {
  if (lambda <= 0) return 0;
  if (lambda > 30) {
    const u1 = Math.max(1e-10, rand());
    const u2 = rand();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * z));
  }
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rand();
  } while (p > L);
  return k - 1;
}

function lognormalSample(meanLog: number, sdLog: number, rand: () => number): number {
  const u1 = Math.max(1e-10, rand());
  const u2 = rand();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.exp(meanLog + sdLog * z);
}

// 정규 분포 샘플 (Box-Muller). 스펙: lam = np.random.normal(lambda_mean, lambda_sd)
function normalSample(mean: number, sd: number, rand: () => number): number {
  const u1 = Math.max(1e-10, rand());
  const u2 = rand();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + sd * z;
}

// 종 ID 문자열 → 32-bit 시드 (FNV-1a 해시)
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
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
  seed: number;
}

interface PvaResult {
  P_ext_T: number;
  P_ext_50yr: number;
  P_ext_100yr: number;
  median_T_ext: number | null;
  mean_final_N: number;
  pva_score: number;
  trajectory_mean: number[];
  trajectory_p10: number[];
  trajectory_p90: number[];
  T_to_qext_p10: number | null;
  T_to_qext_median: number | null;
  // v2.0 명세 추가:
  extinction_times: number[]; // 각 sim 의 멸종 연도 (분수년) — 멸종 안하면 미포함
  allee_times: number[];      // 각 sim 의 Allee threshold 도달 연도 — 도달 안하면 미포함
  trajectories: number[][];   // (n_sim, T+1) 모든 trajectory 보존 — score 시계열 변환용
}

function runPva(p: PvaParams): PvaResult {
  // v2.0 명세 (2026-05-07):
  //   - 모든 trajectory 보존 (score 시계열 변환용)
  //   - allee_times 별도 추적 (intervention_deadline 25%ile 산출)
  //   - lognormal lambda (음수 보호) — Lacy 1993 VORTEX 표준
  const { N0, K, r, lambda_mean, lambda_sd, T, n_sim, N_qext, N_allee, seed } = p;
  const rand = makeRng(seed);

  // 환경 확률성 — lognormal 변환
  const cv = lambda_sd / Math.max(lambda_mean, 1e-6);
  const log_mu = Math.log(Math.max(lambda_mean, 1e-6)) - 0.5 * cv * cv;
  const log_sigma = Math.abs(cv);

  const finalNs: number[] = [];
  const extTimes: number[] = [];
  const alleeTimes: number[] = [];
  const traj: number[][] = Array.from({ length: T + 1 }, () => new Array(n_sim).fill(0));
  // sim 별 trajectory (n_sim × T+1)
  const simTraj: number[][] = Array.from({ length: n_sim }, () => new Array(T + 1).fill(0));

  for (let s = 0; s < n_sim; s++) {
    let N = N0;
    let prevN = N;
    traj[0][s] = N;
    simTraj[s][0] = N;
    let extinctAt: number | null = null;
    let alleeAt: number | null = null;

    for (let t = 1; t <= T; t++) {
      if (N <= 0) {
        traj[t][s] = 0;
        simTraj[s][t] = 0;
        continue;
      }
      prevN = N;

      // 환경 확률성 lognormal
      const lam = Math.exp(log_mu + log_sigma * (normalSample(0, 1, rand)));
      const r_t = Math.log(Math.max(lam, 1e-6));

      // Ricker 밀도의존
      let expectedN = N * Math.exp(r_t * (1 - N / Math.max(K, 1)));

      // Allee 효과 (개체수가 임계값 이하일 때 가속 붕괴)
      if (N < N_allee && N > 0) {
        expectedN *= N / N_allee;
        if (alleeAt === null) {
          alleeAt = t;
        }
      }

      // 인구 확률성 Poisson
      N = poissonSample(Math.max(expectedN, 0), rand);
      N = Math.max(0, Math.round(N));
      traj[t][s] = N;
      simTraj[s][t] = N;

      // 준멸종 (N<2)
      if (N < N_qext && extinctAt === null) {
        if (prevN > N) {
          const frac = (prevN - N_qext) / (prevN - N);
          extinctAt = (t - 1) + Math.max(0, Math.min(1, frac));
        } else {
          extinctAt = t;
        }
        // 멸종 후 0 유지
        for (let tt = t; tt <= T; tt++) {
          traj[tt][s] = 0;
          simTraj[s][tt] = 0;
        }
        break;
      }
    }
    finalNs.push(N);
    if (extinctAt !== null) extTimes.push(extinctAt);
    if (alleeAt !== null) alleeTimes.push(alleeAt);
  }

  const extCount50 = extTimes.filter((t) => t <= V5_SPEC.pva.horizons.short).length;
  const extCount100 = extTimes.filter((t) => t <= V5_SPEC.pva.horizons.long).length;
  const extCountT = extTimes.filter((t) => t <= T).length;
  const P_ext_50 = extCount50 / n_sim;
  const P_ext_100 = extCount100 / n_sim;
  const P_ext_T = extCountT / n_sim;

  let median_T: number | null = null;
  if (extTimes.length > 0) {
    const sorted = [...extTimes].sort((a, b) => a - b);
    const mid = sorted.length / 2;
    if (Number.isInteger(mid)) {
      median_T = (sorted[mid - 1] + sorted[mid]) / 2;
    } else {
      median_T = sorted[Math.floor(mid)];
    }
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

  // Year when p10 trajectory hits N_qext — pessimistic 멸종 연도 (선형 보간)
  let T_to_qext_p10: number | null = null;
  for (let t = 1; t <= T; t++) {
    if (trajP10[t] < N_qext) {
      const prev = trajP10[t - 1];
      const cur = trajP10[t];
      if (prev > cur && prev >= N_qext) {
        const frac = (prev - N_qext) / (prev - cur);
        T_to_qext_p10 = (t - 1) + Math.max(0, Math.min(1, frac));
      } else {
        T_to_qext_p10 = t;
      }
      break;
    }
  }

  // PVA score
  const { weights: pw, safeKFraction, safeMinN } = V5_SPEC.pva;
  const N_safe = Math.max(K * safeKFraction, safeMinN);
  const ratio = Math.min(1, N0 / N_safe);
  const pvaRaw = pw.pExtShort * P_ext_50 + pw.pExtLong * P_ext_100 + pw.deficit * (1 - ratio);
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
    extinction_times: extTimes,
    allee_times: alleeTimes,
    trajectories: simTraj,
  };
}

// 분위수 계산 (선형 보간) — NaN 안전
function percentile(sorted: number[], p: number, fallback = 100): number {
  if (sorted.length === 0) return fallback;
  if (sorted.length === 1) return Number.isFinite(sorted[0]) ? sorted[0] : fallback;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  let v: number;
  if (lo === hi) v = sorted[lo];
  else v = sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  return Number.isFinite(v) ? v : fallback;
}

// 안전한 연도 → addYears 입력 sanitize
function safeYears(y: number, fallback = 100): number {
  if (!Number.isFinite(y)) return fallback;
  return Math.max(0, Math.min(100, y));
}

// trajectory → score 시계열 변환 (개체수 비율 + Allee + Ne 페널티)
function trajectoryToScore(
  trajectory: number[],
  K: number,
  alleeThr: number,
  neRatio: number
): number[] {
  const T = trajectory.length;
  const scores = new Array(T).fill(0);
  for (let t = 0; t < T; t++) {
    const N = trajectory[t];
    if (N <= 0) {
      scores[t] = 100;
      continue;
    }
    const ratio = N / Math.max(K, 1);
    let base: number;
    if (ratio < 0.01) base = 95;
    else if (ratio < 0.05) base = 85;
    else if (ratio < 0.10) base = 70;
    else if (ratio < 0.30) base = 50;
    else if (ratio < 0.50) base = 30;
    else base = 15;
    if (N < alleeThr) base = Math.min(100, base + 15);
    const Ne = N * neRatio;
    if (Ne < 50) base = Math.min(100, base + 10);
    else if (Ne < 100) base = Math.min(100, base + 5);
    scores[t] = base;
  }
  return scores;
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

  const neBand = V5_SPEC.neBands.find((b) => Ne < b.below);
  const genetic_status: IucnResult["genetic_status"] = neBand?.status ?? V5_SPEC.neSafe.status;
  const genetic_score: number = neBand?.score ?? V5_SPEC.neSafe.score;

  // Criterion D — absolute thresholds
  let criterion_D_score: number;
  if (N < 50)        criterion_D_score = 90;
  else if (N < 250)  criterion_D_score = 70;
  else if (N < 1000) criterion_D_score = 45;
  else               criterion_D_score = 5;

  // v5 (2026-08-01): IUCN 등급/Criterion D 의존 제거 → 유효개체군(Ne) 기반 단독.
  //   category_score(CR=90…)와 criterion_D_score 는 점수에 반영하지 않음
  //   (순환논증 방지: 우리 점수가 IUCN 등급을 되풀이하지 않도록).
  const category_score = 0; // 미사용 (payload 호환용 자리)
  const iucn_score = genetic_score;
  const confidence = N > 0 ? V5_SPEC.neConfidence : 0.4;

  return { Ne, genetic_status, genetic_score, criterion_D_score, category_score, iucn_score, confidence };
}

// ===== Layer 1: EWS (시계열 부재 → trend 만 약한 신호로) =====
interface EwsResult {
  composite_score: number;
  confidence: number;
  interpretation: string;
}

function evaluateEws(trend: string | null, r: number): EwsResult {
  // 스펙 v3: ews_score = sigmoid(0.5·τ_AR1 + 0.3·τ_Var + 0.2·τ_Skew) · 100
  // 시계열 부재 → 모든 τ = 0 → sigmoid(0) = 0.5 → ews_score = 50
  // 단, r 부호로 약한 추정 신호 부여 (감소 추세면 양의 τ 가정)
  const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
  // r 가 음수일수록 τ 가 양수 (CSD 신호) — r ≈ -0.06 → τ ≈ 1.0
  const { tauScale, tauWeights, gain, confidence } = V5_SPEC.ews;
  const tauEstimate = Math.max(-1, Math.min(1, -r / tauScale));
  // 시계열 없으니 AR1/Var/Skew 모두 동일 추정값 사용
  const composite = tauWeights.ar1 * tauEstimate + tauWeights.variance * tauEstimate + tauWeights.skew * tauEstimate;
  const score = sigmoid(gain * composite) * 100; // gain 배 곱해 sigmoid 민감도↑
  const interp = score > 70
    ? "강한 critical slowing down 신호"
    : score > 50
      ? "약한 감소 추세 신호"
      : "시계열 부재 — 중간값";
  return { composite_score: score, confidence, interpretation: interp };
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
  // P0-4 fix: 부동소수점 안전 비교 — score=20.0 같은 boundary 값이 정확히 잡히도록
  const s = Math.round(score * 100) / 100;
  if (s < 20) return TIERS[0];      // T0
  if (s < 40) return TIERS[1];      // T1
  if (s < 60) return TIERS[2];      // T2
  if (s < 80) return TIERS[3];      // T3
  return TIERS[4];                   // T4
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

const TODAY = new Date("2026-05-04"); // CLAUDE.md currentDate

// 분수 년 → 일 단위 정밀 변환 (윤년 평균 365.25일)
function addYears(date: Date, years: number): Date {
  const d = new Date(date);
  const days = Math.round(years * 365.25);
  d.setDate(d.getDate() + days);
  return d;
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function evaluateTippingPoint(
  species: SpeciesRow,
  opts: { n_sim?: number; T?: number; seed?: number } = {}
): TippingPointResult | null {
  const T = opts.T ?? V5_SPEC.pva.years;
  const n_sim = opts.n_sim ?? V5_SPEC.pva.nSim;

  const life = lifeFor(species.class_name);
  // v4 Phase 1: IUCN 공식 trend 우선(Decreasing/Stable/Increasing), Unknown/null 이면 한글 fallback
  const { lambda_mean, lambda_sd, r } = trendToLambdaV4(
    species.iucn_population_trend ?? null,
    species.population_trend,
    species.category
  );

  // 절멸은 별도 처리 — extinct species 는 점수 100 + 멸종 날짜 = extinction_year
  if (species.category === "EX" || species.category === "EW") {
    return makeExtinctResult(species);
  }

  // N0 추정: 실측 개체수만 (v5). 없으면 데이터 부족 → 점수 산출 안 함.
  const N0 = inferPopulation(species);
  if (N0 === null) return null;

  // K (환경 수용력) — N0 가 감소 추세면 과거 K 가 더 컸다고 가정
  let K: number;
  if (r < 0) K = Math.max(N0 * 1.5, N0 + 100);  // 회복 가능한 환경
  else K = Math.max(N0 * 1.2, N0 + 50);
  const N_qext = 2;
  const N_allee = Math.max(20, Math.round(N0 * 0.05));

  // 종 ID 로 시드를 만들어 결정적이지만 종마다 다른 결과
  const seed = opts.seed ?? hashSeed(species.id);
  const pva = runPva({ N0, K, r, lambda_mean, lambda_sd, T, n_sim, N_qext, N_allee, seed });
  const iucn = evaluateIucn(N0, species.category, life.ne_nc);
  const ews = evaluateEws(species.population_trend, r);

  // ===== Aggregator (스펙 v3 가중치) =====
  // score = 0.30·EWS + 0.45·PVA + 0.25·IUCN
  const w = V5_SPEC.weights;
  const raw = w.ews * ews.composite_score + w.pva * pva.pva_score + w.iucn * iucn.iucn_score;

  // Consensus filter
  const at = V5_SPEC.alertThresholds;
  const highAlerts = [ews.composite_score > at.ews, pva.pva_score > at.pva, iucn.iucn_score > at.iucn].filter(Boolean).length;
  let consensus = raw;
  if (highAlerts === 0) consensus = raw * V5_SPEC.consensusMultiplier.zero;
  else if (highAlerts === 1) consensus = raw * V5_SPEC.consensusMultiplier.one;
  // ≥2 → 그대로 (다중 신호 신뢰)

  // Confidence-weighted compression
  const lc = V5_SPEC.lowConfidence;
  const overall_conf = w.ews * ews.confidence + w.pva * V5_SPEC.pva.confidence + w.iucn * iucn.confidence;
  if (overall_conf < lc.below) consensus = consensus * lc.scale + lc.add;

  // ===== Bottleneck floor — 절대 개체수 기반 강제 보정 =====
  //
  // [근거와 기재 현황 — 2026-09-12 조사, docs/population-floor-audit.md]
  //   도입: 커밋 d5525e0 (2026-05-04). 커밋 메시지에 적힌 근거 3항목:
  //     - IUCN Criterion D: N<50 CR, N<250 EN, N<1000 VU
  //     - Frankham 50/500: Ne<100 단기 위험, Ne<1000 장기
  //     - 단일 멸종사건 취약성: N<100 은 안정 추세여도 취약
  //   특허 명세서 미기재: full_spec v3·v4, 발명신고서 2판, PKA-1551 수정요청서 전수 검색에서
  //   이 규칙에 대응하는 기재 0건. 명세서는 출원이 끝나 고칠 수 없으므로, 챗봇이 하한 적용
  //   전 점수를 함께 밝히도록 표시만 추가했다 (lib/floor-transparency.ts).
  //   이 표를 바꾸면 lib/floor-transparency.ts 의 FLOOR_BANDS 도 같이 바꿀 것
  //   (__tests__/floor-transparency.test.ts 가 불일치를 잡는다).
  //
  // P0-2 fix: mature_individuals=NULL 이라도 카테고리 fallback (N0) 에 floor 적용
  // 카테고리 fallback 추정치는 confidence_cap=0.4 로 별도 표기 (다음 단계에서)
  // IUCN Criterion D + Frankham 50/500 + 단일 멸종사건 취약성 반영
  {
    // v5: 카테고리(CR/EN/VU) 기반 floor 전부 제거 — 순수 개체수 임계만 (Frankham 50/500·Criterion D 절대수).
    // 구간: V5_SPEC.floorBands — T4 골든타임 / T3 후반 / T3 중반 (자바코뿔소 76) / T3 진입
    const N = N0;
    const floor = V5_SPEC.floorBands.find((b) => N < b.below)?.floor ?? 0;
    consensus = Math.max(consensus, floor);
  }

  // 추세 보정 — 급감/감소/증가 모두 반영 (P1-2 fix)
  if (species.population_trend) {
    const trend = species.population_trend.toLowerCase();
    const ta = V5_SPEC.trendAdjust;
    if (trend.includes("급감")) consensus = Math.min(100, consensus + ta.sharpDecline);
    else if (trend.includes("증가") || trend.includes("회복") || trend.includes("increas")) {
      // 회복 중 종은 점수 하향 (반달가슴곰 같은 재도입 성공 사례 보호)
      consensus = Math.max(0, consensus + ta.recovering);
    } else if (trend.includes("감소") || trend.includes("decreas")) {
      consensus = Math.min(100, consensus + ta.decline); // v5: 카테고리 조건 제거
    }
  }

  // P0-4 fix 보강: 저장될 score 와 동일한 정밀도로 tier 결정
  // (score 1자리 반올림 후 tier 판정 → 사용자에게 표시되는 score 와 tier 일관성)
  const displayScore = Math.round(consensus * 10) / 10;
  const tier = tierForScore(displayScore);

  // ===== v2.0 (출원 정합본) §1.3: 4개 시점 분위수 매핑 =====
  // 시나리오 A (무대응): intervention_deadline (Allee p10), no_action_extinction (extinction p10)
  // 시나리오 B (응급조치): golden_time_end (T4 진입 score 시계열 p50)
  // 신고서 §8 바키타 실시예 정합 — p10 보수적, 조기 경보

  const lifeForCalc = lifeFor(species.class_name);
  const neRatio = lifeForCalc.ne_nc;
  const T_horizon = T;

  // 시나리오 B (golden_time_end): trajectory score 시계열에서 80 첫 도달 (p50)
  const t4EntryTimes: number[] = [];
  for (let sIdx = 0; sIdx < n_sim; sIdx++) {
    const scoreSeries = trajectoryToScore(pva.trajectories[sIdx], K, N_allee, neRatio);
    for (let t = 0; t < scoreSeries.length; t++) {
      if (scoreSeries[t] >= 80) {
        t4EntryTimes.push(t);
        break;
      }
    }
  }

  let yearsToGolden: number;
  if (t4EntryTimes.length >= n_sim * 0.05) {
    const sorted = [...t4EntryTimes].sort((a, b) => a - b);
    yearsToGolden = percentile(sorted, 0.5);
  } else {
    yearsToGolden = T_horizon;
  }

  // 시나리오 A: intervention_deadline = allee_times p10 (v1 p25 → v2 p10)
  let yearsToDeadline: number;
  if (pva.allee_times.length >= n_sim * 0.05) {
    const sorted = [...pva.allee_times].sort((a, b) => a - b);
    yearsToDeadline = percentile(sorted, 0.10);
  } else {
    yearsToDeadline = T_horizon;
  }

  // 시나리오 A: no_action_extinction = extinction_times p10 (v1 p50 → v2 p10, 신고서 §8 정합)
  let yearsToExtinction: number;
  if (pva.extinction_times.length >= n_sim * 0.05) {
    const sorted = [...pva.extinction_times].sort((a, b) => a - b);
    yearsToExtinction = percentile(sorted, 0.10);
  } else {
    yearsToExtinction = T_horizon;
  }

  // §1.5 시간 순서 invariant — 시나리오 A 내부만: deadline ≤ extinction
  // golden_time_end 는 별도 시나리오라 invariant 강제 X
  yearsToGolden = safeYears(yearsToGolden);
  yearsToDeadline = safeYears(yearsToDeadline);
  yearsToExtinction = safeYears(yearsToExtinction);
  if (yearsToExtinction < yearsToDeadline) yearsToExtinction = yearsToDeadline;

  const interventionOpen = TODAY;
  const goldenDate = addYears(TODAY, yearsToGolden);
  const interventionDeadline = addYears(TODAY, yearsToDeadline);
  const extinctionDate = addYears(TODAY, yearsToExtinction);

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
        confidence: V5_SPEC.pva.confidence,
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

// 등급별 개체수 중앙값 fallback (실측·criterion 없을 때 최후 추정)
const CATEGORY_FALLBACK: Record<string, number> = {
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

// C-2: IUCN criteria(평가 근거) 기반 fallback 세분화 — 위협등급(CR/EN/VU) 전용.
//   대문자 A~E 만 Criterion (소문자 a,b,c,d 는 sub-criteria → 무시).
//   우선순위: D(성체수 절대값) > C(개체군+감소) > A(감소율) > B/E/기타(등급 base).
//   복수 조합은 D 우선, 없으면 개체수 관련 criterion 중 가장 보수적(낮은) 값.
function inferPopFromCriterion(category: string, criteria: string | null, base: number): number {
  if (!criteria) return base;
  const letters = new Set(criteria.match(/[A-E]/g) ?? []); // 대문자 Criterion 만
  const dNum = criteria.match(/D(\d)/)?.[1];               // D1 / D2 구분

  // Criterion D — 성체수 절대 임계 (가장 직접적)
  if (letters.has("D")) {
    if (category === "CR") return dNum === "1" ? 30 : 25;   // CR D: <50 성체
    if (category === "EN") return dNum === "1" ? 200 : 150; // EN D: <250
    if (category === "VU") return dNum === "2" ? 800 : 500; // VU D1: <1000, D2: 제한분포
  }
  // Criterion C — 개체군 크기 + 지속 감소
  if (letters.has("C")) {
    if (category === "CR") return 150;   // 100~200
    if (category === "EN") return 1200;
    if (category === "VU") return 4000;
  }
  // Criterion A — 감소율 기반 (저개체군화 반영, base 근처)
  if (letters.has("A")) {
    if (category === "CR") return 200;   // 150~250
    if (category === "EN") return 1200;  // 1000~2000
    if (category === "VU") return 4500;
  }
  // Criterion B(서식지범위, 개체수 무관) / E(정량분석) / 기타 → 등급 base
  return base;
}

export type PopulationSource =
  | "mature_individuals"
  | "iucn_population_size"
  | "data_insufficient";

// N0 추정 + 출처 태깅.
// v5 (2026-08-01): IUCN 등급/Criterion 기반 개체수 추정 전면 제거.
//   실측 개체수(수기 mature_individuals · IUCN 명시 population_size)만 사용하고,
//   둘 다 없으면 value=null(데이터 부족) → 점수 산출 안 함.
//   등급 무관하게 iucn_population_size 사용(카테고리 게이트 제거). subpopulation
//   수치가 섞일 수 있는 데이터 한계는 별도 문서화.
export function inferPopulationWithSource(s: SpeciesRow): { value: number | null; source: PopulationSource } {
  if (s.mature_individuals && s.mature_individuals > 0)
    return { value: s.mature_individuals, source: "mature_individuals" };
  if (s.iucn_population_size && s.iucn_population_size > 0)
    return { value: s.iucn_population_size, source: "iucn_population_size" };
  return { value: null, source: "data_insufficient" };
}

function inferPopulation(s: SpeciesRow): number | null {
  return inferPopulationWithSource(s).value;
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
