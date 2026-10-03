// 데이터 출처 줄 — 결정 10·11 (2026-10-03)
//
// 챗봇 답변 끝에 서버가 붙이는 한 줄. 모델에게 쓰게 하지 않는다 (날짜·버전을 지어내지 않게).
//   데이터 출처: LastWatch DB v2026.10.03, IUCN API 조회일 2026-07-26 (위협·서식지·보전 활동 2026-09-12), 계산일 2026-10-03
//
//   - DB 버전  : PRAGMA user_version (YYYYMMDD) — scripts/compute-tipping-points.ts 가 재계산 날짜(KST)로 남긴다
//   - IUCN 조회일: species.iucn_synced_at (평가 동기화) · species.iucn_details_synced_at (위협·서식지·보전 활동 조회)
//   - 계산일   : tipping_points.computed_at (SQLite CURRENT_TIMESTAMP, UTC)
// 날짜는 모두 한국 시간(KST) 날짜로 적는다. 계산 근거 페이지·CSV 내보내기도 같은 함수를 쓴다.
import { getDb } from "./db";
import { PROVENANCE_PREFIX } from "./chat-format";

export { PROVENANCE_PREFIX };

let cachedUserVersion: number | null | undefined;

/** PRAGMA user_version — 0 이거나 읽을 수 없으면 null. 프로세스마다 한 번만 읽는다 */
export function dbUserVersion(): number | null {
  if (cachedUserVersion !== undefined) return cachedUserVersion;
  try {
    const v = Number(getDb().pragma("user_version", { simple: true }));
    cachedUserVersion = Number.isInteger(v) && v > 0 ? v : null;
  } catch {
    cachedUserVersion = null;
  }
  return cachedUserVersion;
}

/** 20261003 → "v2026.10.03". 날짜 꼴이 아니면 "v20261003", 없으면 "버전 미기록" */
export function formatDbVersion(v: number | null): string {
  if (v == null) return "버전 미기록";
  const s = String(v);
  return /^\d{8}$/.test(s) ? `v${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6, 8)}` : `v${s}`;
}

/**
 * 시각 문자열 → KST 날짜(YYYY-MM-DD).
 * SQLite CURRENT_TIMESTAMP("YYYY-MM-DD HH:MM:SS")는 시간대 표기가 없는 UTC 라 Z 를 붙여 읽는다.
 * ISO 문자열(+00:00 등)은 그대로 읽는다. 읽을 수 없으면 null.
 */
export function kstDate(ts: string | null | undefined): string | null {
  if (!ts) return null;
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(ts) ? `${ts.replace(" ", "T")}Z` : ts;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);
}

export interface ProvenanceInput {
  /** species.iucn_synced_at */
  iucnSyncedAt?: string | null;
  /** species.iucn_details_synced_at */
  iucnDetailsSyncedAt?: string | null;
  /** tipping_points.computed_at — 점수 행이 없으면 null */
  computedAt?: string | null;
}

/** "IUCN API 조회일" 자리에 들어갈 문자열 */
export function iucnQueriedLabel(p: ProvenanceInput): string {
  const assessed = kstDate(p.iucnSyncedAt);
  const details = kstDate(p.iucnDetailsSyncedAt);
  if (assessed && details && assessed !== details) return `${assessed} (위협·서식지·보전 활동 ${details})`;
  if (assessed) return assessed;
  if (details) return `${details} (위협·서식지·보전 활동)`;
  return "기록 없음";
}

/** 답변 끝 한 줄 */
export function provenanceLine(p: ProvenanceInput): string {
  const calc = kstDate(p.computedAt) ?? "없음 (점수 미산출)";
  return (
    `${PROVENANCE_PREFIX} LastWatch DB ${formatDbVersion(dbUserVersion())}, ` +
    `IUCN API 조회일 ${iucnQueriedLabel(p)}, 계산일 ${calc}`
  );
}
