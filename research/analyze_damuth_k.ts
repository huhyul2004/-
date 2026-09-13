// Damuth K 를 넣었을 때의 v5 영향 조사. 조사 전용 — 코드·DB 를 수정하지 않는다.
//
//   현재    : research/_v5_replica.ts          (lib/tipping-point.ts 의 검증된 사본)
//   Damuth  : research/_v5_replica_damuthk.ts  (K 산출만 damuthK 로 바꾼 사본)
//
// 실행: tsx research/analyze_damuth_k.ts
import fs from "node:fs";
import Database from "better-sqlite3";
import { evaluateTippingPoint as evalNow } from "./_v5_replica";
import { evaluateTippingPoint as evalDam, HABITAT_AREA_KM2 } from "./_v5_replica_damuthk";
import { evaluateTippingPoint as evalNoFloor } from "./_v5_replica_nofloor";
import { damuthDensity, damuthK } from "../lib/allometry";
import { inferPopulationWithSource } from "../lib/tipping-point";
import type { SpeciesRow } from "../lib/db";

type Row = SpeciesRow & {
  is_curated?: number; mass_g?: number | null; mass_g_external?: number | null;
};
const db = new Database("data/species.db", { readonly: true });
const rows = db.prepare("SELECT * FROM species").all() as Row[];

const massOf = (r: Row) => r.mass_g || r.mass_g_external || null;
const curK = (N0: number, r: number) =>
  r < 0 ? Math.max(N0 * 1.5, N0 + 100) : Math.max(N0 * 1.2, N0 + 50);

// ===== A-3. 입력 가용성 =====
const scored = rows.filter((r) => evalNow(r, { seed: 42 }) !== null);
console.log("===== A-3. Damuth K 입력 가용성 (점수 산출 941종 기준) =====");
console.log(`점수 산출 종                    ${scored.length}`);
console.log(`  mass_g 있음                   ${scored.filter((r) => (r.mass_g ?? 0) > 0).length}`);
console.log(`  mass_g_external 있음          ${scored.filter((r) => (r.mass_g_external ?? 0) > 0).length}`);
console.log(`  둘 중 하나라도 있음(체중 확보)  ${scored.filter((r) => (massOf(r) ?? 0) > 0).length}`);
console.log(`  서식면적(habitat_area_km2)     0  ← species 테이블에 컬럼 자체가 없음`);
console.log(`  >>> 체중·면적 둘 다 있는 종      ${Object.keys(HABITAT_AREA_KM2).length ? "주입분만" : 0} <<<`);

