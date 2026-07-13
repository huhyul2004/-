// PHYLACINE 후보종 사진 수집 — iNaturalist taxa API (핫링크, 정확 종 매칭만)
//   data/phylacine/candidates.json 을 읽어 종별 대표 사진 URL·출처를 수집,
//   data/phylacine/inat-photos.json 에 캐시(재개 가능).
//
// 정확성 원칙(프로젝트 정합): iNat 결과 중 학명이 "정확히 일치"하는 taxon 의 default_photo 만 채택.
//   속(genus) 대표 사진 폴백은 다른 종 사진이 붙을 위험이 있어 사용하지 않음 → placeholder.
//
// 사용법: tsx scripts/source-inaturalist-photos.ts [--limit N]
import fs from "fs";
import path from "path";

const DIR = path.join(process.cwd(), "data", "phylacine");
const CAND_PATH = path.join(DIR, "candidates.json");
const CACHE_PATH = path.join(DIR, "inat-photos.json");
const API = "https://api.inaturalist.org/v1/taxa";
const UA = process.env.WIKIPEDIA_USER_AGENT || "LastWatch/1.0 (educational; chanzzzang24@gmail.com)";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function robustJson(url: string): Promise<any | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: ctrl.signal });
      clearTimeout(timer);
      if (res.status === 429 || res.status >= 500) { await sleep(1500 * (attempt + 1)); continue; }
      if (!res.ok) return null;
      return await res.json();
    } catch {
      clearTimeout(timer);
      await sleep(1000 * (attempt + 1));
    }
  }
  return null;
}

interface PhotoRec {
  photo_url: string;
  square_url: string | null;
  photo_source: "inaturalist" | "placeholder";
  photo_attribution: string | null;
  license_code: string | null;
  inat_photo_id: number | null;
}

async function lookup(sci: string): Promise<PhotoRec> {
  const url = `${API}?q=${encodeURIComponent(sci)}&rank=species&per_page=5`;
  const data = await robustJson(url);
  const results: any[] = data?.results ?? [];
  const want = sci.toLowerCase().trim();
  // 정확 종 매칭만
  const exact = results.find((t) => (t.name || "").toLowerCase().trim() === want && t.default_photo?.medium_url);
  if (exact) {
    const p = exact.default_photo;
    return {
      photo_url: p.medium_url,
      square_url: p.square_url ?? null,
      photo_source: "inaturalist",
      photo_attribution: p.attribution ?? null,
      license_code: p.license_code ?? null,
      inat_photo_id: p.id ?? null,
    };
  }
  return { photo_url: "/placeholder/mammal.svg", square_url: null, photo_source: "placeholder", photo_attribution: null, license_code: null, inat_photo_id: null };
}

async function main() {
  const argv = process.argv.slice(2);
  const limIdx = argv.indexOf("--limit");
  const limit = limIdx >= 0 ? parseInt(argv[limIdx + 1], 10) : Infinity;

  if (!fs.existsSync(CAND_PATH)) {
    console.error(`후보 없음: ${CAND_PATH} — 먼저 import-phylacine-curated-species.ts 실행`);
    process.exit(1);
  }
  const candidates: { scientific_name: string }[] = JSON.parse(fs.readFileSync(CAND_PATH, "utf-8"));
  const cache: Record<string, PhotoRec> = fs.existsSync(CACHE_PATH) ? JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8")) : {};

  const todo = candidates.filter((c) => !cache[c.scientific_name]).slice(0, Number.isFinite(limit) ? limit : undefined);
  console.log(`후보 ${candidates.length}종, 캐시됨 ${Object.keys(cache).length}, 이번 대상 ${todo.length}종`);

  let done = 0, ok = 0;
  const t0 = Date.now();
  for (const c of todo) {
    const rec = await lookup(c.scientific_name);
    cache[c.scientific_name] = rec;
    if (rec.photo_source === "inaturalist") ok++;
    done++;
    if (done % 25 === 0 || done === todo.length) {
      fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2)); // 주기적 저장(재개 대비)
      const el = Math.round((Date.now() - t0) / 1000);
      const eta = Math.round((todo.length - done) / Math.max(done / Math.max(el, 1), 0.01) / 60);
      console.log(`  ${done}/${todo.length} 사진확보=${ok} (${el}s, ETA ${eta}분)`);
    }
    await sleep(1100); // ~55 req/min — iNat 정중 사용
  }
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));

  const total = Object.keys(cache).length;
  const withPhoto = Object.values(cache).filter((r) => r.photo_source === "inaturalist").length;
  console.log(`\n✓ 완료. 캐시 ${total}종 | 실사진 ${withPhoto} (${Math.round(withPhoto / total * 100)}%) | placeholder ${total - withPhoto}`);
  console.log(`  캐시: ${CACHE_PATH}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
