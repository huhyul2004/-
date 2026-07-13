// Wikipedia + Commons 에서 종별 사진을 찾아 Claude Vision 으로 검증 (정확성 우선 v2)
//
// 정확성 핵심 — "그 종 자기 문서"인지 리다이렉트로 확인한다:
//   학명(binomial)으로 REST summary 를 요청하면 위키가 종 문서로 redirect 한다.
//   (예: "Phocoena sinus" → "Vaquita", "Panthera tigris" → "Tiger")
//   이 redirect 자체가 "이 학명 = 이 문서"라는 위키의 단언이다.
//   단, 속(genus)·과(family) 등 상위 분류 문서로 redirect 되면(무명종) 거부한다.
// 사진 선택:
//   1) 확인된 종 문서의 대표 썸네일이 실제 사진이면 채택
//   2) 대표 썸네일이 지도/도표/SVG 면(예: 바키타 size 도표), 그 문서의 이미지 목록에서
//      실제 사진을 찾는다 (자기 문서이므로 다른 종 사진이 섞일 위험 없음)
//   3) Commons 폴백은 파일명에 전체 학명이 있는 것만
//   4) 지도/도표/로고가 아닌 실제 생물 사진인지 Claude Vision 으로 최종 확인
// DB 는 건드리지 않고 data/photo-results.json 리포트만 생성
// 사용법: tsx scripts/fetch-wikipedia-photos.ts [--limit N] [--include-svg] [--ids a,b,c]
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
const REST_SUMMARY = "https://en.wikipedia.org/api/rest_v1/page/summary/";

// SVG/로고/지도/아이콘/음원 등 종 사진이 아닌 파일 제외
const BAD_NAME_RE =
  /(logo|icon|_map|distribution|range|locator|_size|silhouette|commons-logo|wiki|\.svg|\.ogg|\.oga|\.wav|\.pdf|\.tif)/i;
// 상위 분류(속/과/목 등) 문서 제목 접미사 — 이런 문서로 redirect 되면 종 문서가 아님
const HIGHER_TAXON_RE = /(idae|inae|oidea|aceae|ales|formes|phyta|mycota|opsida)$/;

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

// 일시적 네트워크 오류(ECONNRESET 등)에 견디는 fetch — 최대 3회 재시도, 8s 타임아웃
async function robustFetch(url: string, init?: RequestInit): Promise<Response | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      if (res.status === 429 || res.status >= 500) {
        await sleep(500 * (attempt + 1));
        continue;
      }
      return res;
    } catch {
      clearTimeout(timer);
      await sleep(400 * (attempt + 1));
    }
  }
  return null;
}

