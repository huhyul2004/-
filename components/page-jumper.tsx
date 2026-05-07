"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// 페이지 점프: 슬라이더 + 직접 입력 — 1페이지에서 625페이지 사이를 능동적으로 이동
export function PageJumper({
  currentPage,
  totalPages,
  baseQuery,
}: {
  currentPage: number;
  totalPages: number;
  baseQuery: string;
}) {
  const router = useRouter();
  const [input, setInput] = useState(String(currentPage));
  const [sliderValue, setSliderValue] = useState(currentPage);

  function jumpTo(page: number) {
    const p = Math.max(1, Math.min(totalPages, Math.round(page)));
    const sep = baseQuery.includes("?") ? "&" : "?";
    const url =
      p === 1
        ? baseQuery || "/"
        : `${baseQuery}${sep}page=${p}`;
    router.push(url);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const n = parseInt(input);
    if (!isNaN(n)) jumpTo(n);
  }

  return (
    <div className="mt-6 rounded-2xl border border-zinc-200/80 bg-white/70 p-4 backdrop-blur sm:p-5">
      <p className="mb-3 text-[10px] font-black tracking-[0.2em] text-zinc-500">
        QUICK JUMP · 페이지 이동
      </p>

      {/* 슬라이더 */}
      <div className="space-y-2">
        <input
          type="range"
          min={1}
          max={totalPages}
          value={sliderValue}
          onChange={(e) => setSliderValue(parseInt(e.target.value))}
          onMouseUp={() => jumpTo(sliderValue)}
          onTouchEnd={() => jumpTo(sliderValue)}
          className="w-full accent-[#D81E05]"
          aria-label="페이지 슬라이더"
        />
        <div className="flex justify-between text-[10px] font-mono tabular-nums text-zinc-500">
          <span>1</span>
          <span className="font-bold text-zinc-900">
            슬라이드 위치: {sliderValue.toLocaleString()}
          </span>
          <span>{totalPages.toLocaleString()}</span>
        </div>
      </div>

      {/* 직접 입력 */}
      <form onSubmit={onSubmit} className="mt-3 flex items-center gap-2">
        <span className="text-xs text-zinc-500">페이지 번호:</span>
        <input
          type="number"
          min={1}
          max={totalPages}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="w-20 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-center text-sm font-mono tabular-nums focus:border-zinc-400 focus:outline-none"
          aria-label="페이지 번호 입력"
        />
        <span className="text-xs text-zinc-400">/ {totalPages.toLocaleString()}</span>
        <button
          type="submit"
          className="ml-1 inline-flex h-9 items-center rounded-lg bg-zinc-900 px-3 text-xs font-bold text-white transition hover:bg-zinc-700"
        >
          이동
        </button>

        {/* 빠른 점프 — 25%, 50%, 75%, 끝 */}
        <div className="ml-auto flex gap-1">
          <button
            type="button"
            onClick={() => jumpTo(Math.round(totalPages * 0.25))}
            className="rounded-md bg-zinc-100 px-2 py-1 text-[10px] font-bold text-zinc-700 hover:bg-zinc-200"
          >
            25%
          </button>
          <button
            type="button"
            onClick={() => jumpTo(Math.round(totalPages * 0.5))}
            className="rounded-md bg-zinc-100 px-2 py-1 text-[10px] font-bold text-zinc-700 hover:bg-zinc-200"
          >
            50%
          </button>
          <button
            type="button"
            onClick={() => jumpTo(Math.round(totalPages * 0.75))}
            className="rounded-md bg-zinc-100 px-2 py-1 text-[10px] font-bold text-zinc-700 hover:bg-zinc-200"
          >
            75%
          </button>
          <button
            type="button"
            onClick={() => jumpTo(totalPages)}
            className="rounded-md bg-zinc-100 px-2 py-1 text-[10px] font-bold text-zinc-700 hover:bg-zinc-200"
          >
            끝
          </button>
        </div>
      </form>
    </div>
  );
}
