// IUCN 기록 범위 판정 (2026-10-03, 결정 대기 항목 12)
import { describe, it, expect } from "vitest";
import { iucnRecordNote, iucnValueQualifier } from "../lib/iucn-record";
import { buildChatContext } from "../lib/chat-context";

describe("iucnRecordNote", () => {
  it("지역 평가 · NA/RE 등급 · 종 단위 평가 · 동의어를 구분한다", () => {
    const base = { scientific_name: "Balaena mysticetus", iucn_category: "VU", iucn_assessment_scope: "Europe", iucn_assessed_taxon: "Balaena mysticetus" };
    expect(iucnRecordNote(base)).toMatchObject({ regional: true, parentTaxon: null, synonym: null });
    expect(iucnValueQualifier(iucnRecordNote(base))).toBe("Europe 지역 평가");
    expect(iucnRecordNote({ ...base, iucn_assessment_scope: null, iucn_category: "NA" }).regional).toBe(true);
    expect(iucnRecordNote({ ...base, iucn_assessment_scope: "Global" }).regional).toBe(false);
    const sub = iucnRecordNote({ scientific_name: "Panthera tigris amoyensis", iucn_category: "EN", iucn_assessment_scope: "Global", iucn_assessed_taxon: "Panthera tigris" });
    expect(sub.parentTaxon).toBe("Panthera tigris");
    expect(iucnValueQualifier(sub)).toBe("Panthera tigris 종 단위 평가");
    const syn = iucnRecordNote({ scientific_name: "Plectrohyla pachyderma", iucn_category: "CR", iucn_assessment_scope: "Global", iucn_assessed_taxon: "Sarcohyla pachyderma" });
    expect(syn).toMatchObject({ regional: false, parentTaxon: null, synonym: "Sarcohyla pachyderma" });
    expect(iucnValueQualifier(syn)).toBe("");
  });
});

describe("챗봇 컨텍스트 표시", () => {
  it("북극고래 — 유럽 지역 평가의 개체수를 N0 로 쓴다고 밝히고, 등급 줄에 평가 연도를 붙이지 않는다", () => {
    const c = buildChatContext("phy-balaena-mysticetus")!.context;
    expect(c).toContain("IUCN 기록 범위: 이 종에 연결된 IUCN 평가는 Europe 지역 평가");
    expect(c).toContain("LastWatch v5 계산도 이 지역 개체수를 기준 개체수 N0 로 씀");
    expect(c).toContain("성숙 개체수: 258마리  [출처: species.iucn_population_size, IUCN 2023년 평가, Europe 지역 평가]");
    expect(c).toContain("IUCN 등급: LC  [출처: species.category]");
  });
  it("남중국호랑이 — 종 전체(Panthera tigris) 개체수를 N0 로 쓴다고 밝힌다", () => {
    const c = buildChatContext("wd-q200848")!.context;
    expect(c).toContain("IUCN 평가 대상: Panthera tigris (종 전체)");
    expect(c).toContain("이 아종의 개체수가 아님");
  });
  it("동의어는 경고 없이 학명만 알린다 (두꺼운피개구리)", () => {
    const c = buildChatContext("wd-q259603")!.context;
    expect(c).toContain("IUCN 학명: Sarcohyla pachyderma");
    expect(c).not.toContain("IUCN 평가 대상:");
    expect(c).not.toContain("IUCN 기록 범위:");
  });
});
