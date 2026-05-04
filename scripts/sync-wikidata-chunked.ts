// IUCN 카테고리별 QID-mod 청크로 timeout 회피 대량 sync
// usage: tsx scripts/sync-wikidata-chunked.ts [CR|EN|VU|EX|EW] [chunks=8]
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
import { fetchByCategoryChunked, BulkSpecies } from "../lib/wikidata-bulk";

const ALL_CATS = ["CR", "EN", "VU", "EX", "EW"] as const;

async function main() {
  const arg = process.argv[2]?.toUpperCase();
  const chunks = parseInt(process.argv[3] ?? "8");
  const cats = arg ? [arg] : (ALL_CATS as readonly string[]);

  const db = getDb();
  const upsert = db.prepare(`
    INSERT INTO species (
      id, scientific_name, common_name_en, common_name_ko, category,
      class_name, family, region, summary_ko, wikipedia_title
    ) VALUES (
      @id, @scientific_name, @common_name_en, @common_name_ko, @category,
      @class_name, @family, @region, @summary_ko, @wikipedia_title
    )
    ON CONFLICT(id) DO UPDATE SET
      scientific_name=excluded.scientific_name,
      common_name_en=COALESCE(excluded.common_name_en, species.common_name_en),
      common_name_ko=COALESCE(excluded.common_name_ko, species.common_name_ko),
      category=excluded.category,
      wikipedia_title=COALESCE(excluded.wikipedia_title, species.wikipedia_title),
      updated_at=CURRENT_TIMESTAMP
  `);

  let grandTotal = 0;
  for (const cat of cats) {
    if (!ALL_CATS.includes(cat as typeof ALL_CATS[number])) {
      console.error(`Unknown category: ${cat}`);
      continue;
    }
    console.log(`\n=== Category: ${cat} (chunks=${chunks}) ===`);
    let species: BulkSpecies[] = [];
    try {
      species = await fetchByCategoryChunked(cat, chunks, 5000);
    } catch (e) {
      console.log(`✗ ${(e as Error).message}`);
      continue;
    }
    console.log(`  ${cat} 총 ${species.length} 종 수집`);

    const tx = db.transaction((items: BulkSpecies[]) => {
      for (const s of items) {
        const finalId = `wd-${s.qid.toLowerCase()}`;
        upsert.run({
          id: finalId,
          scientific_name: s.scientificName || s.commonNameEn || s.qid,
          common_name_en: s.commonNameEn,
          common_name_ko: s.commonNameKo,
          category: s.category,
          class_name: null,
          family: null,
          region: null,
          summary_ko: null,
          wikipedia_title: s.wikipediaTitleEn || s.wikipediaTitleKo || null,
        });
      }
    });
    tx(species);
    grandTotal += species.length;
  }

  console.log(`\n✓ 이번 실행에서 가져온 종: ${grandTotal}`);
  const counts = db
    .prepare("SELECT category, COUNT(*) as n FROM species GROUP BY category ORDER BY category")
    .all() as { category: string; n: number }[];
  console.log("\nDB 전체 분포:");
  for (const c of counts) console.log(`  ${c.category}: ${c.n.toLocaleString()}`);
  const total = db.prepare("SELECT COUNT(*) as n FROM species").get() as { n: number };
  console.log(`  총 ${total.n.toLocaleString()} 종`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
