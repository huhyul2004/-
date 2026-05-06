// 4-Tuple Hero — 발명 핵심: 4개 임계점 일자를 prominent 하게 표시
// 종 상세 페이지 최상단에 배치
import type { TippingPointResult } from "@/lib/tipping-point";

const MONTHS_KO = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];

function fmt(iso: string): { year: string; full: string; rel: string } {
  const d = new Date(iso);
  const today = new Date("2026-05-06");
  const days = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  let rel = "";
  if (days <= 0) rel = "지금 즉시";
  else if (days < 365) rel = `${days}일 후`;
  else if (days < 365 * 2) rel = `약 ${(days / 365).toFixed(1)}년 후`;
  else rel = `약 ${Math.round(days / 365)}년 후`;
  return {
    year: String(d.getFullYear()),
    full: `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`,
    rel,
  };
}

const TIER_BG: Record<string, string> = {
  T0: "bg-[#60C659]",
  T1: "bg-[#CCE226]",
  T2: "bg-[#F9E814]",
  T3: "bg-[#FC7F3F]",
  T4: "bg-[#D81E05]",
  EX: "bg-zinc-900",
};
const TIER_TEXT: Record<string, string> = {
  T0: "text-white",
  T1: "text-zinc-900",
  T2: "text-zinc-900",
  T3: "text-white",
  T4: "text-white",
  EX: "text-zinc-100",
};

interface CardProps {
  num: string;
  label: string;
  date: string;
  rel: string;
  caption: string;
  color: string;
  ringColor: string;
  isUrgent?: boolean;
  dark?: boolean;
}

