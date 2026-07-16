// 큐레이션 사진없음 잔여종 — GBIF/EOL 로 최종 보강 (iNat·Wikipedia 실패분 대상)
//   각 종: 1) GBIF 정확 학명매칭 → occurrence StillImage 실사진
//          2) EOL 검색 → pages 이미지 (부분매칭 위험 → 지도필터 + 정확매칭 검증)
//   지도/도표/SVG URL 은 제외.
// 사용법: tsx scripts/fill-curated-gbif-eol.ts [--limit N]  (dry-run)
//         tsx scripts/fill-curated-gbif-eol.ts --apply
import fs from "fs";
import path from "path";

const envFile = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

import Database from "better-sqlite3";

const DB_PATH = path.join(process.cwd(), "data", "species.db");
const UA = process.env.WIKIPEDIA_USER_AGENT || "LastWatch/1.0 (educational; chanzzzang24@gmail.com)";
const BAD_URL = /(map|distribution|_range|Range_|locator|diagram|chart|silhouette|Karte|Mapa|_in_[A-Z])|\.svg/i;
const IMG_EXT = /\.(jpg|jpeg|png|webp)(\?|$)/i;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function jget(url: string): Promise<any | null> {
  for (let a = 0; a < 3; a++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": UA, Accept: "application/json" } });
      clearTimeout(timer);
      if (res.status === 429 || res.status >= 500) { await sleep(1200 * (a + 1)); continue; }
      if (!res.ok) return null;
      return await res.json();
    } catch { clearTimeout(timer); await sleep(800 * (a + 1)); }
  }
  return null;
}

// GBIF: 학명 정확매칭 → occurrence 이미지
async function gbifPhoto(sci: string): Promise<{ url: string; attribution: string | null } | null> {
  const match = await jget(`https://api.gbif.org/v1/species/match?name=${encodeURIComponent(sci)}&strict=true`);
  if (!match || !match.usageKey || match.matchType === "NONE") return null;
  // 종 레벨 정확매칭만 (속/과 매칭은 다른 종 사진 위험)
  if (match.rank && match.rank !== "SPECIES") return null;
  const occ = await jget(
    `https://api.gbif.org/v1/occurrence/search?taxonKey=${match.usageKey}&mediaType=StillImage&limit=8`
  );
  for (const o of occ?.results ?? []) {
    for (const m of o.media ?? []) {
      const url: string = m.identifier;
      if (url && /^https?:\/\//.test(url) && IMG_EXT.test(url) && !BAD_URL.test(url)) {
        const attr = [m.rightsHolder, m.license].filter(Boolean).join(" · ") || null;
        return { url, attribution: attr };
      }
    }
  }
  return null;
}

// EOL: 검색 → 정확매칭 페이지 → 이미지
async function eolPhoto(sci: string): Promise<{ url: string; attribution: string | null } | null> {
  const search = await jget(`https://eol.org/api/search/1.0.json?q=${encodeURIComponent(sci)}&page=1`);
  const want = sci.toLowerCase().trim();
  // 제목이 학명과 정확히 일치하는 결과만 (오종 방지)
  const hit = (search?.results ?? []).find((r: any) => (r.title || "").toLowerCase().trim().startsWith(want));
  if (!hit?.id) return null;
  const page = await jget(
    `https://eol.org/api/pages/1.0/${hit.id}.json?images_per_page=3&images_page=1&taxonomy=false`
  );
  for (const obj of page?.taxonConcept?.dataObjects ?? []) {
    if (!String(obj.dataType || "").toLowerCase().includes("image")) continue;
    const url: string = obj.eolMediaURL ?? obj.mediaURL;
    if (url && /^https?:/.test(url) && !BAD_URL.test(url)) {
      const attr = obj.rightsHolder ?? obj.license ?? null;
      return { url, attribution: attr };
    }
  }
  return null;
}

async function main() {
  const argv = process.argv.slice(2);
  const APPLY = argv.includes("--apply");
  const limIdx = argv.indexOf("--limit");
  const limit = limIdx >= 0 ? parseInt(argv[limIdx + 1], 10) : Infinity;

  const db = new Database(DB_PATH);
  db.pragma("foreign_keys = ON");

  let rows = db.prepare(
    `SELECT id, scientific_name, category FROM species
     WHERE is_curated=1 AND (photo_url IS NULL OR photo_url='') ORDER BY id`
  ).all() as { id: string; scientific_name: string; category: string }[];
  if (Number.isFinite(limit)) rows = rows.slice(0, limit);
  console.log(`GBIF/EOL 최종 보강: ${rows.length}종 (${APPLY ? "APPLY" : "DRY RUN"})`);

  if (APPLY) {
    db.pragma("wal_checkpoint(TRUNCATE)");
    const bak = path.join(process.cwd(), "data", `species.db.bak-gbifeol-${Date.now()}`);
    fs.copyFileSync(DB_PATH, bak);
    console.log(`✓ 백업: ${bak}`);
  }

  const setPhoto = db.prepare(
    "UPDATE species SET photo_url=?, photo_source=?, photo_attribution=?, updated_at=CURRENT_TIMESTAMP WHERE id=?"
  );

  let gbif = 0, eol = 0, none = 0;
  const t0 = Date.now();
  const added: { sci: string; src: string; url: string }[] = [];
  const stillMissing: { id: string; sci: string; cat: string }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    let hit = false;
    const g = await gbifPhoto(r.scientific_name);
    await sleep(700);
    if (g) {
      if (APPLY) setPhoto.run(g.url, "gbif", g.attribution, r.id);
      gbif++; hit = true; added.push({ sci: r.scientific_name, src: "gbif", url: g.url });
    } else {
      const e = await eolPhoto(r.scientific_name);
      await sleep(700);
      if (e) {
        if (APPLY) setPhoto.run(e.url, "eol", e.attribution, r.id);
        eol++; hit = true; added.push({ sci: r.scientific_name, src: "eol", url: e.url });
      }
    }
    if (!hit) { none++; stillMissing.push({ id: r.id, sci: r.scientific_name, cat: r.category }); }
    if ((i + 1) % 20 === 0 || i + 1 === rows.length) {
      const el = Math.round((Date.now() - t0) / 1000);
      console.log(`  ${i + 1}/${rows.length} GBIF=${gbif} EOL=${eol} 없음=${none} (${el}s)`);
    }
  }
  if (APPLY) db.pragma("wal_checkpoint(TRUNCATE)");
  console.log(`\n${APPLY ? "✓ [APPLIED]" : "[DRY RUN]"} GBIF ${gbif} · EOL ${eol} · 실패 ${none}`);
  fs.writeFileSync(
    path.join(process.cwd(), "data", "gbif-eol-added.json"),
    JSON.stringify({ generated: "run", count: added.length, added }, null, 2)
  );
  console.log(`추가분 → data/gbif-eol-added.json (검수용)`);
  db.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
