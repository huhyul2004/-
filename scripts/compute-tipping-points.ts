// 모든 종에 대해 EWS-PVA-IUCN Hybrid 점수 계산 후 DB 캐시
// usage: tsx scripts/compute-tipping-points.ts
import fs from "fs";
import path from "path";

const envFile = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

import { getDb, SpeciesRow } from "../lib/db";
import { evaluateTippingPoint } from "../lib/tipping-point";

const TODAY = new Date("2026-05-03");

function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

async function main() {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM species ORDER BY id").all() as SpeciesRow[];
  console.log(`${rows.length} 종 임계점 계산 시작`);

  const upsert = db.prepare(`
    INSERT INTO tipping_points (species_id, consensus_score, intervention_tier, deadline_days, extinction_days, payload_json, computed_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(species_id) DO UPDATE SET
      consensus_score = excluded.consensus_score,
      intervention_tier = excluded.intervention_tier,
      deadline_days = excluded.deadline_days,
      extinction_days = excluded.extinction_days,
      payload_json = excluded.payload_json,
      computed_at = CURRENT_TIMESTAMP
  `);

  let done = 0;
  const t0 = Date.now();
  for (const s of rows) {
    try {
      const result = evaluateTippingPoint(s, { n_sim: 1500, T: 100 });
      const deadlineDate = new Date(result.dates.intervention_deadline_date);
      const extDate = result.dates.extinction_estimate_date
        ? new Date(result.dates.extinction_estimate_date)
        : null;
      const deadline_days = daysBetween(TODAY, deadlineDate);
      const extinction_days = extDate ? daysBetween(TODAY, extDate) : null;

      upsert.run(
        s.id,
        result.consensus_score,
        result.intervention_tier,
        deadline_days,
        extinction_days,
        JSON.stringify(result)
      );

      done++;
      if (done % 100 === 0) {
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        console.log(`  ${done}/${rows.length}  (${elapsed}s)`);
      }
    } catch (e) {
      console.error(`  ✗ ${s.id}: ${(e as Error).message}`);
    }
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n✓ ${done}/${rows.length} 완료 (${elapsed}s)`);

  // Tier 분포
  const dist = db
    .prepare("SELECT intervention_tier, COUNT(*) as n FROM tipping_points GROUP BY intervention_tier ORDER BY intervention_tier")
    .all() as { intervention_tier: string; n: number }[];
  console.log("\nTier 분포:");
  for (const d of dist) console.log(`  ${d.intervention_tier}: ${d.n}`);

  // 가장 시급한 종 10개
  console.log("\n시급도 TOP 10:");
  const urgent = db
    .prepare(`
      SELECT s.common_name_ko, s.scientific_name, s.category, t.consensus_score, t.intervention_tier, t.deadline_days
      FROM tipping_points t JOIN species s ON s.id = t.species_id
      WHERE s.category NOT IN ('EX','EW')
      ORDER BY t.deadline_days ASC, t.consensus_score DESC LIMIT 10`)
    .all() as { common_name_ko: string | null; scientific_name: string; category: string; consensus_score: number; intervention_tier: string; deadline_days: number }[];
  for (const u of urgent) {
    console.log(`  [${u.intervention_tier}] ${u.common_name_ko ?? u.scientific_name} (${u.category}) — ${u.deadline_days}일 / score ${u.consensus_score.toFixed(1)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
