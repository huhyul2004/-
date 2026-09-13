import Link from "next/link";
import { getSpeciesById, getTippingPoint } from "@/lib/queries";
import { V5_SPEC, TIERS, type TippingPointResult } from "@/lib/tipping-point";
import { traceScore, getMethodologyCoverage, LAYERS } from "@/lib/methodology";
import { floorBreakdown, floorStatusLine } from "@/lib/floor-transparency";
import { TippingHero } from "@/components/tipping-hero";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "위험 점수 계산식 — LastWatch",
  description: "LastWatch 자체 위험 점수(v5)가 어떻게 계산되는지, 어떤 종에 산출되는지.",
};

// 예시 종 — 개체수 하한이 점수를 끌어올리는 대표 사례
const EXAMPLE_ID = "rhinoceros-sondaicus";

const LAYER_NAME: Record<string, string> = {
  ews: "EWS · 조기경보신호",
  pva: "PVA · 개체군 생존분석",
  iucn: "유효개체군(Ne) · 유전 임계값",
};
const POP_SOURCE_LABEL: Record<string, string> = {
  mature_individuals: "수기 실측 개체수",
  iucn_population_size: "IUCN 평가의 개체수",
};
const TREND_SOURCE_LABEL: Record<string, string> = {
  iucn: "IUCN 추세",
  korean: "한글 추세 칸",
  default: "추세 정보 없음 → 기본값",
};

const n = (x: number) => x.toLocaleString();
const f1 = (x: number) => x.toFixed(1);
const f2 = (x: number) => x.toFixed(2);
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

// 수식 블록 — 이미지가 아닌 글자. 좁은 화면에서는 가로로 스크롤된다.
function Formula({ children }: { children: React.ReactNode }) {
  return (
    <pre className="mt-2 max-w-full overflow-x-auto whitespace-pre rounded-xl bg-zinc-50 px-3 py-2.5 font-mono text-[12px] leading-relaxed text-zinc-800">
      {children}
    </pre>
  );
}

function Section({ id, label, title, children }: { id: string; label: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-8 scroll-mt-20">
      <h2 className="mb-3 flex items-baseline gap-2">
        <span className="text-xs font-black tracking-wider text-[#D81E05]">{label}</span>
        <span className="text-lg font-black text-zinc-900">{title}</span>
      </h2>
      {children}
    </section>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`min-w-0 rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5 ${className}`}>{children}</div>;
}

