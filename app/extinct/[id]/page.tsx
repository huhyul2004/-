import { notFound } from "next/navigation";
import Link from "next/link";
import { getSpeciesById, getThreats } from "@/lib/queries";
import { CategoryBadge } from "@/components/category-badge";
import { AIRetrospective } from "@/components/ai-retrospective";
import { AIChat } from "@/components/ai-chat";
import { FavoriteButton } from "@/components/favorite-button";

export const dynamic = "force-dynamic";

export default function ExtinctDetailPage({ params }: { params: { id: string } }) {
  const species = getSpeciesById(params.id);
  if (!species) notFound();
  if (species.category !== "EX" && species.category !== "EW") {
    return notFound();
  }
  const threats = getThreats(species.id) as { threat_name: string }[];
  const displayName =
    species.common_name_ko ?? species.common_name_en ?? species.scientific_name;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <Link
          href="/extinct"
          className="mb-4 inline-flex items-center gap-1.5 text-xs text-zinc-500 transition hover:text-zinc-200"
        >
          ← 절멸 종 목록
        </Link>

        <header className="mb-8 grid gap-6 sm:grid-cols-[280px_1fr]">
          <div className="aspect-square w-full overflow-hidden rounded-2xl bg-zinc-900 grayscale">
            {species.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={species.photo_url}
                alt={displayName}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-zinc-600">
                사진 없음
              </div>
            )}
          </div>
          <div>
            <div className="flex items-start justify-between gap-2">
              <CategoryBadge category={species.category} />
              <FavoriteButton id={species.id} name={displayName} dark />
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-zinc-50">{displayName}</h1>
            <p className="mt-1 text-sm italic text-zinc-500">{species.scientific_name}</p>
            <p className="mt-3 text-xs font-bold tracking-widest text-zinc-500">
              {species.category === "EX" ? "EXTINCT · 절멸" : "EXTINCT IN THE WILD · 야생절멸"}
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
              {species.extinction_year && (
                <div>
                  <dt className="text-zinc-500">절멸 시기</dt>
                  <dd className="font-medium text-zinc-100">{species.extinction_year}년</dd>
                </div>
              )}
              {species.class_name && (
                <div>
                  <dt className="text-zinc-500">분류</dt>
                  <dd className="font-medium text-zinc-100">{species.class_name}</dd>
                </div>
              )}
              {species.region && (
                <div className="col-span-2">
                  <dt className="text-zinc-500">서식 지역</dt>
                  <dd className="font-medium text-zinc-100">{species.region}</dd>
                </div>
              )}
              {species.extinction_cause && (
                <div className="col-span-2">
                  <dt className="text-zinc-500">절멸 원인</dt>
                  <dd className="font-medium text-zinc-100">{species.extinction_cause}</dd>
                </div>
              )}
            </dl>
          </div>
        </header>

        {species.summary_ko && (
          <section className="mb-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <p className="text-[10px] font-black tracking-wider text-zinc-500">요약</p>
            <p className="mt-2 text-sm leading-relaxed text-zinc-300">{species.summary_ko}</p>
          </section>
        )}

        {threats.length > 0 && (
          <section className="mb-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <p className="text-[10px] font-black tracking-wider text-[#D81E05]">위협 요인</p>
            <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {threats.map((t, i) => (
                <li key={i} className="text-xs text-zinc-400">
                  • {t.threat_name}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mb-8">
          <h2 className="mb-3 flex items-baseline gap-2">
            <span className="text-xs font-black tracking-wider text-zinc-500">AI</span>
            <span className="text-lg font-black text-zinc-100">결정적 순간 회고</span>
          </h2>
          <AIRetrospective speciesId={species.id} />
        </section>

        <section className="mb-8">
          <h2 className="mb-3 flex items-baseline gap-2">
            <span className="text-xs font-black tracking-wider text-[#FC7F3F]">CHAT</span>
            <span className="text-lg font-black text-zinc-100">이 종에 대해 묻기</span>
          </h2>
          <AIChat speciesId={species.id} dark />
        </section>
      </div>
    </div>
  );
}
