import type { SpeciesRow } from "@/lib/db";

// 보전 성공 사례 판정:
// 1) population_trend 가 "증가"
// 2) category 가 VU 인데 과거 EN/CR 였던 종들 (예: 자이언트판다, 북극곰)
//    — population_trend == "증가" 이거나 conservation 관련 키워드 포함
export function isRecovering(s: SpeciesRow): boolean {
  if (!s.population_trend) return false;
  const trend = s.population_trend.toLowerCase();
  return trend.includes("증가") || trend.includes("회복") || trend.includes("성공");
}

export function RecoveryBadge({ species, dark = false }: { species: SpeciesRow; dark?: boolean }) {
  if (!isRecovering(species)) return null;
  const cls = dark
    ? "border-[#60C659]/40 bg-[#60C659]/10 text-[#9eea98]"
    : "border-[#60C659]/30 bg-[#60C659]/10 text-[#3a8836]";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${cls}`}
      title="개체수가 증가하거나 회복되고 있는 종"
    >
      ↑ 회복 중
    </span>
  );
}
