import { getStats, countByCategory, getScoreCoverage } from "@/lib/queries";
import Link from "next/link";

export const dynamic = "force-dynamic";

const CAT_COLOR: Record<string, string> = {
  CR: "#D81E05",
  EN: "#FC7F3F",
  VU: "#F9E814",
  NT: "#CCE226",
  LC: "#60C659",
  EX: "#000000",
  EW: "#542344",
};

const CAT_LABEL: Record<string, string> = {
  CR: "위급",
  EN: "위기",
  VU: "취약",
  NT: "준위협",
  LC: "관심대상",
  EX: "절멸",
  EW: "야생절멸",
  DD: "정보부족",
  NE: "미평가",
};

export default function StatsPage() {
  const stats = getStats();
  const cov = getScoreCoverage();
  const totalSpecies = Object.values(countByCategory()).reduce((a, b) => a + b, 0);
  const maxCatN = Math.max(...stats.byCategory.map((c) => c.n));
  const maxClassN = stats.byClassRisk[0]?.n ?? 1;
  const maxYearN = Math.max(...stats.extinctByYear.map((y) => y.n), 1);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-8">
        <p className="text-xs font-bold tracking-widest text-zinc-500">STATISTICS · 통계</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-zinc-900">
          숫자로 보는 멸종위기
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          현재 데이터베이스에 등록된 <span className="font-black text-zinc-900">{totalSpecies}</span>종을
          기반으로 한 분석입니다.
        </p>
      </header>

      {/* v5: 위험 점수 산출 상태 3갈래 */}
      <section className="mb-10 rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="mb-1 text-sm font-bold text-zinc-900">위험 점수 산출 현황 (큐레이션 {cov.total.toLocaleString()}종)</h2>
        <p className="mb-4 text-xs text-zinc-500">
          LastWatch 위험 점수는 <b>실측 개체수</b>로만 계산합니다. IUCN 등급 기반 추정은 하지 않습니다.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-[#60C659]/40 bg-[#60C659]/10 p-4">
            <p className="text-2xl font-black text-zinc-900">{cov.computed.toLocaleString()}<span className="ml-1 text-sm font-medium text-zinc-500">종</span></p>
            <p className="mt-1 text-xs font-bold text-[#2f7d33]">실측 개체수 기반 계산</p>
            <p className="mt-0.5 text-[11px] text-zinc-500">수기 실측 + IUCN 명시 개체수</p>
          </div>
          <div className="rounded-xl border border-zinc-300 bg-zinc-100 p-4">
            <p className="text-2xl font-black text-zinc-900">{cov.extinct.toLocaleString()}<span className="ml-1 text-sm font-medium text-zinc-500">종</span></p>
            <p className="mt-1 text-xs font-bold text-zinc-700">절멸 확정 (EX/EW)</p>
            <p className="mt-0.5 text-[11px] text-zinc-500">계산이 아닌 사실 표시 (점수 100)</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-2xl font-black text-zinc-400">{cov.insufficient.toLocaleString()}<span className="ml-1 text-sm font-medium text-zinc-400">종</span></p>
            <p className="mt-1 text-xs font-bold text-zinc-500">데이터 부족</p>
            <p className="mt-0.5 text-[11px] text-zinc-400">개체수 없음 → IUCN 등급 정보만 제공</p>
          </div>
        </div>
      </section>

      <section className="mb-10 rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-bold text-zinc-900">IUCN 등급별 분포</h2>
        <div className="space-y-2">
          {stats.byCategory.map((c) => {
            const pct = (c.n / maxCatN) * 100;
            const color = CAT_COLOR[c.category] ?? "#71717a";
            return (
              <div key={c.category} className="flex items-center gap-3">
                <span
                  className="inline-flex w-12 flex-shrink-0 justify-center rounded px-1.5 py-0.5 text-[10px] font-black text-white"
                  style={{ backgroundColor: color, color: c.category === "VU" ? "#18181b" : "#fff" }}
                >
                  {c.category}
                </span>
                <span className="w-16 text-xs text-zinc-600">{CAT_LABEL[c.category] ?? c.category}</span>
                <div className="relative flex-1 overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className="h-7 rounded-full transition-all"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: color,
                    }}
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-900 mix-blend-difference">
                    {c.n}종
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mb-10 rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="mb-1 text-sm font-bold text-zinc-900">위기 종이 가장 많은 분류군</h2>
        <p className="mb-4 text-xs text-zinc-500">CR + EN + VU 등급 기준 상위 10개</p>
        <div className="space-y-2">
          {stats.byClassRisk.map((c, i) => {
            const pct = (c.n / maxClassN) * 100;
            return (
              <div key={c.class_name} className="flex items-center gap-3">
                <span className="w-6 text-right text-xs font-black text-zinc-400">{i + 1}</span>
                <span className="w-28 truncate text-xs font-bold text-zinc-700">{c.class_name}</span>
                <div className="relative flex-1 overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className="h-6 rounded-full bg-gradient-to-r from-[#D81E05] via-[#FC7F3F] to-[#F9E814] transition-all"
                    style={{ width: `${pct}%` }}
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-900">
                    {c.n}종
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {stats.extinctByYear.length > 0 && (
        <section className="mb-10 rounded-2xl border border-zinc-800 bg-zinc-950 p-6 text-zinc-100">
          <h2 className="mb-1 text-sm font-bold">시대별 절멸 종 분포</h2>
          <p className="mb-4 text-xs text-zinc-500">EX 등급 중 절멸 시기가 기록된 종</p>
          <div className="grid grid-cols-5 items-end gap-3">
            {stats.extinctByYear.map((y) => {
              const pct = (y.n / maxYearN) * 100;
              return (
                <div key={y.bucket} className="flex flex-col items-center gap-2">
                  <span className="text-lg font-black">{y.n}</span>
                  <div className="flex h-32 w-full items-end overflow-hidden rounded-md bg-zinc-900">
                    <div
                      className="w-full rounded-t-sm bg-gradient-to-t from-[#D81E05] to-[#FC7F3F]"
                      style={{ height: `${pct}%` }}
                    />
                  </div>
                  <span className="text-center text-[10px] text-zinc-400">{y.bucket}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <Link
        href="/"
        className="inline-block rounded-xl bg-zinc-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-zinc-700"
      >
        ← 목록으로 돌아가기
      </Link>
    </div>
  );
}
