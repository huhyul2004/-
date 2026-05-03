import { listAtRiskSpecies, listClasses, countByCategory, countByClass, type SortKey } from "@/lib/queries";
import { SpeciesGrid } from "@/components/species-grid";
import { SearchBar } from "@/components/search-bar";
import { SortSelector } from "@/components/sort-selector";
import Link from "next/link";

export const dynamic = "force-dynamic";

const CATEGORY_TILES = [
  { value: undefined, label: "전체", korean: "All", color: "bg-zinc-900", accent: "bg-zinc-900" },
  { value: "CR", label: "위급", korean: "Critically Endangered", color: "bg-[#D81E05]", accent: "bg-[#D81E05]" },
  { value: "EN", label: "위기", korean: "Endangered", color: "bg-[#FC7F3F]", accent: "bg-[#FC7F3F]" },
  { value: "VU", label: "취약", korean: "Vulnerable", color: "bg-[#F9E814]", accent: "bg-[#F9E814]" },
] as const;

const VALID_SORTS: SortKey[] = ["urgency", "risk", "name", "recent", "class"];

export default function HomePage({
  searchParams,
}: {
  searchParams?: { category?: string; class?: string; sort?: string };
}) {
  const sort = (VALID_SORTS as string[]).includes(searchParams?.sort ?? "")
    ? (searchParams!.sort as SortKey)
    : "urgency";
  const species = listAtRiskSpecies({
    category: searchParams?.category,
    className: searchParams?.class,
    sort,
  });
  const classes = listClasses();
  const catCounts = countByCategory();
  const classCounts = countByClass(false);
  const totalAtRisk = (catCounts.CR ?? 0) + (catCounts.EN ?? 0) + (catCounts.VU ?? 0);
  const activeCat = searchParams?.category;
  const activeClass = searchParams?.class;

  function buildHref(opts: { cat?: string | null; cls?: string | null; sort?: string | null }) {
    const params = new URLSearchParams();
    const newCat = opts.cat === null ? undefined : opts.cat ?? activeCat;
    const newCls = opts.cls === null ? undefined : opts.cls ?? activeClass;
    const newSort = opts.sort === null ? undefined : opts.sort ?? (sort !== "urgency" ? sort : undefined);
    if (newCat) params.set("category", newCat);
    if (newCls) params.set("class", newCls);
    if (newSort) params.set("sort", newSort);
    const q = params.toString();
    return q ? `/?${q}` : "/";
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <section className="mb-8">
        <p className="text-xs font-bold tracking-widest text-[#D81E05]">CURRENT · 현재</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-zinc-900 sm:text-4xl">
          지금 이 순간, 사라지고 있는 종들
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-600">
          IUCN Red List 의 위급(CR), 위기(EN), 취약(VU) 등급에 등재된 종들입니다. 카드를 눌러 위협
          요인과 보전 계획, AI가 제안하는 개입 전략을 확인해 보세요.
        </p>
      </section>

      <section className="mb-6">
        <SearchBar />
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-bold text-zinc-700">멸종위기 등급으로 보기</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {CATEGORY_TILES.map((tile) => {
            const active = (tile.value ?? null) === (activeCat ?? null);
            const count = tile.value ? (catCounts[tile.value] ?? 0) : totalAtRisk;
            const isYellow = tile.value === "VU";
            const textColor = active ? (isYellow ? "text-zinc-900" : "text-white") : "text-zinc-900";
            const subColor = active ? (isYellow ? "text-zinc-700" : "text-white/80") : "text-zinc-400";
            return (
              <Link
                key={tile.value ?? "all"}
                href={buildHref({ cat: tile.value ?? null })}
                className={
                  "group relative overflow-hidden rounded-2xl border p-4 transition-all " +
                  (active
                    ? `${tile.color} border-transparent shadow-md`
                    : "border-zinc-200 bg-white hover:-translate-y-0.5 hover:shadow-md")
                }
              >
                {!active && (
                  <span className={`absolute left-0 top-0 h-full w-1 ${tile.accent}`} aria-hidden />
                )}
                <div className={`flex items-baseline gap-2 ${textColor}`}>
                  {tile.value && (
                    <span className="text-xs font-black tracking-wider opacity-80">{tile.value}</span>
                  )}
                  <span className="text-base font-bold">{tile.label}</span>
                </div>
                <p className={`mt-1 text-[11px] ${subColor}`}>{tile.korean}</p>
                <p className={`mt-3 text-2xl font-black ${textColor}`}>
                  {count}
                  <span className="ml-1 text-xs font-medium opacity-70">종</span>
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      {classes.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-bold text-zinc-700">생물 분류로 보기</h2>
          <div className="flex flex-wrap gap-2">
            <Link
              href={buildHref({ cls: null })}
              className={
                "rounded-xl border px-4 py-2.5 text-sm font-medium transition " +
                (!activeClass
                  ? "border-zinc-900 bg-zinc-900 text-white shadow-sm"
                  : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50")
              }
            >
              전체
              <span className="ml-1.5 text-xs opacity-70">{totalAtRisk}</span>
            </Link>
            {classes.map((c) => {
              const active = activeClass === c;
              const count = classCounts[c] ?? 0;
              return (
                <Link
                  key={c}
                  href={buildHref({ cls: c })}
                  className={
                    "rounded-xl border px-4 py-2.5 text-sm font-medium transition " +
                    (active
                      ? "border-zinc-900 bg-zinc-900 text-white shadow-sm"
                      : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50")
                  }
                >
                  {c}
                  <span className="ml-1.5 text-xs opacity-70">{count}</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium text-zinc-700">
          <span className="font-black text-zinc-900">{species.length}</span>종이 표시되고 있어요
          {activeCat && <span className="ml-2 text-xs text-zinc-500">· 등급 {activeCat}</span>}
          {activeClass && <span className="ml-2 text-xs text-zinc-500">· {activeClass}</span>}
        </p>
        <div className="flex items-center gap-3">
          <SortSelector
            value={sort}
            hrefs={{
              urgency: buildHref({ sort: null }),
              risk: buildHref({ sort: "risk" }),
              name: buildHref({ sort: "name" }),
              recent: buildHref({ sort: "recent" }),
              class: buildHref({ sort: "class" }),
            }}
          />
          {(activeCat || activeClass) && (
            <Link href="/" className="text-xs font-medium text-zinc-500 hover:text-zinc-900">
              필터 초기화
            </Link>
          )}
        </div>
      </div>

      {species.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-200 bg-white py-16 text-center text-sm text-zinc-500">
          조건에 해당하는 종이 없습니다.
        </div>
      ) : (
        <SpeciesGrid species={species} />
      )}

      <p className="mt-10 text-[11px] text-zinc-400">
        데이터 출처: IUCN Red List · Wikidata · Wikipedia — 표시 데이터는 큐레이션 본 + 자동 수집된
        공개 정보의 결합입니다.
      </p>
    </div>
  );
}
