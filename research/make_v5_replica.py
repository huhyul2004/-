#!/usr/bin/env python3
"""lib/tipping-point.ts → research/_v5_replica.ts 재생성.

원본을 그대로 복사하고 딱 두 군데만 바꾼다.
  1) import 경로 (./db → ../lib/db)
  2) evaluateTippingPoint opts 에 rOverride 추가 — 미지정 시 원본과 동일 경로
원본은 절대 수정하지 않는다.
일치 여부는 analyze_v5_r_estimation.ts 가 310종 전부에 대해 1e-9 로 검증한다.
"""
import io

src = io.open("lib/tipping-point.ts", encoding="utf-8").read()

src = src.replace('import type { SpeciesRow } from "./db";',
                  'import type { SpeciesRow } from "../lib/db";')

src = src.replace(
    'opts: { n_sim?: number; T?: number; seed?: number } = {}',
    'opts: { n_sim?: number; T?: number; seed?: number; rOverride?: number } = {}')

src = src.replace('''  const { lambda_mean, lambda_sd, r } = trendToLambdaV4(
    species.iucn_population_trend ?? null,
    species.population_trend,
    species.category
  );''', '''  const _base = trendToLambdaV4(
    species.iucn_population_trend ?? null,
    species.population_trend,
    species.category
  );
  // rOverride 미지정 시 원본과 동일한 값 — 검증에서 오차 0 확인
  const r = opts.rOverride ?? _base.r;
  const lambda_mean = opts.rOverride != null ? Math.exp(opts.rOverride) : _base.lambda_mean;
  const lambda_sd = _base.lambda_sd;''')

hdr = ('// [생성물] lib/tipping-point.ts 의 복제본 + r 주입 훅 하나.\n'
       '// research/analyze_v5_r_estimation.ts 전용. 원본은 건드리지 않는다.\n'
       '// 재생성: python3 research/make_v5_replica.py\n\n')
io.open("research/_v5_replica.ts", "w", encoding="utf-8").write(hdr + src)
print("research/_v5_replica.ts 재생성 완료")
