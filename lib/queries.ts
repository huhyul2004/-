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

export type SortKey = "urgency" | "score" | "population" | "risk" | "name" | "recent" | "class";

// 정렬에서 값이 없는 종의 자리 — 목록 화면에 그대로 적는다.
export const SORT_RULE =
  "절멸(EX·EW)은 모든 정렬에서 맨 뒤. v5 점수순·개체수순에서 값이 없는 종은 값이 있는 종 뒤에 이름순으로 둡니다.";

// ── 목록 필터 ── 축끼리는 AND, 분류군 안에서는 OR(다중 선택).
export const NONE = "__none__"; // 값 없음: 분류 미상 · 추세 기록 없음 · 점수 없음
export const TREND_VALUES = ["Decreasing", "Stable", "Increasing", "Unknown"] as const;
export const TIER_VALUES = ["T4", "T3", "T2", "T1", "T0", "EX"] as const;
export type FilterAxis = "category" | "class" | "trend" | "tier" | "threat";

export interface ListFilters {
  category?: string;
  /** class_name 여러 개 — OR. NONE 은 class_name IS NULL */
  classNames?: string[];
  /** iucn_population_trend. NONE 은 기록 없음 */
  trend?: string;
  /** tipping_points.intervention_tier. NONE 은 점수 없음 */
  tier?: string;
  /** IUCN 위협 대분류 코드 "1"~"12" — 그 대분류 위협 행(시기 무관)이 하나라도 있는 종 */
  threat?: string;
  curatedOnly?: boolean;
}

// tier 필터·점수 정렬 때문에 tipping_points 를 항상 붙인다 (종당 최대 1행이라 행 수는 그대로).
const FROM = "FROM species s LEFT JOIN tipping_points t ON t.species_id = s.id";

/** WHERE 절. skip 축은 빼고 만든다 — 그 축의 항목별 종 수(facet)와 "이 필터를 풀면 N종" 에 쓴다. */
function filterWhere(f: ListFilters, skip?: FilterAxis): { where: string; params: unknown[] } {
  const scope = scopeClause(f.curatedOnly ?? true);
  const conds: string[] = [scope.clause];
  const params: unknown[] = [...scope.params];

  if (skip !== "category" && f.category && (ALL_CATEGORIES as readonly string[]).includes(f.category)) {
    conds.push("s.category = ?");
    params.push(f.category);
  }
  if (skip !== "class" && f.classNames?.length) {
    const names = f.classNames.filter((c) => c !== NONE);
    const parts: string[] = [];
    if (names.length) {
      parts.push(`s.class_name IN (${names.map(() => "?").join(",")})`);
      params.push(...names);
    }
    if (f.classNames.includes(NONE)) parts.push("s.class_name IS NULL");
    conds.push(`(${parts.join(" OR ")})`);
  }
  if (skip !== "trend" && f.trend) {
    if (f.trend === NONE) conds.push("s.iucn_population_trend IS NULL");
    else if ((TREND_VALUES as readonly string[]).includes(f.trend)) {
      conds.push("s.iucn_population_trend = ?");
      params.push(f.trend);
    }
  }
  if (skip !== "tier" && f.tier) {
    if (f.tier === NONE) conds.push("t.species_id IS NULL");
    else if ((TIER_VALUES as readonly string[]).includes(f.tier)) {
      conds.push("t.intervention_tier = ?");
      params.push(f.tier);
    }
  }
  if (skip !== "threat" && f.threat && /^(1[0-2]|[1-9])$/.test(f.threat)) {
    // "8" 은 8 과 8_… 만 — LIKE 의 _ 는 한 글자 와일드카드라 이스케이프해야 "80" 같은 코드가 섞이지 않는다
    conds.push(
      "EXISTS (SELECT 1 FROM threats th WHERE th.species_id = s.id AND (th.threat_code = ? OR th.threat_code LIKE ? ESCAPE '\\'))"
    );
    params.push(f.threat, `${f.threat}\\_%`);
  }
  return { where: conds.join(" AND "), params };
}

export function countSpecies(f: ListFilters, skip?: FilterAxis): number {
  const { where, params } = filterWhere(f, skip);
  return (getDb().prepare(`SELECT COUNT(*) AS n ${FROM} WHERE ${where}`).get(...params) as { n: number }).n;
}

export interface Facets {
  category: Record<string, number>;
  class: Record<string, number>;
  trend: Record<string, number>;
  tier: Record<string, number>;
  threat: Record<string, number>;
}

