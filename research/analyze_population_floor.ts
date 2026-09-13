// 개체수 floor 의 영향 범위를 조사한다. 조사 전용 — 코드·DB 를 수정하지 않는다.
//
//   floor 켜짐 : research/_v5_replica.ts          (lib/tipping-point.ts 의 검증된 사본)
//   floor 꺼짐 : research/_v5_replica_nofloor.ts  (floor 한 줄만 무력화한 사본)
//
// 실행: tsx research/analyze_population_floor.ts
import fs from "node:fs";
import Database from "better-sqlite3";
import { evaluateTippingPoint as evalOn } from "./_v5_replica";
import { evaluateTippingPoint as evalOff } from "./_v5_replica_nofloor";
import { inferPopulationWithSource } from "../lib/tipping-point";
import type { SpeciesRow } from "../lib/db";

type Row = SpeciesRow & { is_curated?: number };
const db = new Database("data/species.db", { readonly: true });
const rows = db.prepare("SELECT * FROM species").all() as Row[];

function floorFor(N: number) {
  if (N < 50) return 90;
  if (N < 100) return 78;
  if (N < 250) return 70;
  if (N < 500) return 60;
  return 0;
}

type Rec = {
  id: string; ko: string; cat: string; cls: string; cur: boolean;
  N: number; floor: number; on: number; off: number; tOn: string; tOff: string;
};
const all: Rec[] = [];

for (const r of rows) {
  const a = evalOn(r, { seed: 42 });
  if (!a) continue;
  const b = evalOff(r, { seed: 42 })!;
  const N = inferPopulationWithSource(r).value!;
  all.push({
    id: r.id, ko: r.common_name_ko ?? r.scientific_name,
    cat: r.category ?? "", cls: (r.class_name ?? "").trim() || "(빈값)",
    cur: !!r.is_curated, N, floor: floorFor(N),
    on: a.consensus_score, off: b.consensus_score,
    tOn: a.intervention_tier, tOff: b.intervention_tier,
  });
}

// floor 에 "묶였다" = floor 를 껐을 때 점수가 실제로 내려가는 종
const bound = all.filter((x) => x.off < x.on);

console.log(`점수 산출 종            ${all.length}`);
console.log(`floor 구간(N<500)에 든 종 ${all.filter((x) => x.floor > 0).length}`);
console.log(`>>> floor 에 묶인 종      ${bound.length} <<<`);
console.log(`  그중 큐레이티드        ${bound.filter((x) => x.cur).length}`);
console.log(`  그중 비큐레이티드      ${bound.filter((x) => !x.cur).length}`);
console.log(`티어가 갈리는 종         ${bound.filter((x) => x.tOn !== x.tOff).length}`);

console.log("\n=== floor 구간별 ===");
for (const f of [90, 78, 70, 60]) {
  const seg = all.filter((x) => x.floor === f);
  const bd = seg.filter((x) => x.off < x.on);
  const label = f === 90 ? "N<50" : f === 78 ? "50≤N<100" : f === 70 ? "100≤N<250" : "250≤N<500";
  console.log(`  floor ${f} (${label.padEnd(9)}): 구간 ${String(seg.length).padStart(4)}종  묶임 ${String(bd.length).padStart(4)}종`);
}

console.log("\n=== 묶인 종의 등급 분포 ===");
const byCat = new Map<string, number>();
for (const x of bound) byCat.set(x.cat, (byCat.get(x.cat) ?? 0) + 1);
for (const [k, n] of Array.from(byCat.entries()).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${(k || "(없음)").padEnd(4)} ${String(n).padStart(4)}`);
}

console.log("\n=== 묶인 종의 개체수 분포 ===");
const Ns = bound.map((x) => x.N).sort((a, b) => a - b);
const q = (p: number) => Ns[Math.min(Ns.length - 1, Math.floor(p * Ns.length))];
console.log(`  최소 ${Ns[0]}  p25 ${q(0.25)}  중앙 ${q(0.5)}  p75 ${q(0.75)}  최대 ${Ns[Ns.length - 1]}`);
for (const [lo, hi] of [[0, 50], [50, 100], [100, 250], [250, 500]]) {
  console.log(`  ${String(lo).padStart(3)} ≤ N < ${String(hi).padStart(3)}: ${bound.filter((x) => x.N >= lo && x.N < hi).length}종`);
}

console.log("\n=== 티어 이동 방향 (floor 끔) ===");
const tp = new Map<string, number>();
for (const x of bound) {
  if (x.tOn === x.tOff) continue;
  const k = `${x.tOn}→${x.tOff}`;
  tp.set(k, (tp.get(k) ?? 0) + 1);
}
for (const [k, n] of Array.from(tp.entries()).sort((a, b) => b[1] - a[1])) console.log(`  ${k}  ${n}종`);

bound.sort((a, b) => (b.on - b.off) - (a.on - a.off));
console.log("\n=== 낙폭 상위 20종 (floor 끄면 얼마가 되나) ===");
console.log("종                   등급 큐레 N       floor  점수(on→off)      티어");
for (const x of bound.slice(0, 20)) {
  console.log(
    `${x.ko.slice(0, 19).padEnd(19)} ${x.cat.padEnd(3)} ${(x.cur ? "O" : "-").padEnd(3)} ` +
    `${String(x.N).padStart(6)}  ${String(x.floor).padStart(4)}   ` +
    `${x.on.toFixed(1).padStart(5)}→${x.off.toFixed(1).padStart(5)} (−${(x.on - x.off).toFixed(1)})  ${x.tOn}→${x.tOff}`
  );
}

fs.writeFileSync("/tmp/population_floor.json", JSON.stringify({ bound, total: all.length }, null, 1));
