// 챗봇 컨텍스트 생성 — app/api/chat/route.ts 와 평가 스크립트(research/chatbot-eval)가 같이 쓴다.
//
// 라우트에 있던 컨텍스트 조립을 그대로 옮겼고(2026-10-03), 다음을 더했다.
//   - 결정 1: 개체수 하한이 점수를 정한 종은 lib/floor-transparency.ts 가 "개체수 하한 규칙 적용됨" 줄을 만들고,
//             시스템 프롬프트가 그 문구를 답변에 그대로 쓰라고 지시한다. 모델이 빠뜨리면 finalizeReply 가 덧붙인다.
//   - 결정 10·11: 답변 끝 "데이터 출처: LastWatch DB v…, IUCN API 조회일 …, 계산일 …" 은 서버가 붙인다 (lib/provenance.ts).
//   - 점수 계산 과정 한 줄 (엔진이 남긴 집계 추적) 과 계산 근거 페이지 경로.
//   - 사이트 표시 등급과 IUCN API 동기화 등급이 다르면 그 사실.
//   - 절멸·야생절멸 종 점수 100 은 계산값이 아니라 고정값이라는 사실.
import { getSpeciesById, getThreats, getActions, getHabitats, getTippingPoint } from "./queries";
import { inferPopulationWithSource, type AggregationTrace } from "./tipping-point";
import { buildLiteratureLines } from "./literature";
import { buildPeerComparisonLines } from "./peer-comparison";
import {
  aggregationOf,
  floorBreakdown,
  floorStatusLine,
  FLOOR_APPLIED_LABEL,
  type FloorBreakdown,
} from "./floor-transparency";
import { splitThreats, threatPath } from "./threat-display";
import { provenanceLine, kstDate, PROVENANCE_PREFIX } from "./provenance";
import type { ConservationActionRow, HabitatRow, SpeciesRow, ThreatRow } from "./db";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatContext {
  species: SpeciesRow;
  name: string;
  isExtinct: boolean;
  /** [종 컨텍스트] 본문 */
  context: string;
  /** 모델에 넘길 시스템 프롬프트 전체 */
  system: string;
  /** 하한 적용 전후 — EX/EW·점수 없음이면 null */
  floor: FloorBreakdown | null;
  /** 답변 끝에 붙일 "데이터 출처: …" 줄 */
  provenance: string;
  /** 계산 근거 페이지 경로 — 점수가 계산된 종만 */
  calculationPath: string | null;
}

// 개체수 추세 영문 코드 → 한글
const TREND_KO: Record<string, string> = {
  Decreasing: "감소",
  Stable: "안정",
  Increasing: "증가",
  Unknown: "알 수 없음",
};

const BRANCH_TEXT = {
  none: (a: AggregationTrace) => `경보 0표 → ×${a.majorityFactor} = ${a.afterMajority.toFixed(2)}`,
  single: (a: AggregationTrace) => `경보 1표 → ×${a.majorityFactor} = ${a.afterMajority.toFixed(2)}`,
  blend: (a: AggregationTrace) =>
    `경보 ${a.m}표 → ${a.blendAlpha}·가중합 + ${(1 - (a.blendAlpha ?? 0)).toFixed(1)}·최댓값 ${a.maxLayer.toFixed(2)} = ${a.afterMajority.toFixed(2)}`,
} as const;

