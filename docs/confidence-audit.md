# 신뢰도(confidence)와 신뢰도 압축 조사

조사일 2026-09-13. 코드·DB·git 기록을 읽기만 했다. 사실과 표만 적는다.

---

## 1. 레이어 신뢰도가 정해지는 곳

| 레이어 | 값 | 코드 | 종별로 달라지는 입력 |
|---|---:|---|---|
| EWS | 0.25 | `evaluateEws` 가 `V5_SPEC.ews.confidence` 를 그대로 반환 | 없음 (상수) |
| PVA | 0.7 | `runPva` 결과에는 신뢰도가 없다. `evaluateTippingPoint` 가 종합 신뢰도 계산과 payload 에 `V5_SPEC.pva.confidence` 를 직접 넣는다 | 없음 (상수) |
| 유효개체군(Ne) | 0.85 / 0.4 | `evaluateIucn`: `N > 0 ? V5_SPEC.neConfidence(0.85) : 0.4` | N > 0 인가 |
| 절멸·야생절멸 | 1 | `makeExtinctResult` — 레이어·종합 모두 1 | — |

- 점수 경로에 들어오는 N0 는 `inferPopulationWithSource` 가 0보다 큰 값만 넘긴다. 개체수가 없으면 `evaluateTippingPoint` 가 `null` 을 돌려주고 점수를 만들지 않는다. 그래서 Ne 신뢰도 0.4 분기는 점수가 있는 종에서 쓰이지 않는다.

### 왜 모든 종이 0.6025 인가

```
종합 신뢰도 = 0.30·EWS신뢰도 + 0.45·PVA신뢰도 + 0.25·Ne신뢰도
           = 0.30·0.25   + 0.45·0.7    + 0.25·0.85
           = 0.075 + 0.315 + 0.2125 = 0.6025
```

세 값이 모두 종과 무관하므로 합도 종과 무관하다. payload 의 `confidence` 에는 `round(0.6025 × 100) / 100 = 0.6` 이 저장된다.

## 2. DB 실측 (`tipping_points.payload_json`, 계산 310종)

| 항목 | 고유값 | 종 수 |
|---|---|---:|
| `layer_scores.ews.confidence` | 0.25 | 310 |
| `layer_scores.pva.confidence` | 0.7 | 310 |
| `layer_scores.iucn.confidence` | 0.85 | 310 |
| `confidence` (종합, 반올림) | 0.6 | 310 |
| 신뢰도 압축이 적용된 종 | — | 0 |

## 3. 신뢰도 압축

```
종합 신뢰도 < 0.5 이면  점수 = 점수 × 0.9 + 10      (V5_SPEC.lowConfidence)
```

| 조건 | 종합 신뢰도 | 압축 |
|---|---:|---|
| 지금 모든 계산 종 (Ne 신뢰도 0.85) | 0.6025 | 적용 안 됨 |
| Ne 신뢰도가 0.4 인 경우 (N ≤ 0) | 0.4900 | 적용 — 그러나 N ≤ 0 인 종은 점수 경로에 들어오지 않는다 |

## 4. 신뢰도가 쓰이는 곳

| 위치 | 용도 |
|---|---|
| `lib/tipping-point.ts` | 압축 조건 판정, payload `confidence` 저장 |
| `components/tipping-timeline.tsx` 255행 | 종 상세 "상세 분석" 에 `신뢰도: {confidence × 100}%` — 모든 계산 종에서 60% |
| `lib/floor-transparency.ts`, `lib/methodology.ts` | 하한 적용 전 점수 재구성·계산식 페이지 되짚기 |
| `app/methodology/page.tsx` | 계산식 설명 |

## 5. 들어온 시점과 기록된 이유

