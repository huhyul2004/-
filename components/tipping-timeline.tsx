// 임계점 엔진 결과를 시각화하는 연표 컴포넌트
// 종 상세 페이지에 박힘
import type { TippingPointResult } from "@/lib/tipping-point";

const TIER_INFO: Record<string, { label: string; color: string; bg: string; border: string; gradient: string }> = {
  T0: { label: "T0 · 안정", color: "text-[#3a8836]", bg: "bg-[#60C659]", border: "border-[#60C659]", gradient: "from-[#60C659]/10 to-transparent" },
  T1: { label: "T1 · 주의", color: "text-[#838f1c]", bg: "bg-[#CCE226]", border: "border-[#CCE226]", gradient: "from-[#CCE226]/15 to-transparent" },
  T2: { label: "T2 · 경계", color: "text-[#a18f0c]", bg: "bg-[#F9E814]", border: "border-[#F9E814]", gradient: "from-[#F9E814]/15 to-transparent" },
  T3: { label: "T3 · 위급", color: "text-[#c46928]", bg: "bg-[#FC7F3F]", border: "border-[#FC7F3F]", gradient: "from-[#FC7F3F]/20 to-transparent" },
  T4: { label: "T4 · 임박", color: "text-[#a01103]", bg: "bg-[#D81E05]", border: "border-[#D81E05]", gradient: "from-[#D81E05]/20 to-transparent" },
  EX: { label: "EX · 절멸", color: "text-zinc-400", bg: "bg-zinc-900", border: "border-zinc-800", gradient: "from-zinc-900/30 to-transparent" },
};

const MONTHS_KO = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];

function fmtKoreanDate(iso: string): { year: string; monthDay: string; full: string } {
  const d = new Date(iso);
  return {
    year: String(d.getFullYear()),
    monthDay: `${MONTHS_KO[d.getMonth()]} ${d.getDate()}일`,
    full: `${d.getFullYear()}년 ${MONTHS_KO[d.getMonth()]} ${d.getDate()}일`,
  };
}

function relativeTime(days: number): string {
  if (days === 0) return "지금 즉시";
  if (days < 0) return `${Math.abs(Math.round(days / 365))}년 전`;
  if (days < 365) return `${Math.round(days)}일 후`;
  const years = days / 365;
  if (years < 2) return `약 ${years.toFixed(1)}년 후`;
  return `약 ${Math.round(years)}년 후`;
}

