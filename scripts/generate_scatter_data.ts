// 7-A: 산점도용 데이터 생성 — curated 4,230종.
//   실제 프로덕션 계산값·출처(inferPopulationWithSource)를 그대로 사용.
// 출력: data/scatter/species_scatter.json
// usage: tsx scripts/generate_scatter_data.ts
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { inferPopulationWithSource } from "../lib/tipping-point";
import type { SpeciesRow } from "../lib/db";

const DB = path.join(process.cwd(), "data", "species.db");
const OUT = path.join(process.cwd(), "data", "scatter", "species_scatter.json");

const db = new Database(DB, { readonly: true });
db.pragma("busy_timeout = 8000");

const rows = db.prepare(`
  SELECT s.*, tp.consensus_score, tp.intervention_tier
  FROM species s JOIN tipping_points tp ON tp.species_id = s.id
  WHERE s.is_curated = 1
`).all() as (SpeciesRow & { consensus_score: number; intervention_tier: string })[];

const species = rows.map((r) => {
  const pop = inferPopulationWithSource(r);
  return {
    scientific_name: r.scientific_name,
    common_name: r.common_name_ko || r.common_name_en || r.scientific_name,
    class_name: r.class_name,
    mass_g: r.mass_g,                         // null 가능 (X축 log10 → page에서 제외)
    consensus_score: r.consensus_score,
    intervention_tier: r.intervention_tier,
    iucn_category: r.category,
    population_size: pop.value,               // inferPopulation 실제 사용값
    population_source: pop.source,            // mature_individuals|iucn_population_size|fallback_criterion|fallback_category
  };
});

const withMass = species.filter((s) => s.mass_g != null && s.mass_g > 0).length;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({
  generated: "2026-07-27",
  count: species.length,
  count_with_mass: withMass,
  species,
}, null, 0));

db.close();
console.log(`✓ 산점도 데이터 저장: ${OUT}`);
console.log(`  전체 ${species.length}종 · mass_g 보유 ${withMass}종`);
// 출처별 분포
const bySource: Record<string, number> = {};
for (const s of species) bySource[s.population_source] = (bySource[s.population_source] || 0) + 1;
console.log("  population_source 분포:", bySource);