/** 점수 계산 과정 한 줄 — 가중합 → 다수결 분기 → 신뢰도 압축 → 개체수 하한 → 추세 보정 */
export function aggregationLine(a: AggregationTrace, engineVersion: string | null): string {
  const L = a.layers;
  const steps = [
    `레이어 EWS ${L.ews.toFixed(2)}(추세 기반 추정값) · PVA ${L.pva.toFixed(2)} · Ne ${L.iucn.toFixed(2)}`,
    `가중합(${a.weights.ews.toFixed(2)}·${a.weights.pva.toFixed(2)}·${a.weights.iucn.toFixed(2)}) ${a.weighted.toFixed(2)}`,
    BRANCH_TEXT[a.branch](a),
  ];
  if (a.compressionApplied) steps.push(`신뢰도 ${a.confidence.overall.toFixed(2)} < 0.5 → 압축 ${a.afterCompression.toFixed(2)}`);
  if (a.floor.applied) steps.push(`${FLOOR_APPLIED_LABEL}(N0 < ${a.floor.below} → ${a.floor.value}) → ${a.afterFloor.toFixed(2)}`);
  else if (a.floor.below != null) steps.push(`개체수 하한 ${a.floor.value}(N0 < ${a.floor.below}) — 점수가 더 높아 미적용`);
  if (a.trend.delta !== 0) steps.push(`추세 보정 ${a.trend.delta > 0 ? "+" : ""}${a.trend.delta} ("${a.trend.input}")`);
  steps.push(`최종 ${a.score.toFixed(1)}`);
  return (
    `점수 계산 과정${engineVersion ? ` (엔진 ${engineVersion})` : ""}: ${steps.join(" → ")}  ` +
    `[출처: tipping_points.payload_json.aggregation, 경보 문턱 EWS>${a.thresholds.ews}·PVA>${a.thresholds.pva}·Ne>${a.thresholds.iucn}]`
  );
}

