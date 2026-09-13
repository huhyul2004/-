// A 감소율 기반 r 추정 검토 — 조사/계산 전용.
// lib/tipping-point.ts 와 DB 는 읽기만 한다. 쓰기는 docs/ 의 md 파일 하나뿐.
//
// 실행: ./node_modules/.bin/tsx research/analyze_v5_r_estimation.ts

import fs from "fs";
import Database from "better-sqlite3";
import { evaluateTippingPoint as ORIGINAL } from "../lib/tipping-point";
import { evaluateTippingPoint as REPLICA } from "./_v5_replica";

const db = new Database("data/species.db", { readonly: true });

import { type Row, type Conv, convert } from "./_r_common";

// ===== 데이터 로드 =====
const all = db.prepare("SELECT * FROM species").all() as Row[];
const hasPop = (s: Row) =>
  (s.mature_individuals != null && s.mature_individuals > 0) ||
  (s.iucn_population_size != null && s.iucn_population_size > 0);
const notExt = (s: Row) => s.category !== "EX" && s.category !== "EW";

const noPopCohort = all.filter((s) => !hasPop(s) && notExt(s) && s.iucn_synced_at != null);
const scored = all.filter((s) => hasPop(s) && notExt(s));

const convNoPop = noPopCohort.map(convert).filter((c) => c.declinePct != null);
const set111 = convNoPop.filter((c) => c.gl != null && c.fail === null);
const failed111 = convNoPop.filter((c) => c.fail !== null);

const convScored = scored.map(convert);
const affected = convScored.filter((c) => c.fail === null);

const L: string[] = [];
const p = (s = "") => L.push(s);
const f = (x: number | null, n = 4) => (x == null ? "—" : x.toFixed(n));

p("# A 감소율 기반 r 추정 — 계산 결과");
p();
p("작성 2026-08-26. 재현: `./node_modules/.bin/tsx research/analyze_v5_r_estimation.ts`");
p("`lib/tipping-point.ts` 와 `data/species.db` 는 읽기만 했다.");
p();
p("## 0. 정의");
p();
p("| 항목 | 값 |");
p("|---|---|");
p("| 감소율 d | criteria 의 A 하위번호 + 등급 → IUCN 3.1 임계. 복수면 최솟값 |");
p("| 세대수 | 3 (IUCN Criterion A) |");
p("| r_user | ln(1 − d) ÷ (3 × 세대시간) |");
p("| r_iucn | ln(1 − d) ÷ max(10, 3 × 세대시간) — IUCN 은 '10년 또는 3세대 중 긴 쪽' |");
p("| r_now | 현재 상수 (Decreasing −0.06 / Stable 0 / Increasing +0.06 / 무정보 −0.02) |");
p();
p("A 임계 (감소율 하한 %):");
p();
p("| 하위번호 | CR | EN | VU |");
p("|---|---|---|---|");
p("| A1 | 90 | 70 | 50 |");
p("| A2·A3·A4 | 80 | 50 | 30 |");
p();

p("## 1. 개체수 없는 코호트의 r 환산");
p();
p("| 구분 | 종 수 |");
p("|---|---:|");
p(`| A 감소율 추출 가능 | ${convNoPop.length} |`);
p(`| 그중 세대시간 보유 → 환산 성공 | **${set111.length}** |`);
p(`| 환산 실패 | ${failed111.length} |`);
p();
if (failed111.length) {
  const byReason = new Map<string, number>();
  for (const c of failed111) {
    const key = c.fail!.replace(/\(.*\)/, "(…)");
    byReason.set(key, (byReason.get(key) ?? 0) + 1);
  }
  p("실패 사유:");
  p();
  p("| 사유 | 종 수 |");
  p("|---|---:|");
  for (const [k, v] of Array.from(byReason.entries()).sort((a, b) => b[1] - a[1])) p(`| ${k} | ${v} |`);
  p();
  p("실패 종 전체:");
  p();
  p("| 종 | 등급 | criteria | 감소율 | 세대시간 | 사유 |");
  p("|---|---|---|---:|---:|---|");
  for (const c of failed111)
    p(`| ${c.name} | ${c.cat} | \`${c.criteria}\` | ${c.declinePct ?? "—"}% | ${c.gl ?? "—"} | ${c.fail} |`);
  p();
}

