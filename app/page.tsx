import {
  listAtRiskSpecies,
  facetCounts,
  countSpecies,
  threatCategoryNames,
  countScope,
  PAGE_SIZE,
  NONE,
  TREND_VALUES,
  TIER_VALUES,
  SORT_RULE,
  type SortKey,
  type ListFilters,
  type FilterAxis,
} from "@/lib/queries";
import { SpeciesGrid } from "@/components/species-grid";
import { SearchBar } from "@/components/search-bar";
import { SortSelector } from "@/components/sort-selector";
import { PageJumper } from "@/components/page-jumper";
import { AllSpeciesToggle } from "@/components/all-species-toggle";
import Link from "next/link";

export const dynamic = "force-dynamic";

const CATEGORY_TILES = [
  { value: undefined, label: "전체", korean: "All", color: "bg-zinc-900", accent: "bg-zinc-900" },
  { value: "CR", label: "위급", korean: "Critically Endangered", color: "bg-[#D81E05]", accent: "bg-[#D81E05]" },
  { value: "EN", label: "위기", korean: "Endangered", color: "bg-[#FC7F3F]", accent: "bg-[#FC7F3F]" },
  { value: "VU", label: "취약", korean: "Vulnerable", color: "bg-[#F9E814]", accent: "bg-[#F9E814]" },
] as const;

// 타일 밖의 등급 — 큐레이션 목록에 준위협·최소관심·절멸 종도 있다
const OTHER_CATEGORIES = [
  { value: "NT", label: "준위협" },
  { value: "LC", label: "최소관심" },
  { value: "DD", label: "정보부족" },
  { value: "EX", label: "절멸" },
  { value: "EW", label: "야생절멸" },
] as const;

const TREND_LABEL: Record<string, string> = {
  Decreasing: "감소",
  Stable: "안정",
  Increasing: "증가",
  Unknown: "알 수 없음",
  [NONE]: "기록 없음",
};

const TIER_LABEL: Record<string, string> = {
  T4: "T4",
  T3: "T3",
  T2: "T2",
  T1: "T1",
  T0: "T0",
  EX: "EX (절멸)",
  [NONE]: "점수 없음",
};

// IUCN 위협 분류 대분류 (영문 이름은 DB threats.threat_category 에서 받아 툴팁으로)
const THREAT_KO: Record<string, string> = {
  "1": "주거·상업 개발",
  "2": "농업·양식",
  "3": "에너지 생산·채굴",
  "4": "교통·서비스 회랑",
  "5": "생물자원 이용 (사냥·채취·벌채·어업)",
  "6": "인간 침입·교란",
  "7": "자연계 변형 (화재·댐 등)",
  "8": "침입종·문제종·질병",
  "9": "오염",
  "10": "지질 현상",
  "11": "기후변화·극한 기상",
  "12": "기타",
};
const THREAT_CODES = Object.keys(THREAT_KO);

const VALID_SORTS: SortKey[] = ["urgency", "score", "population", "risk", "name", "recent", "class"];

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

interface ViewState {
  category?: string;
  classes: string[];
  trend?: string;
  tier?: string;
  threat?: string;
  sort: SortKey;
}

