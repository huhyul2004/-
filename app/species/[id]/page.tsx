import { notFound } from "next/navigation";
import Link from "next/link";
import { getSpeciesById, getThreats, getActions, getHabitats, getTippingPoint } from "@/lib/queries";
import { CategoryBadge } from "@/components/category-badge";
import { AIRecommend } from "@/components/ai-recommend";
import { AIChat } from "@/components/ai-chat";
import { FavoriteButton } from "@/components/favorite-button";
import { TippingTimeline } from "@/components/tipping-timeline";
import { TippingHero } from "@/components/tipping-hero";
import { CommentSection } from "@/components/comment-section";
import { inferPopulationWithSource, type PopulationSource } from "@/lib/tipping-point";
import type { TippingPointResult } from "@/lib/tipping-point";

export const dynamic = "force-dynamic";

const CATEGORY_INFO: Record<string, { label: string; korean: string; description: string }> = {
  CR: { label: "위급", korean: "Critically Endangered", description: "야생에서 절멸할 가능성이 매우 높음" },
  EN: { label: "위기", korean: "Endangered", description: "야생에서 절멸할 가능성이 높음" },
  VU: { label: "취약", korean: "Vulnerable", description: "절멸 위험이 큰 상태" },
};

const POP_SOURCE_LABEL: Record<PopulationSource, string> = {
  mature_individuals: "실측 성숙 개체수 (큐레이션)",
  iucn_population_size: "IUCN 명시 개체수",
  data_insufficient: "데이터 부족",
};

function formatMass(g: number): string {
  if (g >= 1_000_000) return `${(g / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}t`;
  if (g >= 1000) return `${(g / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}kg`;
  return `${Math.round(g).toLocaleString()}g`;
}

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
  const tipping = getTippingPoint(species.id);
  const pop = inferPopulationWithSource(species);
  const info = CATEGORY_INFO[species.category];
  const displayName =
    species.common_name_ko ?? species.common_name_en ?? species.scientific_name;

  return (
    <div className="mx-auto max-w-4xl px-4 py-5 sm:py-8">
      <Link
        href="/"
        className="mb-4 inline-flex min-h-[40px] items-center gap-1.5 text-xs text-zinc-500 transition hover:text-zinc-900"
      >
        ← 멸종위기 종 목록
      </Link>

      <header className="mb-6 grid gap-4 sm:gap-6 sm:grid-cols-[280px_1fr]">
        <div>
          <div className="aspect-[4/3] w-full overflow-hidden rounded-2xl bg-zinc-100 sm:aspect-square">
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
          {species.photo_source === "inaturalist" && species.photo_attribution && (
            <p className="mt-1 text-[10px] leading-tight text-zinc-400">사진: {species.photo_attribution} (iNaturalist)</p>
          )}
        </div>
        <div className="flex flex-col">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <CategoryBadge category={species.category} />
              {tipping ? (
                <span className="inline-flex items-center rounded-full bg-[#60C659]/15 px-2.5 py-0.5 text-[11px] font-bold text-[#2f7d33]">
                  자체 분석
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-[11px] font-bold text-zinc-500">
                  IUCN 등급 정보만 제공
                </span>
              )}
            </div>
            <FavoriteButton id={species.id} name={displayName} />
          </div>
          <h1 className="mt-3 text-2xl font-black leading-tight tracking-tight text-zinc-900 sm:text-3xl">{displayName}</h1>
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
            {species.mass_g != null && (
              <div>
                <dt className="text-zinc-400">평균 체중</dt>
                <dd className="font-medium text-zinc-900">{formatMass(species.mass_g)}</dd>
              </div>
            )}
            {species.order_name && (
              <div>
                <dt className="text-zinc-400">목 (Order)</dt>
                <dd className="font-medium text-zinc-900">{species.order_name}</dd>
              </div>
            )}
            {species.family_name && (
              <div>
                <dt className="text-zinc-400">과 (Family)</dt>
                <dd className="font-medium text-zinc-900">{species.family_name}</dd>
              </div>
            )}
          </dl>
        </div>
      </header>

      {!tipping && (
        <section className="mb-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
          <p className="text-xs font-bold text-zinc-800">ℹ️ IUCN 등급 정보만 제공</p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-600">
            이 종은 <b>실측 개체수 데이터가 없어</b> LastWatch 자체 위험 점수를 산출하지 않습니다.
            아래 IUCN 등급·분류 정보만 제공합니다. (v5: 위험 점수는 실측 개체수로만 계산하며,
            IUCN 등급 기반 추정은 하지 않습니다.)
          </p>
        </section>
      )}

      {tipping && (
        <section className="mb-6 rounded-2xl border border-zinc-200 bg-zinc-50/60 p-4">
          <h2 className="text-sm font-bold text-zinc-800">계산 근거</h2>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-zinc-400">개체수 (N₀)</dt>
              <dd className="font-medium text-zinc-900">
                {pop.value?.toLocaleString() ?? "—"}마리
                <span className="ml-1.5 rounded bg-zinc-200 px-1.5 py-0.5 text-[11px] font-normal text-zinc-600">
                  {POP_SOURCE_LABEL[pop.source]}
                </span>
              </dd>
            </div>
            {species.mass_g != null && (
              <div>
                <dt className="text-zinc-400">성체 체중</dt>
                <dd className="font-medium text-zinc-900">{formatMass(species.mass_g)}</dd>
              </div>
            )}
            {species.iucn_criteria && (
              <div>
                <dt className="text-zinc-400">IUCN 평가 기준</dt>
                <dd className="font-mono text-xs font-medium text-zinc-900">{species.iucn_criteria}</dd>
              </div>
            )}
            {species.iucn_population_trend && (
              <div>
                <dt className="text-zinc-400">IUCN 개체수 추세</dt>
                <dd className="font-medium text-zinc-900">{species.iucn_population_trend}</dd>
              </div>
            )}
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-zinc-500">
            위기점수 = EWS · PVA · 유효개체군(Ne) 3-레이어 합의. 개체수 N₀는 <b>실측값(수기·IUCN 명시)만</b>
            사용하며, IUCN 등급/Criterion 기반 추정은 하지 않습니다(v5). 위 배지가 이 종의 실제 개체수 출처입니다.
          </p>
        </section>
      )}

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

      {tipping && (
        <section className="mb-8">
          <TippingHero result={tipping.payload as TippingPointResult} />
        </section>
      )}

      {tipping && (
        <section className="mb-8">
          <h2 className="mb-3 flex items-baseline gap-2">
            <span className="text-xs font-black tracking-wider text-[#D81E05]">DETAIL</span>
            <span className="text-lg font-black text-zinc-900">상세 분석 · PVA 통계</span>
          </h2>
          <TippingTimeline result={tipping.payload as TippingPointResult} />
        </section>
      )}

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

      <CommentSection speciesId={species.id} />
    </div>
  );
}