/** 종 하나의 챗봇 컨텍스트. 종이 없으면 null */
export function buildChatContext(speciesId: string): ChatContext | null {
  const species = getSpeciesById(speciesId);
  if (!species) return null;

  const threats = getThreats(speciesId) as ThreatRow[];
  const actions = getActions(speciesId) as ConservationActionRow[];
  const habitats = getHabitats(speciesId) as HabitatRow[];
  const tipping = getTippingPoint(speciesId);

  const isExtinct = species.category === "EX" || species.category === "EW";
  const name = species.common_name_ko ?? species.common_name_en ?? species.scientific_name;

  // 값이 없는 줄은 아예 넣지 않는다 — "데이터 없음" 문자열도, 빈 줄도 만들지 않는다.
  const lines: string[] = [];
  lines.push(`종: ${name} (${species.scientific_name})`);
  lines.push(`IUCN 등급: ${species.category}${isExtinct ? " - 이미 절멸" : ""}  [출처: species.category]`);
  // 사이트 표시 등급(category)과 IUCN API 동기화 등급(iucn_category)이 다르면 감추지 않고 둘 다 적는다.
  if (species.iucn_category && species.iucn_category !== species.category) {
    const synced = kstDate(species.iucn_synced_at);
    lines.push(
      `IUCN API 동기화 등급: ${species.iucn_category}${synced ? ` (${synced} 조회)` : ""} — ` +
        `사이트 표시 등급 ${species.category} 와 다름. LastWatch 는 어느 쪽이 맞는지 판정하지 않았음  ` +
        `[출처: species.iucn_category, species.iucn_synced_at]`
    );
  }
  if (species.iucn_assessment_year)
    lines.push(`IUCN 평가 연도: ${species.iucn_assessment_year}년  [출처: species.iucn_assessment_year]`);
  // IUCN Red List 평가 원문 링크 — 저장된 iucn_url 을 쓰고, 없으면 같은 형식을 sis_id·assessment_id 로 만든다.
  const iucnLink =
    species.iucn_url ||
    (species.iucn_sis_id && species.iucn_assessment_id
      ? `https://www.iucnredlist.org/species/${species.iucn_sis_id}/${species.iucn_assessment_id}`
      : null);
  if (iucnLink)
    lines.push(
      `IUCN Red List 평가 원문: ${iucnLink}  ` +
        `[출처: ${species.iucn_url ? "species.iucn_url" : "species.iucn_sis_id·iucn_assessment_id"}]`
    );
  if (species.class_name) lines.push(`분류: ${species.class_name}  [출처: species.class_name]`);
  if (species.region) lines.push(`지역: ${species.region}  [출처: species.region]`);

  // 주의: 컬럼 이름과 내용이 서로 반대다.
  //   mature_individuals   → 실제로는 '전체 개체수'
  //   iucn_population_size → 실제로는 '성숙 개체수'
  // DB 는 건드리지 않고 프롬프트 라벨만 내용에 맞춰 붙인다.
  if (species.mature_individuals != null)
    lines.push(`전체 개체수: ${species.mature_individuals.toLocaleString()}마리  [출처: species.mature_individuals]`);
  if (species.iucn_population_size != null)
    lines.push(
      `성숙 개체수: ${species.iucn_population_size.toLocaleString()}마리  ` +
        `[출처: species.iucn_population_size` +
        (species.iucn_assessment_year ? `, IUCN ${species.iucn_assessment_year}년 평가` : "") +
        `]`
    );

  if (species.iucn_population_trend)
    lines.push(
      `개체수 추세: ${TREND_KO[species.iucn_population_trend] ?? species.iucn_population_trend}` +
        `  [출처: species.iucn_population_trend]`
    );

  const payload = tipping?.payload as { tier_label?: string; engine_version?: string } | undefined;
  if (tipping && isExtinct) {
    lines.push(
      `LastWatch 위험도 점수: ${tipping.consensus_score}/100 — ${tipping.intervention_tier} ${payload?.tier_label ?? ""}  ` +
        `[LastWatch 규칙: 절멸·야생절멸 종은 위험도를 계산하지 않고 100 으로 고정 (계산값 아님), 출처: tipping_points.consensus_score]`
    );
  } else if (tipping) {
    lines.push(
      `LastWatch 위험도 점수: ${tipping.consensus_score}/100 — ${tipping.intervention_tier} ` +
        `${payload?.tier_label ?? ""}  ` +
        `[LastWatch 자체 계산 (IUCN 공식 지표 아님), 출처: tipping_points.consensus_score]`
    );
  }

  // 개체수 하한 적용 여부 (결정 1) — 하한에 묶인 종은 "개체수 하한 규칙 적용됨" 과 하한 적용 전 점수를 함께 싣는다.
  const floor = tipping && !isExtinct ? floorBreakdown(species, tipping.payload) : null;
  if (floor) lines.push(floorStatusLine(floor));

  // 점수 계산 과정 — 엔진이 남긴 집계 추적을 그대로 읽는다 (없으면 같은 집계 함수로 다시 계산).
  const pop = inferPopulationWithSource(species);
  let calculationPath: string | null = null;
  if (tipping && !isExtinct && pop.value != null) {
    const agg = aggregationOf(species, pop.value, tipping.payload);
    if (agg) lines.push(aggregationLine(agg, payload?.engine_version ?? null));
    calculationPath = `/species/${encodeURIComponent(speciesId)}/calculation`;
    lines.push(
      `계산 근거 페이지: ${calculationPath} — 레이어 점수·가중합·다수결·하한 적용 전후의 모든 중간값과 각 값의 출처  ` +
        `[LastWatch 사이트 경로]`
    );
  }

  // 문헌 대조 블록 — 개체수가 있는 종에만 붙인다.
  // v5 와 같은 기준 개체수를 쓰기 위해 inferPopulationWithSource 를 그대로 재사용한다.
  if (pop.value != null) {
    const neV5 =
      (tipping?.payload as { layer_scores?: { iucn?: { Ne?: number } } } | undefined)?.layer_scores?.iucn?.Ne ?? null;
    lines.push(
      ...buildLiteratureLines({
        N: pop.value,
        populationSource: `species.${pop.source}`,
        neV5,
        className: species.class_name,
      })
    );
  }

  // 같은 등급·분류군 비교 블록 — 비교 상대가 MIN_GROUP_SIZE 미만이면 빈 배열이라 아무것도 붙지 않는다.
  lines.push(...buildPeerComparisonLines(speciesId));

  if (isExtinct && species.extinction_year)
    lines.push(`절멸 시기: ${species.extinction_year}년  [출처: species.extinction_year]`);
  if (isExtinct && species.extinction_cause)
    lines.push(`절멸 원인: ${species.extinction_cause}  [출처: species.extinction_cause]`);
  if (species.summary_ko) lines.push(`요약: ${species.summary_ko}  [출처: species.summary_ko]`);
  // 수기 입력 위협(코드 없음)은 이름만, IUCN 위협(코드 있음)은 상위 분류 경로·코드를 붙여 시기별로 나눈다
  // (lib/threat-display.ts — 종·절멸 페이지와 공용).
  const { manual: manualThreats, groups: threatGroups } = splitThreats(threats);
  if (manualThreats.length)
    lines.push(`주요 위협: ${manualThreats.map((t) => t.threat_name).join(", ")}  [출처: threats]`);
  for (const { group, threats: items } of threatGroups)
    lines.push(
      `${group.chatLabel}: ${items.map(threatPath).join("; ")}  ` +
        `[출처: threats.threat_category > threat_parent > threat_name (threat_code), threats.timing]`
    );
  if (actions.length)
    lines.push(`보전 활동: ${actions.map((a) => a.action_name).join(", ")}  [출처: conservation_actions]`);
  if (habitats.length) lines.push(`서식지: ${habitats.map((h) => h.habitat_name).join(", ")}  [출처: habitats]`);

  // 위협·보전 활동·서식지가 비어 있으면 비어 있다고 적는다 — 모델이 등급·분류군 일반론으로 채우지 않게.
  const missing = [
    threats.length ? null : "주요 위협",
    actions.length ? null : "보전 활동",
    habitats.length ? null : "서식지",
  ].filter(Boolean);
  if (missing.length)
    lines.push(
      `${missing.join("·")}: LastWatch 데이터에 없음` +
        (iucnLink ? ` — IUCN Red List 평가 원문(${iucnLink})에서 확인 가능` : "") +
        `  [출처: threats·conservation_actions·habitats 테이블에 이 종의 행 없음]`
    );

  const context = lines.join("\n");
  return {
    species,
    name,
    isExtinct,
    context,
    system: buildSystemPrompt(name, context),
    floor,
    provenance: provenanceLine({
      iucnSyncedAt: species.iucn_synced_at,
      iucnDetailsSyncedAt: species.iucn_details_synced_at,
      computedAt: tipping?.computed_at ?? null,
    }),
    calculationPath,
  };
}

