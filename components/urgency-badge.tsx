// 카드/리스트에 들어갈 시급도 배지 — Tier + 마감일까지 남은 시간
import type { SpeciesWithTipping } from "@/lib/queries";

const TIER_COLORS: Record<string, { bg: string; text: string; ring: string }> = {
  T0: { bg: "bg-[#60C659]", text: "text-white", ring: "ring-[#60C659]/30" },
  T1: { bg: "bg-[#CCE226]", text: "text-zinc-900", ring: "ring-[#CCE226]/30" },
  T2: { bg: "bg-[#F9E814]", text: "text-zinc-900", ring: "ring-[#F9E814]/30" },
  T3: { bg: "bg-[#FC7F3F]", text: "text-white", ring: "ring-[#FC7F3F]/40" },
  T4: { bg: "bg-[#D81E05]", text: "text-white", ring: "ring-[#D81E05]/40" },
  EX: { bg: "bg-zinc-900", text: "text-white", ring: "ring-zinc-700" },
};

function urgencyText(s: SpeciesWithTipping): string {
  if (s.intervention_tier === "EX") return "이미 절멸";
  if (s.deadline_days == null) return "—";
  if (s.deadline_days <= 0) return "지금 즉시";
  if (s.deadline_days < 365) return `${s.deadline_days}일 남음`;
  const years = (s.deadline_days / 365).toFixed(1);
  return `${years}년 남음`;
}

export function UrgencyBadge({
  species,
  compact = false,
  dark = false,
}: {
  species: SpeciesWithTipping;
  compact?: boolean;
  dark?: boolean;
}) {
  const tier = species.intervention_tier ?? "T0";
  const c = TIER_COLORS[tier] ?? TIER_COLORS.T0;
  const text = urgencyText(species);

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-black ${c.bg} ${c.text}`}>
        {tier}
        <span className="opacity-80">· {text}</span>
      </span>
    );
  }

  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${c.bg} ${c.text}`}>
      <span>{tier}</span>
      <span className="opacity-80">·</span>
      <span>{text}</span>
    </div>
  );
}
