import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSpeciesById } from "@/lib/queries";
import { getAnthropic, MODEL, extractJson, friendlyError, AnthropicConfigError } from "@/lib/anthropic";

export const runtime = "nodejs";

interface RetroPayload {
  decisivePoint: { year: string; description: string };
  whatWentWrong: string[];
  ifWeHadActed: string;
  lessonsForToday: string[];
  warning: string;
}

export async function POST(req: Request) {
  try {
    const { speciesId } = (await req.json()) as { speciesId?: string };
    if (!speciesId) return NextResponse.json({ error: "speciesId required" }, { status: 400 });

    const species = getSpeciesById(speciesId);
    if (!species) return NextResponse.json({ error: "not found" }, { status: 404 });

    const db = getDb();
    const cached = db
      .prepare("SELECT payload_json FROM ai_retrospectives WHERE species_id = ?")
      .get(speciesId) as { payload_json: string } | undefined;
    if (cached) {
      return NextResponse.json(JSON.parse(cached.payload_json));
    }

    const ctx = {
      name: species.common_name_ko ?? species.common_name_en ?? species.scientific_name,
      sciName: species.scientific_name,
      category: species.category,
      year: species.extinction_year,
      cause: species.extinction_cause,
      region: species.region,
      summary: species.summary_ko,
    };

    const system = `당신은 절멸한 종을 회고하는 보전생물학자입니다. 한국 청소년 대상으로,
사실에 기반해 무엇이 잘못되었고 어떤 결정적 순간을 놓쳤는지를 차분히 분석합니다.
반드시 한국어로, JSON만 출력하세요.

스키마:
{
  "decisivePoint": {"year": "결정적 순간 (예: '1850년경')", "description": "왜 그 시점이 결정적이었는지 (2-3문장)"},
  "whatWentWrong": ["무엇이 잘못되었는지 4가지 (각 한 문장)"],
  "ifWeHadActed": "그때 우리가 어떻게 행동했더라면 종이 살아남았을지 (3-4문장)",
  "lessonsForToday": ["지금 우리에게 주는 교훈 4가지 (각 한 문장)"],
  "warning": "이 절멸이 다음에 일어날 수 있는 비슷한 종에 주는 경고 (2-3문장)"
}

whatWentWrong, lessonsForToday 는 정확히 4개씩.`;

    const user = `절멸 종 정보:
이름: ${ctx.name} (${ctx.sciName})
IUCN 등급: ${ctx.category} (${ctx.category === "EX" ? "절멸" : "야생절멸"})
절멸 시기: ${ctx.year ?? "불명"}
주요 원인: ${ctx.cause ?? "데이터 없음"}
지역: ${ctx.region ?? "데이터 없음"}
요약: ${ctx.summary ?? "데이터 없음"}

위 정보를 바탕으로 JSON 답변만 출력하세요.`;

    const client = getAnthropic();
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system,
      messages: [{ role: "user", content: user }],
    });

    const text = resp.content.filter((b) => b.type === "text").map((b: any) => b.text).join("");
    const parsed = extractJson<RetroPayload>(text);

    try {
      db.prepare(
        "INSERT OR REPLACE INTO ai_retrospectives (species_id, payload_json) VALUES (?, ?)"
      ).run(speciesId, JSON.stringify(parsed));
    } catch {
      // ignore — read-only env
    }

    return NextResponse.json(parsed);
  } catch (e) {
    console.error("[retrospective]", e);
    const status = e instanceof AnthropicConfigError ? 503 : 500;
    return NextResponse.json({ error: friendlyError(e) }, { status });
  }
}
