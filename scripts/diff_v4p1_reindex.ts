// 재계산 전후 비교 — curated 4,230 한정 변화 분석 + 이상 종 스캔.
// 스냅샷(pre_v4p1_reindex) vs 현재 DB.
// usage: tsx scripts/diff_v4p1_reindex.ts
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

const DB = path.join(process.cwd(), "data", "species.db");
const SNAP = path.join(process.cwd(), "data", "snapshots", "pre_v4p1_reindex_2026-07-23.json");

const snap = JSON.parse(fs.readFileSync(SNAP, "utf8"));
const before = new Map<string, { consensus: number; tier: string }>();
for (const s of snap.species) before.set(s.species_id, { consensus: s.consensus_score, tier: s.intervention_tier });

const db = new Database(DB, { readonly: true });
db.pragma("busy_timeout = 8000");
const cur = db.prepare(`
  SELECT s.id, s.scientific_name, s.common_name_ko, s.category,
         tp.consensus_score, tp.intervention_tier
  FROM tipping_points tp JOIN species s ON s.id=tp.species_id
  WHERE s.is_curated=1
`).all() as {
  id: string; scientific_name: string; common_name_ko: string | null; category: string;
  consensus_score: number; intervention_tier: string;
}[];

let unchanged = 0, up = 0, down = 0, created = 0;
const tierChanges: Record<string, number> = {};
const t2t3: { name: string; d: number; from: string; to: string }[] = [];
const extremes: string[] = [];
const TIER_ORD: Record<string, number> = { EX: -1, T0: 0, T1: 1, T2: 2, T3: 3, T4: 4 };

for (const r of cur) {
  const b = before.get(r.id);
  if (!b) { created++; continue; }
  const d = Math.round((r.consensus_score - b.consensus) * 100) / 100;
  if (Math.abs(d) < 0.1) unchanged++;
  else if (d >= 0.1) up++;
  else down++;

  if (b.tier !== r.intervention_tier) {
    const key = `${b.tier}→${r.intervention_tier}`;
    tierChanges[key] = (tierChanges[key] || 0) + 1;
    if (key === "T2→T3") t2t3.push({ name: r.common_name_ko || r.scientific_name, d, from: b.tier, to: r.intervention_tier });
    // 이상: tier 2단계 이상 점프 또는 consensus 극단 변화
    const jump = Math.abs((TIER_ORD[r.intervention_tier] ?? 0) - (TIER_ORD[b.tier] ?? 0));
    if (jump >= 3 || Math.abs(d) >= 50) {
      extremes.push(`${r.scientific_name} (${r.category}): ${b.tier}(${b.consensus}) → ${r.intervention_tier}(${r.consensus_score})  Δ${d}`);
    }
  } else if (Math.abs(d) >= 50) {
    extremes.push(`${r.scientific_name} (${r.category}): tier동일 but consensus ${b.consensus}→${r.consensus_score} Δ${d}`);
  }
}

console.log("=== (d) Curated 4,230 변화 분류 ===");
console.log(`  대상 curated 종        : ${cur.length}`);
console.log(`  값 변화 없음 (|Δ|<0.1) : ${unchanged}`);
console.log(`  상승 (Δ≥0.1)          : ${up}`);
console.log(`  하락 (Δ≤-0.1)         : ${down}`);
console.log(`  신규 생성 (스냅샷 없음): ${created}  (phylacine 등 tipping_points 신규)`);
console.log(`\n  Tier 변경 내역:`);
for (const [k, v] of Object.entries(tierChanges).sort((a, b) => b[1] - a[1])) console.log(`     ${k}: ${v}`);

console.log(`\n=== T2→T3 상승 상위 10 (Δ 큰 순) ===`);
t2t3.sort((a, b) => b.d - a.d);
for (const t of t2t3.slice(0, 10)) console.log(`  ${t.name}: Δ+${t.d}`);
console.log(`  (T2→T3 총 ${t2t3.length}종)`);

console.log(`\n=== (e) 이상 종 스캔 (tier 3단계+ 점프 또는 |Δconsensus|≥50) ===`);
if (extremes.length === 0) console.log("  이상 종 0건");
else extremes.forEach((e) => console.log("  ⚠ " + e));

// 시베리아호랑이 특별 확인
const tiger = cur.find((r) => r.scientific_name === "Panthera tigris altaica");
const tigerB = tiger ? before.get(tiger.id) : null;
console.log(`\n=== 시베리아호랑이 확인 ===`);
if (tiger && tigerB) console.log(`  ${tigerB.tier}(${tigerB.consensus}) → ${tiger.intervention_tier}(${tiger.consensus_score})  ${tigerB.tier !== tiger.intervention_tier ? "★ tier 변경 확인" : ""}`);

db.close();
