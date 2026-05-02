"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { readFavorites } from "./favorite-button";

const ITEMS = [
  { href: "/", label: "현재", icon: "🌿" },
  { href: "/extinct", label: "반성", icon: "🕯" },
  { href: "/stats", label: "통계", icon: "📊" },
  { href: "/favorites", label: "즐겨찾기", icon: "★" },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  const [favCount, setFavCount] = useState(0);

  useEffect(() => {
    const update = () => setFavCount(readFavorites().length);
    update();
    window.addEventListener("favorites:change", update);
    return () => window.removeEventListener("favorites:change", update);
  }, []);

  return (
    <nav
      aria-label="모바일 네비"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
    >
      <div className="grid grid-cols-4">
        {ITEMS.map((it) => {
          const active = pathname === it.href || (it.href !== "/" && pathname.startsWith(it.href));
          return (
            <Link
              key={it.href}
              href={it.href}
              className={
                "relative flex min-h-[56px] flex-col items-center justify-center gap-1 text-[10px] font-bold transition " +
                (active ? "text-[#D81E05]" : "text-zinc-500 hover:text-zinc-900")
              }
            >
              <span className="text-base leading-none">{it.icon}</span>
              <span>{it.label}</span>
              {it.href === "/favorites" && favCount > 0 && (
                <span className="absolute right-[28%] top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#D81E05] px-1 text-[9px] font-black text-white">
                  {favCount}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
