// 엔진 변경의 영향 측정 — 지금 코드(lib/tipping-point.ts)로 다시 계산한 값과
// DB 에 저장된 tipping_points 를 비교한다. DB 는 읽기만 한다 (재계산 저장은 scripts/compute-tipping-points.ts).
//
// DB 를 채운 스크립트와 같은 조건: 기본 시드(종 ID 해시), { n_sim: 1500, T: 100 }.
// 실행: tsx research/engine_change_impact.ts [출력 JSON 경로] [--db <비교할 DB 경로>]
import fs from "node:fs";
import Database from "better-sqlite3";
import { evaluateTippingPoint } from "../lib/tipping-point";
import type { SpeciesRow } from "../lib/db";

const args = process.argv.slice(2);
const dbIdx = args.indexOf("--db");
const dbPath = dbIdx >= 0 ? args[dbIdx + 1] : "data/species.db";
const outPath = args.find((a, i) => !a.startsWith("--") && (dbIdx < 0 || i !== dbIdx + 1)) ?? "/tmp/engine_change_impact.json";

const db = new Database(dbPath, { readonly: true });
type Stored = { species_id: string; consensus_score: number; intervention_tier: string; payload_json: string };
const stored = new Map(
  (db.prepare("SELECT species_id, consensus_score, intervention_tier, payload_json FROM tipping_points").all() as Stored[]).map(
    (r) => [r.species_id, r]
  )
);
const rows = db.prepare("SELECT * FROM species").all() as SpeciesRow[];

type Change = {
  id: string; ko: string; category: string; N0: number | null;
  before: number; after: number; delta: number; tierBefore: string; tierAfter: string;
  mBefore: number | null; mAfter: number | null; nInvalid: number;
};
const changes: Change[] = [];
let computed = 0, scoredNow = 0, newlyScored = 0, droppedScore = 0, invalidSpecies = 0, invalidTraj = 0;
const at = { ews: 70, pva: 50, iucn: 60 };
const mOf = (p: { layer_scores?: { ews?: { score: number }; pva?: { score: number }; iucn?: { score: number } } } | null) => {
  const ls = p?.layer_scores;
  if (!ls?.ews || !ls?.pva || !ls?.iucn) return null;
  return [ls.ews.score > at.ews, ls.pva.score > at.pva, ls.iucn.score > at.iucn].filter(Boolean).length;
};

for (const s of rows) {
  const r = evaluateTippingPoint(s, { n_sim: 1500, T: 100 });
  const old = stored.get(s.id);
  if (r) scoredNow++;
  if (r && !old) newlyScored++;
  if (!r && old) droppedScore++;
  if (!r || !old) continue;
  computed++;
  const nInv = r.layer_scores.pva.n_invalid ?? 0;
  if (nInv > 0) { invalidSpecies++; invalidTraj += nInv; }
  if (r.consensus_score !== old.consensus_score || r.intervention_tier !== old.intervention_tier) {
    changes.push({
      id: s.id,
      ko: s.common_name_ko ?? s.scientific_name,
      category: s.category,
      N0: s.mature_individuals || s.iucn_population_size || null,
      before: old.consensus_score,
      after: r.consensus_score,
      delta: Math.round((r.consensus_score - old.consensus_score) * 10) / 10,
      tierBefore: old.intervention_tier,
      tierAfter: r.intervention_tier,
      mBefore: mOf(JSON.parse(old.payload_json)),
      mAfter: mOf(r as never),
      nInvalid: nInv,
    });
  }
}

changes.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
const tierMoves: Record<string, number> = {};
for (const c of changes) if (c.tierBefore !== c.tierAfter) tierMoves[`${c.tierBefore}→${c.tierAfter}`] = (tierMoves[`${c.tierBefore}→${c.tierAfter}`] ?? 0) + 1;

const summary = {
  db: dbPath,
  compared: computed,
  scoredNow,
  newlyScored,
  droppedScore,
  speciesWithInvalidTrajectories: invalidSpecies,
  invalidTrajectories: invalidTraj,
  scoreOrTierChanged: changes.length,
  up: changes.filter((c) => c.delta > 0).length,
  down: changes.filter((c) => c.delta < 0).length,
  tierChanged: changes.filter((c) => c.tierBefore !== c.tierAfter).length,
  tierMoves,
};
console.log(JSON.stringify(summary, null, 1));
for (const c of changes.slice(0, 15))
  console.log(`  ${c.ko.slice(0, 20).padEnd(20)} ${c.category} N0=${c.N0}  ${c.before} → ${c.after} (${c.delta >= 0 ? "+" : ""}${c.delta})  ${c.tierBefore}→${c.tierAfter}  m ${c.mBefore}→${c.mAfter}`);
fs.writeFileSync(outPath, JSON.stringify({ summary, changes }, null, 1));
console.log(`→ ${outPath}`);
