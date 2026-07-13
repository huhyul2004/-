"use client";

import { useEffect, useState } from "react";

const KEY = "last-watch:view";

// defaultMode: 저장된 사용자 선택이 없을 때의 기본값(큐레이션=card, 전체=list).
// 사용자가 명시적으로 고른 값이 있으면 그게 우선.
export function useViewMode(defaultMode: "card" | "list" = "card"): ["card" | "list", (v: "card" | "list") => void] {
  const [override, setOverride] = useState<"card" | "list" | null>(null);
  useEffect(() => {
    const saved = window.localStorage.getItem(KEY);
    if (saved === "card" || saved === "list") setOverride(saved);
  }, []);
  const mode = override ?? defaultMode;
  function update(v: "card" | "list") {
    setOverride(v);
    window.localStorage.setItem(KEY, v);
  }
  return [mode, update];
}

export function ViewToggle({ value, onChange }: { value: "card" | "list"; onChange: (v: "card" | "list") => void }) {
  return (
    <div className="inline-flex items-center rounded-lg border border-zinc-200 bg-white p-0.5">
      <button
        onClick={() => onChange("card")}
        className={
          "rounded-md px-2.5 py-1 text-xs font-bold transition " +
          (value === "card" ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100")
        }
        aria-label="카드 보기"
      >
        ◧ 카드
      </button>
      <button
        onClick={() => onChange("list")}
        className={
          "rounded-md px-2.5 py-1 text-xs font-bold transition " +
          (value === "list" ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100")
        }
        aria-label="리스트 보기"
      >
        ☰ 리스트
      </button>
    </div>
  );
}
