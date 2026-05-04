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
      `SELECT s.id, s.scientific_name, s.common_name_en, s.common_name_ko, s.category,
              s.class_name, s.region, s.population_trend, s.mature_individuals,
              s.summary_ko, s.photo_url, s.wikipedia_title, s.extinction_year, s.extinction_cause,
              t.consensus_score, t.intervention_tier, t.deadline_days, t.extinction_days
       FROM species s
       LEFT JOIN tipping_points t ON t.species_id = s.id
       ORDER BY s.category, s.common_name_ko`
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
    tier: r.intervention_tier,
    score: r.consensus_score,
    deadline_days: r.deadline_days,
    extinction_days: r.extinction_days,
  }));
  const slimPath = path.join(OUT, "slim.json");
  fs.writeFileSync(slimPath, JSON.stringify(slim, null, 2), "utf-8");
  console.log(`✓ slim 버전 → ${slimPath}`);

  // 시급도 TOP 100 — 검증용 핵심 샘플
  const urgent = rows
    .filter((r) => r.deadline_days != null && r.intervention_tier !== "EX")
    .sort((a, b) => Number(a.deadline_days) - Number(b.deadline_days))
    .slice(0, 100);
  const urgentPath = path.join(OUT, "urgent-top100.json");
  fs.writeFileSync(urgentPath, JSON.stringify(urgent, null, 2), "utf-8");
  console.log(`✓ 시급도 TOP100 → ${urgentPath}`);

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
