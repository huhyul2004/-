import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSpeciesById, getThreats, getActions, getHabitats } from "@/lib/queries";
import { getAnthropic, MODEL, extractJson, friendlyError, AnthropicConfigError } from "@/lib/anthropic";

export const runtime = "nodejs";

interface RecommendPayload {
  oneLiner: string;
  whyItMatters: string;
  immediateActions: { title: string; detail: string }[];
  longTermStrategy: string;
  whatYouCanDo: string[];
}

export async function POST(req: Request) {
  try {
    const { speciesId } = (await req.json()) as { speciesId?: string };
    if (!speciesId) return NextResponse.json({ error: "speciesId required" }, { status: 400 });

    const species = getSpeciesById(speciesId);
    if (!species) return NextResponse.json({ error: "not found" }, { status: 404 });

    const db = getDb();
    const cached = db
      .prepare("SELECT payload_json FROM ai_recommendations WHERE species_id = ?")
      .get(speciesId) as { payload_json: string } | undefined;
    if (cached) {
      return NextResponse.json(JSON.parse(cached.payload_json));
    }

    const threats = getThreats(speciesId) as { threat_name: string; severity: string | null }[];
    const actions = getActions(speciesId) as { action_name: string }[];
    const habitats = getHabitats(speciesId) as { habitat_name: string }[];

    const ctx = {
      name: species.common_name_ko ?? species.common_name_en ?? species.scientific_name,
      sciName: species.scientific_name,
      category: species.category,
      classKo: species.class_name,
      region: species.region,
      summary: species.summary_ko,
      threats: threats.map((t) => t.threat_name),
      actions: actions.map((a) => a.action_name),
      habitats: habitats.map((h) => h.habitat_name),
    };

    const system = `당신은 IUCN Red List 기반 보전생물학자입니다. 한국 청소년이 이해할 수 있게,
교육적이고 정확하며 실행 가능한 보전 전략을 제안합니다. 반드시 한국어로, JSON만 출력하세요.

스키마:
{
  "oneLiner": "이 종을 살리려면 가장 먼저 해야 할 한 줄 요약 (40자 이내)",
  "whyItMatters": "이 종이 멸종할 때 생태계와 사람에게 미치는 영향 (2-3문장)",
  "immediateActions": [
    {"title": "행동 제목 (10자 이내)", "detail": "1-2문장의 구체적 설명"}
  ],
  "longTermStrategy": "10년 단위의 장기 보전 전략 (3-4문장)",
  "whatYouCanDo": ["청소년/시민이 지금 할 수 있는 행동 5가지 (각 한 줄)"]
}

immediateActions 는 정확히 4개. whatYouCanDo 는 정확히 5개.`;

    const user = `종 정보:
이름: ${ctx.name} (${ctx.sciName})
IUCN 등급: ${ctx.category}
분류: ${ctx.classKo ?? "정보 없음"}
지역: ${ctx.region ?? "정보 없음"}
요약: ${ctx.summary ?? "정보 없음"}
주요 위협: ${ctx.threats.join(", ") || "데이터 없음"}
기존 보전 활동: ${ctx.actions.join(", ") || "데이터 없음"}
서식지: ${ctx.habitats.join(", ") || "데이터 없음"}

위 정보를 바탕으로 JSON 답변만 출력하세요.`;

    const client = getAnthropic();
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system,
      messages: [{ role: "user", content: user }],
    });

    const text = resp.content.filter((b) => b.type === "text").map((b: any) => b.text).join("");
    const parsed = extractJson<RecommendPayload>(text);

    // 캐시 저장은 best-effort — 읽기 전용 환경에선 조용히 패스
    try {
      db.prepare(
        "INSERT OR REPLACE INTO ai_recommendations (species_id, payload_json) VALUES (?, ?)"
      ).run(speciesId, JSON.stringify(parsed));
    } catch {
      // ignore — Vercel 등 read-only 환경
    }

    return NextResponse.json(parsed);
  } catch (e) {
    console.error("[recommend]", e);
    const status = e instanceof AnthropicConfigError ? 503 : 500;
    return NextResponse.json({ error: friendlyError(e) }, { status });
  }
}
