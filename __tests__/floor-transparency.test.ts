// lib/floor-transparency.ts 는 엔진 집계식을 옮겨 쓴다. 엔진과 어긋나면 챗봇이
// 틀린 "하한 적용 전 점수" 를 말하게 되므로, DB 에 저장된 전 종으로 재구성 값을 대조한다.
import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import path from "path";
import { floorBreakdown } from "../lib/floor-transparency";

const db = new Database(path.join(process.cwd(), "data/species.db"), { readonly: true });
const rows = db
  .prepare(
    `SELECT s.id, s.category, s.population_trend, s.mature_individuals, s.iucn_population_size,
            t.consensus_score, t.payload_json
     FROM tipping_points t JOIN species s ON s.id = t.species_id
     WHERE s.category NOT IN ('EX','EW')`
  )
  .all() as {
  id: string;
  category: "CR" | "EN" | "VU" | "NT" | "LC";
  population_trend: string | null;
  mature_individuals: number | null;
  iucn_population_size: number | null;
  consensus_score: number;
  payload_json: string;
}[];

describe("floor-transparency: 재구성 점수가 엔진 저장값과 같다", () => {
  it("계산된 점수가 있는 전 종에서 final === tipping_points.consensus_score", () => {
    expect(rows.length).toBeGreaterThan(0);
    const bad: string[] = [];
    for (const r of rows) {
      const fb = floorBreakdown(r, JSON.parse(r.payload_json));
      if (!fb || fb.final !== r.consensus_score) bad.push(`${r.id}: db=${r.consensus_score} recon=${fb?.final}`);
    }
    expect(bad, bad.slice(0, 5).join("\n")).toEqual([]);
  });

  it("자바코뿔소는 하한 78 에 묶여 있고 하한 전 점수는 그보다 낮다", () => {
    const r = rows.find((x) => x.id === "rhinoceros-sondaicus")!;
    const fb = floorBreakdown(r, JSON.parse(r.payload_json))!;
    expect(fb.floor).toBe(78);
    expect(fb.bound).toBe(true);
    expect(fb.withoutFloor).toBeLessThan(fb.final);
  });
});
