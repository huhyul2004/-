// 결정 6(m≥2 max 블렌딩)과 결정 8(NaN 궤적 제외)의 영향을 나눠 잰다. DB 는 읽기만 한다.
//
//   저장값  = DB tipping_points (2026-10-03 변경 전 엔진으로 계산된 값)
//   α=1     = 새 엔진의 같은 레이어 점수를 블렌딩 없이 집계 (= 결정 8 만 반영)
//   새 점수 = 새 엔진 그대로 (결정 8 + 결정 6)
//
// 결정 6 영향 = 새 점수 − α=1 , 결정 8 영향 = α=1 − 저장값.
// 기본 시드·{ n_sim: 1500, T: 100 } (DB 를 채운 scripts/compute-tipping-points.ts 와 같음).
// 실행: tsx research/max_blending_impact.ts [출력 JSON]
import fs from "node:fs";
import Database from "better-sqlite3";
import { evaluateTippingPoint, aggregateConsensus, TIERS } from "../lib/tipping-point";
import type { SpeciesRow } from "../lib/db";

const out = process.argv[2] ?? "/tmp/max_blending_impact.json";
const db = new Database("data/species.db", { readonly: true });
const stored = new Map(
  (db.prepare("SELECT species_id, consensus_score, intervention_tier FROM tipping_points").all() as {
    species_id: string; consensus_score: number; intervention_tier: string;
  }[]).map((r) => [r.species_id, r])
);
const rows = db.prepare("SELECT * FROM species WHERE category NOT IN ('EX','EW')").all() as SpeciesRow[];

const tierOf = (score: number) => {
  const s = Math.round(score * 100) / 100;
  return (s < 20 ? TIERS[0] : s < 40 ? TIERS[1] : s < 60 ? TIERS[2] : s < 80 ? TIERS[3] : TIERS[4]).tier;
};

type Rec = {
  id: string; ko: string; category: string; iucn_class: string | null; N0: number;
  layers: { ews: number; pva: number; iucn: number }; m: number;
  weighted: number; blended: number; floor: number; floorBoundNoBlend: boolean; floorBoundBlend: boolean;
  stored: number; storedTier: string; alpha1: number; alpha1Tier: string; now: number; nowTier: string;
  effect6: number; effect8: number; nInvalid: number;
};
const recs: Rec[] = [];

for (const s of rows) {
  const r = evaluateTippingPoint(s, { n_sim: 1500, T: 100 });
  const old = stored.get(s.id);
  if (!r || !old || !r.aggregation || !r.inputs) continue;
  const agg = r.aggregation;
  const noBlend = aggregateConsensus(
    { layers: agg.layers, confidences: { ews: agg.confidence.ews, iucn: agg.confidence.iucn }, N0: r.inputs.N0, populationTrend: s.population_trend },
    { blendAlpha: 1 }
  );
  recs.push({
    id: s.id,
    ko: s.common_name_ko ?? s.scientific_name,
    category: s.category,
    iucn_class: (s as SpeciesRow & { iucn_class?: string | null }).iucn_class ?? null,
    N0: r.inputs.N0,
    layers: agg.layers,
    m: agg.m,
    weighted: agg.weighted,
    blended: agg.afterMajority,
    floor: agg.floor.value,
    floorBoundNoBlend: noBlend.floor.applied,
    floorBoundBlend: agg.floor.applied,
    stored: old.consensus_score,
    storedTier: old.intervention_tier,
    alpha1: noBlend.score,
    alpha1Tier: tierOf(noBlend.score),
    now: agg.score,
    nowTier: r.intervention_tier,
    effect6: Math.round((agg.score - noBlend.score) * 10) / 10,
    effect8: Math.round((noBlend.score - old.consensus_score) * 10) / 10,
    nInvalid: r.layer_scores.pva.n_invalid ?? 0,
  });
}

const by = <T,>(xs: T[], f: (x: T) => string) => xs.reduce<Record<string, number>>((a, x) => ((a[f(x)] = (a[f(x)] ?? 0) + 1), a), {});
const m2 = recs.filter((r) => r.m >= 2);
const changed6 = recs.filter((r) => r.effect6 !== 0);
const absorbed = m2.filter((r) => r.effect6 === 0);
const tier6 = changed6.filter((r) => r.alpha1Tier !== r.nowTier);
const changed8 = recs.filter((r) => r.effect8 !== 0);
const tier8 = changed8.filter((r) => r.storedTier !== r.alpha1Tier);
const deltas = changed6.map((r) => r.effect6).sort((a, b) => a - b);
const q = (p: number) => deltas[Math.min(deltas.length - 1, Math.floor(p * deltas.length))];

const summary = {
  computedSpecies: recs.length,
  mDistribution: by(recs, (r) => `m=${r.m}`),
  decision6: {
    m2Species: m2.length,
    scoreChanged: changed6.length,
    absorbedByFloorOrRounding: absorbed.length,
    absorbedByFloor: absorbed.filter((r) => r.floorBoundBlend).length,
    tierChanged: tier6.length,
    tierMoves: by(tier6, (r) => `${r.alpha1Tier}→${r.nowTier}`),
    deltaMin: deltas[0] ?? null, deltaMedian: q(0.5) ?? null, deltaMax: deltas[deltas.length - 1] ?? null,
    floorBoundBefore: recs.filter((r) => r.floorBoundNoBlend).length,
    floorBoundAfter: recs.filter((r) => r.floorBoundBlend).length,
    releasedFromFloor: recs.filter((r) => r.floorBoundNoBlend && !r.floorBoundBlend).length,
    byCategory: by(changed6, (r) => r.category),
  },
  decision8: {
    speciesWithInvalid: recs.filter((r) => r.nInvalid > 0).length,
    invalidTrajectories: recs.reduce((a, r) => a + r.nInvalid, 0),
    scoreChanged: changed8.length,
    up: changed8.filter((r) => r.effect8 > 0).length,
    down: changed8.filter((r) => r.effect8 < 0).length,
    maxAbs: Math.max(0, ...changed8.map((r) => Math.abs(r.effect8))),
    tierChanged: tier8.length,
  },
  combined: {
    scoreChanged: recs.filter((r) => r.now !== r.stored).length,
    tierChanged: recs.filter((r) => r.nowTier !== r.storedTier).length,
    tierMoves: by(recs.filter((r) => r.nowTier !== r.storedTier), (r) => `${r.storedTier}→${r.nowTier}`),
  },
};
console.log(JSON.stringify(summary, null, 1));
changed6.sort((a, b) => b.effect6 - a.effect6);
fs.writeFileSync(out, JSON.stringify({ summary, changed6, changed8, records: recs }, null, 1));
console.log(`→ ${out}`);
