// CSV 내보내기 (결정 13, 2026-10-03)
import { describe, it, expect } from "vitest";
import { buildExportRows, csvCell, toCsv, acceptsGzip, EXPORT_COLUMNS } from "../lib/species-export";

/** RFC 4180 파서 — 따옴표 안의 쉼표·줄바꿈·"" 를 처리한다 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\r" && text[i + 1] === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; i++; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

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

  it("scored 범위 = 점수 행이 있는 941종, 모든 행의 열 수가 머리줄과 같다 (따옴표·쉼표·줄바꿈 포함)", () => {
    expect(scored.length).toBe(941);
    const tricky = { ...scored[0], common_name_ko: '쉼표, "따옴표"\n줄바꿈', scientific_name: "=수식" };
    const parsed = parseCsv(toCsv([...scored, tricky]));
    expect(parsed[0]).toEqual([...EXPORT_COLUMNS]);
    expect(parsed.slice(1).every((r) => r.length === EXPORT_COLUMNS.length)).toBe(true);
    expect(parsed.length - 1).toBe(942);
    const last = parsed[parsed.length - 1];
    expect(last[EXPORT_COLUMNS.indexOf("common_name_ko")]).toBe('쉼표, "따옴표"\n줄바꿈');
    expect(last[EXPORT_COLUMNS.indexOf("scientific_name")]).toBe("'=수식");
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
  it("절멸 종은 개체수가 있어도 N0 를 쓰지 않았으므로 n0_used 를 비운다 (한국늑대)", () => {
    const r = byId.get("canis-lupus-coreanus")!;
    expect(r.score_status).toBe("fixed_100_extinct");
    expect(r.n0_used).toBeNull();
    expect(r.n0_source).toBeNull();
  });
  it("Accept-Encoding — q 값·와일드카드", () => {
    expect(acceptsGzip("gzip, deflate, br")).toBe(true);
    expect(acceptsGzip("gzip;q=0, br")).toBe(false);
    expect(acceptsGzip("*")).toBe(true);
    expect(acceptsGzip("*, gzip;q=0")).toBe(false);
    expect(acceptsGzip("GZIP")).toBe(true);
    expect(acceptsGzip("identity")).toBe(false);
    expect(acceptsGzip(null)).toBe(false);
  });
  it("curated 범위의 점수 없는 종은 not_computed", () => {
    const r = buildExportRows("curated").find((x) => x.id === "rhincodon-typus")!;
    expect(r.score_status).toBe("not_computed");
    expect(r.lastwatch_score).toBeNull();
  });
});