| 커밋 | 날짜 | 신뢰도 관련 내용 |
|---|---|---|
| `b42f138` 임계점 엔진 (EWS-PVA-IUCN Hybrid) 통합 | 2026-05-03 | 엔진 첫 커밋. EWS 0.25, PVA 0.7, Ne `N > 0 ? 0.85 : 0.4`, 압축 `overall_conf < 0.5 → ×0.9 + 10` 이 이때 들어왔다. 당시 `evaluateEws` 주석: "시계열 없음 → confidence 0.2~0.3". **커밋 메시지에는 신뢰도·압축에 대한 설명이 없다** ("3-Layer consensus aggregator (Generate-then-Verify) → Tier T0~T4" 만 있음) |
| `0bc221f` v3 스펙 전면 적용 | 2026-05-06 | EWS 식·가중치(0.30/0.45/0.25)·PVA 분포를 바꿨다. 신뢰도 값·압축은 바꾸지 않았고 메시지에도 언급이 없다 |
| `ebe0017` 계산식 페이지 | 2026-09-13 | 숫자를 `V5_SPEC` 상수로 옮겼다 (값 무변경) |

코드 주석에 남은 의도:

| 위치 | 주석 |
|---|---|
| `lib/tipping-point.ts` 머리 | "사이트 DB 에는 시계열이 없음. EWS Layer 는 confidence 낮춰 population_trend 만 약한 신호로 활용. PVA 와 IUCN 이 주 기여." |
| `lib/tipping-point.ts` 669행 (하한 블록) | "카테고리 fallback 추정치는 confidence_cap=0.4 로 별도 표기 (다음 단계에서)" — 이 표기를 하는 코드는 없다 |
| `scripts/build-verification-package.ts` 136·282행 | "시계열 부재 → confidence 0.25, 약한 신호로만 반영." |

### 명세·청구항과의 대조

| 항목 | 코드 | 명세·청구항 |
|---|---|---|
| 신뢰도의 역할 | 가중치는 고정(0.30/0.45/0.25), 신뢰도는 압축 조건에만 쓰임 | full_spec §5.3: "신뢰도 동적 가중치 `w_i = w_(0,i)×(0.5+0.5·c_i)` 후 정규화" (`docs/layer-score-spec-vs-code.md` §4) |
| 신뢰도 압축 | `< 0.5 → ×0.9 + 10` | 대응 항목 없음 (같은 문서 §4 표에 "—") |
| 고위험 레이어 수 | 레이어별 문턱 EWS>70 · PVA>50 · IUCN>60 | `m = \|{k : s_k > H}\|`, `H = 60` |
| 신뢰도 표시 | 종 상세에 종합 신뢰도 표시 | 청구항 초안 53행: 종합 점수와 함께 신뢰도 값·주 신호를 UI 에 표시 |
| 대체 추정 시 상한 | `lib/tipping-point.ts` 에 없음. `engine/fallback.ts` 94행에만 `confidence_cap: missing.length > 0 ? 0.4 : 1.0` (사이트에서 호출하지 않음) | 청구항 초안 57행: 시계열 부재 시 `confidence_cap = 0.4` 강제 주입 |

## 6. 신뢰도를 종마다 다르게 하려면 필요한 것

| 구분 | 사실 |
|---|---|
| 코드 | 지금 세 레이어 신뢰도는 종별 입력으로 계산되지 않는다(상수 2개 + 점수 경로에서 늘 참인 분기 1개). 데이터를 늘려도 코드가 그대로면 신뢰도는 바뀌지 않는다. 신뢰도를 종별 값으로 계산하는 코드가 필요하다 |
| DB 에 이미 있으나 신뢰도에 쓰이지 않는 종별 값 | 개체수 출처(수기 실측 13종 · IUCN 평가 297종), 추세 출처(IUCN 262종 · 기본값 48종), 분류군 Ne/Nc 전용값 여부(전용 308종 · 기본값 2종), IUCN 평가 연도 |
| DB 에 없는 값 | 개체수 시계열 (`docs/ews-layer-audit.md` 2절) — 스펙의 시계열 EWS 를 계산하려면 필요 |
| 점수에 미치는 범위 | 지금 식에서 신뢰도는 종합 신뢰도가 0.5 미만일 때만 점수를 바꾼다. 명세의 동적 가중치 방식이면 모든 종의 가중합이 바뀐다 |