export default function HomePage({ searchParams = {} }: { searchParams?: SearchParams }) {
  const sort = (VALID_SORTS as string[]).includes(first(searchParams.sort) ?? "")
    ? (first(searchParams.sort) as SortKey)
    : "urgency";
  const currentPage = Math.max(1, parseInt(first(searchParams.page) ?? "1") || 1);
  const showAll = first(searchParams.show_all) === "true";
  const curatedOnly = !showAll;

  // 분류군은 여러 개 — ?class=포유류,조류 (예전 ?class=포유류 도 그대로 동작)
  const rawClass = searchParams.class;
  const classes = Array.from(
    new Set(
      (Array.isArray(rawClass) ? rawClass : rawClass ? [rawClass] : [])
        .flatMap((v) => v.split(","))
        .map((v) => v.trim())
        .filter(Boolean)
    )
  );

  const state: ViewState = {
    category: first(searchParams.category),
    classes,
    trend: first(searchParams.trend),
    tier: first(searchParams.tier),
    threat: first(searchParams.threat),
    sort,
  };
  const filters: ListFilters = {
    category: state.category,
    classNames: state.classes,
    trend: state.trend,
    tier: state.tier,
    threat: state.threat,
    curatedOnly,
  };

  const { rows: species, total } = listAtRiskSpecies({ ...filters, sort, page: currentPage });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const facets = facetCounts(filters);
  const threatNames = threatCategoryNames();
  const totalAtRisk = countScope(curatedOnly); // 현재 모드(큐레이션 ~4,230 / 전체)의 총 종 수
  const totalAllSpecies = countScope(false); // 토글 라벨용 전체 수
  const countWithoutCategory = countSpecies(filters, "category");
  const countWithoutClass = countSpecies(filters, "class");

  function buildHref(over: Partial<ViewState> & { page?: number | null } = {}) {
    const s = { ...state, ...over };
    const params = new URLSearchParams();
    if (s.category) params.set("category", s.category);
    if (s.classes.length) params.set("class", s.classes.join(","));
    if (s.trend) params.set("trend", s.trend);
    if (s.tier) params.set("tier", s.tier);
    if (s.threat) params.set("threat", s.threat);
    if (s.sort !== "urgency") params.set("sort", s.sort);
    // 필터/정렬 변경시 page 자동 리셋. over.page 명시한 경우만 유지
    if (over.page && over.page > 1) params.set("page", String(over.page));
    if (showAll) params.set("show_all", "true"); // 모드 유지
    const q = params.toString();
    return q ? `/?${q}` : "/";
  }
  const toggleClass = (c: string) =>
    buildHref({ classes: state.classes.includes(c) ? state.classes.filter((x) => x !== c) : [...state.classes, c] });
  const resetHref = buildHref({ category: undefined, classes: [], trend: undefined, tier: undefined, threat: undefined });

  // 걸려 있는 필터 — 요약 줄과 "결과 0종일 때 무엇을 풀면 되는지" 에 쓴다
  const active: { axis: FilterAxis; label: string; clearHref: string }[] = [];
  if (state.category) active.push({ axis: "category", label: `등급 ${state.category}`, clearHref: buildHref({ category: undefined }) });
  if (state.classes.length)
    active.push({
      axis: "class",
      label: `분류군 ${state.classes.map((c) => (c === NONE ? "분류 미상" : c)).join("·")}`,
      clearHref: buildHref({ classes: [] }),
    });
  if (state.trend) active.push({ axis: "trend", label: `추세 ${TREND_LABEL[state.trend] ?? state.trend}`, clearHref: buildHref({ trend: undefined }) });
  if (state.tier) active.push({ axis: "tier", label: `티어 ${TIER_LABEL[state.tier] ?? state.tier}`, clearHref: buildHref({ tier: undefined }) });
  if (state.threat)
    active.push({ axis: "threat", label: `위협 ${THREAT_KO[state.threat] ?? state.threat}`, clearHref: buildHref({ threat: undefined }) });

  const classOptions = Object.keys(facets.class)
    .filter((c) => c !== NONE)
    .concat(state.classes.filter((c) => c !== NONE && !(c in facets.class)))
    .sort((a, b) => (facets.class[b] ?? 0) - (facets.class[a] ?? 0) || a.localeCompare(b, "ko"));

  // 현재 필터 유지하며 전체 모드로 켜는 링크 (빈 결과 CTA용)
  const showAllHref = (() => {
    const h = buildHref();
    const params = new URLSearchParams(h.includes("?") ? h.slice(2) : "");
    params.set("show_all", "true");
    return `/?${params.toString()}`;
  })();

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
          {curatedOnly ? (
            <>
              사진과 상세 정보를 갖춘 <span className="font-bold text-[#D81E05]">엄선된 {totalAtRisk.toLocaleString()}종</span>입니다.
              카드를 눌러 위협 요인과 보전 계획, AI가 제안하는 개입 전략과 임계점 연표를 확인해 보세요.
              <br className="hidden sm:block" />전체 목록을 보려면 아래 <span className="font-bold text-zinc-900">모든 종 보기</span>를 켜세요.
            </>
          ) : (
            <>
              IUCN Red List 에 등재된 <span className="font-bold text-[#D81E05]">전체 {totalAtRisk.toLocaleString()}종</span>입니다.
              대부분 사진·상세 정보가 아직 없는 종이며, 기본 정보만 등록되어 있습니다.
            </>
          )}
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
          <span className="text-[10px] tracking-wider text-zinc-400">IUCN Red List v3.1 · 숫자는 다른 필터를 건 상태의 종 수</span>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
          {CATEGORY_TILES.map((tile, i) => {
            const active = (tile.value ?? null) === (state.category ?? null);
            const count = tile.value ? (facets.category[tile.value] ?? 0) : countWithoutCategory;
            const disabled = count === 0 && !active;
            const isYellow = tile.value === "VU";
            const textColor = active ? (isYellow ? "text-zinc-900" : "text-white") : "text-zinc-900";
            const subColor = active ? (isYellow ? "text-zinc-700" : "text-white/85") : "text-zinc-400";
            const className =
              "fade-up group relative overflow-hidden rounded-2xl border p-4 transition-all duration-300 sm:p-5 " +
              (active
                ? `${tile.color} border-transparent shadow-xl shadow-zinc-900/10`
                : disabled
                ? "cursor-not-allowed border-zinc-200/80 bg-white/60 opacity-40"
                : "border-zinc-200/80 bg-white/80 backdrop-blur-sm hover:-translate-y-1 hover:border-zinc-300 hover:shadow-xl hover:shadow-zinc-900/10");
            const body = (
              <>
                {!active && <span className={`absolute left-0 top-0 h-full w-[3px] ${tile.accent}`} aria-hidden />}
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
                    <span className="font-mono text-[10px] font-black tracking-[0.15em] opacity-80">{tile.value}</span>
                  )}
                  <span className="text-base font-black sm:text-lg">{tile.label}</span>
                </div>
                <p className={`mt-1 text-[10px] tracking-wide ${subColor}`}>{tile.korean}</p>
                <p className={`mt-4 text-3xl font-black tabular-nums tracking-tight ${textColor} sm:text-4xl`}>
                  {count.toLocaleString()}
                  <span className="ml-1 text-[10px] font-bold tracking-wider opacity-70">SPECIES</span>
                </p>
              </>
            );
            return disabled ? (
              <span key={tile.value ?? "all"} aria-disabled="true" className={className}>
                {body}
              </span>
            ) : (
              <Link
                key={tile.value ?? "all"}
                href={buildHref({ category: tile.value })}
                style={{ animationDelay: `${i * 60}ms` }}
                className={className}
              >
                {body}
              </Link>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="self-center text-[11px] text-zinc-400">그 밖의 등급</span>
          {OTHER_CATEGORIES.map((c) => (
            <FacetChip
              key={c.value}
              href={buildHref({ category: state.category === c.value ? undefined : c.value })}
              label={`${c.value} ${c.label}`}
              count={facets.category[c.value] ?? 0}
              active={state.category === c.value}
            />
          ))}
        </div>
      </section>

      <section className="mb-8 space-y-5 rounded-2xl border border-zinc-200 bg-white/70 p-4 sm:p-5">
        <FacetGroup title="TAXONOMY · 분류군" hint="여러 개 선택 가능 (고른 분류군 중 하나에 속하는 종)">
          <FacetChip href={buildHref({ classes: [] })} label="전체" count={countWithoutClass} active={state.classes.length === 0} />
          {classOptions.map((c) => (
            <FacetChip
              key={c}
              href={toggleClass(c)}
              label={c}
              count={facets.class[c] ?? 0}
              active={state.classes.includes(c)}
              multi
            />
          ))}
          {(facets.class[NONE] ?? 0) > 0 || state.classes.includes(NONE) ? (
            <FacetChip
              href={toggleClass(NONE)}
              label="분류 미상"
              count={facets.class[NONE] ?? 0}
              active={state.classes.includes(NONE)}
              title="Wikidata 에 분류군 정보가 없는 종"
              dashed
              multi
            />
          ) : null}
        </FacetGroup>

        <FacetGroup title="POPULATION TREND · 개체수 추세" hint="IUCN 평가의 개체수 추세">
          {[...TREND_VALUES, NONE].map((v) => (
            <FacetChip
              key={v}
              href={buildHref({ trend: state.trend === v ? undefined : v })}
              label={TREND_LABEL[v]}
              count={facets.trend[v] ?? 0}
              active={state.trend === v}
              dashed={v === NONE}
            />
          ))}
        </FacetGroup>

        <FacetGroup title="V5 TIER · LastWatch 티어" hint="LastWatch 자체 계산 (IUCN 공식 지표 아님) · T4 가 가장 시급">
          {[...TIER_VALUES, NONE].map((v) => (
            <FacetChip
              key={v}
              href={buildHref({ tier: state.tier === v ? undefined : v })}
              label={TIER_LABEL[v]}
              count={facets.tier[v] ?? 0}
              active={state.tier === v}
              title={v === NONE ? "개체수 데이터가 없어 점수가 산출되지 않은 종" : undefined}
              dashed={v === NONE}
            />
          ))}
        </FacetGroup>

        <FacetGroup
          title="THREATS · 위협 대분류"
          hint="IUCN 위협 분류 코드가 있는 종만 (수기 입력 위협만 있는 종·위협 기록이 없는 종은 해당 없음) · 과거 위협 포함"
        >
          {THREAT_CODES.map((code) => (
            <FacetChip
              key={code}
              href={buildHref({ threat: state.threat === code ? undefined : code })}
              label={`${code}. ${THREAT_KO[code]}`}
              count={facets.threat[code] ?? 0}
              active={state.threat === code}
              title={threatNames[code]}
            />
          ))}
        </FacetGroup>
      </section>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50/60 px-4 py-3">
        <p className="text-[12px] text-zinc-600">
          {curatedOnly ? (
            <>📸 <span className="font-bold text-zinc-900">엄선된 {totalAtRisk.toLocaleString()}종</span> — 사진·상세 정보 보유</>
          ) : (
            <>🌐 <span className="font-bold text-zinc-900">전체 {totalAtRisk.toLocaleString()}종</span> — 사진·상세 정보가 없는 종도 포함</>
          )}
        </p>
        <AllSpeciesToggle totalAll={totalAllSpecies} />
      </div>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium text-zinc-700">
          <span className="font-black text-zinc-900">{total.toLocaleString()}</span>종
          {total > 0 && (
            <>
              {" "}중{" "}
              <span className="font-bold">
                {((currentPage - 1) * PAGE_SIZE + 1).toLocaleString()}–{Math.min(currentPage * PAGE_SIZE, total).toLocaleString()}
              </span>
            </>
          )}
          {active.map((a) => (
            <span key={a.axis} className="ml-2 text-xs text-zinc-500">· {a.label}</span>
          ))}
        </p>
        <div className="flex items-center gap-3">
          <SortSelector
            value={sort}
            hrefs={Object.fromEntries(VALID_SORTS.map((k) => [k, buildHref({ sort: k })])) as Record<SortKey, string>}
          />
          {active.length > 0 && (
            <Link
              href={resetHref}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-bold text-zinc-600 transition hover:border-zinc-300 hover:text-zinc-900"
            >
              필터 초기화
            </Link>
          )}
        </div>
      </div>
      <p className="mb-4 text-[11px] text-zinc-400">정렬 규칙: {SORT_RULE}</p>

      {species.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-200 bg-white px-4 py-12 text-center text-sm text-zinc-500">
          조건에 해당하는 종이 없습니다.
          {active.length > 0 && (
            <div className="mx-auto mt-4 max-w-md text-left text-xs">
              <p className="mb-2 font-bold text-zinc-700">이 필터를 풀면:</p>
              <ul className="space-y-1.5">
                {active.map((a) => {
                  const n = countSpecies(filters, a.axis);
                  return (
                    <li key={a.axis}>
                      <Link href={a.clearHref} className="font-bold text-[#D81E05] underline">
                        {a.label} 풀기
                      </Link>
                      <span className="ml-1.5 text-zinc-500">→ {n.toLocaleString()}종</span>
                    </li>
                  );
                })}
              </ul>
              <Link href={resetHref} className="mt-3 inline-block text-zinc-500 underline">
                필터 전부 초기화
              </Link>
            </div>
          )}
          {curatedOnly && (
            <p className="mt-4 text-xs">
              전체 {totalAllSpecies.toLocaleString()}종에서는 결과가 있을 수 있어요.{" "}
              <Link href={showAllHref} className="font-bold text-[#D81E05] underline">
                모든 종 보기 켜기
              </Link>
            </p>
          )}
        </div>
      ) : (
        <SpeciesGrid species={species} defaultView={curatedOnly ? "card" : "list"} />
      )}

      {totalPages > 1 && (
        <>
          <Pagination currentPage={currentPage} totalPages={totalPages} buildHref={(p) => buildHref({ page: p })} />
          <PageJumper
            currentPage={currentPage}
            totalPages={totalPages}
            baseQuery={buildHref({ page: null }).replace(/\?$/, "")}
          />
        </>
      )}

      <p className="mt-10 text-[11px] text-zinc-400">
        데이터 출처: IUCN Red List v2024-1 · Wikidata · Wikipedia — 총 {total.toLocaleString()}종 추적 중.
      </p>
    </div>
  );
}

