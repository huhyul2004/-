// 종 데이터 CSV 내보내기 — 결정 13 (2026-10-03). app/species/export/route.ts 가 쓴다.
//
// 범위(scope)
//   curated (기본) : 사이트 종 목록과 같은 큐레이션 종 (is_curated = 1, 약 4,230종)
//   scored         : LastWatch 점수 행이 있는 종 (계산 310 + 절멸·야생절멸 100 고정 631)
//   all            : DB 의 모든 종 (41,282종 — 응답이 커서 운영에서는 느릴 수 있다)
//
// 열 이름은 영문 snake_case (분석 도구에서 바로 쓰기 좋게). 값은 DB 그대로이고, 컬럼 이름이 내용과 반대인
// mature_individuals·iucn_population_size 는 내용대로 population_total·population_mature 로 내보낸다.
// 날짜는 KST 날짜, 점수 관련 값은 엔진이 남긴 payload 기록에서 읽는다 (다시 계산하지 않는다).
import { getDb, type SpeciesRow } from "./db";
import { inferPopulationWithSource, type AggregationTrace, type TippingPointResult } from "./tipping-point";
import { aggregationOf } from "./floor-transparency";
import { dbUserVersion, formatDbVersion, kstDate } from "./provenance";

export type ExportScope = "curated" | "scored" | "all";
export const EXPORT_SCOPES: ExportScope[] = ["curated", "scored", "all"];

/** 열 순서 = CSV 머리줄 순서 */
export const EXPORT_COLUMNS = [
  "id",
  "scientific_name",
  "common_name_ko",
  "common_name_en",
  "category_site",
  "category_iucn_api",
  "class_name",
  "iucn_class",
  "iucn_order",
  "iucn_family",
  "population_total",
  "population_mature",
  "n0_used",
  "n0_source",
  "population_trend_iucn",
  "population_trend_ko",
  "lastwatch_score",
  "lastwatch_tier",
  "score_status",
  "score_without_floor",
  "floor_applied",
  "layer_ews",
  "layer_pva",
  "layer_ne",
  "ne",
  "ne_nc",
  "alerts_m",
  "pva_valid_trajectories",
  "pva_invalid_trajectories",
  "engine_version",
  "iucn_sis_id",
  "iucn_assessment_id",
  "iucn_assessment_year",
  "iucn_url",
  "iucn_synced_kst",
  "iucn_details_synced_kst",
  "computed_kst",
  "db_version",
] as const;
export type ExportColumn = (typeof EXPORT_COLUMNS)[number];
export type ExportRow = Record<ExportColumn, string | number | boolean | null>;

interface JoinedRow extends SpeciesRow {
  iucn_order?: string | null;
  iucn_family?: string | null;
  tp_score: number | null;
  tp_tier: string | null;
  tp_payload: string | null;
  tp_computed_at: string | null;
}

type Payload = TippingPointResult & { engine_version?: string; aggregation?: AggregationTrace };

function scopeWhere(scope: ExportScope): string {
  if (scope === "scored") return "WHERE t.species_id IS NOT NULL";
  if (scope === "all") return "";
  return "WHERE s.is_curated = 1";
}

/** 범위 안의 종을 내보낼 행으로 만든다. 정렬: 점수 높은 순 → 학명 */
export function buildExportRows(scope: ExportScope = "curated"): ExportRow[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT s.*, t.consensus_score AS tp_score, t.intervention_tier AS tp_tier,
              t.payload_json AS tp_payload, t.computed_at AS tp_computed_at
       FROM species s LEFT JOIN tipping_points t ON t.species_id = s.id
       ${scopeWhere(scope)}
       ORDER BY t.consensus_score IS NULL, t.consensus_score DESC, s.scientific_name`
    )
    .all() as JoinedRow[];
  const dbVersion = formatDbVersion(dbUserVersion());

  return rows.map((s) => {
    const isExtinct = s.category === "EX" || s.category === "EW";
    const pop = inferPopulationWithSource(s);
    const payload = s.tp_payload ? (JSON.parse(s.tp_payload) as Payload) : null;
    const agg = payload && !isExtinct && pop.value != null ? aggregationOf(s, pop.value, payload) : null;
    const ls = payload?.layer_scores;
    const computed = s.tp_score != null && !isExtinct;
    return {
      id: s.id,
      scientific_name: s.scientific_name,
      common_name_ko: s.common_name_ko ?? null,
      common_name_en: s.common_name_en ?? null,
      category_site: s.category,
      category_iucn_api: s.iucn_category ?? null,
      class_name: s.class_name ?? null,
      iucn_class: s.iucn_class ?? null,
      iucn_order: s.iucn_order ?? null,
      iucn_family: s.iucn_family ?? null,
      population_total: s.mature_individuals ?? null,
      population_mature: s.iucn_population_size ?? null,
      n0_used: pop.value,
      n0_source: pop.value != null ? pop.source : null,
      population_trend_iucn: s.iucn_population_trend ?? null,
      population_trend_ko: s.population_trend ?? null,
      lastwatch_score: s.tp_score,
      lastwatch_tier: s.tp_tier,
      score_status: s.tp_score == null ? "not_computed" : isExtinct ? "fixed_100_extinct" : "computed",
      score_without_floor: computed && agg ? agg.scoreWithoutFloor : null,
      floor_applied: computed && agg ? agg.floor.applied : null,
      layer_ews: computed ? ls?.ews.score ?? null : null,
      layer_pva: computed ? ls?.pva.score ?? null : null,
      layer_ne: computed ? ls?.iucn.score ?? null : null,
      ne: computed ? ls?.iucn.Ne ?? null : null,
      ne_nc: computed ? ls?.iucn.ne_nc ?? null : null,
      alerts_m: computed && agg ? agg.m : null,
      pva_valid_trajectories: computed ? ls?.pva.n_valid ?? null : null,
      pva_invalid_trajectories: computed ? ls?.pva.n_invalid ?? null : null,
      engine_version: computed ? payload?.engine_version ?? null : null,
      iucn_sis_id: s.iucn_sis_id ?? null,
      iucn_assessment_id: s.iucn_assessment_id ?? null,
      iucn_assessment_year: s.iucn_assessment_year ?? null,
      iucn_url: s.iucn_url ?? null,
      iucn_synced_kst: kstDate(s.iucn_synced_at),
      iucn_details_synced_kst: kstDate(s.iucn_details_synced_at),
      computed_kst: kstDate(s.tp_computed_at),
      db_version: dbVersion,
    };
  });
}

/**
 * CSV 칸 하나. RFC 4180 — 쉼표·따옴표·줄바꿈이 있으면 따옴표로 감싸고 따옴표는 두 번 쓴다.
 * 스프레드시트 수식 주입 방지 — 문자열이 = + - @ 탭 CR 로 시작하면 앞에 ' 를 붙인다 (숫자는 그대로).
 */
export function csvCell(v: string | number | boolean | null | undefined): string {
  if (v == null) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  if (typeof v === "boolean") return v ? "true" : "false";
  let s = v;
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 머리줄 + 행. 줄 끝은 CRLF (RFC 4180), 맨 앞 UTF-8 BOM 은 라우트가 붙인다 */
export function toCsv(rows: ExportRow[]): string {
  const lines = [EXPORT_COLUMNS.join(",")];
  for (const r of rows) lines.push(EXPORT_COLUMNS.map((c) => csvCell(r[c])).join(","));
  return lines.join("\r\n") + "\r\n";
}
