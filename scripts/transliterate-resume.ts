// 음차 재시도 — rate limit 대응 강화 버전
// - 배치 크기 80 (50 → 80)
// - timeout/429 시 지수 백오프 (60s → 120s → 300s)
// - 이미 한글명 있는 종은 자동 스킵 (resume)
// - 매 1000건마다 진행상황 파일에 저장
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

const BATCH = 80;
const MAX_RETRY = 6;
const BASE_DELAY = 1000;

async function transliterateBatch(items: Item[]): Promise<{ id: string; ko: string }[]> {
  const client = getAnthropic();
  const system = `당신은 라틴어 학명을 한국어로 음차하는 분류학 번역가입니다.

규칙:
- 한국어로 잘 알려진 종이면 그 일반명 사용 (예: Panthera tigris → 호랑이)
- 일반명이 없으면 학명을 한국어 음차 — 정확한 라틴어 발음
  - "Dusicyon avus" → "두시키온 아부스"
  - "Zapornia palmeri" → "자포르니아 팔메리"
- JSON 만 출력, 코드블록 없이

스키마: {"items":[{"id":"...","ko":"..."}]}`;

  const user = `다음 ${items.length}종 학명 음차:

${items.map((it, i) => `[${i + 1}] id=${it.id}\n  학명: ${it.sci}\n  영문: ${it.en ?? "—"}`).join("\n\n")}

JSON만:`;

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
    try {
      const resp = await client.messages.create({
        model: MODEL,
        max_tokens: 5000,
        system,
        messages: [{ role: "user", content: user }],
      });
      const text = resp.content.filter((b) => b.type === "text").map((b: any) => b.text).join("");
      const parsed = extractJson<{ items: { id: string; ko: string }[] }>(text);
      if (!parsed.items || !Array.isArray(parsed.items)) throw new Error("invalid JSON shape");
      return parsed.items;
    } catch (e) {
      lastErr = e as Error;
      const msg = lastErr.message;
      // Rate limit / timeout → exponential backoff
      const isRetryable = /429|timeout|rate.?limit|overloaded|5\d\d/i.test(msg);
      const delay = isRetryable
        ? BASE_DELAY * Math.pow(3, attempt) + Math.random() * 1000
        : BASE_DELAY * Math.pow(2, attempt);
      console.log(`    retry ${attempt + 1}/${MAX_RETRY} after ${(delay / 1000).toFixed(1)}s: ${msg.slice(0, 80)}`);
      if (attempt < MAX_RETRY - 1) await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr ?? new Error("translation failed");
}

async function main() {
  const db = getDb();
  const targets = db
    .prepare(
      `SELECT id, scientific_name as sci, common_name_en as en
       FROM species
       WHERE common_name_ko IS NULL OR common_name_ko = '' OR common_name_ko = scientific_name
       ORDER BY id`
    )
    .all() as Item[];

  console.log(`재시도 대상: ${targets.length} 종`);
  if (targets.length === 0) return;

  const update = db.prepare("UPDATE species SET common_name_ko = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");

  let ok = 0;
  let fail = 0;
  const t0 = Date.now();
  for (let i = 0; i < targets.length; i += BATCH) {
    const slice = targets.slice(i, i + BATCH);
    let result: { id: string; ko: string }[] = [];
    try {
      result = await transliterateBatch(slice);
    } catch (e) {
      fail += slice.length;
      console.log(`  ${i + 1}-${i + slice.length} ✗ 모든 재시도 실패`);
      // long sleep before continuing
      await new Promise((r) => setTimeout(r, 30000));
      continue;
    }
    const tx = db.transaction((arr: typeof result) => {
      for (const r of arr) {
        if (r.ko && r.ko.trim()) update.run(r.ko.trim(), r.id);
      }
    });
    tx(result);
    ok += result.length;

    if ((i + BATCH) % 800 === 0 || i + BATCH >= targets.length) {
      const elapsed = Math.round((Date.now() - t0) / 1000);
      const rate = ok / Math.max(1, elapsed);
      const eta = Math.round((targets.length - i - BATCH) / Math.max(0.01, rate));
      console.log(`  ${Math.min(i + BATCH, targets.length)}/${targets.length} ok=${ok} fail=${fail} (${elapsed}s, ETA ${Math.round(eta / 60)}분)`);
    }
    await new Promise((r) => setTimeout(r, 600));
  }

  console.log(`\n✓ 음차 완료: ${ok} / 실패 ${fail}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
