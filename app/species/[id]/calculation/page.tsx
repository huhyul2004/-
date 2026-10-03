// 종별 계산 근거 페이지 — 결정 12 (2026-10-03)
//
// 엔진이 계산하면서 payload 에 남긴 입력값(inputs)·레이어 세부값(layer_scores)·집계 추적(aggregation)을
// 그대로 보여준다. 이 페이지는 다시 계산하지 않는다 — 화면의 숫자 = DB 에 저장된 계산 기록.
// 각 값 옆 "?" 는 식 설명(마우스를 올리거나 눌러서 연다), 오른쪽 칸은 값의 출처(컬럼·상수 이름)다.
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getSpeciesById, getTippingPoint } from "@/lib/queries";
import {
  V5_SPEC,
  TIERS,
  inferPopulationWithSource,
  type TippingPointResult,
  type TippingInputs,
  type AggregationTrace,
} from "@/lib/tipping-point";
import { aggregationOf } from "@/lib/floor-transparency";
import { DAMUTH_CONSTANTS, DAMUTH_SKIP_LABEL, type DamuthSkipReason } from "@/lib/damuth-k";
import { dbUserVersion, formatDbVersion, iucnQueriedLabel, kstDate } from "@/lib/provenance";

export const dynamic = "force-dynamic";

export function generateMetadata({ params }: { params: { id: string } }) {
  const s = getSpeciesById(params.id);
  const name = s ? s.common_name_ko ?? s.common_name_en ?? s.scientific_name : "종";
  return {
    title: `${name} 위험 점수 계산 근거 — LastWatch`,
    description: `${name}의 LastWatch v5 위험 점수가 나온 과정 — 입력값, 세 레이어, 가중합, 다수결, 개체수 하한 적용 전후의 모든 중간값과 출처.`,
  };
}

// ---------- 표시 도우미 ----------

const f = (x: number | null | undefined, d = 2) => (x == null || !Number.isFinite(x) ? "—" : x.toFixed(d));
const n0 = (x: number | null | undefined) => (x == null ? "—" : x.toLocaleString());

/** 식 설명 툴팁 — 마우스를 올리거나(hover) 키보드·터치로 초점을 주면(focus) 열린다. JS 없이 동작 */
function Tip({ id, children }: { id: string; children: ReactNode }) {
  return (
    <span className="group relative ml-1 inline-flex align-middle">
      <button
        type="button"
        aria-describedby={`tip-${id}`}
        aria-label="식 설명 보기"
        className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border border-zinc-300 bg-white text-[10px] font-bold leading-none text-zinc-500 transition hover:border-zinc-500 hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FC7F3F]"
      >
        ?
      </button>
      <span
        role="tooltip"
        id={`tip-${id}`}
        className="absolute left-0 top-full z-30 mt-1 hidden w-[min(20rem,calc(100vw-3rem))] whitespace-normal rounded-lg bg-zinc-900 px-3 py-2 text-left text-[11px] font-normal leading-relaxed text-white shadow-lg group-focus-within:block group-hover:block"
      >
        {children}
      </span>
    </span>
  );
}

interface RowProps {
  id: string;
  label: ReactNode;
  value: ReactNode;
  source: ReactNode;
  tip?: ReactNode;
  strong?: boolean;
}

/** 한 줄 = 항목 · 값 · 출처. 좁은 화면에서는 세 칸이 위아래로 쌓인다 (가로 스크롤 없음 — 툴팁이 잘리지 않게) */
function Row({ id, label, value, source, tip, strong }: RowProps) {
  return (
    <div
      className={`grid gap-x-4 gap-y-0.5 border-t border-zinc-100 py-2 first:border-t-0 sm:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1.1fr)] ${
        strong ? "bg-zinc-50/80 -mx-2 px-2 rounded-lg" : ""
      }`}
    >
      <div className="text-[13px] text-zinc-700">
        {label}
        {tip && <Tip id={id}>{tip}</Tip>}
      </div>
      <div className={`font-mono text-[13px] tabular-nums ${strong ? "font-bold text-zinc-900" : "text-zinc-900"}`}>{value}</div>
      <div className="break-words font-mono text-[11px] leading-snug text-zinc-500">{source}</div>
    </div>
  );
}

