// 개체수 하한(floor) 투명화 — 챗봇 컨텍스트·계산 근거 페이지 표시 전용. 점수 계산에는 관여하지 않는다.
//
// 결정 1 (2026-10-03): 개체수 하한 규칙은 유지한다. 대신 하한이 점수를 정한 종에는
// "개체수 하한 규칙 적용됨" 과 하한 적용 전 점수를 함께 밝힌다.
//
// 표시 값은 엔진이 계산하면서 남긴 집계 추적(payload.aggregation, 엔진 5.1.0~)과 입력 기록(payload.inputs)을 그대로 읽는다.
// 추적이 없는 예전 payload 는 같은 집계 함수(aggregateConsensus)로 저장된 레이어 점수에서 다시 계산한다.
//
// 검사용으로는 reaggregate() 가 저장된 레이어 점수를 "지금 코드의" 집계식으로 다시 집계한다. 저장된 추적을 저장된 점수와
// 비교하면 같은 값끼리 비교하게 되어, 상수·식을 바꾸고 재계산을 빠뜨린 경우를 잡지 못한다 (2026-10-03 적대적 검토 engine-1).
import { aggregateConsensus, inferPopulationWithSource, type AggregationTrace } from "./tipping-point";
import type { SpeciesRow } from "./db";

export const FLOOR_TAG = "[출처: LastWatch v5, 개체수 하한 규칙]";
/** 하한이 점수를 정한 종에 붙는 표시 — 챗봇 프롬프트 규칙이 이 문구를 그대로 쓰라고 지시한다 */
export const FLOOR_APPLIED_LABEL = "개체수 하한 규칙 적용됨";

interface TracePayload {
  aggregation?: AggregationTrace;
  inputs?: { N0?: number; N0_source?: string };
  layer_scores?: {
    ews?: { score?: number; confidence?: number };
    pva?: { score?: number };
    iucn?: { score?: number; confidence?: number };
  };
}

export interface FloorBreakdown {
  N0: number;
  /** 해당 구간의 하한 값. N0 ≥ 500 이면 0 */
  floor: number;
  /** 해당 구간 설명 ("N0 < 100" 등). N0 ≥ 500 이면 null */
  band: string | null;
  /** 가중합 → 다수결 분기 → 신뢰도 압축까지 — 하한과 비교되는 값 */
  preFloor: number;
  /** 하한만 빼고 추세 보정까지 적용한 점수 (1자리 반올림) — "하한 규칙이 없었다면" */
  withoutFloor: number;
  /** 최종 점수 (1자리 반올림) — DB consensus_score 와 같아야 한다 */
  final: number;
  /** 하한 뒤 추세 보정이 더한 값 (0.1 단위 반올림, 없으면 0). 0~100 에서 잘렸으면 규칙 값과 다를 수 있다 */
  trendDelta: number;
  /** 하한이 점수를 실제로 끌어올렸는가 (하한 > 하한 직전 점수) */
  bound: boolean;
}

/** 계산 당시의 기준 개체수 — payload.inputs.N0, 없으면(예전 payload) 지금 species 행에서 */
export function recordedN0(species: SpeciesRow, payload: unknown): number | null {
  const n = (payload as TracePayload | null)?.inputs?.N0;
  return typeof n === "number" ? n : inferPopulationWithSource(species).value;
}

/** 저장된 레이어 점수를 지금 코드의 집계식으로 다시 집계한다. N0·추세 입력은 계산 당시 기록을 쓴다 */
export function reaggregate(
  species: Pick<SpeciesRow, "population_trend">,
  N0: number,
  payload: unknown
): AggregationTrace | null {
  const p = payload as TracePayload | null;
  const ls = p?.layer_scores;
  const ews = ls?.ews?.score, ewsC = ls?.ews?.confidence;
  const pva = ls?.pva?.score;
  const iucn = ls?.iucn?.score, iucnC = ls?.iucn?.confidence;
  if ([ews, ewsC, pva, iucn, iucnC].some((v) => typeof v !== "number")) return null;
  return aggregateConsensus({
    layers: { ews: ews!, pva: pva!, iucn: iucn! },
    confidences: { ews: ewsC!, iucn: iucnC! },
    N0: p?.inputs?.N0 ?? N0,
    populationTrend: p?.aggregation ? p.aggregation.trend.input : species.population_trend,
  });
}

