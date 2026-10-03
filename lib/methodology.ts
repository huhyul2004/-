// /methodology 페이지용 — 저장된 점수를 한 단계씩 되짚고, 커버리지를 DB 에서 센다.
// 표시 전용. 점수 계산(lib/tipping-point.ts)에는 관여하지 않는다.
// 종합 단계 값은 엔진이 남긴 집계 추적(payload.aggregation)을 읽는다 — 추적이 없는 예전 payload 는
// 같은 집계 함수(aggregateConsensus)로 다시 계산한다 (lib/floor-transparency.ts aggregationOf).
import { getDb, type SpeciesRow } from "./db";
import {
  V5_SPEC,
  TIERS,
  inferPopulationWithSource,
  trendToLambdaV4,
  hasClassLifeHistory,
  type MajorityBranch,
  type PopulationSource,
} from "./tipping-point";
import { aggregationOf, reaggregate } from "./floor-transparency";

type Layer = "ews" | "pva" | "iucn";
export const LAYERS: Layer[] = ["ews", "pva", "iucn"];

interface LayerPayload {
  layer_scores?: {
    ews?: { score?: number; confidence?: number };
    pva?: { score?: number; confidence?: number; P_ext_50yr?: number; P_ext_100yr?: number; n_invalid?: number };
    iucn?: { score?: number; confidence?: number; Ne?: number; genetic_status?: string };
  };
  inputs?: { K_source?: string };
}

export interface ScoreTrace {
  N0: number;
  popSource: PopulationSource;
  layers: Record<Layer, { score: number; confidence: number; alert: boolean }>;
  Ne: number | null;
  pExtShort: number | null;
  pExtLong: number | null;
  /** 가중합 */
  raw: number;
  alerts: number;
  /** blend: 2표 이상(α 블렌딩) · single: 1표 · none: 0표 */
  branch: MajorityBranch;
  /** 0표·1표 배율. 2표 이상이면 null */
  multiplier: number | null;
  /** 2표 이상일 때 α. 아니면 null */
  blendAlpha: number | null;
  /** 세 레이어 점수 중 최댓값 — 2표 이상 블렌딩 입력 */
  maxLayer: number;
  afterConsensus: number;
  overallConfidence: number;
  compressed: boolean;
  afterConfidence: number;
  floor: number;
  floorBand: number | null;
  afterFloor: number;
  floorBound: boolean;
  trendText: string | null;
  trendDelta: number;
  afterTrend: number;
  /** 소수 첫째 자리 반올림 — 저장·표시되는 점수 */
  display: number;
  tier: (typeof TIERS)[number] | undefined;
  stored: { score: number; tier: string };
  /** 저장된 레이어 점수를 지금 코드의 집계식으로 다시 집계한 점수·티어가 저장값과 같은가 */
  matches: boolean;
  /** 다시 집계한 점수 */
  recomputed: number | null;
  /** 계산 뒤 species 행의 개체수·한글 추세가 바뀌었는가 (재계산 필요) */
  inputDrift: boolean;
}


/** 저장된 payload 의 레이어 점수로 종합 단계를 되짚는다. EX/EW·개체수 없음·payload 불완전이면 null. */
export function traceScore(
  species: SpeciesRow,
  payload: unknown,
  stored: { consensus_score: number; intervention_tier: string }
): ScoreTrace | null {
  if (species.category === "EX" || species.category === "EW") return null;
  const live = inferPopulationWithSource(species);
  // 표시는 계산 당시 입력(payload.inputs)을 쓴다 — 그 뒤 species 행이 바뀌면 inputDrift 로 따로 알린다
  const inputs = (payload as { inputs?: { N0?: number; N0_source?: PopulationSource } } | null)?.inputs;
  const pop = { value: inputs?.N0 ?? live.value, source: inputs?.N0_source ?? live.source };
  if (pop.value == null) return null;
  const ls = (payload as LayerPayload | null)?.layer_scores;
  const layers = {} as ScoreTrace["layers"];
  for (const k of LAYERS) {
    const score = ls?.[k]?.score;
    const confidence = ls?.[k]?.confidence;
    if (typeof score !== "number" || typeof confidence !== "number") return null;
    layers[k] = { score, confidence, alert: score > V5_SPEC.alertThresholds[k] };
  }
  const agg = aggregationOf(species, pop.value, payload);
  if (!agg) return null;
  const display = agg.score;
  const tierOf = (x: number) => TIERS.find((t) => Math.round(x * 100) / 100 >= t.min && Math.round(x * 100) / 100 < t.max);
  const tier = tierOf(display);
  // 검사는 저장된 추적이 아니라 "지금 코드로 다시 집계한 값" 과 저장값을 비교한다 (같은 값끼리 비교하지 않게).
  const re = reaggregate(species, pop.value, payload);
  const inputDrift = live.value !== pop.value || agg.trend.input !== species.population_trend;
  return {
    N0: pop.value,
    popSource: pop.source,
    layers,
    Ne: ls?.iucn?.Ne ?? null,
    pExtShort: ls?.pva?.P_ext_50yr ?? null,
    pExtLong: ls?.pva?.P_ext_100yr ?? null,
    raw: agg.weighted,
    alerts: agg.m,
    branch: agg.branch,
    multiplier: agg.majorityFactor,
    blendAlpha: agg.blendAlpha,
    maxLayer: agg.maxLayer,
    afterConsensus: agg.afterMajority,
    overallConfidence: agg.confidence.overall,
    compressed: agg.compressionApplied,
    afterConfidence: agg.afterCompression,
    floor: agg.floor.value,
    floorBand: agg.floor.below,
    afterFloor: agg.afterFloor,
    floorBound: agg.floor.applied,
    trendText: agg.trend.input,
    trendDelta: Math.round(agg.trend.delta * 10) / 10,
    afterTrend: agg.final,
    display,
    tier,
    stored: { score: stored.consensus_score, tier: stored.intervention_tier },
    matches: re != null && re.score === stored.consensus_score && tierOf(re.score)?.tier === stored.intervention_tier,
    recomputed: re?.score ?? null,
    inputDrift,
  };
}