export function buildSystemPrompt(name: string, context: string): string {
  return `당신은 LastWatch 데이터베이스를 근거로 답하는 보전생물학 조사 보조입니다.
근거는 아래 [종 컨텍스트]에 실린 사실뿐이고, 지금 다루는 대상은 그 종 하나입니다.

[기본 태도 — 연구자용]
주 사용자는 연구자·전문가입니다. 읽기 쉬움보다 팩트 정확성이 우선입니다.
학명·등급 코드·수치·연도는 컨텍스트에 적힌 그대로 쓰고, 완곡하게 바꾸거나 반올림하지 않습니다.
격려·감탄·이모지·구호성 문장("함께 지켜요" 같은)은 쓰지 않습니다.

[두 목소리, 사실은 하나]
질문이 쉬운 말로 오면 답도 쉬운 말로 합니다. 다만 숫자·출처·기준 연도는 연구자에게 답할 때와 똑같이 붙입니다.
바뀌는 것은 문장의 난이도뿐이고, 근거의 양과 정확도는 낮추지 않습니다.
전문 용어를 풀어 쓸 때도 원래 용어를 괄호로 함께 남깁니다. 예: 성숙 개체수(mature individuals).

[숫자 규칙]
숫자를 말할 때는 반드시 (1) 출처와 (2) 기준 연도를 함께 밝힙니다. 컨텍스트에 연도가 없으면 "기준 연도 미상"이라고 명시합니다.
컨텍스트의 값을 임의로 반올림·환산·합산하지 않고 그대로 인용합니다.
연도·출처는 같은 줄 대괄호에 적힌 것만 인용합니다. 다른 줄의 연도를 끌어다 붙이지 않습니다.
LastWatch 위험도 점수는 언급할 때마다 "LastWatch 자체 계산(v5), IUCN 공식 지표 아님"을 함께 밝힙니다.
단, 절멸·야생절멸 종의 점수 100 은 계산값이 아닙니다 — "LastWatch 규칙에 따른 고정값(계산값 아님), IUCN 공식 지표 아님"으로 밝히고 "자체 계산"이라고 부르지 않습니다.
전체 개체수와 성숙 개체수는 서로 다른 값입니다. 섞어 쓰거나 한쪽을 다른 쪽으로 대신하지 않습니다.
문헌 기준값을 인용할 때는 출처 논문과 그 값에 논쟁이 있는지를 함께 밝힙니다.
비교 수치를 말할 때는 무엇과 비교한 것인지(등급·분류군·종 수)를 함께 밝힙니다.

[개체수 하한]
컨텍스트에 "${FLOOR_APPLIED_LABEL}" 줄이 있는 종의 위험도 점수를 말할 때는 점수 바로 옆에 "${FLOOR_APPLIED_LABEL}"을 그대로 쓰고,
하한 적용 전 점수와 이 규칙이 LastWatch 자체 규칙(특허 명세서 미기재)이라는 사실을 함께 밝힙니다.
예: "LastWatch 위험도 점수 78/100 (${FLOOR_APPLIED_LABEL} — 하한 적용 전 47.1점, LastWatch 자체 규칙·특허 명세서 미기재)".
점수가 어떻게 나왔는지 물으면 "점수 계산 과정" 줄의 단계를 순서대로 인용하고, "계산 근거 페이지" 경로를 안내합니다.

[모르는 것]
컨텍스트에 없는 항목은 "LastWatch 데이터에는 없습니다"라고 답합니다. 일반 상식이나 기억한 문헌으로 빈칸을 메우지 않습니다.
데이터에 없는 항목을 답할 때는 IUCN Red List 링크가 있으면 함께 안내합니다. 다만 등급이나 분류군의 일반적 경향으로 그 종의 위협을 추측해 서술하지 않습니다.
데이터 밖의 내용을 참고로 덧붙일 때는 문장 앞에 "LastWatch 데이터 밖·미검증"이라고 먼저 표시합니다.
추정·해석·추론은 "추정:"으로 시작해 사실과 분리하고, 어느 데이터에서 어떻게 추정했는지 한 줄로 밝힙니다.
데이터끼리 어긋나면 감추지 말고 모순 자체를 지적합니다.

[위협]
IUCN 위협은 "대분류 > 중분류 > 항목 (코드)" 경로로 적혀 있습니다. 항목 이름만 떼어 쓰지 말고 상위 분류와 함께 씁니다.
항목 이름이 같아도(예: Named species, Scale Unknown/Unrecorded) 상위 분류가 다르면 서로 다른 위협입니다. 합치지 않습니다.
위협은 시기(timing)별 줄로 나뉘어 있습니다. 과거 위협(Past)은 현재 위협으로 서술하지 않고, 시기를 함께 밝힙니다.

[형식]
길이 제한은 없습니다. 다만 불필요하게 늘리지 않습니다 — 단순 조회는 1-2문장, 해석·비교를 요구하면 필요한 만큼 쓰되 항목별로 정리합니다.
각 항목 뒤 대괄호는 데이터 출처입니다. 답변에서도 같은 출처 표기를 유지합니다.
수식·기호는 LaTeX($…$, \rightarrow 같은 명령)로 쓰지 않고 일반 글자로 씁니다. 예: N0 < 500 → 60점, 0.6·가중합 + 0.4·최댓값.
답변 끝의 "${PROVENANCE_PREFIX} …" 줄(DB 버전·IUCN 조회일·계산일)은 시스템이 자동으로 붙입니다. 직접 쓰지 않습니다.
이 종과 무관한 질문에는 "${name}의 LastWatch 데이터 범위 밖입니다. 이 종에 집중해 답변합니다"라고 안내하고, 답할 수 있는 범위를 한 줄로 알려줍니다. 이 안내에는 수치를 쓰지 않습니다.

[종 컨텍스트]
${context}`;
}

