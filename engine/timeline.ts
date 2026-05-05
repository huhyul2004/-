/**
 * Timeline Module — 임계점 연표 자동 생성
 *
 * Independent Claim 1 — 컴퓨팅 장치에서 시계열 + PVA + IUCN 데이터로부터
 * 미래 4개 임계점 일자(YYYY-MM-DD)를 동시에 산출하는 방법.
 *
 * 핵심 새로움(Novelty):
 *  - 단일 risk score가 아닌 4-tuple 시점 동시 산출
 *  - "개입 가능 시점"과 "개입 마감"을 분리 → 시간축 위 개입 윈도우(window) 개념 명시
 *  - 각 시점은 별도 통계 메서드로 도출 (score 임계값 역산 vs PVA 분위수 역산)
 *
 * References:
 *  - Drake & Griffen (2010) Nature 467:456-459 (Critical Slowing Down EWS)
 *  - Beissinger & McCullough (2002) Population Viability Analysis, U Chicago Press
 */

import type { TippingPointResult } from "../lib/tipping-point";

export interface TimelinePoint {
  date: string;            // ISO YYYY-MM-DD
  years_from_now: number;
  rationale: string;
}

export interface TippingPointTimeline {
  /** 1. 개입 가능 시점 — 가장 효과적인 개입 시작 시점 */
  intervention_window_open: TimelinePoint;
  /** 2. 개입 마감 — 비용·난이도가 급증하는 임계 (T3 진입 시점) */
  intervention_window_close: TimelinePoint;
  /** 3. 골든타임 진입 — 응급 조치만 남는 단계 (T4 진입 시점) */
  golden_hour_entry: TimelinePoint;
  /** 4. 멸종 추정 — PVA 10퍼센타일 비관 시나리오에서 quasi-extinction 도달 */
  extinction_estimate: TimelinePoint & {
    confidence_interval: { p10: number; p50: number; p90: number };
  };
}

/**
 * TippingPointResult 로부터 4-tuple 연표 추출.
 * 기존 lib/tipping-point.ts 의 dates / years_until 결과를 캐논형 인터페이스로 매핑.
 */
export function buildTimeline(result: TippingPointResult): TippingPointTimeline {
  const tier = result.intervention_tier;
  const open: TimelinePoint = {
    date: result.dates.intervention_open_date,
    years_from_now: 0,
    rationale:
      tier === "T3" || tier === "T4"
        ? "이미 위급 단계 — 즉시 개입 권고"
        : tier === "T2"
          ? "개입 효과 가장 큰 시점 — 지금 시작 권고"
          : "정밀 모니터링 강화 시작 권고",
  };

  const close: TimelinePoint = {
    date: result.dates.intervention_deadline_date,
    years_from_now: result.years_until.deadline,
    rationale:
      result.years_until.deadline === 0
        ? "이미 T3 임계 통과 — 비용·난이도 급증 진행 중"
        : "이 시점 이후 회복 비용·시간이 비선형으로 급증",
  };

  const goldenYears = result.years_until.golden_window;
  const golden: TimelinePoint = {
    date: result.dates.golden_window_date ?? close.date,
    years_from_now: goldenYears ?? 0,
    rationale: "포획 / ex-situ 보전 / 유전자 보전만 남는 단계",
  };

  const extinctionYears = result.years_until.extinction;
  const extinction: TimelinePoint & {
    confidence_interval: { p10: number; p50: number; p90: number };
  } = {
    date: result.dates.extinction_estimate_date ?? "9999-01-01",
    years_from_now: extinctionYears ?? 100,
    rationale: "보전 조치 없이 현재 추세 지속 시 PVA 10퍼센타일 멸종 시점",
    confidence_interval: {
      p10: extinctionYears ?? 100,                    // 비관 (빠른 멸종)
      p50: result.layer_scores.pva.median_T_ext ?? 100, // 중앙
      p90: 100,                                        // 낙관 (시뮬레이션 기간 한계)
    },
  };

  return {
    intervention_window_open: open,
    intervention_window_close: close,
    golden_hour_entry: golden,
    extinction_estimate: extinction,
  };
}