/** 표시용 집계 — 저장된 추적이 있으면 그대로, 없으면 저장된 레이어 점수로 다시 계산 */
export function aggregationOf(
  species: Pick<SpeciesRow, "population_trend">,
  N0: number,
  payload: unknown
): AggregationTrace | null {
  const p = payload as TracePayload | null;
  if (p?.aggregation) return p.aggregation;
  return reaggregate(species, N0, payload);
}

/**
 * 하한 적용 전후 점수. EX/EW(점수 100 고정), 개체수 없음, payload 가 불완전하면 null.
 * N0 는 계산 당시 기록(payload.inputs.N0)을 쓴다 — 그 뒤 species 행이 바뀌어도 추적과 어긋나지 않게.
 */
export function floorBreakdown(
  species: Pick<SpeciesRow, "category" | "population_trend" | "mature_individuals" | "iucn_population_size">,
  payload: unknown
): FloorBreakdown | null {
  if (species.category === "EX" || species.category === "EW") return null;
  const N0 = recordedN0(species as SpeciesRow, payload);
  if (N0 == null) return null;
  const agg = aggregationOf(species, N0, payload);
  if (!agg) return null;
  return {
    N0,
    floor: agg.floor.value,
    band: agg.floor.below != null ? `N0 < ${agg.floor.below}` : null,
    preFloor: agg.afterCompression,
    withoutFloor: agg.scoreWithoutFloor,
    final: agg.score,
    trendDelta: Math.round(agg.trend.delta * 10) / 10,
    bound: agg.floor.applied,
  };
}

const signed = (d: number) => `${d > 0 ? "+" : ""}${d}`;

/** 점수 줄 바로 아래에 붙이는 하한 적용 여부 한 줄 */
export function floorStatusLine(fb: FloorBreakdown): string {
  if (fb.bound) {
    const how =
      fb.trendDelta !== 0
        ? `최종 ${fb.final.toFixed(1)}점은 하한 ${fb.floor}점에 이후 추세 보정 ${signed(fb.trendDelta)}을 더한 값`
        : `최종 ${fb.final.toFixed(1)}점은 이 규칙이 정한 값`;
    return (
      `${FLOOR_APPLIED_LABEL}: N0 ${fb.N0.toLocaleString()} 이 하한 구간(${fb.band} → ${fb.floor}점)이라 ` +
      `하한 단계에서 점수를 ${fb.floor}점까지 끌어올렸고, ${how}. ` +
      `하한 적용 전 점수(같은 계산에서 하한 규칙만 뺀 값)는 ${fb.withoutFloor.toFixed(1)}점. ` +
      `이 규칙은 LastWatch 자체 규칙이며 특허 명세서에 기재되지 않음  ${FLOOR_TAG}`
    );
  }
  if (fb.band) {
    // 하한은 추세 보정 "전" 점수와 비교한다 — 추세 보정(−10 등)이 뒤에 최종 점수를 하한 아래로 내릴 수 있다 (반달가슴곰).
    const cmp = fb.preFloor === fb.floor ? "하한과 같아" : "하한보다 높아";
    const after = fb.trendDelta !== 0 ? ` 이후 추세 보정 ${signed(fb.trendDelta)} → 최종 ${fb.final.toFixed(1)}점 (하한은 추세 보정 전에만 적용).` : "";
    return (
      `개체수 하한 규칙 미적용: 이 종은 하한 구간(${fb.band} → ${fb.floor}점)에 속하지만 하한 직전 점수 ` +
      `${fb.preFloor.toFixed(2)}점이 ${cmp} 하한이 점수를 바꾸지 않음.${after}  ${FLOOR_TAG}`
    );
  }
  return `개체수 하한 규칙 해당 없음: N0 ${fb.N0.toLocaleString()} ≥ 500 이라 하한 구간 밖  ${FLOOR_TAG}`;
}
