import { getDb, type SpeciesRow, CURRENT_CATEGORIES, EXTINCT_CATEGORIES } from "./db";

export function getCachedOneLiner(speciesId: string): string | null {
  const db = getDb();
  const row = db
    .prepare("SELECT payload_json FROM ai_recommendations WHERE species_id = ?")
    .get(speciesId) as { payload_json: string } | undefined;
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.payload_json) as { oneLiner?: string };
    return parsed.oneLiner ?? null;
  } catch {
    return null;
  }
}

export type SortKey = "risk" | "name" | "recent" | "class";

export function listAtRiskSpecies(filters?: {
  category?: string;
  className?: string;
  sort?: SortKey;
}): SpeciesRow[] {
  const db = getDb();
  const conditions: string[] = [`category IN (${CURRENT_CATEGORIES.map(() => "?").join(",")})`];
  const params: unknown[] = [...CURRENT_CATEGORIES];

  if (filters?.category && (CURRENT_CATEGORIES as readonly string[]).includes(filters.category)) {
    conditions.length = 0;
    conditions.push("category = ?");
    params.length = 0;
    params.push(filters.category);
  }
  if (filters?.className) {
    conditions.push("class_name = ?");
    params.push(filters.className);
  }

  const sortClauses: Record<SortKey, string> = {
    risk: `CASE category WHEN 'CR' THEN 0 WHEN 'EN' THEN 1 WHEN 'VU' THEN 2 ELSE 3 END,
           common_name_ko COLLATE NOCASE`,
    name: "common_name_ko COLLATE NOCASE, scientific_name COLLATE NOCASE",
    recent: "datetime(updated_at) DESC, common_name_ko COLLATE NOCASE",
    class: "class_name COLLATE NOCASE, common_name_ko COLLATE NOCASE",
  };
  const orderBy = sortClauses[filters?.sort ?? "risk"];

  const sql = `SELECT * FROM species WHERE ${conditions.join(" AND ")} ORDER BY ${orderBy}`;
  return db.prepare(sql).all(...params) as SpeciesRow[];
}

export function listSpeciesByIds(ids: string[]): SpeciesRow[] {
  if (ids.length === 0) return [];
  const db = getDb();
  const placeholders = ids.map(() => "?").join(",");
  return db
    .prepare(`SELECT * FROM species WHERE id IN (${placeholders})`)
    .all(...ids) as SpeciesRow[];
}

export function getStats() {
  const db = getDb();
  const byCategory = db
    .prepare("SELECT category, COUNT(*) as n FROM species GROUP BY category ORDER BY category")
    .all() as { category: string; n: number }[];
  const byClassRisk = db
    .prepare(
      `SELECT class_name, COUNT(*) as n FROM species
       WHERE class_name IS NOT NULL AND category IN ('CR','EN','VU')
       GROUP BY class_name ORDER BY n DESC LIMIT 10`
    )
    .all() as { class_name: string; n: number }[];
  const extinctByYear = db
    .prepare(
      `SELECT
         CASE
           WHEN extinction_year < 1700 THEN '1700년 이전'
           WHEN extinction_year < 1800 THEN '1700-1799'
           WHEN extinction_year < 1900 THEN '1800-1899'
           WHEN extinction_year < 2000 THEN '1900-1999'
           ELSE '2000년 이후'
         END as bucket,
         COUNT(*) as n
       FROM species WHERE category = 'EX' AND extinction_year IS NOT NULL
       GROUP BY bucket ORDER BY MIN(extinction_year)`
    )
    .all() as { bucket: string; n: number }[];
  return { byCategory, byClassRisk, extinctByYear };
}

export function listExtinctSpecies(): SpeciesRow[] {
  const db = getDb();
  const sql = `SELECT * FROM species WHERE category IN (${EXTINCT_CATEGORIES.map(() => "?").join(",")})
    ORDER BY extinction_year DESC, common_name_ko COLLATE NOCASE`;
  return db.prepare(sql).all(...EXTINCT_CATEGORIES) as SpeciesRow[];
}

export function getSpeciesById(id: string): SpeciesRow | null {
  const db = getDb();
  return (db.prepare("SELECT * FROM species WHERE id = ?").get(id) as SpeciesRow | undefined) ?? null;
}

export function getThreats(speciesId: string) {
  const db = getDb();
  return db.prepare("SELECT * FROM threats WHERE species_id = ? ORDER BY id").all(speciesId);
}

export function getActions(speciesId: string) {
  const db = getDb();
  return db.prepare("SELECT * FROM conservation_actions WHERE species_id = ? ORDER BY id").all(speciesId);
}

export function getHabitats(speciesId: string) {
  const db = getDb();
  return db.prepare("SELECT * FROM habitats WHERE species_id = ? ORDER BY id").all(speciesId);
}

export function listClasses(): string[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT DISTINCT class_name FROM species WHERE class_name IS NOT NULL ORDER BY class_name")
    .all() as { class_name: string }[];
  return rows.map((r) => r.class_name);
}

export function countByCategory(): Record<string, number> {
  const db = getDb();
  const rows = db
    .prepare("SELECT category, COUNT(*) as n FROM species GROUP BY category")
    .all() as { category: string; n: number }[];
  const out: Record<string, number> = {};
  for (const r of rows) out[r.category] = r.n;
  return out;
}

export function countByClass(extinct = false): Record<string, number> {
  const db = getDb();
  const cats = extinct ? EXTINCT_CATEGORIES : CURRENT_CATEGORIES;
  const sql = `SELECT class_name, COUNT(*) as n FROM species
    WHERE class_name IS NOT NULL AND category IN (${cats.map(() => "?").join(",")})
    GROUP BY class_name`;
  const rows = db.prepare(sql).all(...cats) as { class_name: string; n: number }[];
  const out: Record<string, number> = {};
  for (const r of rows) out[r.class_name] = r.n;
  return out;
}