/** 축마다 "다른 축 필터만 건 상태" 의 항목별 종 수. 값 없음은 NONE 키. */
export function facetCounts(f: ListFilters): Facets {
  const db = getDb();
  const group = (axis: FilterAxis, key: string, join = "", count = "COUNT(*)") => {
    const { where, params } = filterWhere(f, axis);
    const rows = db
      .prepare(`SELECT ${key} AS k, ${count} AS n ${FROM} ${join} WHERE ${where} GROUP BY k`)
      .all(...params) as { k: string; n: number }[];
    return Object.fromEntries(rows.map((r) => [r.k, r.n]));
  };
  return {
    category: group("category", "s.category"),
    class: group("class", `COALESCE(s.class_name, '${NONE}')`),
    trend: group("trend", `COALESCE(s.iucn_population_trend, '${NONE}')`),
    tier: group("tier", `COALESCE(t.intervention_tier, '${NONE}')`),
    threat: group(
      "threat",
      "substr(th.threat_code, 1, instr(th.threat_code || '_', '_') - 1)",
      "JOIN threats th ON th.species_id = s.id AND th.threat_code IS NOT NULL",
      "COUNT(DISTINCT s.id)"
    ),
  };
}

/** IUCN 위협 대분류 코드 → 영문 이름 (threats.threat_category 에서) */
export function threatCategoryNames(): Record<string, string> {
  const rows = getDb()
    .prepare(
      `SELECT substr(threat_code, 1, instr(threat_code || '_', '_') - 1) AS code, MIN(threat_category) AS name
       FROM threats WHERE threat_code IS NOT NULL AND threat_category IS NOT NULL GROUP BY code`
    )
    .all() as { code: string; name: string }[];
  return Object.fromEntries(rows.map((r) => [r.code, r.name]));
}

// SpeciesRow 에 tipping_point 정보 join 한 확장 타입
export interface SpeciesWithTipping extends SpeciesRow {
  consensus_score: number | null;
  intervention_tier: string | null;
  deadline_days: number | null;
  extinction_days: number | null;
}

export const PAGE_SIZE = 60;

const ALL_CATEGORIES = ["CR", "EN", "VU", "NT", "LC", "EX", "EW", "DD", "NE"] as const;

// is_curated 컬럼 존재 여부 (마이그레이션 미배포 시에도 크래시 없이 폴백). 1회 캐시.
let _hasCurated: boolean | null = null;
export function hasCuratedColumn(): boolean {
  if (_hasCurated !== null) return _hasCurated;
  const db = getDb();
  _hasCurated = (db.prepare("PRAGMA table_info(species)").all() as { name: string }[]).some((c) => c.name === "is_curated");
  return _hasCurated;
}

// 목록 스코프:
//   curatedOnly=true  → 큐레이션 종만 (is_curated=1, 등급 무관 ~4,230)
//   curatedOnly=false → 전체 (등급 무관, 38,082)
//   컬럼 부재(마이그레이션 전) → 기존 동작(CR/EN/VU)으로 안전 폴백
function scopeClause(curatedOnly: boolean): { clause: string; params: unknown[] } {
  if (curatedOnly && hasCuratedColumn()) return { clause: "s.is_curated = 1", params: [] };
  if (!hasCuratedColumn()) return { clause: `s.category IN (${CURRENT_CATEGORIES.map(() => "?").join(",")})`, params: [...CURRENT_CATEGORIES] };
  return { clause: "1=1", params: [] };
}