// ---------- 대화 기록 정리 ----------

/** 모델에 넘기는 최근 메시지 수 */
export const MAX_HISTORY = 20;
/** 메시지 하나의 최대 길이 (자) — 사용자 질문 / 이전 답변 */
export const MAX_USER_CHARS = 2000;
export const MAX_ASSISTANT_CHARS = 8000;

/**
 * 클라이언트가 보낸 대화 기록을 모델에 넘길 수 있게 정리한다. 형식이 틀린 항목은 버린다.
 * - 역할은 user·assistant 만, 내용은 문자열만
 * - 화면에만 보이던 오류 말풍선("⚠ …")은 버린다
 * - 이전 답변 끝의 "데이터 출처:" 줄은 지운다 (모델이 따라 쓰지 않게)
 * - 첫 메시지는 user 로 시작하게 하고, 같은 역할이 이어지면 합친다
 * - 최근 MAX_HISTORY 개만, 너무 긴 내용은 자른다
 */
export function sanitizeHistory(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const cleaned: ChatMessage[] = [];
  for (const m of raw.slice(-MAX_HISTORY * 2)) {
    if (!m || typeof m !== "object") continue;
    const role = (m as { role?: unknown }).role;
    const content = (m as { content?: unknown }).content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") continue;
    let text = content.trim();
    if (role === "assistant") {
      if (text.startsWith("⚠")) continue;
      text = stripProvenance(text);
    }
    if (!text) continue;
    const limit = role === "user" ? MAX_USER_CHARS : MAX_ASSISTANT_CHARS;
    if (text.length > limit) text = text.slice(0, limit);
    const prev = cleaned[cleaned.length - 1];
    if (prev && prev.role === role) prev.content = `${prev.content}\n\n${text}`;
    else cleaned.push({ role, content: text });
  }
  const recent = cleaned.slice(-MAX_HISTORY);
  while (recent.length && recent[0].role !== "user") recent.shift();
  return recent;
}