export function TippingTimeline({
  result,
  dark = false,
}: {
  result: TippingPointResult;
  dark?: boolean;
}) {
  const tierInfo = TIER_INFO[result.intervention_tier] ?? TIER_INFO.T0;
  const isExtinct = result.intervention_tier === "EX";

  const cardCls = dark
    ? "rounded-3xl border border-zinc-800 bg-zinc-900/80 backdrop-blur text-zinc-100"
    : "rounded-3xl border border-zinc-200/80 bg-white/80 backdrop-blur text-zinc-900";
  const subCls = dark ? "text-zinc-400" : "text-zinc-600";
  const labelCls = dark ? "text-zinc-500" : "text-zinc-400";
  const dividerCls = dark ? "border-zinc-800" : "border-zinc-200";

  const milestones = [
    {
      key: "open",
      label: "개입 가능 시점",
      caption: "지금이 가장 효과적입니다",
      date: result.dates.intervention_open_date,
      days: 0,
      color: "#60C659",
      pulse: false,
    },
    {
      key: "deadline",
      label: "개입 마감",
      caption:
        result.years_until.deadline === 0
          ? "이미 위급 단계 — 지체할 시간 없음"
          : "이 시점 이후 비용·난이도가 급격히 상승합니다",
      date: result.dates.intervention_deadline_date,
      days: result.years_until.deadline * 365,
      color: "#FC7F3F",
      pulse: result.years_until.deadline < 5,
    },
    result.dates.golden_window_date && {
      key: "golden",
      label: "골든타임 (T4 진입)",
      caption: "포획·이주 등 응급 조치만 남는 단계",
      date: result.dates.golden_window_date,
      days: (result.years_until.golden_window ?? 0) * 365,
      color: "#D81E05",
      pulse: (result.years_until.golden_window ?? 99) < 10,
    },
    result.dates.extinction_estimate_date && {
      key: "extinction",
      label: isExtinct ? "절멸 발생" : "무대응시 멸종 예상",
      caption: isExtinct ? "기록상 절멸 시기" : "PVA 시뮬레이션 10퍼센타일 — 보전 조치 없을 시",
      date: result.dates.extinction_estimate_date,
      days: (result.years_until.extinction ?? 0) * 365,
      color: dark ? "#52525b" : "#18181b",
      pulse: false,
    },
  ].filter(Boolean) as {
    key: string;
    label: string;
    caption: string;
    date: string;
    days: number;
    color: string;
    pulse: boolean;
  }[];

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Hero — 종합 점수 + Tier */}
      <div className={cardCls + ` overflow-hidden`}>
        <div className={`bg-gradient-to-br ${tierInfo.gradient} p-5 sm:p-6`}>
          <div className="flex items-center gap-2 text-[10px] font-black tracking-[0.25em] text-zinc-500">
            <span className={`inline-block h-px w-6 ${dark ? "bg-zinc-600" : "bg-zinc-400"}`} />
            CONSENSUS · 종합 평가
          </div>
          <div className="mt-3 flex items-end justify-between gap-3">
            <div>
              <div className="flex items-baseline gap-2">
                <span className={`text-5xl font-black tabular-nums tracking-tight sm:text-6xl ${tierInfo.color}`}>
                  {result.consensus_score.toFixed(1)}
                </span>
                <span className={`text-xs font-bold ${subCls}`}>/ 100</span>
              </div>
              <p className={`mt-1 text-[10px] font-black tracking-[0.2em] ${tierInfo.color}`}>
                {tierInfo.label}
              </p>
            </div>
            {/* Mini gauge */}
            <div className="h-2 w-32 overflow-hidden rounded-full bg-zinc-200/50">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, result.consensus_score)}%`,
                  background: "linear-gradient(to right, #60C659, #CCE226, #F9E814, #FC7F3F, #D81E05)",
                }}
              />
            </div>
          </div>
          <p className={`mt-4 text-[12.5px] leading-relaxed ${subCls}`}>{result.rationale}</p>
        </div>
        <div className={`grid grid-cols-3 border-t ${dividerCls} text-[10px]`}>
          <div className="p-3 text-center sm:p-4">
            <p className={`tracking-wider ${labelCls}`}>EWS</p>
            <p className={`mt-1 text-xl font-black tabular-nums ${dark ? "text-zinc-100" : "text-zinc-900"}`}>
              {result.layer_scores.ews.score.toFixed(0)}
            </p>
          </div>
          <div className={`border-x p-3 text-center sm:p-4 ${dividerCls}`}>
            <p className={`tracking-wider ${labelCls}`}>PVA</p>
            <p className={`mt-1 text-xl font-black tabular-nums ${dark ? "text-zinc-100" : "text-zinc-900"}`}>
              {result.layer_scores.pva.score.toFixed(0)}
            </p>
          </div>
          <div className="p-3 text-center sm:p-4">
            <p className={`tracking-wider ${labelCls}`}>IUCN</p>
            <p className={`mt-1 text-xl font-black tabular-nums ${dark ? "text-zinc-100" : "text-zinc-900"}`}>
              {result.layer_scores.iucn.score.toFixed(0)}
            </p>
          </div>
        </div>
      </div>

      {/* 연표 — 진짜 수직 타임라인 */}
      <div className={cardCls + " p-5 sm:p-7"}>
        <div className="mb-5 flex items-center gap-2 text-[10px] font-black tracking-[0.25em] text-zinc-500">
          <span className={`inline-block h-px w-6 ${dark ? "bg-zinc-600" : "bg-zinc-400"}`} />
          TIMELINE · 임계점 연표
        </div>

        <div className="relative">
          {/* Vertical gradient line */}
          <div
            className="absolute bottom-3 left-[7px] top-3 w-[2px]"
            style={{
              background:
                "linear-gradient(to bottom, #60C659 0%, #FC7F3F 50%, #D81E05 80%, " + (dark ? "#52525b" : "#18181b") + " 100%)",
              opacity: 0.4,
            }}
            aria-hidden
          />

          <ol className="space-y-5">
            {milestones.map((m) => {
              const fmt = fmtKoreanDate(m.date);
              return (
                <li key={m.key} className="relative pl-8">
                  {/* Dot */}
                  <span
                    className={`absolute left-0 top-1 inline-block h-4 w-4 rounded-full ring-4 ${dark ? "ring-zinc-900" : "ring-white"}`}
                    style={{
                      backgroundColor: m.color,
                      boxShadow: m.pulse ? `0 0 0 6px ${m.color}25, 0 0 16px ${m.color}50` : undefined,
                    }}
                    aria-hidden
                  />
                  {m.pulse && (
                    <span
                      className="absolute left-0 top-1 inline-block h-4 w-4 animate-ping rounded-full opacity-50"
                      style={{ backgroundColor: m.color }}
                      aria-hidden
                    />
                  )}

                  <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                    <p className={`text-[11px] font-black tracking-wider ${dark ? "text-zinc-300" : "text-zinc-700"}`}>
                      {m.label}
                    </p>
                    <p className={`text-[10px] tracking-wide ${labelCls}`}>{relativeTime(m.days)}</p>
                  </div>

                  <p className="mt-1 flex flex-wrap items-baseline gap-1.5 font-mono">
                    <span className={`text-[11px] tabular-nums ${labelCls}`}>{fmt.year}</span>
                    <span className={`text-base font-black tabular-nums tracking-tight ${dark ? "text-zinc-50" : "text-zinc-900"}`}>
                      {fmt.monthDay}
                    </span>
                  </p>

                  <p className={`mt-1.5 text-[11.5px] leading-relaxed ${subCls}`}>{m.caption}</p>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      {/* PVA stats — 더 임팩트 있게 */}
      <div className={cardCls + " p-5 sm:p-7"}>
        <div className="mb-4 flex items-center gap-2 text-[10px] font-black tracking-[0.25em] text-zinc-500">
          <span className={`inline-block h-px w-6 ${dark ? "bg-zinc-600" : "bg-zinc-400"}`} />
          PVA · 멸종확률 시뮬레이션
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <StatPanel
            label="50년 멸종확률"
            value={`${(result.layer_scores.pva.P_ext_50yr * 100).toFixed(0)}%`}
            ratio={result.layer_scores.pva.P_ext_50yr}
            dark={dark}
            color="#FC7F3F"
          />
          <StatPanel
            label="100년 멸종확률"
            value={`${(result.layer_scores.pva.P_ext_100yr * 100).toFixed(0)}%`}
            ratio={result.layer_scores.pva.P_ext_100yr}
            dark={dark}
            color="#D81E05"
          />
          <StatPanel
            label="유효 개체군 (Ne)"
            value={result.layer_scores.iucn.Ne.toLocaleString()}
            sub={result.layer_scores.iucn.Ne < 100 ? "임계 미만" : result.layer_scores.iucn.Ne < 1000 ? "장기 위험" : "안정"}
            dark={dark}
            color="#60C659"
          />
        </div>

        <div className={`mt-5 border-t ${dividerCls} pt-4`}>
          <p className={`text-[10.5px] leading-relaxed ${subCls}`}>
            <span className="font-bold">PVA</span>: Beissinger & McCullough (2002), 1500회 stochastic Ricker simulation<br />
            <span className="font-bold">50/500 Rule</span>: Frankham et al. 2014 — Ne ≥ 100 단기 / Ne ≥ 1000 장기 임계<br />
            <span className="font-bold">신뢰도</span>: <span className={dark ? "text-zinc-200" : "text-zinc-900"}>{(result.confidence * 100).toFixed(0)}%</span> ·{" "}
            <span className="font-bold">주 신호</span>: <span className={dark ? "text-zinc-200" : "text-zinc-900"}>{result.primary_driver}</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function StatPanel({
  label,
  value,
  ratio,
  sub,
  dark,
  color,
}: {
  label: string;
  value: string;
  ratio?: number;
  sub?: string;
  dark: boolean;
  color: string;
}) {
  return (
    <div
      className={
        "rounded-2xl border p-4 " +
        (dark ? "border-zinc-800 bg-zinc-950/50" : "border-zinc-200 bg-zinc-50/50")
      }
    >
      <p className={`text-[10px] font-bold tracking-wider ${dark ? "text-zinc-500" : "text-zinc-400"}`}>
        {label}
      </p>
      <p className={`mt-1 text-3xl font-black tabular-nums tracking-tight ${dark ? "text-zinc-50" : "text-zinc-900"}`}>
        {value}
      </p>
      {ratio !== undefined && (
        <div className={`mt-2 h-1 overflow-hidden rounded-full ${dark ? "bg-zinc-800" : "bg-zinc-200"}`}>
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${Math.min(100, ratio * 100)}%`, backgroundColor: color }}
          />
        </div>
      )}
      {sub && <p className={`mt-2 text-[10px] ${dark ? "text-zinc-500" : "text-zinc-500"}`}>{sub}</p>}
    </div>
  );
}
