// 한글명 없는 모든 종에 대해 학명(라틴어) → 한국어 음차
// Claude Haiku 4.5 로 50개씩 배치 처리
// 학명 음차 + 한국어 일반명이 잘 알려진 경우 그것 사용
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

interface Item {
  id: string;
  sci: string;
  en: string | null;
}

const BATCH = 50;
const MAX_RETRY = 3;

async function transliterateBatch(items: Item[]): Promise<{ id: string; ko: string }[]> {
  const client = getAnthropic();
  const system = `당신은 라틴어 학명을 한국어로 음차하는 분류학 번역가입니다.

규칙:
- 한국어로 잘 알려진 종이면 그 일반명 사용 (예: Panthera tigris → 호랑이, Dodo → 도도새)
- 일반명이 한국에 없으면 학명을 한국어 음차 — 정확한 라틴어 발음 규칙 따름
  - "Dusicyon avus" → "두시키온 아부스"
  - "Zapornia palmeri" → "자포르니아 팔메리"
  - "Urile perspicillatus" → "우릴레 페르스피킬라투스"
- 영문 일반명이 있으면 그것의 한국어 음차도 OK (예: "Crested Ibis" → "따오기" 또는 "크레스티드 따오기")
- JSON 만 출력, 코드블록 없이

스키마: {"items":[{"id":"...","ko":"한국어 이름"}]}`;

  const user = `다음 ${items.length}종의 라틴어 학명을 한국어로 음차하세요.

${items.map((it, i) => `[${i + 1}] id=${it.id}\n  학명: ${it.sci}\n  영문명: ${it.en ?? "—"}`).join("\n\n")}

JSON만 출력:`;

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
    try {
      const resp = await client.messages.create({
        model: MODEL,
        max_tokens: 4000,
        system,
        messages: [{ role: "user", content: user }],
      });
      const text = resp.content.filter((b) => b.type === "text").map((b: any) => b.text).join("");
      const parsed = extractJson<{ items: { id: string; ko: string }[] }>(text);
      if (!parsed.items || !Array.isArray(parsed.items)) throw new Error("invalid JSON shape");
      return parsed.items;
    } catch (e) {
      lastErr = e as Error;
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  throw lastErr ?? new Error("translation failed");
}

async function main() {
  const limit = parseInt(process.argv[2] ?? "999999");
  const db = getDb();
  const targets = db
    .prepare(
      `SELECT id, scientific_name as sci, common_name_en as en
       FROM species
       WHERE common_name_ko IS NULL OR common_name_ko = '' OR common_name_ko = scientific_name
       ORDER BY id
       LIMIT ?`
    )
    .all(limit) as Item[];

  console.log(`음차 대상: ${targets.length} 종`);
  if (targets.length === 0) return;

  const update = db.prepare("UPDATE species SET common_name_ko = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");

  let ok = 0;
  let fail = 0;
  const t0 = Date.now();
  for (let i = 0; i < targets.length; i += BATCH) {
    const slice = targets.slice(i, i + BATCH);
    let result: { id: string; ko: string }[];
    try {
      result = await transliterateBatch(slice);
    } catch (e) {
      console.log(`  ${i + 1}-${i + slice.length} ✗ ${(e as Error).message}`);
      fail += slice.length;
      continue;
    }
    const tx = db.transaction((arr: typeof result) => {
      for (const r of arr) {
        if (r.ko && r.ko.trim()) update.run(r.ko.trim(), r.id);
      }
    });
    tx(result);
    ok += result.length;
    if ((i + BATCH) % 500 === 0 || i + BATCH >= targets.length) {
      const elapsed = Math.round((Date.now() - t0) / 1000);
      const rate = ok / elapsed;
      const eta = Math.round((targets.length - ok) / rate);
      console.log(`  ${Math.min(i + BATCH, targets.length)}/${targets.length} ok=${ok} fail=${fail} (${elapsed}s, ~${eta}s 남음)`);
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  console.log(`\n✓ 음차 완료: ${ok} 종 / 실패 ${fail}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
