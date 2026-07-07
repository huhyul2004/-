// Wikipedia + Commons 에서 종별 사진 후보를 찾아 Claude Vision 으로 검증
// DB 는 건드리지 않고 data/photo-results.json 리포트만 생성
// 사용법: tsx scripts/fetch-wikipedia-photos.ts [--limit N]
import fs from "fs";
import path from "path";

const envFile = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

import { getDb, SpeciesRow } from "../lib/db";
import { getAnthropic } from "../lib/anthropic";

const VISION_MODEL = "claude-haiku-4-5-20251001";
const UA =
  process.env.WIKIPEDIA_USER_AGENT ||
  "LastWatch/1.0 (educational, contact: chanzzzang24@gmail.com)";

const WIKI_API = "https://en.wikipedia.org/w/api.php";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";

// SVG/로고/지도/아이콘/음원 등 종 사진이 아닌 파일 제외
const BAD_NAME_RE =
  /(logo|icon|map|distribution|range|locator|commons-logo|wiki|\.svg|\.ogg|\.oga|\.wav|\.pdf|\.tif)/i;

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

async function apiGet(base: string, params: Record<string, string>): Promise<any> {
  const url = base + "?" + new URLSearchParams(params).toString();
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!res.ok) return null;
  return res.json();
}

interface ImageCandidate {
  title: string; // File:...
  url: string;
  thumbUrl: string;
  mime: string;
  width: number;
}

// Step 1: 문서에 포함된 이미지 파일명 목록
async function getPageImages(title: string): Promise<string[]> {
  const data = await apiGet(WIKI_API, {
    action: "query",
    titles: title,
    prop: "images",
    imlimit: "10",
    format: "json",
    redirects: "1",
  });
  const pages = data?.query?.pages ?? {};
  const names: string[] = [];
  for (const pid of Object.keys(pages)) {
    const imgs = pages[pid].images ?? [];
    for (const im of imgs) {
      if (im.title && !BAD_NAME_RE.test(im.title)) names.push(im.title);
    }
  }
  return names.slice(0, 10);
}

// Step 2: 파일명 → 실제 URL/mime/size 해석 (jpeg/png & width>=400 만 허용)
async function resolveImage(fileTitle: string): Promise<ImageCandidate | null> {
  const data = await apiGet(WIKI_API, {
    action: "query",
    titles: fileTitle,
    prop: "imageinfo",
    iiprop: "url|mime|size|mediatype",
    iiurlwidth: "400",
    format: "json",
  });
  const pages = data?.query?.pages ?? {};
  for (const pid of Object.keys(pages)) {
    const info = pages[pid].imageinfo?.[0];
    if (!info) continue;
    const mime: string = info.mime || "";
    const width: number = info.width || 0;
    const mediatype: string = info.mediatype || "";
    if (mediatype && mediatype.toUpperCase() !== "BITMAP" && mediatype.toUpperCase() !== "DRAWING")
      continue;
    if (mime !== "image/jpeg" && mime !== "image/png") continue;
    if (width < 400) continue;
    return {
      title: fileTitle,
      url: info.url,
      thumbUrl: info.thumburl || info.url,
      mime,
      width,
    };
  }
  return null;
}

