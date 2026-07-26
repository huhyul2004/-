// 회귀 테스트 — 청구항 안정성 검증
// 수치는 상한/하한(±)으로 — PVA 시뮬레이션 확률성에도 깨지지 않게.
//
// Claim 3(consensus)는 v4 Phase 1(iucn_population_trend 우선) 전환을 반영해
// 3-블록 구조로 확장:
//   1) v3 baseline  — 이력 보존(문서화, 실행 skip)
//   2) v4 current   — 현재 프로덕션 실측값 회귀핀 (species.db 실측 조회)
//   3) v4 improvement — v3 대비 개선 증명(호랑이 교정) + 회귀 안정성(자바코뿔소/폴백)
//
// 정본(source of truth): lib/tipping-point.ts 의 evaluateTippingPoint() 인라인 로직.
// (구 engine/consensus.ts 는 프로덕션 미사용으로 2026-07-23 폐기 → engine/_deprecated/)
import fs from "fs";
import Database from "better-sqlite3";
import { describe, it, expect, afterAll } from "vitest";
import { evaluateTippingPoint, trendToLambdaV4 } from "../lib/tipping-point";
import type { SpeciesRow } from "../lib/db";
import { buildRecommendation } from "../engine/recommendation";
import { fallbackEstimate, TAXON_DEFAULTS, IUCN_POPULATION_MEDIAN } from "../engine/fallback";

// ── species.db 실측 조회 (sync 완료된 iucn_population_trend 포함, readonly) ──
const db = new Database("data/species.db", { readonly: true });
db.pragma("busy_timeout = 8000");
afterAll(() => db.close());

function loadSpecies(name: string): SpeciesRow & { id: string } {
  const row = db
    .prepare("SELECT * FROM species WHERE scientific_name=? AND is_curated=1 LIMIT 1")
    .get(name) as (SpeciesRow & { id: string }) | undefined;
  if (!row) throw new Error(`species not found in db: ${name}`);
  return row;
}
// tipping_points 에 캐시된 v3 값 (2026-05-07 계산, 6-B-2 재계산 전까지 = v3 정본)
function storedV3(id: string): { consensus_score: number; intervention_tier: string } {
  const tp = db
    .prepare("SELECT consensus_score, intervention_tier FROM tipping_points WHERE species_id=?")
    .get(id) as { consensus_score: number; intervention_tier: string } | undefined;
  if (!tp) throw new Error(`tipping_points not found: ${id}`);
  return tp;
}
const OPTS = { n_sim: 1500, T: 100 } as const;

// ===== 블록 1: v3 baseline (이력 보존) =====
describe("Claim 3: v3 baseline (2026-05-06 to 2026-07-23)", () => {
  // 이 값들은 이력 문서화용. 실제 실행은 하지 않고 주석으로만 남긴다.
  // 특허 심사·논문에서 v3 실제 값을 참조할 수 있도록.
  //
  // v3 정본값 (한글 population_trend 기반):
  //   바키타 (Phocoena sinus):          98.0 / T4
  //   자바코뿔소 (Rhinoceros sondaicus):  78.0 / T3
  //   시베리아호랑이 (P. tigris altaica): 50.0 / T2  ← IUCN "Decreasing"과 불일치
  //
  // v3의 한계:
  //   - population_trend 필드가 한글 자연어 ("안정", "감소", "급감")
  //   - IUCN 공식 trend를 활용하지 못함
  //   - "급감"이 "감소" 패턴에 안 걸려 else 폴백되던 파싱 버그
  //   - 시베리아호랑이가 "안정"으로 잘못 판단됨
  it.skip("v3 baseline values (documented for historical reference)", () => {
    // 실제 실행 X. 이력 문서화용.
  });
});

