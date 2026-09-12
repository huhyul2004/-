// 개체수 floor 가 챗봇 비교 블록(lib/peer-comparison.ts)의 순위에 미치는 영향 — 교차 집계만.
// 읽기 전용. 코드·DB 수정 없음.
//
//   floor 켬 : research/_v5_replica.ts          (DB tipping_points 와 같은 값이어야 한다)
//   floor 끔 : research/_v5_replica_nofloor.ts
// 그룹 규칙은 lib/peer-comparison.ts 와 같다: (category, iucn_class), EX/EW 제외, 3종 미만 제외.
// 시드는 DB 를 채운 compute-tipping-points 와 같게 기본값(종 ID 해시)을 쓴다.
//
// 실행: tsx research/analyze_floor_peer_rank.ts
import Database from "better-sqlite3";
import { evaluateTippingPoint as evalOn } from "./_v5_replica";
import { evaluateTippingPoint as evalOff } from "./_v5_replica_nofloor";
import { MIN_GROUP_SIZE } from "../lib/peer-comparison";
import type { SpeciesRow } from "../lib/db";

type Row = SpeciesRow & { iucn_class: string | null; db_score: number };
const db = new Database("data/species.db", { readonly: true });
const rows = db
  .prepare(
    `SELECT s.*, t.consensus_score AS db_score
     FROM tipping_points t JOIN species s ON s.id = t.species_id
     WHERE s.category NOT IN ('EX','EW')`
  )
  .all() as Row[];

const groups = new Map<string, { id: string; on: number; off: number }[]>();
let mismatch = 0;
for (const r of rows) {
  const cls = (r.iucn_class ?? "").trim();
  if (!cls) continue;
  const on = evalOn(r)!.consensus_score;
  const off = evalOff(r)!.consensus_score;
  if (on !== r.db_score) mismatch++;
  const k = `${r.category} ${cls}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k)!.push({ id: r.id, on, off });
}

const rank = (v: number, all: number[]) => all.filter((x) => x > v).length + 1;

let inBlocks = 0, bound = 0, rankChanged = 0, groupsWithBound = 0;
const perGroup: string[] = [];
for (const [k, g] of Array.from(groups.entries())) {
  if (g.length < MIN_GROUP_SIZE) continue;
  inBlocks += g.length;
  const on = g.map((p) => p.on), off = g.map((p) => p.off);
  const b = g.filter((p) => p.off < p.on).length;
  const moved = g.filter((p) => rank(p.on, on) !== rank(p.off, off)).length;
  bound += b;
  rankChanged += moved;
  if (b > 0) { groupsWithBound++; perGroup.push(`  ${k.padEnd(20)} ${String(g.length).padStart(3)}종  floor에 묶임 ${String(b).padStart(2)}  순위 변동 ${String(moved).padStart(3)}`); }
}

console.log(`검산: replica(floor 켬) 와 DB 점수가 다른 종 ${mismatch}  (0 이어야 정상)`);
console.log(`비교 블록이 붙는 종                         ${inBlocks}`);
console.log(`  그중 floor 에 묶인 종                     ${bound}`);
console.log(`  floor 를 끄면 그룹 내 점수 순위가 바뀌는 종 ${rankChanged}`);
console.log(`floor 에 묶인 종이 있는 그룹                 ${groupsWithBound}`);
console.log(perGroup.join("\n"));
