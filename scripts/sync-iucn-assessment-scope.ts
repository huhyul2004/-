// IUCN 평가 범위(scope)·평가 대상 학명 확인 (2026-10-03, 적대적 검토 chatbot-4)
//
// sync_iucn_all.py 의 pick_latest() 는 latest 표시만 보고 평가를 골라, 지역 평가(유럽·지중해 등)나 상위 분류군(종 전체)
// 평가가 저장된 종이 있다 — NA·RE 등급(지역 평가에만 있는 등급)이 그 흔적이다. 저장된 iucn_assessment_id 로
// /api/v4/assessment/{id} 를 다시 받아 scopes 와 taxon.scientific_name 을 기록한다. 값을 바꾸지는 않는다 (재동기화는
// docs/decisions-pending.md 항목 12 의 결정 사항).
//
//   tsx --env-file=.env.local scripts/sync-iucn-assessment-scope.ts            # 조회 → 캐시 JSON (DB 무변경)
//   tsx --env-file=.env.local scripts/sync-iucn-assessment-scope.ts --apply    # 캐시 → species 두 컬럼 (백업 후)
//   옵션: --all  점수 행이 있는 종만이 아니라 iucn_assessment_id 가 있는 모든 종
//
// 컬럼: species.iucn_assessment_scope (예: "Global", "Europe") · species.iucn_assessed_taxon (평가 대상 학명)
// 토큰: IUCN_API_TOKEN (.env.local). 값은 출력하지 않는다. 호출 간격 0.5초.
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

const DB_PATH = path.join(process.cwd(), "data", "species.db");
const CACHE = path.join(process.cwd(), "data", "iucn-assessment-scope-fetch.json");
const COLUMNS = { scope: "iucn_assessment_scope", taxon: "iucn_assessed_taxon" } as const;

interface Entry {
  aid: number;
  status: number;
  scopes?: string[];
  taxon?: string | null;
  year?: string | number | null;
  category?: string | null;
  at: string;
}
type Cache = { updated: string; species: Record<string, Entry> };

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const ALL = argv.includes("--all");

function loadCache(): Cache {
  return fs.existsSync(CACHE) ? (JSON.parse(fs.readFileSync(CACHE, "utf-8")) as Cache) : { updated: "", species: {} };
}

function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function fetchAll() {
  const token = process.env.IUCN_API_TOKEN?.trim();
  if (!token) {
    console.error("✗ IUCN_API_TOKEN 없음 — tsx --env-file=.env.local 로 실행");
    process.exit(1);
  }
  const db = new Database(DB_PATH, { readonly: true });
  const rows = db
    .prepare(
      ALL
        ? "SELECT id, iucn_assessment_id AS aid FROM species WHERE iucn_assessment_id IS NOT NULL"
        : `SELECT s.id, s.iucn_assessment_id AS aid FROM species s JOIN tipping_points t ON t.species_id = s.id
           WHERE s.iucn_assessment_id IS NOT NULL`
    )
    .all() as { id: string; aid: number }[];
  db.close();
  const cache = loadCache();
  const todo = rows.filter((r) => cache.species[r.id]?.aid !== r.aid || cache.species[r.id]?.status !== 200);
  console.log(`대상 ${rows.length}종 · 캐시에 있음 ${rows.length - todo.length} · 조회 ${todo.length}`);
  let n = 0;
  for (const r of todo) {
    let entry: Entry | null = null;
    for (let attempt = 0; attempt < 4 && !entry; attempt++) {
      try {
        const res = await fetch(`https://api.iucnredlist.org/api/v4/assessment/${r.aid}`, {
          headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
        });
        if (res.status === 429 || res.status >= 500) {
          await new Promise((s) => setTimeout(s, 5000 * (attempt + 1)));
          continue;
        }
        if (res.status === 401 || res.status === 403) {
          console.error(`✗ 인증 오류 ${res.status} — 중단`);
          fs.writeFileSync(CACHE, JSON.stringify({ ...cache, updated: new Date().toISOString() }, null, 1));
          process.exit(1);
        }
        const d = res.ok ? ((await res.json()) as Record<string, any>) : {};
        entry = {
          aid: r.aid,
          status: res.status,
          scopes: Array.isArray(d.scopes) ? d.scopes.map((s: any) => s?.description?.en ?? String(s?.code)) : undefined,
          taxon: d.taxon?.scientific_name ?? null,
          year: d.year_published ?? null,
          category: d.red_list_category?.code ?? null,
          at: new Date().toISOString(),
        };
      } catch {
        await new Promise((s) => setTimeout(s, 3000 * (attempt + 1)));
      }
    }
    if (entry) cache.species[r.id] = entry;
    if (++n % 50 === 0) {
      fs.writeFileSync(CACHE, JSON.stringify({ ...cache, updated: new Date().toISOString() }, null, 1));
      console.log(`  ${n}/${todo.length}`);
    }
    await new Promise((s) => setTimeout(s, 500));
  }
  fs.writeFileSync(CACHE, JSON.stringify({ ...cache, updated: new Date().toISOString() }, null, 1));
  const vals = Object.values(cache.species);
  const nonGlobal = vals.filter((e) => e.status === 200 && e.scopes && !e.scopes.includes("Global"));
  console.log(`✓ 캐시 ${vals.length}종 · 전 지구 평가가 아닌 기록 ${nonGlobal.length} · HTTP 200 아님 ${vals.filter((e) => e.status !== 200).length}`);
}

function apply() {
  const cache = loadCache();
  const db = new Database(DB_PATH);
  const cols = (db.prepare("PRAGMA table_info(species)").all() as { name: string }[]).map((c) => c.name);
  db.pragma("wal_checkpoint(TRUNCATE)");
  const bak = path.join(process.cwd(), "data", `species.db.bak-${timestamp()}`);
  fs.copyFileSync(DB_PATH, bak);
  console.log(`✓ 백업: ${bak}`);
  const tx = db.transaction(() => {
    if (!cols.includes(COLUMNS.scope)) db.exec(`ALTER TABLE species ADD COLUMN ${COLUMNS.scope} TEXT`);
    if (!cols.includes(COLUMNS.taxon)) db.exec(`ALTER TABLE species ADD COLUMN ${COLUMNS.taxon} TEXT`);
    const upd = db.prepare(`UPDATE species SET ${COLUMNS.scope} = ?, ${COLUMNS.taxon} = ? WHERE id = ? AND iucn_assessment_id = ?`);
    for (const [id, e] of Object.entries(cache.species)) {
      if (e.status !== 200 || !e.scopes) continue;
      upd.run(e.scopes.join("; "), e.taxon ?? null, id, e.aid);
    }
  });
  tx();
  db.pragma("wal_checkpoint(TRUNCATE)");
  const filled = (db.prepare(`SELECT COUNT(*) c FROM species WHERE ${COLUMNS.scope} IS NOT NULL`).get() as { c: number }).c;
  console.log(`✓ [APPLIED] ${COLUMNS.scope} · ${COLUMNS.taxon} — 값 있는 종 ${filled}`);
  db.close();
}

if (APPLY) apply();
else fetchAll().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
