// Phase 2 알로메트릭 함수 — 수식 정확성 유닛 테스트 (상수·지수 검증).
// 값의 생물학적 타당성(sanity)은 별도 self-check(scripts/phase2_selfcheck)에서 검사.
import { describe, it, expect } from "vitest";
import { fenchelRmax, mteGenTime, damuthDensity, damuthK, thermalClass } from "../lib/allometry";

describe("Allometry: taxon classification", () => {
  it("포유류/조류 = homeotherm, 그 외 = poikilotherm", () => {
    expect(thermalClass("포유류")).toBe("homeotherm");
    expect(thermalClass("조류")).toBe("homeotherm");
    expect(thermalClass("파충류")).toBe("poikilotherm");
    expect(thermalClass("양서류")).toBe("poikilotherm");
    expect(thermalClass(null)).toBe("poikilotherm");
  });
});

describe("Allometry: Fenchel r_max = a·W^-0.25", () => {
  it("항온 a=0.025 (자바코뿔소 2e6g)", () => {
    // 0.025 * 2000000^-0.25
    expect(fenchelRmax(2_000_000, "포유류")).toBeCloseTo(0.025 * Math.pow(2_000_000, -0.25), 8);
  });
  it("변온 a=0.0071", () => {
    expect(fenchelRmax(1000, "어류 (경골어류)")).toBeCloseTo(0.0071 * Math.pow(1000, -0.25), 8);
  });
});

describe("Allometry: MTE T_gen = b·W^0.25", () => {
  it("항온 b=0.0037", () => {
    expect(mteGenTime(50_000, "포유류")).toBeCloseTo(0.0037 * Math.pow(50_000, 0.25), 8);
  });
  it("변온 b=0.017", () => {
    expect(mteGenTime(50_000, "양서류")).toBeCloseTo(0.017 * Math.pow(50_000, 0.25), 8);
  });
});

// Damuth 는 lib/damuth-k.ts 로 옮겼다 (2026-10-03). 아래는 남겨 둔 래퍼가 kg 단위로 위임하는지만 본다.
// 상세 검증은 __tests__/damuth-k.test.ts.
describe("Allometry: Damuth 래퍼 (lib/damuth-k.ts 위임)", () => {
  it("포유류 d=91.2 — 그램 입력을 kg 으로 바꿔 계산", () => {
    expect(damuthDensity(250_000, "포유류")).toBeCloseTo(91.2 * Math.pow(250, -0.75), 8);
  });
  it("상수가 없는 분류군은 포유류 값으로 대신하지 않는다 (NaN)", () => {
    expect(Number.isNaN(damuthDensity(1000, "곤충"))).toBe(true);
  });
  it("damuthK: habitat_area 없으면 null, 있으면 density × 면적", () => {
    expect(damuthK(250_000, "포유류", null)).toBeNull();
    expect(damuthK(250_000, "포유류", 5000)).toBeCloseTo(damuthDensity(250_000, "포유류") * 5000, 6);
  });
});
