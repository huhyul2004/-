"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import { isProvenanceLine } from "@/lib/chat-format";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTED = [
  "위험도 점수는 어떻게 계산됐나요?",
  "개체수와 추세는 어디서 나온 값인가요?",
  "주요 위협은 무엇인가요?",
  "같은 등급·분류군 종과 비교하면?",
];

// 답변 안의 **굵게** · 외부 URL · 사이트 내부 경로(/species/…, /methodology…)를 React 노드로 바꾼다.
// HTML 을 그대로 꽂지 않는다 (dangerouslySetInnerHTML 금지) — 모델 출력은 신뢰하지 않는 입력이다.
// URL 은 ASCII URL 문자까지만 — 바로 뒤에 붙은 한글 조사·백틱은 링크에 넣지 않는다
const INLINE = /(\*\*[^*\n]+\*\*|https?:\/\/[A-Za-z0-9\-._~:/?#@!$&*+,;=%]+|\/(?:species|methodology|extinct)(?:\/[A-Za-z0-9%._~-]+)*(?:#[A-Za-z0-9_-]+)?)/g;

function renderInline(text: string, linkCls: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  INLINE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE.exec(text)) !== null) {
    const tok = m[0];
    const at = m.index;
    if (at > last) out.push(text.slice(last, at));
    if (tok.startsWith("**")) {
      // 굵은 글씨 안의 링크도 링크로
      out.push(<strong key={at}>{renderInline(tok.slice(2, -2), linkCls)}</strong>);
    } else if (tok.startsWith("/") && at > 0 && /[A-Za-z0-9가-힣_.]/.test(text[at - 1])) {
      // "IUCN/species" 처럼 단어에 붙은 경로는 링크가 아니다 (lookbehind 는 구형 Safari 에서 문법 오류라 쓰지 않는다)
      out.push(tok);
    } else {
      // 문장 끝 마침표·쉼표는 링크에서 뺀다
      const trail = tok.match(/[.,;:]+$/)?.[0] ?? "";
      const href = trail ? tok.slice(0, -trail.length) : tok;
      const external = href.startsWith("http");
      out.push(
        <a
          key={at}
          href={href}
          className={linkCls}
          {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        >
          {href}
        </a>
      );
      if (trail) out.push(trail);
    }
    last = at + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** 줄 단위 렌더링 — 빈 줄은 문단 간격, "- "·"* "·"• " 줄은 글머리 목록, "1. " 줄은 번호 목록, "#" 머리줄은 굵게, 출처 줄은 맨 아래 따로 */
function AssistantText({ content, dark }: { content: string; dark: boolean }) {
  const linkCls = dark ? "break-all text-[#FC7F3F] underline" : "break-all text-[#D81E05] underline";
  const lines = content.split("\n");
  const footer = lines.filter(isProvenanceLine);
  const body = lines.filter((l) => !isProvenanceLine(l));
  const blocks: ReactNode[] = [];
  let list: ReactNode[] = [];
  let listKind: "ul" | "ol" = "ul";
  let listStart = 1;
  const flush = (key: number) => {
    if (list.length) {
      blocks.push(
        listKind === "ol" ? (
          <ol key={`ol-${key}`} start={listStart} className="ml-5 list-decimal space-y-0.5">
            {list}
          </ol>
        ) : (
          <ul key={`ul-${key}`} className="ml-4 list-disc space-y-0.5">
            {list}
          </ul>
        )
      );
      list = [];
    }
  };
  body.forEach((raw, i) => {
    const line = raw.trimEnd();
    const numbered = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    const bullet = numbered ? null : line.match(/^\s*[-*•]\s+(.*)$/);
    if (numbered || bullet) {
      const kind = numbered ? "ol" : "ul";
      if (list.length && kind !== listKind) flush(i);
      if (!list.length) {
        listKind = kind;
        listStart = numbered ? Number(numbered[1]) : 1;
      }
      list.push(<li key={i}>{renderInline(numbered ? numbered[2] : bullet![1], linkCls)}</li>);
      return;
    }
    flush(i);
    if (!line.trim()) {
      blocks.push(<div key={i} className="h-2" aria-hidden />);
      return;
    }
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    blocks.push(
      <p key={i} className={heading ? "font-bold" : undefined}>
        {renderInline(heading ? heading[1] : line, linkCls)}
      </p>
    );
  });
  flush(body.length);
  return (
    <>
      <div className="break-words">{blocks}</div>
      {footer.length > 0 && (
        <p
          className={`mt-2 border-t pt-1.5 text-[11px] leading-snug ${
            dark ? "border-zinc-700 text-zinc-400" : "border-zinc-300 text-zinc-500"
          }`}
        >
          {footer.join(" ")}
        </p>
      )}
    </>
  );
}

export function AIChat({ speciesId, dark = false }: { speciesId: string; dark?: boolean }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    if (!text.trim() || loading) return;
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speciesId, messages: next }),
      });
      let json: { error?: string; reply?: string };
      try {
        json = await res.json();
      } catch {
        throw new Error("AI 응답을 받지 못했어요. 잠시 후 다시 시도해주세요.");
      }
      if (!res.ok) {
        throw new Error(json.error ?? "AI 서비스에 일시적 문제가 있어요.");
      }
      const reply = (json.reply ?? "").trim();
      if (!reply) {
        throw new Error("AI가 빈 답변을 보냈어요. 다시 시도해주세요.");
      }
      setMessages((cur) => [...cur, { role: "assistant", content: reply }]);
    } catch (e) {
      setMessages((cur) => [
        ...cur,
        { role: "assistant", content: `⚠ ${(e as Error).message}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const cardCls = dark
    ? "rounded-3xl border border-zinc-800 bg-zinc-900/80 backdrop-blur"
    : "rounded-3xl border border-zinc-200/80 bg-white/80 backdrop-blur";
  const titleCls = dark ? "text-zinc-100" : "text-zinc-900";
  const subCls = dark ? "text-zinc-400" : "text-zinc-600";
  const userBubble = dark ? "bg-zinc-100 text-zinc-900" : "bg-zinc-900 text-white";
  const aiBubble = dark ? "bg-zinc-800 text-zinc-100" : "bg-zinc-100 text-zinc-900";
  const chipCls = dark
    ? "border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
    : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50";
  const inputCls = dark
    ? "border-zinc-700 bg-zinc-800 text-zinc-100 placeholder:text-zinc-500"
    : "border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400";

  return (
    <div className={cardCls + " p-5"}>
      <div className="mb-3 flex items-center gap-2">
        <span className="inline-block h-2 w-2 rounded-full bg-[#FC7F3F]" />
        <p className={`text-sm font-bold ${titleCls}`}>이 종에 대해 AI 에게 물어보기</p>
      </div>

      <div
        ref={scrollRef}
        className="mb-3 max-h-[360px] min-h-[160px] space-y-3 overflow-y-auto"
      >
        {messages.length === 0 && (
          <p className={`text-xs ${subCls}`}>아래 질문을 누르거나 직접 입력해 보세요.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                m.role === "user" ? `whitespace-pre-wrap break-words ${userBubble}` : aiBubble
              }`}
            >
              {m.role === "assistant" ? <AssistantText content={m.content} dark={dark} /> : m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className={`rounded-2xl px-3.5 py-2 text-sm ${aiBubble}`}>
              <span className="inline-block animate-pulse">생각 중...</span>
            </div>
          </div>
        )}
      </div>

      {messages.length === 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {SUGGESTED.map((q) => (
            <button
              key={q}
              onClick={() => send(q)}
              className={`rounded-full border px-3 py-1.5 text-xs transition ${chipCls}`}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="질문을 입력하세요..."
          enterKeyHint="send"
          className={`min-h-[44px] flex-1 rounded-xl border px-3 py-2 text-base outline-none focus:border-[#FC7F3F] sm:text-sm ${inputCls}`}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="min-h-[44px] rounded-xl bg-[#FC7F3F] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#e56e28] disabled:opacity-50"
        >
          전송
        </button>
      </form>
    </div>
  );
}
