"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";

const OPTIONS: { key: "risk" | "name" | "recent" | "class"; label: string }[] = [
  { key: "risk", label: "위험도 순" },
  { key: "name", label: "이름 순" },
  { key: "recent", label: "최근 등록" },
  { key: "class", label: "분류군 순" },
];

export function SortSelector({
  value,
  hrefs,
}: {
  value: "risk" | "name" | "recent" | "class";
  hrefs: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, []);

  const current = OPTIONS.find((o) => o.key === value) ?? OPTIONS[0];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50"
      >
        정렬: {current.label}
        <span className="text-[10px] text-zinc-400">▼</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-40 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg">
          {OPTIONS.map((o) => (
            <Link
              key={o.key}
              href={hrefs[o.key] ?? "/"}
              onClick={() => setOpen(false)}
              className={
                "block px-3 py-2 text-xs transition " +
                (o.key === value
                  ? "bg-zinc-900 font-bold text-white"
                  : "text-zinc-700 hover:bg-zinc-50")
              }
            >
              {o.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
