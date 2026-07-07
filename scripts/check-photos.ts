// 사진 유효성 점검 — photo_url 이 있는 종에 HEAD 요청을 보내 깨진 링크를 찾음
// 읽기 전용: DB 는 건드리지 않고 data/no-photo-species.json 리포트만 생성
import fs from "fs";
import path from "path";

const envFile = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

import { getDb, SpeciesRow } from "../lib/db";

const UA =
  process.env.WIKIPEDIA_USER_AGENT ||
  "LastWatch/1.0 (educational, contact: chanzzzang24@gmail.com)";

// HEAD 요청으로 사진 링크가 살아있는 이미지인지 확인
async function checkPhoto(url: string): Promise<{ ok: boolean; reason?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": UA },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) return { ok: false, reason: `status ${res.status}` };
    const ct = res.headers.get("content-type") || "";
    if (!ct.toLowerCase().startsWith("image/"))
      return { ok: false, reason: `content-type ${ct || "(none)"}` };
    return { ok: true };
  } catch (e) {
    const msg = (e as Error).name === "AbortError" ? "timeout" : (e as Error).message;
    return { ok: false, reason: msg.slice(0, 60) };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const db = getDb();
  const all = db
    .prepare(
      `SELECT id, scientific_name, photo_url FROM species ORDER BY id`
    )
    .all() as Pick<SpeciesRow, "id" | "scientific_name" | "photo_url">[];

  const total = all.length;
  const withPhotoRows = all.filter((r) => r.photo_url && r.photo_url.trim() !== "");
  const noPhotoRows = all.filter((r) => !r.photo_url || r.photo_url.trim() === "");

  console.log(`전체 ${total} 종 — 사진 있음 ${withPhotoRows.length}, 사진 없음(NULL) ${noPhotoRows.length}`);
  console.log(`링크 검증 대상: ${withPhotoRows.length} 종 (HEAD 요청)`);

  const broken: { id: string; scientific_name: string; photo_url: string; reason: string }[] = [];
  const t0 = Date.now();

  // 작은 배치(10개)로 병렬 처리하되 rate limit 에 관대하게
  const BATCH = 10;
  for (let i = 0; i < withPhotoRows.length; i += BATCH) {
    const batch = withPhotoRows.slice(i, i + BATCH);
    const verdicts = await Promise.all(
      batch.map(async (r) => ({ r, v: await checkPhoto(r.photo_url as string) }))
    );
    for (const { r, v } of verdicts) {
      if (!v.ok) {
        broken.push({
          id: r.id,
          scientific_name: r.scientific_name,
          photo_url: r.photo_url as string,
          reason: v.reason || "unknown",
        });
      }
    }
    const done = Math.min(i + BATCH, withPhotoRows.length);
    if (done % 100 === 0 || done === withPhotoRows.length) {
      const elapsed = Math.round((Date.now() - t0) / 1000);
      const rate = done / Math.max(elapsed, 1);
      const eta = Math.round((withPhotoRows.length - done) / Math.max(rate, 0.01) / 60);
      console.log(`  ${done}/${withPhotoRows.length} broken=${broken.length} (${elapsed}s, ETA ${eta}분)`);
    }
    await new Promise((res) => setTimeout(res, 100));
  }

  // 리포트: 깨진 사진 + NULL 사진 모두 = "사진 필요" 종
  const needPhotoIds = [
    ...broken.map((b) => b.id),
    ...noPhotoRows.map((r) => r.id),
  ];

  const outPath = path.join(process.cwd(), "data", "no-photo-species.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        generated: new Date().toISOString(),
        total,
        withPhoto: withPhotoRows.length,
        brokenPhoto: broken.length,
        noPhoto: noPhotoRows.length,
        needPhotoCount: needPhotoIds.length,
        needPhotoIds,
        brokenDetails: broken,
      },
      null,
      2
    )
  );

  console.log(`\n✓ 점검 완료`);
  console.log(`  전체:        ${total}`);
  console.log(`  사진 있음:   ${withPhotoRows.length}`);
  console.log(`  깨진 사진:   ${broken.length}`);
  console.log(`  사진 없음:   ${noPhotoRows.length}`);
  console.log(`  사진 필요:   ${needPhotoIds.length} (broken + null)`);
  console.log(`  리포트 저장: ${outPath}`);

  if (broken.length > 0) {
    console.log(`\n깨진 사진 예시 (최대 20):`);
    for (const b of broken.slice(0, 20)) {
      console.log(`  [${b.id}] ${b.scientific_name} — ${b.reason}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
