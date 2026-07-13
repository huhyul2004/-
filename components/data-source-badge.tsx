import { cn } from "@/lib/utils";

// 데이터 출처 배지 — 기존 888/1030 자체분석 종 vs 신규 PHYLACINE(IUCN 등급만) 구분.
//   lastwatch_original → "자체 분석" (자체 위험도 계산 적용됨)
//   phylacine_curated  → "IUCN 등급 기준" (자체 계산 미적용, IUCN 등급만)
//   bulk_import/기타    → 배지 없음
const META: Record<string, { label: string; bg: string; fg: string; title: string }> = {
  lastwatch_original: {
    label: "자체 분석",
    bg: "bg-zinc-900",
    fg: "text-white",
    title: "LastWatch 자체 위험도 계산(EWS-PVA-IUCN)이 적용된 종",
  },
  phylacine_curated: {
    label: "IUCN 등급 기준",
    bg: "bg-[#CCE226]",
    fg: "text-zinc-900",
    title: "IUCN 등급으로만 분류된 종 — LastWatch 자체 위험도 계산은 적용되지 않음",
  },
};

export function DataSourceBadge({ dataSource, className }: { dataSource?: string | null; className?: string }) {
  const meta = dataSource ? META[dataSource] : undefined;
  if (!meta) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide",
        meta.bg,
        meta.fg,
        className
      )}
      title={meta.title}
    >
      {meta.label}
    </span>
  );
}
