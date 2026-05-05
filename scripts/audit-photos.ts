// 사진 검증 — Claude Vision 으로 각 사진이 동물/식물인지, 지도/도표 등 부적절한지 판정
// 부적절한 사진은 photo_url 을 NULL 로 비워서 다음 enrichment 가 새로 찾도록
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
import { getAnthropic } from "../lib/anthropic";

const VISION_MODEL = "claude-haiku-4-5-20251001";

async function judgePhoto(imageUrl: string, sciName: string): Promise<"ok" | "bad" | "uncertain"> {
  const client = getAnthropic();
  try {
    const resp = await client.messages.create({
      model: VISION_MODEL,
      max_tokens: 100,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "url", url: imageUrl },
            },
            {
              type: "text",
              text: `이 이미지가 ${sciName} 종(species)의 사진인가요? 다음 중 하나로만 답하세요:
OK — 동물/식물의 실제 사진 (살아있거나 표본)
BAD — 지도, 도표, 그래프, 분포도, 분류도, 텍스트 위주, 무관한 이미지
UNCERTAIN — 판단 어려움

답변 형식: OK 또는 BAD 또는 UNCERTAIN 한 단어만.`,
            },
          ],
        },
      ],
    });
    const text = resp.content
      .filter((b) => b.type === "text")
      .map((b: any) => b.text)
      .join("")
      .trim()
      .toUpperCase();
    if (text.startsWith("OK")) return "ok";
    if (text.startsWith("BAD")) return "bad";
    return "uncertain";
  } catch (e) {
    console.log(`    judge error: ${(e as Error).message.slice(0, 80)}`);
    return "uncertain";
  }
}

async function main() {
  const db = getDb();
  const rows = db
    .prepare("SELECT id, scientific_name, photo_url FROM species WHERE photo_url IS NOT NULL ORDER BY id")
    .all() as { id: string; scientific_name: string; photo_url: string }[];

  console.log(`사진 검증 대상: ${rows.length} 종`);
  if (rows.length === 0) return;

  const clearPhoto = db.prepare("UPDATE species SET photo_url = NULL WHERE id = ?");

  let ok = 0;
  let bad = 0;
  let uncertain = 0;
  const t0 = Date.now();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const verdict = await judgePhoto(r.photo_url, r.scientific_name);
    if (verdict === "ok") ok++;
    else if (verdict === "bad") {
      bad++;
      clearPhoto.run(r.id);
    } else uncertain++;

    if ((i + 1) % 50 === 0) {
      const elapsed = Math.round((Date.now() - t0) / 1000);
      const rate = (i + 1) / elapsed;
      const eta = Math.round((rows.length - i - 1) / rate / 60);
      console.log(`  ${i + 1}/${rows.length} ok=${ok} bad=${bad} uncertain=${uncertain} (ETA ${eta}분)`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  console.log(`\n✓ 사진 검증 완료: ok=${ok} bad=${bad} uncertain=${uncertain}`);
  console.log(`bad 판정 ${bad} 건의 photo_url 삭제됨 — 재 enrichment 필요`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
