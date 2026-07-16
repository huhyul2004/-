// 큐레이션 종(is_curated=1) 중 사진 없는 종만 겨냥해 사진 보강.
//   각 종: 1) iNaturalist 정확 종 매칭 실사진 → 2) Wikipedia 대표 이미지(summary thumbnail) 폴백
//   지도/도표/SVG URL 은 제외. iNat 은 항상 실사진, Wikipedia 는 lead 이미지(대개 실사진/도판).
// 사용법: tsx scripts/fill-curated-photos.ts [--limit N]   (dry-run)
//         tsx scripts/fill-curated-photos.ts --apply
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
const INAT = "https://api.inaturalist.org/v1/taxa";

// 지도/도표/실루엣/벡터 그래픽으로 의심되는 URL 은 채택하지 않음
// .svg 는 확장자 위치 무관하게 거름 (예: Isparta_in_Turkey.svg.png 위치 지도)
const BAD_URL = /(map|distribution|_range|Range_|locator|diagram|chart|silhouette|Karte|Mapa|_in_[A-Z])|\.svg/i;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function robustFetch(url: string, init?: RequestInit): Promise<Response | null> {
  for (let a = 0; a < 4; a++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      clearTimeout(timer);
      if (res.status === 429 || res.status >= 500) { await sleep(1200 * (a + 1)); continue; }
      return res;
    } catch { clearTimeout(timer); await sleep(800 * (a + 1)); }
  }
  return null;
}

async function inatPhoto(sci: string): Promise<{ url: string; attribution: string | null } | null> {
  const res = await robustFetch(`${INAT}?q=${encodeURIComponent(sci)}&rank=species&per_page=5`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!res || !res.ok) return null;
  const data: any = await res.json();
  const want = sci.toLowerCase().trim();
  const exact = (data.results ?? []).find(
    (t: any) => (t.name || "").toLowerCase().trim() === want && t.default_photo?.medium_url
  );
  if (!exact) return null;
  const url = exact.default_photo.medium_url as string;
  if (BAD_URL.test(url)) return null;
  return { url, attribution: exact.default_photo.attribution ?? null };
}

async function wikiPhoto(title: string, sci: string): Promise<string | null> {
  for (const t of [title, sci].filter(Boolean)) {
    const res = await robustFetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(t.replace(/\s/g, "_"))}?redirect=true`,
      { headers: { "User-Agent": UA, Accept: "application/json" } }
    );
    if (!res || !res.ok) continue;
    const data: any = await res.json();
    if (data.type === "disambiguation") continue;
    const url = data.originalimage?.source ?? data.thumbnail?.source ?? null;
    if (url && !BAD_URL.test(url)) return url;
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
    `SELECT id, scientific_name, wikipedia_title, category FROM species
     WHERE is_curated=1 AND (photo_url IS NULL OR photo_url='') ORDER BY id`
  ).all() as { id: string; scientific_name: string; wikipedia_title: string | null; category: string }[];
  if (Number.isFinite(limit)) rows = rows.slice(0, limit);
  console.log(`큐레이션 사진없음: ${rows.length}종 처리 (${APPLY ? "APPLY" : "DRY RUN"})`);

  if (APPLY) {
    db.pragma("wal_checkpoint(TRUNCATE)");
    const bak = path.join(process.cwd(), "data", `species.db.bak-fillcur-${Date.now()}`);
    fs.copyFileSync(DB_PATH, bak);
    console.log(`✓ 백업: ${bak}`);
  }

  const setPhoto = db.prepare(
    "UPDATE species SET photo_url=?, photo_source=?, photo_attribution=?, updated_at=CURRENT_TIMESTAMP WHERE id=?"
  );

  let inat = 0, wiki = 0, none = 0;
  const t0 = Date.now();
  const missed: { id: string; sci: string; cat: string }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    let hit = false;
    const ip = await inatPhoto(r.scientific_name);
    await sleep(1100);
    if (ip) {
      if (APPLY) setPhoto.run(ip.url, "inaturalist", ip.attribution, r.id);
      inat++; hit = true;
    } else {
      const wp = await wikiPhoto(r.wikipedia_title ?? "", r.scientific_name);
      await sleep(300);
      if (wp) {
        if (APPLY) setPhoto.run(wp, "wikipedia", null, r.id);
        wiki++; hit = true;
      }
    }
    if (!hit) { none++; missed.push({ id: r.id, sci: r.scientific_name, cat: r.category }); }
    if ((i + 1) % 20 === 0 || i + 1 === rows.length) {
      const el = Math.round((Date.now() - t0) / 1000);
      console.log(`  ${i + 1}/${rows.length} iNat=${inat} wiki=${wiki} 없음=${none} (${el}s)`);
    }
  }
  if (APPLY) db.pragma("wal_checkpoint(TRUNCATE)");
  console.log(`\n${APPLY ? "✓ [APPLIED]" : "[DRY RUN]"} iNat ${inat} · Wikipedia ${wiki} · 실패 ${none}`);
  fs.writeFileSync(
    path.join(process.cwd(), "data", "curated-still-missing.json"),
    JSON.stringify({ generated: new Date().toISOString().slice(0, 10), count: missed.length, missed }, null, 2)
  );
  console.log(`남은 사진없음 목록 → data/curated-still-missing.json`);
  db.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
