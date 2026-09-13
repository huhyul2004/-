// ne_nc 주석 작업 전후로 v5 점수가 한 톨도 바뀌지 않았는지 확인한다.
// 읽기 전용 — DB 에 쓰지 않는다. 인자로 준 파일에 스냅샷을 남긴다.
import fs from "node:fs";
import Database from "better-sqlite3";
import { evaluateTippingPoint } from "../lib/tipping-point";
import type { SpeciesRow } from "../lib/db";

const out = process.argv[2];
if (!out) throw new Error("usage: tsx research/_score_invariance.ts <out.json>");

const db = new Database("data/species.db", { readonly: true });
const rows = db.prepare("SELECT * FROM species").all() as SpeciesRow[];

const snap: Record<string, { score: number; tier: string; ne: number }> = {};
for (const s of rows) {
  // 점수 재현성을 위해 시드를 고정한다 (PVA 가 몬테카를로라서).
  const r = evaluateTippingPoint(s, { seed: 42 });
  if (!r) continue;
  snap[s.id] = {
    score: r.consensus_score,
    tier: r.intervention_tier,
    ne: r.layer_scores.iucn.Ne,
  };
}
fs.writeFileSync(out, JSON.stringify(snap, null, 0));
console.log(`점수 산출 종수: ${Object.keys(snap).length}  → ${out}`);
