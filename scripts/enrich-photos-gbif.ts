// GBIF (Global Biodiversity Information Facility) API 로 사진 보강
// iNat 에서 못 찾은 종들 대상 — GBIF 는 학술 occurrence records + multimedia 포함
// docs: https://www.gbif.org/developer/summary
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

interface GbifMatch {
  usageKey?: number;
  matchType?: string;
  status?: string;
}

interface GbifOccurrence {
  media?: { identifier?: string; type?: string; format?: string }[];
}

async function fetchGbifPhoto(scientificName: string): Promise<string | null> {
  if (!scientificName) return null;
  try {
    // 1. 학명 매칭 → taxonKey
    const matchUrl = `https://api.gbif.org/v1/species/match?name=${encodeURIComponent(scientificName)}`;
    const matchRes = await fetch(matchUrl, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!matchRes.ok) return null;
    const match = (await matchRes.json()) as GbifMatch;
    if (!match.usageKey || match.matchType === "NONE") return null;

    // 2. occurrence 검색 (이미지 있는 것만)
    const occUrl = `https://api.gbif.org/v1/occurrence/search?taxonKey=${match.usageKey}&mediaType=StillImage&limit=5`;
    const occRes = await fetch(occUrl, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!occRes.ok) return null;
    const occData = (await occRes.json()) as { results?: GbifOccurrence[] };
    const results = occData.results ?? [];
    for (const occ of results) {
      for (const m of occ.media ?? []) {
        const url = m.identifier;
        if (url && /^https?:\/\//.test(url) && /\.(jpg|jpeg|png|webp)(\?|$)/i.test(url)) {
          return url;
        }
      }
    }
    // identifier 가 직접 이미지 URL 이 아닌 경우도 있음 (HTML 페이지) — 그런 건 skip
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

  console.log(`GBIF 사진 보강 대상: ${rows.length} 종`);
  if (rows.length === 0) return;

  const update = db.prepare("UPDATE species SET photo_url = ? WHERE id = ?");
  let ok = 0, fail = 0;
  const t0 = Date.now();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const url = await fetchGbifPhoto(r.scientific_name);
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
    await new Promise((res) => setTimeout(res, 250));
  }

  console.log(`\n✓ GBIF 보강 완료: ok=${ok}, fail=${fail}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
