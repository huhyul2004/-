// iNaturalist API 로 사진 보강 — Wikipedia 한계 보완
// 학명으로 taxon 검색 → default photo
// docs: https://api.inaturalist.org/v1/docs/
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

async function fetchInatPhoto(scientificName: string): Promise<string | null> {
  if (!scientificName) return null;
  const url = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(scientificName)}&rank=species&per_page=3`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: { default_photo?: { medium_url?: string; url?: string }; matched_term?: string; name?: string }[] };
    const results = data.results ?? [];
    // 학명 정확히 일치하는 결과 우선
    const exact = results.find((r) => (r.name ?? "").toLowerCase() === scientificName.toLowerCase());
    const best = exact ?? results[0];
    if (!best?.default_photo) return null;
    return best.default_photo.medium_url ?? best.default_photo.url ?? null;
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

  console.log(`iNaturalist 사진 보강 대상: ${rows.length} 종`);
  if (rows.length === 0) return;

  const update = db.prepare("UPDATE species SET photo_url = ? WHERE id = ?");
  let ok = 0, fail = 0;
  const t0 = Date.now();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const url = await fetchInatPhoto(r.scientific_name);
    if (url) {
      update.run(url, r.id);
      ok++;
    } else {
      fail++;
    }
    if ((i + 1) % 100 === 0) {
      const elapsed = Math.round((Date.now() - t0) / 1000);
      const rate = (i + 1) / elapsed;
      const eta = Math.round((rows.length - i - 1) / rate / 60);
      console.log(`  ${i + 1}/${rows.length} ok=${ok} fail=${fail} (${elapsed}s, ETA ${eta}분)`);
    }
    await new Promise((r) => setTimeout(r, 200)); // iNat 매너 ~5 req/sec
  }

  console.log(`\n✓ iNat 사진 보강 완료: ok=${ok} fail=${fail}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
