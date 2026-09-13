import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSpeciesById, getThreats, getActions, getHabitats } from "@/lib/queries";
import { generateText, friendlyError, GeminiConfigError } from "@/lib/gemini";
// extractJson 은 공급자 중립 유틸이라 lib/anthropic 에 그대로 둔다 (scripts/ 배치들이 같이 쓴다).
import { extractJson } from "@/lib/anthropic";
import { splitThreats, threatPath } from "@/lib/threat-display";
import type { ThreatRow } from "@/lib/db";

export const runtime = "nodejs";

// 캐시 버전 — AI 에 넘기는 컨텍스트가 바뀌면 올린다. 이 값이 없는(옛 컨텍스트로 만든) 캐시는 다시 생성한다.
// 2: 위협을 이름만 → "대분류 > 중분류 > 항목 (코드)" + 시기별로, 과거 위협 대책 금지.
const CTX_VERSION = 2;

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
      const parsed = JSON.parse(cached.payload_json) as RecommendPayload & { _ctx?: number };
      if (parsed._ctx === CTX_VERSION) return NextResponse.json(parsed);
    }

    const threats = getThreats(speciesId) as ThreatRow[];
    // 위협은 챗봇·상세 페이지와 같은 규칙(lib/threat-display.ts)으로 상위 분류 경로·코드를 붙여 시기별로 나눈다.
    const { manual: manualThreats, groups: threatGroups } = splitThreats(threats);
    const threatLines = [
      ...(manualThreats.length
        ? [`- 수기 입력 위협 (시기 기록 없음): ${manualThreats.map((t) => t.threat_name).join(", ")}`]
        : []),
      ...threatGroups.map(({ group, threats: items }) => `- ${group.chatLabel}: ${items.map(threatPath).join("; ")}`),
    ];
    const actions = getActions(speciesId) as { action_name: string }[];
    const habitats = getHabitats(speciesId) as { habitat_name: string }[];

    const ctx = {
      name: species.common_name_ko ?? species.common_name_en ?? species.scientific_name,
      sciName: species.scientific_name,
      category: species.category,
      classKo: species.class_name,
      region: species.region,
      summary: species.summary_ko,
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

immediateActions 는 정확히 4개. whatYouCanDo 는 정확히 5개.

위협 규칙:
- 위협은 IUCN 위협 분류 "대분류 > 중분류 > 항목 (코드)" 로, 시기(timing)별 줄로 주어집니다.
- "과거 위협"(Past) 줄의 위협은 이미 현재 진행 중이 아닙니다. 그 위협을 막거나 줄이는 대책을
  immediateActions · longTermStrategy · whatYouCanDo 어디에도 넣지 않습니다.
  "Past, Likely to Return"(재발 가능)은 재발 여부를 지켜보는 감시만 언급할 수 있습니다.
- 대책은 진행 중(Ongoing) · 앞으로 예상(Future) · 시기 미상 위협을 대상으로 세웁니다.
- 항목 이름이 같아도 상위 분류가 다르면 서로 다른 위협입니다(예: 외래 침입종 > Named species 와 문제성 토착종 > Named species).
- 위협 목록에 없는 위협을 지어내지 않습니다.`;

    const user = `종 정보:
이름: ${ctx.name} (${ctx.sciName})
IUCN 등급: ${ctx.category}
분류: ${ctx.classKo ?? "정보 없음"}
지역: ${ctx.region ?? "정보 없음"}
요약: ${ctx.summary ?? "정보 없음"}
주요 위협:
${threatLines.join("\n") || "데이터 없음"}
기존 보전 활동: ${ctx.actions.join(", ") || "데이터 없음"}
서식지: ${ctx.habitats.join(", ") || "데이터 없음"}

위 정보를 바탕으로 JSON 답변만 출력하세요.`;

    const text = await generateText({
      system,
      messages: [{ role: "user", content: user }],
      maxTokens: 1500,
      json: true,
    });
    const parsed = extractJson<RecommendPayload>(text);

    // 캐시 저장은 best-effort — 읽기 전용 환경에선 조용히 패스
    try {
      db.prepare(
        "INSERT OR REPLACE INTO ai_recommendations (species_id, payload_json) VALUES (?, ?)"
      ).run(speciesId, JSON.stringify({ ...parsed, _ctx: CTX_VERSION }));
    } catch {
      // ignore — Vercel 등 read-only 환경
    }

    return NextResponse.json(parsed);
  } catch (e) {
    console.error("[recommend]", e);
    const status = e instanceof GeminiConfigError ? 503 : 500;
    return NextResponse.json({ error: friendlyError(e) }, { status });
  }
}
