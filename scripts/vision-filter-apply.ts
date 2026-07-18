// gbif-eol-added.json 후보를 Claude Vision 으로 검수 후 합격분만 DB 적용.
//   합격: 살아있는 생물 사진 OR 전체 형태를 알아볼 수 있는 표본/식물표본지
//   불합격: 신체 일부 클로즈업(발·이빨·조직), 현미경/세포, 라벨·텍스트만, 지도/도표
// 사용법: tsx scripts/vision-filter-apply.ts [--limit N]   (dry-run)
//         tsx scripts/vision-filter-apply.ts --apply
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
const inIdx = process.argv.indexOf("--input");
const CANDIDATES = inIdx >= 0
  ? path.resolve(process.argv[inIdx + 1])
  : path.join(process.cwd(), "data", "gbif-eol-added.json");
const VISION_MODEL = "claude-haiku-4-5-20251001";
const UA = process.env.WIKIPEDIA_USER_AGENT || "LastWatch/1.0 (educational; chanzzzang24@gmail.com)";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function downloadB64(url: string): Promise<{ data: string; media_type: string } | null> {
  for (let a = 0; a < 3; a++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45000);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": UA } });
      clearTimeout(timer);
      if (res.status === 429 || res.status >= 500) { await sleep(1000 * (a + 1)); continue; }
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1000) return null;
      const ct = res.headers.get("content-type") || "";
      let media_type = "image/jpeg";
      if (/png/i.test(ct) || /\.png(\?|$)/i.test(url)) media_type = "image/png";
      else if (/webp/i.test(ct) || /\.webp(\?|$)/i.test(url)) media_type = "image/webp";
      return { data: buf.toString("base64"), media_type };
    } catch { clearTimeout(timer); await sleep(800 * (a + 1)); }
  }
  return null;
}

// 대표 이미지로 적합한지 판별
async function isUsable(url: string, sci: string): Promise<{ ok: boolean; reason: string } | null> {
  const img = await downloadB64(url);
  if (!img) return null; // 다운로드 실패 → 판단불가
  try {
    const resp = await getAnthropic().messages.create({
      model: VISION_MODEL,
      max_tokens: 90,
      system:
        'You screen an image as the lead illustration for a species in a wildlife/conservation encyclopedia (species: ' +
        sci +
        '). ACCEPT (usable=true) if it shows the whole organism recognizably: a live animal/plant photo, a full museum specimen, or a herbarium sheet showing the whole pressed plant. REJECT (usable=false) if it is an isolated body part (a foot, skull, tooth, wing, tissue), a microscope/cellular/DNA-gel image, a label/text/barcode-only image, a map/diagram/chart, or too degraded to recognize the organism. Respond ONLY strict JSON: {"usable": boolean, "reason": "<=6 words"}.',
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: img.media_type as any, data: img.data } },
          { type: "text", text: "Usable as the lead species image? JSON only." },
        ],
      }],
    });
    const text = resp.content.filter((b) => b.type === "text").map((b: any) => b.text).join("").trim();
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return { ok: false, reason: "parse fail" };
    const p = JSON.parse(m[0]);
    return { ok: !!p.usable, reason: String(p.reason ?? "") };
  } catch { return null; }
}

async function main() {
  const argv = process.argv.slice(2);
  const APPLY = argv.includes("--apply");
  const limIdx = argv.indexOf("--limit");
  const limit = limIdx >= 0 ? parseInt(argv[limIdx + 1], 10) : Infinity;

  const cand = JSON.parse(fs.readFileSync(CANDIDATES, "utf-8")).added as
    { sci: string; src: string; url: string }[];
  let items = cand;
  if (Number.isFinite(limit)) items = items.slice(0, limit);
  console.log(`Vision 검수: 후보 ${items.length}건 (${APPLY ? "APPLY" : "DRY RUN"})`);

  const db = new Database(DB_PATH);
  db.pragma("foreign_keys = ON");
  if (APPLY) {
    db.pragma("wal_checkpoint(TRUNCATE)");
    const bak = path.join(process.cwd(), "data", `species.db.bak-vision-${Date.now()}`);
    fs.copyFileSync(DB_PATH, bak);
    console.log(`✓ 백업: ${bak}`);
  }
  const findId = db.prepare("SELECT id, photo_attribution FROM species WHERE scientific_name=? AND is_curated=1 LIMIT 1");
  const setPhoto = db.prepare(
    "UPDATE species SET photo_url=?, photo_source=?, updated_at=CURRENT_TIMESTAMP WHERE id=?"
  );

  let pass = 0, rejected = 0, undl = 0;
  const passed: any[] = [], failed: any[] = [];
  for (let i = 0; i < items.length; i++) {
    const c = items[i];
    const v = await isUsable(c.url, c.sci);
    await sleep(300);
    if (v === null) { undl++; failed.push({ ...c, reason: "download/vision fail" }); }
    else if (v.ok) {
      pass++;
      const row = findId.get(c.sci) as { id: string } | undefined;
      if (row && APPLY) setPhoto.run(c.url, c.src, row.id);
      passed.push({ ...c, reason: v.reason });
    } else { rejected++; failed.push({ ...c, reason: v.reason }); }
    if ((i + 1) % 10 === 0 || i + 1 === items.length)
      console.log(`  ${i + 1}/${items.length} 합격=${pass} 불합격=${rejected} 판단불가=${undl}`);
  }
  if (APPLY) db.pragma("wal_checkpoint(TRUNCATE)");
  console.log(`\n${APPLY ? "✓ [APPLIED]" : "[DRY RUN]"} 합격 ${pass} · 불합격 ${rejected} · 판단불가 ${undl}`);
  fs.writeFileSync(path.join(process.cwd(), "data", "vision-review.json"),
    JSON.stringify({ passed, failed }, null, 2));
  console.log("검수 상세 → data/vision-review.json");
  db.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
