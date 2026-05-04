// 임계점 엔진 결과를 시각화하는 연표 컴포넌트
// 종 상세 페이지에 박힘
import type { TippingPointResult } from "@/lib/tipping-point";

const TIER_INFO: Record<string, { label: string; color: string; bg: string; border: string; subBg: string; subText: string }> = {
  T0: { label: "T0 · 안정", color: "text-[#3a8836]", bg: "bg-[#60C659]", border: "border-[#60C659]", subBg: "bg-[#60C659]/10", subText: "text-[#60C659]" },
  T1: { label: "T1 · 주의", color: "text-[#838f1c]", bg: "bg-[#CCE226]", border: "border-[#CCE226]", subBg: "bg-[#CCE226]/15", subText: "text-[#838f1c]" },
  T2: { label: "T2 · 경계", color: "text-[#a18f0c]", bg: "bg-[#F9E814]", border: "border-[#F9E814]", subBg: "bg-[#F9E814]/15", subText: "text-[#a18f0c]" },
  T3: { label: "T3 · 위급", color: "text-[#c46928]", bg: "bg-[#FC7F3F]", border: "border-[#FC7F3F]", subBg: "bg-[#FC7F3F]/15", subText: "text-[#c46928]" },
  T4: { label: "T4 · 임박", color: "text-[#a01103]", bg: "bg-[#D81E05]", border: "border-[#D81E05]", subBg: "bg-[#D81E05]/15", subText: "text-[#D81E05]" },
  EX: { label: "EX · 절멸", color: "text-zinc-400", bg: "bg-zinc-900", border: "border-zinc-800", subBg: "bg-zinc-800", subText: "text-zinc-400" },
};

function fmtKoreanDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function relativeYears(days: number): string {
  if (days === 0) return "지금 즉시";
  if (days < 0) return `${Math.abs(Math.round(days / 365))}년 전`;
  const years = days / 365;
  if (years < 1) return `${Math.round(days)}일 후`;
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
  const cardCls = dark
    ? "rounded-2xl border border-zinc-800 bg-zinc-900 text-zinc-100"
    : "rounded-2xl border border-zinc-200 bg-white text-zinc-900";
  const subCls = dark ? "text-zinc-400" : "text-zinc-600";
  const labelCls = dark ? "text-zinc-500" : "text-zinc-400";
  const dividerCls = dark ? "border-zinc-800" : "border-zinc-200";

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* 종합 점수 + Tier */}
      <div className={cardCls + " p-4 sm:p-5"}>
        <div className="flex items-baseline justify-between">
          <p className="text-[10px] font-black tracking-wider text-zinc-500">CONSENSUS · 종합 평가</p>
          <span
            className={`rounded-md px-2 py-0.5 text-[11px] font-black ${tierInfo.bg} ${
              result.intervention_tier === "T2" ? "text-zinc-900" : "text-white"
            }`}
          >
            {tierInfo.label}
          </span>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className={`text-4xl font-black ${tierInfo.color}`}>{result.consensus_score.toFixed(1)}</span>
          <span className={`text-xs ${subCls}`}>/ 100</span>
        </div>
        <p className={`mt-2 text-xs leading-relaxed ${subCls}`}>{result.rationale}</p>
        <div className={`mt-3 grid grid-cols-3 gap-2 border-t pt-3 text-[10px] ${dividerCls}`}>
          <div>
            <p className={labelCls}>EWS Layer</p>
            <p className={`mt-0.5 font-bold ${dark ? "text-zinc-200" : "text-zinc-700"}`}>{result.layer_scores.ews.score.toFixed(0)}</p>
          </div>
          <div>
            <p className={labelCls}>PVA Layer</p>
            <p className={`mt-0.5 font-bold ${dark ? "text-zinc-200" : "text-zinc-700"}`}>{result.layer_scores.pva.score.toFixed(0)}</p>
          </div>
          <div>
            <p className={labelCls}>IUCN Layer</p>
            <p className={`mt-0.5 font-bold ${dark ? "text-zinc-200" : "text-zinc-700"}`}>{result.layer_scores.iucn.score.toFixed(0)}</p>
          </div>
        </div>
      </div>

      {/* 연표 — 4개 핵심 날짜 */}
      <div className={cardCls + " p-4 sm:p-5"}>
        <p className="mb-3 text-[10px] font-black tracking-wider text-zinc-500">TIMELINE · 임계점 연표</p>

        <ol className="space-y-3">
          <TimelineItem
            label="개입 가능 시점"
            date={result.dates.intervention_open_date}
            relative={relativeYears(0)}
            color="bg-[#60C659]"
            note="지금이 가장 효과적입니다"
            dark={dark}
          />
          <TimelineItem
            label="개입 마감"
            date={result.dates.intervention_deadline_date}
            relative={relativeYears(result.years_until.deadline * 365)}
            color="bg-[#FC7F3F]"
            note={
              result.years_until.deadline === 0
                ? "이미 위급 단계 — 지체할 시간 없음"
                : "이 시점 이후엔 비용·난이도가 급격히 상승합니다"
            }
            dark={dark}
            urgent={result.years_until.deadline < 5}
          />
          {result.dates.golden_window_date && (
            <TimelineItem
              label="골든타임 (T4 진입)"
              date={result.dates.golden_window_date}
              relative={relativeYears((result.years_until.golden_window ?? 0) * 365)}
              color="bg-[#D81E05]"
              note="포획·이주 등 응급 조치만 남는 단계"
              dark={dark}
              urgent={(result.years_until.golden_window ?? 99) < 10}
            />
          )}
          {result.dates.extinction_estimate_date && (
            <TimelineItem
              label="무대응시 멸종 예상 (비관 시나리오)"
              date={result.dates.extinction_estimate_date}
              relative={relativeYears((result.years_until.extinction ?? 0) * 365)}
              color="bg-zinc-900"
              note="PVA 시뮬레이션 10퍼센타일 — 보전 조치 없을 시"
              dark={dark}
            />
          )}
        </ol>
      </div>

      {/* PVA 상세 */}
      <div className={cardCls + " p-4 sm:p-5"}>
        <p className="mb-3 text-[10px] font-black tracking-wider text-zinc-500">PVA · 멸종확률 시뮬레이션</p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <p className={`text-[10px] ${labelCls}`}>50년 멸종확률</p>
            <p className="mt-1 text-2xl font-black">{(result.layer_scores.pva.P_ext_50yr * 100).toFixed(0)}<span className="text-xs">%</span></p>
          </div>
          <div>
            <p className={`text-[10px] ${labelCls}`}>100년 멸종확률</p>
            <p className="mt-1 text-2xl font-black">{(result.layer_scores.pva.P_ext_100yr * 100).toFixed(0)}<span className="text-xs">%</span></p>
          </div>
          <div>
            <p className={`text-[10px] ${labelCls}`}>유효 개체군 (Ne)</p>
            <p className="mt-1 text-2xl font-black">{result.layer_scores.iucn.Ne.toLocaleString()}</p>
          </div>
        </div>
        <p className={`mt-3 text-[11px] ${subCls}`}>
          • PVA: Beissinger & McCullough (2002), 1500회 stochastic Ricker simulation
          <br />• 50/500 Rule: Frankham et al. 2014 — Ne ≥ 100 단기 / Ne ≥ 1000 장기 임계
          <br />• 신뢰도: <span className="font-bold">{(result.confidence * 100).toFixed(0)}%</span> · 주 신호: {result.primary_driver}
        </p>
      </div>
    </div>
  );
}

function TimelineItem({
  label,
  date,
  relative,
  color,
  note,
  dark,
  urgent,
}: {
  label: string;
  date: string;
  relative: string;
  color: string;
  note: string;
  dark: boolean;
  urgent?: boolean;
}) {
  return (
    <li className="relative flex items-start gap-3 pl-1">
      <span className={`mt-1.5 inline-block h-3 w-3 flex-shrink-0 rounded-full ${color} ${urgent ? "ring-4 ring-red-500/20" : ""}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <p className={`text-xs font-bold ${dark ? "text-zinc-200" : "text-zinc-900"}`}>{label}</p>
          <p className={`text-[10px] ${dark ? "text-zinc-500" : "text-zinc-400"}`}>{relative}</p>
        </div>
        <p className={`mt-0.5 font-mono text-sm font-bold ${dark ? "text-zinc-100" : "text-zinc-900"}`}>{fmtKoreanDate(date)}</p>
        <p className={`mt-0.5 text-[11px] leading-relaxed ${dark ? "text-zinc-500" : "text-zinc-500"}`}>{note}</p>
      </div>
    </li>
  );
}
