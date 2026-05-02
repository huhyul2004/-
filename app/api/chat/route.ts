import { NextResponse } from "next/server";
import { getSpeciesById, getThreats, getActions, getHabitats } from "@/lib/queries";
import { getAnthropic, MODEL } from "@/lib/anthropic";

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

    const isExtinct = species.category === "EX" || species.category === "EW";
    const ctx = `종: ${species.common_name_ko ?? species.common_name_en ?? species.scientific_name} (${species.scientific_name})
IUCN 등급: ${species.category}${isExtinct ? " - 이미 절멸" : ""}
분류: ${species.class_name ?? "정보 없음"}
지역: ${species.region ?? "정보 없음"}
요약: ${species.summary_ko ?? "정보 없음"}
${isExtinct && species.extinction_year ? `절멸 시기: ${species.extinction_year}년` : ""}
${isExtinct && species.extinction_cause ? `절멸 원인: ${species.extinction_cause}` : ""}
주요 위협: ${threats.map((t) => t.threat_name).join(", ") || "데이터 없음"}
보전 활동: ${actions.map((a) => a.action_name).join(", ") || "데이터 없음"}
서식지: ${habitats.map((h) => h.habitat_name).join(", ") || "데이터 없음"}`;

    const system = `당신은 위 종에 대해서만 답하는 친근한 보전생물학자입니다.
한국 청소년이 이해할 수 있게, 짧고 명확하게 (4-6문장 내외) 답합니다.
모르는 사실은 정직하게 모른다고 말하고, 추측은 추측이라고 표시합니다.
이 종과 직접 관련 없는 질문에는 "이 종에 집중해서 답변드릴게요"라고 부드럽게 안내합니다.

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
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
