import {
  listAtRiskSpecies,
  facetCounts,
  countSpecies,
  threatCategoryNames,
  countScope,
  countByClass,
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

// IUCN 적색목록 범주 — 큐레이션 목록에는 위협 등급 밖(준위협·최소관심·절멸) 종도 있다
const CATEGORY_KO: Record<string, string> = {
  CR: "위급",
  EN: "위기",
  VU: "취약",
  NT: "준위협",
  LC: "최소관심",
  DD: "정보부족",
  EX: "절멸",
  EW: "야생절멸",
};
const CATEGORY_CODES = Object.keys(CATEGORY_KO);

const TREND_LABEL: Record<string, string> = {
  Decreasing: "감소",
  Stable: "안정",
  Increasing: "증가",
  Unknown: "알 수 없음",
  [NONE]: "기록 없음",
};

// 이름은 tipping_points.payload 의 tier_label 그대로
const TIER_LABEL: Record<string, string> = {
  T4: "T4 임박 — 골든타임",
  T3: "T3 위급 — 즉시 개입",
  T2: "T2 경계 — 개입 검토",
  T1: "T1 주의",
  T0: "T0 안정",
  EX: "EX 절멸·야생절멸",
  [NONE]: "점수 없음",
};

// IUCN 위협 분류 대분류 (영문 이름은 DB threats.threat_category 에서 받아 툴팁으로)
const THREAT_KO: Record<string, string> = {
  "1": "주거·상업 개발",
  "2": "농업·양식",
  "3": "에너지 생산·채굴",
  "4": "교통·서비스 회랑",
  "5": "생물자원 이용",
  "6": "인간 침입·교란",
  "7": "자연계 변형",
  "8": "침입종·문제종·질병",
  "9": "오염",
  "10": "지질 현상",
  "11": "기후변화·극한 기상",
  "12": "기타",
};
const THREAT_CODES = Object.keys(THREAT_KO);
// 이름이 짧아 뜻이 모자라는 대분류의 풀이 — 툴팁에만
const THREAT_DETAIL: Record<string, string> = {
  "5": "사냥·채취·벌채·어업",
  "7": "화재·댐·물 관리 등",
};

// 이보다 종이 적은 분류군은 "기타" 로 묶어 보인다 (현재 목록 범위 — 큐레이션/전체 — 의 종 수 기준)
const MINOR_CLASS_MAX = 10;

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

  // "기타" — 현재 범위에서 MINOR_CLASS_MAX 종 미만인 분류군. 필터 조건은 그대로(분류군 여러 개 OR)이고 묶어 보이기만 한다.
  const scopeClassCounts = countByClass(curatedOnly);
  const minorClasses = Object.keys(scopeClassCounts)
    .filter((c) => scopeClassCounts[c] < MINOR_CLASS_MAX)
    .sort((a, b) => scopeClassCounts[b] - scopeClassCounts[a] || a.localeCompare(b, "ko"));
  const minorSelected = minorClasses.filter((c) => state.classes.includes(c));
  const allMinorSelected = minorClasses.length > 0 && minorSelected.length === minorClasses.length;
  // 기타 전부 걸기 / (이미 전부 걸려 있으면) 전부 풀기
  const minorToggleHref = allMinorSelected
    ? buildHref({ classes: state.classes.filter((c) => !minorClasses.includes(c)) })
    : buildHref({ classes: [...state.classes, ...minorClasses.filter((c) => !state.classes.includes(c))] });
  const minorCount = minorClasses.reduce((s, c) => s + (facets.class[c] ?? 0), 0);

  // 위협 대분류는 종 수 많은 순 (같으면 IUCN 코드 순) — 코드는 라벨 뒤 괄호로 남긴다
  const threatOrder = [...THREAT_CODES].sort(
    (a, b) => (facets.threat[b] ?? 0) - (facets.threat[a] ?? 0) || Number(a) - Number(b)
  );

  // 목록 위 칩 — 값 하나마다 칩 하나, × 는 그 값만 푼다 (분류군은 여러 개일 수 있다)
  const chips: { key: string; label: string; href: string }[] = [];
  if (state.category)
    chips.push({
      key: "category",
      label: `${state.category} ${CATEGORY_KO[state.category] ?? ""}`.trim(),
      href: buildHref({ category: undefined }),
    });
  // 기타에 묶인 분류군을 전부 골랐으면 칩 하나("기타 (N개 분류군)")로, 아니면 하나씩
  for (const c of state.classes) {
    if (allMinorSelected && minorClasses.includes(c)) continue;
    chips.push({ key: `class-${c}`, label: c === NONE ? "분류 미상" : c, href: toggleClass(c) });
  }
  if (allMinorSelected)
    chips.push({ key: "class-minor", label: `기타 (${minorClasses.length}개 분류군)`, href: minorToggleHref });
  if (state.trend)
    chips.push({ key: "trend", label: `추세 ${TREND_LABEL[state.trend] ?? state.trend}`, href: buildHref({ trend: undefined }) });
  if (state.tier)
    chips.push({ key: "tier", label: TIER_LABEL[state.tier] ?? state.tier, href: buildHref({ tier: undefined }) });
  if (state.threat)
    chips.push({ key: "threat", label: `위협 ${THREAT_KO[state.threat] ?? state.threat}`, href: buildHref({ threat: undefined }) });

  const classOptions = Object.keys(facets.class)
    .filter((c) => c !== NONE && !minorClasses.includes(c))
    .concat(state.classes.filter((c) => c !== NONE && !(c in facets.class) && !minorClasses.includes(c)))
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

      {/* 필터 — 기본은 접힘(<details>). 걸린 필터는 접혀 있어도 아래 칩으로 보인다. */}
      <section className="mb-6">
        <details className="rounded-2xl border border-zinc-200 bg-white/70">
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-1.5 text-sm font-bold text-zinc-900">
              필터
              {chips.length > 0 && (
                <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[11px] font-black tabular-nums text-white">
                  {chips.length}
                </span>
              )}
            </span>
            <span className="text-[11px] text-zinc-400">눌러서 펼치기·접기 ▾</span>
          </summary>
          <div className="space-y-2 border-t border-zinc-100 px-4 pb-4 pt-3">
            <p className="text-[10px] text-zinc-400">
              항목 옆 숫자는 다른 필터를 건 상태에서의 종 수입니다. 0종인 항목은 누를 수 없습니다.
            </p>

        <FacetGroup title="등급" hint="IUCN 적색목록 범주 · 하나만 선택" selected={state.category ? 1 : 0}>
          <FacetChip
            href={buildHref({ category: undefined })}
            label="전체"
            count={countWithoutCategory}
            active={!state.category}
          />
          {CATEGORY_CODES.map((code) => (
            <FacetChip
              key={code}
              href={buildHref({ category: state.category === code ? undefined : code })}
              label={`${code} ${CATEGORY_KO[code]}`}
              count={facets.category[code] ?? 0}
              active={state.category === code}
            />
          ))}
        </FacetGroup>

        <FacetGroup
          title="분류군"
          hint="여러 개 선택 가능 (고른 분류군 중 하나에 속하는 종)"
          selected={state.classes.length}
        >
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
          {minorClasses.length > 0 && (
            // 기타 — 누르면 안의 분류군이 펼쳐지고 하나씩 고를 수 있다. 하나라도 걸려 있으면 펼친 채로.
            <details className="basis-full" open={minorSelected.length > 0 || undefined}>
              <summary
                className={
                  "inline-flex min-h-[36px] cursor-pointer list-none items-center rounded-full border border-dashed px-3.5 py-1.5 text-[12px] font-bold transition [&::-webkit-details-marker]:hidden " +
                  (minorCount === 0 && minorSelected.length === 0
                    ? "border-zinc-200 text-zinc-400 opacity-50"
                    : "border-zinc-300 bg-white/70 text-zinc-700 hover:border-zinc-400")
                }
                title={`${MINOR_CLASS_MAX}종 미만 분류군 ${minorClasses.length}개: ${minorClasses.join(", ")}`}
              >
                기타
                <span className="ml-2 font-mono text-[11px] tabular-nums opacity-60">{minorCount.toLocaleString()}</span>
                {minorSelected.length > 0 && (
                  <span className="ml-1.5 text-[11px] text-[#D81E05]">{minorSelected.length}개 선택</span>
                )}
                <span className="ml-1.5 text-[10px] text-zinc-400">▾</span>
              </summary>
              <div className="mt-2 flex flex-wrap gap-2 rounded-xl bg-zinc-50/80 p-2">
                <FacetChip
                  href={minorToggleHref}
                  label={allMinorSelected ? "기타 전부 해제" : "기타 전부 선택"}
                  count={minorCount}
                  active={allMinorSelected}
                  title={`${MINOR_CLASS_MAX}종 미만 분류군 ${minorClasses.length}개를 한 번에`}
                />
                {minorClasses.map((c) => (
                  <FacetChip
                    key={c}
                    href={toggleClass(c)}
                    label={c}
                    count={facets.class[c] ?? 0}
                    active={state.classes.includes(c)}
                    multi
                  />
                ))}
              </div>
            </details>
          )}
        </FacetGroup>

        <FacetGroup title="개체수 추세" hint="IUCN 평가 기준" selected={state.trend ? 1 : 0}>
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

        <FacetGroup
          title="위험 단계"
          hint="LastWatch 자체 계산 (IUCN 공식 지표 아님) · T4 가 가장 시급"
          selected={state.tier ? 1 : 0}
        >
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
          title="위협 요인"
          hint="IUCN 위협 분류 대분류 · 종 수 많은 순, 괄호 안은 IUCN 코드 · 분류 코드가 있는 종만 (수기 입력 위협만 있는 종·위협 기록이 없는 종은 해당 없음) · 과거 위협 포함"
          selected={state.threat ? 1 : 0}
        >
          {threatOrder.map((code) => (
            <FacetChip
              key={code}
              href={buildHref({ threat: state.threat === code ? undefined : code })}
              label={THREAT_KO[code]}
              count={facets.threat[code] ?? 0}
              suffix={`(${code})`}
              active={state.threat === code}
              title={
                [THREAT_DETAIL[code], threatNames[code] ? `IUCN 원문: ${threatNames[code]}` : null]
                  .filter(Boolean)
                  .join(" · ") || undefined
              }
            />
          ))}
        </FacetGroup>
          </div>
        </details>

        {chips.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="걸린 필터">
            {chips.map((c) => (
              <Link
                key={c.key}
                href={c.href}
                aria-label={`${c.label} 필터 해제`}
                className="inline-flex items-center gap-1.5 rounded-full border border-zinc-900 bg-zinc-900 px-3 py-1 text-[12px] font-bold text-white transition hover:bg-zinc-700"
              >
                {c.label}
                <span aria-hidden className="text-[13px] leading-none opacity-80">×</span>
              </Link>
            ))}
            <Link
              href={resetHref}
              className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-[12px] font-bold text-zinc-600 transition hover:border-zinc-300 hover:text-zinc-900"
            >
              전체 해제
            </Link>
          </div>
        )}
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