// 썸네일 바이트를 UA 붙여 직접 다운로드 (Wikimedia 가 Anthropic 페처를 UA 없이 차단하므로 base64 전송)
async function downloadThumb(
  thumbUrl: string,
  mime: string
): Promise<{ data: string; media_type: "image/jpeg" | "image/png" } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(thumbUrl, {
      headers: { "User-Agent": UA },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const media_type = mime === "image/png" ? "image/png" : "image/jpeg";
    return { data: buf.toString("base64"), media_type };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Step 3: Claude Vision 판정 — 야생동물 사진인지 {isAnimal, confidence}
async function judgeAnimal(
  thumbUrl: string,
  mime: string
): Promise<{ isAnimal: boolean; confidence: number }> {
  const client = getAnthropic();
  const img = await downloadThumb(thumbUrl, mime);
  if (!img) return { isAnimal: false, confidence: 0 };
  try {
    const resp = await client.messages.create({
      model: VISION_MODEL,
      max_tokens: 80,
      system:
        'You classify wildlife photos. Given an image, decide if it is a real photograph of an animal (alive, specimen, or in the wild). Maps, diagrams, charts, range/distribution maps, logos, icons, text, or plant-only images are NOT animals. Respond ONLY with strict JSON: {"isAnimal": boolean, "confidence": number between 0 and 1}. No prose.',
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: img.media_type, data: img.data } },
            { type: "text", text: "Is this a real photograph of an animal? Return JSON only." },
          ],
        },
      ],
    });
    const text = resp.content
      .filter((b) => b.type === "text")
      .map((b: any) => b.text)
      .join("")
      .trim();
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return { isAnimal: false, confidence: 0 };
    const parsed = JSON.parse(m[0]);
    return {
      isAnimal: !!parsed.isAnimal,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
    };
  } catch (e) {
    console.log(`    judge error: ${(e as Error).message.slice(0, 80)}`);
    return { isAnimal: false, confidence: 0 };
  }
}

// Step 5: Commons 검색 폴백
async function getCommonsCandidates(scientificName: string): Promise<ImageCandidate[]> {
  const data = await apiGet(COMMONS_API, {
    action: "query",
    generator: "search",
    gsrsearch: scientificName,
    gsrnamespace: "6",
    gsrlimit: "5",
    prop: "imageinfo",
    iiprop: "url|mime|size",
    iiurlwidth: "400",
    format: "json",
  });
  const pages = data?.query?.pages ?? {};
  const out: ImageCandidate[] = [];
  for (const pid of Object.keys(pages)) {
    const p = pages[pid];
    if (p.title && BAD_NAME_RE.test(p.title)) continue;
    const info = p.imageinfo?.[0];
    if (!info) continue;
    const mime: string = info.mime || "";
    const width: number = info.width || 0;
    if (mime !== "image/jpeg" && mime !== "image/png") continue;
    if (width < 400) continue;
    out.push({
      title: p.title,
      url: info.url,
      thumbUrl: info.thumburl || info.url,
      mime,
      width,
    });
  }
  return out;
}

interface PhotoResult {
  species_id: string;
  species_name: string;
  old_photo_url: string | null;
  new_photo_url: string | null;
  source: "wikipedia" | "commons" | null;
  status: "updated" | "not_found";
}

// 한 종에 대한 전체 파이프라인 (Step 1~5)
async function findPhotoForSpecies(
  r: Pick<SpeciesRow, "id" | "scientific_name" | "common_name_en" | "wikipedia_title" | "photo_url">
): Promise<{ url: string | null; source: "wikipedia" | "commons" | null }> {
  const title = r.wikipedia_title || r.common_name_en || r.scientific_name;

  // Step 1~4: Wikipedia 문서 이미지
  if (title) {
    const names = await getPageImages(title);
    await sleep(200);
    for (const name of names) {
      const cand = await resolveImage(name);
      await sleep(200);
      if (!cand) continue;
      const verdict = await judgeAnimal(cand.thumbUrl, cand.mime);
      if (verdict.isAnimal && verdict.confidence >= 0.7) {
        return { url: cand.url, source: "wikipedia" };
      }
    }
  }

  // Step 5: Commons 폴백
  if (r.scientific_name) {
    const cands = await getCommonsCandidates(r.scientific_name);
    await sleep(200);
    for (const cand of cands) {
      const verdict = await judgeAnimal(cand.thumbUrl, cand.mime);
      if (verdict.isAnimal && verdict.confidence >= 0.7) {
        return { url: cand.url, source: "commons" };
      }
    }
  }

  return { url: null, source: null };
}

