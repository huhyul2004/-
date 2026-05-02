// Wikipedia 에서 종 사진 / 한국어 요약 보강
// 1) species.wikipedia_title 가 있으면 ko 위키 → 실패 시 en 위키 시도
// 2) species.scientific_name 으로 한 번 더 시도
// 3) 결과를 species.photo_url, summary_ko, common_name_ko 에 채움
// 4) wikipedia_cache 에 본문 캐시
// usage: tsx scripts/enrich-wikipedia.ts [limit]
import { getDb, SpeciesRow } from "../lib/db";
import { fetchWikipediaSummary } from "../lib/wikipedia";

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const limit = Number(process.argv[2] ?? 9999);
  const db = getDb();

  const rows = db
    .prepare(
      `SELECT id, scientific_name, common_name_en, common_name_ko, summary_ko,
              photo_url, wikipedia_title, category
       FROM species
       WHERE photo_url IS NULL OR summary_ko IS NULL
       ORDER BY
         CASE category WHEN 'CR' THEN 0 WHEN 'EN' THEN 1 WHEN 'VU' THEN 2
                       WHEN 'EX' THEN 3 WHEN 'EW' THEN 4 ELSE 5 END,
         id
       LIMIT ?`
    )
    .all(limit) as SpeciesRow[];

  console.log(`enrich 대상: ${rows.length} 종`);

  const updateSpecies = db.prepare(`
    UPDATE species SET
      photo_url = COALESCE(?, photo_url),
      summary_ko = COALESCE(?, summary_ko),
      common_name_ko = COALESCE(?, common_name_ko),
      wikipedia_title = COALESCE(?, wikipedia_title),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  const cacheUpsert = db.prepare(`
    INSERT INTO wikipedia_cache (title, summary, thumbnail_url, fetched_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(title) DO UPDATE SET
      summary = excluded.summary,
      thumbnail_url = excluded.thumbnail_url,
      fetched_at = CURRENT_TIMESTAMP
  `);

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const candidates: { title: string; lang: "en" | "ko" }[] = [];

    if (r.wikipedia_title) {
      candidates.push({ title: r.wikipedia_title, lang: "ko" });
      candidates.push({ title: r.wikipedia_title, lang: "en" });
    }
    if (r.common_name_en) {
      candidates.push({ title: r.common_name_en, lang: "en" });
    }
    if (r.scientific_name) {
      candidates.push({ title: r.scientific_name, lang: "en" });
    }

    let koSummary: { title: string; lang: "ko"; data: any } | null = null;
    let enSummary: { title: string; lang: "en"; data: any } | null = null;

    for (const c of candidates) {
      try {
        const s = await fetchWikipediaSummary(c.title, c.lang);
        await sleep(200); // 매너 — 5 req/sec
        if (!s) continue;
        if (c.lang === "ko" && !koSummary) {
          koSummary = { ...c, lang: "ko", data: s };
        } else if (c.lang === "en" && !enSummary) {
          enSummary = { ...c, lang: "en", data: s };
        }
        if (koSummary && enSummary) break;
      } catch (e) {
        // 통신 오류는 그냥 다음 후보로
      }
    }

    const ko = koSummary?.data;
    const en = enSummary?.data;
    if (!ko && !en) {
      failed++;
      if ((i + 1) % 25 === 0) {
        console.log(`  ${i + 1}/${rows.length} ok=${ok} fail=${failed}`);
      }
      continue;
    }

    const newPhoto = ko?.thumbnail || en?.thumbnail || null;
    const newSummary = ko?.extract || en?.extract || null;
    const newKoName = ko?.title || null;
    const newWikiTitle = ko?.title || en?.title || null;

    updateSpecies.run(
      r.photo_url ? null : newPhoto,
      r.summary_ko ? null : newSummary,
      r.common_name_ko ? null : newKoName,
      newWikiTitle,
      r.id
    );

    if (ko) {
      cacheUpsert.run(`ko:${ko.title}`, ko.extract ?? null, ko.thumbnail ?? null);
    }
    if (en) {
      cacheUpsert.run(`en:${en.title}`, en.extract ?? null, en.thumbnail ?? null);
    }
    if (newPhoto || newSummary) ok++;
    else skipped++;

    if ((i + 1) % 25 === 0) {
      console.log(`  ${i + 1}/${rows.length} ok=${ok} fail=${failed}`);
    }
  }

  console.log(`\n✓ enrich 완료: ok=${ok}  skipped=${skipped}  failed=${failed}`);
  const counts = db
    .prepare(
      `SELECT
         SUM(CASE WHEN photo_url IS NOT NULL THEN 1 ELSE 0 END) AS with_photo,
         SUM(CASE WHEN summary_ko IS NOT NULL THEN 1 ELSE 0 END) AS with_summary,
         COUNT(*) AS total
       FROM species`
    )
    .get();
  console.log(counts);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
