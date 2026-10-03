// Damuth K — 단위(kg)·적용 범위(검증된 상수만)·명세서 예시 검산.
import { describe, it, expect } from "vitest";
import { damuthK, damuthDensityPerKm2, DAMUTH_CONSTANTS } from "../lib/damuth-k";

describe("Damuth K: 단위", () => {
  it("명세서 자바코뿔소 예시 — 2,000 kg · 480 km² → K ≈ 146 (명세서 기재 ≈ 148)", () => {
    const r = damuthK({ massG: 2_000_000, className: "포유류", habitatAreaKm2: 480 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.K).toBeCloseTo(91.2 * Math.pow(2000, -0.75) * 480, 6);
    expect(r.K).toBeGreaterThan(140);
    expect(r.K).toBeLessThan(155);
    expect(r.massKg).toBe(2000);
  });

  it("Damuth 1981 원식(그램, 절편 10^4.23)과 10% 안에서 같은 규모 — 그램을 그대로 넣던 단위 오류 회귀 방지", () => {
    const r = damuthK({ massG: 2_000_000, className: "포유류", habitatAreaKm2: 480 });
    if (!r.ok) throw new Error("계산 실패");
    const original = Math.pow(10, 4.23) * Math.pow(2_000_000, -0.75) * 480;
    expect(Math.abs(r.K - original) / original).toBeLessThan(0.1);
    // 예전 오류 값(그램 그대로) 0.82 와는 두 자릿수 이상 차이가 나야 한다
    expect(r.K / (91.2 * Math.pow(2_000_000, -0.75) * 480)).toBeGreaterThan(100);
  });

  it("밀도 함수도 kg 입력", () => {
    expect(damuthDensityPerKm2(2000, "포유류")).toBeCloseTo(91.2 * Math.pow(2000, -0.75), 10);
    expect(damuthDensityPerKm2(2000, "곤충")).toBeNull();
  });
});

describe("Damuth K: 적용 범위", () => {
  it("서식 면적·체중이 없으면 이유와 함께 계산하지 않는다", () => {
    expect(damuthK({ massG: 2_000_000, className: "포유류", habitatAreaKm2: null })).toEqual({ ok: false, reason: "no_habitat_area" });
    expect(damuthK({ massG: 2_000_000, className: "포유류", habitatAreaKm2: 0 })).toEqual({ ok: false, reason: "no_habitat_area" });
    expect(damuthK({ massG: null, className: "포유류", habitatAreaKm2: 480 })).toEqual({ ok: false, reason: "no_mass" });
  });

  it("출처·단위를 검산하지 못한 상수(조류·파충류·양서류)는 쓰지 않는다", () => {
    for (const cls of ["조류", "파충류", "양서류"]) {
      expect(DAMUTH_CONSTANTS[cls].verified).toBe(false);
      expect(damuthK({ massG: 1000, className: cls, habitatAreaKm2: 100 })).toEqual({ ok: false, reason: "unverified_constant" });
    }
  });

  it("상수가 없는 분류군은 포유류 값으로 대신하지 않는다", () => {
    expect(damuthK({ massG: 1000, className: "곤충", habitatAreaKm2: 100 })).toEqual({ ok: false, reason: "no_constant" });
    expect(damuthK({ massG: 1000, className: null, habitatAreaKm2: 100 })).toEqual({ ok: false, reason: "no_constant" });
  });
});
