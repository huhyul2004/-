import { NextResponse } from "next/server";
import { generateText, friendlyError, GeminiConfigError } from "@/lib/gemini";
import { buildChatContext, finalizeReply, sanitizeHistory } from "@/lib/chat-context";

export const runtime = "nodejs";

// 컨텍스트 조립·시스템 프롬프트는 lib/chat-context.ts (평가 스크립트 research/chatbot-eval 과 공용).
// 답변 끝 "데이터 출처: …" 줄과 "개체수 하한 규칙 적용됨" 보강은 finalizeReply 가 서버에서 붙인다.
export async function POST(req: Request) {
  try {
    let body: { speciesId?: unknown; messages?: unknown };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "JSON body required" }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "JSON object body required" }, { status: 400 });
    }
    const speciesId = typeof body.speciesId === "string" ? body.speciesId.trim() : "";
    if (!speciesId) return NextResponse.json({ error: "speciesId required" }, { status: 400 });

    const messages = sanitizeHistory(body.messages);
    if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
      return NextResponse.json({ error: "messages required" }, { status: 400 });
    }

    const ctx = buildChatContext(speciesId);
    if (!ctx) return NextResponse.json({ error: "not found" }, { status: 404 });

    const text = await generateText({ system: ctx.system, messages, maxTokens: 1200 });
    return NextResponse.json({ reply: finalizeReply(text, ctx) });
  } catch (e) {
    console.error("[chat]", e);
    const status = e instanceof GeminiConfigError ? 503 : 500;
    return NextResponse.json({ error: friendlyError(e) }, { status });
  }
}