// ===== 블록 2: v4 Phase 1 current (현재 프로덕션) =====
describe("Claim 3: v4 Phase 1 current (iucn_population_trend priority)", () => {
  it("current canonical species produce v4 values", () => {
    // species.db 실측 조회 → evaluateTippingPoint. 기대값은 v4 Phase 1 실측 하드코딩.
    const cases = [
      { name: "Phocoena sinus", label: "바키타", score: 100.0, tol: 0.5, tier: "T4" }, // v3 98 → +2.0 (자연어 파싱 버그 회피)
      { name: "Rhinoceros sondaicus", label: "자바코뿔소", score: 78.0, tol: 5.0, tier: "T3" }, // v3 동일 (회귀 안정성)
      { name: "Panthera tigris altaica", label: "시베리아호랑이", score: 66.5, tol: 3.0, tier: "T3" }, // v3 50 → +16.5 (IUCN Decreasing)
    ];
    const measured: string[] = [];
    for (const c of cases) {
      const r = evaluateTippingPoint(loadSpecies(c.name), OPTS);
      measured.push(`${c.label}: ${r.consensus_score}/${r.intervention_tier} (기대 ${c.score}±${c.tol}/${c.tier})`);
    }
    console.log("\n[v4 Phase 1 current 실측]\n  " + measured.join("\n  "));

    for (const c of cases) {
      const r = evaluateTippingPoint(loadSpecies(c.name), OPTS);
      expect(
        Math.abs(r.consensus_score - c.score),
        `${c.label}: consensus=${r.consensus_score} (기대 ${c.score}±${c.tol}), tier=${r.intervention_tier}`
      ).toBeLessThanOrEqual(c.tol);
      expect(r.intervention_tier, `${c.label} tier`).toBe(c.tier);
    }
  });
});

// ===== 블록 3: v4 improvement validation (개선 증명) =====
describe("Claim 3: v4 Phase 1 improvement over v3", () => {
  it("v4 correctly identifies Panthera tigris altaica as declining", () => {
    // IUCN 공식(2022): iucn_population_trend = "Decreasing"
    // v3: EWS 50.0 (한글 "안정" 오판) → T2 / v4: EWS 88.1 (IUCN 반영) → T3
    const row = loadSpecies("Panthera tigris altaica");
    expect(row.iucn_population_trend, "IUCN 공식 trend").toBe("Decreasing");
    const r = evaluateTippingPoint(row, OPTS);
    expect(r.intervention_tier, "tier").toBe("T3");
    expect(r.layer_scores.ews.score, "EWS should rise well above v3=50").toBeGreaterThan(60);
  });

  it("v4 preserves stability for species with matching trend sources", () => {
    // 한글 "안정" + IUCN "Stable" = 두 소스 일치 → v4도 v3와 동일한 78점 유지
    const row = loadSpecies("Rhinoceros sondaicus");
    expect(row.population_trend ?? "", "한글 trend").toContain("안정");
    expect(row.iucn_population_trend, "IUCN trend").toBe("Stable");
    const r = evaluateTippingPoint(row, OPTS);
    expect(Math.abs(r.consensus_score - 78.0), `consensus=${r.consensus_score}`).toBeLessThanOrEqual(5.0);
  });

  it("v4 fallback preserves v3 behavior for species without iucn trend", () => {
    // Unknown 종 → default 폴백 → v3와 완전 동일해야 함 (Δ≈0)
    const row = loadSpecies("Holoaden bradei"); // CR, iucn_population_trend = "Unknown", 한글 trend 없음
    const td = trendToLambdaV4(row.iucn_population_trend ?? null, row.population_trend, row.category);
    expect(td.source, "폴백 source").toBe("default");
    const v3 = storedV3(row.id);
    const r = evaluateTippingPoint(row, OPTS);
    expect(
      Math.abs(r.consensus_score - v3.consensus_score),
      `v4=${r.consensus_score} vs v3=${v3.consensus_score}`
    ).toBeLessThanOrEqual(0.5);
  });
});

// ===== 미러 테스트: 정본 가중치 소스 검증 (기존 유지) =====
describe("Claim 3: consensus weights (source of truth)", () => {
  it("lib/tipping-point.ts uses v3 weights 0.30/0.45/0.25", () => {
    const src = fs.readFileSync("lib/tipping-point.ts", "utf8");
    expect(src).toContain("ews: 0.30");
    expect(src).toContain("pva: 0.45");
    expect(src).toContain("iucn: 0.25");
  });

  it("high-alert scaling factors unchanged", () => {
    const src = fs.readFileSync("lib/tipping-point.ts", "utf8");
    expect(src).toContain("raw * 0.6");   // 0 alerts
    expect(src).toContain("raw * 0.85");  // 1 alert
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
