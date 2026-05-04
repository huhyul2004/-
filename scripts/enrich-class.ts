// wd-* 종에 대해 Wikidata 에서 분류군(taxonomic class) 정보 일괄 추가
// VALUES 절로 1000개씩 chunk 쿼리. P171* (parent taxon) + P105=Q37517 (class rank)
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
import { koreanizeClass } from "../lib/wikidata";

const SPARQL_URL = "https://query.wikidata.org/sparql";
const UA = "LastWatch/0.1 (educational, contact: huhyul2004@gmail.com)";

async function runSparql(query: string): Promise<{ results: { bindings: Record<string, { value: string }>[] } }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90000);
  try {
    // POST 로 query 보내야 큰 VALUES 절도 가능
    const body = new URLSearchParams({ query, format: "json" });
    const res = await fetch(SPARQL_URL, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        Accept: "application/sparql-results+json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    // 컨트롤 문자 제거 (\x00-\x08, \x0B, \x0C, \x0E-\x1F)
    const cleaned = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
    return JSON.parse(cleaned);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchClassesForChunk(qids: string[]): Promise<Record<string, string>> {
  const valuesClause = qids.map((q) => `wd:${q}`).join(" ");
  // Q37517 = taxonomic rank "class". 영어 라벨만, SAMPLE 로 중복 제거
  const query = `
    SELECT ?species (SAMPLE(?l) AS ?className) WHERE {
      VALUES ?species { ${valuesClause} }
      ?species wdt:P171* ?cls .
      ?cls wdt:P105 wd:Q37517 .
      ?cls rdfs:label ?l .
      FILTER(LANG(?l) = "en")
    } GROUP BY ?species
  `;
  const data = await runSparql(query);
  const out: Record<string, string> = {};
  for (const b of data.results.bindings) {
    const url = b.species?.value ?? "";
    const qid = url.split("/").pop() ?? "";
    if (!out[qid]) out[qid] = b.className?.value ?? "";
  }
  return out;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const db = getDb();
  const targets = db
    .prepare("SELECT id FROM species WHERE id LIKE 'wd-%' AND class_name IS NULL ORDER BY id")
    .all() as { id: string }[];
  console.log(`분류군 미상 wd-* 종: ${targets.length}`);

  const update = db.prepare("UPDATE species SET class_name = ? WHERE id = ?");
  const CHUNK = 100;

  let total = 0;
  let fail = 0;
  for (let i = 0; i < targets.length; i += CHUNK) {
    const slice = targets.slice(i, i + CHUNK);
    // wd-q12345 → Q12345
    const qids = slice.map((r) => r.id.replace(/^wd-/, "").toUpperCase());

    let classes: Record<string, string> = {};
    try {
      classes = await fetchClassesForChunk(qids);
    } catch (e) {
      console.log(`  ${i + 1}-${i + slice.length}: ✗ ${(e as Error).message}`);
      fail += slice.length;
      await sleep(2000);
      continue;
    }

    const tx = db.transaction(() => {
      for (const r of slice) {
        const qid = r.id.replace(/^wd-/, "").toUpperCase();
        const cls = classes[qid];
        if (cls) {
          const ko = koreanizeClass(cls) ?? cls;
          update.run(ko, r.id);
          total++;
        }
      }
    });
    tx();

    if ((i + CHUNK) % 5000 === 0 || i + CHUNK >= targets.length) {
      console.log(`  ${Math.min(i + CHUNK, targets.length)}/${targets.length} ok=${total} fail=${fail}`);
    }
    await sleep(1500); // Wikidata 매너
  }

  console.log(`\n✓ class_name 보강 완료: ${total} 종 / 실패 ${fail}`);
  console.log("\n분포:");
  const dist = db
    .prepare("SELECT class_name, COUNT(*) as n FROM species WHERE class_name IS NOT NULL GROUP BY class_name ORDER BY n DESC LIMIT 20")
    .all() as { class_name: string; n: number }[];
  for (const d of dist) console.log(`  ${d.class_name}: ${d.n.toLocaleString()}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
