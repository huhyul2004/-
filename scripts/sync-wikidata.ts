// Wikidata 에서 IUCN 카테고리별 종 정보 가져와 SQLite 에 적재
// usage: tsx scripts/sync-wikidata.ts [CR|EN|VU|EX|EW]   (인자 없으면 모두)
import { getDb } from "../lib/db";
import { fetchSpeciesByCategory, koreanizeClass } from "../lib/wikidata";

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const ALL_CATS = ["CR", "EN", "VU", "EX", "EW"] as const;
// 메모리 안전을 위해 카테고리당 한 번에 가져오는 양을 제한
const LIMITS: Record<string, number> = { CR: 350, EN: 350, VU: 250, EX: 200, EW: 100 };

async function syncCategory(cat: string) {
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
      class_name=COALESCE(excluded.class_name, species.class_name),
      wikipedia_title=COALESCE(excluded.wikipedia_title, species.wikipedia_title),
      updated_at=CURRENT_TIMESTAMP
  `);

  process.stdout.write(`[${cat}] fetching (limit=${LIMITS[cat]}) ... `);
  let species: Awaited<ReturnType<typeof fetchSpeciesByCategory>> = [];
  try {
    species = await fetchSpeciesByCategory(cat, LIMITS[cat]);
  } catch (e) {
    console.log(`ERROR: ${(e as Error).message}`);
    return 0;
  }
  console.log(`${species.length} 종`);

  const tx = db.transaction((items: typeof species) => {
    for (const s of items) {
      const id = s.qid.toLowerCase();
      const finalId = `wd-${id}`;
      upsert.run({
        id: finalId,
        scientific_name: s.scientificName || s.commonNameEn || s.qid,
        common_name_en: s.commonNameEn,
        common_name_ko: s.commonNameKo,
        category: s.category,
        class_name: koreanizeClass(s.taxonClass),
        family: null,
        region: null,
        summary_ko: null,
        wikipedia_title: s.wikipediaTitleEn || s.wikipediaTitleKo || null,
      });
    }
  });
  tx(species);
  return species.length;
}

async function main() {
  const arg = process.argv[2]?.toUpperCase();
  const cats = arg ? [arg] : (ALL_CATS as readonly string[]);

  let total = 0;
  for (const cat of cats) {
    if (!ALL_CATS.includes(cat as typeof ALL_CATS[number])) {
      console.error(`Unknown category: ${cat}`);
      continue;
    }
    total += await syncCategory(cat);
    await sleep(1500);
  }

  const db = getDb();
  const counts = db
    .prepare("SELECT category, COUNT(*) as n FROM species GROUP BY category ORDER BY category")
    .all() as { category: string; n: number }[];
  console.log(`\n✓ sync 완료. DB 종 수:`);
  for (const c of counts) console.log(`  ${c.category}: ${c.n}`);
  console.log(`  fetched this run: ${total}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