export default function MethodologyPage() {
  const W = V5_SPEC.weights;
  const AT = V5_SPEC.alertThresholds;
  const CM = V5_SPEC.consensusMultiplier;
  const LC = V5_SPEC.lowConfidence;
  const TA = V5_SPEC.trendAdjust;
  const E = V5_SPEC.ews;
  const P = V5_SPEC.pva;
  const layerCount = LAYERS.length;
  const cov = getMethodologyCoverage();

  const ewsMin = sigmoid(-E.gain) * 100;
  const ewsMax = sigmoid(E.gain) * 100;
  const neScores = [...V5_SPEC.neBands.map((b) => b.score), V5_SPEC.neSafe.score];
  // 레이어 신뢰도가 모두 상수라 종합 신뢰도도 한 값 — 압축 문턱과 비교해 보인다
  const fixedConfidence = W.ews * E.confidence + W.pva * P.confidence + W.iucn * V5_SPEC.neConfidence;

  const exSpecies = getSpeciesById(EXAMPLE_ID);
  const exTp = getTippingPoint(EXAMPLE_ID);
  const ex = exSpecies && exTp ? traceScore(exSpecies, exTp.payload, exTp) : null;
  const exFb = exSpecies && exTp ? floorBreakdown(exSpecies, exTp.payload) : null;
  const exName = exSpecies ? exSpecies.common_name_ko ?? exSpecies.scientific_name : EXAMPLE_ID;
  const extinctScore = cov.extinctScoreValues.join(" · ");
  const lastTier = TIERS[TIERS.length - 1];

  return (
    <div className="mx-auto max-w-4xl px-4 py-5 sm:py-8">
      <Link
        href="/"
        className="mb-4 inline-flex min-h-[40px] items-center gap-1.5 text-xs text-zinc-500 transition hover:text-zinc-900"
      >
        ← 멸종위기 종 목록
      </Link>

      <header className="mb-6">
        <h1 className="text-2xl font-black leading-tight tracking-tight text-zinc-900 sm:text-3xl">
          LastWatch 위험 점수는 어떻게 계산되나
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-700">
          개체수 자료로 그 종이 지금 얼마나 급하게 보전 조치가 필요한지를 0~100점으로 매긴 <b>LastWatch 자체 점수</b>입니다.
          멸종 확률 그 자체도, IUCN 적색목록 등급을 대신하는 값도 아닙니다.
        </p>
        <div className="mt-4 rounded-2xl border-2 border-[#D81E05]/40 bg-[#D81E05]/5 p-4">
          <p className="text-sm font-black text-[#D81E05]">IUCN 공식 지표가 아닙니다</p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-700">
            IUCN 적색목록은 등급(CR·EN·VU …)만 정합니다. 이 점수와 티어(T0~{lastTier.tier})는 LastWatch 가 만든 계산이고,
            IUCN 이 검토하거나 인정한 값이 아닙니다. 등급과 점수가 다를 수 있으며, 둘을 같은 뜻으로 읽으면 안 됩니다.
          </p>
        </div>
      </header>

      <Section id="overview" label="요약" title="한눈에">
        <Card>
          <ol className="space-y-1.5 text-sm text-zinc-700">
            <li>1. 레이어 {layerCount}개(EWS · PVA · 유효개체군)가 각각 0~100점을 냅니다.</li>
            <li>2. 가중합 → 다수결 보정 → 신뢰도 압축 → <b>개체수 하한</b> → 추세 보정 순으로 한 점수가 됩니다.</li>
            <li>3. 소수 첫째 자리로 반올림한 점수로 티어 {TIERS.length}단계를 정합니다.</li>
            <li>
              4. 개체수 자료가 있는 종에만 계산합니다 — 지금 <b>{n(cov.computed)}종</b>. 절멸·야생절멸 {n(cov.extinctScored)}종은 계산 없이 {extinctScore}점입니다.
            </li>
          </ol>
        </Card>
      </Section>

      <Section id="layers" label="레이어" title={`레이어 ${layerCount}개`}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <p className="text-[10px] font-black tracking-wider text-[#FC7F3F]">가중치 {W.ews}</p>
            <h3 className="mt-1 text-sm font-bold text-zinc-900">{LAYER_NAME.ews}</h3>
            <p className="mt-2 text-xs leading-relaxed text-zinc-600">
              개체군이 무너지기 전에 나타나는 &lsquo;회복이 느려지는 신호&rsquo;를 보려는 레이어입니다. DB 에 개체수 시계열이 없어서,
              개체수 추세(IUCN → 한글 추세 칸 → 기본값 순)로 정한 성장률 r 하나로 신호를 추정합니다.
            </p>
            <Formula>{`τ = clamp(−r ÷ ${E.tauScale}, −1, 1)
EWS = σ(${E.gain} × (${E.tauWeights.ar1}τ + ${E.tauWeights.variance}τ + ${E.tauWeights.skew}τ)) × 100`}</Formula>
            <p className="mt-2 text-[11px] text-zinc-500">
              범위 {f1(ewsMin)} ~ {f1(ewsMax)}점 · 신뢰도 {E.confidence} (시계열 없음)
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-600">
              지금은 시계열 대신 추세로 추정한 값이라, 계산되는 종의 EWS 는 <b>{cov.ewsValues.length}가지 값</b>만 갖습니다.{" "}
              <a href="#ews" className="font-bold text-[#D81E05] underline underline-offset-2">
                현재 상태 ↓
              </a>
            </p>
          </Card>
          <Card>
            <p className="text-[10px] font-black tracking-wider text-[#FC7F3F]">가중치 {W.pva}</p>
            <h3 className="mt-1 text-sm font-bold text-zinc-900">{LAYER_NAME.pva}</h3>
            <p className="mt-2 text-xs leading-relaxed text-zinc-600">
              현재 개체수 N0 에서 출발해 {n(P.years)}년 동안의 개체수를 {n(P.nSim)}번 시뮬레이션합니다(Ricker 성장 · 환경·인구 확률성 ·
              Allee 효과, 종마다 고정된 난수라 다시 돌려도 같은 값). {P.horizons.short}년·{P.horizons.long}년 안에 준멸종할 확률과
              안전 개체수 대비 부족분을 섞습니다.
            </p>
            <Formula>{`N_safe = max(${P.safeKFraction} × K, ${P.safeMinN})
PVA = 100 × (${P.weights.pExtShort}·P${P.horizons.short} + ${P.weights.pExtLong}·P${P.horizons.long}
             + ${P.weights.deficit}·(1 − min(1, N0 ÷ N_safe)))`}</Formula>
            <p className="mt-2 text-[11px] text-zinc-500">범위 0 ~ 100점 · 신뢰도 {P.confidence} · K 는 N0 보다 크게 가정(감소 추세면 더 크게)</p>
          </Card>
          <Card>
            <p className="text-[10px] font-black tracking-wider text-[#FC7F3F]">가중치 {W.iucn}</p>
            <h3 className="mt-1 text-sm font-bold text-zinc-900">{LAYER_NAME.iucn}</h3>
            <p className="mt-2 text-xs leading-relaxed text-zinc-600">
              유전적으로 버틸 수 있는 규모인지 봅니다(Frankham 50/500 규칙). 개체수에 분류군별 Ne/Nc 비율을 곱해 유효개체군을 구합니다.
              분류군 전용 비율이 없으면 기본값을 쓰고, 일부 비율은 저장소에서 근거를 확인하지 못했습니다.
            </p>
            <Formula>{`Ne = round(N0 × Ne/Nc(분류군))
${V5_SPEC.neBands.map((b) => `Ne < ${n(b.below)} → ${b.score}`).join("\n")}
그 밖 → ${V5_SPEC.neSafe.score}`}</Formula>
            <p className="mt-2 text-[11px] text-zinc-500">
              범위 {Math.min(...neScores)} ~ {Math.max(...neScores)}점 · 신뢰도 {V5_SPEC.neConfidence} · IUCN 등급은 넣지 않음(아래 &lsquo;한계&rsquo;)
            </p>
          </Card>
        </div>
        <div id="ews" className="mt-4 scroll-mt-20">
          <Card>
            <h3 className="text-sm font-bold text-zinc-900">EWS 레이어의 현재 상태 — 추세 기반 추정값</h3>
            <p className="mt-2 text-xs leading-relaxed text-zinc-700">
              EWS 는 명세서에서 <b>개체수 시계열</b>을 입력으로 설계되어 있습니다. 지금은 쓸 수 있는 시계열이 없어,
              개체수 추세에서 추정한 값을 씁니다.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[460px] text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-200 text-zinc-500">
                    <th className="whitespace-nowrap py-1.5 pr-3 font-bold">항목</th>
                    <th className="py-1.5 pr-3 font-bold">명세서 설계</th>
                    <th className="py-1.5 font-bold">지금</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-800">
                  <tr className="border-b border-zinc-100">
                    <td className="whitespace-nowrap py-1.5 pr-3 font-bold">입력</td>
                    <td className="py-1.5 pr-3">종별 연도별 개체수 시계열 N(t)</td>
                    <td className="py-1.5">개체수 추세 하나로 정한 성장률 r</td>
                  </tr>
                  <tr className="border-b border-zinc-100">
                    <td className="whitespace-nowrap py-1.5 pr-3 font-bold">계산</td>
                    <td className="py-1.5 pr-3">
                      추세 제거 → 이동 창마다 자기상관(AR1) · 분산 · 왜도 · 첨도 · 복귀 속도 → 각 지표의 Kendall τ → 가중합 → σ
                    </td>
                    <td className="py-1.5">
                      r 로 τ 하나를 추정해(τ = clamp(−r ÷ {E.tauScale}, −1, 1)) 모든 지표에 같은 값을 넣고 가중합 → σ
                    </td>
                  </tr>
                  <tr>
                    <td className="whitespace-nowrap py-1.5 pr-3 font-bold">신뢰도</td>
                    <td className="py-1.5 pr-3">—</td>
                    <td className="py-1.5">{E.confidence} (고정)</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-zinc-700">
              <b>왜 시계열이 없나</b> — 개체수는 IUCN 평가에서 가져오는데, 평가는 여러 해 간격으로 나오고 개체수 칸이 비어 있거나
              범위로만 적힌 경우가 많아 종별 연도별 개체수를 이을 수 없습니다.
            </p>
            <p className="mt-3 text-xs leading-relaxed text-zinc-700">
              그 결과 계산되는 {n(cov.computed)}종의 EWS 점수는 <b>{cov.ewsValues.length}가지 값</b>만 갖고, 추세 입력이 같은 종은
              EWS 가 같습니다.
            </p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[320px] text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-200 text-zinc-500">
                    <th className="py-1.5 pr-3 font-bold">EWS 점수</th>
                    <th className="py-1.5 pr-3 font-bold">추세 입력</th>
                    <th className="py-1.5 text-right font-bold">종 수</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-800">
                  {cov.ewsValues.map((v) => (
                    <tr key={v.score} className="border-b border-zinc-100">
                      <td className="py-1.5 pr-3 font-mono">{f2(v.score)}</td>
                      <td className="py-1.5 pr-3">
                        {Object.entries(v.inputs)
                          .map(([k, c]) => (Object.keys(v.inputs).length > 1 ? `${k} ${n(c)}` : k))
                          .join(" · ")}
                      </td>
                      <td className="py-1.5 text-right font-mono">{n(v.count)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="py-1.5 pr-3 font-bold" colSpan={2}>
                      합계 ({cov.ewsValues.length}가지 값)
                    </td>
                    <td className="py-1.5 text-right font-mono font-bold">
                      {n(cov.ewsValues.reduce((s, v) => s + v.count, 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-zinc-500">
              숫자는 DB 에 저장된 계산 결과에서 셌습니다. 조사 기록: docs/ews-layer-audit.md · docs/ews-timeseries-options.md
            </p>
          </Card>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
          종 상세의 임계점 연표(개입 마감·골든타임 등 날짜 4개)는 PVA 시뮬레이션 궤적에서 따로 뽑습니다. 그 계산은 점수에 들어가지 않습니다.
        </p>
      </Section>

      <Section id="combine" label="종합" title="레이어를 한 점수로">
        <div className="space-y-3">
          <Card>
            <h3 className="text-sm font-bold text-zinc-900">① 가중합</h3>
            <Formula>{`점수₀ = ${W.ews}·EWS + ${W.pva}·PVA + ${W.iucn}·Ne점수`}</Formula>
          </Card>
          <Card>
            <h3 className="text-sm font-bold text-zinc-900">② 다수결 — 여러 레이어가 함께 경보를 내야 점수를 그대로 둔다</h3>
            <Formula>{`경보 = [EWS > ${AT.ews}] + [PVA > ${AT.pva}] + [Ne점수 > ${AT.iucn}]
경보 0표 → 점수₀ × ${CM.zero}
경보 1표 → 점수₀ × ${CM.one}
경보 2표 이상 → 점수₀ 그대로`}</Formula>
            <p className="mt-2 text-xs text-zinc-600">한 레이어만 높을 때 점수가 과하게 오르지 않게 깎는 단계입니다.</p>
          </Card>
          <Card>
            <h3 className="text-sm font-bold text-zinc-900">③ 신뢰도 압축</h3>
            <Formula>{`신뢰도 = ${W.ews}·${E.confidence} + ${W.pva}·${P.confidence} + ${W.iucn}·${V5_SPEC.neConfidence} = ${fixedConfidence.toFixed(4)}
신뢰도 < ${LC.below} 이면 → 점수 × ${LC.scale} + ${LC.add}`}</Formula>
            <p className="mt-2 text-xs text-zinc-600">
              레이어 신뢰도가 모두 고정값이라 계산되는 모든 종의 신뢰도가 {fixedConfidence.toFixed(4)} 입니다.
              문턱 {LC.below} 이상이므로 지금은 <b>이 단계가 어떤 종의 점수도 바꾸지 않습니다</b>(실측 {n(cov.compressed)}종).
            </p>
          </Card>
          <Card>
            <h3 className="text-sm font-bold text-zinc-900">④ 개체수 하한 — 아래 절</h3>
            <Formula>{`점수 = max(점수, 하한(N0))`}</Formula>
          </Card>
          <Card>
            <h3 className="text-sm font-bold text-zinc-900">⑤ 추세 보정</h3>
            <Formula>{`한글 추세 칸에 '급감'        → +${TA.sharpDecline}
             '증가'·'회복'  → ${TA.recovering}
             '감소'         → +${TA.decline}
(0 ~ 100 으로 자름)`}</Formula>
            <p className="mt-2 text-xs text-zinc-600">
              이 단계는 IUCN 추세가 아니라 수기로 적은 한글 추세 칸만 봅니다. 그 칸이 채워진 종이 적어 지금 {n(cov.computed)}종 중{" "}
              <b>{n(cov.trendAdjusted)}종</b>에만 적용됩니다.
            </p>
          </Card>
          <Card>
            <h3 className="text-sm font-bold text-zinc-900">⑥ 반올림 → 티어</h3>
            <Formula>{`최종 점수 = 소수 첫째 자리 반올림`}</Formula>
          </Card>
        </div>
      </Section>

      <Section id="confidence" label="신뢰도" title="신뢰도 — 지금은 모든 종이 같은 값">
        <Card>
          <p className="text-xs leading-relaxed text-zinc-700">
            종 상세의 &lsquo;신뢰도&rsquo;는 세 레이어 신뢰도의 가중합입니다. 레이어 신뢰도가 모두 고정값이라 계산되는{" "}
            {n(cov.computed)}종이 전부 같은 값({cov.overallConfidenceValues.map((v) => v.toFixed(4)).join(" · ")})을 갖습니다.
            <b> 종별로 점수를 얼마나 믿을 수 있는지 알려주는 값이 아닙니다.</b>
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[320px] text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-200 text-zinc-500">
                  <th className="py-1.5 pr-3 font-bold">레이어</th>
                  <th className="py-1.5 pr-3 font-bold">신뢰도</th>
                  <th className="py-1.5 font-bold">정해지는 방식</th>
                </tr>
              </thead>
              <tbody className="text-zinc-800">
                <tr className="border-b border-zinc-100">
                  <td className="py-1.5 pr-3">{LAYER_NAME.ews}</td>
                  <td className="py-1.5 pr-3 font-mono">{E.confidence}</td>
                  <td className="py-1.5">고정값 — 개체수 시계열이 없어 낮게 둠</td>
                </tr>
                <tr className="border-b border-zinc-100">
                  <td className="py-1.5 pr-3">{LAYER_NAME.pva}</td>
                  <td className="py-1.5 pr-3 font-mono">{P.confidence}</td>
                  <td className="py-1.5">고정값</td>
                </tr>
                <tr>
                  <td className="py-1.5 pr-3">{LAYER_NAME.iucn}</td>
                  <td className="py-1.5 pr-3 font-mono">{V5_SPEC.neConfidence}</td>
                  <td className="py-1.5">개체수가 있으면 늘 이 값 (점수가 계산되는 종은 모두 개체수가 있음)</td>
                </tr>
              </tbody>
            </table>
          </div>
          <Formula>{`신뢰도 = ${W.ews}×${E.confidence} + ${W.pva}×${P.confidence} + ${W.iucn}×${V5_SPEC.neConfidence}
       = ${(W.ews * E.confidence).toFixed(4)} + ${(W.pva * P.confidence).toFixed(4)} + ${(W.iucn * V5_SPEC.neConfidence).toFixed(4)}
       = ${fixedConfidence.toFixed(4)}   → 화면 표시 ${Math.round(fixedConfidence * 100)}%`}</Formula>

          <h3 className="mt-4 text-sm font-bold text-zinc-900">명세서와 다른 점</h3>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-200 text-zinc-500">
                  <th className="py-1.5 pr-3 font-bold">항목</th>
                  <th className="py-1.5 pr-3 font-bold">명세서 (full_spec §5.3)</th>
                  <th className="py-1.5 font-bold">지금 코드</th>
                </tr>
              </thead>
              <tbody className="text-zinc-800">
                <tr className="border-b border-zinc-100">
                  <td className="py-1.5 pr-3 font-bold">신뢰도의 역할</td>
                  <td className="py-1.5 pr-3">
                    신뢰도로 레이어 가중치를 조정한 뒤 정규화 — <span className="font-mono">w_i = w₀,i × (0.5 + 0.5·c_i)</span>
                  </td>
                  <td className="py-1.5">
                    가중치는 고정({W.ews} · {W.pva} · {W.iucn}), 신뢰도는 압축 조건에만 쓰임
                  </td>
                </tr>
                <tr className="border-b border-zinc-100">
                  <td className="py-1.5 pr-3 font-bold">신뢰도 압축</td>
                  <td className="py-1.5 pr-3">없음</td>
                  <td className="py-1.5 font-mono">
                    신뢰도 &lt; {LC.below} → 점수 × {LC.scale} + {LC.add}
                  </td>
                </tr>
                <tr>
                  <td className="py-1.5 pr-3 font-bold">실제 적용</td>
                  <td className="py-1.5 pr-3">—</td>
                  <td className="py-1.5">
                    모든 종이 {fixedConfidence.toFixed(4)} ≥ {LC.below} → <b>압축이 적용된 종 {n(cov.compressed)}종</b>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-zinc-500">
            명세서 식은 저장소 문서(docs/layer-score-spec-vs-code.md §4)에 옮겨 둔 full_spec §5.3 을 인용했습니다.
            신뢰도를 종마다 다르게 하려면 신뢰도를 종별 자료로 계산하는 코드가 필요합니다(docs/confidence-audit.md).
          </p>
        </Card>
      </Section>

      <Section id="floor" label="하한" title="개체수 하한 규칙">
        <Card className="border-amber-200 bg-amber-50/60">
          <p className="text-sm font-bold text-amber-900">
            명세서에 없는 LastWatch 자체 규칙입니다.
          </p>
          <p className="mt-1 text-xs leading-relaxed text-amber-900/80">
            개체수 N0 가 아주 적은 종은 레이어 계산이 낮게 나와도 점수를 일정 값까지 끌어올립니다. 근거로 삼은 것은 IUCN 기준 D 의 절대
            개체수 문턱, Frankham 50/500 규칙, 소수 개체군의 단일 사건 취약성이지만, 이 표 자체는 특허 명세서에 기재되어 있지 않습니다.
            종 상세 페이지와 챗봇은 하한이 적용된 종에 하한 적용 전 점수를 함께 보여줍니다.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[280px] text-left text-xs">
              <thead>
                <tr className="border-b border-amber-200 text-amber-900/70">
                  <th className="py-1.5 pr-3 font-bold">개체수 N0</th>
                  <th className="py-1.5 font-bold">하한 점수</th>
                </tr>
              </thead>
              <tbody>
                {V5_SPEC.floorBands.map((b) => (
                  <tr key={b.below} className="border-b border-amber-100 text-amber-950">
                    <td className="py-1.5 pr-3 font-mono">N0 &lt; {n(b.below)}</td>
                    <td className="py-1.5 font-mono">{b.floor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-amber-900/80">
            지금 계산되는 {n(cov.computed)}종 중 <b>{n(cov.floor.bound)}종</b>은 하한이 점수를 실제로 끌어올렸고,{" "}
            {n(cov.floor.inBandNotBound)}종은 하한 구간이지만 원래 점수가 더 높아 바뀌지 않았으며, {n(cov.floor.outside)}종은 하한 구간 밖입니다.
          </p>
        </Card>
      </Section>

      <Section id="tiers" label="티어" title={`티어 ${TIERS.length}단계`}>
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-200 text-zinc-500">
                  <th className="py-1.5 pr-3 font-bold">티어</th>
                  <th className="py-1.5 pr-3 font-bold">이름</th>
                  <th className="py-1.5 pr-3 font-bold">점수</th>
                  <th className="py-1.5 pr-3 font-bold">권고</th>
                  <th className="py-1.5 font-bold">종 수</th>
                </tr>
              </thead>
              <tbody>
                {[...TIERS].reverse().map((t) => (
                  <tr key={t.tier} className="border-b border-zinc-100 text-zinc-800">
                    <td className="py-1.5 pr-3">
                      <span className="inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ backgroundColor: t.color }} />{" "}
                      <span className="font-mono font-bold">{t.tier}</span>
                    </td>
                    <td className="py-1.5 pr-3">{t.label}</td>
                    <td className="py-1.5 pr-3 font-mono">
                      {t === lastTier ? `${t.min} 이상` : `${t.min} 이상 ${t.max} 미만`}
                    </td>
                    <td className="py-1.5 pr-3">{t.action}</td>
                    <td className="py-1.5 font-mono">{n(cov.tiers[t.tier] ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-zinc-500">
            절멸·야생절멸 종은 계산하지 않고 티어 EX, {extinctScore}점으로 표시합니다({n(cov.extinctScored)}종).
          </p>
        </Card>
      </Section>

      <Section id="example" label="예시" title={`${exName} — 처음부터 끝까지`}>
        {ex && exTp ? (
          <>
            <Card>
              <p className="text-xs text-zinc-500">
                아래 숫자는 모두 DB 에 저장된 {exName}의 계산 결과에서 읽었습니다.
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[460px] text-left text-xs">
                  <tbody className="text-zinc-800">
                    <tr className="border-b border-zinc-100">
                      <td className="py-1.5 pr-3 font-bold">개체수 N0</td>
                      <td className="py-1.5 font-mono">
                        {n(ex.N0)} ({POP_SOURCE_LABEL[ex.popSource] ?? ex.popSource})
                        {ex.Ne != null && ` · Ne ${n(ex.Ne)}`}
                      </td>
                    </tr>
                    {LAYERS.map((k) => (
                      <tr key={k} className="border-b border-zinc-100">
                        <td className="py-1.5 pr-3 font-bold">{LAYER_NAME[k]}</td>
                        <td className="py-1.5 font-mono">
                          {f2(ex.layers[k].score)}점 {ex.layers[k].alert ? `(경보 — ${AT[k]} 초과)` : `(${AT[k]} 이하)`}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-b border-zinc-100">
                      <td className="py-1.5 pr-3 font-bold">① 가중합</td>
                      <td className="py-1.5 font-mono">
                        {W.ews}×{f2(ex.layers.ews.score)} + {W.pva}×{f2(ex.layers.pva.score)} + {W.iucn}×{f2(ex.layers.iucn.score)} ={" "}
                        {f2(ex.raw)}
                      </td>
                    </tr>
                    <tr className="border-b border-zinc-100">
                      <td className="py-1.5 pr-3 font-bold">② 다수결</td>
                      <td className="py-1.5 font-mono">
                        경보 {ex.alerts}표 → {ex.alerts >= 2 ? "그대로" : `× ${ex.multiplier}`} = {f2(ex.afterConsensus)}
                      </td>
                    </tr>
                    <tr className="border-b border-zinc-100">
                      <td className="py-1.5 pr-3 font-bold">③ 신뢰도 압축</td>
                      <td className="py-1.5 font-mono">
                        신뢰도 {ex.overallConfidence.toFixed(4)} {ex.compressed ? `< ${LC.below} → ${f2(ex.afterConfidence)}` : `≥ ${LC.below} → 변화 없음`}
                      </td>
                    </tr>
                    <tr className="border-b border-zinc-100 bg-amber-50/60">
                      <td className="py-1.5 pr-3 font-bold">④ 개체수 하한</td>
                      <td className="py-1.5 font-mono">
                        {ex.floorBand != null
                          ? `N0 ${n(ex.N0)} < ${n(ex.floorBand)} → 하한 ${ex.floor} → max(${f2(ex.afterConfidence)}, ${ex.floor}) = ${f2(ex.afterFloor)}`
                          : "하한 구간 밖 → 변화 없음"}
                      </td>
                    </tr>
                    <tr className="border-b border-zinc-100">
                      <td className="py-1.5 pr-3 font-bold">⑤ 추세 보정</td>
                      <td className="py-1.5 font-mono">
                        한글 추세 칸: {ex.trendText ?? "비어 있음"} → {ex.trendDelta === 0 ? "변화 없음" : `${ex.trendDelta > 0 ? "+" : ""}${ex.trendDelta}`} ={" "}
                        {f2(ex.afterTrend)}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1.5 pr-3 font-bold">⑥ 최종</td>
                      <td className="py-1.5 font-mono font-bold">
                        {f1(ex.display)}점 → {ex.tier?.tier} {ex.tier?.label}
                        <span className={`ml-2 font-normal ${ex.matches ? "text-[#2f7d33]" : "text-[#D81E05]"}`}>
                          {ex.matches
                            ? `✓ DB 저장값(${f1(ex.stored.score)}점 · ${ex.stored.tier})과 같음`
                            : `✗ DB 저장값 ${f1(ex.stored.score)}점 · ${ex.stored.tier} 와 다름`}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {ex.floorBound && exFb && (
                <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
                  하한 규칙이 없었다면 {f1(exFb.withoutFloor)}점({TIERS.find((t) => exFb.withoutFloor >= t.min && exFb.withoutFloor < t.max)?.tier})이었습니다.
                  이 종의 점수는 레이어 계산보다 개체수 하한이 정했습니다.
                </p>
              )}
              <Link
                href={`/species/${EXAMPLE_ID}`}
                className="mt-3 inline-block text-xs font-bold text-[#D81E05] underline"
              >
                {exName} 상세 페이지 →
              </Link>
            </Card>
            <div className="mt-4">
              <TippingHero
                result={exTp.payload as TippingPointResult}
                floorNote={exFb?.bound ? floorStatusLine(exFb) : null}
              />
            </div>
          </>
        ) : (
          <Card>
            <p className="text-sm text-zinc-500">예시 종의 계산 결과를 DB 에서 찾지 못했습니다.</p>
          </Card>
        )}
      </Section>

      <Section id="coverage" label="커버리지" title="어떤 종에 점수가 있나">
        <Card>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-[#60C659]/40 bg-[#60C659]/10 p-4">
              <p className="text-2xl font-black text-zinc-900">
                {n(cov.computed)}
                <span className="ml-1 text-sm font-medium text-zinc-500">종</span>
              </p>
              <p className="mt-1 text-xs font-bold text-[#2f7d33]">개체수로 계산</p>
            </div>
            <div className="rounded-xl border border-zinc-300 bg-zinc-100 p-4">
              <p className="text-2xl font-black text-zinc-900">
                {n(cov.extinctScored)}
                <span className="ml-1 text-sm font-medium text-zinc-500">종</span>
              </p>
              <p className="mt-1 text-xs font-bold text-zinc-700">절멸·야생절멸 ({extinctScore}점 고정)</p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <p className="text-2xl font-black text-zinc-400">
                {n(cov.unscored)}
                <span className="ml-1 text-sm font-medium text-zinc-400">종</span>
              </p>
              <p className="mt-1 text-xs font-bold text-zinc-500">점수 없음</p>
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-zinc-400">DB 전체 · 사진과 상세를 갖춘 큐레이션 종</dt>
              <dd className="font-medium text-zinc-900">
                {n(cov.species)}종 · {n(cov.curated)}종 (점수 있는 종 중 큐레이션 {n(cov.scoredCurated)}종)
              </dd>
            </div>
            <div>
              <dt className="text-zinc-400">점수가 없는 이유</dt>
              <dd className="font-medium text-zinc-900">
                전부 개체수 자료 없음 — IUCN 평가와 연결 안 됨 {n(cov.unscoredNotSynced)}종 · 연결됐지만 평가에 개체수 없음{" "}
                {n(cov.unscoredSyncedNoPop)}종
                {cov.unscoredWithPopulation > 0 && ` · 개체수가 있는데 점수 없음 ${n(cov.unscoredWithPopulation)}종(확인 필요)`}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-400">개체수 출처 (계산 {n(cov.computed)}종)</dt>
              <dd className="font-medium text-zinc-900">
                {Object.entries(cov.popSource).map(([k, v]) => `${POP_SOURCE_LABEL[k] ?? k} ${n(v)}종`).join(" · ")}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-400">추세 입력 (EWS·PVA 의 r)</dt>
              <dd className="font-medium text-zinc-900">
                {Object.entries(cov.trendSource).map(([k, v]) => `${TREND_SOURCE_LABEL[k] ?? k} ${n(v)}종`).join(" · ")}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-400">Ne/Nc 비율 (유효개체군 레이어)</dt>
              <dd className="font-medium text-zinc-900">
                분류군 전용값 {n(cov.classLife.own)}종 · 기본값 {n(cov.classLife.fallback)}종
              </dd>
            </div>
            <div>
              <dt className="text-zinc-400">다수결 경보</dt>
              <dd className="font-medium text-zinc-900">
                0표 {n(cov.alerts["0"] ?? 0)}종 · 1표 {n(cov.alerts["1"] ?? 0)}종 · 2표 이상 {n(cov.alerts["2"] ?? 0)}종
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-[11px] text-zinc-500">
            EWS 레이어에는 개체수 시계열이 한 종도 들어가 있지 않습니다 — 모든 종이 추세로 추정한 값입니다.
            이 페이지가 저장값을 되짚은 결과, 계산 {n(cov.computed)}종 중 저장값과 다른 종은 {n(cov.traceMismatches)}종입니다.{" "}
            <Link href="/stats" className="font-bold text-zinc-700 underline">
              통계 페이지
            </Link>
            에도 산출 현황이 있습니다.
          </p>
        </Card>
      </Section>

      <Section id="spec-diff" label="명세서" title="명세서와 구현이 다른 지점">
        <Card>
          <p className="text-xs leading-relaxed text-zinc-700">
            이 점수의 설계는 특허 명세서에서 왔지만, 구현이 명세서와 다른 지점이 있습니다. 명세서는 출원이 끝나 고칠 수 없어,
            다른 지점은 저장소의 &lsquo;결정 대기 항목&rsquo; 문서(docs/decisions-pending.md)에 목록으로 모아 코드를 맞출지 항목별로 정합니다.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-200 text-zinc-500">
                  <th className="py-1.5 pr-3 font-bold">지점</th>
                  <th className="py-1.5 pr-3 font-bold">명세서</th>
                  <th className="py-1.5 pr-3 font-bold">지금 코드</th>
                  <th className="py-1.5 pr-3 font-bold">기록</th>
                  <th className="py-1.5 font-bold">이 페이지</th>
                </tr>
              </thead>
              <tbody className="text-zinc-800">
                {[
                  { name: "개체수 하한", spec: "기재 없음", code: `N0 구간별 하한 — ${n(cov.floor.bound)}종의 점수를 정함`, doc: "결정 대기 항목 1", to: "floor" },
                  { name: "Ne/Nc 비율", spec: "분류군별 명세서 값", code: "명세서와 다른 분류군별 값", doc: "결정 대기 항목 3", to: "layers" },
                  { name: "수용력 K", spec: "Damuth 식", code: "N0 에서 가정", doc: "결정 대기 항목 2", to: "layers" },
                  { name: "EWS", spec: "개체수 시계열 기반", code: "추세 기반 추정값", doc: "docs/ews-layer-audit.md", to: "ews" },
                  { name: "신뢰도", spec: "신뢰도로 레이어 가중치 조정", code: `고정 가중치 + 신뢰도 압축(적용 ${n(cov.compressed)}종)`, doc: "docs/confidence-audit.md", to: "confidence" },
                  { name: "다수결 문턱", spec: "모든 레이어에 한 문턱", code: `레이어별 문턱 (EWS ${AT.ews} · PVA ${AT.pva} · Ne ${AT.iucn})`, doc: "docs/layer-score-spec-vs-code.md §4", to: "combine" },
                ].map((r) => (
                  <tr key={r.name} className="border-b border-zinc-100">
                    <td className="whitespace-nowrap py-1.5 pr-3 font-bold">{r.name}</td>
                    <td className="py-1.5 pr-3">{r.spec}</td>
                    <td className="py-1.5 pr-3">{r.code}</td>
                    <td className="py-1.5 pr-3 text-zinc-500">{r.doc}</td>
                    <td className="py-1.5">
                      <a
                        href={`#${r.to}`}
                        className="inline-block whitespace-nowrap font-bold text-[#D81E05] underline underline-offset-2"
                      >
                        해당 절
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-zinc-500">
            결정 대기 목록에는 개체수 하한·수용력 K·Ne/Nc 를 포함한 항목이 올라 있습니다. EWS·신뢰도·다수결 문턱의 차이는 조사 문서에
            기록되어 있고, 결정 대기 목록에는 아직 올라 있지 않습니다.
          </p>
        </Card>
      </Section>

      <Section id="limits" label="한계" title="이 점수로 말할 수 없는 것">
        <Card>
          <ul className="space-y-2 text-xs leading-relaxed text-zinc-700">
            {[
              {
                to: "coverage",
                body: (
                  <>
                    <b>개체수 자료가 있는 {n(cov.computed)}종에만 계산됩니다.</b> DB {n(cov.species)}종 가운데 나머지는 개체수를 모르며,
                    개체수를 추정해서 채우지는 않습니다. 한 번 계산해 저장한 값이라 개체수 자료가 바뀌면 다시 계산해야 반영됩니다.
                  </>
                ),
              },
              {
                to: "floor",
                body: (
                  <>
                    <b>개체수 하한이 {n(cov.floor.bound)}종의 점수를 정합니다.</b> 명세서에 없는 LastWatch 자체 규칙이며, 이 종들의 점수는
                    레이어 계산보다 하한 표가 정했습니다.
                  </>
                ),
              },
              {
                to: "ews",
                body: (
                  <>
                    <b>EWS 는 추세 기반 추정값입니다.</b> 명세서는 개체수 시계열 기반인데 쓸 수 있는 시계열이 없어, 계산 종의 EWS 는{" "}
                    {cov.ewsValues.length}가지 값만 갖습니다.
                  </>
                ),
              },
              {
                to: "confidence",
                body: (
                  <>
                    <b>신뢰도는 모든 종이 같은 값입니다.</b> 레이어 신뢰도가 고정값이라 종합 신뢰도가 {fixedConfidence.toFixed(4)} 로 같고,
                    종별로 점수를 얼마나 믿을 수 있는지 알려주지 않습니다.
                  </>
                ),
              },
              {
                to: "spec-diff",
                body: (
                  <>
                    <b>명세서와 구현이 다른 지점이 있습니다.</b> 저장소의 결정 대기 항목 목록으로 관리하며, 이 페이지에 알려진 지점을 모았습니다.
                  </>
                ),
              },
              {
                to: "layers",
                body: (
                  <>
                    <b>IUCN 등급은 점수에 넣지 않았습니다.</b> 등급을 입력으로 쓰면 &lsquo;CR 이라서 점수가 높다&rsquo; 는 순환 논증이 되어,
                    점수가 등급을 되풀이할 뿐 새 정보를 주지 못합니다.
                  </>
                ),
              },
              {
                to: "combine",
                body: (
                  <>
                    <b>추세 보정은 한글 추세 칸만 봅니다.</b> IUCN 추세가 있는 종도 이 단계에서는 반영되지 않습니다(
                    {n(cov.trendAdjusted)}종에만 적용).
                  </>
                ),
              },
            ].map((item) => (
              <li key={item.to}>
                • {item.body}{" "}
                <a
                  href={`#${item.to}`}
                  className="inline-block whitespace-nowrap font-bold text-[#D81E05] underline underline-offset-2"
                >
                  해당 절 ↑
                </a>
              </li>
            ))}
          </ul>
        </Card>
      </Section>
    </div>
  );
}
