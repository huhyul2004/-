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
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setData(json as Retro);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <div className="flex items-center gap-3">
          <span className="inline-block h-2 w-2 rounded-full bg-zinc-500" />
          <p className="text-sm font-bold text-zinc-100">AI 회고 분석</p>
        </div>
        <p className="mt-2 text-sm text-zinc-400">
          이 종의 절멸을 되짚어, 결정적 순간과 지금 우리가 배워야 할 점을 분석합니다.
        </p>
        <button
          onClick={generate}
          disabled={loading}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-zinc-100 px-4 py-2 text-sm font-bold text-zinc-900 transition hover:bg-white disabled:opacity-50"
        >
          {loading ? "분석 중..." : "회고 시작"}
        </button>
        {error && <p className="mt-3 text-xs text-red-400">⚠ {error}</p>}
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
