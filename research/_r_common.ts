// A criteria → 감소율 → r 환산 공용 로직.
// analyze_v5_r_estimation.ts 와 analyze_v5_r_shuffle.ts 가 같은 규칙을 쓰도록 한 곳에 둔다.
// 읽기 전용 — lib/ 는 건드리지 않는다.

import type { SpeciesRow } from "../lib/db";

export type Row = SpeciesRow & {
  iucn_criteria: string | null;
  iucn_generation_length: number | null;
  iucn_synced_at: string | null;
};

// ===== criteria 파서 (analyze_v5_coverage.py 와 동일 규칙) =====
export function parseCriteria(s: string | null): Record<string, Set<string>> {
  const out: Record<string, Set<string>> = {};
  if (!s) return out;
  const cleaned = s.replace(/\([^)]*\)/g, "");
  for (const seg of cleaned.split(/[;,]/)) {
    let cur: string | null = null;
    for (const rawTok of seg.split("+")) {
      const tok = rawTok.trim();
      if (!tok) continue;
      let num: string;
      const m = tok.match(/^([A-E])\s*(\d*)/);
      if (m) {
        cur = m[1];
        num = m[2];
      } else if (cur) {
        num = (tok.match(/^(\d*)/) ?? ["", ""])[1];
      } else continue;
      (out[cur!] ??= new Set()).add(num || "");
    }
  }
  return out;
}

// IUCN 3.1 Criterion A 감소율 하한 (%)
export const A_RATE: Record<string, number> = {
  "CR|1": 90, "CR|2": 80, "CR|3": 80, "CR|4": 80,
  "EN|1": 70, "EN|2": 50, "EN|3": 50, "EN|4": 50,
  "VU|1": 50, "VU|2": 30, "VU|3": 30, "VU|4": 30,
};

export const GENERATIONS = 3; // IUCN A: 3세대 (또는 10년 중 긴 쪽)

export interface Conv {
  id: string;
  name: string;
  cat: string;
  criteria: string;
  aNums: string[];
  declinePct: number | null;
  gl: number | null;
  rUser: number | null;   // ln(1-d) / (3 × GL)          — 지시받은 공식
  rIucn: number | null;   // ln(1-d) / max(10, 3 × GL)   — IUCN 기간 정의
  rNow: number;           // 현재 상수 r
  trendSrc: string;
  fail: string | null;
}

export function currentR(s: Row): { r: number; src: string } {
  const t = s.iucn_population_trend;
  if (t === "Decreasing") return { r: -0.06, src: "iucn:Decreasing" };
  if (t === "Stable") return { r: 0, src: "iucn:Stable" };
  if (t === "Increasing") return { r: 0.06, src: "iucn:Increasing" };
  const k = (s.population_trend ?? "").toLowerCase();
  if (k) {
    if (k.includes("감소") || k.includes("decreas")) return { r: -0.06, src: "korean:감소" };
    if (k.includes("증가") || k.includes("increas") || k.includes("회복")) return { r: 0.04, src: "korean:증가" };
    if (k.includes("안정") || k.includes("stable")) return { r: 0, src: "korean:안정" };
    return { r: -0.02, src: "korean:기타" };
  }
  return { r: -0.02, src: "default" };
}

export function convert(s: Row): Conv {
  const parsed = parseCriteria(s.iucn_criteria ?? null);
  const aNums = Array.from(parsed["A"] ?? []);
  const cur = currentR(s);
  const base: Conv = {
    id: s.id,
    name: s.common_name_ko ?? s.common_name_en ?? s.scientific_name,
    cat: s.category,
    criteria: s.iucn_criteria ?? "",
    aNums,
    declinePct: null, gl: s.iucn_generation_length ?? null,
    rUser: null, rIucn: null, rNow: cur.r, trendSrc: cur.src, fail: null,
  };

  if (!parsed["A"]) return { ...base, fail: "A criterion 없음" };
  const rates = aNums.map((n) => A_RATE[`${s.category}|${n}`]).filter((v) => v != null);
  if (rates.length === 0) {
    return {
      ...base,
      fail: aNums.every((n) => n === "")
        ? `A 하위번호 없음 (문자열 "${s.iucn_criteria}")`
        : `등급 ${s.category} 에 A 임계 없음`,
    };
  }
  const d = Math.min(...rates) / 100;          // 가장 보수적(낮은) 감소율
  const gl = s.iucn_generation_length;
  if (gl == null) return { ...base, declinePct: d * 100, fail: "세대시간 없음" };
  if (!(gl > 0)) return { ...base, declinePct: d * 100, fail: `세대시간 비정상 (${gl})` };
  if (d >= 1) return { ...base, declinePct: d * 100, fail: "감소율 100% — ln(0) 발산" };

  const pUser = GENERATIONS * gl;
  const pIucn = Math.max(10, GENERATIONS * gl);
  return {
    ...base,
    declinePct: d * 100,
    rUser: Math.log(1 - d) / pUser,
    rIucn: Math.log(1 - d) / pIucn,
  };
}
