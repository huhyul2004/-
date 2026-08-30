// K 값에 따른 레이어 변화만 본다 (floor 는 consensus 만 덮으므로 레이어는 그대로 보인다).
import Database from "better-sqlite3";
import { evaluateTippingPoint as evalDam, HABITAT_AREA_KM2 } from "./_v5_replica_damuthk";
import type { SpeciesRow } from "../lib/db";

const db = new Database("data/species.db", { readonly: true });
const r = db.prepare("SELECT * FROM species WHERE id='rhinoceros-sondaicus'").get() as SpeciesRow;

// 면적을 바꿔가며 K 를 스윕. 코드 damuthK 는 mass_g 를 그대로 쓰므로
// 원하는 K 를 만들려면 area = K / density 로 역산한다.
const density = 91.2 * Math.pow(2_000_000, -0.75); // 코드 단위 밀도 (km^-2)
for (const K of [0.82, 20, 60, 126, 146, 200, 400]) {
  HABITAT_AREA_KM2[r.id] = K / density;
  const res = evalDam(r, { seed: 42 })!;
  console.log(
    `K=${String(K).padStart(6)}  EWS ${res.layer_scores.ews.score.toFixed(1).padStart(5)}  ` +
    `PVA ${res.layer_scores.pva.score.toFixed(2).padStart(6)}  IUCN ${res.layer_scores.iucn.score}  ` +
    `P50=${res.layer_scores.pva.P_ext_50yr.toFixed(3)}  ` +
    `raw=${(0.3*res.layer_scores.ews.score + 0.45*res.layer_scores.pva.score + 0.25*res.layer_scores.iucn.score).toFixed(2)}  ` +
    `최종 ${res.consensus_score} (${res.intervention_tier})`
  );
}
delete HABITAT_AREA_KM2[r.id];
