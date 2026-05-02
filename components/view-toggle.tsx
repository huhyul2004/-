"use client";

import { useEffect, useState } from "react";

const KEY = "last-watch:view";

export function useViewMode(): ["card" | "list", (v: "card" | "list") => void] {
  const [mode, setMode] = useState<"card" | "list">("card");
  useEffect(() => {
    const saved = window.localStorage.getItem(KEY);
    if (saved === "card" || saved === "list") setMode(saved);
  }, []);
  function update(v: "card" | "list") {
    setMode(v);
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
