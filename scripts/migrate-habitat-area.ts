// species.habitat_area_km2 컬럼 추가 마이그레이션 (결정 7, 2026-10-03)
//
// Damuth K = 밀도(체중) × 서식 면적 을 쓰려면 종별 서식 면적이 필요하다. 지금은 자료가 없어 전 종 NULL 로 둔다.
// 엔진(lib/tipping-point.ts)은 이 값이 있으면 Damuth K, 없으면 기존 K 식을 쓴다.
// 함께 DB 버전(PRAGMA user_version = YYYYMMDD)을 기록한다 — 챗봇 답변 끝 "LastWatch DB v…" 가 이 값을 읽는다.
//
// 흐름은 scripts/migrate-curation-schema.ts 와 같다: 로컬에서 실행 → data/species.db 변형 → git 커밋 → 배포.
// Vercel 런타임은 DB 를 읽기만 한다.
//
// 사용법:
//   tsx scripts/migrate-habitat-area.ts             # dry-run (변경 안 함)
//   tsx scripts/migrate-habitat-area.ts --apply     # 적용 (백업 후)
//   tsx scripts/migrate-habitat-area.ts --rollback --apply   # 컬럼 제거 (백업 후)
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

const DB_PATH = path.join(process.cwd(), "data", "species.db");
const COLUMN = "habitat_area_km2";
const DDL = `ALTER TABLE species ADD COLUMN ${COLUMN} REAL`;
/** 이 마이그레이션이 남기는 DB 버전 (YYYYMMDD) */
const SCHEMA_VERSION = 20261003;

function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function hasColumn(db: Database.Database): boolean {
  return (db.prepare("PRAGMA table_info(species)").all() as { name: string }[]).some((c) => c.name === COLUMN);
}

function backup(db: Database.Database): string {
  db.pragma("wal_checkpoint(TRUNCATE)"); // WAL 내용을 본 파일로 접기 (git 은 .db 만 추적)
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
  const present = hasColumn(db);
  const version = db.pragma("user_version", { simple: true }) as number;
  console.log(`species.${COLUMN}: ${present ? "있음" : "없음"} · user_version ${version}`);

  if (ROLLBACK) {
    if (!present) {
      console.log("[ROLLBACK] 제거할 컬럼 없음");
      db.close();
      return;
    }
    if (!APPLY) {
      console.log(`[ROLLBACK dry-run] ${COLUMN} 제거 예정 — 실제 제거는 --rollback --apply`);
      db.close();
      return;
    }
    console.log(`✓ 백업: ${backup(db)}`);
    db.exec(`ALTER TABLE species DROP COLUMN ${COLUMN}`);
    db.pragma("wal_checkpoint(TRUNCATE)");
    console.log(`✓ [ROLLBACK APPLIED] ${COLUMN} 제거 (user_version 은 그대로 ${version})`);
    db.close();
    return;
  }

  if (!APPLY) {
    console.log(`[DRY RUN] ${present ? "컬럼은 이미 있음" : `추가 예정: ${DDL}`} · user_version → ${Math.max(version, SCHEMA_VERSION)}`);
    console.log("  적용: tsx scripts/migrate-habitat-area.ts --apply");
    db.close();
    return;
  }

  console.log(`✓ 백업: ${backup(db)}`);
  const tx = db.transaction(() => {
    if (!present) db.exec(DDL);
    if (version < SCHEMA_VERSION) db.pragma(`user_version = ${SCHEMA_VERSION}`);
  });
  tx();
  db.pragma("wal_checkpoint(TRUNCATE)");

  const filled = (db.prepare(`SELECT COUNT(*) c FROM species WHERE ${COLUMN} IS NOT NULL`).get() as { c: number }).c;
  const total = (db.prepare("SELECT COUNT(*) c FROM species").get() as { c: number }).c;
  console.log(`✓ [APPLIED] ${COLUMN} ${present ? "(이미 있음)" : "추가"} · 값 있는 종 ${filled}/${total} · user_version ${db.pragma("user_version", { simple: true })}`);
  db.close();
}

main();