export function listAtRiskSpecies(
  filters?: ListFilters & {
    sort?: SortKey;
    page?: number;
    pageSize?: number;
  }
): { rows: SpeciesWithTipping[]; total: number } {
  const db = getDb();
  const { where, params } = filterWhere(filters ?? {});

  const NAME = "COALESCE(s.common_name_ko, s.common_name_en, s.scientific_name) COLLATE NOCASE";
  // v5 와 같은 개체수(N₀) — lib/tipping-point.ts inferPopulationWithSource 의 순서 그대로
  const POP =
    "CASE WHEN s.mature_individuals > 0 THEN s.mature_individuals WHEN s.iucn_population_size > 0 THEN s.iucn_population_size END";

  // 절멸(EX/EW)은 항상 위급·위기·취약 뒤로 (사용자 지시 2026-07-14).
  //   절멸종은 deadline_days 가 과거(음수)라 urgency 정렬에서 오히려 최상단에 오므로,
  //   모든 정렬의 1차 키로 "비절멸 먼저" 를 강제한다.
  const EXTINCT_LAST = "CASE WHEN s.category IN ('EX','EW') THEN 1 ELSE 0 END ASC";
  const sortClauses: Record<SortKey, string> = {
    // 정렬 규칙 (사용자 지시 v3, 2026-05-06):
    //   0차: 비절멸 먼저 (절멸종은 맨 뒤)
    //   1차: D-day 오름차순 (작은 숫자 = 1위, "지금 즉시" 가 최상단)
    //   2차: D-day 동률 → T-레벨 높은 순 (T4 > T3 > T2 > T1 > T0)
    //   3차: 학명 알파벳 순 (안정적 tiebreaker)
    urgency: `
      ${EXTINCT_LAST},
      COALESCE(t.deadline_days, 999999) ASC,
      CASE t.intervention_tier
        WHEN 'T4' THEN 5 WHEN 'T3' THEN 4 WHEN 'T2' THEN 3
        WHEN 'T1' THEN 2 WHEN 'T0' THEN 1 ELSE 0
      END DESC,
      s.scientific_name COLLATE NOCASE`,
    // 점수·개체수: 값 없는 종은 값 있는 종 뒤 (SORT_RULE)
    score: `${EXTINCT_LAST},
            CASE WHEN t.consensus_score IS NULL THEN 1 ELSE 0 END,
            t.consensus_score DESC, ${NAME}`,
    population: `${EXTINCT_LAST},
                 CASE WHEN ${POP} IS NULL THEN 1 ELSE 0 END,
                 ${POP} ASC, ${NAME}`,
    risk: `${EXTINCT_LAST},
           CASE s.category WHEN 'CR' THEN 0 WHEN 'EN' THEN 1 WHEN 'VU' THEN 2
                           WHEN 'NT' THEN 3 WHEN 'LC' THEN 4 WHEN 'DD' THEN 5 ELSE 6 END,
           ${NAME}`,
    name: `${EXTINCT_LAST}, ${NAME}, s.scientific_name COLLATE NOCASE`,
    recent: `${EXTINCT_LAST}, datetime(s.updated_at) DESC, s.common_name_ko COLLATE NOCASE`,
    class: `${EXTINCT_LAST}, s.class_name COLLATE NOCASE, s.common_name_ko COLLATE NOCASE`,
  };
  const orderBy = sortClauses[filters?.sort ?? "urgency"];
  const pageSize = filters?.pageSize ?? PAGE_SIZE;
  const page = Math.max(1, filters?.page ?? 1);
  const offset = (page - 1) * pageSize;

  // Total count (without LIMIT)
  const total = (db.prepare(`SELECT COUNT(*) as n ${FROM} WHERE ${where}`).get(...params) as { n: number }).n;

  const sql = `
    SELECT s.*,
           t.consensus_score, t.intervention_tier, t.deadline_days, t.extinction_days
    ${FROM}
    WHERE ${where}
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

// v5: 점수 산출 상태 3갈래 (실측 계산 / 절멸 확정 / 데이터 부족) — 기본은 큐레이션 종, false 면 전체
export function getScoreCoverage(curatedOnly = true) {
  const db = getDb();
  const scope = curatedOnly && hasCuratedColumn() ? "WHERE s.is_curated = 1" : "";
  const row = db
    .prepare(
      `SELECT
         SUM(CASE WHEN s.category NOT IN ('EX','EW') AND tp.species_id IS NOT NULL THEN 1 ELSE 0 END) AS computed,
         SUM(CASE WHEN s.category IN ('EX','EW') THEN 1 ELSE 0 END) AS extinct,
         SUM(CASE WHEN s.category NOT IN ('EX','EW') AND tp.species_id IS NULL THEN 1 ELSE 0 END) AS insufficient,
         COUNT(*) AS total
       FROM species s LEFT JOIN tipping_points tp ON tp.species_id = s.id
       ${scope}`
    )
    .get() as { computed: number; extinct: number; insufficient: number; total: number };
  return row;
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

export function listClasses(curatedOnly = false): string[] {
  const db = getDb();
  const scope = scopeClause(curatedOnly);
  const rows = db
    .prepare(`SELECT DISTINCT s.class_name FROM species s WHERE s.class_name IS NOT NULL AND ${scope.clause} ORDER BY s.class_name`)
    .all(...scope.params) as { class_name: string }[];
  return rows.map((r) => r.class_name);
}

// 현재 스코프(큐레이션/전체)의 총 종 수 — "전체" 타일용
export function countScope(curatedOnly = false): number {
  const db = getDb();
  const scope = scopeClause(curatedOnly);
  return (db.prepare(`SELECT COUNT(*) as n FROM species s WHERE ${scope.clause}`).get(...scope.params) as { n: number }).n;
}

export function countByCategory(curatedOnly = false): Record<string, number> {
  const db = getDb();
  const scope = scopeClause(curatedOnly);
  const rows = db
    .prepare(`SELECT s.category, COUNT(*) as n FROM species s WHERE ${scope.clause} GROUP BY s.category`)
    .all(...scope.params) as { category: string; n: number }[];
  const out: Record<string, number> = {};
  for (const r of rows) out[r.category] = r.n;
  return out;
}

export function countByClass(curatedOnly = false): Record<string, number> {
  const db = getDb();
  const scope = scopeClause(curatedOnly);
  const rows = db
    .prepare(`SELECT s.class_name, COUNT(*) as n FROM species s WHERE s.class_name IS NOT NULL AND ${scope.clause} GROUP BY s.class_name`)
    .all(...scope.params) as { class_name: string; n: number }[];
  const out: Record<string, number> = {};
  for (const r of rows) out[r.class_name] = r.n;
  return out;
}

// 분류군 미상 (class_name IS NULL) 카운트 — 현재 스코프 기준
export function countUnclassified(curatedOnly = false): number {
  const db = getDb();
  const scope = scopeClause(curatedOnly);
  const r = db.prepare(`SELECT COUNT(*) as n FROM species s WHERE s.class_name IS NULL AND ${scope.clause}`).get(...scope.params) as { n: number };
  return r?.n ?? 0;
}

// 데이터 품질 검증용 통계
export function getQualityStats() {
  const db = getDb();
  const total = (db.prepare("SELECT COUNT(*) as n FROM species").get() as { n: number }).n;
  const noKoName = (db.prepare("SELECT COUNT(*) as n FROM species WHERE common_name_ko IS NULL OR common_name_ko = ''").get() as { n: number }).n;
  const noClass = (db.prepare("SELECT COUNT(*) as n FROM species WHERE class_name IS NULL").get() as { n: number }).n;
  const noPhoto = (db.prepare("SELECT COUNT(*) as n FROM species WHERE photo_url IS NULL").get() as { n: number }).n;
  const noSummary = (db.prepare("SELECT COUNT(*) as n FROM species WHERE summary_ko IS NULL OR summary_ko = ''").get() as { n: number }).n;
  const noTipping = (db.prepare("SELECT COUNT(*) as n FROM species s LEFT JOIN tipping_points t ON t.species_id = s.id WHERE t.species_id IS NULL").get() as { n: number }).n;
  const koMatchesSci = (db.prepare("SELECT COUNT(*) as n FROM species WHERE common_name_ko = scientific_name").get() as { n: number }).n;
  const koMatchesEn = (db.prepare("SELECT COUNT(*) as n FROM species WHERE common_name_ko IS NOT NULL AND LOWER(common_name_ko) = LOWER(common_name_en)").get() as { n: number }).n;
  const summaryEnglish = (db.prepare(`
    SELECT COUNT(*) as n FROM species
    WHERE summary_ko IS NOT NULL
      AND CAST(LENGTH(summary_ko) AS REAL) - CAST(LENGTH(REPLACE(summary_ko, ' ', '')) AS REAL) > 5
      AND summary_ko GLOB '*[A-Za-z]*[A-Za-z]*[A-Za-z]*'
      AND NOT (summary_ko GLOB '*[가-힣]*')
  `).get() as { n: number }).n;
  const total2025 = (db.prepare("SELECT COUNT(*) as n FROM species WHERE category IN ('CR','EN','VU')").get() as { n: number }).n;
  return {
    total,
    threatenedTotal: total2025,
    noKoName,
    noClass,
    noPhoto,
    noSummary,
    noTipping,
    koMatchesSci,
    koMatchesEn,
    summaryEnglish,
  };
}

// 의심 항목 샘플 — 검증용
export function listQualityIssues(kind: "no_ko" | "ko_eq_sci" | "ko_eq_en" | "no_class" | "no_photo", limit = 50) {
  const db = getDb();
  const sql: Record<typeof kind, string> = {
    no_ko: "SELECT id, scientific_name, common_name_en, category FROM species WHERE common_name_ko IS NULL OR common_name_ko = '' ORDER BY id LIMIT ?",
    ko_eq_sci: "SELECT id, scientific_name, common_name_en, common_name_ko, category FROM species WHERE common_name_ko = scientific_name LIMIT ?",
    ko_eq_en: "SELECT id, scientific_name, common_name_en, common_name_ko, category FROM species WHERE common_name_ko IS NOT NULL AND LOWER(common_name_ko) = LOWER(common_name_en) LIMIT ?",
    no_class: "SELECT id, scientific_name, common_name_en, common_name_ko, category FROM species WHERE class_name IS NULL ORDER BY category, id LIMIT ?",
    no_photo: "SELECT id, scientific_name, common_name_en, common_name_ko, category FROM species WHERE photo_url IS NULL AND category IN ('CR','EN') ORDER BY category, id LIMIT ?",
  };
  return db.prepare(sql[kind]).all(limit);
}