function Table({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 sm:px-5">
      <div className="hidden gap-x-4 border-b border-zinc-200 py-2 text-[10px] font-black tracking-wider text-zinc-400 sm:grid sm:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1.1fr)]">
        <span>항목</span>
        <span>값</span>
        <span>출처</span>
      </div>
      {children}
    </div>
  );
}

function Section({ id, label, title, note, children }: { id: string; label: string; title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="mb-8 scroll-mt-20">
      <h2 className="mb-2 flex items-baseline gap-2">
        <span className="text-xs font-black tracking-wider text-[#D81E05]">{label}</span>
        <span className="text-lg font-black text-zinc-900">{title}</span>
      </h2>
      {note && <p className="mb-3 text-xs leading-relaxed text-zinc-500">{note}</p>}
      {children}
    </section>
  );
}

function Shell({ name, scientific, id, children }: { name: string; scientific: string; id: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-5 sm:py-8">
      <Link href={`/species/${encodeURIComponent(id)}`} className="mb-4 inline-flex min-h-[40px] items-center gap-1.5 text-xs text-zinc-500 transition hover:text-zinc-900">
        ← {name} 상세
      </Link>
      <p className="text-xs font-black tracking-wider text-[#D81E05]">CALCULATION</p>
      <h1 className="mt-1 text-2xl font-black leading-tight tracking-tight text-zinc-900 sm:text-3xl">{name} — 위험 점수 계산 근거</h1>
      <p className="mt-1 text-sm italic text-zinc-500">{scientific}</p>
      {children}
    </div>
  );
}

const TREND_SOURCE: Record<string, string> = {
  iucn: "IUCN 추세 (species.iucn_population_trend)",
  korean: "한글 추세 (species.population_trend) — IUCN 추세 없음·Unknown",
  default: "추세 정보 없음 → 기본값 −0.02",
};
const K_SOURCE: Record<string, string> = {
  damuth: "Damuth 식 (체중·서식 면적)",
  fallback: "기존 식 (r ≥ 0)",
  fallback_declining: "기존 식 (감소 추세 r < 0)",
};
const BRANCH_LABEL: Record<string, string> = {
  none: "경보 0표 → 배율",
  single: "경보 1표 → 배율",
  blend: "경보 2표 이상 → max 블렌딩",
};
const TREND_KIND_LABEL: Record<string, string> = {
  sharp_decline: "급감",
  recovering: "증가·회복",
  decline: "감소",
};

// ---------- 페이지 ----------

