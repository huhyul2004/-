import { notFound } from "next/navigation";
import Link from "next/link";
import { getSpeciesById, getThreats, getActions, getHabitats } from "@/lib/queries";
import { CategoryBadge } from "@/components/category-badge";
import { AIRecommend } from "@/components/ai-recommend";
import { AIChat } from "@/components/ai-chat";
import { FavoriteButton } from "@/components/favorite-button";

export const dynamic = "force-dynamic";

const CATEGORY_INFO: Record<string, { label: string; korean: string; description: string }> = {
  CR: { label: "위급", korean: "Critically Endangered", description: "야생에서 절멸할 가능성이 매우 높음" },
  EN: { label: "위기", korean: "Endangered", description: "야생에서 절멸할 가능성이 높음" },
  VU: { label: "취약", korean: "Vulnerable", description: "절멸 위험이 큰 상태" },
};

export default function SpeciesDetailPage({ params }: { params: { id: string } }) {
  const species = getSpeciesById(params.id);
  if (!species) notFound();
  if (species.category === "EX" || species.category === "EW") {
    // 절멸은 별도 페이지로
    return notFound();
  }

  const threats = getThreats(species.id) as { threat_name: string; severity: string | null }[];
  const actions = getActions(species.id) as { action_name: string }[];
  const habitats = getHabitats(species.id) as { habitat_name: string }[];
  const info = CATEGORY_INFO[species.category];
  const displayName =
    species.common_name_ko ?? species.common_name_en ?? species.scientific_name;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-zinc-500 transition hover:text-zinc-900"
      >
        ← 멸종위기 종 목록
      </Link>

      <header className="mb-6 grid gap-6 sm:grid-cols-[280px_1fr]">
        <div className="aspect-square w-full overflow-hidden rounded-2xl bg-zinc-100">
          {species.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={species.photo_url}
              alt={displayName}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-zinc-400">
              사진 준비 중
            </div>
          )}
        </div>
        <div className="flex flex-col">
          <div className="flex items-start justify-between gap-2">
            <CategoryBadge category={species.category} />
            <FavoriteButton id={species.id} name={displayName} />
          </div>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-zinc-900">{displayName}</h1>
          <p className="mt-1 text-sm italic text-zinc-500">{species.scientific_name}</p>
          {info && (
            <div className="mt-3 rounded-xl bg-zinc-50 p-3">
              <p className="text-xs font-bold text-zinc-700">
                {info.label} · {info.korean}
              </p>
              <p className="mt-1 text-xs text-zinc-600">{info.description}</p>
            </div>
          )}
          <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
            {species.class_name && (
              <div>
                <dt className="text-zinc-400">분류</dt>
                <dd className="font-medium text-zinc-900">{species.class_name}</dd>
              </div>
            )}
            {species.region && (
              <div>
                <dt className="text-zinc-400">서식 지역</dt>
                <dd className="font-medium text-zinc-900">{species.region}</dd>
              </div>
            )}
            {species.population_trend && (
              <div>
                <dt className="text-zinc-400">개체수 추세</dt>
                <dd className="font-medium text-zinc-900">{species.population_trend}</dd>
              </div>
            )}
            {species.mature_individuals && (
              <div>
                <dt className="text-zinc-400">성숙 개체</dt>
                <dd className="font-medium text-zinc-900">
                  {species.mature_individuals.toLocaleString()}마리
                </dd>
              </div>
            )}
          </dl>
        </div>
      </header>

      {species.summary_ko && (
        <section className="mb-8 rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-[10px] font-black tracking-wider text-zinc-500">요약</p>
          <p className="mt-2 text-sm leading-relaxed text-zinc-700">{species.summary_ko}</p>
        </section>
      )}

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-[10px] font-black tracking-wider text-[#D81E05]">위협</p>
          {threats.length === 0 ? (
            <p className="mt-2 text-xs text-zinc-400">데이터 없음</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {threats.map((t, i) => (
                <li key={i} className="text-xs text-zinc-700">
                  • {t.threat_name}
                  {t.severity && <span className="ml-1 text-zinc-400">({t.severity})</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-[10px] font-black tracking-wider text-[#60C659]">보전 활동</p>
          {actions.length === 0 ? (
            <p className="mt-2 text-xs text-zinc-400">데이터 없음</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {actions.map((a, i) => (
                <li key={i} className="text-xs text-zinc-700">
                  • {a.action_name}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-[10px] font-black tracking-wider text-zinc-700">서식지</p>
          {habitats.length === 0 ? (
            <p className="mt-2 text-xs text-zinc-400">데이터 없음</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {habitats.map((h, i) => (
                <li key={i} className="text-xs text-zinc-700">
                  • {h.habitat_name}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <section className="mb-8">
        <h2 className="mb-3 flex items-baseline gap-2">
          <span className="text-xs font-black tracking-wider text-[#D81E05]">AI</span>
          <span className="text-lg font-black text-zinc-900">보전 전략 제안</span>
        </h2>
        <AIRecommend speciesId={species.id} />
      </section>

      <section className="mb-8">
        <h2 className="mb-3 flex items-baseline gap-2">
          <span className="text-xs font-black tracking-wider text-[#FC7F3F]">CHAT</span>
          <span className="text-lg font-black text-zinc-900">궁금한 걸 물어보세요</span>
        </h2>
        <AIChat speciesId={species.id} />
      </section>
    </div>
  );
}
