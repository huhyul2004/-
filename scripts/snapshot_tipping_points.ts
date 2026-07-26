// 재계산 전 tipping_points 상태를 JSON 스냅샷으로 저장.
// 재계산 후 종별 변화량(consensus/tier/레이어) 분석에 사용.
// usage: tsx scripts/snapshot_tipping_points.ts [출력경로]
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

const DB = path.join(process.cwd(), "data", "species.db");
const OUT = process.argv[2] ||
  path.join(process.cwd(), "data", "snapshots", "pre_v4p1_reindex_2026-07-23.json");

const db = new Database(DB, { readonly: true });
db.pragma("busy_timeout = 8000");

const rows = db.prepare(`
  SELECT tp.species_id, s.scientific_name, tp.consensus_score, tp.intervention_tier,
         tp.payload_json, tp.computed_at
  FROM tipping_points tp JOIN species s ON s.id = tp.species_id
`).all() as {
  species_id: string; scientific_name: string; consensus_score: number;
  intervention_tier: string; payload_json: string; computed_at: string;
}[];

const snapshot = rows.map((r) => {
  let ews: number | null = null, pva: number | null = null, iucn: number | null = null;
  try {
    const p = JSON.parse(r.payload_json);
    ews = p.layer_scores?.ews?.score ?? null;
    pva = p.layer_scores?.pva?.score ?? null;
    iucn = p.layer_scores?.iucn?.score ?? null;
  } catch { /* payload 파싱 실패 → 레이어 null */ }
  return {
    species_id: r.species_id,
    scientific_name: r.scientific_name,
    consensus_score: r.consensus_score,
    intervention_tier: r.intervention_tier,
    ews_score: ews,
    pva_score: pva,
    iucn_score: iucn,
    computed_at: r.computed_at,
  };
});

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({
  generated: "2026-07-23",
  label: "pre_v4p1_reindex",
  count: snapshot.length,
  species: snapshot,
}, null, 0));

db.close();
console.log(`✓ 스냅샷 저장: ${OUT}`);
console.log(`  종 수: ${snapshot.length}`);
const withLayers = snapshot.filter((s) => s.ews_score != null).length;
console.log(`  레이어 파싱 성공: ${withLayers}`);
