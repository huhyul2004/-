"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

interface SearchResult {
  id: string;
  scientific_name: string;
  common_name_en: string | null;
  common_name_ko: string | null;
  category: string;
  photo_url: string | null;
  class_name: string | null;
}

const CAT_COLORS: Record<string, string> = {
  CR: "bg-[#D81E05] text-white",
  EN: "bg-[#FC7F3F] text-white",
  VU: "bg-[#F9E814] text-zinc-900",
  EX: "bg-zinc-900 text-white",
  EW: "bg-zinc-900 text-white",
};

export function SearchBar() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", handle);
    return () => window.removeEventListener("mousedown", handle);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const json = await res.json();
        setResults(json.results ?? []);
        setActive(0);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q]);

  function go(r: SearchResult) {
    const isExtinct = r.category === "EX" || r.category === "EW";
    router.push(isExtinct ? `/extinct/${r.id}` : `/species/${r.id}`);
    setOpen(false);
    setQ("");
  }

  function onKey(e: React.KeyboardEvent) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[active]) go(results[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative w-full">
      <div className="flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 shadow-sm focus-within:border-zinc-400">
        <span className="text-zinc-400">🔍</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          onFocus={() => q && setOpen(true)}
          placeholder="종 이름, 학명, 영문명으로 검색..."
          enterKeyHint="search"
          className="flex-1 bg-transparent text-base outline-none placeholder:text-zinc-400 sm:text-sm"
        />
        {loading && <span className="text-xs text-zinc-400">검색 중...</span>}
      </div>

      {open && results.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-40 mt-2 max-h-[440px] overflow-y-auto rounded-2xl border border-zinc-200 bg-white shadow-xl">
          {results.map((r, i) => {
            const name = r.common_name_ko ?? r.common_name_en ?? r.scientific_name;
            const isExtinct = r.category === "EX" || r.category === "EW";
            return (
              <button
                key={r.id}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(r)}
                className={
                  "flex w-full items-center gap-3 px-3 py-2.5 text-left transition " +
                  (i === active ? "bg-zinc-100" : "hover:bg-zinc-50")
                }
              >
                <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-zinc-100">
                  {r.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.photo_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[9px] text-zinc-400">
                      —
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-zinc-900">{name}</p>
                  <p className="truncate text-[11px] italic text-zinc-500">{r.scientific_name}</p>
                </div>
                <span
                  className={`flex-shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-black ${
                    CAT_COLORS[r.category] ?? "bg-zinc-200 text-zinc-700"
                  }`}
                >
                  {r.category}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {open && q && results.length === 0 && !loading && (
        <div className="absolute left-0 right-0 top-full z-40 mt-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-500 shadow-md">
          검색 결과가 없습니다.
        </div>
      )}
    </div>
  );
}