const sorted111 = [...set111].sort(
  (a, b) => Math.abs(b.rUser! - b.rNow) - Math.abs(a.rUser! - a.rNow));
p(`### 1-1. r 비교 — 차이 큰 순 (${set111.length}종 전체)`);
p();
p("| # | 종 | 등급 | criteria | d(%) | 세대시간 | r_now | r_user | Δ(user−now) | r_iucn |");
p("|---:|---|---|---|---:|---:|---:|---:|---:|---:|");
sorted111.forEach((c, i) => {
  p(`| ${i + 1} | ${c.name} | ${c.cat} | \`${c.criteria}\` | ${c.declinePct} | ${c.gl} | ` +
    `${f(c.rNow)} | ${f(c.rUser)} | ${f(c.rUser! - c.rNow)} | ${f(c.rIucn)} |`);
});
p();
{
  const ru = set111.map((c) => c.rUser!);
  const ri = set111.map((c) => c.rIucn!);
  const dn = set111.map((c) => c.rUser! - c.rNow);
  const stat = (a: number[]) => {
    const s = [...a].sort((x, y) => x - y);
    return { min: s[0], p50: s[Math.floor(s.length / 2)], max: s[s.length - 1],
             mean: a.reduce((x, y) => x + y, 0) / a.length };
  };
  const su = stat(ru), si = stat(ri), sd = stat(dn);
  p("### 1-2. 분포 요약");
  p();
  p("| | 최솟값 | 중앙값 | 평균 | 최댓값 |");
  p("|---|---:|---:|---:|---:|");
  p(`| r_user | ${f(su.min)} | ${f(su.p50)} | ${f(su.mean)} | ${f(su.max)} |`);
  p(`| r_iucn | ${f(si.min)} | ${f(si.p50)} | ${f(si.mean)} | ${f(si.max)} |`);
  p(`| Δ(user−now) | ${f(sd.min)} | ${f(sd.p50)} | ${f(sd.mean)} | ${f(sd.max)} |`);
  p();
  const moreNeg = dn.filter((x) => x < 0).length;
  p("| 방향 | 종 수 |");
  p("|---|---:|");
  p(`| r_user 가 r_now 보다 더 음수 (감소 강함) | ${moreNeg} |`);
  p(`| r_user 가 r_now 보다 덜 음수 | ${dn.length - moreNeg} |`);
  p();
}

// ===== 2. 복제본 검증 =====
p("## 2. 복제본 검증 (재계산 전제)");
p();
const SEEDLESS = { n_sim: 1500, T: 100 };
let maxDiff = 0, nulls = 0, compared = 0;
const mismatches: string[] = [];
for (const s of scored) {
  const a = ORIGINAL(s, SEEDLESS);
  const b = REPLICA(s, SEEDLESS);
  if (a == null || b == null) { if (a !== b) mismatches.push(`${s.id}: null 불일치`); nulls++; continue; }
  compared++;
  const d = Math.abs(a.consensus_score - b.consensus_score);
  if (d > maxDiff) maxDiff = d;
  if (d >= 1e-9) mismatches.push(`${s.id}: ${a.consensus_score} vs ${b.consensus_score}`);
}
p("| 항목 | 값 |");
p("|---|---:|");
p(`| 비교한 종 | ${compared} |`);
p(`| null (점수 없음) | ${nulls} |`);
p(`| consensus_score 최대 절대오차 | ${maxDiff.toExponential(3)} |`);
p(`| 1e-9 이상 불일치 | ${mismatches.length} |`);
p();
p(mismatches.length === 0
  ? "복제본은 rOverride 미지정 시 원본과 동일한 점수를 낸다 (최대오차 " + maxDiff.toExponential(3) + " < 1e-9)."
  : "불일치: " + mismatches.slice(0, 10).join(" / "));
p();

// ===== 3. 점수 재계산 =====
p("## 3. 새 r 로 점수 재계산");
p();
p("| 항목 | 종 수 |");
p("|---|---:|");
p(`| 점수가 나오는 종 (개체수 보유) | ${scored.length} |`);
p(`| 그중 A 감소율 + 세대시간 보유 → **실제로 점수가 바뀌는 종** | **${affected.length}** |`);
p(`| 1절의 환산 성공 111종 중 점수가 나오는 종 | ${set111.filter((c) => scored.some((s) => s.id === c.id)).length} |`);
p();

