// 영어로 들어와있는 summary_ko / common_name_ko 를 Claude Haiku 로 한국어 번역
// 배치로 처리해서 호출 횟수 줄임
import fs from "fs";
import path from "path";

// .env.local 수동 로드 (tsx 가 자동 로드 안 함)
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
  category: string;
  class_name: string | null;
}

interface BatchItem {
  id: string;
  sci: string;
  en_name: string | null;
  ko_name: string | null;
  text: string | null;
}

interface TranslatedItem {
  id: string;
  ko_name: string;
  ko_summary: string;
}

const BATCH_SIZE = 8;
const MAX_RETRY = 3;

function koRatio(s: string | null): number {
  if (!s) return 0;
  const ko = (s.match(/[가-힣]/g) ?? []).length;
  return s.length === 0 ? 0 : ko / s.length;
}

async function translateBatch(items: BatchItem[]): Promise<TranslatedItem[]> {
  const client = getAnthropic();
  const system = `당신은 보전생물학 번역가입니다. 영어 종 정보를 한국 청소년이 읽기 좋은 자연스러운 한국어로 번역합니다.

규칙:
- 한국어 일반명이 있는 종은 그 이름을 사용 (예: tiger → 호랑이)
- 일반명이 한국에 없으면 학명+의미를 살린 한국어 이름 ("Mascarene petrel" → "마스카렌슴새")
- 영문 요약은 2-4문장으로 압축, 청소년이 읽기 좋게
- 학명·고유명사는 원어 그대로 또는 자연스럽게 음차
- JSON 만 출력 (코드블록 없이)

스키마: {"items":[{"id":"...","ko_name":"...","ko_summary":"..."}]}`;

  const userText = `다음 ${items.length}종을 번역하세요. 각 항목은 학명, 영문 일반명, 기존 한글명(있으면), 영문 요약을 포함합니다.

${items
  .map(
    (it, i) =>
      `[${i + 1}] id=${it.id}
학명: ${it.sci}
영문명: ${it.en_name ?? "—"}
기존 한글명: ${it.ko_name ?? "—"}
요약: ${it.text ?? "—"}`
  )
  .join("\n\n")}

JSON만 출력:`;

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
    try {
      const resp = await client.messages.create({
        model: MODEL,
        max_tokens: 4000,
        system,
        messages: [{ role: "user", content: userText }],
      });
      const text = resp.content.filter((b) => b.type === "text").map((b: any) => b.text).join("");
      const parsed = extractJson<{ items: TranslatedItem[] }>(text);
      if (!parsed.items || !Array.isArray(parsed.items)) {
        throw new Error("invalid JSON shape");
      }
      return parsed.items;
    } catch (e) {
      lastErr = e as Error;
      console.warn(`  retry ${attempt + 1}/${MAX_RETRY}: ${(e as Error).message}`);
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw lastErr ?? new Error("translation failed");
}

async function main() {
  const onlyArg = process.argv[2]; // "names" | "summaries" | undefined (both)
  const db = getDb();

  // 번역 대상:
  // 1. summary_ko 가 있지만 한글 비율 < 30% (영문이거나 거의 영문)
  // 2. summary_ko 는 NULL 인데 common_name_ko 도 NULL or = common_name_en (이름조차 없음)
  // 3. common_name_ko 가 NULL/공란인 모든 종
  const allRows = db
    .prepare(
      `SELECT id, scientific_name, common_name_en, common_name_ko, summary_ko, category, class_name
       FROM species`
    )
    .all() as Row[];

  const targets: Row[] = [];
  for (const r of allRows) {
    const summaryEnglish = r.summary_ko && koRatio(r.summary_ko) < 0.3;
    const noKoName =
      !r.common_name_ko ||
      (r.common_name_en && r.common_name_ko.trim().toLowerCase() === r.common_name_en.trim().toLowerCase());
    if (summaryEnglish || noKoName) targets.push(r);
  }

  console.log(`전체 ${allRows.length} 종 중 번역 대상 ${targets.length} 종`);
  if (targets.length === 0) return;

  const update = db.prepare(
    `UPDATE species SET
      common_name_ko = COALESCE(?, common_name_ko),
      summary_ko = COALESCE(?, summary_ko),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`
  );

  let translated = 0;
  let failedBatches = 0;
  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const slice = targets.slice(i, i + BATCH_SIZE);
    const items: BatchItem[] = slice.map((r) => ({
      id: r.id,
      sci: r.scientific_name,
      en_name: r.common_name_en,
      ko_name: r.common_name_ko && koRatio(r.common_name_ko) > 0.3 ? r.common_name_ko : null,
      text: r.summary_ko && koRatio(r.summary_ko) < 0.3 ? r.summary_ko : null,
    }));

    process.stdout.write(`[${i + 1}-${Math.min(i + BATCH_SIZE, targets.length)} / ${targets.length}] `);
    let result: TranslatedItem[];
    try {
      result = await translateBatch(items);
    } catch (e) {
      console.log(`✗ ${(e as Error).message}`);
      failedBatches++;
      continue;
    }

    const tx = db.transaction((items: TranslatedItem[]) => {
      for (const it of items) {
        const koName = it.ko_name?.trim() || null;
        const koSummary = it.ko_summary?.trim() || null;
        update.run(koName, koSummary, it.id);
      }
    });
    tx(result);
    translated += result.length;
    console.log(`✓ ${result.length}개`);

    // 매너 — 분당 50req 정도로 제한
    await new Promise((r) => setTimeout(r, 600));
  }

  console.log(`\n✓ 번역 완료: ${translated}개  실패 배치: ${failedBatches}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
