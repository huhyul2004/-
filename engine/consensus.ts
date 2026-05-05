/**
 * Consensus Module — Generate-then-Verify 합의 보정
 *
 * Dependent Claim 3 — 3개 독립 레이어(EWS, PVA, IUCN/Genetic) 점수에 대해
 * (a) 가중 평균 산출
 * (b) 2 of 3 high-alert 검증으로 거짓양성 억제
 * (c) confidence + primary_signal 메타데이터 산출
 *
 * 핵심 새로움(Novelty):
 *  - 단순 가중평균이 아닌 다수결(2 of 3) 검증
 *  - 단일 레이어 high-alert 시 점수 강제 하향 (거짓양성 차단)
 *  - primary_signal 산출로 XAI(설명 가능성) 확보
 */

export type LayerScores = { ews: number; pva: number; iucn: number };

export interface ConsensusOutput {
  score: number;
  confidence: number;
  primary_signal: "ews" | "pva" | "iucn";
  high_alerts: number;
  raw_weighted: number;
  /** 보정 사유 — 명세서에 사용 */
  rationale: string;
}

const WEIGHTS = { ews: 0.20, pva: 0.50, iucn: 0.30 } as const;
const HIGH_ALERT_THRESHOLD = { ews: 70, pva: 50, iucn: 60 } as const;

/**
 * 3-Layer score 를 합의 점수로 통합.
 *
 * @param layer 0~100 각 레이어 점수
 * @returns ConsensusOutput
 */
export function combineWithConsensus(layer: LayerScores): ConsensusOutput {
  // 1) 가중 평균 (PVA 메커니즘 가장 강력 → 가중치↑)
  const raw =
    WEIGHTS.ews * layer.ews +
    WEIGHTS.pva * layer.pva +
    WEIGHTS.iucn * layer.iucn;

  // 2) High-alert 카운트 (Generate-then-Verify)
  const alerts = [
    layer.ews > HIGH_ALERT_THRESHOLD.ews,
    layer.pva > HIGH_ALERT_THRESHOLD.pva,
    layer.iucn > HIGH_ALERT_THRESHOLD.iucn,
  ];
  const high_alerts = alerts.filter(Boolean).length;

  // 3) 단일 레이어만 high-alert → 신뢰도 하향
  let adjusted = raw;
  let confidence = 0.95;
  let rationale = "3개 레이어 중 2개 이상 high-alert — 합의 통과";
  if (high_alerts === 0) {
    adjusted = raw * 0.6;
    confidence = 0.5;
    rationale = "high-alert 없음 — 점수 60% 하향 (false positive 보호)";
  } else if (high_alerts === 1) {
    adjusted = raw * 0.85;
    confidence = 0.7;
    rationale = "단일 레이어 high-alert — 점수 85% 하향";
  }

  // 4) Primary signal — 가장 큰 기여 레이어
  const contributions = {
    ews: WEIGHTS.ews * layer.ews,
    pva: WEIGHTS.pva * layer.pva,
    iucn: WEIGHTS.iucn * layer.iucn,
  };
  const primary = (Object.entries(contributions).sort((a, b) => b[1] - a[1])[0][0]) as
    | "ews"
    | "pva"
    | "iucn";

  return {
    score: Math.round(adjusted * 100) / 100,
    confidence,
    primary_signal: primary,
    high_alerts,
    raw_weighted: Math.round(raw * 100) / 100,
    rationale,
  };
}

export const CONSENSUS_WEIGHTS = WEIGHTS;
export const CONSENSUS_THRESHOLDS = HIGH_ALERT_THRESHOLD;