interface Recalc {
  c: Conv; before: number; after: number; dScore: number;
  tBefore: string; tAfter: string;
}
const recalcs: Recalc[] = [];
for (const c of affected) {
  const s = all.find((x) => x.id === c.id)!;
  const a = REPLICA(s, SEEDLESS);
  const b = REPLICA(s, { ...SEEDLESS, rOverride: c.rUser! });
  if (!a || !b) continue;
  recalcs.push({
    c, before: a.consensus_score, after: b.consensus_score,
    dScore: b.consensus_score - a.consensus_score,
    tBefore: a.intervention_tier, tAfter: b.intervention_tier,
  });
}
const tierChanged = recalcs.filter((r) => r.tBefore !== r.tAfter);
const up = tierChanged.filter((r) => r.tAfter > r.tBefore);
const down = tierChanged.filter((r) => r.tAfter < r.tBefore);
p("| 항목 | 값 |");
p("|---|---:|");
p(`| 재계산한 종 | ${recalcs.length} |`);
p(`| 점수가 변한 종 | ${recalcs.filter((r) => Math.abs(r.dScore) > 1e-9).length} |`);
p(`| **티어가 바뀐 종** | **${tierChanged.length}** |`);
p(`| 티어 상승 (위험↑) | ${up.length} |`);
p(`| 티어 하강 (위험↓) | ${down.length} |`);
{
  const ds = recalcs.map((r) => r.dScore);
  const s2 = [...ds].sort((x, y) => x - y);
  p(`| Δ점수 최솟값 | ${f(s2[0], 2)} |`);
  p(`| Δ점수 중앙값 | ${f(s2[Math.floor(s2.length / 2)], 2)} |`);
  p(`| Δ점수 평균 | ${f(ds.reduce((a2, b2) => a2 + b2, 0) / ds.length, 2)} |`);
  p(`| Δ점수 최댓값 | ${f(s2[s2.length - 1], 2)} |`);
}
p();
if (tierChanged.length) {
  p("### 3-1. 티어가 바뀐 종 전체");
  p();
  p("| 종 | 등급 | r_now | r_user | 점수 전 | 점수 후 | Δ | 티어 |");
  p("|---|---|---:|---:|---:|---:|---:|---|");
  for (const r of tierChanged.sort((a, b) => Math.abs(b.dScore) - Math.abs(a.dScore)))
    p(`| ${r.c.name} | ${r.c.cat} | ${f(r.c.rNow)} | ${f(r.c.rUser)} | ${r.before} | ${r.after} | ` +
      `${r.dScore > 0 ? "+" : ""}${r.dScore.toFixed(1)} | ${r.tBefore} → ${r.tAfter} |`);
  p();
}
p("### 3-2. 가장 크게 움직인 10종");
p();
p("| # | 종 | 등급 | criteria | d(%) | 세대시간 | r_now | r_user | 점수 전 | 점수 후 | Δ | 티어 |");
p("|---:|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|");
[...recalcs].sort((a, b) => Math.abs(b.dScore) - Math.abs(a.dScore)).slice(0, 10)
  .forEach((r, i) => {
    p(`| ${i + 1} | ${r.c.name} | ${r.c.cat} | \`${r.c.criteria}\` | ${r.c.declinePct} | ${r.c.gl} | ` +
      `${f(r.c.rNow)} | ${f(r.c.rUser)} | ${r.before} | ${r.after} | ` +
      `${r.dScore > 0 ? "+" : ""}${r.dScore.toFixed(1)} | ${r.tBefore}${r.tBefore !== r.tAfter ? " → " + r.tAfter : ""} |`);
  });
p();

