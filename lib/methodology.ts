// /methodology 페이지용 — 저장된 점수를 V5_SPEC 로 한 단계씩 되짚고, 커버리지를 DB 에서 센다.
// 표시 전용. 점수 계산(lib/tipping-point.ts)에는 관여하지 않는다.
import { getDb, type SpeciesRow } from "./db";
import {
  V5_SPEC,
  TIERS,
  inferPopulationWithSource,
  trendToLambdaV4,
  hasClassLifeHistory,
  type PopulationSource,
} from "./tipping-point";

type Layer = "ews" | "pva" | "iucn";
export const LAYERS: Layer[] = ["ews", "pva", "iucn"];

interface LayerPayload {
  layer_scores?: {
    ews?: { score?: number; confidence?: number };
    pva?: { score?: number; confidence?: number; P_ext_50yr?: number; P_ext_100yr?: number };
    iucn?: { score?: number; confidence?: number; Ne?: number; genetic_status?: string };
  };
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
  multiplier: number;
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
  matches: boolean;
}

function trendDeltaFor(trend: string | null): number {
  if (!trend) return 0;
  const t = trend.toLowerCase();
  const ta = V5_SPEC.trendAdjust;
  // lib/tipping-point.ts 추세 보정과 같은 문자열 규칙
  if (t.includes("급감")) return ta.sharpDecline;
  if (t.includes("증가") || t.includes("회복") || t.includes("increas")) return ta.recovering;
  if (t.includes("감소") || t.includes("decreas")) return ta.decline;
  return 0;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** 저장된 payload 의 레이어 점수로 종합 단계를 되짚는다. EX/EW·개체수 없음·payload 불완전이면 null. */
export function traceScore(
  species: SpeciesRow,
  payload: unknown,
  stored: { consensus_score: number; intervention_tier: string }
): ScoreTrace | null {
  if (species.category === "EX" || species.category === "EW") return null;
  const pop = inferPopulationWithSource(species);
  if (pop.value == null) return null;
  const ls = (payload as LayerPayload | null)?.layer_scores;
  const layers = {} as ScoreTrace["layers"];
  for (const k of LAYERS) {
    const score = ls?.[k]?.score;
    const confidence = ls?.[k]?.confidence;
    if (typeof score !== "number" || typeof confidence !== "number") return null;
    layers[k] = { score, confidence, alert: score > V5_SPEC.alertThresholds[k] };
  }
  const w = V5_SPEC.weights;
  const raw = w.ews * layers.ews.score + w.pva * layers.pva.score + w.iucn * layers.iucn.score;
  const alerts = LAYERS.filter((k) => layers[k].alert).length;
  const cm = V5_SPEC.consensusMultiplier;
  const multiplier = alerts === 0 ? cm.zero : alerts === 1 ? cm.one : 1;
  const afterConsensus = alerts >= 2 ? raw : raw * multiplier;
  const lc = V5_SPEC.lowConfidence;
  const overallConfidence = w.ews * layers.ews.confidence + w.pva * V5_SPEC.pva.confidence + w.iucn * layers.iucn.confidence;
  const compressed = overallConfidence < lc.below;
  const afterConfidence = compressed ? afterConsensus * lc.scale + lc.add : afterConsensus;
  const band = V5_SPEC.floorBands.find((b) => pop.value! < b.below);
  const floor = band?.floor ?? 0;
  const afterFloor = Math.max(afterConfidence, floor);
  const trendDelta = trendDeltaFor(species.population_trend);
  const afterTrend = trendDelta === 0 ? afterFloor : clamp(afterFloor + trendDelta, 0, 100);
  const display = Math.round(afterTrend * 10) / 10;
  const s2 = Math.round(display * 100) / 100;
  const tier = TIERS.find((t) => s2 >= t.min && s2 < t.max);
  return {
    N0: pop.value,
    popSource: pop.source,
    layers,
    Ne: ls?.iucn?.Ne ?? null,
    pExtShort: ls?.pva?.P_ext_50yr ?? null,
    pExtLong: ls?.pva?.P_ext_100yr ?? null,
    raw,
    alerts,
    multiplier,
    afterConsensus,
    overallConfidence,
    compressed,
    afterConfidence,
    floor,
    floorBand: band?.below ?? null,
    afterFloor,
    floorBound: floor > afterConfidence,
    trendText: species.population_trend,
    trendDelta,
    afterTrend,
    display,
    tier,
    stored: { score: stored.consensus_score, tier: stored.intervention_tier },
    matches: display === stored.consensus_score && tier?.tier === stored.intervention_tier,
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
  traceMismatches: number;
  /** 계산 종의 EWS 점수 고유값 — 값마다 종 수와 그 값을 만든 추세 입력 */
  ewsValues: { score: number; count: number; inputs: Record<string, number> }[];
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
  const ews = new Map<number, { score: number; count: number; inputs: Record<string, number> }>();
  for (const r of rows) {
    inc(popSource, inferPopulationWithSource(r).source);
    const trendSrc = trendToLambdaV4(r.iucn_population_trend ?? null, r.population_trend, r.category).source;
    inc(trendSource, trendSrc);
    const ewsScore = (JSON.parse(r.payload_json) as LayerPayload).layer_scores?.ews?.score;
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
    const tr = traceScore(r, JSON.parse(r.payload_json), r);
    if (!tr) {
      traceMismatches++;
      continue;
    }
    if (!tr.matches) traceMismatches++;
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
    ewsValues: Array.from(ews.values()).sort((a, b) => b.score - a.score),
  };
}