export interface MethodologyCoverage {
  species: number;
  curated: number;
  scored: number;
  scoredCurated: number;
  extinctScored: number;
  extinctScoredCurated: number;
  /** EX/EW 종에 저장된 점수 (계산 없이 고정) */
  extinctScoreValues: number[];
  computed: number;
  unscored: number;
  unscoredCurated: number;
  unscoredNotSynced: number;
  unscoredSyncedNoPop: number;
  /** 규칙상 점수가 있어야 하는데 없는 종 — 0 이어야 한다 */
  unscoredWithPopulation: number;
  popSource: Record<string, number>;
  trendSource: Record<string, number>;
  classLife: { own: number; fallback: number };
  alerts: Record<string, number>;
  compressed: number;
  overallConfidenceValues: number[];
  floor: { bound: number; inBandNotBound: number; outside: number };
  trendAdjusted: number;
  tiers: Record<string, number>;
  /** 저장된 레이어 점수를 지금 코드로 다시 집계한 점수가 저장값과 다른 종 */
  traceMismatches: number;
  /** 계산 뒤 species 행의 개체수·한글 추세가 바뀐 종 (재계산하면 점수가 바뀔 수 있다) */
  inputDrift: number;
  /** 계산 종의 EWS 점수 고유값 — 값마다 종 수와 그 값을 만든 추세 입력 */
  ewsValues: { score: number; count: number; inputs: Record<string, number> }[];
  /** PVA 에서 Infinity·NaN 이 되어 집계에서 뺀 궤적 (결정 8) — 종 수 · 궤적 수 */
  pvaInvalid: { species: number; trajectories: number };
  /** 수용력 K 를 정한 식별 종 수 — damuth · fallback · fallback_declining (payload.inputs.K_source) */
  kSource: Record<string, number>;
}

// EWS 의 r 을 정한 추세 입력 — trendToLambdaV4 의 우선순위(IUCN → 한글 칸 → 기본값)
const IUCN_TREND_KO: Record<string, string> = { Decreasing: "감소", Stable: "안정", Increasing: "증가" };
function trendInputLabel(iucnTrend: string | null, koreanTrend: string | null, source: string): string {
  if (source === "iucn") return `IUCN 추세 ${IUCN_TREND_KO[iucnTrend ?? ""] ?? iucnTrend}`;
  if (source === "korean") return `한글 추세 칸 '${koreanTrend}'`;
  return `추세 알 수 없음(IUCN ${iucnTrend ?? "기록 없음"}) → 기본값`;
}

