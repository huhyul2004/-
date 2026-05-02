import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY 가 설정되어 있지 않습니다.");
  _client = new Anthropic({ apiKey });
  return _client;
}

export const MODEL = "claude-haiku-4-5-20251001";

// JSON 만 파싱 — markdown ``` 블록 안에 들어와도 추출
export function extractJson<T = unknown>(text: string): T {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fence ? fence[1] : text).trim();
  return JSON.parse(raw) as T;
}
