// EOL (Encyclopedia of Life) API 로 사진 보강 — 마지막 fallback
// docs: https://eol.org/docs/what-is-eol/data-services
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

interface EolSearchResult {
  results?: { id: number; title: string }[];
}

interface EolPage {
  taxonConcept?: {
    dataObjects?: { dataType: string; mediaURL?: string; eolMediaURL?: string }[];
  };
}

async function fetchEolPhoto(scientificName: string): Promise<string | null> {
  if (!scientificName) return null;
  try {
    // 1. 학명 검색 (exact 빼서 부분 매치도 허용)
    const searchUrl = `https://eol.org/api/search/1.0.json?q=${encodeURIComponent(scientificName)}&page=1`;
    const searchRes = await fetch(searchUrl, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!searchRes.ok) return null;
    const searchData = (await searchRes.json()) as EolSearchResult;
    const taxonId = searchData.results?.[0]?.id;
    if (!taxonId) return null;

    // 2. pages API — 이미지 데이터
    const pageUrl = `https://eol.org/api/pages/1.0/${taxonId}.json?images_per_page=1&images_page=1`;
    const pageRes = await fetch(pageUrl, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!pageRes.ok) return null;
    const pageData = (await pageRes.json()) as EolPage;
    const objs = pageData.taxonConcept?.dataObjects ?? [];
    for (const obj of objs) {
      if (obj.dataType?.toLowerCase().includes("image")) {
        const url = obj.eolMediaURL ?? obj.mediaURL;
        if (url && /^https?:/.test(url)) return url;
      }
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
      `SELECT id, scientific_name FROM species
       WHERE photo_url IS NULL AND scientific_name IS NOT NULL AND scientific_name != ''
       ORDER BY
         CASE category WHEN 'CR' THEN 0 WHEN 'EN' THEN 1 WHEN 'VU' THEN 2 WHEN 'EX' THEN 3 ELSE 4 END,
         id`
    )
    .all() as Pick<SpeciesRow, "id" | "scientific_name">[];

  console.log(`EOL 사진 보강 대상: ${rows.length} 종`);
  if (rows.length === 0) return;

  const update = db.prepare("UPDATE species SET photo_url = ? WHERE id = ?");
  let ok = 0, fail = 0;
  const t0 = Date.now();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const url = await fetchEolPhoto(r.scientific_name);
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

  console.log(`\n✓ EOL 보강 완료: ok=${ok}, fail=${fail}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
