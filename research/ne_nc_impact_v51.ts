// Ne/Nc 를 명세서 값으로 바꾸면 엔진 5.1.0 점수가 어떻게 달라지나 — 결정 2 기록용 (2026-10-03). DB 는 읽기만 한다.
//
// Ne/Nc 는 Ne 레이어에만 쓰인다 (EWS·PVA 는 쓰지 않는다). 그래서 몬테카를로를 다시 돌리지 않고,
// DB 에 저장된 EWS·PVA 점수는 그대로 두고 Ne 점수만 명세서 비율로 다시 구해 aggregateConsensus 로 집계한다.
// 시드도 DB 와 같다 (저장값을 그대로 쓰므로). 예전 분석(research/analyze_ne_nc_spec_vs_code.ts)은 5.0 사본·seed 42.
//
// 명세서 비율은 research/_v5_replica_spec_nenc.ts 의 LIFE_HISTORY 에서 읽는다 (ne_nc 만 치환한 자동 생성 사본).
// 실행: tsx research/ne_nc_impact_v51.ts
import fs from "node:fs";
import Database from "better-sqlite3";
import { aggregateConsensus, inferPopulationWithSource, V5_SPEC, TIERS, type AggregationTrace } from "../lib/tipping-point";
import type { SpeciesRow } from "../lib/db";

function specNeNc(): Map<string, number> {
  const src = fs.readFileSync("research/_v5_replica_spec_nenc.ts", "utf-8");
  const block = src.slice(src.indexOf("const LIFE_HISTORY"), src.indexOf("};", src.indexOf("const LIFE_HISTORY")));
  const out = new Map<string, number>();
  const re = /^\s*"?([^":\n]+?)"?\s*:\s*\{[^}]*ne_nc:\s*([\d.]+)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) out.set(m[1].trim(), Number(m[2]));
  return out;
}

const neScore = (Ne: number) => V5_SPEC.neBands.find((b) => Ne < b.below)?.score ?? V5_SPEC.neSafe.score;
const tierOf = (s: number) => {
  const x = Math.round(s * 100) / 100;
  return (x < 20 ? TIERS[0] : x < 40 ? TIERS[1] : x < 60 ? TIERS[2] : x < 80 ? TIERS[3] : TIERS[4]).tier;
};

const SPEC = specNeNc();
const db = new Database("data/species.db", { readonly: true });
const rows = db
  .prepare(
    `SELECT s.*, t.consensus_score AS tp_score, t.intervention_tier AS tp_tier, t.payload_json AS tp_payload
     FROM tipping_points t JOIN species s ON s.id = t.species_id WHERE s.category NOT IN ('EX','EW')`
  )
  .all() as (SpeciesRow & { tp_score: number; tp_tier: string; tp_payload: string })[];

let neChanged = 0, scoreUp = 0, scoreDown = 0, floorBoundNow = 0, floorBoundSpec = 0;
const tierMoves: Record<string, number> = {};
const neByClass: Record<string, number> = {};
const changed: { id: string; ko: string; cls: string | null; N0: number; neCode: number; neSpec: number; from: number; to: number; tierFrom: string; tierTo: string }[] = [];
for (const r of rows) {
  const p = JSON.parse(r.tp_payload) as { aggregation: AggregationTrace; layer_scores: { iucn: { Ne: number; ne_nc: number } } };
  const N0 = inferPopulationWithSource(r).value!;
  const agg = p.aggregation;
  if (agg.floor.applied) floorBoundNow++;
  const specRatio = r.class_name && SPEC.has(r.class_name) ? SPEC.get(r.class_name)! : p.layer_scores.iucn.ne_nc;
  const NeSpec = Math.round(N0 * specRatio);
  const NeCode = p.layer_scores.iucn.Ne;
  if (NeSpec !== NeCode) {
    neChanged++;
    neByClass[r.class_name ?? "(없음)"] = (neByClass[r.class_name ?? "(없음)"] ?? 0) + 1;
  }
  const alt = aggregateConsensus({
    layers: { ews: agg.layers.ews, pva: agg.layers.pva, iucn: neScore(NeSpec) },
    confidences: { ews: agg.confidence.ews, iucn: agg.confidence.iucn },
    N0,
    populationTrend: r.population_trend,
  });
  if (alt.floor.applied) floorBoundSpec++;
  if (alt.score !== r.tp_score) {
    if (alt.score > r.tp_score) scoreUp++;
    else scoreDown++;
    const tTo = tierOf(alt.score);
    if (tTo !== r.tp_tier) tierMoves[`${r.tp_tier}→${tTo}`] = (tierMoves[`${r.tp_tier}→${tTo}`] ?? 0) + 1;
    changed.push({ id: r.id, ko: r.common_name_ko ?? r.scientific_name, cls: r.class_name, N0, neCode: NeCode, neSpec: NeSpec, from: r.tp_score, to: alt.score, tierFrom: r.tp_tier, tierTo: tTo });
  }
}
const summary = {
  computed: rows.length,
  specClasses: SPEC.size,
  neChanged,
  neByClass,
  scoreChanged: scoreUp + scoreDown,
  scoreUp,
  scoreDown,
  tierChanged: Object.values(tierMoves).reduce((a, b) => a + b, 0),
  tierMoves,
  floorBoundNow,
  floorBoundSpec,
};
console.log(JSON.stringify(summary, null, 1));
changed.sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from));
console.log(changed.slice(0, 12).map((c) => `${c.ko}(${c.cls}) N0 ${c.N0} Ne ${c.neCode}→${c.neSpec} 점수 ${c.from}→${c.to} ${c.tierFrom}→${c.tierTo}`).join("\n"));
const rhino = rows.find((r) => r.id === "rhinoceros-sondaicus");
if (rhino) console.log("자바코뿔소 Ne 명세서 비율:", Math.round(76 * (SPEC.get("포유류") ?? 0)));
