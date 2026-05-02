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
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setData(json as Recommend);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-6">
        <div className="flex items-center gap-3">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#D81E05]" />
          <p className="text-sm font-bold text-zinc-900">AI 보전 전략 받기</p>
        </div>
        <p className="mt-2 text-sm text-zinc-600">
          이 종의 위협 요인과 서식지 데이터를 분석해, 지금 우리가 할 수 있는 행동을 제안받습니다.
        </p>
        <button
          onClick={generate}
          disabled={loading}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-zinc-700 disabled:opacity-50"
        >
          {loading ? "분석 중..." : "전략 생성하기"}
        </button>
        {error && <p className="mt-3 text-xs text-red-600">⚠ {error}</p>}
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
