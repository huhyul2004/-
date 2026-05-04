"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { readFavorites } from "./favorite-button";

export function HeaderNav() {
  const [favCount, setFavCount] = useState(0);

  useEffect(() => {
    const update = () => setFavCount(readFavorites().length);
    update();
    window.addEventListener("favorites:change", update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener("favorites:change", update);
      window.removeEventListener("storage", update);
    };
  }, []);

  return (
    <nav className="flex items-center gap-1 text-sm font-medium">
      <Link
        href="/"
        className="rounded-full px-3 py-1.5 text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900"
      >
        현재
      </Link>
      <Link
        href="/extinct"
        className="rounded-full px-3 py-1.5 text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900"
      >
        반성
      </Link>
      <Link
        href="/stats"
        className="rounded-full px-3 py-1.5 text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900"
      >
        통계
      </Link>
      <Link
        href="/quality"
        className="rounded-full px-3 py-1.5 text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900"
      >
        검증
      </Link>
      <Link
        href="/favorites"
        className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900"
      >
        <span>즐겨찾기</span>
        {favCount > 0 && (
          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#D81E05] px-1 text-[10px] font-black text-white">
            {favCount}
          </span>
        )}
      </Link>
    </nav>
  );
}
