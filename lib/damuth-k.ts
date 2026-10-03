// Damuth 1981 환경수용력 K — 성체 체중과 서식 면적으로 K 를 구한다.
//
//   density(개체/km²) = d × W_kg^(−0.75)
//   K = density × habitat_area_km2
//
// 단위: 상수 d 는 체중을 **kg** 으로 넣는 형태다.
//   검산 ① 명세서(PKA-1551 C-1·발명신고서 §8) 자바코뿔소: 91.2 × 2000^−0.75 × 480 = 146.4 (명세서 K ≈ 148)
//   검산 ② Damuth 1981 원식 log D = −0.75·log W(g) + 4.23 을 kg 으로 옮기면
//          D = 10^4.23 × (1000·W_kg)^−0.75 = 95.5 × W_kg^−0.75 — 91.2 와 같은 규모다.
// 예전 lib/allometry.ts 는 mass_g(그램)를 그대로 넣어 K 가 1/177.8(= 1000^0.75) 로 작아지는
// 단위 오류가 있었다 (docs/damuth-k-simulation.md §5). 이제 Damuth 계산은 이 모듈 하나에서만 한다.
//
// 적용 범위: 상수 출처를 검산할 수 있는 포유류에만 적용한다. 조류·파충류·양서류 상수는 표에 남겨 두지만
// 출처·단위를 확인하지 못해 K 계산에는 쓰지 않는다 — 그 종은 엔진이 기존 K 식으로 계산한다.
// 그 밖의 분류군(어류·무척추·식물 등)은 상수 자체가 없다. 예전처럼 포유류 값으로 대신하지 않는다.

export interface DamuthConstant {
  /** d — 체중을 kg 으로 넣을 때의 밀도 상수 (개체/km²) */
  dPerKg: number;
  /** 출처·단위를 검산했는가. false 면 K 계산에 쓰지 않는다 */
  verified: boolean;
  source: string;
}

export const DAMUTH_EXPONENT = -0.75;

export const DAMUTH_CONSTANTS: Record<string, DamuthConstant> = {
  포유류: {
    dPerKg: 91.2,
    verified: true,
    source:
      "Damuth (1981) Nature 290:699 — 명세서 자바코뿔소 예시(K≈148)와 원식 절편 10^4.23 을 kg 으로 옮긴 값(95.5)으로 검산",
  },
  조류: {
    dPerKg: 55.0,
    verified: false,
    source: "출처 미확인 — docs/phase2-allometry-constants.md 는 Damuth 1981 로 적었으나 그 논문은 포유류만 다룬다",
  },
  파충류: {
    dPerKg: 12.0,
    verified: false,
    source: "Peters & Wassenberg (1983) Oecologia 60:89 로 기재 — 체중 단위 미확인",
  },
  양서류: {
    dPerKg: 200,
    verified: false,
    source: "출처 미확인 — 변동이 커서 하한을 썼다고만 기재",
  },
};

export type DamuthSkipReason =
  | "no_mass"
  | "no_habitat_area"
  | "no_constant"
  | "unverified_constant"
  /** 엔진이 정한다 — Damuth K 가 기존 식의 최소값 max(1.2·N0, N0+50) 보다 작다 */
  | "below_n0_bound";

export type DamuthKResult =
  | {
      ok: true;
      K: number;
      /** 개체/km² */
      density: number;
      dPerKg: number;
      massKg: number;
      habitatAreaKm2: number;
      constantSource: string;
    }
  | { ok: false; reason: DamuthSkipReason };

export const DAMUTH_SKIP_LABEL: Record<DamuthSkipReason, string> = {
  no_mass: "체중 자료 없음",
  no_habitat_area: "서식 면적 자료 없음",
  no_constant: "이 분류군의 Damuth 상수 없음",
  unverified_constant: "이 분류군의 Damuth 상수 출처·단위 미검증",
  below_n0_bound: "Damuth K 가 N0 기반 최소값보다 작음 — N > K 에서 Ricker 식이 폭주해 기존 식 사용 (결정 대기 항목 10)",
};

/** 밀도(개체/km²). 분류군 상수가 없으면 null (검증 여부와 무관하게 표의 상수로 계산한다) */
export function damuthDensityPerKm2(massKg: number, className: string | null): number | null {
  const c = className ? DAMUTH_CONSTANTS[className] : undefined;
  if (!c || !(massKg > 0)) return null;
  return c.dPerKg * Math.pow(massKg, DAMUTH_EXPONENT);
}

/**
 * Damuth K. 체중(g)·서식 면적(km²)·검증된 분류군 상수가 모두 있을 때만 계산한다.
 * 못 하면 이유를 돌려준다 — 호출부(lib/tipping-point.ts)는 기존 K 식으로 대신한다.
 */
export function damuthK(input: {
  massG: number | null | undefined;
  className: string | null;
  habitatAreaKm2: number | null | undefined;
}): DamuthKResult {
  const { massG, className, habitatAreaKm2 } = input;
  if (!(typeof massG === "number" && massG > 0)) return { ok: false, reason: "no_mass" };
  if (!(typeof habitatAreaKm2 === "number" && habitatAreaKm2 > 0)) return { ok: false, reason: "no_habitat_area" };
  const c = className ? DAMUTH_CONSTANTS[className] : undefined;
  if (!c) return { ok: false, reason: "no_constant" };
  if (!c.verified) return { ok: false, reason: "unverified_constant" };
  const massKg = massG / 1000;
  const density = c.dPerKg * Math.pow(massKg, DAMUTH_EXPONENT);
  return {
    ok: true,
    K: density * habitatAreaKm2,
    density,
    dPerKg: c.dPerKg,
    massKg,
    habitatAreaKm2,
    constantSource: c.source,
  };
}