// 축 하나 — 따로 접고 펼친다(기본 접힘). 제목 옆에 이 축에서 고른 개수.
function FacetGroup({
  title,
  hint,
  selected = 0,
  children,
}: {
  title: string;
  hint?: string;
  selected?: number;
  children: React.ReactNode;
}) {
  return (
    <details className="rounded-xl border border-zinc-100 bg-white/60">
      <summary className="flex min-h-[40px] cursor-pointer list-none flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2 [&::-webkit-details-marker]:hidden">
        <h2 className="text-[13px] font-bold text-zinc-800">
          {title}
          {selected > 0 && <span className="ml-1.5 text-[11px] font-bold text-[#D81E05]">{selected}개 선택</span>}
        </h2>
        {hint && <span className="text-[10px] text-zinc-400">{hint}</span>}
        <span className="ml-auto text-[11px] text-zinc-400">▾</span>
      </summary>
      <div className="flex flex-wrap gap-2 px-3 pb-3 pt-1">{children}</div>
    </details>
  );
}

// 항목 하나. 0종이면(선택돼 있지 않은 한) 흐리게, 누를 수 없게 — 링크 대신 span.
function FacetChip({
  href,
  label,
  count,
  active,
  title,
  suffix,
  dashed = false,
  multi = false,
}: {
  href: string;
  label: string;
  count: number;
  active: boolean;
  title?: string;
  /** 종 수 뒤에 붙는 작은 글자 — 위협 대분류의 IUCN 코드 "(5)" */
  suffix?: string;
  dashed?: boolean;
  multi?: boolean;
}) {
  const base =
    "inline-flex min-h-[36px] items-center rounded-full border px-3.5 py-1.5 text-[12px] font-bold transition-all " +
    (dashed ? "border-dashed " : "");
  const countEl = (
    <>
      <span className="ml-2 font-mono text-[11px] tabular-nums opacity-60">{count.toLocaleString()}</span>
      {suffix && <span className="ml-1 font-mono text-[11px] font-normal opacity-50">{suffix}</span>}
    </>
  );
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
