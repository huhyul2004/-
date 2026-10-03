// Gemini (Google AI Studio) REST 호출.
// Anthropic 크레딧 소진으로 LLM 을 쓰는 API 라우트 전부(chat / recommend / retrospective)를 이쪽으로 옮겼다.
// search 라우트는 SQLite 쿼리만 하므로 LLM 을 쓰지 않는다.
// scripts/ 의 일회성 배치(translate-ko, transliterate-* 등)는 아직 lib/anthropic.ts 를 쓴다.
// SDK 를 따로 붙이지 않고 fetch 로 직접 친다 — 의존성 추가 없이 generateContent 하나만 쓰면 되기 때문.
//
// 키 처리 (결정 14, 2026-10-03 확인):
//   - GEMINI_API_KEY 는 서버에서만 process.env 로 읽는다. NEXT_PUBLIC_ 이 아니라 브라우저 번들에 들어가지 않는다
//     (next build 산출물 .next 전체에서 키 값·앞뒤 8자 0건 확인).
//   - 요청 헤더 x-goog-api-key 로만 보낸다. URL 쿼리(?key=)에 넣지 않는다 — URL 은 프록시·로그에 남는다.
//   - 오류는 friendlyError 가 사용자용 문장으로 바꾼다. 원본 오류·키를 응답 본문에 넣지 않는다.
//   - 키를 바꿔야 하면 Google AI Studio 에서 폐기·재발급 → .env.local · Vercel 환경 변수 교체 (README "API 키 설정").

export class GeminiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiConfigError";
  }
}

export const MODEL = "gemini-3.7-flash";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

// Gemini 는 사고(thinking) 토큰도 maxOutputTokens 에 포함해서 센다.
// 호출부가 넘긴 maxTokens 는 '답변 길이' 예산이므로, 사고 몫을 따로 얹어준다.
// thinkingLevel "low" 기준 실측 276~394 토큰이라 1024 면 충분하다.
const THINKING_HEADROOM = 1024;

export interface LlmMessage {
  role: "user" | "assistant";
  content: string;
}

function getKey(): string {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key || key === "undefined" || key === "null") {
    throw new GeminiConfigError(
      "AI 서비스가 잠시 점검 중이에요. 운영자가 환경 설정을 확인하면 곧 복구됩니다."
    );
  }
  return key;
}

export async function generateText(opts: {
  system: string;
  messages: LlmMessage[];
  maxTokens: number;
  /** true 면 응답을 JSON 으로 강제한다 (recommend / retrospective 처럼 스키마를 요구하는 라우트용). */
  json?: boolean;
}): Promise<string> {
  const key = getKey();

  const res = await fetch(`${ENDPOINT}/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: opts.system }] },
      // Anthropic 의 assistant 역할이 Gemini 에서는 model 이다.
      contents: opts.messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      generationConfig: {
        maxOutputTokens: opts.maxTokens + THINKING_HEADROOM,
        // 출처·연도를 그대로 옮겨 적어야 하는 용도라 창의성은 낮게 둔다.
        temperature: 0.2,
        thinkingConfig: { thinkingLevel: "low" },
        // 마크다운 ``` 펜스 없이 순수 JSON 만 받는다. 파싱은 호출부의 extractJson 이 한 번 더 방어.
        ...(opts.json ? { responseMimeType: "application/json" } : {}),
      },
    }),
  });

  const data = (await res.json()) as any;

  if (!res.ok) {
    const msg: string = data?.error?.message ?? `Gemini ${res.status}`;
    // 키 자체가 잘못된 경우는 설정 문제(503) 로 올린다.
    if (res.status === 400 && /API key|API_KEY_INVALID/i.test(msg)) {
      throw new GeminiConfigError(
        "AI 서비스 인증이 만료됐어요. 운영자가 키를 갱신하면 곧 복구됩니다."
      );
    }
    throw new Error(`Gemini ${res.status}: ${msg}`);
  }

  // 안전 필터에 프롬프트 자체가 걸린 경우 candidates 가 아예 없다.
  const block = data?.promptFeedback?.blockReason;
  if (block) throw new Error(`Gemini blocked: ${block}`);

  const cand = data?.candidates?.[0];
  const text: string = (cand?.content?.parts ?? [])
    .map((p: { text?: string }) => p.text ?? "")
    .join("");

  if (!text.trim()) {
    // 사고 토큰이 예산을 다 먹고 본문이 안 나온 경우 — 조용히 빈 답을 돌려주지 않는다.
    throw new Error(`Gemini empty response (finishReason=${cand?.finishReason ?? "unknown"})`);
  }
  return text;
}

// 사용자에게 보여줄 친절한 에러 메시지 변환
export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);

  if (e instanceof GeminiConfigError) return e.message;

  if (/API key|API_KEY_INVALID|PERMISSION_DENIED|403/i.test(msg)) {
    return "AI 서비스 인증이 만료됐어요. 운영자가 키를 갱신하면 곧 복구됩니다.";
  }
  if (/429|RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(msg)) {
    return "요청이 몰려서 잠시 쉬어가요. 30초 후 다시 시도해주세요.";
  }
  if (/blocked/i.test(msg)) {
    return "안전 필터에 걸려 답변하지 못했어요. 질문을 조금 바꿔서 다시 시도해주세요.";
  }
  if (/empty response/i.test(msg)) {
    return "답변이 비어서 돌아왔어요. 다시 시도하면 보통 해결됩니다.";
  }
  if (/5\d\d|UNAVAILABLE|INTERNAL/i.test(msg)) {
    return "AI 서버에 일시적 문제가 있어요. 잠시 후 다시 시도해주세요.";
  }
  if (/network|fetch failed|ECONNRESET|ETIMEDOUT/i.test(msg)) {
    return "네트워크 연결을 확인하고 다시 시도해주세요.";
  }
  return "예상치 못한 오류가 발생했어요. 다시 시도하면 보통 해결됩니다.";
}
