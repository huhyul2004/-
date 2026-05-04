import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

export class AnthropicConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnthropicConfigError";
  }
}

export function getAnthropic(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey || apiKey === "undefined" || apiKey === "null" || !apiKey.startsWith("sk-ant-")) {
    throw new AnthropicConfigError(
      "AI 서비스가 잠시 점검 중이에요. 운영자가 환경 설정을 확인하면 곧 복구됩니다."
    );
  }
  _client = new Anthropic({ apiKey });
  return _client;
}

export const MODEL = "claude-haiku-4-5-20251001";

// JSON 만 파싱 — markdown ``` 블록 안에 들어와도 추출. 실패하면 의미 있는 에러
export function extractJson<T = unknown>(text: string): T {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fence ? fence[1] : text).trim();
  try {
    return JSON.parse(raw) as T;
  } catch {
    // 첫 { 부터 마지막 } 까지 잘라보기
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1)) as T;
      } catch {
        // fallthrough
      }
    }
    throw new Error("AI 응답을 해석하지 못했어요. 잠시 후 다시 시도해주세요.");
  }
}

// 사용자에게 보여줄 친절한 에러 메시지 변환
export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);

  if (e instanceof AnthropicConfigError) return e.message;

  // 401 / authentication
  if (/401|invalid x-api-key|authentication_error/i.test(msg)) {
    return "AI 서비스 인증이 만료됐어요. 운영자가 키를 갱신하면 곧 복구됩니다.";
  }
  // 429 / rate limit
  if (/429|rate.?limit/i.test(msg)) {
    return "요청이 몰려서 잠시 쉬어가요. 30초 후 다시 시도해주세요.";
  }
  // 500 / server error
  if (/5\d\d|server.?error|internal/i.test(msg)) {
    return "AI 서버에 일시적 문제가 있어요. 잠시 후 다시 시도해주세요.";
  }
  // network
  if (/network|fetch failed|ECONNRESET|ETIMEDOUT/i.test(msg)) {
    return "네트워크 연결을 확인하고 다시 시도해주세요.";
  }
  // overloaded
  if (/overloaded/i.test(msg)) {
    return "AI 가 잠시 과부하 상태예요. 1분 후 다시 시도해주세요.";
  }
  // JSON parse
  if (/JSON|해석하지 못/i.test(msg)) {
    return msg;
  }
  return "예상치 못한 오류가 발생했어요. 다시 시도하면 보통 해결됩니다.";
}
