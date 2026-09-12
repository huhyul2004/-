// class_name 을 iucn_class 기준으로 바로잡았을 때 v5 점수가 어떻게 바뀌는지
// 시뮬레이션한다. **DB 를 쓰지 않는다** — 메모리상 행 객체의 class_name 만
// 바꿔 evaluateTippingPoint 를 다시 호출할 뿐이다.
//
// 대상: (1) class_name 이 iucn_class 와 어긋나는 27종
//       (2) class_name 이 비어 DEFAULT_LIFE 로 떨어지는 727종
// 실행: tsx research/simulate_class_name_fix.ts
import fs from "node:fs";
import Database from "better-sqlite3";
import { evaluateTippingPoint } from "../lib/tipping-point";
import type { SpeciesRow } from "../lib/db";

// research/audit_class_name.py 의 MAP 과 동일해야 한다.
// DB_SEED=1 이면 DB 를 채운 compute-tipping-points 와 같은 기본 시드(종 ID 해시)를 쓴다.
// 미지정 시 seed 42 (2026-08-27 문서의 119종은 이 값이다).
const SEED_OPTS: { seed?: number } = process.env.DB_SEED ? {} : { seed: 42 };
const OUT = process.env.DB_SEED ? "/tmp/class_name_fix_sim_dbseed.json" : "/tmp/class_name_fix_sim.json";

const MAP: Record<string, string> = {
  MAMMALIA: "포유류", AVES: "조류", REPTILIA: "파충류", AMPHIBIA: "양서류",
  ACTINOPTERYGII: "어류 (조기어류)", CHONDRICHTHYES: "어류 (연골어류)",
  PETROMYZONTI: "어류", INSECTA: "곤충", ARACHNIDA: "거미류",
  MALACOSTRACA: "갑각류", MAXILLOPODA: "갑각류", HEXANAUPLIA: "갑각류",
  GASTROPODA: "복족류", BIVALVIA: "이매패류", ANTHOZOA: "산호류 (육방산호)",
  PINOPSIDA: "식물 (침엽수)", CYCADOPSIDA: "식물 (소철)",
  MAGNOLIOPSIDA: "식물 (쌍떡잎)", LILIOPSIDA: "식물 (쌍떡잎)",
  POLYPODIOPSIDA: "양치식물", JUNGERMANNIOPSIDA: "이끼류 (우산이끼)",
  BRYOPSIDA: "이끼류 (우산이끼)", TAKAKIOPSIDA: "이끼류 (우산이끼)",
  ANTHOCEROTOPSIDA: "이끼류 (우산이끼)", LECANOROMYCETES: "지의류",
};

type Row = SpeciesRow & { iucn_class?: string | null; is_curated?: number };

const db = new Database("data/species.db", { readonly: true });
const rows = db.prepare("SELECT * FROM species").all() as Row[];

// 어류 3키는 v5 파라미터가 사실상 같아 혼용을 동치로 본다 (audit 스크립트와 동일).
function equiv(cur: string, exp: string) {
  return cur === exp || (exp === "어류 (조기어류)" && (cur === "어류 (경골어류)" || cur === "어류 (조기어류)"));
}

type Kind = "mismatch" | "blank";
const targets = new Map<string, { exp: string; kind: Kind }>();
for (const r of rows) {
  if (!r.is_curated) continue;
  const ic = (r.iucn_class ?? "").trim().toUpperCase();
  if (!ic) continue;
  const exp = MAP[ic];
  if (!exp) continue;
  const cur = (r.class_name ?? "").trim();
  if (!cur) targets.set(r.id, { exp, kind: "blank" });
  else if (!equiv(cur, exp)) targets.set(r.id, { exp, kind: "mismatch" });
}

const before = new Map<string, { score: number; tier: string; ne: number }>();
const after = new Map<string, { score: number; tier: string; ne: number }>();

for (const r of rows) {
  const b = evaluateTippingPoint(r, SEED_OPTS);
  if (b) before.set(r.id, { score: b.consensus_score, tier: b.intervention_tier, ne: b.layer_scores.iucn.Ne });

  const t = targets.get(r.id);
  // 고친 class_name 으로 다시 평가 — DB 가 아니라 복제한 객체만 바꾼다.
  const fixed = t ? ({ ...r, class_name: t.exp } as Row) : r;
  const a = evaluateTippingPoint(fixed, SEED_OPTS);
  if (a) after.set(r.id, { score: a.consensus_score, tier: a.intervention_tier, ne: a.layer_scores.iucn.Ne });
}

