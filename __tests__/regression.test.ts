// 회귀 테스트 — 4종 검증 케이스
// 청구항 안정성 검증용 (수치는 상한/하한으로 — 시뮬레이션 시드 변경 시도 깨지지 않게)
import { describe, it, expect } from "vitest";
import { combineWithConsensus, CONSENSUS_WEIGHTS } from "../engine/consensus";
import { buildRecommendation } from "../engine/recommendation";
import { fallbackEstimate, TAXON_DEFAULTS, IUCN_POPULATION_MEDIAN } from "../engine/fallback";

describe("Consensus algorithm — Claim 3", () => {
  it("0 alerts: score is downscaled by 0.6", () => {
    const out = combineWithConsensus({ ews: 30, pva: 30, iucn: 30 });
    expect(out.high_alerts).toBe(0);
    expect(out.score).toBeCloseTo(30 * 0.6, 1);
    expect(out.confidence).toBe(0.5);
  });

  it("2+ alerts: score = raw weighted (no downscale)", () => {
    const out = combineWithConsensus({ ews: 80, pva: 60, iucn: 70 });
    expect(out.high_alerts).toBe(3);
    expect(out.score).toBeCloseTo(out.raw_weighted, 1);
    expect(out.confidence).toBe(0.95);
  });

  it("Single alert: 0.85x downscale", () => {
    // EWS high only
    const out = combineWithConsensus({ ews: 80, pva: 30, iucn: 30 });
    expect(out.high_alerts).toBe(1);
    expect(out.score).toBeCloseTo(out.raw_weighted * 0.85, 1);
    expect(out.confidence).toBe(0.7);
  });

  it("Primary signal identifies largest contributor", () => {
    // PVA dominates (weight 0.5 × 80 = 40)
    const out = combineWithConsensus({ ews: 30, pva: 80, iucn: 50 });
    expect(out.primary_signal).toBe("pva");
  });

  it("Weights sum to 1.0", () => {
    const sum = CONSENSUS_WEIGHTS.ews + CONSENSUS_WEIGHTS.pva + CONSENSUS_WEIGHTS.iucn;
    expect(sum).toBeCloseTo(1.0, 5);
  });
});

describe("Recommendation matrix — Claim 2", () => {
  it("T0 returns low-priority monitoring", () => {
    const rec = buildRecommendation("T0");
    expect(rec.notification).toBe("low");
    expect(rec.actions.length).toBeGreaterThan(0);
    expect(rec.actions[0].action).toMatch(/모니터링/);
  });

  it("T4 returns critical actions including ex-situ", () => {
    const rec = buildRecommendation("T4");
    expect(rec.notification).toBe("critical");
    expect(rec.actions.some((a) => a.action.includes("ex-situ") || a.action.includes("포획"))).toBe(true);
  });

  it("Threats merge into action list (T3 + bycatch)", () => {
    const rec = buildRecommendation("T3", ["bycatch"]);
    expect(rec.actions.some((a) => a.action.includes("자망") || a.action.includes("어업"))).toBe(true);
  });

  it("Region maps to agency", () => {
    const rec = buildRecommendation("T2", [], "KR");
    expect(rec.actions[0].agency_examples?.[0]).toContain("환경부");
  });
});

describe("Fallback estimation — Claim 4", () => {
  it("Without observed data: confidence_cap=0.4 is enforced", () => {
    const f = fallbackEstimate({ class_name: "포유류", iucn_status: "CR" });
    expect(f.metadata.data_source).toBe("fallback_estimate");
    expect(f.metadata.confidence_cap).toBe(0.4);
    expect(f.N0).toBe(IUCN_POPULATION_MEDIAN.CR);
  });

  it("Taxon defaults are loaded for known classes", () => {
    expect(TAXON_DEFAULTS["포유류"].generation_time).toBe(8);
    expect(TAXON_DEFAULTS["조류"].lambda_mean).toBeGreaterThan(1);
  });

  it("With full data: confidence_cap=1.0 (no penalty)", () => {
    const f = fallbackEstimate({
      class_name: "포유류",
      iucn_status: "CR",
      range_km2: 100,
      observed_population: 50,
    });
    expect(f.metadata.data_source).toBe("real");
    expect(f.metadata.confidence_cap).toBe(1.0);
    expect(f.N0).toBe(50);
  });
});
