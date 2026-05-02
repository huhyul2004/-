"use client";

import { useEffect, useState } from "react";

const KEY = "last-watch:favorites";

export function readFavorites(): { id: string; name: string }[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as { id: string; name: string }[]) : [];
  } catch {
    return [];
  }
}

function writeFavorites(list: { id: string; name: string }[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent("favorites:change"));
}

export function FavoriteButton({ id, name, dark = false }: { id: string; name: string; dark?: boolean }) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    setActive(readFavorites().some((f) => f.id === id));
  }, [id]);

  function toggle() {
    const list = readFavorites();
    const exists = list.some((f) => f.id === id);
    const next = exists ? list.filter((f) => f.id !== id) : [...list, { id, name }];
    writeFavorites(next);
    setActive(!exists);
  }

  const cls = active
    ? dark
      ? "border-[#FC7F3F] bg-[#FC7F3F] text-zinc-900"
      : "border-[#D81E05] bg-[#D81E05] text-white"
    : dark
      ? "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500"
      : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300";

  return (
    <button
      onClick={toggle}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition ${cls}`}
      aria-label={active ? "즐겨찾기 해제" : "즐겨찾기"}
    >
      <span className="text-sm leading-none">{active ? "★" : "☆"}</span>
      <span>{active ? "저장됨" : "즐겨찾기"}</span>
    </button>
  );
}
