"use client";

// 계산 근거 페이지의 식 설명 툴팁 (2026-10-03, 적대적 검토 pages-1 반영).
// - 마우스를 올리면(hover)·키보드나 터치로 초점을 주면(focus)·누르면(고정) 열린다. Esc 나 바깥을 누르면 닫힌다.
// - 좁은 화면(sm 미만)에서는 줄(가장 가까운 relative 조상) 너비에 맞춰 펼친다 — 버튼 위치와 상관없이 화면 밖으로 나가지 않는다.
// - 버튼과 말풍선 사이에 틈이 없어(위쪽 안쪽 여백) 마우스를 말풍선 위로 옮겨도 닫히지 않는다 (WCAG 1.4.13).
import { useEffect, useRef, useState, type ReactNode } from "react";

export function FormulaTip({ id, children }: { id: string; children: ReactNode }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const open = hovered || focused || pinned;

  useEffect(() => {
    if (!open) return;
    const close = () => {
      setHovered(false);
      setFocused(false);
      setPinned(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <span
      ref={wrapRef}
      className="ml-1 inline-flex align-middle sm:relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        aria-describedby={`tip-${id}`}
        aria-expanded={open}
        aria-label="식 설명 보기"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onClick={() => setPinned((p) => !p)}
        className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border border-zinc-300 bg-white text-[10px] font-bold leading-none text-zinc-500 transition hover:border-zinc-500 hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FC7F3F]"
      >
        ?
      </button>
      <span
        role="tooltip"
        id={`tip-${id}`}
        className={`absolute left-0 right-0 top-full z-30 pt-1 sm:right-auto sm:w-[min(20rem,calc(100vw-3rem))] ${open ? "block" : "hidden"}`}
      >
        <span className="block whitespace-normal rounded-lg bg-zinc-900 px-3 py-2 text-left text-[11px] font-normal leading-relaxed text-white shadow-lg">
          {children}
        </span>
      </span>
    </span>
  );
}
