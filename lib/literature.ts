// 보전유전학·개체군생태학 문헌 기준값 — 코드 상수
//
// 원칙
//   1. DB 에 넣지 않는다. 값이 바뀌면 이 파일에서 고친다.
//   2. v5 점수 계산에 쓰지 않는다. 챗봇 프롬프트의 "대조용" 참고값이다.
//      (lib/tipping-point.ts 는 이 파일을 import 하지 않는다.)
//   3. 모든 상수에 출처 문자열(citation)과 논쟁 여부(disputed)를 함께 둔다.

/** 문헌 상수 공통 메타 */
export interface LiteratureSource {
  /** 인용 표기용 짧은 이름 — 프롬프트의 [출처: ...] 에 그대로 들어간다. */
  readonly label: string;
  /** 서지 정보 전문 */
  readonly citation: string;
  /** 값 자체나 그 적용 기준에 학계 논쟁이 있는가 */
  readonly disputed: boolean;
  /** 논쟁이 있다면 무엇이 쟁점인지 한 줄 */
  readonly disputeNote?: string;
}

// ===== 1. Frankham 1995 — Ne/N 비율 메타분석 =====
export const FRANKHAM_1995 = {
  label: "Frankham 1995",
  citation:
    "Frankham, R. (1995). Effective population size/adult population size ratios in wildlife: a review. Genetical Research 66, 95-107.",
  disputed: false,
  /** 종합 비율(변동·불균등성사비·가족크기 모두 보정). 논문의 핵심 수치. */
  neN_general: { low: 0.1, high: 0.11 },
  /** 조류만 따로 낸 비율 */
  neN_birds: 0.21,
  /** 개별 추정치가 흩어진 범위 */
  neN_range: { low: 0.01, high: 0.95 },
  /** 메타분석 표본 */
  sample: { species: 102, estimates: 192 },
} as const satisfies LiteratureSource & Record<string, unknown>;

// ===== 2. Franklin 1980 — 50/500 규칙(원안) =====
export const FRANKLIN_1980 = {
  label: "Franklin 1980",
  citation:
    "Franklin, I.R. (1980). Evolutionary change in small populations. In: Soulé, M.E. & Wilcox, B.A. (eds) Conservation Biology: An Evolutionary-Ecological Perspective, pp. 135-149. Sinauer.",
  disputed: true,
  disputeNote:
    "Frankham et al. (2014) 가 100/1000 으로 상향을 주장해 논쟁 중",
  /** 단기 — 근친교배 저하 억제 */
  ne_inbreeding: 50,
  /** 장기 — 진화적 잠재력 유지 */
  ne_evolutionary: 500,
} as const satisfies LiteratureSource & Record<string, unknown>;

// ===== 3. Frankham et al. 2014 — 50/500 상향 주장 =====
export const FRANKHAM_2014 = {
  label: "Frankham et al. 2014",
  citation:
    "Frankham, R., Bradshaw, C.J.A. & Brook, B.W. (2014). Genetics in conservation management: Revised recommendations for the 50/500 rules, Red List criteria and population viability analyses. Biological Conservation 170, 56-63.",
  disputed: true,
  disputeNote:
    "Franklin 1980 의 50/500 을 100/1000 으로 올리자는 주장. 학계 합의 미도달",
  ne_inbreeding: 100,
  ne_evolutionary: 1000,
} as const satisfies LiteratureSource & Record<string, unknown>;

// ===== 4. Damuth 1981 — 체중-개체군밀도 알로메트리 =====
export const DAMUTH_1981 = {
  label: "Damuth 1981",
  citation:
    "Damuth, J. (1981). Population density and body size in mammals. Nature 290, 699-700.",
  disputed: false,
  /** log D = slope · log W + intercept  (D: 개체/km², W: 성체 체중 g) */
  formula: "log D = -0.75 log W + 4.23",
  slope: -0.75,
  intercept: 4.23,
  /** 회귀 상관계수 */
  r: -0.86,
} as const satisfies LiteratureSource & Record<string, unknown>;

// ===== 5. Traill et al. 2007 — 최소존속개체군(MVP) 메타분석 =====
export const TRAILL_2007 = {
  label: "Traill et al. 2007",
  citation:
    "Traill, L.W., Bradshaw, C.J.A. & Brook, B.W. (2007). Minimum viable population size: a meta-analysis of 30 years of published estimates. Biological Conservation 139, 159-166.",
  disputed: true,
  disputeNote:
    "종을 가리지 않는 단일 MVP 임계값 적용에 비판이 있다 (Flather et al. 2011 TREE 26:307)",
  /** 전 분류군 MVP 중앙값 (개체) */
  mvp_median: 4169,
  /** 95% 신뢰구간 */
  mvp_ci: { low: 3577, high: 5129 },
  sample: { species: 212 },
} as const satisfies LiteratureSource & Record<string, unknown>;

// ===== 6. Palstra & Ruzzante 2008 — Ne/Nc 상충 연구 =====
// 특허 명세서 계열(lastwatch_score_full_spec_v4.md 부록 A, PKA-1551 수정요청서 6쪽)이
// "Ne/Nc 는 확립된 단일 관계식이 없다" 의 근거로 인용한 문헌. 수치는 저장소 기록에 없어 싣지 않는다.
export const PALSTRA_RUZZANTE_2008 = {
  label: "Palstra & Ruzzante 2008",
  citation:
    "Palstra, F.P. & Ruzzante, D.E. (2008). Genetic estimates of contemporary effective population size: what can they tell us about the importance of genetic stochasticity for wild population persistence? Molecular Ecology 17, 3428-3447.",
  disputed: true,
  disputeNote:
    "Ne/Nc 비율에 대해 연구 간 상충하는 결과 — 단일 값이나 체중과의 관계식이 확립되지 않음",
} as const satisfies LiteratureSource & Record<string, unknown>;

