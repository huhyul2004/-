"use client";

import { useState } from "react";

interface Recommend {
  oneLiner: string;
  whyItMatters: string;
  immediateActions: { title: string; detail: string }[];
  longTermStrategy: string;
  whatYouCanDo: string[];
}

export function AIRecommend({ speciesId }: { speciesId: string }) {
  const [data, setData] = useState<Recommend | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speciesId }),
      });
      let json: { error?: string } & Partial<Recommend>;
      try {
        json = await res.json();
      } catch {
        throw new Error("AI 응답을 받지 못했어요. 잠시 후 다시 시도해주세요.");
      }
      if (!res.ok) {
        throw new Error(json.error ?? "AI 서비스에 일시적 문제가 있어요.");
      }
      if (!json.oneLiner || !Array.isArray(json.immediateActions)) {
        throw new Error("AI 응답 형식이 예상과 달라요. 다시 시도해주세요.");
      }
      setData(json as Recommend);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (!data) {
    return (
      <div className="rounded-3xl border border-zinc-200/80 bg-white/80 p-6 backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#D81E05] opacity-50" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#D81E05]" />
          </span>
          <p className="text-sm font-black text-zinc-900">AI 보전 전략 받기</p>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-zinc-600">
          이 종의 위협 요인과 서식지 데이터를 분석해, 지금 우리가 할 수 있는 행동을 제안받습니다.
        </p>
        <button
          onClick={generate}
          disabled={loading}
          className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-black text-white shadow-md shadow-zinc-900/20 transition hover:bg-zinc-700 disabled:opacity-50"
        >
          {loading && (
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
          )}
          {loading ? "AI 분석 중..." : error ? "다시 시도하기" : "전략 생성하기"}
        </button>
        {error && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="flex items-start gap-2 text-[12px] leading-relaxed text-amber-900">
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
      <div className="rounded-2xl border-l-4 border-l-[#D81E05] bg-white p-5 shadow-sm">
        <p className="text-[10px] font-black tracking-wider text-[#D81E05]">한 줄 전략</p>
        <p className="mt-1 text-lg font-bold text-zinc-900">{data.oneLiner}</p>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5">
        <p className="text-[10px] font-black tracking-wider text-zinc-500">왜 중요한가</p>
        <p className="mt-2 text-sm leading-relaxed text-zinc-700">{data.whyItMatters}</p>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5">
        <p className="mb-3 text-[10px] font-black tracking-wider text-zinc-500">지금 당장 할 일</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {data.immediateActions.map((a, i) => (
            <div key={i} className="rounded-xl bg-zinc-50 p-3">
              <p className="text-xs font-black text-[#D81E05]">0{i + 1}</p>
              <p className="mt-1 text-sm font-bold text-zinc-900">{a.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-600">{a.detail}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5">
        <p className="text-[10px] font-black tracking-wider text-zinc-500">10년 장기 전략</p>
        <p className="mt-2 text-sm leading-relaxed text-zinc-700">{data.longTermStrategy}</p>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-zinc-900 p-5 text-zinc-100">
        <p className="text-[10px] font-black tracking-wider text-[#FC7F3F]">내가 지금 할 수 있는 것</p>
        <ul className="mt-3 space-y-2">
          {data.whatYouCanDo.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm leading-relaxed">
              <span className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#FC7F3F] text-[10px] font-black text-zinc-900">
                {i + 1}
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
