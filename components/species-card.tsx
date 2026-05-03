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
  return (
    <Link
      href={href}
      className="group block overflow-hidden rounded-2xl border border-zinc-200 bg-white transition-all hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-zinc-100">
        {species.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={species.photo_url}
            alt={species.common_name_ko ?? species.scientific_name}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-zinc-400">
            사진 준비 중
          </div>
        )}
        <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
          <CategoryBadge category={species.category} />
          <RecoveryBadge species={species} />
        </div>
        {hasTipping && (
          <div className="absolute right-3 top-3">
            <UrgencyBadge species={species as SpeciesWithTipping} compact />
          </div>
        )}
      </div>
      <div className="space-y-1.5 p-4">
        <h3 className="font-bold text-zinc-900">
          {species.common_name_ko ?? species.common_name_en ?? species.scientific_name}
        </h3>
        <p className="text-xs italic text-zinc-500">{species.scientific_name}</p>
        {species.summary_ko && (
          <p className="line-clamp-2 pt-1 text-xs leading-relaxed text-zinc-600">
            {species.summary_ko}
          </p>
        )}
        <div className="flex items-center gap-2 pt-2 text-[11px] text-zinc-400">
          {species.class_name && <span>{species.class_name}</span>}
          {species.region && (
            <>
              <span>·</span>
              <span className="truncate">{species.region}</span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}
