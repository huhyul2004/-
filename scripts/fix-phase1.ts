// Phase 1 — 데이터 클린업
// 1) 큐레이션과 중복되는 wd-* 종 삭제
// 2) 한글명에 영문/학명 괄호로 붙어있는 패턴 자동 정리
// 3) 동어 반복 패턴 정리 (예: "홉스새우새우" → "홉스새우")
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

const TODAY = new Date().toISOString().slice(0, 10);

// 백업
function backupDb() {
  const src = "data/species.db";
  const dst = `data/backups/species-${TODAY}-pre-phase1.db`;
  fs.mkdirSync("data/backups", { recursive: true });
  fs.copyFileSync(src, dst);
  console.log(`✓ 백업 → ${dst}`);
}

// 한글명 정리 함수
function cleanKoreanName(name: string | null): string | null {
  if (!name) return name;
  let cleaned = name.trim();

  // 1. 괄호와 그 안 내용 제거 (영문이 들어간 괄호만)
  // "수비수이구아나(Ctenosaura defensor)" → "수비수이구아나"
  cleaned = cleaned.replace(/\s*\([^)]*[A-Za-z][^)]*\)\s*/g, "").trim();

  // 2. 같은 단어 반복 제거 (예: "홉스새우새우" → "홉스새우")
  // 2글자 ~ 4글자 패턴이 곧바로 반복되는 경우만
  for (let len = 4; len >= 2; len--) {
    const re = new RegExp(`(.{${len}})\\1`, "g");
    cleaned = cleaned.replace(re, "$1");
  }

  // 3. 빈 문자열이면 null
  return cleaned.length > 0 ? cleaned : null;
}

function main() {
  backupDb();
  const db = getDb();

  // ===== 1. 명시 중복 삭제 =====
  console.log("\n=== Step 1: 큐레이션 중복 wd-* 삭제 ===");
  // 큐레이션과 같은 학명을 가진 wd-* 종들을 찾아 삭제
  const dups = db
    .prepare(
      `SELECT wd.id AS wd_id, cu.id AS cu_id, wd.scientific_name
       FROM species wd
       JOIN species cu ON LOWER(cu.scientific_name) = LOWER(wd.scientific_name) AND cu.id != wd.id
       WHERE wd.id LIKE 'wd-%' AND cu.id NOT LIKE 'wd-%'`
    )
    .all() as { wd_id: string; cu_id: string; scientific_name: string }[];

  console.log(`  중복 후보 ${dups.length} 건:`);
  for (const d of dups) {
    console.log(`    ${d.wd_id} (wd) ↔ ${d.cu_id} (curated) — ${d.scientific_name}`);
  }

  const deleteSpecies = db.prepare("DELETE FROM species WHERE id = ?");
  const deleteTipping = db.prepare("DELETE FROM tipping_points WHERE species_id = ?");
  let deleted = 0;
  for (const d of dups) {
    deleteTipping.run(d.wd_id);
    const r = deleteSpecies.run(d.wd_id);
    if (r.changes > 0) deleted++;
  }
  console.log(`  ✓ ${deleted}건 삭제`);

  // ===== 2. 한글명 괄호 + 동어반복 정리 =====
  console.log("\n=== Step 2: 한글명 정리 (괄호 + 동어반복) ===");
  const allRows = db
    .prepare("SELECT id, common_name_ko FROM species WHERE common_name_ko IS NOT NULL")
    .all() as { id: string; common_name_ko: string }[];

  const updateName = db.prepare(
    "UPDATE species SET common_name_ko = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  );

  let nameFixCount = 0;
  const samples: { id: string; before: string; after: string }[] = [];
  for (const r of allRows) {
    const cleaned = cleanKoreanName(r.common_name_ko);
    if (cleaned !== null && cleaned !== r.common_name_ko) {
      updateName.run(cleaned, r.id);
      nameFixCount++;
      if (samples.length < 12) samples.push({ id: r.id, before: r.common_name_ko, after: cleaned });
    }
  }
  console.log(`  ✓ ${nameFixCount}건 정리`);
  console.log("  샘플:");
  for (const s of samples) console.log(`    [${s.id}] "${s.before}" → "${s.after}"`);

  // ===== 통계 =====
  const total = db.prepare("SELECT COUNT(*) as n FROM species").get() as { n: number };
  console.log(`\n✓ Phase 1 완료. 현재 ${total.n} 종`);
  return { deletedDuplicates: deleted, namesFixed: nameFixCount, totalSpecies: total.n, samples };
}

const result = main();
console.log("\n--- 요약 ---");
console.log(JSON.stringify({
  duplicatesDeleted: result.deletedDuplicates,
  namesFixed: result.namesFixed,
  totalSpecies: result.totalSpecies,
}, null, 2));
