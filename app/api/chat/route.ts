import { NextResponse } from "next/server";
import { getSpeciesById, getThreats, getActions, getHabitats, getTippingPoint } from "@/lib/queries";
import { getAnthropic, MODEL, friendlyError, AnthropicConfigError } from "@/lib/anthropic";

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

    const ctx = lines.join("\n");

    const system = `당신은 위 종에 대해서만 답하는 친근한 보전생물학자입니다.
한국 청소년이 이해할 수 있게, 짧고 명확하게 (4-6문장 내외) 답합니다.
모르는 사실은 정직하게 모른다고 말하고, 추측은 추측이라고 표시합니다.
이 종과 직접 관련 없는 질문에는 "이 종에 집중해서 답변드릴게요"라고 부드럽게 안내합니다.
각 항목 뒤 대괄호는 데이터 출처입니다. 답변할 때 숫자를 말하면 어느 출처인지 함께 밝히고, 목록에 없는 정보는 지어내지 말고 없다고 답하세요.

[종 컨텍스트]
${ctx}`;

    const client = getAnthropic();
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 600,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });

    const text = resp.content.filter((b) => b.type === "text").map((b: any) => b.text).join("");
    return NextResponse.json({ reply: text.trim() });
  } catch (e) {
    console.error("[chat]", e);
    const status = e instanceof AnthropicConfigError ? 503 : 500;
    return NextResponse.json({ error: friendlyError(e) }, { status });
  }
}
