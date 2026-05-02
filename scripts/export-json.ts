// 데이터 검증용 — DB 전체를 카테고리별 JSON 으로 export
// usage: tsx scripts/export-json.ts
import fs from "fs";
import path from "path";
import { getDb } from "../lib/db";

const OUT = path.join(process.cwd(), "data", "export");
fs.mkdirSync(OUT, { recursive: true });

function main() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, scientific_name, common_name_en, common_name_ko, category,
              class_name, region, population_trend, mature_individuals,
              summary_ko, photo_url, wikipedia_title, extinction_year, extinction_cause
       FROM species ORDER BY category, common_name_ko`
    )
    .all() as Record<string, unknown>[];

  // 카테고리별 분리
  const byCategory: Record<string, unknown[]> = {};
  for (const r of rows) {
    const c = (r.category as string) ?? "?";
    (byCategory[c] ??= []).push(r);
  }

  // 전체
  const all = path.join(OUT, "all.json");
  fs.writeFileSync(all, JSON.stringify(rows, null, 2), "utf-8");
  console.log(`✓ ${rows.length} 종 → ${all}`);

  // 카테고리별
  for (const [c, items] of Object.entries(byCategory)) {
    const f = path.join(OUT, `${c.toLowerCase()}.json`);
    fs.writeFileSync(f, JSON.stringify(items, null, 2), "utf-8");
    console.log(`  ${c}: ${items.length} → ${f}`);
  }

  // 압축본 — AI 한테 전체 검증 부탁할 때 토큰 아끼기 위한 슬림 버전
  const slim = rows.map((r) => ({
    id: r.id,
    sci: r.scientific_name,
    en: r.common_name_en,
    ko: r.common_name_ko,
    cat: r.category,
    cls: r.class_name,
    summary: r.summary_ko,
  }));
  const slimPath = path.join(OUT, "slim.json");
  fs.writeFileSync(slimPath, JSON.stringify(slim, null, 2), "utf-8");
  console.log(`✓ slim 버전 → ${slimPath}`);

  // 검증 시 가장 위험한: 한글이 30% 미만인 행만
  const englishLooking = rows.filter((r) => {
    const s = (r.summary_ko as string | null) ?? "";
    if (!s) return false;
    const ko = (s.match(/[가-힣]/g) ?? []).length;
    return ko / s.length < 0.3;
  });
  const probPath = path.join(OUT, "english-summaries.json");
  fs.writeFileSync(probPath, JSON.stringify(englishLooking, null, 2), "utf-8");
  console.log(`⚠ 영문 요약(검토 필요) ${englishLooking.length} 종 → ${probPath}`);
}

main();
