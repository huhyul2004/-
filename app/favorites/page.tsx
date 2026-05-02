"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { readFavorites } from "@/components/favorite-button";

interface Hydrated {
  id: string;
  name: string;
  scientific_name: string;
  category: string;
  photo_url: string | null;
  class_name: string | null;
}

const CAT_BG: Record<string, string> = {
  CR: "bg-[#D81E05] text-white",
  EN: "bg-[#FC7F3F] text-white",
  VU: "bg-[#F9E814] text-zinc-900",
  EX: "bg-zinc-900 text-white",
  EW: "bg-zinc-800 text-white",
};

export default function FavoritesPage() {
  const [items, setItems] = useState<Hydrated[]>([]);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const favs = readFavorites();
    if (favs.length === 0) {
      setItems([]);
      setLoaded(true);
      return;
    }
    const res = await fetch("/api/favorites?ids=" + favs.map((f) => f.id).join(","));
    const json = await res.json();
    setItems(json.results ?? []);
    setLoaded(true);
  }

  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener("favorites:change", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("favorites:change", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <header className="mb-6">
        <p className="text-xs font-bold tracking-widest text-[#FC7F3F]">FAVORITES · 즐겨찾기</p>
        <h1 className="mt-2 text-3xl font-black text-zinc-900">내가 지키고 싶은 종</h1>
        <p className="mt-2 text-sm text-zinc-600">
          이 목록은 이 브라우저에만 저장됩니다. 다른 기기에서는 다시 추가해야 합니다.
        </p>
      </header>

      {!loaded ? (
        <p className="text-sm text-zinc-500">불러오는 중...</p>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-200 bg-white py-16 text-center">
          <p className="text-sm text-zinc-500">아직 즐겨찾기한 종이 없습니다.</p>
          <Link
            href="/"
            className="mt-3 inline-block rounded-xl bg-zinc-900 px-4 py-2 text-xs font-bold text-white"
          >
            종 둘러보기
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {items.map((s) => {
            const isExtinct = s.category === "EX" || s.category === "EW";
            return (
              <Link
                key={s.id}
                href={isExtinct ? `/extinct/${s.id}` : `/species/${s.id}`}
                className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 transition hover:border-zinc-300 hover:shadow-md"
              >
                <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-zinc-100">
                  {s.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.photo_url} alt={s.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[9px] text-zinc-400">—</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-zinc-900">{s.name}</p>
                  <p className="truncate text-[11px] italic text-zinc-500">{s.scientific_name}</p>
                </div>
                <span
                  className={`flex-shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-black ${
                    CAT_BG[s.category] ?? "bg-zinc-200 text-zinc-700"
                  }`}
                >
                  {s.category}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
