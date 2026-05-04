import Link from "next/link";
import { CategoryBadge } from "./category-badge";
import { RecoveryBadge } from "./recovery-badge";
import { UrgencyBadge } from "./urgency-badge";
import type { SpeciesRow } from "@/lib/db";
import type { SpeciesWithTipping } from "@/lib/queries";

export function SpeciesCard({ species }: { species: SpeciesRow | SpeciesWithTipping }) {
  const isExtinct = species.category === "EX" || species.category === "EW";
  const href = isExtinct ? `/extinct/${species.id}` : `/species/${species.id}`;
  const hasTipping = "intervention_tier" in species && species.intervention_tier;
  const isCritical = "intervention_tier" in species && (species.intervention_tier === "T3" || species.intervention_tier === "T4");
  const displayName = species.common_name_ko ?? species.common_name_en ?? species.scientific_name;

  return (
    <Link
      href={href}
      className={
        "group relative block overflow-hidden rounded-3xl border bg-white transition-all duration-500 hover:-translate-y-1 hover:shadow-2xl hover:shadow-zinc-900/10 " +
        (isCritical ? "border-[#FC7F3F]/30 hover:border-[#FC7F3F]/60" : "border-zinc-200/80 hover:border-zinc-300")
      }
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-zinc-100 to-zinc-200">
        {species.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={species.photo_url}
            alt={displayName}
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <div className="text-center">
              <div className="mx-auto mb-1 inline-block h-8 w-8 rounded-full bg-zinc-200" />
              <p className="text-[10px] tracking-wider text-zinc-400">NO IMAGE</p>
            </div>
          </div>
        )}
        {/* Gradient overlay at bottom for legibility */}
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/40 via-black/10 to-transparent" />

        {/* Top-left badges */}
        <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
          <CategoryBadge category={species.category} />
          <RecoveryBadge species={species} />
        </div>

        {/* Top-right urgency */}
        {hasTipping && (
          <div className="absolute right-3 top-3">
            <UrgencyBadge species={species as SpeciesWithTipping} compact />
          </div>
        )}

        {/* Bottom: name overlay on image */}
        <div className="absolute inset-x-0 bottom-0 p-4">
          <h3 className="text-balance text-lg font-black leading-tight tracking-tight text-white drop-shadow-lg">
            {displayName}
          </h3>
          <p className="mt-0.5 text-[11px] italic text-white/80 drop-shadow">{species.scientific_name}</p>
        </div>
      </div>

      <div className="space-y-2 p-4">
        {species.summary_ko && (
          <p className="line-clamp-3 text-[12.5px] leading-relaxed text-zinc-600">
            {species.summary_ko}
          </p>
        )}
        <div className="flex items-center gap-2 pt-1 text-[10px] tracking-wide text-zinc-400">
          {species.class_name && (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-bold text-zinc-600">
              {species.class_name}
            </span>
          )}
          {species.region && (
            <span className="truncate">{species.region}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