export default function CalculationPage({ params }: { params: { id: string } }) {
  const species = getSpeciesById(params.id);
  if (!species) notFound();
  const name = species.common_name_ko ?? species.common_name_en ?? species.scientific_name;
  const tipping = getTippingPoint(species.id);
  const isExtinct = species.category === "EX" || species.category === "EW";
  const provenance = {
    db: formatDbVersion(dbUserVersion()),
    iucn: iucnQueriedLabel({ iucnSyncedAt: species.iucn_synced_at, iucnDetailsSyncedAt: species.iucn_details_synced_at }),
    computed: kstDate(tipping?.computed_at) ?? "없음",
  };
  const provenanceBox = (
    <p className="mt-3 rounded-xl bg-zinc-50 px-3 py-2 text-[11px] leading-relaxed text-zinc-500">
      데이터 출처: LastWatch DB {provenance.db} · IUCN API 조회일 {provenance.iucn} · 계산일 {provenance.computed}
    </p>
  );

  if (isExtinct) {
    return (
      <Shell name={name} scientific={species.scientific_name} id={species.id}>
        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 text-sm leading-relaxed text-zinc-700">
          <p className="font-bold text-zinc-900">절멸·야생절멸 종은 위험 점수를 계산하지 않습니다.</p>
          <p className="mt-2">
            IUCN 등급이 {species.category} 인 종은 레이어 계산 없이 점수를 <b>100</b> 으로 고정합니다 (LastWatch 규칙, 계산값 아님).
            그래서 이 종에는 보여줄 중간값이 없습니다.
          </p>
          <Link href={`/extinct/${encodeURIComponent(species.id)}`} className="mt-3 inline-block text-xs font-bold text-[#D81E05] underline">
            절멸 종 페이지 보기 →
          </Link>
        </div>
        {provenanceBox}
      </Shell>
    );
  }

  const payload = tipping?.payload as (TippingPointResult & { engine_version?: string; inputs?: TippingInputs; aggregation?: AggregationTrace }) | undefined;
  const pop = inferPopulationWithSource(species);
  if (!tipping || !payload || pop.value == null) {
    return (
      <Shell name={name} scientific={species.scientific_name} id={species.id}>
        <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-5 text-sm leading-relaxed text-zinc-700">
          <p className="font-bold text-zinc-900">이 종은 LastWatch 위험 점수가 산출되지 않았습니다.</p>
          <p className="mt-2">
            v5 는 실측 개체수(수기 입력 또는 IUCN 평가의 개체수)가 있는 종만 계산합니다. 이 종은 개체수 자료가 없어
            계산 근거도 없습니다. IUCN 등급·Criterion 으로 개체수를 추정하지 않습니다.
          </p>
          <Link href="/methodology#coverage" className="mt-3 inline-block text-xs font-bold text-[#D81E05] underline">
            산출 범위 보기 →
          </Link>
        </div>
        {provenanceBox}
      </Shell>
    );
  }

  const inp = payload.inputs;
  const agg = aggregationOf(species, pop.value, payload)!;
  const ews = payload.layer_scores.ews;
  const pva = payload.layer_scores.pva;
  const ne = payload.layer_scores.iucn;
  const W = V5_SPEC.weights;
  const AT = V5_SPEC.alertThresholds;
  const P = V5_SPEC.pva;
  const tier = TIERS.find((t) => t.tier === tipping.intervention_tier);
  const storedMatches = agg.score === tipping.consensus_score;
  const pvaTerms = {
    short: P.weights.pExtShort * pva.P_ext_50yr,
    long: P.weights.pExtLong * pva.P_ext_100yr,
    deficit: pva.ratio != null ? P.weights.deficit * (1 - pva.ratio) : null,
  };
  const skip = inp?.K_damuth_skip as DamuthSkipReason | null | undefined;
  const mammalD = DAMUTH_CONSTANTS["포유류"]?.dPerKg;

  return (
    <Shell name={name} scientific={species.scientific_name} id={species.id}>
      {/* 요약 */}
      <div className="mt-5 grid gap-3 sm:grid-cols-[auto_1fr]">
        <div className="rounded-2xl border border-zinc-200 bg-white px-5 py-4">
          <p className="text-[10px] font-black tracking-wider text-zinc-400">LASTWATCH 위험 점수 (v5)</p>
          <p className="mt-1 font-mono text-4xl font-black tabular-nums text-zinc-900">
            {tipping.consensus_score.toFixed(1)}
            <span className="ml-1 text-base font-bold text-zinc-400">/100</span>
          </p>
          <p className="mt-1 text-xs font-bold" style={{ color: tier?.color }}>
            {tipping.intervention_tier} · {tier?.label}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white px-5 py-4 text-xs leading-relaxed text-zinc-600">
          <p>
            <b className="text-zinc-900">LastWatch 자체 계산이며 IUCN 공식 지표가 아닙니다.</b> 아래 숫자는 엔진
            {payload.engine_version ? ` ${payload.engine_version}` : ""} 이 계산하면서 남긴 기록(<code className="font-mono">tipping_points.payload_json</code>)을
            그대로 옮긴 것이고, 이 페이지가 다시 계산하지 않습니다.
          </p>
          {agg.floor.applied ? (
            <p className="mt-2 rounded-lg bg-[#FC7F3F]/10 px-2.5 py-1.5 text-[#9a3d0b]">
              <b>개체수 하한 규칙 적용됨</b> — 하한 적용 전 점수 <b>{agg.scoreWithoutFloor.toFixed(1)}</b>, 최종{" "}
              {agg.score.toFixed(1)} 은 N0 &lt; {agg.floor.below} 구간의 하한 {agg.floor.value} 이 정한 값입니다 (LastWatch 자체 규칙, 특허 명세서 미기재).
            </p>
          ) : (
            <p className="mt-2">
              개체수 하한: {agg.floor.below != null ? `N0 < ${agg.floor.below} 구간(하한 ${agg.floor.value})이지만 점수가 더 높아 미적용` : "N0 ≥ 500 이라 해당 없음"}.
            </p>
          )}
          <p className="mt-2 text-zinc-400">
            저장 점수와 이 기록의 일치: {storedMatches ? "✓ 같음" : `✗ 다름 (기록 ${agg.score.toFixed(1)} · 저장 ${tipping.consensus_score.toFixed(1)})`}
          </p>
        </div>
      </div>
      {provenanceBox}
      <p className="mt-2 text-[11px] text-zinc-400">
        계산식 전체 설명은{" "}
        <Link href="/methodology" className="font-bold text-[#D81E05] underline">
          /methodology
        </Link>
        , 특허 명세서와 다른 점은{" "}
        <Link href="/methodology#spec-diff" className="font-bold text-[#D81E05] underline">
          명세서와 다른 점
        </Link>
        , 전 종 값은{" "}
        <a href="/species/export" download className="font-bold text-[#D81E05] underline">
          CSV 내려받기
        </a>
        .
      </p>

      <div className="mt-8" />

      <Section id="inputs" label="INPUT" title="입력값" note="세 레이어가 함께 쓰는 값. 개체수는 실측값만 쓴다 (v5).">
        <Table>
          <Row
            id="n0"
            label="기준 개체수 N0"
            value={`${n0(pop.value)} 마리`}
            source={`species.${pop.source}`}
            strong
            tip={
              <>
                N0 = species.mature_individuals 가 있으면 그 값, 없으면 species.iucn_population_size. 주의: 두 컬럼은 이름과 내용이 반대다 —
                mature_individuals 는 <b>전체 개체수</b>, iucn_population_size 는 IUCN 평가의 <b>성숙 개체수</b>. 등급·Criterion 으로 추정하지 않는다.
              </>
            }
          />
          <Row id="total" label="전체 개체수" value={species.mature_individuals != null ? `${n0(species.mature_individuals)} 마리` : "자료 없음"} source="species.mature_individuals" />
          <Row
            id="mature"
            label="성숙 개체수"
            value={species.iucn_population_size != null ? `${n0(species.iucn_population_size)} 마리` : "자료 없음"}
            source={`species.iucn_population_size${species.iucn_assessment_year ? ` (IUCN ${species.iucn_assessment_year}년 평가)` : ""}`}
          />
          <Row
            id="trend"
            label="개체수 추세"
            value={`${inp?.trend_iucn ?? species.iucn_population_trend ?? "—"} / ${inp?.trend_korean ?? species.population_trend ?? "—"}`}
            source="species.iucn_population_trend / species.population_trend"
          />
          <Row
            id="r"
            label="성장률 r"
            value={f(inp?.r, 2)}
            source={inp ? TREND_SOURCE[inp.r_source] ?? inp.r_source : "—"}
            tip={
              <>
                IUCN 추세 우선: Decreasing −0.06 · Stable 0 · Increasing +0.06. IUCN 추세가 없거나 Unknown 이면 한글 추세 칸
                (감소 −0.06 · 증가·회복 +0.04 · 안정 0 · 그 밖 −0.02), 둘 다 없으면 −0.02.
              </>
            }
          />
          <Row
            id="lambda"
            label="λ 평균 · 표준편차"
            value={`${f(inp?.lambda_mean, 4)} · ${f(inp?.lambda_sd, 2)}`}
            source="trendToLambdaV4 (lib/tipping-point.ts)"
            tip={<>λ_mean = e^r. λ_sd = 0.15 (환경 확률성, 로그정규) — 모든 종에 같은 값.</>}
          />
          <Row
            id="k"
            label="환경 수용력 K"
            value={f(inp?.K, 1)}
            source={inp ? `${K_SOURCE[inp.K_source] ?? inp.K_source}${skip ? ` — Damuth 미사용: ${DAMUTH_SKIP_LABEL[skip] ?? skip}` : ""}` : "—"}
            tip={
              <>
                서식 면적·체중·검증된 Damuth 상수가 모두 있으면 K = d · W<sup>−0.75</sup> · A (Damuth 1981; 포유류 d = {mammalD ?? "—"} /km²·kg<sup>0.75</sup>, W 체중 kg, A 서식 면적 km²).
                하나라도 없으면 기존 식: r &lt; 0 이면 max(1.5·N0, N0 + 100), 아니면 max(1.2·N0, N0 + 50).
              </>
            }
          />
          <Row
            id="mass"
            label="체중"
            value={inp?.mass_g_used != null ? `${n0(Math.round(inp.mass_g_used))} g` : "자료 없음"}
            source={species.mass_g && species.mass_g > 0 ? "species.mass_g" : species.mass_g_external ? `species.mass_g_external (${species.mass_g_external_source ?? "출처 미기재"})` : "—"}
          />
          <Row
            id="area"
            label="서식 면적"
            value={inp?.habitat_area_km2 != null ? `${n0(inp.habitat_area_km2)} km²` : "자료 없음 (NULL)"}
            source="species.habitat_area_km2"
          />
          <Row
            id="allee"
            label="Allee 문턱 · 준멸종 문턱"
            value={`${n0(inp?.N_allee)} · ${n0(inp?.N_qext)}`}
            source="evaluateTippingPoint"
            tip={<>N_allee = max(20, round(0.05·N0)) — 이보다 적으면 그해 기대 개체수에 N/N_allee 를 곱한다. 준멸종 = N &lt; 2.</>}
          />
          <Row
            id="sim"
            label="시뮬레이션 · 기간 · 시드"
            value={`${n0(inp?.n_sim)}회 · ${n0(inp?.T)}년 · ${inp?.seed ?? "—"}`}
            source="V5_SPEC.pva.nSim · years, 시드 = 종 ID 해시"
          />
          <Row
            id="life"
            label="생활사 분류"
            value={inp ? `${inp.class_name ?? "—"}${inp.life_from_class ? "" : " (기본값)"}` : "—"}
            source="species.class_name → LIFE_HISTORY"
            tip={
              inp ? (
                <>
                  세대시간 {inp.life.generation_time}년 · r_max {inp.life.r_max} · Ne/Nc {inp.life.ne_nc}.
                  {inp.life_from_class ? "" : " 이 분류군 전용 값이 없어 기본값을 썼다."}
                </>
              ) : undefined
            }
          />
        </Table>
      </Section>

      <Section
        id="ews"
        label="LAYER 1"
        title="레이어 1 · EWS (조기경보신호)"
        note="시계열이 없어 추세의 성장률 r 로 τ 를 추정한 값이다 (추세 기반 추정값). 명세서의 시계열 EWS 와 다르다."
      >
        <Table>
          <Row id="tauraw" label="τ (자르기 전)" value={f(ews.tau_raw, 4)} source="layer_scores.ews.tau_raw" tip={<>τ_raw = −r / {V5_SPEC.ews.tauScale}</>} />
          <Row id="tau" label="τ" value={f(ews.tau, 4)} source="layer_scores.ews.tau" tip={<>τ = clamp(τ_raw, −1, 1)</>} />
          <Row
            id="composite"
            label="τ 가중합"
            value={f(ews.composite, 4)}
            source="layer_scores.ews.composite"
            tip={
              <>
                AR1 {V5_SPEC.ews.tauWeights.ar1} · 분산 {V5_SPEC.ews.tauWeights.variance} · 왜도 {V5_SPEC.ews.tauWeights.skew} 가중치 × τ — 시계열이 없어 세 지표에 같은 τ 를 쓴다.
              </>
            }
          />
          <Row
            id="ewsscore"
            label="EWS 점수"
            value={f(ews.score, 2)}
            source="layer_scores.ews.score"
            strong
            tip={<>점수 = σ({V5_SPEC.ews.gain} · τ 가중합) · 100, σ(x) = 1 / (1 + e^−x)</>}
          />
          <Row id="ewsconf" label="EWS 신뢰도" value={f(ews.confidence, 2)} source="V5_SPEC.ews.confidence" tip={<>모든 종 같은 상수 (시계열이 없어 낮게 둔다).</>} />
        </Table>
      </Section>

      <Section
        id="pva"
        label="LAYER 2"
        title="레이어 2 · PVA (개체군 생존분석)"
        note="Ricker 밀도의존 + 환경 확률성(로그정규 λ) + 인구 확률성(Poisson) + Allee 효과 몬테카를로."
      >
        <Table>
          <Row
            id="valid"
            label="유효 궤적 / 전체"
            value={pva.n_valid != null ? `${n0(pva.n_valid)} / ${n0((pva.n_valid ?? 0) + (pva.n_invalid ?? 0))}` : "—"}
            source="layer_scores.pva.n_valid · n_invalid"
            tip={
              <>
                무효 궤적 {n0(pva.n_invalid)}개{pva.n_ext_time_nan ? ` (그중 멸종 시각이 NaN 이던 궤적 ${pva.n_ext_time_nan}개)` : ""} 를 확률·분위수에서 뺐다.
                N 이 K 를 크게 넘은 해에 성장률이 음수면 Ricker 식이 폭주해 Infinity·NaN 이 되는 궤적이다 (결정 8, 2026-10-03).
              </>
            }
          />
          <Row id="p50" label="50년 내 준멸종 확률" value={f(pva.P_ext_50yr, 4)} source="layer_scores.pva.P_ext_50yr" tip={<>50년 안에 N &lt; 2 가 된 유효 궤적 수 ÷ 유효 궤적 수</>} />
          <Row id="p100" label="100년 내 준멸종 확률" value={f(pva.P_ext_100yr, 4)} source="layer_scores.pva.P_ext_100yr" />
          <Row
            id="nsafe"
            label="안전 개체수 N_safe · 비율"
            value={`${f(pva.N_safe, 1)} · ${f(pva.ratio, 4)}`}
            source="layer_scores.pva.N_safe · ratio"
            tip={<>N_safe = max({P.safeKFraction}·K, {P.safeMinN}), 비율 = min(1, N0 / N_safe)</>}
          />
          <Row
            id="pvaterms"
            label="가중 항"
            value={`${f(pvaTerms.short, 4)} + ${f(pvaTerms.long, 4)} + ${f(pvaTerms.deficit, 4)}`}
            source="V5_SPEC.pva.weights"
            tip={<>{P.weights.pExtShort}·P50 + {P.weights.pExtLong}·P100 + {P.weights.deficit}·(1 − 비율)</>}
          />
          <Row id="pvascore" label="PVA 점수" value={f(pva.score, 2)} source="layer_scores.pva.score" strong tip={<>가중 항의 합 × 100 (0~100 으로 자름)</>} />
          <Row id="median" label="준멸종 시각 중앙값" value={pva.median_T_ext != null ? `${f(pva.median_T_ext, 1)} 년` : "준멸종 궤적 없음"} source="layer_scores.pva.median_T_ext" />
          <Row id="pvaconf" label="PVA 신뢰도" value={f(pva.confidence, 2)} source="V5_SPEC.pva.confidence" />
        </Table>
      </Section>

      <Section id="ne" label="LAYER 3" title="레이어 3 · 유효개체군 Ne" note="Ne/Nc 비율로 N0 를 유효개체군으로 바꾸고, 50/500 규칙을 구간 점수로 바꾼다.">
        <Table>
          <Row
            id="nenc"
            label="Ne/Nc 비율"
            value={f(ne.ne_nc ?? inp?.life.ne_nc, 2)}
            source={`LIFE_HISTORY["${species.class_name ?? "기본값"}"].ne_nc`}
            tip={<>분류군별 고정 비율. 문헌(Frankham 1995, Palstra & Ruzzante 2008)과의 차이는 /methodology 에 정리돼 있다.</>}
          />
          <Row id="nevalue" label="유효개체군 Ne" value={n0(ne.Ne)} source="layer_scores.iucn.Ne" tip={<>Ne = round(N0 × Ne/Nc)</>} />
          <Row
            id="neband"
            label="해당 구간"
            value={ne.band_below != null ? `Ne < ${ne.band_below} (${ne.genetic_status})` : `Ne ≥ 1000 (${ne.genetic_status})`}
            source="V5_SPEC.neBands"
            tip={
              <>
                {V5_SPEC.neBands.map((b) => `Ne < ${b.below} → ${b.score}`).join(" · ")} · 그 밖 {V5_SPEC.neSafe.score}. 50/500 규칙(Franklin 1980)을 구간 점수로 바꾼 LastWatch 규칙.
              </>
            }
          />
          <Row id="nescore" label="Ne 점수" value={f(ne.score, 2)} source="layer_scores.iucn.score" strong />
          <Row id="neconf" label="Ne 신뢰도" value={f(ne.confidence, 2)} source="V5_SPEC.neConfidence" />
        </Table>
      </Section>

      <Section id="aggregation" label="TOTAL" title="종합 — 가중합 → 다수결 → 신뢰도 → 개체수 하한 → 추세 보정" note="모든 값은 payload_json.aggregation (엔진이 남긴 집계 기록).">
        <Table>
          <Row
            id="weighted"
            label="가중합 S"
            value={`${f(W.ews * agg.layers.ews)} + ${f(W.pva * agg.layers.pva)} + ${f(W.iucn * agg.layers.iucn)} = ${f(agg.weighted)}`}
            source="aggregation.weighted · V5_SPEC.weights"
            strong
            tip={<>S = {W.ews}·EWS + {W.pva}·PVA + {W.iucn}·Ne (고정 가중치 — 명세서의 신뢰도 동적 가중치는 구현돼 있지 않다)</>}
          />
          <Row
            id="alerts"
            label="경보 표 m"
            value={`${agg.m} 표 (EWS ${agg.alerts.ews ? "●" : "○"} · PVA ${agg.alerts.pva ? "●" : "○"} · Ne ${agg.alerts.iucn ? "●" : "○"})`}
            source="aggregation.alerts · V5_SPEC.alertThresholds"
            tip={<>레이어 점수가 문턱을 넘으면 1표: EWS &gt; {AT.ews} · PVA &gt; {AT.pva} · Ne &gt; {AT.iucn}</>}
          />
          <Row
            id="branch"
            label={BRANCH_LABEL[agg.branch]}
            value={
              agg.branch === "blend"
                ? `${agg.blendAlpha}·${f(agg.weighted)} + ${f(1 - (agg.blendAlpha ?? 0), 1)}·${f(agg.maxLayer)} = ${f(agg.afterMajority)}`
                : `${f(agg.weighted)} × ${agg.majorityFactor} = ${f(agg.afterMajority)}`
            }
            source={agg.branch === "blend" ? "V5_SPEC.majorityBlend.alpha" : "V5_SPEC.consensusMultiplier"}
            strong
            tip={
              <>
                m = 0 → S × {V5_SPEC.consensusMultiplier.zero} · m = 1 → S × {V5_SPEC.consensusMultiplier.one} · m ≥ 2 → {V5_SPEC.majorityBlend.alpha}·S + {f(1 - V5_SPEC.majorityBlend.alpha, 1)}·max(레이어)
                (m ≥ 2 블렌딩은 2026-10-03 결정 6 으로 명세서식 반영. 최댓값 ≥ 가중합이라 점수를 올리기만 한다)
              </>
            }
          />
          <Row
            id="confidence"
            label="종합 신뢰도"
            value={`${f(agg.confidence.overall, 4)} → ${agg.compressionApplied ? `압축 ${f(agg.afterCompression)}` : "압축 없음"}`}
            source="aggregation.confidence · V5_SPEC.lowConfidence"
            tip={
              <>
                신뢰도 = {W.ews}·{agg.confidence.ews} + {W.pva}·{agg.confidence.pva} + {W.iucn}·{agg.confidence.iucn}. {V5_SPEC.lowConfidence.below} 미만이면 점수 × {V5_SPEC.lowConfidence.scale} + {V5_SPEC.lowConfidence.add}.
                레이어 신뢰도가 상수라 지금은 모든 종이 같은 값이다.
              </>
            }
          />
          <Row
            id="floor"
            label="개체수 하한"
            value={
              agg.floor.applied
                ? `적용됨: max(${f(agg.afterCompression)}, ${agg.floor.value}) = ${f(agg.afterFloor)}`
                : agg.floor.below != null
                  ? `미적용 (하한 ${agg.floor.value} < ${f(agg.afterCompression)})`
                  : "해당 없음 (N0 ≥ 500)"
            }
            source="aggregation.floor · V5_SPEC.floorBands"
            strong={agg.floor.applied}
            tip={
              <>
                {V5_SPEC.floorBands.map((b) => `N0 < ${b.below} → ${b.floor}`).join(" · ")}. 점수가 하한보다 낮으면 하한까지 끌어올린다 (Math.max).
                LastWatch 자체 규칙이며 특허 명세서에 기재되지 않았다.
              </>
            }
          />
          <Row
            id="trendadj"
            label="추세 보정"
            value={agg.trend.kind ? `${TREND_KIND_LABEL[agg.trend.kind]} ${agg.trend.delta > 0 ? "+" : ""}${agg.trend.delta}` : "없음 (0)"}
            source={`species.population_trend = "${agg.trend.input ?? "—"}"`}
            tip={
              <>
                한글 추세 칸 기준: 급감 +{V5_SPEC.trendAdjust.sharpDecline} · 감소 +{V5_SPEC.trendAdjust.decline} · 증가·회복 {V5_SPEC.trendAdjust.recovering}. 0~100 으로 자른다.
              </>
            }
          />
          <Row id="final" label="최종 (반올림 전)" value={f(agg.final, 4)} source="aggregation.final" />
          <Row
            id="score"
            label="LastWatch 위험 점수"
            value={`${agg.score.toFixed(1)} → ${tipping.intervention_tier}`}
            source="tipping_points.consensus_score · intervention_tier"
            strong
            tip={<>소수 첫째 자리 반올림. 티어: {TIERS.map((t) => `${t.tier} ${t.min}~${Math.min(t.max, 100)}`).join(" · ")}</>}
          />
          <Row
            id="nofloor"
            label="하한 적용 전 점수"
            value={agg.scoreWithoutFloor.toFixed(1)}
            source="aggregation.scoreWithoutFloor"
            tip={<>같은 계산에서 개체수 하한 단계만 뺀 값 (추세 보정은 포함).</>}
          />
        </Table>
      </Section>

      <p className="mb-6 text-[11px] leading-relaxed text-zinc-400">
        숫자는 반올림해 표시한다 (중간값 소수 둘째·넷째 자리). 원값은 CSV 또는 DB 의 payload_json 에 있다.
      </p>
    </Shell>
  );
}