// ===== 4. IUCN 등급 순서와의 일치도 =====
const ORD: Record<string, number> = { LC: 0, NT: 1, VU: 2, EN: 3, CR: 4 };
function spearman(xs: number[], ys: number[]): number {
  const rank = (a: number[]) => {
    const idx = a.map((v, i) => [v, i] as const).sort((p1, p2) => p1[0] - p2[0]);
    const r = new Array(a.length).fill(0);
    let i = 0;
    while (i < idx.length) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(xs), ry = rank(ys);
  const n = xs.length;
  const mx = rx.reduce((a, b) => a + b, 0) / n, my = ry.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2; dy += (ry[i] - my) ** 2;
  }
  return num / Math.sqrt(dx * dy);
}
// 교차등급 쌍 일치율 (등급이 다른 쌍만; 더 위험한 등급이 더 높은 점수를 받으면 일치)
function concordance(ords: number[], sc: number[]) {
  let ok = 0, tie = 0, tot = 0;
  for (let i = 0; i < ords.length; i++)
    for (let j = i + 1; j < ords.length; j++) {
      if (ords[i] === ords[j]) continue;
      tot++;
      const hi = ords[i] > ords[j] ? i : j, lo = ords[i] > ords[j] ? j : i;
      if (sc[hi] > sc[lo]) ok++;
      else if (sc[hi] === sc[lo]) tie++;
    }
  return { ok, tie, tot, pct: (ok / tot) * 100 };
}

p("## 4. IUCN 등급 순서와의 일치도");
p();
const evalRows = recalcs.filter((r) => ORD[r.c.cat] != null);
const ords = evalRows.map((r) => ORD[r.c.cat]);
const before = evalRows.map((r) => r.before), after = evalRows.map((r) => r.after);
const cb = concordance(ords, before), ca = concordance(ords, after);
p(`대상: 재계산 종 ${evalRows.length} 종 (등급 LC<NT<VU<EN<CR 로 순서화)`);
p();
p("| 지표 | 현재 r | 새 r (r_user) | 변화 |");
p("|---|---:|---:|---:|");
p(`| Spearman ρ (등급 vs 점수) | ${f(spearman(ords, before), 4)} | ${f(spearman(ords, after), 4)} | ` +
  `${f(spearman(ords, after) - spearman(ords, before), 4)} |`);
p(`| 교차등급 쌍 일치율 | ${cb.pct.toFixed(1)}% (${cb.ok}/${cb.tot}) | ${ca.pct.toFixed(1)}% (${ca.ok}/${ca.tot}) | ` +
  `${(ca.pct - cb.pct).toFixed(1)}%p |`);
p();
p("### 4-1. 등급별 평균 점수 (단조성)");
p();
p("| 등급 | 종 수 | 현재 r 평균 | 새 r 평균 |");
p("|---|---:|---:|---:|");
const cats = ["LC", "NT", "VU", "EN", "CR"];
const meansB: number[] = [], meansA: number[] = [];
for (const c of cats) {
  const rows = evalRows.filter((r) => r.c.cat === c);
  if (!rows.length) { p(`| ${c} | 0 | — | — |`); meansB.push(NaN); meansA.push(NaN); continue; }
  const mb = rows.reduce((a, b) => a + b.before, 0) / rows.length;
  const ma = rows.reduce((a, b) => a + b.after, 0) / rows.length;
  meansB.push(mb); meansA.push(ma);
  p(`| ${c} | ${rows.length} | ${mb.toFixed(2)} | ${ma.toFixed(2)} |`);
}
const viol = (m: number[]) => {
  let v = 0;
  const f2 = m.filter((x) => !Number.isNaN(x));
  for (let i = 1; i < f2.length; i++) if (f2[i] < f2[i - 1]) v++;
  return v;
};
p();
p("| 인접 등급 역전 (단조성 위반) | 현재 r | 새 r |");
p("|---|---:|---:|");
p(`| 위반 수 | ${viol(meansB)} | ${viol(meansA)} |`);
p();

fs.writeFileSync("docs/v5-r-estimation-2026-08-26.md", L.join("\n") + "\n");
console.log("작성: docs/v5-r-estimation-2026-08-26.md");
console.log(`환산 성공 ${set111.length} / 실패 ${failed111.length} / 재계산 ${recalcs.length} / 티어변경 ${tierChanged.length}`);
console.log(`복제본 최대오차 ${maxDiff.toExponential(3)}, 불일치 ${mismatches.length}`);
db.close();
