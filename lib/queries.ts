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

export type SortKey = "urgency" | "risk" | "name" | "recent" | "class";

// SpeciesRow 에 tipping_point 정보 join 한 확장 타입
export interface SpeciesWithTipping extends SpeciesRow {
  consensus_score: number | null;
  intervention_tier: string | null;
  deadline_days: number | null;
  extinction_days: number | null;
}

export const PAGE_SIZE = 60;

export function listAtRiskSpecies(filters?: {
  category?: string;
  className?: string;
  sort?: SortKey;
  page?: number;
  pageSize?: number;
}): { rows: SpeciesWithTipping[]; total: number } {
  const db = getDb();
  const conditions: string[] = [`s.category IN (${CURRENT_CATEGORIES.map(() => "?").join(",")})`];
  const params: unknown[] = [...CURRENT_CATEGORIES];

  if (filters?.category && (CURRENT_CATEGORIES as readonly string[]).includes(filters.category)) {
    conditions.length = 0;
    conditions.push("s.category = ?");
    params.length = 0;
    params.push(filters.category);
  }
  if (filters?.className === "__none__") {
    conditions.push("s.class_name IS NULL");
  } else if (filters?.className) {
    conditions.push("s.class_name = ?");
    params.push(filters.className);
  }

  const sortClauses: Record<SortKey, string> = {
    urgency: `COALESCE(t.deadline_days, 999999) ASC, COALESCE(t.consensus_score, 0) DESC, s.common_name_ko COLLATE NOCASE`,
    risk: `CASE s.category WHEN 'CR' THEN 0 WHEN 'EN' THEN 1 WHEN 'VU' THEN 2 ELSE 3 END,
           s.common_name_ko COLLATE NOCASE`,
    name: "s.common_name_ko COLLATE NOCASE, s.scientific_name COLLATE NOCASE",
    recent: "datetime(s.updated_at) DESC, s.common_name_ko COLLATE NOCASE",
    class: "s.class_name COLLATE NOCASE, s.common_name_ko COLLATE NOCASE",
  };
  const orderBy = sortClauses[filters?.sort ?? "urgency"];
  const pageSize = filters?.pageSize ?? PAGE_SIZE;
  const page = Math.max(1, filters?.page ?? 1);
  const offset = (page - 1) * pageSize;

  // Total count (without LIMIT)
  const countSql = `SELECT COUNT(*) as n FROM species s WHERE ${conditions.join(" AND ")}`;
  const total = (db.prepare(countSql).get(...params) as { n: number }).n;

  const sql = `
    SELECT s.*,
           t.consensus_score, t.intervention_tier, t.deadline_days, t.extinction_days
    FROM species s
    LEFT JOIN tipping_points t ON t.species_id = s.id
    WHERE ${conditions.join(" AND ")}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?`;
  const rows = db.prepare(sql).all(...params, pageSize, offset) as SpeciesWithTipping[];
  return { rows, total };
}

export function getTippingPoint(speciesId: string): {
  consensus_score: number;
  intervention_tier: string;
  deadline_days: number;
  extinction_days: number | null;
  payload: unknown;
} | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT consensus_score, intervention_tier, deadline_days, extinction_days, payload_json
       FROM tipping_points WHERE species_id = ?`
    )
    .get(speciesId) as
    | {
        consensus_score: number;
        intervention_tier: string;
        deadline_days: number;
        extinction_days: number | null;
        payload_json: string;
      }
    | undefined;
  if (!row) return null;
  return {
    consensus_score: row.consensus_score,
    intervention_tier: row.intervention_tier,
    deadline_days: row.deadline_days,
    extinction_days: row.extinction_days,
    payload: JSON.parse(row.payload_json),
  };
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

// 분류군 미상 (class_name IS NULL) 카운트 — 위협 종 기준
export function countUnclassified(extinct = false): number {
  const db = getDb();
  const cats = extinct ? EXTINCT_CATEGORIES : CURRENT_CATEGORIES;
  const sql = `SELECT COUNT(*) as n FROM species
    WHERE class_name IS NULL AND category IN (${cats.map(() => "?").join(",")})`;
  const r = db.prepare(sql).all(...cats) as { n: number }[];
  return r[0]?.n ?? 0;
}
