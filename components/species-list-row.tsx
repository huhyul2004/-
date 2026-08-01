import Link from "next/link";
import { CategoryBadge } from "./category-badge";
import { UrgencyBadge } from "./urgency-badge";
import type { SpeciesRow } from "@/lib/db";
import type { SpeciesWithTipping } from "@/lib/queries";

export function SpeciesListRow({ species }: { species: SpeciesRow | SpeciesWithTipping }) {
  const isExtinct = species.category === "EX" || species.category === "EW";
  const href = isExtinct ? `/extinct/${species.id}` : `/species/${species.id}`;
  const name = species.common_name_ko ?? species.common_name_en ?? species.scientific_name;
  const hasTipping = "intervention_tier" in species && species.intervention_tier;
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 transition hover:border-zinc-300 hover:bg-zinc-50"
    >
      <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-zinc-100">
        {species.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={species.photo_url} alt={name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[9px] text-zinc-400">—</div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-zinc-900">{name}</p>
        <p className="truncate text-[11px] italic text-zinc-500">
          {species.scientific_name}
          {species.class_name && <span className="not-italic text-zinc-400"> · {species.class_name}</span>}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {/* v5: 점수 산출 상태 */}
        {isExtinct ? (
          <span className="hidden rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-bold text-white sm:inline-flex">절멸</span>
        ) : hasTipping ? (
          <span className="hidden rounded-full bg-[#60C659]/15 px-2 py-0.5 text-[10px] font-bold text-[#2f7d33] sm:inline-flex">자체 분석</span>
        ) : (
          <span className="hidden rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500 sm:inline-flex">IUCN 등급만</span>
        )}
        {hasTipping && <UrgencyBadge species={species as SpeciesWithTipping} compact />}
        <CategoryBadge category={species.category} />
      </div>
    </Link>
  );
}