/** 전체 목록 — 문헌 인용 감사·테스트용 */
export const LITERATURE = [
  FRANKHAM_1995,
  FRANKLIN_1980,
  FRANKHAM_2014,
  DAMUTH_1981,
  TRAILL_2007,
  PALSTRA_RUZZANTE_2008,
] as const;

/** 논쟁 있는 값에 병기하는 문구 */
export const DISPUTE_TAG = "(기준 상향 논쟁 있음)";

// ===== 프롬프트용 문헌 대조 블록 =====

export interface LiteratureBlockInput {
  /** v5 가 쓴 것과 같은 기준 개체수 (inferPopulationWithSource 결과) */
  N: number;
  /** N 이 어느 컬럼에서 왔는지 — [출처: ...] 에 그대로 쓴다 */
  populationSource: string;
  /** v5 가 실제로 산출한 Ne. tipping_points 페이로드에 없으면 null */
  neV5: number | null;
  /** 조류면 Frankham 의 조류 전용 비율(0.21)도 함께 낸다 */
  className?: string | null;
}

/** Ne 가 50/500 기준의 어디에 있는지 한 줄로 */
function positionAgainst50_500(ne: number): string {
  const a = FRANKLIN_1980.ne_inbreeding;
  const b = FRANKLIN_1980.ne_evolutionary;
  if (ne < a) return `근친교배 문턱 ${a} 미달`;
  if (ne < b) return `근친교배 문턱 ${a} 초과, 진화적 잠재력 문턱 ${b} 미달`;
  return `진화적 잠재력 문턱 ${b} 초과`;
}

/**
 * 문헌 대조 블록. 개체수가 있는 종에만 붙인다 — 호출부에서 N 이 null 이면
 * 이 함수를 아예 부르지 말 것.
 *
 * 점수 계산에는 절대 쓰지 않는다. 프롬프트 컨텍스트 전용.
 */
export function buildLiteratureLines(input: LiteratureBlockInput): string[] {
  const { N, populationSource, neV5, className } = input;
  const f = FRANKHAM_1995;
  const neFrankham = Math.round(N * f.neN_general.low);

  const out: string[] = [];
  out.push("[문헌 대조 — 유효개체군 Ne / 최소존속개체군 MVP]");
  out.push(`기준 개체수 N: ${N.toLocaleString()}  [출처: ${populationSource}]`);

  if (neV5 != null) {
    out.push(
      `유효개체군 Ne (LastWatch v5 적용값): ${neV5.toLocaleString()}  ` +
        `[LastWatch 자체 계산(v5), IUCN 공식 지표 아님, 출처: tipping_points.payload.layer_scores.iucn.Ne]`
    );
  }
  out.push(
    `유효개체군 Ne (Frankham 1995 Ne/N=${f.neN_general.low} 적용값): ${neFrankham.toLocaleString()}  ` +
      `[출처: ${f.label}, 종합비율 ${f.neN_general.low}~${f.neN_general.high}, ` +
      `${f.sample.species}종 ${f.sample.estimates}추정치, 개별 범위 ${f.neN_range.low}~${f.neN_range.high}]`
  );
  out.push(
    `Ne/Nc 비율 자체: 연구 간 상충하는 결과가 보고되어 단일 값이 확립되지 않음 — 위 두 Ne 는 서로 다른 가정의 대조값  ` +
      `[출처: ${PALSTRA_RUZZANTE_2008.label}] (논쟁 있음)`
  );

  if (className === "조류") {
    out.push(
      `유효개체군 Ne (Frankham 1995 조류 전용 Ne/N=${f.neN_birds} 적용값): ` +
        `${Math.round(N * f.neN_birds).toLocaleString()}  [출처: ${f.label}]`
    );
  }

  const tag = ` ${DISPUTE_TAG} — ${FRANKHAM_2014.label} 는 ` +
    `${FRANKHAM_2014.ne_inbreeding}/${FRANKHAM_2014.ne_evolutionary} 주장`;

  if (neV5 != null) {
    out.push(
      `50/500 기준 대비 (v5 Ne ${neV5.toLocaleString()}): ${positionAgainst50_500(neV5)}  ` +
        `[출처: ${FRANKLIN_1980.label}]${tag}`
    );
  }
  out.push(
    `50/500 기준 대비 (Frankham Ne ${neFrankham.toLocaleString()}): ${positionAgainst50_500(neFrankham)}  ` +
      `[출처: ${FRANKLIN_1980.label}]${tag}`
  );

  const t = TRAILL_2007;
  const pct = (N / t.mvp_median) * 100;
  out.push(
    `MVP 대비: N ${N.toLocaleString()} 은 MVP 중앙값 ${t.mvp_median.toLocaleString()} 의 ` +
      `${pct.toFixed(1)}%  [출처: ${t.label}, 95% CI ${t.mvp_ci.low.toLocaleString()}~` +
      `${t.mvp_ci.high.toLocaleString()}, ${t.sample.species}종] (단일 MVP 임계값 적용에 논쟁 있음)`
  );

  out.push(
    "비고: 이 블록의 문헌 값은 대조용이며 LastWatch v5 점수 계산에 들어가지 않습니다. " +
      "v5 의 Ne/N 은 분류군별 0.05~0.20 으로 종마다 다릅니다."
  );
  return out;
}
