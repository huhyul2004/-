// 엔진 5.1.0 (2026-10-03) — 결정 6 max 블렌딩 · 결정 7 Damuth K 분기 · 결정 8 NaN 궤적 제외 · 계산 추적.
import { describe, it, expect, afterAll } from "vitest";
import Database from "better-sqlite3";
import { aggregateConsensus, evaluateTippingPoint, ENGINE_VERSION, V5_SPEC } from "../lib/tipping-point";
import type { SpeciesRow } from "../lib/db";

const db = new Database("data/species.db", { readonly: true });
afterAll(() => db.close());
const row = (id: string) => {
  const r = db.prepare("SELECT * FROM species WHERE id = ?").get(id) as SpeciesRow | undefined;
  if (!r) throw new Error(`species not found: ${id}`);
  return r;
};
const OPTS = { n_sim: 1500, T: 100 } as const;

describe("결정 6 — 경보 2표 이상 max 블렌딩", () => {
  const base = { confidences: { ews: 0.25, iucn: 0.85 }, N0: 1000, populationTrend: null };

  it("2표 이상: 0.6·가중합 + 0.4·max(레이어)", () => {
    const a = aggregateConsensus({ ...base, layers: { ews: 88.08, pva: 96, iucn: 95 } });
    const weighted = 0.3 * 88.08 + 0.45 * 96 + 0.25 * 95;
    expect(a.m).toBe(3);
    expect(a.branch).toBe("blend");
    expect(a.weighted).toBeCloseTo(weighted, 10);
    expect(a.afterMajority).toBeCloseTo(0.6 * weighted + 0.4 * 96, 10);
    expect(a.majorityFactor).toBeNull();
    expect(a.blendAlpha).toBe(V5_SPEC.majorityBlend.alpha);
  });

  it("블렌딩은 점수를 올리기만 한다 (최댓값 ≥ 가중합)", () => {
    const a = aggregateConsensus({ ...base, layers: { ews: 88.08, pva: 55, iucn: 80 } });
    expect(a.m).toBe(3);
    expect(a.afterMajority).toBeGreaterThanOrEqual(a.weighted);
  });

  it("1표·0표는 예전과 같은 배율", () => {
    const one = aggregateConsensus({ ...base, layers: { ews: 50, pva: 37, iucn: 95 } });
    expect(one.m).toBe(1);
    expect(one.afterMajority).toBeCloseTo(one.weighted * 0.85, 10);
    const zero = aggregateConsensus({ ...base, layers: { ews: 50, pva: 10, iucn: 30 } });
    expect(zero.m).toBe(0);
    expect(zero.afterMajority).toBeCloseTo(zero.weighted * 0.6, 10);
  });

  it("blendAlpha=1 이면 블렌딩 전(가중합 그대로) — 반사실 비교용", () => {
    const a = aggregateConsensus({ ...base, layers: { ews: 88.08, pva: 96, iucn: 95 } }, { blendAlpha: 1 });
    expect(a.afterMajority).toBeCloseTo(a.weighted, 10);
  });

  it("반사실 옵션 — 문턱·배율을 바꿔 집계할 수 있고, 기본값은 V5_SPEC", () => {
    const zero = aggregateConsensus({ ...base, layers: { ews: 50, pva: 10, iucn: 30 } }, { majorityFactors: { zero: 0.7 } });
    expect(zero.afterMajority).toBeCloseTo(zero.weighted * 0.7, 10);
    // EWS 66.08 은 코드 문턱(70)에선 경보가 아니고 명세서 H = 60 에선 경보
    const layers = { ews: 66.08, pva: 55, iucn: 30 };
    expect(aggregateConsensus({ ...base, layers }).m).toBe(1);
    expect(aggregateConsensus({ ...base, layers }, { alertThresholds: { ews: 60, pva: 60, iucn: 60 } }).m).toBe(1);
    expect(aggregateConsensus({ ...base, layers: { ...layers, pva: 65 } }, { alertThresholds: { ews: 60, pva: 60, iucn: 60 } }).m).toBe(2);
  });

  it("2표 이상: 블렌딩이 먼저, 하한은 그 뒤 — 블렌딩 점수가 하한을 넘으면 하한 미적용", () => {
    // N0 76 (하한 78), 레이어 88.08 · 60 · 95 → 경보 3표. 가중합 77.174 → 블렌딩 84.30 > 78
    const a = aggregateConsensus({ ...base, N0: 76, layers: { ews: 88.08, pva: 60, iucn: 95 } });
    expect(a.m).toBe(3);
    expect(a.score).toBe(84.3);
    expect(a.floor.applied).toBe(false);
    // 블렌딩이 없다면(α=1) 가중합 77.17 < 78 → 하한 78
    const noBlend = aggregateConsensus({ ...base, N0: 76, layers: { ews: 88.08, pva: 60, iucn: 95 } }, { blendAlpha: 1 });
    expect(noBlend.score).toBe(78);
    expect(noBlend.floor.applied).toBe(true);
  });

  it("개체수 하한은 다수결 단계 뒤에 적용되고, 하한 전 점수를 함께 남긴다 (1표)", () => {
    const a = aggregateConsensus({ ...base, N0: 76, layers: { ews: 50, pva: 37, iucn: 95 } });
    expect(a.floor.value).toBe(78);
    expect(a.floor.applied).toBe(true);
    expect(a.score).toBe(78);
    expect(a.scoreWithoutFloor).toBeLessThan(78);
  });
});

