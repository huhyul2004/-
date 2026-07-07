// Wikipedia Commons API 로 사진 보강 — GBIF/iNat 에서 못 찾은 종 대상
// Commons 의 카테고리 검색 → 첫 이미지 추출
// docs: https://commons.wikimedia.org/w/api.php
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

interface CommonsSearchResult {
  query?: {
    search?: { title: string; pageid: number }[];
  };
}

interface CommonsImageInfo {
  query?: {
    pages?: Record<string, { imageinfo?: { url?: string }[] }>;
  };
}

async function fetchCommonsPhoto(scientificName: string): Promise<string | null> {
  if (!scientificName) return null;
  try {
    // 1. 파일 검색 — 학명을 파일명에 포함하는 이미지
    const searchUrl =
      "https://commons.wikimedia.org/w/api.php?" +
      new URLSearchParams({
        action: "query",
        list: "search",
        srnamespace: "6", // File namespace
        srsearch: `${scientificName} filetype:bitmap`,
        srlimit: "3",
        format: "json",
        origin: "*",
      }).toString();
    const searchRes = await fetch(searchUrl, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!searchRes.ok) return null;
    const searchData = (await searchRes.json()) as CommonsSearchResult;
    const hits = searchData.query?.search ?? [];
    if (hits.length === 0) return null;

    // 2. 첫 결과의 실제 이미지 URL 가져오기
    const titles = hits.map((h) => h.title).join("|");
    const infoUrl =
      "https://commons.wikimedia.org/w/api.php?" +
      new URLSearchParams({
        action: "query",
        prop: "imageinfo",
        iiprop: "url",
        iiurlwidth: "640",
        titles,
        format: "json",
        origin: "*",
      }).toString();
    const infoRes = await fetch(infoUrl, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!infoRes.ok) return null;
    const infoData = (await infoRes.json()) as CommonsImageInfo;
    const pages = infoData.query?.pages ?? {};
    for (const pageId of Object.keys(pages)) {
      const info = pages[pageId].imageinfo?.[0];
      const url = (info as unknown as { thumburl?: string; url?: string })?.thumburl ?? info?.url;
      if (url && /\.(jpg|jpeg|png|webp)(\?|$)/i.test(url)) return url;
    }
    return null;
  } catch {
    return null;
  }
}

async function main() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, scientific_name, photo_url FROM species
       WHERE photo_url IS NULL AND scientific_name IS NOT NULL AND scientific_name != ''
       ORDER BY
         CASE category WHEN 'CR' THEN 0 WHEN 'EN' THEN 1 WHEN 'VU' THEN 2 WHEN 'EX' THEN 3 ELSE 4 END,
         id`
    )
    .all() as Pick<SpeciesRow, "id" | "scientific_name" | "photo_url">[];

  console.log(`Wikipedia Commons 사진 보강 대상: ${rows.length} 종`);
  if (rows.length === 0) return;

  const update = db.prepare("UPDATE species SET photo_url = ? WHERE id = ?");
  let ok = 0, fail = 0;
  const t0 = Date.now();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const url = await fetchCommonsPhoto(r.scientific_name);
    if (url) {
      update.run(url, r.id);
      ok++;
    } else {
      fail++;
    }
    if ((i + 1) % 100 === 0) {
      const elapsed = Math.round((Date.now() - t0) / 1000);
      const rate = (i + 1) / Math.max(elapsed, 1);
      const eta = Math.round((rows.length - i - 1) / Math.max(rate, 0.01) / 60);
      console.log(`  ${i + 1}/${rows.length} ok=${ok} fail=${fail} (${elapsed}s, ETA ${eta}분)`);
    }
    await new Promise((res) => setTimeout(res, 300));
  }

  console.log(`\n✓ Commons 보강 완료: ok=${ok}, fail=${fail}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
