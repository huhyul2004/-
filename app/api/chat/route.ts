import { NextResponse } from "next/server";
import { getSpeciesById, getThreats, getActions, getHabitats, getTippingPoint } from "@/lib/queries";
import { generateText, friendlyError, GeminiConfigError } from "@/lib/gemini";
import { inferPopulationWithSource } from "@/lib/tipping-point";
import { buildLiteratureLines } from "@/lib/literature";
import { buildPeerComparisonLines } from "@/lib/peer-comparison";
import { floorBreakdown, floorStatusLine } from "@/lib/floor-transparency";

export const runtime = "nodejs";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { speciesId?: string; messages?: ChatMessage[] };
    const speciesId = body.speciesId;
    const messages = body.messages ?? [];
    if (!speciesId) return NextResponse.json({ error: "speciesId required" }, { status: 400 });
    if (messages.length === 0) {
      return NextResponse.json({ error: "messages required" }, { status: 400 });
    }

    const species = getSpeciesById(speciesId);
    if (!species) return NextResponse.json({ error: "not found" }, { status: 404 });

    const threats = getThreats(speciesId) as { threat_name: string }[];
    const actions = getActions(speciesId) as { action_name: string }[];
    const habitats = getHabitats(speciesId) as { habitat_name: string }[];
    const tipping = getTippingPoint(speciesId);

    const isExtinct = species.category === "EX" || species.category === "EW";
    const name = species.common_name_ko ?? species.common_name_en ?? species.scientific_name;

    // 개체수 추세 영문 코드 → 한글
    const TREND_KO: Record<string, string> = {
      Decreasing: "감소",
      Stable: "안정",
      Increasing: "증가",
      Unknown: "알 수 없음",
    };

    // 값이 없는 줄은 아예 넣지 않는다 — "데이터 없음" 문자열도, 빈 줄도 만들지 않는다.
    const lines: string[] = [];
    lines.push(`종: ${name} (${species.scientific_name})`);
    lines.push(
      `IUCN 등급: ${species.category}${isExtinct ? " - 이미 절멸" : ""}  [출처: species.category]`
    );
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
      lines.push(
        `전체 개체수: ${species.mature_individuals.toLocaleString()}마리  [출처: species.mature_individuals]`
      );
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

    if (tipping)
      lines.push(
        `LastWatch 위험도 점수: ${tipping.consensus_score}/100 — ${tipping.intervention_tier} ` +
          `${(tipping.payload as { tier_label: string }).tier_label}  ` +
          `[LastWatch 자체 계산 (IUCN 공식 지표 아님), 출처: tipping_points.consensus_score]`
      );

    // 개체수 하한 적용 여부 — 표시 전용. 하한에 묶인 종은 하한 적용 전 점수도 함께 보여준다.
    if (tipping) {
      const fb = floorBreakdown(species, tipping.payload);
      if (fb) lines.push(floorStatusLine(fb));
    }

    // 문헌 대조 블록 — 개체수가 있는 종에만 붙인다.
    // v5 와 같은 기준 개체수를 쓰기 위해 inferPopulationWithSource 를 그대로 재사용한다
    // (tipping-point.ts 는 읽기만 하고 고치지 않는다).
    const pop = inferPopulationWithSource(species);
    if (pop.value != null) {
      const neV5 =
        (tipping?.payload as { layer_scores?: { iucn?: { Ne?: number } } } | undefined)
          ?.layer_scores?.iucn?.Ne ?? null;
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
    if (threats.length)
      lines.push(`주요 위협: ${threats.map((t) => t.threat_name).join(", ")}  [출처: threats]`);
    if (actions.length)
      lines.push(`보전 활동: ${actions.map((a) => a.action_name).join(", ")}  [출처: conservation_actions]`);
    if (habitats.length)
      lines.push(`서식지: ${habitats.map((h) => h.habitat_name).join(", ")}  [출처: habitats]`);

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

    const ctx = lines.join("\n");

    const system = `당신은 LastWatch 데이터베이스를 근거로 답하는 보전생물학 조사 보조입니다.
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
전체 개체수와 성숙 개체수는 서로 다른 값입니다. 섞어 쓰거나 한쪽을 다른 쪽으로 대신하지 않습니다.
문헌 기준값을 인용할 때는 출처 논문과 그 값에 논쟁이 있는지를 함께 밝힙니다.
비교 수치를 말할 때는 무엇과 비교한 것인지(등급·분류군·종 수)를 함께 밝힙니다.
개체수 하한이 적용된 점수를 말할 때는 하한 적용 전 값도 함께 밝힙니다.

[모르는 것]
컨텍스트에 없는 항목은 "LastWatch 데이터에는 없습니다"라고 답합니다. 일반 상식이나 기억한 문헌으로 빈칸을 메우지 않습니다.
데이터에 없는 항목을 답할 때는 IUCN Red List 링크가 있으면 함께 안내합니다. 다만 등급이나 분류군의 일반적 경향으로 그 종의 위협을 추측해 서술하지 않습니다.
데이터 밖의 내용을 참고로 덧붙일 때는 문장 앞에 "LastWatch 데이터 밖·미검증"이라고 먼저 표시합니다.
추정·해석·추론은 "추정:"으로 시작해 사실과 분리하고, 어느 데이터에서 어떻게 추정했는지 한 줄로 밝힙니다.
데이터끼리 어긋나면 감추지 말고 모순 자체를 지적합니다.

[형식]
길이 제한은 없습니다. 다만 불필요하게 늘리지 않습니다 — 단순 조회는 1-2문장, 해석·비교를 요구하면 필요한 만큼 쓰되 항목별로 정리합니다.
각 항목 뒤 대괄호는 데이터 출처입니다. 답변에서도 같은 출처 표기를 유지합니다.
이 종과 무관한 질문에는 "${name}의 LastWatch 데이터 범위 밖입니다. 이 종에 집중해 답변합니다"라고 안내하고, 답할 수 있는 범위를 한 줄로 알려줍니다.

[종 컨텍스트]
${ctx}`;

    const text = await generateText({
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      maxTokens: 1200,
    });

    return NextResponse.json({ reply: text.trim() });
  } catch (e) {
    console.error("[chat]", e);
    const status = e instanceof GeminiConfigError ? 503 : 500;
    return NextResponse.json({ error: friendlyError(e) }, { status });
  }
}
