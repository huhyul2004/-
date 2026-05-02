import { listExtinctSpecies } from "@/lib/queries";
import { SpeciesCard } from "@/components/species-card";

export const dynamic = "force-dynamic";

export default function ExtinctPage() {
  const species = listExtinctSpecies();
  return (
    <div className="bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <section className="mb-10 border-b border-zinc-800 pb-8">
          <p className="text-xs font-bold tracking-widest text-zinc-500">REFLECTION · 반성</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-zinc-50 sm:text-4xl">
            이미 사라진 종들
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">
            여기 적힌 종들은 다시 만날 수 없습니다. 우리가 무엇을 했어야 했는지, 결정적 순간은
            언제였는지, 왜 막지 못했는지를 돌아봅니다.
          </p>
        </section>

        {species.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 py-16 text-center text-sm text-zinc-500">
            데이터를 불러오지 못했습니다.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {species.map((s) => (
              <div key={s.id} className="contents [&_a]:!bg-zinc-900 [&_a]:!border-zinc-800 [&_h3]:!text-zinc-100 [&_p]:!text-zinc-400">
                <SpeciesCard species={s} />
              </div>
            ))}
          </div>
        )}

        <p className="mt-10 text-[11px] text-zinc-600">
          데이터 출처: IUCN Red List · Wikipedia · 큐레이션 데이터셋
        </p>
      </div>
    </div>
  );
}
