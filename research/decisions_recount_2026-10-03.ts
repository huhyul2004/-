// 결정 대기 항목을 엔진 5.1.0 기준으로 다시 센다 (2026-10-03). DB 는 읽기만 한다.
//
// DB 에 저장된 레이어 점수·신뢰도(payload.aggregation)를 그대로 두고 집계만 aggregateConsensus 의
// 반사실 옵션으로 다시 한다 — 레이어 점수는 몬테카를로를 다시 돌리지 않으므로 DB 와 같은 시드의 값이다.
//   항목 1·4  개체수 하한 — 하한이 점수를 정한 종, 등급, 하한을 빼면 티어가 바뀌는 종
//   항목 9    다수결 문턱을 명세서 H = 60 한 값으로 — 경보·점수·티어 변화 (2026-09 문서는 "집계 없음")
//   항목 10   Ricker 폭주 — 무효 궤적 (payload.layer_scores.pva.n_invalid)
//   항목 11   0표 배율을 명세서 γ = 0.70 으로 — 점수·티어 변화
// 실행: tsx research/decisions_recount_2026-10-03.ts [출력 JSON]
import fs from "node:fs";
import Database from "better-sqlite3";
import { aggregateConsensus, inferPopulationWithSource, TIERS, type AggregationOptions, type AggregationTrace } from "../lib/tipping-point";
import type { SpeciesRow } from "../lib/db";

const out = process.argv[2] ?? "/tmp/decisions_recount_2026-10-03.json";
const tierOf = (s: number) => {
  const x = Math.round(s * 100) / 100;
  return (x < 20 ? TIERS[0] : x < 40 ? TIERS[1] : x < 60 ? TIERS[2] : x < 80 ? TIERS[3] : TIERS[4]).tier;
};
const db = new Database("data/species.db", { readonly: true });
const rows = db
  .prepare(
    `SELECT s.*, t.consensus_score AS tp_score, t.intervention_tier AS tp_tier, t.payload_json AS tp_payload
     FROM tipping_points t JOIN species s ON s.id = t.species_id WHERE s.category NOT IN ('EX','EW')`
  )
  .all() as (SpeciesRow & { tp_score: number; tp_tier: string; tp_payload: string })[];

type P = { aggregation: AggregationTrace; layer_scores: { pva: { n_invalid?: number; n_ext_time_nan?: number } } };
const recs = rows.map((r) => ({ r, p: JSON.parse(r.tp_payload) as P, N0: inferPopulationWithSource(r).value! }));
const redo = (x: (typeof recs)[number], opts: AggregationOptions = {}) =>
  aggregateConsensus(
    {
      layers: x.p.aggregation.layers,
      confidences: { ews: x.p.aggregation.confidence.ews, iucn: x.p.aggregation.confidence.iucn },
      N0: x.N0,
      populationTrend: x.r.population_trend,
    },
    opts
  );
const name = (r: SpeciesRow) => r.common_name_ko ?? r.scientific_name;
const count = <T,>(xs: T[], f: (x: T) => string) => xs.reduce<Record<string, number>>((a, x) => ((a[f(x)] = (a[f(x)] ?? 0) + 1), a), {});

// 기준 — 옵션 없이 다시 집계하면 저장 점수와 같아야 한다
const baseMismatch = recs.filter((x) => redo(x).score !== x.r.tp_score).length;

// 항목 1·4
const bound = recs.filter((x) => x.p.aggregation.floor.applied);
const floorTierFlip = bound.filter((x) => tierOf(x.p.aggregation.scoreWithoutFloor) !== x.r.tp_tier);
const floorNonThreat = bound
  .filter((x) => !["CR", "EN"].includes(x.r.category))
  .map((x) => ({ ko: name(x.r), category: x.r.category, N0: x.N0, floor: x.p.aggregation.floor.value, score: x.r.tp_score, tier: x.r.tp_tier, withoutFloor: x.p.aggregation.scoreWithoutFloor, tierWithoutFloor: tierOf(x.p.aggregation.scoreWithoutFloor) }));

// 항목 9 — H = 60
const H = { ews: 60, pva: 60, iucn: 60 };
const item9 = recs.map((x) => ({ x, a: redo(x, { alertThresholds: H }) }));
const alertFlips = {
  ews: item9.filter(({ x, a }) => a.alerts.ews !== x.p.aggregation.alerts.ews).length,
  pva: item9.filter(({ x, a }) => a.alerts.pva !== x.p.aggregation.alerts.pva).length,
  iucn: item9.filter(({ x, a }) => a.alerts.iucn !== x.p.aggregation.alerts.iucn).length,
};
const item9Changed = item9.filter(({ x, a }) => a.score !== x.r.tp_score);
const item9Moves = count(item9Changed.filter(({ x, a }) => tierOf(a.score) !== x.r.tp_tier), ({ x, a }) => `${x.r.tp_tier}→${tierOf(a.score)}`);
const mMoves = count(item9.filter(({ x, a }) => a.m !== x.p.aggregation.m), ({ x, a }) => `m ${x.p.aggregation.m}→${a.m}`);

// 항목 11 — γ = 0.70
const item11 = recs.map((x) => ({ x, a: redo(x, { majorityFactors: { zero: 0.7 } }) }));
const item11Changed = item11.filter(({ x, a }) => a.score !== x.r.tp_score);
const item11Moves = count(item11Changed.filter(({ x, a }) => tierOf(a.score) !== x.r.tp_tier), ({ x, a }) => `${x.r.tp_tier}→${tierOf(a.score)}`);
const m0 = recs.filter((x) => x.p.aggregation.m === 0);

// 항목 10
const invalid = recs.filter((x) => (x.p.layer_scores.pva.n_invalid ?? 0) > 0);

const summary = {
  computed: recs.length,
  baseMismatch,
  item1: { floorBound: bound.length, byCategory: count(bound, (x) => x.r.category), tierFlipWithoutFloor: floorTierFlip.length },
  item4: { nonThreatBound: floorNonThreat },
  item9: {
    alertFlips,
    mMoves,
    scoreChanged: item9Changed.length,
    up: item9Changed.filter(({ x, a }) => a.score > x.r.tp_score).length,
    down: item9Changed.filter(({ x, a }) => a.score < x.r.tp_score).length,
    tierMoves: item9Moves,
    examples: item9Changed.slice(0, 5).map(({ x, a }) => `${name(x.r)} ${x.r.tp_score}→${a.score} (m ${x.p.aggregation.m}→${a.m})`),
  },
  item10: {
    species: invalid.length,
    trajectories: invalid.reduce((s, x) => s + (x.p.layer_scores.pva.n_invalid ?? 0), 0),
    extTimeNaN: invalid.reduce((s, x) => s + (x.p.layer_scores.pva.n_ext_time_nan ?? 0), 0),
  },
  item11: {
    m0Species: m0.length,
    m0FloorBound: m0.filter((x) => x.p.aggregation.floor.applied).length,
    scoreChanged: item11Changed.length,
    tierMoves: item11Moves,
    maxDelta: Math.max(0, ...item11Changed.map(({ x, a }) => Math.round((a.score - x.r.tp_score) * 10) / 10)),
  },
};
console.log(JSON.stringify(summary, null, 1));
fs.writeFileSync(out, JSON.stringify(summary, null, 1));
