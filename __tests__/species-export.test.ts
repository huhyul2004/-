// CSV 내보내기 (결정 13, 2026-10-03)
import { describe, it, expect } from "vitest";
import { buildExportRows, csvCell, toCsv, EXPORT_COLUMNS } from "../lib/species-export";

describe("csvCell", () => {
  it("쉼표·따옴표·줄바꿈은 따옴표로 감싸고 따옴표는 두 번", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("줄\n바꿈")).toBe('"줄\n바꿈"');
    expect(csvCell("plain")).toBe("plain");
  });
  it("수식 주입 방지 — = + - @ 로 시작하는 문자열 앞에 '", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("@x")).toBe("'@x");
    expect(csvCell("-x,y")).toBe(`"'-x,y"`);
  });
  it("숫자·불리언·null — 음수는 그대로", () => {
    expect(csvCell(-0.06)).toBe("-0.06");
    expect(csvCell(78)).toBe("78");
    expect(csvCell(true)).toBe("true");
    expect(csvCell(null)).toBe("");
    expect(csvCell(NaN)).toBe("");
  });
});

describe("buildExportRows", () => {
  const scored = buildExportRows("scored");
  const byId = new Map(scored.map((r) => [r.id, r]));

  it("scored 범위 = 점수 행이 있는 941종, 머리줄 열 수와 행 열 수가 같다", () => {
    expect(scored.length).toBe(941);
    const csv = toCsv(scored.slice(0, 3)).split("\r\n");
    expect(csv[0].split(",")).toEqual([...EXPORT_COLUMNS]);
  });
  it("자바코뿔소 — 전체/성숙 개체수를 내용대로, 하한 전후 점수·Ne·평가 ID·계산일", () => {
    const r = byId.get("rhinoceros-sondaicus")!;
    expect(r.population_total).toBe(76);
    expect(r.population_mature).toBe(18);
    expect(r.lastwatch_score).toBe(78);
    expect(r.score_status).toBe("computed");
    expect(r.floor_applied).toBe(true);
    expect(r.score_without_floor).toBe(47.1);
    expect(r.ne).toBe(11);
    expect(r.iucn_assessment_id).toBe(18493900);
    expect(r.computed_kst).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.db_version).toMatch(/^v\d{4}\.\d{2}\.\d{2}$/);
  });
  it("절멸 종 — 고정 100, 레이어 값은 비운다", () => {
    const r = byId.get("thylacinus-cynocephalus")!;
    expect(r.score_status).toBe("fixed_100_extinct");
    expect(r.lastwatch_score).toBe(100);
    expect(r.layer_pva).toBeNull();
    expect(r.floor_applied).toBeNull();
  });
  it("curated 범위의 점수 없는 종은 not_computed", () => {
    const r = buildExportRows("curated").find((x) => x.id === "rhincodon-typus")!;
    expect(r.score_status).toBe("not_computed");
    expect(r.lastwatch_score).toBeNull();
  });
});
