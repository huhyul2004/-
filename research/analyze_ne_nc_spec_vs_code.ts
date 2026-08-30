// Ne/Nc 를 코드 값에서 명세서 값으로 바꿨을 때 v5 점수가 어떻게 달라지는지 계산한다.
// 적용하지 않는다 — lib/tipping-point.ts 와 DB 는 읽기만 한다.
//
//   코드   : research/_v5_replica.ts            (lib/tipping-point.ts 의 검증된 사본)
//   명세서 : research/_v5_replica_spec_nenc.ts  (ne_nc 만 치환한 사본)
//
// 실행: tsx research/analyze_ne_nc_spec_vs_code.ts
import fs from "node:fs";
import Database from "better-sqlite3";
import { evaluateTippingPoint as evalCode } from "./_v5_replica";
import { evaluateTippingPoint as evalSpec } from "./_v5_replica_spec_nenc";
import type { SpeciesRow } from "../lib/db";

const db = new Database("data/species.db", { readonly: true });
const rows = db.prepare("SELECT * FROM species").all() as SpeciesRow[];

type Rec = { score: number; tier: string; ne: number };
const code = new Map<string, Rec>();
const spec = new Map<string, Rec>();

for (const r of rows) {
  const a = evalCode(r, { seed: 42 });
  if (a) code.set(r.id, { score: a.consensus_score, tier: a.intervention_tier, ne: a.layer_scores.iucn.Ne });
  const b = evalSpec(r, { seed: 42 });
  if (b) spec.set(r.id, { score: b.consensus_score, tier: b.intervention_tier, ne: b.layer_scores.iucn.Ne });
}

const byId = new Map(rows.map((r) => [r.id, r]));
type Row = {
  id: string; ko: string; cls: string; cat: string; N: number | null;
  sc: number; ss: number; d: number; tc: string; ts: string; nec: number; nes: number;
};
const changed: Row[] = [];
let scoreMoved = 0, tierMoved = 0, neOnly = 0;

for (const [id, c] of Array.from(code.entries())) {
  const s = spec.get(id);
  if (!s) continue;
  if (c.score === s.score && c.tier === s.tier && c.ne === s.ne) continue;
  const r = byId.get(id)!;
  changed.push({
    id, ko: r.common_name_ko ?? r.scientific_name,
    cls: (r.class_name ?? "").trim() || "(빈값)", cat: r.category ?? "",
    N: r.mature_individuals ?? r.iucn_population_size ?? null,
    sc: c.score, ss: s.score, d: s.score - c.score,
    tc: c.tier, ts: s.tier, nec: c.ne, nes: s.ne,
  });
  if (c.score !== s.score) scoreMoved++; else neOnly++;
  if (c.tier !== s.tier) tierMoved++;
}

console.log(`점수 산출 종            ${code.size}`);
console.log(`>>> 점수·티어·Ne 가 바뀐 종  ${changed.length} <<<`);
console.log(`  점수가 바뀐 종        ${scoreMoved}`);
console.log(`  티어가 바뀐 종        ${tierMoved}`);
console.log(`  Ne 만 바뀐 종         ${neOnly}`);
console.log(`  점수 상승 ${changed.filter((c) => c.d > 0).length} / 하락 ${changed.filter((c) => c.d < 0).length}`);

const tierPairs = new Map<string, number>();
for (const c of changed) {
  if (c.tc === c.ts) continue;
  const k = `${c.tc}→${c.ts}`;
  tierPairs.set(k, (tierPairs.get(k) ?? 0) + 1);
}
console.log("\n=== 티어 이동 방향 분포 ===");
for (const [k, n] of Array.from(tierPairs.entries()).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k}  ${n}종`);
}

const clsCount = new Map<string, number>();
for (const c of changed) clsCount.set(c.cls, (clsCount.get(c.cls) ?? 0) + 1);
console.log("\n=== 분류군별 변동 종 수 ===");
for (const [k, n] of Array.from(clsCount.entries()).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(18)} ${n}`);
}

changed.sort((x, y) => Math.abs(y.d) - Math.abs(x.d));
console.log("\n=== 변동 폭 상위 20종 ===");
for (const c of changed.slice(0, 20)) {
  console.log(
    `${c.ko.slice(0, 18).padEnd(18)} ${c.cat.padEnd(3)} ${c.cls.padEnd(14)} ` +
    `${String(c.N ?? "-").padStart(8)}  ${c.sc.toFixed(1).padStart(5)}→${c.ss.toFixed(1).padStart(5)} ` +
    `(${c.d >= 0 ? "+" : ""}${c.d.toFixed(1)})  ${c.tc}→${c.ts}  Ne ${c.nec}→${c.nes}`
  );
}

console.log("\n=== 자바코뿔소 — 명세서 실시예 대조 ===");
const rhino = rows.find((r) => r.id === "rhinoceros-sondaicus")!;
const N = rhino.mature_individuals ?? rhino.iucn_population_size ?? 0;
const c = code.get(rhino.id)!, s = spec.get(rhino.id)!;
console.log(`N=${N}  class_name=${rhino.class_name}`);
console.log(`  코드   ne_nc 0.15 → Ne ${c.ne}   점수 ${c.score.toFixed(1)}  ${c.tier}`);
console.log(`  명세서 ne_nc 0.20 → Ne ${s.ne}   점수 ${s.score.toFixed(1)}  ${s.tier}`);
console.log(`  명세서 실시예 기재값: Ne ≈ 15  (76 × 0.2 = 15.2)`);
console.log(`  일치 여부: ${s.ne === 15 ? "일치" : "불일치 (계산 " + s.ne + ")"}`);

fs.writeFileSync("/tmp/ne_nc_spec_vs_code.json", JSON.stringify(changed, null, 1));
