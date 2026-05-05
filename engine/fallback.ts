/**
 * Fallback Module — 데이터 결손 시 보수적 추정
 *
 * Dependent Claim — 시계열 데이터가 부재한 경우, 분류군(class) 평균 생활사 +
 * IUCN 등급별 개체수 중앙값 prior 결합 → 합성 입력 + confidence 상한 0.4 강제.
 *
 * 핵심 새로움:
 *  - 단순 NaN 처리가 아닌 적극적 prior 결합
 *  - data_source = "fallback_estimate" 메타데이터로 사용자/외부 시스템에 명시
 */

export interface TaxonDefaults {
  lambda_mean: number;     // 연 개체수 증가율 (1.0 = 안정)
  lambda_sd: number;       // 환경 확률성
  density: number;         // 개체/km²
  generation_time: number; // 년
  ne_nc_ratio: number;     // 메타분석 평균
}

export const TAXON_DEFAULTS: Record<string, TaxonDefaults> = {
  포유류:        { lambda_mean: 1.02, lambda_sd: 0.15, density: 0.5,  generation_time: 8,  ne_nc_ratio: 0.15 },
  조류:          { lambda_mean: 1.05, lambda_sd: 0.18, density: 5,    generation_time: 5,  ne_nc_ratio: 0.20 },
  파충류:        { lambda_mean: 1.00, lambda_sd: 0.12, density: 2,    generation_time: 10, ne_nc_ratio: 0.15 },
  양서류:        { lambda_mean: 0.98, lambda_sd: 0.25, density: 50,   generation_time: 3,  ne_nc_ratio: 0.10 },
  "어류 (조기어류)": { lambda_mean: 1.10, lambda_sd: 0.30, density: 100,  generation_time: 4,  ne_nc_ratio: 0.05 },
  "어류 (경골어류)": { lambda_mean: 1.10, lambda_sd: 0.30, density: 100,  generation_time: 4,  ne_nc_ratio: 0.05 },
  "어류 (연골어류)": { lambda_mean: 0.95, lambda_sd: 0.10, density: 0.1,  generation_time: 12, ne_nc_ratio: 0.10 },
  곤충:          { lambda_mean: 1.15, lambda_sd: 0.40, density: 1000, generation_time: 1,  ne_nc_ratio: 0.10 },
  거미류:        { lambda_mean: 1.10, lambda_sd: 0.30, density: 200,  generation_time: 2,  ne_nc_ratio: 0.10 },
  갑각류:        { lambda_mean: 1.08, lambda_sd: 0.25, density: 100,  generation_time: 2,  ne_nc_ratio: 0.08 },
  복족류:        { lambda_mean: 1.05, lambda_sd: 0.20, density: 500,  generation_time: 2,  ne_nc_ratio: 0.10 },
  이매패류:      { lambda_mean: 1.03, lambda_sd: 0.18, density: 50,   generation_time: 5,  ne_nc_ratio: 0.05 },
  "산호류 (육방산호)": { lambda_mean: 0.98, lambda_sd: 0.10, density: 10,  generation_time: 10, ne_nc_ratio: 0.05 },
  "식물 (침엽수)": { lambda_mean: 0.99, lambda_sd: 0.05, density: 100, generation_time: 30, ne_nc_ratio: 0.20 },
  "식물 (소철)":   { lambda_mean: 0.98, lambda_sd: 0.05, density: 50,  generation_time: 25, ne_nc_ratio: 0.20 },
  지의류:        { lambda_mean: 0.99, lambda_sd: 0.03, density: 1000, generation_time: 10, ne_nc_ratio: 0.15 },
};

const DEFAULT_TAXON: TaxonDefaults = { lambda_mean: 1.00, lambda_sd: 0.15, density: 10, generation_time: 5, ne_nc_ratio: 0.15 };

// IUCN 등급별 개체수 중앙값 prior (Criterion D 기반 보수적 추정)
export const IUCN_POPULATION_MEDIAN: Record<string, number> = {
  CR: 200,    // < 250 (Criterion D)
  EN: 1500,   // < 2500
  VU: 5000,   // < 10000
  NT: 20000,
  LC: 100000,
  EX: 0,
  EW: 5,
  DD: 1000,
  NE: 1000,
};

export interface FallbackInput {
  N0: number;
  K: number;
  lambda_mean: number;
  lambda_sd: number;
  generation_time: number;
  ne_nc_ratio: number;
  metadata: {
    data_source: "fallback_estimate" | "real";
    confidence_cap: number;
    missing_fields: string[];
  };
}

export function fallbackEstimate(input: {
  class_name: string | null;
  iucn_status: string;
  range_km2?: number;
  observed_population?: number | null;
}): FallbackInput {
  const taxon = TAXON_DEFAULTS[input.class_name ?? ""] ?? DEFAULT_TAXON;
  const popPrior = IUCN_POPULATION_MEDIAN[input.iucn_status] ?? 1000;

  const N0 = input.observed_population ?? popPrior;
  const K = input.range_km2 != null ? input.range_km2 * taxon.density : Math.max(N0 * 1.5, N0 + 100);

  const missing: string[] = [];
  if (input.observed_population == null) missing.push("observed_population");
  if (input.range_km2 == null) missing.push("range_km2");
  if (!input.class_name) missing.push("class_name");

  return {
    N0,
    K,
    lambda_mean: taxon.lambda_mean,
    lambda_sd: taxon.lambda_sd,
    generation_time: taxon.generation_time,
    ne_nc_ratio: taxon.ne_nc_ratio,
    metadata: {
      data_source: missing.length > 0 ? "fallback_estimate" : "real",
      confidence_cap: missing.length > 0 ? 0.4 : 1.0,
      missing_fields: missing,
    },
  };
}
