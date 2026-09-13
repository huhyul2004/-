// 세대시간 순열검정 — 세대시간이 실제 정보를 담고 있는지 확인한다.
// 조사/계산 전용. lib/tipping-point.ts 와 DB 는 읽기만 하고,
// 점수 재계산은 research/_v5_replica.ts (원본 복제본 + rOverride 훅) 로만 한다.
//
// 실행: ./node_modules/.bin/tsx research/analyze_v5_r_shuffle.ts

import fs from "fs";
import Database from "better-sqlite3";
import { evaluateTippingPoint as REPLICA } from "./_v5_replica";
import { type Row, type Conv, convert, parseCriteria, GENERATIONS } from "./_r_common";

const db = new Database("data/species.db", { readonly: true });
const SEEDLESS = { n_sim: 1500, T: 100 };
const SHUFFLES = 20;

// ===== 데이터 =====
const all = db.prepare("SELECT * FROM species").all() as Row[];
const hasPop = (s: Row) =>
  (s.mature_individuals != null && s.mature_individuals > 0) ||
  (s.iucn_population_size != null && s.iucn_population_size > 0);
const notExt = (s: Row) => s.category !== "EX" && s.category !== "EW";

const scored = all.filter((s) => hasPop(s) && notExt(s));
const affected: { row: Row; conv: Conv }[] = [];
for (const s of scored) {
  const c = convert(s);
  if (c.fail === null) affected.push({ row: s, conv: c });
}

// ===== 지표 =====
const ORD: Record<string, number> = { LC: 0, NT: 1, VU: 2, EN: 3, CR: 4 };

function spearman(xs: number[], ys: number[]): number {
  const rank = (a: number[]) => {
    const idx = a.map((v, i) => [v, i] as const).sort((p, q) => p[0] - q[0]);
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
  const rx = rank(xs), ry = rank(ys), n = xs.length;
  const mx = rx.reduce((a, b) => a + b, 0) / n, my = ry.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2; dy += (ry[i] - my) ** 2;
  }
  return num / Math.sqrt(dx * dy);
}

function concordance(ords: number[], sc: number[]) {
  let ok = 0, tot = 0;
  for (let i = 0; i < ords.length; i++)
    for (let j = i + 1; j < ords.length; j++) {
      if (ords[i] === ords[j]) continue;
      tot++;
      const hi = ords[i] > ords[j] ? i : j, lo = ords[i] > ords[j] ? j : i;
      if (sc[hi] > sc[lo]) ok++;
    }
  return { ok, tot, pct: (ok / tot) * 100 };
}

/** r 배열(affected 와 같은 순서)로 점수를 다시 매기고 지표를 낸다. */
function metricsFor(rs: (number | null)[]) {
  const scores: number[] = [], ords: number[] = [];
  affected.forEach((a, i) => {
    const r = rs[i];
    const res = r == null ? REPLICA(a.row, SEEDLESS) : REPLICA(a.row, { ...SEEDLESS, rOverride: r });
    if (!res) return;
    scores.push(res.consensus_score);
    ords.push(ORD[a.conv.cat] ?? -1);
  });
  const c = concordance(ords, scores);
  return { rho: spearman(ords, scores), conc: c.pct, ok: c.ok, tot: c.tot, scores };
}

