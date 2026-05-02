// AI 검증으로 발견된 오류 패치
// 1. 자주 잘못된 분류군/과명 일괄 치환
// 2. 빈 플레이스홀더 요약 / 영문 잔존 요약 → Claude 재번역
import fs from "fs";
import path from "path";

const envFile = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

import { getDb } from "../lib/db";
import { getAnthropic, MODEL, extractJson } from "../lib/anthropic";

interface Row {
  id: string;
  scientific_name: string;
  common_name_en: string | null;
  common_name_ko: string | null;
  summary_ko: string | null;
  class_name: string | null;
}

// === Stage 1: 시스템적 오번역 일괄 치환 ===
const REPLACEMENTS: { from: RegExp; to: string; reason: string }[] = [
  { from: /지렁이목 거북/g, to: "거북목 거북", reason: "Testudines 오역" },
  { from: /납자리과/g, to: "납자루과", reason: "Acheilognathidae 한글명" },
  { from: /납자리/g, to: "납자루", reason: "Acheilognathus 어종 통칭" },
  { from: /쌍기과/g, to: "잉어과", reason: "Cyprinidae 오역" },
  { from: /엘크토 담치/g, to: "엘크발조개", reason: "Alasmidonta 민물조개 (Unionidae)" },
  { from: /민물에 사는 담치/g, to: "민물에 사는 조개", reason: "Unionidae" },
];

// === Stage 2: 재번역 대상 ===
function isPlaceholder(s: string | null): boolean {
  if (!s) return false;
  const stripped = s.trim();
  return (
    stripped.includes("정보가 제공되지 않았") ||
    stripped.includes("자세한 정보는 수집되지") ||
    stripped.includes("정보가 없습니다") ||
    stripped.length < 30
  );
}

function koRatio(s: string | null): number {
  if (!s) return 0;
  const ko = (s.match(/[가-힣]/g) ?? []).length;
  return s.length === 0 ? 0 : ko / s.length;
}

async function retranslate(items: Row[]): Promise<{ id: string; ko_name: string; ko_summary: string }[]> {
  const client = getAnthropic();
  const system = `당신은 보전생물학 번역가입니다. 영어 종 정보를 한국 청소년이 읽기 좋은 자연스러운 한국어로 번역합니다.

규칙:
- 한국어 일반명이 있는 종은 그 이름을 사용
- 일반명이 한국에 없으면 학명 의미를 살린 한국어 이름 (예: "Mascarene petrel" → "마스카렌슴새")
- 분류군 이름을 정확히 (Cyprinidae=잉어과, Acheilognathidae=납자루과, Unionidae=민물조개과, Testudines=거북목)
- 요약은 2-4문장. 학명에서 추론 가능한 정보를 최대한 활용
- 정보가 정말 없는 종이라도 "정보 없음" 같은 placeholder 는 절대 쓰지 말 것 → 학명·분류군에서 추론 가능한 정보 (생태/서식지/위협)를 학술적으로 정직하게
- JSON 만 출력 (코드블록 없이)

스키마: {"items":[{"id":"...","ko_name":"...","ko_summary":"..."}]}`;

  const userText = `다음 ${items.length}종을 정확히 재번역하세요.

${items
  .map(
    (it, i) =>
      `[${i + 1}] id=${it.id}
학명: ${it.scientific_name}
영문명: ${it.common_name_en ?? "—"}
기존 한글명(부정확할 수 있음): ${it.common_name_ko ?? "—"}
분류군: ${it.class_name ?? "—"}
영문/기존 요약(부정확): ${it.summary_ko ?? "—"}`
  )
  .join("\n\n")}

JSON만 출력:`;

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system,
    messages: [{ role: "user", content: userText }],
  });
  const text = resp.content.filter((b) => b.type === "text").map((b: any) => b.text).join("");
  return extractJson<{ items: { id: string; ko_name: string; ko_summary: string }[] }>(text).items;
}

async function main() {
  const db = getDb();

  // === Stage 1 ===
  console.log("=== Stage 1: 일괄 치환 ===");
  let totalReplaced = 0;
  for (const rep of REPLACEMENTS) {
    const rows = db
      .prepare(
        `SELECT id, common_name_ko, summary_ko FROM species
         WHERE common_name_ko LIKE ? OR summary_ko LIKE ?`
      )
      .all(`%${rep.from.source.replace(/\\/g, "")}%`, `%${rep.from.source.replace(/\\/g, "")}%`) as {
      id: string;
      common_name_ko: string | null;
      summary_ko: string | null;
    }[];

    let count = 0;
    const upd = db.prepare(
      "UPDATE species SET common_name_ko = ?, summary_ko = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    );
    for (const r of rows) {
      const newName = r.common_name_ko?.replace(rep.from, rep.to) ?? null;
      const newSummary = r.summary_ko?.replace(rep.from, rep.to) ?? null;
      if (newName !== r.common_name_ko || newSummary !== r.summary_ko) {
        upd.run(newName, newSummary, r.id);
        count++;
      }
    }
    console.log(`  "${rep.from.source}" → "${rep.to}" (${rep.reason}): ${count}건`);
    totalReplaced += count;
  }

  // 영문명이 "Liparia" 같은 별칭으로 들어간 케이스 — 알려진 케이스만 직접 보정
  const directFixes = [
    { id: "wd-q304425", common_name_en: "Macedonian shad", common_name_ko: "마케도니아샤드" },
  ];
  for (const f of directFixes) {
    db.prepare(
      "UPDATE species SET common_name_en = ?, common_name_ko = COALESCE(common_name_ko, ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(f.common_name_en, f.common_name_ko, f.id);
    console.log(`  ${f.id}: en="${f.common_name_en}", ko="${f.common_name_ko}"`);
  }

  console.log(`\nStage 1 완료: ${totalReplaced + directFixes.length}건 수정\n`);

  // === Stage 2: 재번역 ===
  console.log("=== Stage 2: 빈/영문 요약 재번역 ===");
  const allRows = db
    .prepare(
      `SELECT id, scientific_name, common_name_en, common_name_ko, summary_ko, class_name FROM species`
    )
    .all() as Row[];

  const targets = allRows.filter((r) => {
    const placeholder = isPlaceholder(r.summary_ko);
    const englishSummary = r.summary_ko && koRatio(r.summary_ko) < 0.3;
    const noKoName =
      !r.common_name_ko ||
      (r.common_name_en &&
        r.common_name_ko.trim().toLowerCase() === r.common_name_en.trim().toLowerCase());
    return placeholder || englishSummary || noKoName;
  });

  console.log(`재번역 대상: ${targets.length} 종\n`);
  if (targets.length === 0) return;

  const update = db.prepare(
    `UPDATE species SET
      common_name_ko = COALESCE(?, common_name_ko),
      summary_ko = COALESCE(?, summary_ko),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`
  );

  let ok = 0;
  const BATCH = 8;
  for (let i = 0; i < targets.length; i += BATCH) {
    const slice = targets.slice(i, i + BATCH);
    process.stdout.write(`[${i + 1}-${Math.min(i + BATCH, targets.length)}/${targets.length}] `);
    try {
      const results = await retranslate(slice);
      const tx = db.transaction((arr: typeof results) => {
        for (const it of arr) {
          update.run(it.ko_name?.trim() || null, it.ko_summary?.trim() || null, it.id);
        }
      });
      tx(results);
      ok += results.length;
      console.log(`✓ ${results.length}개`);
    } catch (e) {
      console.log(`✗ ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 600));
  }

  console.log(`\n✓ Stage 2 완료: ${ok}건 재번역`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
