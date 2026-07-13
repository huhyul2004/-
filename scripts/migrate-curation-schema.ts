// 큐레이션 기능용 스키마 마이그레이션 — species 테이블에 컬럼 8개 + 인덱스 추가
//
// 중요: DB는 로컬 SQLite(data/species.db). Vercel 런타임은 읽기전용이므로
//   이 스크립트는 로컬에서 실행 → data/species.db 변형 → git 커밋 → 배포 흐름이다.
// SQLite엔 `ADD COLUMN IF NOT EXISTS`가 없어서 PRAGMA로 존재 확인 후 개별 ALTER.
// photo_url 은 이미 존재하므로 절대 추가하지 않는다.
//
// 사용법:
//   tsx scripts/migrate-curation-schema.ts            # dry-run (변경 안 함)
//   tsx scripts/migrate-curation-schema.ts --apply    # 실제 적용
//   tsx scripts/migrate-curation-schema.ts --rollback # 추가 컬럼 제거 (백업 후)
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

const DB_PATH = path.join(process.cwd(), "data", "species.db");

// 추가할 컬럼 (photo_url 제외 — 이미 존재)
const NEW_COLUMNS: { name: string; ddl: string }[] = [
  { name: "is_curated", ddl: "ALTER TABLE species ADD COLUMN is_curated INTEGER NOT NULL DEFAULT 0" },
  { name: "data_source", ddl: "ALTER TABLE species ADD COLUMN data_source TEXT NOT NULL DEFAULT 'bulk_import'" },
  { name: "photo_source", ddl: "ALTER TABLE species ADD COLUMN photo_source TEXT" },
  { name: "photo_attribution", ddl: "ALTER TABLE species ADD COLUMN photo_attribution TEXT" },
  { name: "order_name", ddl: "ALTER TABLE species ADD COLUMN order_name TEXT" },
  { name: "family_name", ddl: "ALTER TABLE species ADD COLUMN family_name TEXT" }, // 기존 Korean 'family' 와 별개
  { name: "mass_g", ddl: "ALTER TABLE species ADD COLUMN mass_g REAL" },
  { name: "life_habit", ddl: "ALTER TABLE species ADD COLUMN life_habit TEXT" },
];

const NEW_INDEXES = [
  "CREATE INDEX IF NOT EXISTS idx_species_is_curated ON species(is_curated)",
  "CREATE INDEX IF NOT EXISTS idx_species_data_source ON species(data_source)",
  "CREATE INDEX IF NOT EXISTS idx_species_scientific_name ON species(scientific_name)",
  "CREATE INDEX IF NOT EXISTS idx_species_curated_category ON species(is_curated, category)",
];

function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function existingColumns(db: Database.Database): Set<string> {
  return new Set((db.prepare("PRAGMA table_info(species)").all() as { name: string }[]).map((c) => c.name));
}

function backup(db: Database.Database): string {
  db.pragma("wal_checkpoint(TRUNCATE)"); // WAL 내용을 본 파일로 접기 (git이 .db만 추적)
  const bak = path.join(process.cwd(), "data", `species.db.bak-${timestamp()}`);
  fs.copyFileSync(DB_PATH, bak);
  return bak;
}

function main() {
  const argv = process.argv.slice(2);
  const APPLY = argv.includes("--apply");
  const ROLLBACK = argv.includes("--rollback");

  if (!fs.existsSync(DB_PATH)) {
    console.error(`✗ DB 없음: ${DB_PATH}`);
    process.exit(1);
  }

  const db = new Database(DB_PATH);
  db.pragma("foreign_keys = ON");

  const have = existingColumns(db);
  console.log(`현재 species 컬럼 ${have.size}개`);

  if (ROLLBACK) {
    const toDrop = NEW_COLUMNS.filter((c) => have.has(c.name)).map((c) => c.name);
    console.log(`\n[ROLLBACK] 제거 대상 컬럼: ${toDrop.length ? toDrop.join(", ") : "(없음)"}`);
    if (!APPLY) {
      console.log("dry-run — 실제 제거하려면 --rollback --apply");
      db.close();
      return;
    }
    const bak = backup(db);
    console.log(`✓ 백업: ${bak}`);
    const tx = db.transaction(() => {
      for (const name of toDrop) db.exec(`ALTER TABLE species DROP COLUMN ${name}`);
    });
    tx();
    db.pragma("wal_checkpoint(TRUNCATE)");
    console.log(`✓ [ROLLBACK APPLIED] 컬럼 ${toDrop.length}개 제거`);
    db.close();
    return;
  }

  const missing = NEW_COLUMNS.filter((c) => !have.has(c.name));
  console.log(`\n추가 대상 컬럼 (${missing.length}/${NEW_COLUMNS.length}):`);
  for (const c of NEW_COLUMNS) {
    console.log(`  ${have.has(c.name) ? "✓ 이미 있음" : "＋ 추가"} — ${c.name}`);
  }
  if (have.has("photo_url")) console.log(`  (photo_url 은 이미 존재 → 건드리지 않음)`);

  if (!APPLY) {
    console.log(`\n[DRY RUN] --apply 없이 실행됨. DB 변경 없음.`);
    console.log(`  적용: tsx scripts/migrate-curation-schema.ts --apply`);
    db.close();
    return;
  }

  const bak = backup(db);
  console.log(`\n✓ 백업: ${bak}`);

  const tx = db.transaction(() => {
    for (const c of missing) {
      db.exec(c.ddl);
      console.log(`  ＋ ${c.name}`);
    }
    for (const idx of NEW_INDEXES) db.exec(idx);
  });
  tx();
  db.pragma("wal_checkpoint(TRUNCATE)");

  const after = existingColumns(db);
  console.log(`\n✓ [APPLIED] 컬럼 ${missing.length}개 추가, 인덱스 4개 보장. 총 컬럼 ${after.size}개`);

  // 검증
  const total = (db.prepare("SELECT COUNT(*) c FROM species").get() as { c: number }).c;
  const curated = (db.prepare("SELECT COUNT(*) c FROM species WHERE is_curated = 1").get() as { c: number }).c;
  console.log(`  검증: 총 ${total}종, is_curated=1 ${curated}종 (백필 전이라 0이어야 정상)`);
  db.close();
}

main();
