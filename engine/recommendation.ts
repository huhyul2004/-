/**
 * Recommendation Module — Tier × 위협유형 × 지역 권고 행동 매트릭스
 *
 * Independent Claim 2 (BM 발명) — 종합 점수에 대응한 5단계 Tier 코드,
 * IUCN 위협 분류, 지리적 지역의 3차원 매핑으로 우선순위 부여된 행동 목록 생성.
 *
 * 핵심 새로움(Novelty):
 *  - 단순 등급 표시가 아닌 수행주체(agency) + 우선순위(priority) + 알림등급 자동 결정
 *  - 결정론적 매트릭스 룩업 — LLM 호출 없이 즉시 산출 (특허 청구항 적합)
 */

export type TierCode = "T0" | "T1" | "T2" | "T3" | "T4";
export type NotificationLevel = "low" | "medium" | "high" | "critical";

export interface RecommendedAction {
  priority: number;
  action: string;
  responsible: string;
  agency_examples?: string[];
}

export interface Recommendation {
  tier: TierCode;
  label: string;
  notification: NotificationLevel;
  actions: RecommendedAction[];
}

const TIER_ACTION_MATRIX: Record<TierCode, Recommendation> = {
  T0: {
    tier: "T0",
    label: "Stable — 안정",
    notification: "low",
    actions: [
      { priority: 1, action: "정기 모니터링 (연 1회 이상)", responsible: "현지 보전 NGO" },
      { priority: 2, action: "기준선 데이터 축적", responsible: "학술기관" },
    ],
  },
  T1: {
    tier: "T1",
    label: "Watch — 주의",
    notification: "medium",
    actions: [
      { priority: 1, action: "모니터링 주기 단축 (분기 → 월)", responsible: "현지 보전기관" },
      { priority: 2, action: "위협요인 매핑 시작", responsible: "지역 환경연구소" },
      { priority: 3, action: "지역 NGO·언론 알림", responsible: "정부 환경부서" },
    ],
  },
  T2: {
    tier: "T2",
    label: "Warning — 개입 검토",
    notification: "high",
    actions: [
      { priority: 1, action: "정밀 PVA 재평가 (3년 내)", responsible: "보전유전학 기관" },
      { priority: 2, action: "서식지 보호구역 확장 검토", responsible: "정부 보전당국" },
      { priority: 3, action: "유전다양성 평가 (microsatellite/SNP)", responsible: "학술 연구소" },
      { priority: 4, action: "이해관계자 보전계획 수립 회의", responsible: "정부 + NGO 연합" },
    ],
  },
  T3: {
    tier: "T3",
    label: "Critical — 즉시 개입",
    notification: "critical",
    actions: [
      { priority: 1, action: "긴급 서식지 보호 조치 발동", responsible: "정부 보전당국" },
      { priority: 2, action: "인공증식 프로그램 시작", responsible: "야생동물 복원센터" },
      { priority: 3, action: "법적 보호종 지정·격상 추진", responsible: "정부 입법기관" },
      { priority: 4, action: "서식지 통로(corridor) 확보", responsible: "지자체 + 환경부" },
    ],
  },
  T4: {
    tier: "T4",
    label: "Imminent — 마지막 골든타임",
    notification: "critical",
    actions: [
      { priority: 1, action: "포획 및 ex-situ 보전 즉시 실시", responsible: "정부 보전당국" },
      { priority: 2, action: "유전자 보전 (genome banking)", responsible: "보전유전학 기관" },
      { priority: 3, action: "응급 서식지 봉쇄·포식자 제거", responsible: "관할 보호구역" },
      { priority: 4, action: "긴급 이주 (translocation)", responsible: "야생동물 복원센터" },
    ],
  },
};

// 위협 유형별 추가 액션 (IUCN Threat Classification 단순 매핑)
const THREAT_SPECIFIC: Record<string, RecommendedAction> = {
  hunting: { priority: 5, action: "밀렵·사냥 단속 강화", responsible: "정부 단속기관" },
  bycatch: { priority: 5, action: "어업 자망 제한 구역 설정", responsible: "수산 당국" },
  habitat_loss: { priority: 5, action: "토지 이용 규제·복원", responsible: "지자체" },
  pollution: { priority: 5, action: "오염원 추적 + 정화 명령", responsible: "환경 단속" },
  climate: { priority: 5, action: "기후변화 적응 프로그램", responsible: "기상청 + 환경부" },
  invasive: { priority: 5, action: "외래종 제거", responsible: "현지 보전기관" },
  disease: { priority: 5, action: "질병 모니터링 + 백신", responsible: "수의학 연구소" },
  bushmeat: { priority: 5, action: "지역 식문화 대안 프로그램", responsible: "지역 NGO" },
};

// 지역별 보전기관 매핑
const REGIONAL_AGENCY: Record<string, string> = {
  KR: "환경부 / 국립생태원",
  JP: "환경성 / 일본자연보호협회",
  CN: "국가임업초원국",
  US: "USFWS / NOAA Fisheries",
  EU: "European Commission DG ENV",
  CD: "ICCN (콩고민주공화국)",
  ID: "KSDAE (인도네시아)",
  RU: "Rosprirodnadzor",
  global: "IUCN / CITES Secretariat",
};

/**
 * Tier + 위협 + 지역 → 권고 행동 목록
 */
export function buildRecommendation(
  tier: TierCode,
  threats: string[] = [],
  region = "global",
  options: { has_existing_program?: boolean } = {}
): Recommendation {
  const base = TIER_ACTION_MATRIX[tier];

  // 1) 기본 액션 + 위협 특화 액션
  const threatActions = threats
    .map((t) => THREAT_SPECIFIC[t.toLowerCase()])
    .filter(Boolean);

  // 2) 지역 기관 매칭 (responsible 에 추가 정보)
  const agency = REGIONAL_AGENCY[region.toUpperCase()] ?? REGIONAL_AGENCY.global;
  const merged: RecommendedAction[] = [...base.actions, ...threatActions].map((a) => ({
    ...a,
    agency_examples: [agency],
  }));

  // 3) 중복 제거 + 우선순위 정렬
  const seen = new Set<string>();
  const dedup = merged.filter((a) => {
    if (seen.has(a.action)) return false;
    seen.add(a.action);
    return true;
  });
  dedup.sort((a, b) => a.priority - b.priority);

  // 4) 기존 프로그램 있으면 모니터링 우선순위 낮춤
  if (options.has_existing_program) {
    return { ...base, actions: dedup.filter((a) => !a.action.includes("모니터링")) };
  }
  return { ...base, actions: dedup };
}

export { TIER_ACTION_MATRIX, REGIONAL_AGENCY };
