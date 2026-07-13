// PHYLACINE 1.2 포유류 큐레이션 종 임포트
//   1) PHYLACINE Trait_data.csv 다운로드/캐시
//   2) 학명 binomial 정규화로 기존 species 와 중복 제거
//   3) EP(선사시대 절멸) 상태 제외(category CHECK 제약 회피), 등급 우선순위 정렬, ~3,200 캡
//   4) 후보 목록을 data/phylacine/candidates.json 로 저장 (iNat 사진 수집용)
//   5) --apply 시: data/phylacine/inat-photos.json(사진 캐시) 조인 후 신규 행 INSERT (기존 행 UPDATE 절대 안 함)
//
// 사용법:
//   tsx scripts/import-phylacine-curated-species.ts             # 후보 산출 + dry-run (INSERT 안 함)
//   tsx scripts/import-phylacine-curated-species.ts --apply     # 실제 INSERT (사진 캐시 있으면 조인)
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

const DB_PATH = path.join(process.cwd(), "data", "species.db");
const DIR = path.join(process.cwd(), "data", "phylacine");
const CSV_PATH = path.join(DIR, "Trait_data.csv");
const CAND_PATH = path.join(DIR, "candidates.json");
const PHOTO_CACHE = path.join(DIR, "inat-photos.json");
const CSV_URL =
  "https://raw.githubusercontent.com/MegaPast2Future/PHYLACINE_1.2/master/Data/Traits/Trait_data.csv";

const TARGET_CAP = 3200;
const ALLOWED_CATEGORY = new Set(["CR", "EN", "VU", "NT", "LC", "EX", "EW", "DD", "NE"]); // species CHECK 제약과 동일
const STATUS_PRIORITY: Record<string, number> = { EX: 0, EW: 1, CR: 2, EN: 3, VU: 4, NT: 5, LC: 6, DD: 9 };

const UA = process.env.WIKIPEDIA_USER_AGENT || "LastWatch/1.0 (chanzzzang24@gmail.com)";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 최소 CSV 파서 (따옴표 필드 지원)
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "", row: string[] = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift() ?? [];
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

