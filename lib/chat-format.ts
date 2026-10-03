// 챗봇 답변 형식 상수 — 서버(lib/provenance.ts·lib/chat-context.ts)와 클라이언트(components/ai-chat.tsx)가 같이 쓴다.
// DB·Node 의존이 없어야 한다 (클라이언트 번들에 들어간다).

/** 답변 끝 데이터 출처 줄의 머리말 — 서버가 붙이고, 화면은 이 줄을 본문과 따로 그린다 */
export const PROVENANCE_PREFIX = "데이터 출처:";