const massByClass = new Map<string, number>();
for (const r of scored) if ((massOf(r) ?? 0) > 0) {
  const k = (r.class_name ?? "").trim() || "(빈값)";
  massByClass.set(k, (massByClass.get(k) ?? 0) + 1);
}
console.log("\n체중 있는 종의 분류군 분포 (Damuth 전용 상수 유무):");
const HAS_D = new Set(["포유류", "조류", "파충류", "양서류"]);
for (const [k, n] of Array.from(massByClass.entries()).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(16)} ${String(n).padStart(4)}   ${HAS_D.has(k) ? "전용 상수 있음" : "→ 포유류 91.2 fallback"}`);
}

// ===== B. 시뮬레이션 (주입 없음 = 지시대로 입력 없으면 현재 식) =====
console.log("\n===== B. Damuth K 시뮬레이션 (서식면적 주입 없음) =====");
let changed = 0, kChanged = 0;
for (const r of rows) {
  const a = evalNow(r, { seed: 42 });
  if (!a) continue;
  const b = evalDam(r, { seed: 42 })!;
  if (a.consensus_score !== b.consensus_score || a.intervention_tier !== b.intervention_tier) changed++;
  const N0 = inferPopulationWithSource(r).value!;
  const m = massOf(r);
  const dk = m && m > 0 ? damuthK(m, r.class_name, HABITAT_AREA_KM2[r.id] ?? null) : null;
  if (dk != null && dk > 0 && Math.abs(dk - curK(N0, 0)) > 1e-9) kChanged++;
}
console.log(`K 가 바뀐 종        ${kChanged}`);
console.log(`점수·티어가 바뀐 종  ${changed}`);

// ===== 단위 점검 =====
console.log("\n===== 단위 점검: d = 91.2 는 kg 기준인가 g 기준인가 =====");
const W_KG = 2000, W_G = 2_000_000, AREA = 480;
console.log(`명세서 기재      : 91.2 × ${W_KG}^-0.75 × ${AREA} = ${(91.2 * Math.pow(W_KG, -0.75) * AREA).toFixed(1)}  (명세서 K ≈ 148)`);
console.log(`코드 damuthK(g)  : 91.2 × ${W_G}^-0.75 × ${AREA} = ${(damuthDensity(W_G, "포유류") * AREA).toFixed(4)}`);
console.log(`Damuth 원식(g)   : 10^4.23 × ${W_G}^-0.75 × ${AREA} = ${(Math.pow(10, 4.23) * Math.pow(W_G, -0.75) * AREA).toFixed(1)}`);
console.log(`kg→g 환산계수 1000^0.75 = ${Math.pow(1000, 0.75).toFixed(1)}`);
console.log(`91.2 × 1000^0.75 = ${(91.2 * Math.pow(1000, 0.75)).toFixed(0)}   vs   10^4.23 = ${Math.pow(10, 4.23).toFixed(0)}`);

// ===== 자바코뿔소 실사례 (명세서가 유일하게 면적을 준 종) =====
console.log("\n===== 자바코뿔소 — 명세서가 서식면적 480 km² 를 준 유일한 종 =====");
const rhino = rows.find((r) => r.id === "rhinoceros-sondaicus")!;
const N0r = inferPopulationWithSource(rhino).value!;
const nowR = evalNow(rhino, { seed: 42 })!;
const noFloorR = evalNoFloor(rhino, { seed: 42 })!;
console.log(`N0=${N0r}  mass_g=${rhino.mass_g}  class=${rhino.class_name}`);
console.log(`현재 K = max(76×1.2, 76+50) = ${curK(N0r, 0)}`);
console.log(`코드 damuthK(mass_g=2e6, 480) = ${(damuthK(2_000_000, "포유류", 480) ?? 0).toFixed(4)}`);
console.log(`단위 보정 시 (kg 기준 2000)   = ${(91.2 * Math.pow(2000, -0.75) * 480).toFixed(1)}`);
console.log(`현재 점수 ${nowR.consensus_score} (${nowR.intervention_tier}) / floor 끄면 ${noFloorR.consensus_score} (${noFloorR.intervention_tier})`);

// 주입해서 재계산 — 코드 단위 그대로 vs 단위 보정
HABITAT_AREA_KM2[rhino.id] = 480;
const injG = evalDam(rhino, { seed: 42 })!;
// 단위 보정본은 면적을 1000^0.75 배 키워 등가 재현
HABITAT_AREA_KM2[rhino.id] = 480 * Math.pow(1000, 0.75);
const injKg = evalDam(rhino, { seed: 42 })!;
delete HABITAT_AREA_KM2[rhino.id];
console.log(`  주입 후(코드 단위, K≈0.82) : 점수 ${injG.consensus_score} (${injG.intervention_tier})`);
console.log(`  주입 후(단위 보정, K≈146)  : 점수 ${injKg.consensus_score} (${injKg.intervention_tier})`);

// ===== floor 교차 =====
console.log("\n===== floor 에 묶인 47종과의 교차 =====");
const bound = rows.filter((r) => {
  const a = evalNow(r, { seed: 42 });
  if (!a) return false;
  return evalNoFloor(r, { seed: 42 })!.consensus_score < a.consensus_score;
});
console.log(`floor 에 묶인 종            ${bound.length}`);
console.log(`  그중 체중이 있는 종        ${bound.filter((r) => (massOf(r) ?? 0) > 0).length}`);
console.log(`  → K 를 바꿔도 floor 가 덮으므로 점수 불변 (가중합이 floor 를 넘지 않는 한)`);

fs.writeFileSync("/tmp/damuth_k.json", JSON.stringify({
  scored: scored.length,
  withMass: scored.filter((r) => (massOf(r) ?? 0) > 0).length,
  withArea: 0, kChanged, changed, bound: bound.length,
}, null, 1));
