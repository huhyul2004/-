import { listAtRiskSpecies, listClasses, countByCategory, countByClass, countUnclassified, PAGE_SIZE, type SortKey } from "@/lib/queries";
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
  searchParams?: { category?: string; class?: string; sort?: string; page?: string };
}) {
  const sort = (VALID_SORTS as string[]).includes(searchParams?.sort ?? "")
    ? (searchParams!.sort as SortKey)
    : "urgency";
  const currentPage = Math.max(1, parseInt(searchParams?.page ?? "1") || 1);
  const { rows: species, total } = listAtRiskSpecies({
    category: searchParams?.category,
    className: searchParams?.class,
    sort,
    page: currentPage,
  });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const classes = listClasses();
  const catCounts = countByCategory();
  const classCounts = countByClass(false);
  const unclassifiedCount = countUnclassified(false);
  const totalAtRisk = (catCounts.CR ?? 0) + (catCounts.EN ?? 0) + (catCounts.VU ?? 0);
  const activeCat = searchParams?.category;
  const activeClass = searchParams?.class;

  function buildHref(opts: { cat?: string | null; cls?: string | null; sort?: string | null; page?: number | null }) {
    const params = new URLSearchParams();
    const newCat = opts.cat === null ? undefined : opts.cat ?? activeCat;
    const newCls = opts.cls === null ? undefined : opts.cls ?? activeClass;
    const newSort = opts.sort === null ? undefined : opts.sort ?? (sort !== "urgency" ? sort : undefined);
    // 필터/정렬 변경시 page 자동 리셋. opts.page 명시한 경우만 유지
    const newPage = opts.page;
    if (newCat) params.set("category", newCat);
    if (newCls) params.set("class", newCls);
    if (newSort) params.set("sort", newSort);
    if (newPage && newPage > 1) params.set("page", String(newPage));
    const q = params.toString();
    return q ? `/?${q}` : "/";
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-14">
      <section className="mb-10 sm:mb-12">
        <div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.25em] text-[#D81E05] sm:text-[11px]">
          <span className="inline-block h-px w-8 bg-[#D81E05]" />
          CURRENT · 현재
        </div>
        <h1 className="mt-4 text-balance text-3xl font-black leading-[1.1] tracking-tight text-zinc-900 sm:text-5xl md:text-6xl">
          지금 이 순간,<br />
          <span className="bg-gradient-to-r from-[#D81E05] via-[#FC7F3F] to-[#F9E814] bg-clip-text text-transparent">
            사라지고 있는 종들
          </span>
        </h1>
        <p className="mt-5 max-w-2xl text-pretty text-[14px] leading-relaxed text-zinc-600 sm:text-[15px]">
          IUCN Red List 의 <span className="font-bold text-[#D81E05]">위급(CR)</span>,
          <span className="font-bold text-[#FC7F3F]"> 위기(EN)</span>,
          <span className="font-bold text-[#a18f0c]"> 취약(VU)</span> 등급에 등재된 종들입니다.
          카드를 눌러 위협 요인과 보전 계획, AI가 제안하는 개입 전략과 임계점 연표를 확인해 보세요.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] text-zinc-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#D81E05]" />
            <span className="font-bold text-zinc-900">{totalAtRisk}</span>종 추적
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-zinc-900" />
            EWS-PVA-IUCN Hybrid 엔진
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#60C659]" />
            매일 업데이트
          </span>
        </div>
      </section>

      <section className="mb-6">
        <SearchBar />
      </section>

      <section className="mb-8">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-[11px] font-black tracking-[0.2em] text-zinc-500">CATEGORIES · 등급</h2>
          <span className="text-[10px] tracking-wider text-zinc-400">IUCN Red List v3.1</span>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
          {CATEGORY_TILES.map((tile, i) => {
            const active = (tile.value ?? null) === (activeCat ?? null);
            const count = tile.value ? (catCounts[tile.value] ?? 0) : totalAtRisk;
            const isYellow = tile.value === "VU";
            const textColor = active ? (isYellow ? "text-zinc-900" : "text-white") : "text-zinc-900";
            const subColor = active ? (isYellow ? "text-zinc-700" : "text-white/85") : "text-zinc-400";
            return (
              <Link
                key={tile.value ?? "all"}
                href={buildHref({ cat: tile.value ?? null })}
                style={{ animationDelay: `${i * 60}ms` }}
                className={
                  "fade-up group relative overflow-hidden rounded-2xl border p-4 transition-all duration-300 sm:p-5 " +
                  (active
                    ? `${tile.color} border-transparent shadow-xl shadow-zinc-900/10`
                    : "border-zinc-200/80 bg-white/80 backdrop-blur-sm hover:-translate-y-1 hover:border-zinc-300 hover:shadow-xl hover:shadow-zinc-900/10")
                }
              >
                {!active && (
                  <span className={`absolute left-0 top-0 h-full w-[3px] ${tile.accent}`} aria-hidden />
                )}
                {/* Animated gradient background on active */}
                {active && (
                  <span
                    className="absolute -right-12 -top-12 h-40 w-40 rounded-full opacity-25 blur-3xl"
                    style={{ background: "radial-gradient(circle, white, transparent)" }}
                    aria-hidden
                  />
                )}
                <div className={`flex items-baseline gap-2 ${textColor}`}>
                  {tile.value && (
                    <span className="font-mono text-[10px] font-black tracking-[0.15em] opacity-80">
                      {tile.value}
                    </span>
                  )}
                  <span className="text-base font-black sm:text-lg">{tile.label}</span>
                </div>
                <p className={`mt-1 text-[10px] tracking-wide ${subColor}`}>{tile.korean}</p>
                <p className={`mt-4 text-3xl font-black tabular-nums tracking-tight ${textColor} sm:text-4xl`}>
                  {count.toLocaleString()}
                  <span className="ml-1 text-[10px] font-bold tracking-wider opacity-70">SPECIES</span>
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      {classes.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-[11px] font-black tracking-[0.2em] text-zinc-500">TAXONOMY · 분류군</h2>
          <div className="flex flex-wrap gap-2">
            <Link
              href={buildHref({ cls: null })}
              className={
                "min-h-[40px] rounded-full border px-4 py-2 text-[13px] font-bold transition-all " +
                (!activeClass
                  ? "border-zinc-900 bg-zinc-900 text-white shadow-md shadow-zinc-900/15"
                  : "border-zinc-200/80 bg-white/70 text-zinc-700 backdrop-blur-sm hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-white hover:shadow-md")
              }
            >
              전체
              <span className="ml-2 font-mono text-[11px] tabular-nums opacity-60">{totalAtRisk}</span>
            </Link>
            {classes.map((c) => {
              const active = activeClass === c;
              const count = classCounts[c] ?? 0;
              return (
                <Link
                  key={c}
                  href={buildHref({ cls: c })}
                  className={
                    "min-h-[40px] rounded-full border px-4 py-2 text-[13px] font-bold transition-all " +
                    (active
                      ? "border-zinc-900 bg-zinc-900 text-white shadow-md shadow-zinc-900/15"
                      : "border-zinc-200/80 bg-white/70 text-zinc-700 backdrop-blur-sm hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-white hover:shadow-md")
                  }
                >
                  {c}
                  <span className="ml-2 font-mono text-[11px] tabular-nums opacity-60">{count.toLocaleString()}</span>
                </Link>
              );
            })}
            {unclassifiedCount > 0 && (
              <Link
                href={buildHref({ cls: "__none__" })}
                title="Wikidata 에 분류군 정보가 없는 종"
                className={
                  "min-h-[40px] rounded-full border border-dashed px-4 py-2 text-[13px] font-bold transition-all " +
                  (activeClass === "__none__"
                    ? "border-zinc-900 bg-zinc-900 text-white shadow-md shadow-zinc-900/15"
                    : "border-zinc-300 bg-zinc-50/70 text-zinc-500 backdrop-blur-sm hover:-translate-y-0.5 hover:border-zinc-400 hover:bg-white")
                }
              >
                분류 미상
                <span className="ml-2 font-mono text-[11px] tabular-nums opacity-60">{unclassifiedCount.toLocaleString()}</span>
              </Link>
            )}
          </div>
          <p className="mt-2 text-[10px] text-zinc-400">
            ※ 현재 표시 중인 분류군 합계: {Object.values(classCounts).reduce((a, b) => a + b, 0).toLocaleString()}종 ·
            분류 미상: {unclassifiedCount.toLocaleString()}종 · 합계 {totalAtRisk.toLocaleString()}종 (Wikidata 분류군 정보 부재로 일부 종이 미상으로 표시됩니다)
          </p>
        </section>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium text-zinc-700">
          <span className="font-black text-zinc-900">{total.toLocaleString()}</span>종 중{" "}
          <span className="font-bold">{((currentPage - 1) * PAGE_SIZE + 1).toLocaleString()}–{Math.min(currentPage * PAGE_SIZE, total).toLocaleString()}</span>
          {activeCat && <span className="ml-2 text-xs text-zinc-500">· 등급 {activeCat}</span>}
          {activeClass && (
            <span className="ml-2 text-xs text-zinc-500">
              · {activeClass === "__none__" ? "분류 미상" : activeClass}
            </span>
          )}
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

      {totalPages > 1 && (
        <Pagination currentPage={currentPage} totalPages={totalPages} buildHref={(p) => buildHref({ page: p })} />
      )}

      <p className="mt-10 text-[11px] text-zinc-400">
        데이터 출처: IUCN Red List v2024-1 · Wikidata · Wikipedia — 총 {total.toLocaleString()}종 추적 중.
      </p>
    </div>
  );
}

function Pagination({
  currentPage,
  totalPages,
  buildHref,
}: {
  currentPage: number;
  totalPages: number;
  buildHref: (p: number | null) => string;
}) {
  // 7개 슬롯: ←  1 ... a b CURRENT c d ... last  →
  const pages: (number | "...")[] = [];
  const window = 1;
  const add = (n: number | "...") => {
    if (pages[pages.length - 1] !== n) pages.push(n);
  };
  add(1);
  if (currentPage - window > 2) add("...");
  for (let p = Math.max(2, currentPage - window); p <= Math.min(totalPages - 1, currentPage + window); p++) {
    add(p);
  }
  if (currentPage + window < totalPages - 1) add("...");
  if (totalPages > 1) add(totalPages);

  return (
    <nav className="mt-8 flex flex-wrap items-center justify-center gap-1.5" aria-label="페이지네이션">
      {currentPage > 1 && (
        <Link
          href={buildHref(currentPage - 1)}
          className="inline-flex h-10 min-w-[40px] items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 text-sm font-bold text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50"
        >
          ←
        </Link>
      )}
      {pages.map((p, i) =>
        p === "..." ? (
          <span key={`dots-${i}`} className="px-1 text-zinc-400">
            …
          </span>
        ) : (
          <Link
            key={p}
            href={p === 1 ? buildHref(null) : buildHref(p)}
            className={
              "inline-flex h-10 min-w-[40px] items-center justify-center rounded-xl border px-3 text-sm font-bold tabular-nums transition " +
              (p === currentPage
                ? "border-zinc-900 bg-zinc-900 text-white shadow-md shadow-zinc-900/15"
                : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50")
            }
          >
            {p}
          </Link>
        )
      )}
      {currentPage < totalPages && (
        <Link
          href={buildHref(currentPage + 1)}
          className="inline-flex h-10 min-w-[40px] items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 text-sm font-bold text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50"
        >
          →
        </Link>
      )}
    </nav>
  );
}
