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
import { damuthK } from "./damuth-k";

/**
 * 엔진 버전 — payload.engine_version 에 기록된다.
 *   5.0.0  v5 개체수 전용 점수 (2026-08-01)
 *   5.1.0  2026-10-03 — m≥2 max 블렌딩(결정 6), NaN·Infinity 궤적 제외(결정 8), Damuth K 분기(결정 7),
 *          계산 추적(payload.inputs · payload.aggregation) 기록
 */
export const ENGINE_VERSION = "5.1.0";

/** K 를 어떤 식으로 정했는가 — damuth: 체중·서식 면적 / fallback: 기존 식 (감소 추세면 _declining) */
export type KSource = "damuth" | "fallback" | "fallback_declining";

// ===== v5 계산 상수 =====
// 엔진이 실제로 쓰는 값 그대로다. /methodology 페이지와 lib/floor-transparency.ts 가 여기서 읽는다.
// 값을 바꾸면 v5 점수가 바뀐다 (2026-09-13 식 안의 숫자를 이름 붙인 상수로 옮김 — 값·연산 순서 무변경,
// 전 종 재계산 대조로 확인).
export const V5_SPEC = {
  /** 종합 가중치 — 점수₀ = Σ w·레이어 점수 */
  weights: { ews: 0.3, pva: 0.45, iucn: 0.25 },
  /** 다수결 — 레이어 점수가 이 값을 넘으면 경보 1표 */
  alertThresholds: { ews: 70, pva: 50, iucn: 60 },
  /** 경보 표 수에 따른 배율 — 0표·1표 (2표 이상은 majorityBlend) */
  consensusMultiplier: { zero: 0.6, one: 0.85 },
  /**
   * 2표 이상 — 가중합과 최댓값을 섞는다: α·S_weighted + (1−α)·max(s_i).
   * 결정 6 (2026-10-03): 명세서(full_spec §5.3, PKA-1551 B-2) 의 m ≥ 2 분기를 따른다. 그 전에는 가중합을 그대로 썼다.
   */
  majorityBlend: { alpha: 0.6 },
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
  extinction_times: number[]; // 각 유효 sim 의 멸종 연도 (분수년) — 멸종 안하면 미포함
  allee_times: number[];      // 각 유효 sim 의 Allee threshold 도달 연도 — 도달 안하면 미포함
  trajectories: number[][];   // (n_valid, T+1) 유효 trajectory 만 — score 시계열 변환용
  /** 집계에 쓴 유효 궤적 수 (결정 8 — NaN·Infinity 궤적 제외) */
  n_valid: number;
  /** 값이 유한하지 않게 된 궤적 수 — 집계에서 뺐다 */
  n_invalid: number;
  /** 무효 궤적 중 멸종 판정에서 Math.min(1, NaN) = NaN 이 나온 궤적 수 */
  n_ext_time_nan: number;
  /** PVA 점수의 결손항 입력 — N_safe = max(K·safeKFraction, safeMinN), ratio = min(1, N0/N_safe) */
  N_safe: number;
  ratio: number;
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
  // sim 별 trajectory (n_sim × T+1)
  const simTraj: number[][] = Array.from({ length: n_sim }, () => new Array(T + 1).fill(0));
  // 결정 8 (2026-10-03) — 값이 유한하지 않게 된 궤적은 집계에서 뺀다.
  //   Math.exp 는 손대지 않는다 (JS 의 exp 넘침 → Infinity 동작을 그대로 재현한다). 대신 그 결과를 검사한다:
  //   N 이 K 보다 수백 배 커지면 exp(r_t·(1−N/K)) 가 Infinity 로 넘치고, poissonSample 의 정규 근사에서
  //   Infinity − Infinity = NaN 이 된다. 그 궤적의 멸종 판정 frac = (prevN−2)/(prevN−N) 는 Inf/Inf = NaN 이고
  //   Math.min(1, NaN) = NaN 이 멸종 시각을 NaN 으로 만든다 — NaN 시각은 t <= 50 비교에서 빠져 P_ext 를 낮추고
  //   중앙값 정렬을 흐트러뜨린다. 그래서 그런 궤적을 "무효" 로 표시하고 확률·분위수·평균의 분모에서 뺀다.
  //
  //   무효로 표시해도 시뮬레이션은 끝까지 예전과 똑같이 돌린다 (중간에 break 하지 않는다).
  //   중간에 멈추면 그 sim 이 남은 해에 쓰던 난수를 건너뛰어 다음 sim 부터 난수열이 밀린다 —
  //   그러면 "무효 궤적을 뺀 효과" 에 "다른 표본을 뽑은 효과" 가 섞인다 (2026-10-03 첫 구현 6e41d4e 의 결함 —
  //   점수 변동 45종 중 하락 14종이 이 재추출 잡음이었다. 고친 뒤에는 26종, 전부 상승).
  //   그래서 유효 궤적은 결정 8 이전 엔진과 난수까지 같고, 바뀌는 것은 무효 궤적이 빠진 집계뿐이다.
  const validSims: number[] = [];
  let nExtTimeNaN = 0; // 멸종 판정에서 Math.min(1, NaN) = NaN 이 나온 궤적 수 (무효 궤적의 일부)

  for (let s = 0; s < n_sim; s++) {
    let N = N0;
    let prevN = N;
    simTraj[s][0] = N;
    let extinctAt: number | null = null;
    let alleeAt: number | null = null;
    let invalid = false;

    for (let t = 1; t <= T; t++) {
      if (N <= 0) {
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
      simTraj[s][t] = N;

      // Infinity·NaN 궤적 — 이 궤적은 무효. 난수 소비를 예전과 같게 두려고 루프는 그대로 계속한다
      if (!Number.isFinite(N)) invalid = true;

      // 준멸종 (N<2)
      if (N < N_qext && extinctAt === null) {
        if (prevN > N) {
          const frac = (prevN - N_qext) / (prevN - N);
          const within = Math.max(0, Math.min(1, frac));
          // Math.min(1, NaN) = NaN 을 명시적으로 검사한다 — prevN 이 Infinity 이던 궤적 (Inf/Inf = NaN).
          // 이 궤적의 멸종 시각은 NaN 이라 P_ext·중앙값에 넣을 수 없다 → 무효
          if (Number.isNaN(within)) {
            invalid = true;
            nExtTimeNaN++;
          }
          extinctAt = (t - 1) + within;
        } else {
          extinctAt = t;
        }
        // 멸종 후 0 유지
        for (let tt = t; tt <= T; tt++) {
          simTraj[s][tt] = 0;
        }
        break;
      }
    }
    if (invalid) continue;
    validSims.push(s);
    finalNs.push(N);
    if (extinctAt !== null) extTimes.push(extinctAt);
    if (alleeAt !== null) alleeTimes.push(alleeAt);
  }

  const nValid = validSims.length;
  const nDenom = Math.max(nValid, 1); // 전부 무효면 확률 0 으로 둔다 (n_valid = 0 이 함께 기록된다)
  const extCount50 = extTimes.filter((t) => t <= V5_SPEC.pva.horizons.short).length;
  const extCount100 = extTimes.filter((t) => t <= V5_SPEC.pva.horizons.long).length;
  const extCountT = extTimes.filter((t) => t <= T).length;
  const P_ext_50 = extCount50 / nDenom;
  const P_ext_100 = extCount100 / nDenom;
  const P_ext_T = extCountT / nDenom;

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

  // Trajectory percentiles per year — 유효 궤적만, sim 순서 그대로 (무효가 없으면 예전과 같은 합산 순서)
  const trajMean: number[] = [];
  const trajP10: number[] = [];
  const trajP90: number[] = [];
  for (let t = 0; t <= T; t++) {
    const col = validSims.map((s) => simTraj[s][t]);
    const sorted = [...col].sort((a, b) => a - b);
    trajMean.push(col.reduce((a, b) => a + b, 0) / nDenom);
    trajP10.push(sorted[Math.floor(0.1 * nValid)] ?? 0);
    trajP90.push(sorted[Math.floor(0.9 * nValid)] ?? 0);
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
    trajectories: validSims.map((s) => simTraj[s]),
    n_valid: nValid,
    n_invalid: n_sim - nValid,
    n_ext_time_nan: nExtTimeNaN,
    N_safe,
    ratio,
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

// [흐름 3/3] Layer 3 — 유효개체군(Ne) 단독 평가.
//   ① Ne = round(Nc · ne_nc)  ← ne_nc 는 LIFE_HISTORY 의 분류군 값 (포유류 0.15)
//   ② Ne 를 neBands 에 넣어 점수/등급 결정 (Frankham 50/500 규칙의 구간화)
//   ③ iucn_score = genetic_score — 즉 이 레이어는 사실상 "Ne 점수" 다.
// 주의: 함수명과 category 인자는 v4 잔재다. v5 에서 IUCN 등급은 점수에 안 쓰인다.
function evaluateIucn(N: number, category: string, ne_nc: number): IucnResult {
  // (6) Ne/Nc 적용 — Nc(총 개체수) → Ne(유효개체군).
  //   포유류 0.15: N=76(자바코뿔소) → Ne = round(76 × 0.15) = 11.
  //   명세서 PKA-1551 C-1 은 포유류 0.2 로 적어 Ne ≈ 15 를 제시한다 —
  //   코드와 값이 다르다 (docs/pka-1551-discrepancies.md 표 5번 항목).
  //   0.15 자체의 출처도 저장소에서 확인되지 않았다 (Frankham 1995 일반값 0.10~0.11 보다 높음).
  const Ne = Math.round(N * ne_nc);

  // 50/500 규칙 구간 — Ne 가 below 미만인 "첫" 구간이 적용된다 (배열 순서 = 위험 높은 순).
  //   Ne<50 CRITICAL 95 / <100 ENDANGERED 80 / <500 VULNERABLE 55 / <1000 NEAR_THREAT 30 / 그 외 SAFE 10
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
  /** τ 추정값 = clamp(−r / tauScale, −1, 1) 과 clamp 전 값 */
  tau: number;
  tau_raw: number;
  /** τ 가중합 (AR1·분산·왜도 가중치 합 × τ) */
  composite: number;
}

function evaluateEws(trend: string | null, r: number): EwsResult {
  // 스펙 v3: ews_score = sigmoid(0.5·τ_AR1 + 0.3·τ_Var + 0.2·τ_Skew) · 100
  // 시계열 부재 → 모든 τ = 0 → sigmoid(0) = 0.5 → ews_score = 50
  // 단, r 부호로 약한 추정 신호 부여 (감소 추세면 양의 τ 가정)
  const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
  // r 가 음수일수록 τ 가 양수 (CSD 신호) — r ≈ -0.06 → τ ≈ 1.0
  const { tauScale, tauWeights, gain, confidence } = V5_SPEC.ews;
  const tauRaw = -r / tauScale;
  const tauEstimate = Math.max(-1, Math.min(1, tauRaw));
  // 시계열 없으니 AR1/Var/Skew 모두 동일 추정값 사용
  const composite = tauWeights.ar1 * tauEstimate + tauWeights.variance * tauEstimate + tauWeights.skew * tauEstimate;
  const score = sigmoid(gain * composite) * 100; // gain 배 곱해 sigmoid 민감도↑
  const interp = score > 70
    ? "강한 critical slowing down 신호"
    : score > 50
      ? "약한 감소 추세 신호"
      : "시계열 부재 — 중간값";
  return { composite_score: score, confidence, interpretation: interp, tau: tauEstimate, tau_raw: tauRaw, composite };
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

// ===== 종합 점수 집계 — 순수 함수 =====
// 엔진(evaluateTippingPoint)·계산 근거 페이지·챗봇(lib/floor-transparency.ts)이 모두 이 함수 하나를 쓴다.
// 예전에는 floor-transparency 가 이 단계를 따로 옮겨 적어 엔진과 어긋날 위험이 있었다.

export type MajorityBranch = "blend" | "single" | "none";
export type TrendAdjustKind = "sharp_decline" | "recovering" | "decline";

export interface AggregationInput {
  layers: { ews: number; pva: number; iucn: number };
  /** 레이어 신뢰도 — PVA 는 상수(V5_SPEC.pva.confidence)라 받지 않는다 */
  confidences: { ews: number; iucn: number };
  N0: number;
  /** species.population_trend (한글 문자열) — 추세 보정 입력 */
  populationTrend: string | null;
}

export interface AggregationTrace {
  weights: { ews: number; pva: number; iucn: number };
  layers: { ews: number; pva: number; iucn: number };
  /** S_weighted = Σ w·s */
  weighted: number;
  thresholds: { ews: number; pva: number; iucn: number };
  alerts: { ews: boolean; pva: boolean; iucn: boolean };
  /** 경보 표 수 (명세서의 m) */
  m: number;
  branch: MajorityBranch;
  maxLayer: number;
  /** m = 0·1 일 때 곱한 배율. blend 분기면 null */
  majorityFactor: number | null;
  /** m ≥ 2 일 때 α. 아니면 null */
  blendAlpha: number | null;
  afterMajority: number;
  confidence: { ews: number; pva: number; iucn: number; overall: number };
  compressionApplied: boolean;
  /** 하한·추세 보정 전 합의점수 */
  afterCompression: number;
  floor: { value: number; below: number | null; applied: boolean };
  afterFloor: number;
  trend: { kind: TrendAdjustKind | null; delta: number; input: string | null };
  /** 추세 보정까지 끝난 값 (반올림 전) */
  final: number;
  /** 1자리 반올림 — 저장되는 consensus_score */
  score: number;
  /** 같은 계산에서 개체수 하한만 뺀 점수 (1자리 반올림) */
  scoreWithoutFloor: number;
}

function trendKindOf(populationTrend: string | null): TrendAdjustKind | null {
  if (!populationTrend) return null;
  const t = populationTrend.toLowerCase();
  if (t.includes("급감")) return "sharp_decline";
  if (t.includes("증가") || t.includes("회복") || t.includes("increas")) return "recovering";
  if (t.includes("감소") || t.includes("decreas")) return "decline";
  return null;
}

function applyTrend(consensus: number, kind: TrendAdjustKind | null): number {
  const ta = V5_SPEC.trendAdjust;
  if (kind === "sharp_decline") return Math.min(100, consensus + ta.sharpDecline);
  // 회복 중 종은 점수 하향 (반달가슴곰 같은 재도입 성공 사례 보호)
  if (kind === "recovering") return Math.max(0, consensus + ta.recovering);
  if (kind === "decline") return Math.min(100, consensus + ta.decline); // v5: 카테고리 조건 제거
  return consensus;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/**
 * @param opts.blendAlpha m ≥ 2 분기의 α 를 바꿔 계산한다 — 반사실 비교용(블렌딩 전 점수 등). 엔진은 넘기지 않는다.
 */
export function aggregateConsensus(input: AggregationInput, opts: { blendAlpha?: number } = {}): AggregationTrace {
  // ===== (2) 가중치 계산 — S_weighted =====
  // 고정 가중치다. 명세서가 말하는 "신뢰도 동적 가중치"는 구현돼 있지 않다.
  //   레이어 신뢰도(0.25 / 0.7 / 0.85)는 가중치에 안 들어가고,
  //   아래 (3-b) 저신뢰 압축에서 한 번만 쓰인다.
  // raw = 0.30·EWS + 0.45·PVA + 0.25·IUCN
  const w = V5_SPEC.weights;
  const { ews, pva, iucn } = input.layers;
  const weighted = w.ews * ews + w.pva * pva + w.iucn * iucn;

  // ===== (3) 합의점수 C 산출 =====
  // (3-a) 다수결 투표 — 각 레이어가 자기 임계값을 넘으면 경보 1표.
  //   임계값이 레이어마다 다르다: EWS>70, PVA>50, IUCN>60.
  //   명세서(full_spec §5.3 / PKA-1551 B-2)는 공통 H=60 으로 m 을 세라고 한다 → 코드와 불일치.
  const at = V5_SPEC.alertThresholds;
  const alerts = { ews: ews > at.ews, pva: pva > at.pva, iucn: iucn > at.iucn };
  const m = [alerts.ews, alerts.pva, alerts.iucn].filter(Boolean).length;
  const maxLayer = Math.max(ews, pva, iucn);

  // ===== (4) m 기반 분기 (명세서 표기 α, β, γ) =====
  //   m ≥ 2  명세서·코드: S = α·S_weighted + (1−α)·max(s1,s2,s3),  α = 0.6  ← 결정 6 (2026-10-03) 으로 구현
  //   m = 1  명세서: S = S_weighted × β,  β = 0.85
  //          코드:   S = raw × consensusMultiplier.one  = 0.85  ← 일치
  //   m = 0  명세서: S = S_weighted × γ,  γ = 0.70
  //          코드:   S = raw × consensusMultiplier.zero = 0.60  ← 값 불일치 (0.70 vs 0.60), 결정 대기
  // 2026-10-03 전에는 m ≥ 2 에서 가중합을 그대로 썼다 (docs/max-blending-impact-2026-10-03.md).
  let branch: MajorityBranch;
  let majorityFactor: number | null = null;
  let blendAlpha: number | null = null;
  let afterMajority: number;
  if (m === 0) {
    branch = "none";
    majorityFactor = V5_SPEC.consensusMultiplier.zero;
    afterMajority = weighted * majorityFactor;
  } else if (m === 1) {
    branch = "single";
    majorityFactor = V5_SPEC.consensusMultiplier.one;
    afterMajority = weighted * majorityFactor;
  } else {
    branch = "blend";
    blendAlpha = opts.blendAlpha ?? V5_SPEC.majorityBlend.alpha;
    afterMajority = blendAlpha * weighted + (1 - blendAlpha) * maxLayer;
  }

  // (3-b) 저신뢰 압축 — 레이어 신뢰도의 가중평균이 0.5 미만이면 점수를 중앙으로 민다.
  //   ×0.9 는 극단값을 눌러 과신을 줄이고, +10 은 바닥을 올려 과소평가를 막는 방향.
  const lc = V5_SPEC.lowConfidence;
  const pvaConfidence = V5_SPEC.pva.confidence;
  const overall = w.ews * input.confidences.ews + w.pva * pvaConfidence + w.iucn * input.confidences.iucn;
  const compressionApplied = overall < lc.below;
  const afterCompression = compressionApplied ? afterMajority * lc.scale + lc.add : afterMajority;

  // ===== (5) 개체수 하한(floor) — 절대 개체수 기반 강제 보정 =====
  // 위에서 계산한 합의점수를 "덮어쓴다". Math.max 라서 하한보다 낮으면 무조건 끌어올린다.
  // 근거와 기재 현황은 evaluateTippingPoint 안의 floor 주석과 docs/population-floor-audit.md 참고.
  const band = V5_SPEC.floorBands.find((b) => input.N0 < b.below);
  const floorValue = band?.floor ?? 0;
  const afterFloor = Math.max(afterCompression, floorValue);

  // 추세 보정 — 급감/감소/증가 모두 반영 (P1-2 fix)
  const kind = trendKindOf(input.populationTrend);
  const final = applyTrend(afterFloor, kind);

  return {
    weights: { ...w },
    layers: { ews, pva, iucn },
    weighted,
    thresholds: { ...at },
    alerts,
    m,
    branch,
    maxLayer,
    majorityFactor,
    blendAlpha,
    afterMajority,
    confidence: { ews: input.confidences.ews, pva: pvaConfidence, iucn: input.confidences.iucn, overall },
    compressionApplied,
    afterCompression,
    floor: { value: floorValue, below: band?.below ?? null, applied: floorValue > afterCompression },
    afterFloor,
    trend: { kind, delta: final - afterFloor, input: input.populationTrend },
    final,
    score: round1(final),
    scoreWithoutFloor: round1(applyTrend(afterCompression, kind)),
  };
}

export interface TippingPointResult {
  consensus_score: number;
  intervention_tier: string;
  tier_label: string;
  tier_color: string;
  layer_scores: {
    ews: {
      score: number;
      confidence: number;
      interpretation: string;
      /** 계산 추적 (5.1.0~). 절멸 종 결과에는 없다 */
      tau?: number;
      tau_raw?: number;
      composite?: number;
    };
    pva: {
      score: number;
      P_ext_50yr: number;
      P_ext_100yr: number;
      median_T_ext: number | null;
      confidence: number;
      /** 집계에 쓴 유효 궤적 수 / 제외한 궤적 수 (결정 8). 절멸 종 결과에는 없다 */
      n_valid?: number;
      n_invalid?: number;
      n_ext_time_nan?: number;
      /** 결손항 입력 — N_safe = max(K·safeKFraction, safeMinN), ratio = min(1, N0/N_safe) */
      N_safe?: number;
      ratio?: number;
    };
    iucn: {
      score: number;
      Ne: number;
      genetic_status: string;
      confidence: number;
      /** Ne = round(N0 · ne_nc) 의 ne_nc 와 적용된 구간 상한 (5.1.0~) */
      ne_nc?: number;
      band_below?: number | null;
    };
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
  /** 계산 추적 (5.1.0~) — 절멸 종 결과에는 없다 */
  engine_version?: string;
  inputs?: TippingInputs;
  aggregation?: AggregationTrace;
}

export interface TippingInputs {
  N0: number;
  N0_source: PopulationSource;
  trend_iucn: string | null;
  trend_korean: string | null;
  r: number;
  /** iucn · korean · default — trendToLambdaV4 가 어느 추세를 썼는가 */
  r_source: string;
  lambda_mean: number;
  lambda_sd: number;
  K: number;
  K_source: KSource;
  /** Damuth 를 쓰지 못했으면 그 이유 (no_mass · no_habitat_area · no_constant · unverified_constant) */
  K_damuth_skip: string | null;
  mass_g_used: number | null;
  habitat_area_km2: number | null;
  N_allee: number;
  N_qext: number;
  T: number;
  n_sim: number;
  seed: number;
  class_name: string | null;
  life: { generation_time: number; r_max: number; ne_nc: number };
  /** class_name 에 맞는 생활사 값이 있으면 true, 없어서 DEFAULT_LIFE 를 썼으면 false */
  life_from_class: boolean;
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
  const { lambda_mean, lambda_sd, r, source: r_source } = trendToLambdaV4(
    species.iucn_population_trend ?? null,
    species.population_trend,
    species.category
  );

  // 절멸은 별도 처리 — extinct species 는 점수 100 + 멸종 날짜 = extinction_year
  if (species.category === "EX" || species.category === "EW") {
    return makeExtinctResult(species);
  }

  // N0 추정: 실측 개체수만 (v5). 없으면 데이터 부족 → 점수 산출 안 함.
  const pop = inferPopulationWithSource(species);
  const N0 = pop.value;
  if (N0 === null) return null;

  // K (환경 수용력)
  //   결정 7 (2026-10-03): 서식 면적 · 체중 · 검증된 Damuth 상수가 모두 있으면 Damuth K (lib/damuth-k.ts),
  //   하나라도 없으면 기존 식 — N0 가 감소 추세면 과거 K 가 더 컸다고 가정.
  //   지금 DB 에는 서식 면적이 있는 종이 없어 전 종이 기존 식을 탄다.
  const massG = species.mass_g && species.mass_g > 0 ? species.mass_g : species.mass_g_external ?? null;
  const damuth = damuthK({ massG, className: species.class_name, habitatAreaKm2: species.habitat_area_km2 ?? null });
  let K: number;
  let K_source: KSource;
  if (damuth.ok) {
    K = damuth.K;
    K_source = "damuth";
  } else if (r < 0) {
    K = Math.max(N0 * 1.5, N0 + 100);  // 회복 가능한 환경
    K_source = "fallback_declining";
  } else {
    K = Math.max(N0 * 1.2, N0 + 50);
    K_source = "fallback";
  }
  const N_qext = 2;
  const N_allee = Math.max(20, Math.round(N0 * 0.05));

  // 종 ID 로 시드를 만들어 결정적이지만 종마다 다른 결과
  const seed = opts.seed ?? hashSeed(species.id);

  // ===== (1) 3레이어 점수 산출 =====
  // 세 레이어는 서로 독립이다. 같은 N0 를 보지만 보는 각도가 다르다.
  //   L2 PVA  — 1500회 몬테카를로로 "50/100년 내 멸종확률" → 0~100
  //   L3 IUCN — Ne 임계값 하나로 "유전적 소멸 위험" → 0~100 (등급 미사용)
  //   L1 EWS  — 시계열이 없어 추세 r 만 sigmoid 에 통과시킨 약한 신호 → 0~100
  const pva = runPva({ N0, K, r, lambda_mean, lambda_sd, T, n_sim, N_qext, N_allee, seed });
  const iucn = evaluateIucn(N0, species.category, life.ne_nc);
  const ews = evaluateEws(species.population_trend, r);

  // ===== (2)~(5) 종합 점수 — aggregateConsensus (가중합 → 다수결 분기 → 저신뢰 압축 → 개체수 하한 → 추세 보정) =====
  //
  // 개체수 하한(floor) 은 합의점수를 "덮어쓴다". Math.max 라서 하한보다 낮으면 무조건 끌어올린다.
  // 이 한 단계가 소형 개체군에서는 (1)~(4) 전체보다 강하게 작동한다 —
  // 예: 자바코뿔소 N0=76 → 레이어 EWS 50 · PVA 37.04 · Ne 95 (엔진 5.1.0, 기본 시드), 가중합 55.42,
  //     m=1 감쇠 후 47.11 — 그러나 floorBands 의 N<100 → 78 이 적용돼 최종 78 이 된다. 47.11 은 버려진다.
  //     (5.0 의 PVA 37.0 은 무효 궤적 12개가 분모에 섞인 값이었고, 예전 주석의 35.8·46.65 는 seed 42 값이었다
  //      — seed 42 로 5.0 엔진을 돌리면 PVA 35.843, ×0.85 = 46.648)
  //
  // [근거와 기재 현황 — 2026-09-12 조사, docs/population-floor-audit.md]
  //   도입: 커밋 d5525e0 (2026-05-04). 커밋 메시지에 적힌 근거 3항목:
  //     - IUCN Criterion D: N<50 CR, N<250 EN, N<1000 VU
  //     - Frankham 50/500: Ne<100 단기 위험, Ne<1000 장기
  //     - 단일 멸종사건 취약성: N<100 은 안정 추세여도 취약
  //   특허 명세서 미기재: full_spec v3·v4, 발명신고서 2판, PKA-1551 수정요청서 전수 검색에서
  //   이 규칙에 대응하는 기재 0건. 결정 1 (2026-10-03): 규칙은 유지하고, 챗봇과 계산 근거 페이지가
  //   "개체수 하한 규칙 적용됨" 과 하한 적용 전 점수를 함께 밝힌다 (lib/floor-transparency.ts).
  //   표시 쪽은 이 함수의 결과(payload.aggregation)를 그대로 읽으므로 따로 고칠 사본이 없다.
  //
  // v5: 카테고리(CR/EN/VU) 기반 floor 전부 제거 — 순수 개체수 임계만 (Frankham 50/500·Criterion D 절대수).
  const agg = aggregateConsensus({
    layers: { ews: ews.composite_score, pva: pva.pva_score, iucn: iucn.iucn_score },
    confidences: { ews: ews.confidence, iucn: iucn.confidence },
    N0,
    populationTrend: species.population_trend,
  });
  const consensus = agg.final;
  const overall_conf = agg.confidence.overall;

  // P0-4 fix 보강: 저장될 score 와 동일한 정밀도로 tier 결정
  // (score 1자리 반올림 후 tier 판정 → 사용자에게 표시되는 score 와 tier 일관성)
  const displayScore = agg.score;
  const tier = tierForScore(displayScore);

  // ===== v2.0 (출원 정합본) §1.3: 4개 시점 분위수 매핑 =====
  // 시나리오 A (무대응): intervention_deadline (Allee p10), no_action_extinction (extinction p10)
  // 시나리오 B (응급조치): golden_time_end (T4 진입 score 시계열 p50)
  // 신고서 §8 바키타 실시예 정합 — p10 보수적, 조기 경보

  const lifeForCalc = lifeFor(species.class_name);
  const neRatio = lifeForCalc.ne_nc;
  const T_horizon = T;

  // 시나리오 B (golden_time_end): trajectory score 시계열에서 80 첫 도달 (p50)
  // 분모는 유효 궤적 수 (결정 8 — 무효 궤적은 pva.trajectories 에 없다)
  const t4EntryTimes: number[] = [];
  for (const trajectory of pva.trajectories) {
    const scoreSeries = trajectoryToScore(trajectory, K, N_allee, neRatio);
    for (let t = 0; t < scoreSeries.length; t++) {
      if (scoreSeries[t] >= 80) {
        t4EntryTimes.push(t);
        break;
      }
    }
  }

  let yearsToGolden: number;
  if (t4EntryTimes.length >= pva.n_valid * 0.05) {
    const sorted = [...t4EntryTimes].sort((a, b) => a - b);
    yearsToGolden = percentile(sorted, 0.5);
  } else {
    yearsToGolden = T_horizon;
  }

  // 시나리오 A: intervention_deadline = allee_times p10 (v1 p25 → v2 p10)
  let yearsToDeadline: number;
  if (pva.allee_times.length >= pva.n_valid * 0.05) {
    const sorted = [...pva.allee_times].sort((a, b) => a - b);
    yearsToDeadline = percentile(sorted, 0.10);
  } else {
    yearsToDeadline = T_horizon;
  }

  // 시나리오 A: no_action_extinction = extinction_times p10 (v1 p50 → v2 p10, 신고서 §8 정합)
  let yearsToExtinction: number;
  if (pva.extinction_times.length >= pva.n_valid * 0.05) {
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
    consensus_score: agg.score,
    intervention_tier: tier.tier,
    tier_label: tier.label,
    tier_color: tier.color,
    layer_scores: {
      ews: {
        score: ews.composite_score,
        confidence: ews.confidence,
        interpretation: ews.interpretation,
        tau: ews.tau,
        tau_raw: ews.tau_raw,
        composite: ews.composite,
      },
      pva: {
        score: pva.pva_score,
        P_ext_50yr: pva.P_ext_50yr,
        P_ext_100yr: pva.P_ext_100yr,
        median_T_ext: pva.median_T_ext,
        confidence: V5_SPEC.pva.confidence,
        n_valid: pva.n_valid,
        n_invalid: pva.n_invalid,
        n_ext_time_nan: pva.n_ext_time_nan,
        N_safe: pva.N_safe,
        ratio: pva.ratio,
      },
      iucn: {
        score: iucn.iucn_score,
        Ne: iucn.Ne,
        genetic_status: iucn.genetic_status,
        confidence: iucn.confidence,
        ne_nc: life.ne_nc,
        band_below: V5_SPEC.neBands.find((b) => iucn.Ne < b.below)?.below ?? null,
      },
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
    engine_version: ENGINE_VERSION,
    inputs: {
      N0,
      N0_source: pop.source,
      trend_iucn: species.iucn_population_trend ?? null,
      trend_korean: species.population_trend ?? null,
      r,
      r_source,
      lambda_mean,
      lambda_sd,
      K,
      K_source,
      K_damuth_skip: damuth.ok ? null : damuth.reason,
      mass_g_used: massG,
      habitat_area_km2: species.habitat_area_km2 ?? null,
      N_allee,
      N_qext,
      T,
      n_sim,
      seed,
      class_name: species.class_name,
      life: { generation_time: life.generation_time, r_max: life.r_max, ne_nc: life.ne_nc },
      life_from_class: hasClassLifeHistory(species.class_name),
    },
    aggregation: agg,
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