async function main() {
  const argv = process.argv.slice(2);
  const limitIdx = argv.indexOf("--limit");
  const limit = limitIdx >= 0 ? parseInt(argv[limitIdx + 1], 10) : Infinity;

  const db = getDb();

  // 대상: photo_url IS NULL, 또는 no-photo-species.json 의 needPhotoIds
  const noPhotoPath = path.join(process.cwd(), "data", "no-photo-species.json");
  let idSet: Set<string> | null = null;
  if (fs.existsSync(noPhotoPath)) {
    try {
      const report = JSON.parse(fs.readFileSync(noPhotoPath, "utf-8"));
      if (Array.isArray(report.needPhotoIds)) idSet = new Set(report.needPhotoIds);
      console.log(`no-photo-species.json 발견 — 대상 ${idSet?.size ?? 0} 종`);
    } catch {
      console.log(`no-photo-species.json 파싱 실패 — photo_url IS NULL 로 폴백`);
    }
  }

  let rows: Pick<
    SpeciesRow,
    "id" | "scientific_name" | "common_name_en" | "wikipedia_title" | "photo_url"
  >[];
  if (idSet) {
    const placeholders = Array.from(idSet).map(() => "?").join(",");
    rows = db
      .prepare(
        `SELECT id, scientific_name, common_name_en, wikipedia_title, photo_url
         FROM species WHERE id IN (${placeholders})
         ORDER BY
           CASE category WHEN 'CR' THEN 0 WHEN 'EN' THEN 1 WHEN 'VU' THEN 2
                         WHEN 'EX' THEN 3 WHEN 'EW' THEN 4 ELSE 5 END, id`
      )
      .all(...Array.from(idSet)) as typeof rows;
  } else {
    rows = db
      .prepare(
        `SELECT id, scientific_name, common_name_en, wikipedia_title, photo_url
         FROM species WHERE photo_url IS NULL
         ORDER BY
           CASE category WHEN 'CR' THEN 0 WHEN 'EN' THEN 1 WHEN 'VU' THEN 2
                         WHEN 'EX' THEN 3 WHEN 'EW' THEN 4 ELSE 5 END, id`
      )
      .all() as typeof rows;
  }

  if (Number.isFinite(limit)) rows = rows.slice(0, limit);

  console.log(`사진 탐색 대상: ${rows.length} 종${Number.isFinite(limit) ? ` (--limit ${limit})` : ""}`);

  const results: PhotoResult[] = [];
  let updated = 0;
  let notFound = 0;
  const t0 = Date.now();

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const { url, source } = await findPhotoForSpecies(r);
    if (url) {
      updated++;
      results.push({
        species_id: r.id,
        species_name: r.scientific_name,
        old_photo_url: r.photo_url,
        new_photo_url: url,
        source,
        status: "updated",
      });
    } else {
      notFound++;
      results.push({
        species_id: r.id,
        species_name: r.scientific_name,
        old_photo_url: r.photo_url,
        new_photo_url: null,
        source: null,
        status: "not_found",
      });
    }

    if ((i + 1) % 25 === 0 || i + 1 === rows.length) {
      const elapsed = Math.round((Date.now() - t0) / 1000);
      const rate = (i + 1) / Math.max(elapsed, 1);
      const eta = Math.round((rows.length - i - 1) / Math.max(rate, 0.01) / 60);
      console.log(`  ${i + 1}/${rows.length} updated=${updated} not_found=${notFound} (${elapsed}s, ETA ${eta}분)`);
    }
    await sleep(200);
  }

  const outPath = path.join(process.cwd(), "data", "photo-results.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        updated: new Date().toISOString(),
        total_species: rows.length,
        successfully_updated: updated,
        no_photo_found: notFound,
        results,
      },
      null,
      2
    )
  );

  console.log(`\n✓ 사진 탐색 완료: updated=${updated} not_found=${notFound}`);
  console.log(`  리포트 저장: ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
