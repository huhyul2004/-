/**
 * Phase 2 알로메트릭 관계식 — 체중(mass_g) 기반 생활사 파라미터 추정.
 * 상수 출처: docs/phase2-allometry-constants.md
 *
 * 순수 함수 모듈 (기존 lib/tipping-point.ts 로직에 영향 없음).
 * useAllometric=true 경로에서만 사용.
 */

export type ThermalClass = "homeotherm" | "poikilotherm";

// 항온동물 = 포유류·조류. 그 외(어류/파충류/양서류/무척추/식물)는 변온으로 처리.
export function thermalClass(className: string | null): ThermalClass {
  if (className === "포유류" || className === "조류") return "homeotherm";
  return "poikilotherm";
}

// Damuth 밀도 상수 (km^-2). 어류·무척추·식물은 전용값 없어 포유류 fallback.
function damuthConstant(className: string | null): number {
  if (className === "포유류") return 91.2;
  if (className === "조류") return 55.0;
  if (className === "파충류") return 12.0;
  if (className === "양서류") return 200;
  return 91.2; // 미확인 → 포유류 fallback
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

/**
 * Damuth 1981 (Nature 290:699): density = d × W^(-0.75)  [km^-2]
 */
export function damuthDensity(mass_g: number, className: string | null): number {
  const d = damuthConstant(className);
  return d * Math.pow(mass_g, -0.75);
}

/**
 * Damuth 환경수용력 K = density × habitat_area_km2.
 * habitat_area 없으면 null → 호출부에서 기존 fallback 사용.
 */
export function damuthK(
  mass_g: number,
  className: string | null,
  habitat_area_km2: number | null | undefined
): number | null {
  if (habitat_area_km2 == null || habitat_area_km2 <= 0) return null;
  return damuthDensity(mass_g, className) * habitat_area_km2;
}
