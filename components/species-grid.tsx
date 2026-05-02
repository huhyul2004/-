"use client";

import { SpeciesCard } from "./species-card";
import { SpeciesListRow } from "./species-list-row";
import { ViewToggle, useViewMode } from "./view-toggle";
import type { SpeciesRow } from "@/lib/db";

export function SpeciesGrid({ species, defaultView = "card" }: { species: SpeciesRow[]; defaultView?: "card" | "list" }) {
  const [mode, setMode] = useViewMode();
  const view = mode ?? defaultView;
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <ViewToggle value={view} onChange={setMode} />
      </div>
      {view === "card" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {species.map((s) => (
            <SpeciesCard key={s.id} species={s} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {species.map((s) => (
            <SpeciesListRow key={s.id} species={s} />
          ))}
        </div>
      )}
    </div>
  );
}
