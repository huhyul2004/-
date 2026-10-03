// 저장값 검사 — 저장된 레이어 점수를 지금 코드의 집계식(aggregateConsensus)으로 다시 집계하면 DB 점수와 같아야 한다.
// 다르면 상수·식을 바꾸고 scripts/compute-tipping-points.ts 재계산을 빠뜨린 것이다.
// (저장된 추적 payload.aggregation 을 저장 점수와 비교하면 같은 값끼리 비교하게 되어 아무것도 잡지 못한다 —
//  2026-10-03 적대적 검토 engine-1.)
import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import path from "path";
import { floorBreakdown, reaggregate, recordedN0 } from "../lib/floor-transparency";
import { inferPopulationWithSource } from "../lib/tipping-point";
import type { SpeciesRow } from "../lib/db";

const db = new Database(path.join(process.cwd(), "data/species.db"), { readonly: true });
const rows = db
  .prepare(
    `SELECT s.*, t.consensus_score AS tp_score, t.payload_json AS tp_payload
     FROM tipping_points t JOIN species s ON s.id = t.species_id
     WHERE s.category NOT IN ('EX','EW')`
  )
  .all() as (SpeciesRow & { tp_score: number; tp_payload: string })[];

describe("저장값 검사 — 지금 코드로 다시 집계", () => {
  it("계산된 전 종에서 reaggregate(...).score === tipping_points.consensus_score", () => {
    expect(rows.length).toBeGreaterThan(0);
    const bad: string[] = [];
    for (const r of rows) {
      const p = JSON.parse(r.tp_payload);
      const re = reaggregate(r, recordedN0(r, p)!, p);
      if (!re || re.score !== r.tp_score) bad.push(`${r.id}: db=${r.tp_score} re=${re?.score}`);
    }
    expect(bad, bad.slice(0, 5).join("\n")).toEqual([]);
  });

  it("계산 당시 입력(payload.inputs.N0)과 지금 species 행의 N0 가 같다 (다르면 재계산 필요)", () => {
    const drift = rows.filter((r) => JSON.parse(r.tp_payload).inputs?.N0 !== inferPopulationWithSource(r).value);
    expect(drift.map((r) => r.id)).toEqual([]);
  });

  it("상수를 바꾼 것처럼 레이어 점수가 달라지면 잡는다 (검사가 같은 값끼리 비교하지 않음)", () => {
    const r = rows.find((x) => x.id === "panthera-tigris-altaica")!;
    const p = JSON.parse(r.tp_payload);
    p.layer_scores.pva.score = 5;
    const re = reaggregate(r, recordedN0(r, p)!, p)!;
    expect(re.score).not.toBe(r.tp_score);
  });

  it("자바코뿔소는 하한 78 에 묶여 있고 하한 전 점수는 그보다 낮다", () => {
    const r = rows.find((x) => x.id === "rhinoceros-sondaicus")!;
    const fb = floorBreakdown(r, JSON.parse(r.tp_payload))!;
    expect(fb.floor).toBe(78);
    expect(fb.bound).toBe(true);
    expect(fb.withoutFloor).toBeLessThan(fb.final);
  });
});
