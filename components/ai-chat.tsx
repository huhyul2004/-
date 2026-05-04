"use client";

import { useState, useRef, useEffect } from "react";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTED = [
  "왜 멸종 위기에 처했나요?",
  "이 종이 사라지면 어떤 일이 생기나요?",
  "지금 우리가 도울 수 있는 방법은?",
  "이 종의 가장 흥미로운 사실은?",
];

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
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setMessages((cur) => [...cur, { role: "assistant", content: json.reply }]);
    } catch (e) {
      setMessages((cur) => [
        ...cur,
        { role: "assistant", content: `⚠ 오류: ${(e as Error).message}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const cardCls = dark
    ? "rounded-2xl border border-zinc-800 bg-zinc-900"
    : "rounded-2xl border border-zinc-200 bg-white";
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
                m.role === "user" ? userBubble : aiBubble
              }`}
            >
              {m.content}
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
