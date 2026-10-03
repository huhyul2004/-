// 개체수 하한(floor) 투명화 — 챗봇 컨텍스트·계산 근거 페이지 표시 전용. 점수 계산에는 관여하지 않는다.
//
// 결정 1 (2026-10-03): 개체수 하한 규칙은 유지한다. 대신 하한이 점수를 정한 종에는
// "개체수 하한 규칙 적용됨" 과 하한 적용 전 점수를 함께 밝힌다.
//
// 값은 엔진이 계산하면서 남긴 집계 추적(payload.aggregation, 엔진 5.1.0~)을 그대로 읽는다.
// 추적이 없는 예전 payload 는 같은 집계 함수(aggregateConsensus)로 저장된 레이어 점수에서 다시 계산한다.
// 예전에는 이 파일이 엔진 집계식을 옮겨 적어 두었는데, 엔진이 바뀌면 함께 고쳐야 하는 사본이었다.
import { aggregateConsensus, inferPopulationWithSource, type AggregationTrace } from "./tipping-point";
import type { SpeciesRow } from "./db";

export const FLOOR_TAG = "[출처: LastWatch v5, 개체수 하한 규칙]";
/** 하한이 점수를 정한 종에 붙는 표시 — 챗봇 프롬프트 규칙이 이 문구를 그대로 쓰라고 지시한다 */
export const FLOOR_APPLIED_LABEL = "개체수 하한 규칙 적용됨";

interface TracePayload {
  aggregation?: AggregationTrace;
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
  /** 가중합 → 다수결 분기 → 신뢰도 압축까지 — 하한 직전 값 */
  preFloor: number;
  /** 하한만 빼고 추세 보정까지 적용한 점수 (1자리 반올림) — "하한 규칙이 없었다면" */
  withoutFloor: number;
  /** 최종 점수 (1자리 반올림) — DB consensus_score 와 같아야 한다 */
  final: number;
  /** 하한 뒤 추세 보정이 더한 값 (없으면 0) */
  trendDelta: number;
  /** 하한이 점수를 실제로 끌어올렸는가 */
  bound: boolean;
}

/** 저장된 추적이 있으면 그대로, 없으면 저장된 레이어 점수로 집계를 다시 계산한다 */
export function aggregationOf(
  species: Pick<SpeciesRow, "population_trend">,
  N0: number,
  payload: unknown
): AggregationTrace | null {
  const p = payload as TracePayload | null;
  if (p?.aggregation) return p.aggregation;
  const ls = p?.layer_scores;
  const ews = ls?.ews?.score, ewsC = ls?.ews?.confidence;
  const pva = ls?.pva?.score;
  const iucn = ls?.iucn?.score, iucnC = ls?.iucn?.confidence;
  if ([ews, ewsC, pva, iucn, iucnC].some((v) => typeof v !== "number")) return null;
  return aggregateConsensus({
    layers: { ews: ews!, pva: pva!, iucn: iucn! },
    confidences: { ews: ewsC!, iucn: iucnC! },
    N0,
    populationTrend: species.population_trend,
  });
}

/**
 * 하한 적용 전후 점수. EX/EW(점수 100 고정), 개체수 없음, payload 가 불완전하면 null.
 * species 는 category · population_trend · mature_individuals · iucn_population_size 만 쓴다.
 */
export function floorBreakdown(
  species: Pick<SpeciesRow, "category" | "population_trend" | "mature_individuals" | "iucn_population_size">,
  payload: unknown
): FloorBreakdown | null {
  if (species.category === "EX" || species.category === "EW") return null;
  const N0 = inferPopulationWithSource(species as SpeciesRow).value;
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

/** 점수 줄 바로 아래에 붙이는 하한 적용 여부 한 줄 */
export function floorStatusLine(fb: FloorBreakdown): string {
  if (fb.bound) {
    const trend = fb.trendDelta !== 0 ? ` (하한 뒤 추세 보정 ${fb.trendDelta > 0 ? "+" : ""}${fb.trendDelta})` : "";
    return (
      `${FLOOR_APPLIED_LABEL}: N0 ${fb.N0.toLocaleString()} 이 하한 구간(${fb.band} → ${fb.floor}점)이라 ` +
      `점수를 ${fb.floor}점까지 끌어올렸고, 최종 ${fb.final.toFixed(1)}점은 이 규칙이 정한 값${trend}. ` +
      `하한 적용 전 점수(같은 계산에서 하한 규칙만 뺀 값)는 ${fb.withoutFloor.toFixed(1)}점. ` +
      `이 규칙은 LastWatch 자체 규칙이며 특허 명세서에 기재되지 않음  ${FLOOR_TAG}`
    );
  }
  if (fb.band) {
    return (
      `개체수 하한 규칙 미적용: 이 종은 하한 구간(${fb.band} → ${fb.floor}점)에 속하지만 ` +
      `하한 적용 전 점수 ${fb.withoutFloor.toFixed(1)}점이 이미 하한보다 높아 하한이 점수를 바꾸지 않음  ${FLOOR_TAG}`
    );
  }
  return `개체수 하한 규칙 해당 없음: N0 ${fb.N0.toLocaleString()} ≥ 500 이라 하한 구간 밖  ${FLOOR_TAG}`;
}
