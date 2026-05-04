// 데이터 품질 검증 페이지 — 어떤 필드가 비어있는지, 의심 패턴 종 샘플
import { getQualityStats, listQualityIssues } from "@/lib/queries";
import Link from "next/link";

export const dynamic = "force-dynamic";

const KIND_LABELS: Record<string, { title: string; desc: string }> = {
  no_ko: { title: "한글명 없음", desc: "common_name_ko 가 NULL 또는 빈 값. 학명 음차 또는 일반명 번역 필요." },
  ko_eq_sci: { title: "한글명 = 학명", desc: "한글명이 라틴어 학명 그대로 들어간 케이스. 음차 필요." },
  ko_eq_en: { title: "한글명 = 영문명", desc: "한글명이 영문 일반명 그대로. 한국어 번역 필요." },
  no_class: { title: "분류군 미상", desc: "class_name 이 NULL. Wikidata SPARQL 504 timeout 으로 일부 누락." },
  no_photo: { title: "사진 없음 (CR/EN)", desc: "위급/위기 종 중 사진이 없는 종. Wikipedia 에 사진이 없거나 페이지 부재." },
};

export default function QualityPage({ searchParams }: { searchParams?: { issue?: string } }) {
  const stats = getQualityStats();
  const issue = (searchParams?.issue ?? "no_ko") as keyof typeof KIND_LABELS;
  const issues = listQualityIssues(issue as any, 100) as Array<Record<string, unknown>>;
  const meta = KIND_LABELS[issue] ?? KIND_LABELS.no_ko;

  const cards = [
    { key: "no_ko", value: stats.noKoName, label: "한글명 없음", color: "#D81E05" },
    { key: "no_class", value: stats.noClass, label: "분류군 미상", color: "#FC7F3F" },
    { key: "no_photo", value: stats.noPhoto, label: "사진 없음", color: "#F9E814" },
    { key: "no_summary", value: stats.noSummary, label: "요약 없음", color: "#CCE226" },
    { key: "ko_eq_sci", value: stats.koMatchesSci, label: "한글명=학명", color: "#a01103" },
    { key: "ko_eq_en", value: stats.koMatchesEn, label: "한글명=영문", color: "#a01103" },
    { key: "summary_en", value: stats.summaryEnglish, label: "요약 영문 잔존", color: "#FC7F3F" },
    { key: "no_tipping", value: stats.noTipping, label: "임계점 미계산", color: "#838f1c" },
  ];

  const completionPct = ((stats.total - stats.noKoName) / stats.total) * 100;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <header className="mb-8">
        <div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.25em] text-zinc-500">
          <span className="inline-block h-px w-8 bg-zinc-400" />
          QUALITY · 데이터 검증
        </div>
        <h1 className="mt-3 text-3xl font-black leading-tight tracking-tight text-zinc-900 sm:text-4xl">
          데이터 품질 모니터
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-zinc-600">
          전체 <span className="font-bold">{stats.total.toLocaleString()}</span>종의 데이터 완성도와 의심 항목을 보여줍니다.
          오류 추적과 보강 우선순위 결정에 사용하세요.
        </p>
      </header>

      {/* 종합 완성도 */}
      <section className="mb-8 rounded-3xl border border-zinc-200/80 bg-white/80 p-6 backdrop-blur sm:p-8">
        <p className="text-[10px] font-black tracking-[0.2em] text-zinc-500">한글명 완성도</p>
        <div className="mt-2 flex items-baseline gap-3">
          <span className="text-5xl font-black tabular-nums text-zinc-900 sm:text-6xl">
            {completionPct.toFixed(1)}<span className="text-2xl">%</span>
          </span>
          <span className="text-sm text-zinc-500">
            ({(stats.total - stats.noKoName).toLocaleString()} / {stats.total.toLocaleString()})
          </span>
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-zinc-200">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${completionPct}%`,
              background: "linear-gradient(to right, #FC7F3F, #F9E814, #60C659)",
            }}
          />
        </div>
      </section>

      {/* 카드들 */}
      <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((c) => {
          const active = c.key === issue;
          const clickable = c.key in KIND_LABELS;
          const Inner = (
            <>
              <p className="text-[10px] font-bold tracking-wider text-zinc-500">{c.label}</p>
              <p className={`mt-2 text-3xl font-black tabular-nums ${active ? "text-white" : "text-zinc-900"}`}>
                {c.value.toLocaleString()}
              </p>
              <span
                className={`absolute left-0 top-0 h-full w-1`}
                style={{ backgroundColor: c.color }}
                aria-hidden
              />
            </>
          );
          const cls = `relative overflow-hidden rounded-2xl border p-4 transition ${
            active ? "border-transparent bg-zinc-900 text-white shadow-xl" : "border-zinc-200 bg-white hover:-translate-y-0.5 hover:shadow-md"
          }`;
          return clickable ? (
            <Link key={c.key} href={`/quality?issue=${c.key}`} className={cls}>
              {Inner}
            </Link>
          ) : (
            <div key={c.key} className={cls}>
              {Inner}
            </div>
          );
        })}
      </section>

      {/* 의심 항목 리스트 */}
      <section className="rounded-3xl border border-zinc-200/80 bg-white/80 p-6 backdrop-blur sm:p-8">
        <div className="mb-1 flex items-baseline gap-2">
          <h2 className="text-lg font-black text-zinc-900">{meta.title}</h2>
          <span className="text-xs text-zinc-500">샘플 100건</span>
        </div>
        <p className="mb-5 text-[13px] text-zinc-600">{meta.desc}</p>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-[10px] font-bold tracking-wider text-zinc-400">
                <th className="pb-2">ID</th>
                <th className="pb-2">학명</th>
                <th className="pb-2">영문명</th>
                <th className="pb-2">한글명</th>
                <th className="pb-2">등급</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {issues.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-zinc-400">
                    이 카테고리에 해당하는 종이 없습니다 — 모두 정상.
                  </td>
                </tr>
              ) : (
                issues.map((row) => {
                  const id = row.id as string;
                  const isExtinct = row.category === "EX" || row.category === "EW";
                  const href = isExtinct ? `/extinct/${id}` : `/species/${id}`;
                  return (
                    <tr key={id} className="hover:bg-zinc-50">
                      <td className="py-2 pr-2 font-mono text-[10px] text-zinc-400">{id}</td>
                      <td className="py-2 pr-2 italic text-zinc-700">{row.scientific_name as string}</td>
                      <td className="py-2 pr-2 text-zinc-600">{(row.common_name_en as string | null) ?? "—"}</td>
                      <td className="py-2 pr-2 font-medium text-zinc-900">{(row.common_name_ko as string | null) ?? "—"}</td>
                      <td className="py-2 pr-2">
                        <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-black text-zinc-700">
                          {row.category as string}
                        </span>
                      </td>
                      <td className="py-2">
                        <Link
                          href={href}
                          className="text-[11px] font-bold text-zinc-600 underline hover:text-zinc-900"
                        >
                          보기
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {issues.length === 100 && (
          <p className="mt-4 text-[11px] text-zinc-400">
            ※ 샘플 100건만 표시 중. 전체 데이터 검증은 <code className="font-mono">data/export/</code> JSON 사용.
          </p>
        )}
      </section>

      <p className="mt-8 text-[11px] text-zinc-400">
        ※ 데이터 출처 한계: Wikidata 가 P171 (parent taxon) recursive walk timeout, IUCN API 토큰 미발급으로 일부 메타데이터 부재.
        IUCN API 토큰 발급 후 enrichment 예정.
      </p>
    </div>
  );
}