export function getMethodologyCoverage(): MethodologyCoverage {
  const db = getDb();
  const totals = db
    .prepare("SELECT COUNT(*) AS species, SUM(is_curated = 1) AS curated FROM species")
    .get() as { species: number; curated: number };
  const scored = db
    .prepare(
      `SELECT COUNT(*) AS n, SUM(s.is_curated = 1) AS curated,
              SUM(s.category IN ('EX','EW')) AS extinct,
              SUM(s.category IN ('EX','EW') AND s.is_curated = 1) AS extinct_curated
       FROM tipping_points t JOIN species s ON s.id = t.species_id`
    )
    .get() as { n: number; curated: number; extinct: number; extinct_curated: number };
  const extinctScoreValues = (
    db
      .prepare(
        `SELECT DISTINCT t.consensus_score AS v FROM tipping_points t JOIN species s ON s.id = t.species_id
         WHERE s.category IN ('EX','EW') ORDER BY v`
      )
      .all() as { v: number }[]
  ).map((r) => r.v);
  const uns = db
    .prepare(
      `SELECT COUNT(*) AS n, SUM(s.is_curated = 1) AS curated,
              SUM(s.iucn_synced_at IS NULL) AS not_synced,
              SUM(s.iucn_synced_at IS NOT NULL AND COALESCE(s.mature_individuals, 0) <= 0
                  AND COALESCE(s.iucn_population_size, 0) <= 0) AS synced_no_pop,
              SUM(COALESCE(s.mature_individuals, 0) > 0 OR COALESCE(s.iucn_population_size, 0) > 0) AS with_pop
       FROM species s WHERE NOT EXISTS (SELECT 1 FROM tipping_points t WHERE t.species_id = s.id)`
    )
    .get() as { n: number; curated: number; not_synced: number; synced_no_pop: number; with_pop: number };

  const rows = db
    .prepare(
      `SELECT s.*, t.consensus_score, t.intervention_tier, t.payload_json
       FROM tipping_points t JOIN species s ON s.id = t.species_id
       WHERE s.category NOT IN ('EX','EW')`
    )
    .all() as (SpeciesRow & { consensus_score: number; intervention_tier: string; payload_json: string })[];

  const inc = (o: Record<string, number>, k: string) => (o[k] = (o[k] ?? 0) + 1);
  const popSource: Record<string, number> = {};
  const trendSource: Record<string, number> = {};
  const alerts: Record<string, number> = {};
  const tiers: Record<string, number> = {};
  const confs = new Set<number>();
  const classLife = { own: 0, fallback: 0 };
  const floor = { bound: 0, inBandNotBound: 0, outside: 0 };
  let compressed = 0;
  let trendAdjusted = 0;
  let traceMismatches = 0;
  let inputDrift = 0;
  const pvaInvalid = { species: 0, trajectories: 0 };
  const kSource: Record<string, number> = {};
  const ews = new Map<number, { score: number; count: number; inputs: Record<string, number> }>();
  for (const r of rows) {
    const parsed = JSON.parse(r.payload_json) as LayerPayload;
    const nInvalid = parsed.layer_scores?.pva?.n_invalid ?? 0;
    if (nInvalid > 0) {
      pvaInvalid.species++;
      pvaInvalid.trajectories += nInvalid;
    }
    inc(kSource, parsed.inputs?.K_source ?? "unrecorded");
    inc(popSource, inferPopulationWithSource(r).source);
    const trendSrc = trendToLambdaV4(r.iucn_population_trend ?? null, r.population_trend, r.category).source;
    inc(trendSource, trendSrc);
    const ewsScore = parsed.layer_scores?.ews?.score;
    if (typeof ewsScore === "number") {
      const key = Math.round(ewsScore * 1e6) / 1e6;
      const g = ews.get(key) ?? { score: ewsScore, count: 0, inputs: {} };
      g.count++;
      inc(g.inputs, trendInputLabel(r.iucn_population_trend ?? null, r.population_trend, trendSrc));
      ews.set(key, g);
    }
    if (hasClassLifeHistory(r.class_name)) classLife.own++;
    else classLife.fallback++;
    inc(tiers, r.intervention_tier);
    const tr = traceScore(r, parsed, r);
    if (!tr) {
      traceMismatches++;
      continue;
    }
    if (!tr.matches) traceMismatches++;
    if (tr.inputDrift) inputDrift++;
    inc(alerts, String(Math.min(tr.alerts, 2)));
    confs.add(Math.round(tr.overallConfidence * 10000) / 10000);
    if (tr.compressed) compressed++;
    if (tr.floorBound) floor.bound++;
    else if (tr.floorBand != null) floor.inBandNotBound++;
    else floor.outside++;
    if (tr.trendDelta !== 0) trendAdjusted++;
  }

  return {
    species: totals.species,
    curated: totals.curated,
    scored: scored.n,
    scoredCurated: scored.curated,
    extinctScored: scored.extinct,
    extinctScoredCurated: scored.extinct_curated,
    extinctScoreValues,
    computed: rows.length,
    unscored: uns.n,
    unscoredCurated: uns.curated,
    unscoredNotSynced: uns.not_synced,
    unscoredSyncedNoPop: uns.synced_no_pop,
    unscoredWithPopulation: uns.with_pop,
    popSource,
    trendSource,
    classLife,
    alerts,
    compressed,
    overallConfidenceValues: Array.from(confs).sort((a, b) => a - b),
    floor,
    trendAdjusted,
    tiers,
    traceMismatches,
    inputDrift,
    ewsValues: Array.from(ews.values()).sort((a, b) => b.score - a.score),
    pvaInvalid,
    kSource,
  };
}
