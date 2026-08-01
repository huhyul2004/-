// v4 Phase 1 드라이런 — 검증 3종에 대해 v3(기존 DB값) vs v4(새 계산) 비교.
// DB 미변경(readonly). sync 진행 중이어도 안전.
// usage: tsx scripts/v4-phase1-compare.ts
import path from "path";
import Database from "better-sqlite3";
import { evaluateTippingPoint, trendToLambdaV4 } from "../lib/tipping-point";
import type { SpeciesRow } from "../lib/db";

const DB = path.join(process.cwd(), "data", "species.db");
// CLI 인자로 종명 지정 가능(공백 포함 → 따옴표). 없으면 기본 검증 3종.
const argNames = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const NAMES = argNames.length > 0
  ? argNames
  : ["Phocoena sinus", "Rhinoceros sondaicus", "Panthera tigris altaica"];

const db = new Database(DB, { readonly: true });
db.pragma("busy_timeout = 8000");

const f = (n: number | null | undefined) => (n == null ? "—" : (Math.round(n * 10) / 10).toFixed(1));
const d = (a: number, b: number) => {
  const x = Math.round((b - a) * 10) / 10;
  return (x > 0 ? "+" : "") + x.toFixed(1);
};

for (const name of NAMES) {
  const row = db.prepare(
    "SELECT * FROM species WHERE scientific_name=? AND is_curated=1 LIMIT 1"
  ).get(name) as SpeciesRow & { id: string };
  const tp = db.prepare(
    "SELECT payload_json FROM tipping_points WHERE species_id=?"
  ).get(row.id) as { payload_json: string } | undefined;
  const v3 = tp ? JSON.parse(tp.payload_json) : null;

  // v4 계산 (evaluateTippingPoint 는 이제 trendToLambdaV4 사용)
  const v4 = evaluateTippingPoint(row, { n_sim: 1500, T: 100 });
  const td = trendToLambdaV4(row.iucn_population_trend ?? null, row.population_trend, row.category);
  if (!v4) { console.log(`\n▶ ${name}: v5 데이터 부족(null) — 실측 개체수 없음`); continue; }

  console.log("\n" + "=".repeat(66));
  console.log(`▶ ${name}  (${row.category}, ${row.class_name})`);
  console.log(`  trend: 한글="${row.population_trend}"  IUCN="${row.iucn_population_trend ?? "(null)"}"`);
  console.log(`  → v4 사용 source: [${td.source}]  r=${td.r}  λ=${(Math.round(td.lambda_mean*1000)/1000)}`);
  console.log("  " + "-".repeat(62));

  if (!v3) {
    console.log("  ⚠ v3 tipping_points 없음 — v4만 표시");
  } else {
    console.log(`  consensus_score : v3 ${f(v3.consensus_score)}  →  v4 ${f(v4.consensus_score)}   (Δ ${d(v3.consensus_score, v4.consensus_score)})`);
    console.log(`  intervention_tier: v3 ${v3.intervention_tier}  →  v4 ${v4.intervention_tier}   ${v3.intervention_tier !== v4.intervention_tier ? "★ 변경" : "(동일)"}`);
    console.log("  layer scores:");
    console.log(`     EWS : v3 ${f(v3.layer_scores?.ews?.score)}  →  v4 ${f(v4.layer_scores.ews.score)}   (Δ ${d(v3.layer_scores?.ews?.score ?? 0, v4.layer_scores.ews.score)})`);
    console.log(`     PVA : v3 ${f(v3.layer_scores?.pva?.score)}  →  v4 ${f(v4.layer_scores.pva.score)}   (Δ ${d(v3.layer_scores?.pva?.score ?? 0, v4.layer_scores.pva.score)})`);
    console.log(`     IUCN: v3 ${f(v3.layer_scores?.iucn?.score)}  →  v4 ${f(v4.layer_scores.iucn.score)}   (Δ ${d(v3.layer_scores?.iucn?.score ?? 0, v4.layer_scores.iucn.score)})`);
  }
}

db.close();
console.log("\n(드라이런 — DB 미변경)");
