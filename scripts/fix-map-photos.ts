// 지도/도표 사진 교정 — 파일명이 map/distribution/range 등인 사진을 교정.
//   각 종에 대해:
//     1) iNaturalist 정확 종 매칭으로 실제 사진 찾으면 교체 (핫링크)
//     2) 없으면 현재 사진을 Claude Vision 으로 판별 → 지도/도표면 제거(NULL), 진짜 생물 사진이면 유지
//   (파일명만으로는 실제 동물 사진 오삭제 위험 → AI 판별로 보호)
//
// 사용법: tsx scripts/fix-map-photos.ts [--limit N]   (dry-run)
//         tsx scripts/fix-map-photos.ts --apply
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
import { getAnthropic } from "../lib/anthropic";

const DB_PATH = path.join(process.cwd(), "data", "species.db");
const VISION_MODEL = "claude-haiku-4-5-20251001";
const UA = process.env.WIKIPEDIA_USER_AGENT || "LastWatch/1.0 (educational; chanzzzang24@gmail.com)";
const INAT = "https://api.inaturalist.org/v1/taxa";

const SUSPECT_SQL = `photo_url IS NOT NULL AND photo_url <> '' AND photo_url NOT LIKE '%/placeholder/%' AND (
  photo_url LIKE '%map%' OR photo_url LIKE '%distribution%' OR photo_url LIKE '%_range%' OR
  photo_url LIKE '%Range_%' OR photo_url LIKE '%locator%' OR photo_url LIKE '%diagram%' OR
  photo_url LIKE '%chart%' OR photo_url LIKE '%.svg%' OR photo_url LIKE '%silhouette%' OR
  photo_url LIKE '%Karte%' OR photo_url LIKE '%Mapa%')`;

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

// iNaturalist 정확 종 매칭 사진
async function inatPhoto(sci: string): Promise<{ url: string; attribution: string | null } | null> {
  const res = await robustFetch(`${INAT}?q=${encodeURIComponent(sci)}&rank=species&per_page=5`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!res || !res.ok) return null;
  const data: any = await res.json();
  const want = sci.toLowerCase().trim();
  const exact = (data.results ?? []).find((t: any) => (t.name || "").toLowerCase().trim() === want && t.default_photo?.medium_url);
  if (!exact) return null;
  return { url: exact.default_photo.medium_url, attribution: exact.default_photo.attribution ?? null };
}

async function downloadB64(url: string): Promise<{ data: string; media_type: "image/jpeg" | "image/png" } | null> {
  const res = await robustFetch(url, { headers: { "User-Agent": UA } });
  if (!res || !res.ok) return null;
  try {
    const buf = Buffer.from(await res.arrayBuffer());
    const media_type = /\.png(\?|$)/i.test(url) ? "image/png" : "image/jpeg";
    return { data: buf.toString("base64"), media_type };
  } catch { return null; }
}

// 현재 사진이 지도/도표인지 판별 (실제 생물 사진이면 false)
async function isMapNotPhoto(url: string): Promise<boolean> {
  const img = await downloadB64(url);
  if (!img) return false; // 다운로드 실패 → 판단 불가, 유지(안전)
  try {
    const resp = await getAnthropic().messages.create({
      model: VISION_MODEL,
      max_tokens: 60,
      system:
        'You classify an image for a wildlife encyclopedia. Answer whether it is a MAP/DIAGRAM (a distribution/range map, locator map, chart, diagram, or other non-photographic graphic) as opposed to a real photograph of a living organism. Respond ONLY strict JSON: {"isMap": boolean, "confidence": number 0..1}. A real photo of an animal or plant → isMap:false.',
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: img.media_type, data: img.data } },
          { type: "text", text: "Is this a map/diagram (not a real organism photo)? JSON only." },
        ],
      }],
    });
    const text = resp.content.filter((b) => b.type === "text").map((b: any) => b.text).join("").trim();
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return false;
    const p = JSON.parse(m[0]);
    return !!p.isMap && (typeof p.confidence !== "number" || p.confidence >= 0.7);
  } catch { return false; }
}

async function main() {
  const argv = process.argv.slice(2);
  const APPLY = argv.includes("--apply");
  const limIdx = argv.indexOf("--limit");
  const limit = limIdx >= 0 ? parseInt(argv[limIdx + 1], 10) : Infinity;

  const db = new Database(DB_PATH);
  db.pragma("foreign_keys = ON");

  let rows = db.prepare(`SELECT id, scientific_name, photo_url FROM species WHERE ${SUSPECT_SQL} ORDER BY id`).all() as
    { id: string; scientific_name: string; photo_url: string }[];
  if (Number.isFinite(limit)) rows = rows.slice(0, limit);
  console.log(`지도/도표 의심 사진: ${rows.length}종 처리`);

  if (APPLY) {
    db.pragma("wal_checkpoint(TRUNCATE)");
    const bak = path.join(process.cwd(), "data", `species.db.bak-fixmap-${Date.now()}`);
    fs.copyFileSync(DB_PATH, bak);
    console.log(`✓ 백업: ${bak}`);
  }

  const setPhoto = db.prepare("UPDATE species SET photo_url=?, photo_source=?, photo_attribution=?, updated_at=CURRENT_TIMESTAMP WHERE id=?");
  const clearPhoto = db.prepare("UPDATE species SET photo_url=NULL, photo_source=NULL, photo_attribution=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?");

  let replaced = 0, nulled = 0, kept = 0;
  const t0 = Date.now();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    // 1) iNat 실제 사진 시도
    const inat = await inatPhoto(r.scientific_name);
    await sleep(1100);
    if (inat) {
      if (APPLY) setPhoto.run(inat.url, "inaturalist", inat.attribution, r.id);
      replaced++;
    } else {
      // 2) 현재 사진 판별
      const isMap = await isMapNotPhoto(r.photo_url);
      if (isMap) {
        if (APPLY) clearPhoto.run(r.id);
        nulled++;
      } else {
        kept++; // 실제 생물 사진 → 유지 (오삭제 방지)
      }
    }
    if ((i + 1) % 25 === 0 || i + 1 === rows.length) {
      const el = Math.round((Date.now() - t0) / 1000);
      const eta = Math.round((rows.length - i - 1) / Math.max((i + 1) / Math.max(el, 1), 0.01) / 60);
      console.log(`  ${i + 1}/${rows.length} iNat교체=${replaced} 지도제거=${nulled} 유지=${kept} (${el}s, ETA ${eta}분)`);
    }
  }
  if (APPLY) db.pragma("wal_checkpoint(TRUNCATE)");
  console.log(`\n${APPLY ? "✓ [APPLIED]" : "[DRY RUN]"} iNat 실사진 교체 ${replaced} · 지도 제거(NULL) ${nulled} · 실사진 유지 ${kept}`);
  if (!APPLY) console.log("  적용: tsx scripts/fix-map-photos.ts --apply");
  db.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
