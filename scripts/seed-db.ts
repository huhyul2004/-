import fs from "fs";
import path from "path";
import { getDb } from "../lib/db";

interface SeedSpecies {
  id: string;
  scientific_name: string;
  common_name_en: string;
  common_name_ko: string;
  category: string;
  class_name?: string;
  family?: string;
  region?: string;
  population_trend?: string;
  mature_individuals?: number | null;
  summary_ko?: string;
  wikipedia_title?: string;
  year_published?: number;
  extinction_year?: number;
  extinction_cause?: string;
  threats?: { name: string; severity?: string; code?: string }[];
  conservation_actions?: { name: string; code?: string }[];
  habitats?: { name: string; suitability?: string }[];
}

function main() {
  const dir = path.join(process.cwd(), "data/curated");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const species: SeedSpecies[] = [];
  for (const f of files) {
    const raw = fs.readFileSync(path.join(dir, f), "utf-8");
    species.push(...(JSON.parse(raw) as SeedSpecies[]));
  }
  console.log(`로드된 큐레이션 파일: ${files.join(", ")} (총 ${species.length} 종)`);

  const db = getDb();
  const insertSpecies = db.prepare(`
    INSERT INTO species (
      id, scientific_name, common_name_en, common_name_ko, category,
      class_name, family, region, population_trend, mature_individuals,
      summary_ko, wikipedia_title, extinction_year, extinction_cause, year_published
    ) VALUES (
      @id, @scientific_name, @common_name_en, @common_name_ko, @category,
      @class_name, @family, @region, @population_trend, @mature_individuals,
      @summary_ko, @wikipedia_title, @extinction_year, @extinction_cause, @year_published
    )
    ON CONFLICT(id) DO UPDATE SET
      scientific_name=excluded.scientific_name,
      common_name_en=excluded.common_name_en,
      common_name_ko=excluded.common_name_ko,
      category=excluded.category,
      class_name=excluded.class_name,
      family=excluded.family,
      region=excluded.region,
      population_trend=excluded.population_trend,
      mature_individuals=excluded.mature_individuals,
      summary_ko=excluded.summary_ko,
      wikipedia_title=excluded.wikipedia_title,
      extinction_year=excluded.extinction_year,
      extinction_cause=excluded.extinction_cause,
      year_published=excluded.year_published,
      updated_at=CURRENT_TIMESTAMP
  `);

  const clearThreats = db.prepare("DELETE FROM threats WHERE species_id = ?");
  const clearActions = db.prepare("DELETE FROM conservation_actions WHERE species_id = ?");
  const clearHabitats = db.prepare("DELETE FROM habitats WHERE species_id = ?");
  const insertThreat = db.prepare(`INSERT INTO threats (species_id, threat_code, threat_name, severity) VALUES (?,?,?,?)`);
  const insertAction = db.prepare(`INSERT INTO conservation_actions (species_id, action_code, action_name) VALUES (?,?,?)`);
  const insertHabitat = db.prepare(`INSERT INTO habitats (species_id, habitat_name, suitability) VALUES (?,?,?)`);

  const tx = db.transaction((items: SeedSpecies[]) => {
    for (const s of items) {
      insertSpecies.run({
        id: s.id,
        scientific_name: s.scientific_name,
        common_name_en: s.common_name_en ?? null,
        common_name_ko: s.common_name_ko ?? null,
        category: s.category,
        class_name: s.class_name ?? null,
        family: s.family ?? null,
        region: s.region ?? null,
        population_trend: s.population_trend ?? null,
        mature_individuals: s.mature_individuals ?? null,
        summary_ko: s.summary_ko ?? null,
        wikipedia_title: s.wikipedia_title ?? null,
        extinction_year: s.extinction_year ?? null,
        extinction_cause: s.extinction_cause ?? null,
        year_published: s.year_published ?? null,
      });
      clearThreats.run(s.id);
      clearActions.run(s.id);
      clearHabitats.run(s.id);
      for (const t of s.threats ?? []) insertThreat.run(s.id, t.code ?? null, t.name, t.severity ?? null);
      for (const a of s.conservation_actions ?? []) insertAction.run(s.id, a.code ?? null, a.name);
      for (const h of s.habitats ?? []) insertHabitat.run(s.id, h.name, h.suitability ?? null);
    }
  });

  tx(species);
  console.log(`✓ Seeded ${species.length} species`);

  const counts = db.prepare(
    "SELECT category, COUNT(*) as n FROM species GROUP BY category ORDER BY category"
  ).all() as { category: string; n: number }[];
  for (const c of counts) console.log(`  ${c.category}: ${c.n}`);
}

main();
