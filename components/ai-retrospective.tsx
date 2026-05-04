"use client";

import { useState } from "react";

interface Retro {
  decisivePoint: { year: string; description: string };
  whatWentWrong: string[];
  ifWeHadActed: string;
  lessonsForToday: string[];
  warning: string;
}

export function AIRetrospective({ speciesId }: { speciesId: string }) {
  const [data, setData] = useState<Retro | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/retrospective", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speciesId }),
      });
      let json: { error?: string } & Partial<Retro>;
      try {
        json = await res.json();
      } catch {
        throw new Error("AI 응답을 받지 못했어요. 잠시 후 다시 시도해주세요.");
      }
      if (!res.ok) {
        throw new Error(json.error ?? "AI 서비스에 일시적 문제가 있어요.");
      }
      if (!json.decisivePoint || !Array.isArray(json.whatWentWrong)) {
        throw new Error("AI 응답 형식이 예상과 달라요. 다시 시도해주세요.");
      }
      setData(json as Retro);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (!data) {
    return (
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900/80 p-6 backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-zinc-400 opacity-50" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-zinc-300" />
          </span>
          <p className="text-sm font-black text-zinc-100">AI 회고 분석</p>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">
          이 종의 절멸을 되짚어, 결정적 순간과 지금 우리가 배워야 할 점을 분석합니다.
        </p>
        <button
          onClick={generate}
          disabled={loading}
          className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-zinc-100 px-5 py-2.5 text-sm font-black text-zinc-900 shadow-md transition hover:bg-white disabled:opacity-50"
        >
          {loading && (
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-zinc-900 border-t-transparent" />
          )}
          {loading ? "AI 분석 중..." : error ? "다시 시도하기" : "회고 시작"}
        </button>
        {error && (
          <div className="mt-4 rounded-xl border border-amber-900/40 bg-amber-950/40 p-3">
            <p className="flex items-start gap-2 text-[12px] leading-relaxed text-amber-200">
              <span className="text-base leading-none">⚠</span>
              <span>{error}</span>
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border-l-4 border-l-zinc-500 bg-zinc-900 p-5">
        <p className="text-[10px] font-black tracking-wider text-zinc-500">결정적 순간</p>
        <p className="mt-1 text-2xl font-black text-zinc-100">{data.decisivePoint.year}</p>
        <p className="mt-2 text-sm leading-relaxed text-zinc-300">{data.decisivePoint.description}</p>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <p className="mb-3 text-[10px] font-black tracking-wider text-zinc-500">무엇이 잘못되었나</p>
        <ul className="space-y-2">
          {data.whatWentWrong.map((w, i) => (
            <li key={i} className="flex items-start gap-2 text-sm leading-relaxed text-zinc-300">
              <span className="mt-0.5 text-xs text-red-400">✕</span>
              <span>{w}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <p className="text-[10px] font-black tracking-wider text-zinc-500">만약 우리가 행동했더라면</p>
        <p className="mt-2 text-sm italic leading-relaxed text-zinc-300">{data.ifWeHadActed}</p>
      </div>

      <div className="rounded-2xl bg-zinc-100 p-5 text-zinc-900">
        <p className="text-[10px] font-black tracking-wider text-zinc-500">지금 우리에게 주는 교훈</p>
        <ul className="mt-3 space-y-2">
          {data.lessonsForToday.map((l, i) => (
            <li key={i} className="flex items-start gap-2 text-sm leading-relaxed">
              <span className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-zinc-900 text-[10px] font-black text-zinc-100">
                {i + 1}
              </span>
              <span>{l}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border-l-4 border-l-[#D81E05] bg-zinc-900 p-5">
        <p className="text-[10px] font-black tracking-wider text-[#D81E05]">⚠ 다음 차례에 대한 경고</p>
        <p className="mt-2 text-sm leading-relaxed text-zinc-300">{data.warning}</p>
      </div>
    </div>
  );
}