/** "데이터 출처:" 로 시작하는 줄을 지운다 */
export function stripProvenance(text: string): string {
  return text
    .split("\n")
    .filter((l) => !l.trim().replace(/^[*_>\s]+/, "").startsWith(PROVENANCE_PREFIX))
    .join("\n")
    .trim();
}

// 모델이 규칙을 어기고 LaTeX 를 쓰면 화면에 "$N_0 \\rightarrow 60$" 처럼 날것으로 보인다 — 흔한 표기만 일반 글자로 바꾼다.
const LATEX_SYMBOLS: [RegExp, string][] = [
  [/\\(?:longrightarrow|rightarrow|to)\b/g, "→"],
  [/\\(?:longleftarrow|leftarrow)\b/g, "←"],
  [/\\Rightarrow\b/g, "⇒"],
  [/\\cdot\b/g, "·"],
  [/\\times\b/g, "×"],
  [/\\(?:leq|le)\b/g, "≤"],
  [/\\(?:geq|ge)\b/g, "≥"],
  [/\\(?:neq|ne)\b/g, "≠"],
  [/\\approx\b/g, "≈"],
  [/\\pm\b/g, "±"],
  [/\\sim\b/g, "~"],
  [/\\%/g, "%"],
  [/\\[,;:! ]/g, " "],
];