// mulberry32 — 시드 고정 PRNG
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled<T>(arr: T[], seed: number): T[] {
  const a = [...arr], rand = rng(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const rFromGl = (declinePct: number, gl: number) =>
  Math.log(1 - declinePct / 100) / (GENERATIONS * gl);

const gls = affected.map((a) => a.conv.gl!);
const declines = affected.map((a) => a.conv.declinePct!);

// ===== 실행 =====
const mNow = metricsFor(affected.map(() => null));                 // 현재 상수 r
const mReal = metricsFor(affected.map((a) => a.conv.rUser!));      // 실제 세대시간

const sortedGl = [...gls].sort((a, b) => a - b);
const medGl = sortedGl.length % 2
  ? sortedGl[(sortedGl.length - 1) / 2]
  : (sortedGl[sortedGl.length / 2 - 1] + sortedGl[sortedGl.length / 2]) / 2;
const mFixed = metricsFor(declines.map((d) => rFromGl(d, medGl))); // 세대시간 전부 중앙값

const shuffles: { seed: number; rho: number; conc: number; identical: number }[] = [];
for (let seed = 1; seed <= SHUFFLES; seed++) {
  const sg = shuffled(gls, seed);
  const identical = sg.filter((g, i) => g === gls[i]).length;
  const m = metricsFor(declines.map((d, i) => rFromGl(d, sg[i])));
  shuffles.push({ seed, rho: m.rho, conc: m.conc, identical });
}

const stat = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  const mid = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  return { min: s[0], med: mid, max: s[s.length - 1],
           mean: a.reduce((x, y) => x + y, 0) / a.length };
};
const sr = stat(shuffles.map((s) => s.rho));
const sc = stat(shuffles.map((s) => s.conc));
const pctlRho = (shuffles.filter((s) => s.rho < mReal.rho).length / SHUFFLES) * 100;
const pctlConc = (shuffles.filter((s) => s.conc < mReal.conc).length / SHUFFLES) * 100;

// ===== 방향 모순 종 =====
const conflict = (s: Row) => {
  const t = s.iucn_population_trend;
  if (t !== "Increasing" && t !== "Stable") return false;
  return "A" in parseCriteria(s.iucn_criteria ?? null);
};
const conf310 = scored.filter(conflict);
const affIds = new Set(affected.map((a) => a.row.id));
const conf49 = conf310.filter((s) => affIds.has(s.id));

// ===== 출력 =====
const L: string[] = [];
const p = (s = "") => L.push(s);
const f4 = (x: number) => x.toFixed(4);
const f1 = (x: number) => x.toFixed(1);

p("# 세대시간 순열검정 — 계산 결과");
p();
p("작성 2026-08-27. 재현: `./node_modules/.bin/tsx research/analyze_v5_r_shuffle.ts`");
p("점수 재계산은 `research/_v5_replica.ts` 로만 했고 `lib/tipping-point.ts` 와 `data/species.db` 는 읽기만 했다.");
p();
p("## 0. 설정");
p();
p("| 항목 | 값 |");
p("|---|---|");
p(`| 대상 | 개체수 + A criteria + 세대시간을 모두 가진 ${affected.length} 종 |`);
p("| r | ln(1 − d) ÷ (3 × 세대시간) |");
p("| 셔플 | 49종의 세대시간 배열만 Fisher-Yates 로 섞고 d 는 각 종 것을 유지 |");
p(`| 반복 | ${SHUFFLES} 회 (mulberry32, seed 1~${SHUFFLES}) |`);
p(`| 고정 대조군 | 세대시간을 전부 ${medGl} (49종 중앙값) 으로 |`);
p("| 지표 | Spearman ρ (등급 vs 점수), 교차등급 쌍 일치율 |");
p(`| PVA | n_sim ${SEEDLESS.n_sim}, T ${SEEDLESS.T}, 종별 시드는 원본과 동일 |`);
p();

p("## 1. 지표 비교");
p();
p("| 조건 | Spearman ρ | 교차등급 쌍 일치율 |");
p("|---|---:|---:|");
p(`| 현재 상수 r | ${f4(mNow.rho)} | ${f1(mNow.conc)}% (${mNow.ok}/${mNow.tot}) |`);
p(`| **실제 세대시간** | **${f4(mReal.rho)}** | **${f1(mReal.conc)}% (${mReal.ok}/${mReal.tot})** |`);
p(`| 세대시간 고정 (${medGl}) | ${f4(mFixed.rho)} | ${f1(mFixed.conc)}% (${mFixed.ok}/${mFixed.tot}) |`);
p(`| 셔플 최솟값 | ${f4(sr.min)} | ${f1(sc.min)}% |`);
p(`| 셔플 중앙값 | ${f4(sr.med)} | ${f1(sc.med)}% |`);
p(`| 셔플 평균 | ${f4(sr.mean)} | ${f1(sc.mean)}% |`);
p(`| 셔플 최댓값 | ${f4(sr.max)} | ${f1(sc.max)}% |`);
p();
p("## 2. 실제 세대시간의 위치");
p();
p("| 지표 | 실제값 | 셔플 분포에서 더 낮은 횟수 | 백분위 |");
p("|---|---:|---:|---:|");
p(`| Spearman ρ | ${f4(mReal.rho)} | ${shuffles.filter((s) => s.rho < mReal.rho).length} / ${SHUFFLES} | ${f1(pctlRho)}% |`);
p(`| 교차등급 쌍 일치율 | ${f1(mReal.conc)}% | ${shuffles.filter((s) => s.conc < mReal.conc).length} / ${SHUFFLES} | ${f1(pctlConc)}% |`);
p();
p("## 3. 셔플 20회 전체");
p();
p("| seed | Spearman ρ | 일치율 | ρ − 실제 | 원위치 유지 종 수 |");
p("|---:|---:|---:|---:|---:|");
for (const s of shuffles)
  p(`| ${s.seed} | ${f4(s.rho)} | ${f1(s.conc)}% | ${(s.rho - mReal.rho >= 0 ? "+" : "") + f4(s.rho - mReal.rho)} | ${s.identical} |`);
p();

p("## 4. IUCN 추세와 criteria 방향이 반대인 종");
p();
p("조건: `iucn_population_trend` 가 Increasing 또는 Stable 인데 `iucn_criteria` 에 A(감소)가 있음");
p();
p("| 모집단 | 종 수 | 해당 종 |");
p("|---|---:|---:|");
p(`| 재계산 대상 49종 | ${affected.length} | **${conf49.length}** |`);
p(`| 점수 나오는 310종 | ${scored.length} | **${conf310.length}** |`);
p();
const trendCount = (rows: Row[], t: string) => rows.filter((r) => r.iucn_population_trend === t).length;
p("| 추세 | 49종 중 | 310종 중 |");
p("|---|---:|---:|");
p(`| Increasing | ${trendCount(conf49, "Increasing")} | ${trendCount(conf310, "Increasing")} |`);
p(`| Stable | ${trendCount(conf49, "Stable")} | ${trendCount(conf310, "Stable")} |`);
p();
p("### 4-1. 310종 중 해당 종 전체");
p();
p("| 종 | 등급 | 추세 | criteria | 세대시간 | 49종 포함 |");
p("|---|---|---|---|---:|---|");
for (const s of conf310.sort((a, b) =>
  (a.category ?? "").localeCompare(b.category ?? "") ||
  (a.common_name_ko ?? "").localeCompare(b.common_name_ko ?? "")))
  p(`| ${s.common_name_ko ?? s.common_name_en ?? s.scientific_name} | ${s.category} | ` +
    `${s.iucn_population_trend} | \`${s.iucn_criteria}\` | ${s.iucn_generation_length ?? "—"} | ` +
    `${affIds.has(s.id) ? "○" : "—"} |`);
p();

p("## 5. 세대시간 값 분포");
p();
{
  const st = stat(gls);
  p("| 항목 | 값 |");
  p("|---|---:|");
  p(`| 49종 세대시간 최솟값 | ${sortedGl[0]} |`);
  p(`| 중앙값 | ${medGl} |`);
  p(`| 평균 | ${st.mean.toFixed(2)} |`);
  p(`| 최댓값 | ${sortedGl[sortedGl.length - 1]} |`);
  p();
  p("### 5-1. 49종 중 세대시간 상위 5 / 하위 5");
  p();
  p("| | 종 | 등급 | 분류 | 세대시간 | d(%) | r_user |");
  p("|---|---|---|---|---:|---:|---:|");
  const byGl = [...affected].sort((a, b) => b.conv.gl! - a.conv.gl!);
  byGl.slice(0, 5).forEach((a, i) =>
    p(`| 상위 ${i + 1} | ${a.conv.name} | ${a.conv.cat} | ${a.row.class_name ?? "—"} | ` +
      `${a.conv.gl} | ${a.conv.declinePct} | ${f4(a.conv.rUser!)} |`));
  byGl.slice(-5).reverse().forEach((a, i) =>
    p(`| 하위 ${5 - i} | ${a.conv.name} | ${a.conv.cat} | ${a.row.class_name ?? "—"} | ` +
      `${a.conv.gl} | ${a.conv.declinePct} | ${f4(a.conv.rUser!)} |`));
  p();
}
{
  const outliers = all.filter((s2) => (s2.iucn_generation_length ?? 0) > 100)
    .sort((a, b) => (b.iucn_generation_length ?? 0) - (a.iucn_generation_length ?? 0));
  p("### 5-2. DB 전체에서 세대시간 100년 초과 종");
  p();
  p("| 종 | 분류 | iucn_generation_length | iucn_generation_length_raw | 49종 포함 |");
  p("|---|---|---:|---:|---|");
  for (const s2 of outliers)
    p(`| ${s2.common_name_ko ?? s2.scientific_name} | ${s2.class_name ?? "—"} | ` +
      `${s2.iucn_generation_length} | ${(s2 as Row & { iucn_generation_length_raw?: string | null }).iucn_generation_length_raw ?? "—"} | ` +
      `${affIds.has(s2.id) ? "○" : "—"} |`);
  p();
}

fs.writeFileSync("docs/v5-r-shuffle-test-2026-08-26.md", L.join("\n") + "\n");
console.log("작성: docs/v5-r-shuffle-test-2026-08-26.md");
console.log(`실제 ρ ${f4(mReal.rho)} / 셔플 ${f4(sr.min)}~${f4(sr.max)} (중앙 ${f4(sr.med)}) / 백분위 ${f1(pctlRho)}%`);
console.log(`고정 대조군 ρ ${f4(mFixed.rho)} (세대시간 ${medGl})`);
console.log(`방향 모순: 49종 중 ${conf49.length}, 310종 중 ${conf310.length}`);
db.close();
