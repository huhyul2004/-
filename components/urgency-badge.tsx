// 카드/리스트에 들어갈 시급도 배지 — Tier + 마감일까지 남은 시간
import type { SpeciesWithTipping } from "@/lib/queries";

const TIER_STYLE: Record<string, { glass: string; text: string; pulse?: boolean }> = {
  T0: { glass: "bg-[#60C659]/90 backdrop-blur-md", text: "text-white" },
  T1: { glass: "bg-[#CCE226]/95 backdrop-blur-md", text: "text-zinc-900" },
  T2: { glass: "bg-[#F9E814]/95 backdrop-blur-md", text: "text-zinc-900" },
  T3: { glass: "bg-[#FC7F3F]/95 backdrop-blur-md", text: "text-white", pulse: true },
  T4: { glass: "bg-[#D81E05]/95 backdrop-blur-md", text: "text-white", pulse: true },
  EX: { glass: "bg-zinc-900/85 backdrop-blur-md", text: "text-zinc-100" },
};

function urgencyText(s: SpeciesWithTipping): string {
  if (s.intervention_tier === "EX") return "절멸";
  if (s.deadline_days == null) return "—";
  if (s.deadline_days <= 0) return "지금 즉시";
  if (s.deadline_days < 365) return `${s.deadline_days}일`;
  const years = (s.deadline_days / 365).toFixed(1);
  return `${years}년`;
}

export function UrgencyBadge({
  species,
  compact = false,
}: {
  species: SpeciesWithTipping;
  compact?: boolean;
}) {
  const tier = species.intervention_tier ?? "T0";
  const style = TIER_STYLE[tier] ?? TIER_STYLE.T0;
  const text = urgencyText(species);

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-black tabular-nums shadow-md ${style.glass} ${style.text}`}
      >
        {style.pulse && (
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
          </span>
        )}
        <span className="font-mono tracking-wider">{tier}</span>
        <span className="opacity-70">·</span>
        <span>{text}</span>
      </span>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-black shadow-md ${style.glass} ${style.text}`}
    >
      {style.pulse && (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
        </span>
      )}
      <span className="font-mono tracking-wider">{tier}</span>
      <span className="opacity-70">·</span>
      <span>{text}</span>
    </div>
  );
}