describe("계산 추적 — payload.aggregation · payload.inputs", () => {
  it("자바코뿔소: 추적의 점수가 결과 점수와 같고 입력이 기록된다", () => {
    const r = evaluateTippingPoint(row("rhinoceros-sondaicus"), OPTS)!;
    expect(r.engine_version).toBe(ENGINE_VERSION);
    expect(r.aggregation!.score).toBe(r.consensus_score);
    expect(r.inputs!.N0).toBe(76);
    expect(r.inputs!.N0_source).toBe("mature_individuals");
    expect(r.inputs!.K_source).toBe("fallback");
    expect(r.inputs!.K_damuth_skip).toBe("no_habitat_area");
    expect(r.aggregation!.m).toBe(1);
    expect(r.aggregation!.floor.applied).toBe(true);
  });
});

describe("결정 7 — Damuth K 분기", () => {
  it("서식 면적·체중이 있는 포유류는 Damuth K, 없으면 기존 식", () => {
    const base = row("rhinoceros-sondaicus");
    const withArea = evaluateTippingPoint({ ...base, mass_g: 2_000_000, habitat_area_km2: 480 }, OPTS)!;
    expect(withArea.inputs!.K_source).toBe("damuth");
    expect(withArea.inputs!.K).toBeCloseTo(91.2 * Math.pow(2000, -0.75) * 480, 6);
    const without = evaluateTippingPoint(base, OPTS)!;
    expect(without.inputs!.K_source).toBe("fallback");
    expect(without.inputs!.K).toBe(Math.max(76 * 1.2, 76 + 50));
  });

  it("Damuth K 가 기존 식의 최소값 max(1.2·N0, N0+50) 보다 작으면 쓰지 않는다", () => {
    const base = row("rhinoceros-sondaicus"); // N0 76 → 최소값 126
    const small = evaluateTippingPoint({ ...base, mass_g: 2_000_000, habitat_area_km2: 50 }, OPTS)!; // Damuth K ≈ 15.2
    expect(small.inputs!.K_source).toBe("fallback");
    expect(small.inputs!.K_damuth_skip).toBe("below_n0_bound");
    expect(small.inputs!.K).toBe(126);
  });

  it("출처 미검증 분류군(조류)은 서식 면적이 있어도 기존 식", () => {
    const bird = row("wd-q194314"); // 캘리포니아콘도르
    const r = evaluateTippingPoint({ ...bird, mass_g: 9000, habitat_area_km2: 10000 }, OPTS)!;
    expect(r.inputs!.K_source).not.toBe("damuth");
    expect(r.inputs!.K_damuth_skip).toBe("unverified_constant");
  });
});

describe("결정 8 — NaN·Infinity 궤적 제외", () => {
  it("무효 궤적이 생기는 종: 유효+무효 = n_sim, 확률·점수가 유한", () => {
    const r = evaluateTippingPoint(row("wd-q300964"), OPTS)!; // 강토끼 — 무효 궤적 17개
    const pva = r.layer_scores.pva;
    expect(pva.n_invalid).toBeGreaterThan(0);
    expect(pva.n_valid! + pva.n_invalid!).toBe(OPTS.n_sim);
    for (const v of [pva.score, pva.P_ext_50yr, pva.P_ext_100yr, r.consensus_score]) expect(Number.isFinite(v)).toBe(true);
    if (pva.median_T_ext !== null) expect(Number.isFinite(pva.median_T_ext)).toBe(true);
  });

  it("무효 궤적이 없는 종: 유효 궤적 = n_sim", () => {
    // 북극곰 — N0 26,000, 무효 궤적 0 (자바코뿔소는 N 이 K 를 넘은 뒤 음의 r_t 해에 폭주해 12개가 무효)
    const r = evaluateTippingPoint(row("ursus-maritimus"), OPTS)!;
    expect(r.layer_scores.pva.n_invalid).toBe(0);
    expect(r.layer_scores.pva.n_valid).toBe(OPTS.n_sim);
  });

  it("멸종 판정의 Math.min(1, NaN) 검사가 실제로 실행된다 (자바코뿔소 1개)", () => {
    const pva = evaluateTippingPoint(row("rhinoceros-sondaicus"), OPTS)!.layer_scores.pva;
    expect(pva.n_ext_time_nan).toBe(1);
    expect(pva.n_ext_time_nan!).toBeLessThanOrEqual(pva.n_invalid!);
  });

  it("무효 궤적이 생겨도 난수열은 그대로 — 고정값 (중간 break 로 난수를 건너뛰면 바뀐다)", () => {
    // 2026-10-03 첫 구현은 무효가 되는 순간 break 해 다음 sim 부터 난수열이 밀렸다 (자바코뿔소 무효 11개, PVA 37.33).
    // 난수 소비를 예전과 같게 둔 지금 값: 무효 12개, P_ext_50 = 538/1488. 결정 8 전 엔진의 유효 궤적과 같은 표본이다.
    const pva = evaluateTippingPoint(row("rhinoceros-sondaicus"), OPTS)!.layer_scores.pva;
    expect(pva.n_invalid).toBe(12);
    expect(pva.P_ext_50yr).toBeCloseTo(0.36155913978494625, 12);
    expect(pva.P_ext_100yr).toBeCloseTo(0.5934139784946236, 12);
    expect(pva.score).toBeCloseTo(37.03965053763441, 9);
  });
});