function PointCard({ num, label, date, rel, caption, color, ringColor, isUrgent, dark }: CardProps) {
  const cardBg = dark ? "bg-zinc-900/80 border-zinc-800" : "bg-white/90 border-zinc-200/80";
  const labelText = dark ? "text-zinc-300" : "text-zinc-700";
  const dateText = dark ? "text-zinc-50" : "text-zinc-900";
  const subText = dark ? "text-zinc-500" : "text-zinc-500";

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border ${cardBg} backdrop-blur p-4 transition hover:-translate-y-0.5 hover:shadow-xl sm:p-5`}
      style={isUrgent ? { boxShadow: `0 0 0 2px ${color}33, 0 8px 24px ${color}22` } : undefined}
    >
      {/* Top accent bar */}
      <div className="absolute left-0 right-0 top-0 h-1" style={{ backgroundColor: color }} />

      {/* Number bubble */}
      <div className="flex items-baseline justify-between">
        <span
          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-black"
          style={{
            backgroundColor: color,
            color: ringColor === "yellow" ? "#18181b" : "#fff",
          }}
        >
          {num}
        </span>
        {isUrgent && (
          <span className="relative flex h-2.5 w-2.5">
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
              style={{ backgroundColor: color }}
            />
            <span
              className="relative inline-flex h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: color }}
            />
          </span>
        )}
      </div>

      <p className={`mt-3 text-[11px] font-black tracking-[0.15em] ${labelText}`}>{label}</p>

      {/* Date — biggest */}
      <p className={`mt-2 font-mono text-2xl font-black tabular-nums leading-tight tracking-tight ${dateText} sm:text-3xl`}>
        {date}
      </p>
      <p className={`mt-0.5 text-[11px] font-bold ${subText}`}>{rel}</p>

      <p className={`mt-3 text-[11px] leading-relaxed ${subText}`}>{caption}</p>
    </div>
  );
}

export function TippingHero({
  result,
  dark = false,
}: {
  result: TippingPointResult;
  dark?: boolean;
}) {
  const tier = result.intervention_tier;
  const isExtinct = tier === "EX";
  const tierBg = TIER_BG[tier] ?? "bg-zinc-500";
  const tierText = TIER_TEXT[tier] ?? "text-white";

  const open = fmt(result.dates.intervention_open_date);
  const close = fmt(result.dates.intervention_deadline_date);
  const golden = result.dates.golden_window_date ? fmt(result.dates.golden_window_date) : null;
  const extinction = result.dates.extinction_estimate_date ? fmt(result.dates.extinction_estimate_date) : null;

  const wrapperBg = dark
    ? "rounded-3xl border border-zinc-800 bg-zinc-900/40"
    : "rounded-3xl border border-zinc-200/60 bg-gradient-to-br from-zinc-50/80 via-white/60 to-zinc-50/80";
  const headLabel = dark ? "text-zinc-500" : "text-zinc-500";
  const headTitle = dark ? "text-zinc-50" : "text-zinc-900";
  const subText = dark ? "text-zinc-400" : "text-zinc-600";

  return (
    <section className={`${wrapperBg} p-5 backdrop-blur sm:p-7`}>
      {/* Header — Tier 강조 */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className={`inline-block h-px w-8 ${dark ? "bg-zinc-600" : "bg-zinc-400"}`} />
            <span className={`text-[10px] font-black tracking-[0.25em] ${headLabel}`}>
              TIPPING POINT TIMELINE
            </span>
          </div>
          <h2 className={`mt-2 text-xl font-black leading-tight tracking-tight ${headTitle} sm:text-2xl`}>
            임계점 4-tuple 연표
          </h2>
          <p className={`mt-1 text-[12px] leading-relaxed ${subText}`}>
            {result.rationale}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className={`text-[10px] font-black tracking-wider ${headLabel}`}>SCORE</p>
            <p className={`text-3xl font-black tabular-nums leading-none ${headTitle}`}>
              {result.consensus_score.toFixed(0)}
              <span className="text-sm font-bold text-zinc-400">/100</span>
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-black ${tierBg} ${tierText}`}
          >
            {tier}
          </span>
        </div>
      </div>

      {/* 4 Big Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <PointCard
          num="①"
          label="개입 가능 시점"
          date={open.full}
          rel={open.rel}
          caption="지금이 가장 효과적인 보전 개시 시점"
          color="#60C659"
          ringColor="green"
          dark={dark}
        />
        <PointCard
          num="②"
          label="개입 마감"
          date={close.full}
          rel={close.rel}
          caption={
            result.years_until.deadline === 0
              ? "이미 위급 단계 — 비용·난이도 급증 중"
              : "이 시점 이후 일반 보전조치 효과 급감"
          }
          color="#FC7F3F"
          ringColor="orange"
          isUrgent={result.years_until.deadline < 5}
          dark={dark}
        />
        <PointCard
          num="③"
          label="골든타임 진입"
          date={golden ? golden.full : "—"}
          rel={golden ? golden.rel : "산출 불가"}
          caption="응급 조치 (포획·이주·인공증식) 만 효과 있는 단계"
          color="#D81E05"
          ringColor="red"
          isUrgent={(result.years_until.golden_window ?? 99) < 10}
          dark={dark}
        />
        <PointCard
          num="④"
          label={isExtinct ? "절멸 발생" : "무대응시 멸종 (p10)"}
          date={extinction ? extinction.full : "—"}
          rel={extinction ? extinction.rel : "산출 불가"}
          caption={
            isExtinct
              ? "기록상 절멸 시기"
              : "보전 조치 없을 시 PVA 시뮬레이션 10퍼센타일 비관 시나리오"
          }
          color={dark ? "#52525b" : "#18181b"}
          ringColor="black"
          dark={dark}
        />
      </div>

      {/* Footer — 출처 */}
      <p className={`mt-5 text-[10px] leading-relaxed ${subText}`}>
        ① · ②: 평균 trajectory 의 Tier 임계 N(t)/N₀ 비율 도달 시점 선형 보간 ·
        ③: T4 진입 (N₀ × 0.15) 시점 ·
        ④: PVA 1500회 stochastic Ricker simulation 의 p10 quasi-extinction 도달 일자 ·
        Beissinger &amp; McCullough 2002, Drake &amp; Griffen 2010 Nature
      </p>
    </section>
  );
}
