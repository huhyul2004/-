// photo-results.json 을 읽어 DB 에 photo_url 반영
// 기본은 DRY RUN — 실제 적용하려면 --apply 필요
// 이 스크립트는 절대 종(species) 행을 삭제하지 않음. no_photo_found 는 리포트만.
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

interface PhotoResult {
  species_id: string;
  species_name: string;
  old_photo_url: string | null;
  new_photo_url: string | null;
  source: "wikipedia" | "commons" | null;
  status: "updated" | "not_found";
}

interface PhotoResultsFile {
  updated: string;
  total_species: number;
  successfully_updated: number;
  no_photo_found: number;
  results: PhotoResult[];
}

function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(
    d.getMinutes()
  )}${p(d.getSeconds())}`;
}

async function main() {
  const APPLY = process.argv.includes("--apply");

  const resultsPath = path.join(process.cwd(), "data", "photo-results.json");
  if (!fs.existsSync(resultsPath)) {
    console.error(`photo-results.json 없음 — 먼저 fetch-wikipedia-photos 실행 필요: ${resultsPath}`);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(resultsPath, "utf-8")) as PhotoResultsFile;
  const results = data.results ?? [];

  const db = getDb();

  // 1. 백업 먼저 (전체 species 행 덤프)
  const backupDir = path.join(process.cwd(), "data", "backups");
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `species-backup-${timestamp()}.json`);
  const fullRows = db.prepare("SELECT * FROM species").all();
  fs.writeFileSync(backupPath, JSON.stringify(fullRows, null, 2));
  console.log(`✓ 백업 저장: ${backupPath} (${fullRows.length} 종)`);

  // 2. 반영 대상 / 미발견 집계
  const toUpdate = results.filter(
    (r) => r.status === "updated" && r.new_photo_url && r.new_photo_url.trim() !== ""
  );
  const notFound = results.filter((r) => r.status === "not_found");

  console.log(`\n리포트 요약 (updated: ${data.updated})`);
  console.log(`  전체 결과:     ${results.length}`);
  console.log(`  photo_url 갱신 대상: ${toUpdate.length}`);
  console.log(`  사진 미발견:   ${notFound.length}`);

  // 3. 미발견 종 ID 저장 (삭제 아님 — 사용자 결정용)
  const noPhotoFinalPath = path.join(process.cwd(), "data", "no-photo-final.json");
  fs.writeFileSync(
    noPhotoFinalPath,
    JSON.stringify(
      {
        generated: new Date().toISOString(),
        count: notFound.length,
        note: "이 종들은 사진을 찾지 못했습니다. 이 스크립트는 삭제하지 않습니다. 삭제 여부는 사용자가 별도로 결정합니다.",
        ids: notFound.map((r) => r.species_id),
        species: notFound.map((r) => ({ id: r.species_id, name: r.species_name })),
      },
      null,
      2
    )
  );
  console.log(`  미발견 리포트: ${noPhotoFinalPath}`);
  console.log(`  삭제 후보 ${notFound.length}종 — 사용자 확인 필요, 이 스크립트는 삭제하지 않음`);

  if (!APPLY) {
    console.log(`\n[DRY RUN] --apply 없이 실행됨. DB 에 아무것도 쓰지 않았습니다.`);
    console.log(`  실제 적용하려면: npm run apply-photos -- --apply`);
    console.log(`\n  갱신 예시 (최대 15):`);
    for (const r of toUpdate.slice(0, 15)) {
      console.log(
        `    [${r.species_id}] ${r.species_name}\n      old: ${r.old_photo_url ?? "(none)"}\n      new: ${r.new_photo_url} (${r.source})`
      );
    }
    return;
  }

  // 4. 실제 적용 (--apply)
  const update = db.prepare(
    "UPDATE species SET photo_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  );
  const applyAll = db.transaction((items: PhotoResult[]) => {
    let n = 0;
    for (const r of items) {
      const res = update.run(r.new_photo_url, r.species_id);
      if (res.changes > 0) n++;
    }
    return n;
  });
  const changed = applyAll(toUpdate);

  console.log(`\n✓ [APPLIED] photo_url ${changed} 종 갱신 완료`);
  console.log(`  미발견 ${notFound.length}종은 그대로 유지됨 (삭제하지 않음)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
