// 사진만 빠르게 보강 — Wikipedia REST API 의 thumbnail.source 만 가져옴
// 학명 우선 → 영문명 폴백, 한국어 위키 무시 (보통 한국어 위키엔 사진 없음)
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

const UA = "LastWatch/0.1 (educational, contact: huhyul2004@gmail.com)";

async function fetchThumbnail(title: string): Promise<string | null> {
  if (!title) return null;
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
    title.replace(/\s/g, "_")
  )}?redirect=true`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    if (data.type === "disambiguation") return null;
    return data.thumbnail?.source ?? data.originalimage?.source ?? null;
  } catch {
    return null;
  }
}

async function main() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, scientific_name, common_name_en, common_name_ko, wikipedia_title, photo_url, category
       FROM species WHERE photo_url IS NULL
       ORDER BY
         CASE category WHEN 'CR' THEN 0 WHEN 'EN' THEN 1 WHEN 'VU' THEN 2
                       WHEN 'EX' THEN 3 WHEN 'EW' THEN 4 ELSE 5 END,
         id`
    )
    .all() as SpeciesRow[];

  console.log(`사진 미보유 ${rows.length} 종 처리 시작`);
  const update = db.prepare("UPDATE species SET photo_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");

  let ok = 0, fail = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    // wikipedia_title 가 가장 신뢰됨 (Wikidata sync 가 이미 검증함) → 학명 → 영문명 순
    const candidates = [r.wikipedia_title, r.scientific_name, r.common_name_en].filter(Boolean) as string[];
    let url: string | null = null;
    for (const t of candidates) {
      url = await fetchThumbnail(t);
      await new Promise((res) => setTimeout(res, 100));
      if (url) break;
    }
    if (url) {
      update.run(url, r.id);
      ok++;
    } else {
      fail++;
    }
    if ((i + 1) % 50 === 0) {
      console.log(`  ${i + 1}/${rows.length} ok=${ok} fail=${fail}`);
    }
  }

  console.log(`\n✓ 사진 보강 완료: ok=${ok}  fail=${fail}`);
  const cnt = db.prepare("SELECT SUM(CASE WHEN photo_url IS NOT NULL THEN 1 ELSE 0 END) as p, COUNT(*) as t FROM species").get();
  console.log(cnt);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
