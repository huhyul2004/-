// 개체수 하한(floor) 투명화 — 챗봇 프롬프트 표시 전용. 점수 계산에는 관여하지 않는다.
//
// tipping_points.payload 에 저장된 레이어 점수로 "하한 적용 전 점수" 를 재구성한다.
// 아래 식은 lib/tipping-point.ts evaluateTippingPoint 의 집계부
// (가중치 · 합의 보정 · 신뢰도 압축 · 개체수 하한 · 추세 보정) 를 그대로 옮긴 것이다.
// 엔진과 어긋나면 __tests__/floor-transparency.test.ts 가 실패한다 — 엔진을 바꾸면 여기도 같이 바꿀 것.
import { inferPopulationWithSource } from "./tipping-point";
import type { SpeciesRow } from "./db";

/** lib/tipping-point.ts 의 Bottleneck floor 표 (605~618행) */
const FLOOR_BANDS = [
  { below: 50, floor: 90, label: "N0 < 50" },
  { below: 100, floor: 78, label: "N0 < 100" },
  { below: 250, floor: 70, label: "N0 < 250" },
  { below: 500, floor: 60, label: "N0 < 500" },
] as const;

export const FLOOR_TAG = "[출처: LastWatch v5, 개체수 하한 규칙]";

interface LayerPayload {
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
  /** 레이어 가중합 → 합의 보정 → 신뢰도 압축까지 — 하한 직전 값 */
  preFloor: number;
  /** 하한만 빼고 추세 보정까지 적용한 점수 (1자리 반올림) — "하한 규칙이 없었다면" */
  withoutFloor: number;
  /** 재구성한 최종 점수 (1자리 반올림) — DB consensus_score 와 같아야 한다 */
  final: number;
  /** 하한이 점수를 실제로 끌어올렸는가 */
  bound: boolean;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

function trendAdjust(consensus: number, populationTrend: string | null): number {
  if (!populationTrend) return consensus;
  const t = populationTrend.toLowerCase();
  if (t.includes("급감")) return Math.min(100, consensus + 8);
  if (t.includes("증가") || t.includes("회복") || t.includes("increas")) return Math.max(0, consensus - 10);
  if (t.includes("감소") || t.includes("decreas")) return Math.min(100, consensus + 4);
  return consensus;
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

  const ls = (payload as LayerPayload | null)?.layer_scores;
  const ews = ls?.ews?.score, ewsC = ls?.ews?.confidence;
  const pva = ls?.pva?.score;
  const iucn = ls?.iucn?.score, iucnC = ls?.iucn?.confidence;
  if ([ews, ewsC, pva, iucn, iucnC].some((v) => typeof v !== "number")) return null;

  const raw = 0.3 * ews! + 0.45 * pva! + 0.25 * iucn!;
  const highAlerts = [ews! > 70, pva! > 50, iucn! > 60].filter(Boolean).length;
  let consensus = highAlerts === 0 ? raw * 0.6 : highAlerts === 1 ? raw * 0.85 : raw;
  const overallConf = 0.3 * ewsC! + 0.45 * 0.7 + 0.25 * iucnC!;
  if (overallConf < 0.5) consensus = consensus * 0.9 + 10;

  const b = FLOOR_BANDS.find((x) => N0 < x.below);
  const floor = b?.floor ?? 0;
  const final = round1(trendAdjust(Math.max(consensus, floor), species.population_trend));
  const withoutFloor = round1(trendAdjust(consensus, species.population_trend));
  return {
    N0,
    floor,
    band: b?.label ?? null,
    preFloor: consensus,
    withoutFloor,
    final,
    bound: floor > consensus,
  };
}

/** 점수 줄 바로 아래에 붙이는 하한 적용 여부 한 줄 */
export function floorStatusLine(fb: FloorBreakdown): string {
  if (fb.bound) {
    return (
      `개체수 하한 적용: 개체수 하한 규칙(${fb.band} → ${fb.floor}점)으로 ${fb.final.toFixed(1)}점이 되었고, ` +
      `하한 적용 전 점수(같은 계산에서 하한 규칙만 뺀 값)는 ${fb.withoutFloor.toFixed(1)}점. ` +
      `이 규칙은 LastWatch 자체 규칙이며 특허 명세서에 기재되지 않음  ${FLOOR_TAG}`
    );
  }
  if (fb.band) {
    return (
      `개체수 하한 미적용: 이 종은 하한 구간(${fb.band} → ${fb.floor}점)에 속하지만 ` +
      `하한 적용 전 점수 ${fb.withoutFloor.toFixed(1)}점이 이미 하한보다 높아 하한이 점수를 바꾸지 않음  ${FLOOR_TAG}`
    );
  }
  return `개체수 하한 해당 없음: N0 ${fb.N0.toLocaleString()} ≥ 500 이라 하한 구간 밖  ${FLOOR_TAG}`;
}
