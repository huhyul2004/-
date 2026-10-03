/**
 * Phase 2 알로메트릭 관계식 — 체중(mass_g) 기반 생활사 파라미터 추정.
 * 상수 출처: docs/phase2-allometry-constants.md
 *
 * 순수 함수 모듈 (기존 lib/tipping-point.ts 로직에 영향 없음).
 * useAllometric=true 경로에서만 사용.
 */

import { damuthDensityPerKm2, damuthK as damuthKResult } from "./damuth-k";

export type ThermalClass = "homeotherm" | "poikilotherm";

// 항온동물 = 포유류·조류. 그 외(어류/파충류/양서류/무척추/식물)는 변온으로 처리.
export function thermalClass(className: string | null): ThermalClass {
  if (className === "포유류" || className === "조류") return "homeotherm";
  return "poikilotherm";
}

/**
 * Fenchel 1974 (Oecologia 14:317): r_max = a × W^(-0.25)  [day^-1]
 *   항온 a=0.025, 변온 a=0.0071
 */
export function fenchelRmax(mass_g: number, className: string | null): number {
  const a = thermalClass(className) === "homeotherm" ? 0.025 : 0.0071;
  return a * Math.pow(mass_g, -0.25);
}

/**
 * MTE (West/Brown/Enquist 1997; Brown et al. 2004): T_gen = b × W^(0.25)  [years]
 *   endotherm b=0.0037, ectotherm b=0.017
 * 주의: 지수 0.25 는 표준 근사. 실제 0.15~0.25 변동 (Capellini et al. 2011).
 */
export function mteGenTime(mass_g: number, className: string | null): number {
  const b = thermalClass(className) === "homeotherm" ? 0.0037 : 0.017;
  return b * Math.pow(mass_g, 0.25);
}

// ===== Damuth — lib/damuth-k.ts 로 옮김 (2026-10-03) =====
// 예전 이 파일의 Damuth 함수는 kg 기준 상수(포유류 91.2)에 그램을 넣어 K 가 1/177.8 로 작아졌고,
// 상수가 없는 분류군을 포유류 값으로 대신했다 (docs/damuth-k-simulation.md §5, decisions-pending 6번).
// 아래 두 함수는 기존 호출부(research/ 스크립트)를 위해 이름만 남긴 래퍼이며 lib/damuth-k.ts 로 위임한다.

/**
 * @deprecated lib/damuth-k.ts 의 damuthDensityPerKm2 를 쓸 것.
 * Damuth 밀도(개체/km²). mass_g 는 그램 — 내부에서 kg 으로 바꾼다. 분류군 상수가 없으면 NaN.
 */
export function damuthDensity(mass_g: number, className: string | null): number {
  return damuthDensityPerKm2(mass_g / 1000, className) ?? Number.NaN;
}

/**
 * @deprecated lib/damuth-k.ts 의 damuthK 를 쓸 것.
 * Damuth K. 체중·서식 면적·검증된 분류군 상수가 모두 있을 때만 값, 아니면 null.
 */
export function damuthK(
  mass_g: number,
  className: string | null,
  habitat_area_km2: number | null | undefined
): number | null {
  const r = damuthKResult({ massG: mass_g, className, habitatAreaKm2: habitat_area_km2 });
  return r.ok ? r.K : null;
}