function FacetGroup({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[11px] font-black tracking-[0.2em] text-zinc-500">{title}</h2>
        {hint && <span className="text-[10px] text-zinc-400">{hint}</span>}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

// 항목 하나. 0종이면(선택돼 있지 않은 한) 흐리게, 누를 수 없게 — 링크 대신 span.
function FacetChip({
  href,
  label,
  count,
  active,
  title,
  dashed = false,
  multi = false,
}: {
  href: string;
  label: string;
  count: number;
  active: boolean;
  title?: string;
  dashed?: boolean;
  multi?: boolean;
}) {
  const base =
    "inline-flex min-h-[36px] items-center rounded-full border px-3.5 py-1.5 text-[12px] font-bold transition-all " +
    (dashed ? "border-dashed " : "");
  const countEl = <span className="ml-2 font-mono text-[11px] tabular-nums opacity-60">{count.toLocaleString()}</span>;
  if (count === 0 && !active) {
    return (
      <span
        aria-disabled="true"
        title={title ? `${title} — 현재 조건에서 0종` : "현재 조건에서 0종"}
        className={base + "cursor-not-allowed border-zinc-200 bg-zinc-50 text-zinc-400 opacity-50"}
      >
        {label}
        {countEl}
      </span>
    );
  }
  return (
    <Link
      href={href}
      title={title}
      aria-pressed={active}
      className={
        base +
        (active
          ? "border-zinc-900 bg-zinc-900 text-white shadow-md shadow-zinc-900/15"
          : "border-zinc-200/80 bg-white/70 text-zinc-700 hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-white hover:shadow-md")
      }
    >
      {multi && <span className="mr-1.5 text-[10px]">{active ? "☑" : "☐"}</span>}
      {label}
      {countEl}
    </Link>
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
