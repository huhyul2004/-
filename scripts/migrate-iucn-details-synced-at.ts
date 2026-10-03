// species.iucn_details_synced_at 컬럼 추가 + 채우기 (결정 10·11, 2026-10-03)
//
// 챗봇 답변 끝 "데이터 출처: … IUCN API 조회일 …" 과 CSV 내보내기에 종별 IUCN 조회일을 적으려면
// 위협·서식지·보전 활동을 IUCN API 에서 받은 날짜가 DB 안에 있어야 한다 (Vercel 번들에는 DB 만 들어간다).
//   - species.iucn_synced_at        : 평가(등급·개체수·추세) 동기화 시각 — 기존 컬럼 (2026-07-26·29)
//   - species.iucn_details_synced_at: 위협·서식지·보전 활동 조회 시각 — 이 컬럼 (2026-09-12)
// 값은 수집 스크립트(sync_iucn_all.py --details, 커밋 d8584a0)가 남긴 진행 캐시 data/iucn-details-fetch.json
// 의 종별 "at"(UTC ISO) 을 그대로 옮긴다. result 가 "empty"(평가에 세 항목 없음)인 종도 조회는 했으므로 채운다.
// 캐시에 없는 종(수기 시드 22종 등)은 NULL — 그 종의 위협·서식지 행은 IUCN API 에서 온 것이 아니다.
//
// 흐름은 scripts/migrate-habitat-area.ts 와 같다: 로컬에서 실행 → data/species.db 변형 → git 커밋 → 배포.
//
// 사용법:
//   tsx scripts/migrate-iucn-details-synced-at.ts             # dry-run (변경 안 함)
//   tsx scripts/migrate-iucn-details-synced-at.ts --apply     # 적용 (백업 후)
//   tsx scripts/migrate-iucn-details-synced-at.ts --rollback --apply   # 컬럼 제거 (백업 후)
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

const DB_PATH = path.join(process.cwd(), "data", "species.db");
const CACHE_PATH = path.join(process.cwd(), "data", "iucn-details-fetch.json");
const COLUMN = "iucn_details_synced_at";
const DDL = `ALTER TABLE species ADD COLUMN ${COLUMN} TEXT`;

interface CacheEntry {
  aid?: number;
  result?: string;
  at?: string;
}

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

function loadCache(): Map<string, string> {
  const raw = JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8")) as { species?: Record<string, CacheEntry> };
  const out = new Map<string, string>();
  for (const [id, e] of Object.entries(raw.species ?? {})) {
    if (typeof e.at === "string" && !Number.isNaN(Date.parse(e.at))) out.set(id, e.at);
  }
  return out;
}

function main() {
  const argv = process.argv.slice(2);
  const APPLY = argv.includes("--apply");
  const ROLLBACK = argv.includes("--rollback");

  for (const p of [DB_PATH, CACHE_PATH]) {
    if (!fs.existsSync(p)) {
      console.error(`✗ 파일 없음: ${p}`);
      process.exit(1);
    }
  }
  const db = new Database(DB_PATH);
  const present = hasColumn(db);
  console.log(`species.${COLUMN}: ${present ? "있음" : "없음"} · user_version ${db.pragma("user_version", { simple: true })}`);

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
    console.log(`✓ [ROLLBACK APPLIED] ${COLUMN} 제거`);
    db.close();
    return;
  }

  const cache = loadCache();
  const ids = new Set((db.prepare("SELECT id FROM species").all() as { id: string }[]).map((r) => r.id));
  const matched = Array.from(cache.keys()).filter((id) => ids.has(id));
  console.log(`캐시 ${cache.size}종 · DB 에 있는 종 ${matched.length} · DB 에 없는 종 ${cache.size - matched.length}`);

  if (!APPLY) {
    console.log(`[DRY RUN] ${present ? "컬럼은 이미 있음" : `추가 예정: ${DDL}`} · 채울 종 ${matched.length}`);
    console.log("  적용: tsx scripts/migrate-iucn-details-synced-at.ts --apply");
    db.close();
    return;
  }

  console.log(`✓ 백업: ${backup(db)}`);
  const tx = db.transaction(() => {
    if (!present) db.exec(DDL);
    const upd = db.prepare(`UPDATE species SET ${COLUMN} = ? WHERE id = ?`);
    for (const id of matched) upd.run(cache.get(id)!, id);
  });
  tx();
  db.pragma("wal_checkpoint(TRUNCATE)");

  const filled = (db.prepare(`SELECT COUNT(*) c FROM species WHERE ${COLUMN} IS NOT NULL`).get() as { c: number }).c;
  const total = (db.prepare("SELECT COUNT(*) c FROM species").get() as { c: number }).c;
  console.log(`✓ [APPLIED] ${COLUMN} ${present ? "(이미 있음)" : "추가"} · 값 있는 종 ${filled}/${total}`);
  db.close();
}

main();