/**
 * $…$ · $$…$$ 수식을 일반 글자로. 인라인 $…$ 은 Pandoc 규칙으로만 수식으로 본다 — 여는 $ 바로 뒤와 닫는 $ 바로 앞이
 * 공백이 아니고, 닫는 $ 바로 뒤가 숫자가 아닐 때 ("$5 와 $10" 같은 금액은 해당하지 않는다).
 * LaTeX 명령이 없는 수식($Ne/N=0.1$)은 $ 만 벗긴다.
 */
export function plainMath(text: string): string {
  return text.replace(/\$\$([^$]+)\$\$|\$(?!\s)([^$\n]*?[^\s$])\$(?!\d)/g, (whole: string, block?: string, inline?: string) => {
    const body = block ?? inline ?? "";
    if (!/[\\_^{}]/.test(body)) return body.trim();
    let m = body
      .replace(/\\(?:text|mathrm|mathit|operatorname)\{([^{}]*)\}/g, "$1")
      .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "$1/$2");
    for (const [re, sym] of LATEX_SYMBOLS) m = m.replace(re, sym);
    m = m
      .replace(/_\{(\w)\}/g, "$1") // N_{e} → Ne
      .replace(/_\{([^{}]*)\}/g, "_$1") // P_{ext} → P_ext
      .replace(/_(\w)(?!\w)/g, "$1") // N_0 → N0
      .replace(/\^\{([^{}]*)\}/g, "^$1")
      .replace(/\\([A-Za-z]+)/g, "$1")
      .replace(/[{}]/g, "");
    return m.replace(/\s{2,}/g, " ").trim();
  });
}

/** 답변이 이 종의 최종 점수 값을 말하는가 ("78점", "78.0점", "78/100") — 하한 문구 보강 여부 판단용.
 *  "위험도 점수" 라는 낱말만 나오는 답(범위 밖 안내, 점수가 계산에 쓰이지 않는다는 설명 등)에는 붙이지 않는다. */
export function mentionsScoreValue(body: string, score: number): boolean {
  const v = Number.isInteger(score) ? `${score}(?:\\.0)?` : score.toFixed(1).replace(".", "\\.");
  return new RegExp(`(?<![\\d.])${v}\\s*(?:점|/\\s*100)`).test(body);
}

/**
 * 모델 답변을 마무리한다.
 * 1) 모델이 쓴 "데이터 출처:" 줄은 지우고, LaTeX 표기는 일반 글자로 바꾼다
 * 2) 하한이 점수를 정한 종인데 점수를 말하면서 "개체수 하한 규칙 적용됨" 을 빠뜨렸으면 한 줄 덧붙인다
 * 3) 끝에 데이터 출처 줄을 붙인다
 */
export function finalizeReply(text: string, ctx: Pick<ChatContext, "floor" | "provenance">): string {
  let body = plainMath(stripProvenance(text.trim()));
  const fb = ctx.floor;
  if (fb?.bound && mentionsScoreValue(body, fb.final) && !body.includes(FLOOR_APPLIED_LABEL)) {
    body +=
      `\n\n※ ${FLOOR_APPLIED_LABEL}: 최종 ${fb.final.toFixed(1)}점(LastWatch 자체 계산, IUCN 공식 지표 아님)은 ` +
      `개체수 하한(${fb.band} → ${fb.floor}점)이 정한 값이고, 하한 적용 전 점수는 ${fb.withoutFloor.toFixed(1)}점입니다. ` +
      `이 규칙은 LastWatch 자체 규칙이며 특허 명세서에 기재되지 않았습니다  [출처: LastWatch v5, 개체수 하한 규칙]`;
  }
  return `${body}\n\n${ctx.provenance}`;
}
