"use client";

import { useRouter, useSearchParams } from "next/navigation";

// "모든 종 보기" 토글 — 큐레이션(~4,230) ↔ 전체(38,082) 전환.
// 상태는 URL(?show_all=true)로 관리 → 새로고침·링크 공유에도 유지.
export function AllSpeciesToggle({ totalAll }: { totalAll: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const showAll = searchParams.get("show_all") === "true";

  function toggle() {
    const params = new URLSearchParams(searchParams.toString());
    if (showAll) params.delete("show_all");
    else params.set("show_all", "true");
    params.delete("page"); // 모드 전환 시 1페이지로
    const q = params.toString();
    router.push(q ? `/?${q}` : "/");
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={showAll}
      onClick={toggle}
      className="group inline-flex items-center gap-2.5 rounded-full border border-zinc-200 bg-white px-3.5 py-2 text-[13px] font-bold text-zinc-700 transition hover:border-zinc-300"
    >
      <span
        className={
          "relative inline-block h-5 w-9 shrink-0 rounded-full transition-colors " +
          (showAll ? "bg-zinc-900" : "bg-zinc-300")
        }
        aria-hidden
      >
        <span
          className={
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform " +
            (showAll ? "translate-x-4" : "translate-x-0.5")
          }
        />
      </span>
      <span>
        모든 종 보기
        <span className="ml-1 font-mono text-[11px] tabular-nums text-zinc-400">
          ({totalAll.toLocaleString()}종)
        </span>
      </span>
    </button>
  );
}
