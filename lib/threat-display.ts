// 위협 표시 공용 — 챗봇(app/api/chat/route.ts)과 종·절멸 상세 페이지(components/threat-list.tsx)가 같이 쓴다.
// IUCN 말단 이름은 여러 코드가 같이 쓴다("Named species" 가 8_1_2 외래 침입종 / 8_2_2 문제성 토착종 …) —
// 상위 분류 경로를 붙이고 시기(timing)별로 나눈다. 수기 입력 위협(코드 없음)은 이름만 쓴다.
import type { ThreatRow } from "./db";

export interface TimingGroup {
  /** threats.timing 값. null = 기록 없음 또는 목록에 없는 값 */
  timing: string | null;
  /** 챗봇 컨텍스트 줄 머리 */
  chatLabel: string;
  /** 화면 소제목 (과거 그룹은 화면에서 "과거" 배지가 앞에 붙는다) */
  label: string;
  /** 과거 위협 — 현재 진행 중 아님 */
  past: boolean;
}

export const TIMING_GROUPS: TimingGroup[] = [
  { timing: "Ongoing", chatLabel: "IUCN 위협 — 진행 중(Ongoing)", label: "진행 중", past: false },
  { timing: "Future", chatLabel: "IUCN 위협 — 앞으로 예상(Future)", label: "앞으로 예상", past: false },
  {
    timing: "Past, Likely to Return",
    chatLabel: "IUCN 과거 위협 — 현재 진행 중 아님, 재발 가능(Past, Likely to Return)",
    label: "현재 진행 중 아님 · 재발 가능",
    past: true,
  },
  {
    timing: "Past, Unlikely to Return",
    chatLabel: "IUCN 과거 위협 — 현재 진행 중 아님, 재발 가능성 낮음(Past, Unlikely to Return)",
    label: "현재 진행 중 아님 · 재발 가능성 낮음",
    past: true,
  },
  { timing: "Unknown", chatLabel: "IUCN 위협 — 시기 미상(Unknown)", label: "시기 미상", past: false },
  { timing: null, chatLabel: "IUCN 위협 — 시기 기록 없음", label: "시기 기록 없음", past: false },
];

const KNOWN_TIMINGS = new Set(TIMING_GROUPS.map((g) => g.timing));

type ThreatLike = Pick<ThreatRow, "threat_name" | "threat_code" | "threat_parent" | "threat_category" | "timing">;

/** [대분류, 중분류, 항목] — 같은 이름이 겹치면(중분류 코드 행은 상위 = 대분류) 한 번만 */
export function threatPathParts(t: ThreatLike): string[] {
  return [t.threat_category, t.threat_parent, t.threat_name].filter(
    (v, i, a): v is string => !!v && a.indexOf(v) === i
  );
}

/** "대분류 > 중분류 > 항목 (코드)" — 챗봇 컨텍스트 형식 */
export function threatPath(t: ThreatLike): string {
  return threatPathParts(t).join(" > ") + ` (${t.threat_code})`;
}

/** 수기 입력 위협과, 시기별로 묶은 IUCN 위협. 빈 그룹은 빼고 TIMING_GROUPS 순서를 지킨다. */
export function splitThreats<T extends ThreatLike>(threats: T[]) {
  const manual = threats.filter((t) => !t.threat_code);
  const iucn = threats.filter((t) => t.threat_code);
  const groups = TIMING_GROUPS.map((group) => ({
    group,
    threats: iucn.filter((t) =>
      group.timing === null ? t.timing === null || !KNOWN_TIMINGS.has(t.timing) : t.timing === group.timing
    ),
  })).filter((g) => g.threats.length > 0);
  return { manual, groups };
}
