// 기존 '원본 큐레이션' 집합 백필 — summary_ko(직접 작성 한국어 상세글) 보유 종을
//   is_curated=1, data_source='lastwatch_original' 로 표시 (사용자 결정: 1,030종 기준).
// 멱등: is_curated=0 인 것만 갱신, phylacine_curated 행은 절대 건드리지 않음.
//
// 사용법:
//   tsx scripts/backfill-curated-original.ts          # dry-run
//   tsx scripts/backfill-curated-original.ts --apply  # 적용
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

const DB_PATH = path.join(process.cwd(), "data", "species.db");
const WHERE =
  "is_curated = 0 AND data_source <> 'phylacine_curated' AND summary_ko IS NOT NULL AND TRIM(summary_ko) <> ''";

function main() {
  const APPLY = process.argv.includes("--apply");
  const db = new Database(DB_PATH);
  db.pragma("foreign_keys = ON");

  const target = (db.prepare(`SELECT COUNT(*) c FROM species WHERE ${WHERE}`).get() as { c: number }).c;
  const alreadyOriginal = (db.prepare("SELECT COUNT(*) c FROM species WHERE data_source='lastwatch_original'").get() as { c: number }).c;
  console.log(`백필 대상(summary_ko 보유, 미표시): ${target}종`);
  console.log(`이미 lastwatch_original 표시됨: ${alreadyOriginal}종`);

  if (!APPLY) {
    console.log(`\n[DRY RUN] --apply 없이 실행됨. 변경 없음.`);
    db.close();
    return;
  }

  const info = db.prepare(
    `UPDATE species SET is_curated = 1, data_source = 'lastwatch_original', updated_at = CURRENT_TIMESTAMP WHERE ${WHERE}`
  ).run();
  db.pragma("wal_checkpoint(TRUNCATE)");

  const curated = (db.prepare("SELECT COUNT(*) c FROM species WHERE is_curated=1").get() as { c: number }).c;
  const original = (db.prepare("SELECT COUNT(*) c FROM species WHERE data_source='lastwatch_original'").get() as { c: number }).c;
  console.log(`\n✓ [APPLIED] ${info.changes}종 갱신`);
  console.log(`  is_curated=1 총: ${curated} | lastwatch_original: ${original}`);
  console.log(`  (임포트 전이므로 curated == original == 1030 이어야 정상)`);
  db.close();
}

main();