const byId = new Map(rows.map((r) => [r.id, r]));
const changed: {
  id: string; ko: string; cat: string; kind: Kind; from: string; to: string;
  N: number | null; sb: number; sa: number; d: number; tb: string; ta: string; neb: number; nea: number;
}[] = [];

for (const [id, b] of Array.from(before.entries())) {
  const a = after.get(id);
  if (!a) continue;
  if (a.score === b.score && a.tier === b.tier && a.ne === b.ne) continue;
  const r = byId.get(id)!;
  const t = targets.get(id);
  changed.push({
    id,
    ko: r.common_name_ko ?? r.scientific_name,
    cat: r.category ?? "",
    kind: t?.kind ?? "mismatch",
    from: (r.class_name ?? "").trim() || "(빈값)",
    to: t?.exp ?? "",
    N: r.mature_individuals ?? r.iucn_population_size ?? null,
    sb: b.score, sa: a.score, d: a.score - b.score,
    tb: b.tier, ta: a.tier, neb: b.ne, nea: a.ne,
  });
}

// 대상이 아닌데 바뀐 종이 있으면 즉시 드러나야 한다.
const collateral = changed.filter((c) => !targets.has(c.id));

const tvals = Array.from(targets.values());
const nMis = tvals.filter((t) => t.kind === "mismatch").length;
const nBlank = tvals.filter((t) => t.kind === "blank").length;
console.log(`고침 대상            ${targets.size}종 (불일치 ${nMis} + 빈값 ${nBlank})`);
console.log(`점수 산출 종 (전체)  ${before.size}`);
console.log(`그중 대상이면서 점수가 나오는 종 ${Array.from(targets.keys()).filter((id) => before.has(id)).length}`);
console.log(`>>> 점수·티어·Ne 가 바뀐 종  ${changed.length} <<<`);
console.log(`대상 밖인데 바뀐 종  ${collateral.length}  (0 이어야 정상)`);

const tierMoved = changed.filter((c) => c.tb !== c.ta);
console.log(`티어가 바뀐 종       ${tierMoved.length}`);
console.log(`점수 상승 ${changed.filter((c) => c.d > 0).length} / 하락 ${changed.filter((c) => c.d < 0).length} / 동일(Ne만 변화) ${changed.filter((c) => c.d === 0).length}`);

changed.sort((x, y) => Math.abs(y.d) - Math.abs(x.d));
fs.writeFileSync(OUT, JSON.stringify({ changed, collateral }, null, 1));

console.log("\n=== 변동 폭 상위 10종 ===");
console.log("종                    등급  현재→정답            N        점수          티어      Ne");
for (const c of changed.slice(0, 10)) {
  console.log(
    `${c.ko.padEnd(20)} ${c.cat.padEnd(4)} ${(c.from + "→" + c.to).padEnd(20)} ` +
    `${String(c.N ?? "-").padStart(7)}  ${c.sb.toFixed(1).padStart(5)}→${c.sa.toFixed(1).padStart(5)} ` +
    `(${c.d >= 0 ? "+" : ""}${c.d.toFixed(1)})  ${c.tb}→${c.ta}  ${c.neb}→${c.nea}`
  );
}

console.log("\n=== 지목 3종 ===");
for (const name of ["캘리포니아콘도르", "아프리카펭귄", "자바파랑딱새"]) {
  const c = changed.find((x) => x.ko === name);
  if (!c) { console.log(`${name}: 변동 없음 또는 점수 미산출`); continue; }
  console.log(
    `${c.ko.padEnd(12)} ${c.cat}  ${c.from}→${c.to}  N=${c.N}  ` +
    `점수 ${c.sb.toFixed(1)}→${c.sa.toFixed(1)} (${c.d >= 0 ? "+" : ""}${c.d.toFixed(1)})  ` +
    `티어 ${c.tb}→${c.ta}  Ne ${c.neb}→${c.nea}`
  );
}
