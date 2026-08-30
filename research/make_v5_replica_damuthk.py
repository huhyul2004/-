#!/usr/bin/env python3
"""research/_v5_replica.ts → research/_v5_replica_damuthk.ts 생성.

K 산출만 Damuth 로 바꾼 사본. 그 외에는 한 글자도 바꾸지 않는다.
  - lib/allometry.ts 의 damuthK() 를 그대로 쓴다.
  - 입력(체중·서식면적)이 없으면 현재 식을 그대로 쓴다.
  - 서식면적은 DB 에 컬럼이 없으므로 외부 주입 맵(HABITAT_AREA_KM2)에서 읽는다.
    주입이 없으면 damuthK 가 null 을 반환해 현재 식으로 떨어진다.

lib/tipping-point.ts 와 research/_v5_replica.ts 는 절대 수정하지 않는다.
"""
import io

SRC = "research/_v5_replica.ts"
DST = "research/_v5_replica_damuthk.ts"

src = io.open(SRC, encoding="utf-8").read()

OLD_K = """  let K: number;
  if (r < 0) K = Math.max(N0 * 1.5, N0 + 100);  // 회복 가능한 환경
  else K = Math.max(N0 * 1.2, N0 + 50);"""

NEW_K = """  let K: number;
  // [자동 생성] Damuth K 우선. 입력(체중·서식면적)이 없으면 아래 현재 식으로 떨어진다.
  {
    const _mass = (species as { mass_g?: number | null; mass_g_external?: number | null }).mass_g
      || (species as { mass_g_external?: number | null }).mass_g_external || null;
    const _area = HABITAT_AREA_KM2[species.id] ?? null;
    const _dk = _mass && _mass > 0 ? damuthK(_mass, species.class_name, _area) : null;
    if (_dk != null && _dk > 0) K = _dk;
    else if (r < 0) K = Math.max(N0 * 1.5, N0 + 100);  // 회복 가능한 환경
    else K = Math.max(N0 * 1.2, N0 + 50);
  }"""

assert src.count(OLD_K) == 1, "K 앵커 실패"
out = src.replace(OLD_K, NEW_K)

IMP = 'import type { SpeciesRow } from "../lib/db";'
assert out.count(IMP) == 1, "import 앵커 실패"
out = out.replace(IMP, IMP + """
import { damuthK } from "../lib/allometry";

/**
 * 종ID → 서식면적(km²). DB 에 habitat_area 컬럼이 없어 외부에서 주입한다.
 * 비어 있으면 damuthK 가 null 을 반환해 전 종이 현재 K 식을 쓴다.
 */
export const HABITAT_AREA_KM2: Record<string, number> = {};""")

out = out.replace(
    "// LastWatch EWS-PVA Hybrid Engine",
    "// [자동 생성] research/make_v5_replica_damuthk.py — K 산출만 Damuth 로 바꾼 사본.\n"
    "// 원본: research/_v5_replica.ts. 그 외 계산은 동일. 직접 수정하지 말 것.\n"
    "// LastWatch EWS-PVA Hybrid Engine",
    1,
)

io.open(DST, "w", encoding="utf-8").write(out)
print("생성:", DST)