async function apiGet(base: string, params: Record<string, string>): Promise<any> {
  const url = base + "?" + new URLSearchParams(params).toString();
  const res = await robustFetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!res || !res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

// ── 정확성 유틸 ───────────────────────────────────────────────────────
function norm(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
}
function binomial(sci: string): string {
  return sci.trim().split(/\s+/).slice(0, 2).join(" ");
}
// 파일명 등에 전체 학명(속+종소명)이 들어있는지
function nameHasBinomial(candidateTitle: string, sci: string): boolean {
  const bin = norm(binomial(sci));
  if (bin.split(" ").length < 2) return false;
  return norm(candidateTitle).includes(bin);
}
// 학명으로 요청해 도달한 문서가 "종 문서"인지 (속/상위분류 문서면 거부)
function isSpeciesPage(resolvedTitle: string, sci: string): boolean {
  const parts = norm(binomial(sci)).split(" ");
  if (parts.length < 2) return false; // 종소명 없으면 판정 불가
  const nt = norm(resolvedTitle);
  if (!nt) return false;
  if (nt === parts[0]) return false; // 속(genus) 문서로 redirect → 거부
  if (HIGHER_TAXON_RE.test(nt.replace(/ /g, ""))) return false; // 과/목 등 상위분류 → 거부
  return true;
}

interface ImageCandidate {
  title: string;
  url: string;
  thumbUrl: string;
  mime: string;
  width: number;
}

// 학명 → 도달 문서 제목 + 대표 썸네일 (redirect 따라감)
async function getSummary(
  sci: string
): Promise<{ resolvedTitle: string; thumbUrl: string | null; mime: "image/jpeg" | "image/png" } | null> {
  const t = encodeURIComponent(sci.trim().replace(/\s+/g, "_"));
  try {
    const res = await robustFetch(`${REST_SUMMARY}${t}?redirect=true`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    if (!res || !res.ok) return null;
    const data: any = await res.json();
    if (data.type === "disambiguation") return null;
    const src: string | undefined = data.thumbnail?.source ?? data.originalimage?.source;
    const mime: "image/jpeg" | "image/png" = src && /\.png(\?|$)/i.test(src) ? "image/png" : "image/jpeg";
    return { resolvedTitle: data.title ?? sci, thumbUrl: src ?? null, mime };
  } catch {
    return null;
  }
}

// 확인된 종 문서의 이미지 파일명 목록 (지도/SVG/로고 제외)
async function getPageImages(title: string): Promise<string[]> {
  const data = await apiGet(WIKI_API, {
    action: "query",
    titles: title,
    prop: "images",
    imlimit: "20",
    format: "json",
    redirects: "1",
  });
  const pages = data?.query?.pages ?? {};
  const names: string[] = [];
  for (const pid of Object.keys(pages)) {
    for (const im of pages[pid].images ?? []) {
      if (im.title && !BAD_NAME_RE.test(im.title)) names.push(im.title);
    }
  }
  return names.slice(0, 12);
}

// 파일명 → 실제 URL/mime/size (jpeg/png & width>=400 만)
async function resolveImage(fileTitle: string): Promise<ImageCandidate | null> {
  const data = await apiGet(WIKI_API, {
    action: "query",
    titles: fileTitle,
    prop: "imageinfo",
    iiprop: "url|mime|size|mediatype",
    iiurlwidth: "500",
    format: "json",
  });
  const pages = data?.query?.pages ?? {};
  for (const pid of Object.keys(pages)) {
    const info = pages[pid].imageinfo?.[0];
    if (!info) continue;
    const mediatype: string = (info.mediatype || "").toUpperCase();
    if (mediatype && mediatype !== "BITMAP") continue; // 사진만 (DRAWING 제외)
    const mime: string = info.mime || "";
    const width: number = info.width || 0;
    if (mime !== "image/jpeg" && mime !== "image/png") continue;
    if (width < 400) continue;
    return { title: fileTitle, url: info.thumburl || info.url, thumbUrl: info.thumburl || info.url, mime, width };
  }
  return null;
}

// 썸네일 바이트를 UA 붙여 직접 다운로드 (Wikimedia 가 Anthropic 페처를 UA 없이 차단하므로 base64 전송)
async function downloadThumb(
  thumbUrl: string,
  mime: string
): Promise<{ data: string; media_type: "image/jpeg" | "image/png" } | null> {
  try {
    const res = await robustFetch(thumbUrl, { headers: { "User-Agent": UA } });
    if (!res || !res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const media_type = mime === "image/png" ? "image/png" : "image/jpeg";
    return { data: buf.toString("base64"), media_type };
  } catch {
    return null;
  }
}

// 지도/도표/로고가 아닌 실제 생물(동물·식물) 사진인지 {isPhoto, confidence}
async function judgePhoto(thumbUrl: string, mime: string): Promise<{ isPhoto: boolean; confidence: number }> {
  const client = getAnthropic();
  const img = await downloadThumb(thumbUrl, mime);
  if (!img) return { isPhoto: false, confidence: 0 };
  try {
    const resp = await client.messages.create({
      model: VISION_MODEL,
      max_tokens: 80,
      system:
        'You verify images for a wildlife encyclopedia. Decide if the image is a REAL PHOTOGRAPH of a living organism (an animal or a plant — alive, specimen, or in habitat). NOT acceptable: maps, range/distribution maps, size-comparison charts, diagrams, phylogenetic trees, drawings or illustrations, logos, icons, screenshots, or plain text. Respond ONLY with strict JSON: {"isPhoto": boolean, "confidence": number between 0 and 1}. No prose.',
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: img.media_type, data: img.data } },
            { type: "text", text: "Is this a real photograph of a living organism? Return JSON only." },
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
    if (!m) return { isPhoto: false, confidence: 0 };
    const parsed = JSON.parse(m[0]);
    return {
      isPhoto: !!parsed.isPhoto,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
    };
  } catch (e) {
    console.log(`    judge error: ${(e as Error).message.slice(0, 80)}`);
    return { isPhoto: false, confidence: 0 };
  }
}

// Commons 폴백 — 학명 검색 (파일명에 전체 학명 있는 것만 나중에 채택)
async function getCommonsCandidates(scientificName: string): Promise<ImageCandidate[]> {
  const data = await apiGet(COMMONS_API, {
    action: "query",
    generator: "search",
    gsrsearch: scientificName,
    gsrnamespace: "6",
    gsrlimit: "8",
    prop: "imageinfo",
    iiprop: "url|mime|size",
    iiurlwidth: "500",
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
    out.push({ title: p.title, url: info.thumburl || info.url, thumbUrl: info.thumburl || info.url, mime, width });
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

async function findPhotoForSpecies(
  r: Pick<SpeciesRow, "id" | "scientific_name" | "photo_url">
): Promise<{ url: string | null; source: "wikipedia" | "commons" | null }> {
  const sci = (r.scientific_name || "").trim();
  if (!sci) return { url: null, source: null };

  // 1) 학명 → 종 문서 확인 (redirect 기반)
  const sum = await getSummary(sci);
  await sleep(120);
  if (sum && isSpeciesPage(sum.resolvedTitle, sci)) {
    // 1a) 대표 썸네일이 실제 사진 + 파일명에 학명이 있으면 채택
    //     (멸종종 등은 taxobox 에 친척 사진을 쓰므로 학명 파일명으로 오배정 차단.
    //      호랑이=Bengal_tiger_(Panthera_tigris...)처럼 학명 포함 파일만 통과)
    if (sum.thumbUrl && !BAD_NAME_RE.test(sum.thumbUrl) && nameHasBinomial(sum.thumbUrl, sci)) {
      const v = await judgePhoto(sum.thumbUrl, sum.mime);
      await sleep(120);
      if (v.isPhoto && v.confidence >= 0.7) return { url: sum.thumbUrl, source: "wikipedia" };
    }
    // 1b) 대표 썸네일이 지도/SVG 등이면 → 자기 문서 이미지 중 "파일명에 학명이 든 것만" 채택
    //     (사진 없는 종은 문서에 친척 종 사진이 실리므로, 학명 파일명으로 오배정 차단)
    const names = (await getPageImages(sum.resolvedTitle)).filter((n) => nameHasBinomial(n, sci));
    await sleep(120);
    for (const name of names) {
      const cand = await resolveImage(name);
      await sleep(120);
      if (!cand) continue;
      const v = await judgePhoto(cand.thumbUrl, cand.mime);
      await sleep(120);
      if (v.isPhoto && v.confidence >= 0.7) return { url: cand.url, source: "wikipedia" };
    }
  }

  // 2) Commons 폴백 — 파일명에 전체 학명이 있는 것만
  const cands = await getCommonsCandidates(sci);
  await sleep(120);
  for (const cand of cands) {
    if (!nameHasBinomial(cand.title, sci)) continue;
    const v = await judgePhoto(cand.thumbUrl, cand.mime);
    await sleep(120);
    if (v.isPhoto && v.confidence >= 0.7) return { url: cand.url, source: "commons" };
  }

  return { url: null, source: null };
}

async function main() {
  const argv = process.argv.slice(2);
  const limitIdx = argv.indexOf("--limit");
  const limit = limitIdx >= 0 ? parseInt(argv[limitIdx + 1], 10) : Infinity;
  const idsIdx = argv.indexOf("--ids");
  const explicitIds = idsIdx >= 0 ? argv[idsIdx + 1].split(",").map((s) => s.trim()).filter(Boolean) : null;
  const includeSvg = argv.includes("--include-svg"); // 기존 SVG 다이어그램 사진도 재탐색 대상에 포함

  const db = getDb();

  let rows: Pick<SpeciesRow, "id" | "scientific_name" | "photo_url">[];
  if (explicitIds) {
    const ph = explicitIds.map(() => "?").join(",");
    rows = db
      .prepare(`SELECT id, scientific_name, photo_url FROM species WHERE id IN (${ph})`)
      .all(...explicitIds) as typeof rows;
  } else {
    // 대상: 사진 없음(NULL) + (옵션) 기존 SVG 다이어그램 사진
    const where = includeSvg
      ? "photo_url IS NULL OR photo_url LIKE '%.svg%'"
      : "photo_url IS NULL";
    rows = db
      .prepare(
        `SELECT id, scientific_name, photo_url FROM species WHERE (${where})
         AND scientific_name IS NOT NULL AND TRIM(scientific_name) <> ''
         ORDER BY
           CASE category WHEN 'CR' THEN 0 WHEN 'EN' THEN 1 WHEN 'VU' THEN 2
                         WHEN 'EX' THEN 3 WHEN 'EW' THEN 4 ELSE 5 END, id`
      )
      .all() as typeof rows;
  }

  if (Number.isFinite(limit)) rows = rows.slice(0, limit);

  console.log(`사진 탐색 대상: ${rows.length} 종${Number.isFinite(limit) ? ` (--limit ${limit})` : ""}${includeSvg ? " (+SVG 재탐색)" : ""}`);

  // 동시성 워커 풀 — 위키에 정중하되(적정 동시요청) 처리량 확보
  const concIdx = argv.indexOf("--concurrency");
  const CONCURRENCY = concIdx >= 0 ? Math.max(1, parseInt(argv[concIdx + 1], 10)) : 6;

  const results: PhotoResult[] = new Array(rows.length);
  let updated = 0;
  let notFound = 0;
  let done = 0;
  let next = 0;
  const t0 = Date.now();

  async function worker() {
    while (true) {
      const i = next++;
      if (i >= rows.length) return;
      const r = rows[i];
      let url: string | null = null;
      let source: "wikipedia" | "commons" | null = null;
      try {
        ({ url, source } = await findPhotoForSpecies(r));
      } catch (e) {
        console.log(`    [skip] ${r.scientific_name}: ${(e as Error).message.slice(0, 60)}`);
      }
      results[i] = {
        species_id: r.id,
        species_name: r.scientific_name,
        old_photo_url: r.photo_url,
        new_photo_url: url,
        source,
        status: url ? "updated" : "not_found",
      };
      if (url) updated++;
      else notFound++;
      done++;
      if (done % 50 === 0 || done === rows.length) {
        const elapsed = Math.round((Date.now() - t0) / 1000);
        const rate = done / Math.max(elapsed, 1);
        const eta = Math.round((rows.length - done) / Math.max(rate, 0.01) / 60);
        console.log(`  ${done}/${rows.length} updated=${updated} not_found=${notFound} (${elapsed}s, ETA ${eta}분)`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const outPath = path.join(process.cwd(), "data", "photo-results.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      { updated: new Date().toISOString(), total_species: rows.length, successfully_updated: updated, no_photo_found: notFound, results },
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
