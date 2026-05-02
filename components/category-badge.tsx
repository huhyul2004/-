import { cn } from "@/lib/utils";

const CATEGORY_META: Record<string, { label: string; ko: string; bg: string; fg: string }> = {
  EX: { label: "EX", ko: "절멸", bg: "bg-black", fg: "text-white" },
  EW: { label: "EW", ko: "야생절멸", bg: "bg-zinc-700", fg: "text-white" },
  CR: { label: "CR", ko: "위급", bg: "bg-[#D81E05]", fg: "text-white" },
  EN: { label: "EN", ko: "위기", bg: "bg-[#FC7F3F]", fg: "text-white" },
  VU: { label: "VU", ko: "취약", bg: "bg-[#F9E814]", fg: "text-zinc-900" },
  NT: { label: "NT", ko: "준위협", bg: "bg-[#CCE226]", fg: "text-zinc-900" },
  LC: { label: "LC", ko: "관심대상", bg: "bg-[#60C659]", fg: "text-white" },
  DD: { label: "DD", ko: "정보부족", bg: "bg-zinc-400", fg: "text-white" },
  NE: { label: "NE", ko: "미평가", bg: "bg-zinc-300", fg: "text-zinc-900" },
};

export function CategoryBadge({ category, className }: { category: string; className?: string }) {
  const meta = CATEGORY_META[category] ?? CATEGORY_META.NE;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wide",
        meta.bg,
        meta.fg,
        className
      )}
      title={`${meta.label} — ${meta.ko}`}
    >
      <span>{meta.label}</span>
      <span className="opacity-90">·</span>
      <span className="font-medium">{meta.ko}</span>
    </span>
  );
}