function binomialKey(name: string): string {
  return name.toLowerCase().replace(/_/g, " ").trim().split(/\s+/).slice(0, 2).join(" ");
}
function slug(name: string): string {
  return name.toLowerCase().replace(/_/g, " ").trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function lifeHabit(r: Record<string, string>): string | null {
  if (r["Marine"] === "1") return "Marine";
  if (r["Freshwater"] === "1") return "Freshwater";
  if (r["Aerial"] === "1") return "Aerial";
  if (r["Terrestrial"] === "1") return "Terrestrial";
  return null;
}

async function downloadCsv(): Promise<void> {
  if (fs.existsSync(CSV_PATH)) {
    console.log(`PHYLACINE CSV 캐시 사용: ${CSV_PATH}`);
    return;
  }
  fs.mkdirSync(DIR, { recursive: true });
  console.log(`PHYLACINE CSV 다운로드 중…`);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(CSV_URL, { headers: { "User-Agent": UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fs.writeFileSync(CSV_PATH, await res.text());
      console.log(`✓ 저장: ${CSV_PATH}`);
      return;
    } catch (e) {
      console.log(`  재시도 ${attempt + 1}: ${(e as Error).message}`);
      await sleep(1000 * (attempt + 1));
    }
  }
  throw new Error("PHYLACINE CSV 다운로드 실패");
}

interface Candidate {
  id: string;
  scientific_name: string;
  genus: string;
  order_name: string;
  family_name: string;
  mass_g: number | null;
  category: string;
  life_habit: string | null;
}

async function main() {
  const APPLY = process.argv.includes("--apply");
  fs.mkdirSync(DIR, { recursive: true });
  await downloadCsv();

  const rows = parseCsv(fs.readFileSync(CSV_PATH, "utf-8"));
  console.log(`PHYLACINE 행: ${rows.length}`);

  const db = new Database(DB_PATH);
  db.pragma("foreign_keys = ON");

  // 기존 학명 binomial 키 집합 (중복 제거용)
  const existingKeys = new Set(
    (db.prepare("SELECT scientific_name FROM species WHERE scientific_name IS NOT NULL").all() as { scientific_name: string }[])
      .map((r) => binomialKey(r.scientific_name))
  );
  const existingIds = new Set((db.prepare("SELECT id FROM species").all() as { id: string }[]).map((r) => r.id));

  // 후보 생성
  let excludedDup = 0, excludedStatus = 0, excludedNoName = 0;
  const seenNew = new Set<string>();
  const candidates: Candidate[] = [];
  for (const r of rows) {
    const bin = (r["Binomial.1.2"] || "").trim();
    if (!bin) { excludedNoName++; continue; }
    const sci = bin.replace(/_/g, " ");
    const key = binomialKey(bin);
    const status = (r["IUCN.Status.1.2"] || "").trim().toUpperCase();
    if (!ALLOWED_CATEGORY.has(status)) { excludedStatus++; continue; } // EP·공백 등 제외
    if (existingKeys.has(key) || seenNew.has(key)) { excludedDup++; continue; }
    seenNew.add(key);
    let id = "phy-" + slug(bin);
    if (existingIds.has(id)) id = id + "-phy"; // 극히 드문 충돌 대비
    const massNum = Number(r["Mass.g"]);
    candidates.push({
      id,
      scientific_name: sci,
      genus: (r["Genus.1.2"] || sci.split(" ")[0] || "").trim(),
      order_name: (r["Order.1.2"] || "").trim(),
      family_name: (r["Family.1.2"] || "").trim(),
      mass_g: Number.isFinite(massNum) ? massNum : null,
      category: status,
      life_habit: lifeHabit(r),
    });
  }

  // 등급 우선순위 → 학명순 정렬, 캡
  candidates.sort((a, b) => {
    const pa = STATUS_PRIORITY[a.category] ?? 8, pb = STATUS_PRIORITY[b.category] ?? 8;
    return pa - pb || a.scientific_name.localeCompare(b.scientific_name);
  });
  const capped = candidates.slice(0, TARGET_CAP);

  fs.writeFileSync(CAND_PATH, JSON.stringify(capped, null, 2));
  console.log(`\n제외: 중복 ${excludedDup}, 등급부적합(EP/공백) ${excludedStatus}, 학명없음 ${excludedNoName}`);
  console.log(`후보 총 ${candidates.length} → 캡 적용 ${capped.length}종  → ${CAND_PATH}`);
  const byCat: Record<string, number> = {};
  for (const c of capped) byCat[c.category] = (byCat[c.category] || 0) + 1;
  console.log(`후보 등급 분포:`, JSON.stringify(byCat));
  console.log(`샘플 5:`, capped.slice(0, 5).map((c) => `${c.scientific_name}(${c.category})`).join(", "));

  if (!APPLY) {
    console.log(`\n[DRY RUN] INSERT 안 함. 사진 수집: tsx scripts/source-inaturalist-photos.ts`);
    console.log(`  그 후 임포트: tsx scripts/import-phylacine-curated-species.ts --apply`);
    db.close();
    return;
  }

  // --apply: 사진 캐시 조인
  let photos: Record<string, any> = {};
  if (fs.existsSync(PHOTO_CACHE)) {
    photos = JSON.parse(fs.readFileSync(PHOTO_CACHE, "utf-8"));
    console.log(`\n사진 캐시 로드: ${Object.keys(photos).length}종`);
  } else {
    console.log(`\n⚠️ 사진 캐시 없음 — placeholder 로 임포트. (권장: 먼저 source-inaturalist-photos.ts 실행)`);
  }

  // 백업
  db.pragma("wal_checkpoint(TRUNCATE)");
  const bak = path.join(process.cwd(), "data", `species.db.bak-import-${Date.now()}`);
  fs.copyFileSync(DB_PATH, bak);
  console.log(`✓ 백업: ${bak}`);

  const totalBefore = (db.prepare("SELECT COUNT(*) c FROM species").get() as { c: number }).c;

  const insert = db.prepare(`
    INSERT INTO species (
      id, scientific_name, common_name_en, common_name_ko, category, class_name,
      family, region, population_trend, mature_individuals, summary_ko,
      photo_url, wikipedia_title, extinction_year, extinction_cause, year_published,
      is_curated, data_source, photo_source, photo_attribution, order_name, family_name, mass_g, life_habit
    ) VALUES (
      @id, @scientific_name, NULL, NULL, @category, '포유류',
      NULL, NULL, NULL, NULL, NULL,
      @photo_url, NULL, NULL, NULL, NULL,
      1, 'phylacine_curated', @photo_source, @photo_attribution, @order_name, @family_name, @mass_g, @life_habit
    )
  `);

  const tx = db.transaction((items: Candidate[]) => {
    let n = 0, withPhoto = 0;
    for (const c of items) {
      const p = photos[c.scientific_name];
      const photo_url = p?.photo_url ?? "/placeholder/mammal.svg";
      const photo_source = p?.photo_source ?? "placeholder";
      if (photo_source === "inaturalist") withPhoto++;
      insert.run({
        id: c.id,
        scientific_name: c.scientific_name,
        category: c.category,
        photo_url,
        photo_source,
        photo_attribution: p?.photo_attribution ?? null,
        order_name: c.order_name || null,
        family_name: c.family_name || null,
        mass_g: c.mass_g,
        life_habit: c.life_habit,
      });
      n++;
    }
    return { n, withPhoto };
  });
  const { n, withPhoto } = tx(capped);
  db.pragma("wal_checkpoint(TRUNCATE)");

  const totalAfter = (db.prepare("SELECT COUNT(*) c FROM species").get() as { c: number }).c;
  const curated = (db.prepare("SELECT COUNT(*) c FROM species WHERE is_curated=1").get() as { c: number }).c;
  console.log(`\n✓ [APPLIED] ${n}종 INSERT (실사진 ${withPhoto}, placeholder ${n - withPhoto})`);
  console.log(`  총 종: ${totalBefore} → ${totalAfter} (델타 ${totalAfter - totalBefore}, 삽입수와 일치해야 정상)`);
  console.log(`  is_curated=1 총: ${curated} (원본 1030 + phylacine ${n} = ${1030 + n} 예상)`);
  const bySource = db.prepare("SELECT data_source, COUNT(*) c FROM species GROUP BY data_source").all();
  console.log(`  data_source 분포:`, JSON.stringify(bySource));
  db.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
