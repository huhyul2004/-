// 자바코뿔소의 레이어 점수·K·중간값을 코드 경로 그대로 뽑는다. 읽기 전용.
// 실행: tsx research/trace_layers_rhino.ts
import Database from "better-sqlite3";
import { evaluateTippingPoint, inferPopulationWithSource, trendToLambdaV4 } from "../lib/tipping-point";
import type { SpeciesRow } from "../lib/db";

const db = new Database("data/species.db", { readonly: true });
const ids = ["rhinoceros-sondaicus", "phocoena-sinus"];

for (const id of ids) {
  const s = db.prepare("SELECT * FROM species WHERE id = ?").get(id) as SpeciesRow;
  const pop = inferPopulationWithSource(s);
  const N0 = pop.value!;
  const { lambda_mean, lambda_sd, r } = trendToLambdaV4(
    s.iucn_population_trend ?? null, s.population_trend, s.category
  );
  // lib/tipping-point.ts 의 K 식을 그대로 옮긴 것 (읽기 전용 재현)
  const K = r < 0 ? Math.max(N0 * 1.5, N0 + 100) : Math.max(N0 * 1.2, N0 + 50);
  const N_allee = Math.max(20, Math.round(N0 * 0.05));

  const res = evaluateTippingPoint(s, { seed: 42 })!;
  console.log(`===== ${s.common_name_ko} (${s.scientific_name}) =====`);
  console.log(`class_name=${s.class_name}  category=${s.category}`);
  console.log(`iucn_population_trend=${s.iucn_population_trend}  population_trend(한글)=${s.population_trend}`);
  console.log(`N0=${N0}  (source=${pop.source})`);
  console.log(`r=${r}  lambda_mean=${lambda_mean.toFixed(6)}  lambda_sd=${lambda_sd}`);
  console.log(`K=${K}   N_allee=${N_allee}   N_qext=2`);
  console.log(`EWS  = ${res.layer_scores.ews.score.toFixed(4)}  (conf ${res.layer_scores.ews.confidence})`);
  console.log(`PVA  = ${res.layer_scores.pva.score.toFixed(4)}  (P50=${res.layer_scores.pva.P_ext_50yr}, P100=${res.layer_scores.pva.P_ext_100yr})`);
  console.log(`IUCN = ${res.layer_scores.iucn.score}  (Ne=${res.layer_scores.iucn.Ne}, ${res.layer_scores.iucn.genetic_status})`);
  const raw = 0.3 * res.layer_scores.ews.score + 0.45 * res.layer_scores.pva.score + 0.25 * res.layer_scores.iucn.score;
  const highAlerts = [res.layer_scores.ews.score > 70, res.layer_scores.pva.score > 50, res.layer_scores.iucn.score > 60].filter(Boolean).length;
  console.log(`raw = 0.30·EWS + 0.45·PVA + 0.25·IUCN = ${raw.toFixed(4)}`);
  console.log(`highAlerts = ${highAlerts}  → consensus = ${res.consensus_score}  tier=${res.intervention_tier}`);
  console.log();
}
