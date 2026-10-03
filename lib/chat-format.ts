// 챗봇 답변 형식 상수·판별 — 서버(lib/provenance.ts·lib/chat-context.ts)와 클라이언트(components/ai-chat.tsx)가 같이 쓴다.
// DB·Node 의존이 없어야 한다 (클라이언트 번들에 들어간다).

/** 답변 끝 데이터 출처 줄의 머리말 — 서버가 붙이고, 화면은 이 줄을 본문과 따로 그린다 */
export const PROVENANCE_PREFIX = "데이터 출처:";

// 목록 기호·인용·굵게 표시를 앞에 붙인 줄("- 데이터 출처: …", "1. 데이터 출처 : …", "※ …")도 같은 줄로 본다
const PROVENANCE_HEAD = /^[\s>*_\-•※]*(?:\d+[.)]\s*)?데이터\s*출처\s*:/;

/**
 * 서버가 붙이는 출처 줄처럼 생긴 줄인가 — 머리말이 "데이터 출처:" 이고 DB 버전·조회일·계산일 중 하나를 담은 줄.
 * "데이터 출처: species.mature_individuals" 같은 본문 인용 줄은 해당하지 않는다.
 */
export function isProvenanceLine(line: string): boolean {
  return PROVENANCE_HEAD.test(line) && /LastWatch DB|DB\s*v|버전|조회일|계산일/.test(line);
}
