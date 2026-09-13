# EWS(조기경보신호) 레이어 조사

조사일 2026-09-13. 코드·DB 를 읽기만 했다. 사실과 표만 적는다.

---

## 1. 실제 시계열을 쓰는 코드 경로

점수를 만드는 코드(`lib/tipping-point.ts`)에는 **개체수 시계열을 입력으로 받는 경로가 없다.**

| 위치 | 내용 |
|---|---|
| `lib/tipping-point.ts` `evaluateEws(trend, r)` | 입력은 `r`(추세로 정한 성장률) 하나. 인자 `trend` 는 받지만 함수 안에서 쓰지 않는다 |
| 호출 | `evaluateTippingPoint` 가 `evaluateEws(species.population_trend, r)` 로 부른다. `r` 은 `trendToLambdaV4(iucn_population_trend, population_trend, category)` 에서 온다 |
| 파일 머리 주석 | "사이트 DB 에는 시계열이 없음. EWS Layer 는 confidence 낮춰 population_trend 만 약한 신호로 활용." |
| 함수 주석 | "스펙 v3: ews_score = sigmoid(0.5·τ_AR1 + 0.3·τ_Var + 0.2·τ_Skew) · 100 / 시계열 부재 → 모든 τ = 0 …" |

시계열 기반 식(AR1·분산·왜도의 Kendall τ)은 아래 곳에 **글로만** 있고 계산 코드는 없다.

| 위치 | 성격 |
|---|---|
| `scripts/build-verification-package.ts` 114–136행 | 검증 문서 생성 스크립트의 설명 텍스트 — detrending, rolling window(len × 0.5), AR1·Var·Skew·ReturnRate, Kendall τ, `ews_raw = 0.30·τ(AR1) + 0.25·τ(Var) + 0.20·τ(Skew)` |
| `scripts/build-full-verification.ts` 169–173·316행 | 같은 식을 문서용 객체로 적음 (`weights: { tau_ar1: 0.5, tau_var: 0.3, tau_skew: 0.2 }`, `timeseries_absent_fallback: "r 부호로 τ 추정"`) |
| `engine/timeline.ts` 4·13행 | 특허 청구항 설명 주석 ("시계열 + PVA + IUCN 데이터로부터") |
| `engine/fallback.ts` 4행 | 청구항 설명 주석 ("시계열 데이터가 부재한 경우 …") |

- `engine/timeline.ts`(`buildTimeline`)·`engine/fallback.ts`(`fallbackEstimate`) 는 EWS 를 계산하지 않는다. 앱 라우트에서 import 하지 않고, `engine/fallback.ts` 는 `__tests__/regression.test.ts` 가 import 한다.
- τ 가중치가 두 문서에서 다르다: 코드·`build-full-verification.ts` 는 0.5 / 0.3 / 0.2, `build-verification-package.ts` 텍스트는 0.30 / 0.25 / 0.20.

### 이력

| 커밋 | 날짜 | EWS 식 |
|---|---|---|
| `b42f138` 임계점 엔진 통합 | 2026-05-03 | `score = min(100, max(0, −r) ÷ 0.06 × 50)` (0~50), confidence 0.25, 주석 "시계열 없음 → confidence 0.2~0.3" |
| `0bc221f` v3 스펙 전면 적용 | 2026-05-06 | 지금 식 `σ(2 × (0.5τ + 0.3τ + 0.2τ)) × 100`. 커밋 메시지: "시계열 부재 시 r 부호로 τ 추정값 사용" |
| `ebe0017` 계산식 페이지 | 2026-09-13 | 식 안의 숫자를 `V5_SPEC.ews` 상수로 옮김 (값 무변경) |

## 2. DB 의 시계열

**없다 — 0종, 0시점.**

| 테이블 | 개체수 관련 컬럼 | 종당 값 개수 |
|---|---|---|
| `species` | `mature_individuals`, `iucn_population_size` | 1 |
| `species` | `iucn_population_trend`, `population_trend` (추세 문자열) | 1 |
| `species` | `iucn_assessment_year`, `year_published`, `extinction_year` | 1 |
| `tipping_points` | `payload_json` 안의 PVA 궤적 — 시뮬레이션 결과이고 관측값이 아님 | — |

그 밖의 테이블: `threats` · `habitats` · `conservation_actions` · `ai_recommendations` · `ai_retrospectives` · `wikipedia_cache` · `sqlite_sequence` — 개체수 값 없음.
`data/external/` 에는 `AVONET1_BirdLife.csv`(조류 형질) 하나뿐이다.

### 스펙 식이 요구하는 입력

`scripts/build-verification-package.ts` 의 식 설명 기준으로, 시계열 EWS 는 **종별로 시간 순서가 있는 개체수 N(t)** 를 요구한다.

| 필요한 것 | 스펙 텍스트의 근거 |
|---|---|
| 종 · 시점(연도) · 개체수 — 한 종에 여러 행 | "주어진 시계열 N(t)에 대해" |
| 추세 제거용 평활 | "residual(t) = N(t) − smooth(N, σ = max(5, len×0.1))" |
| rolling window 를 만들 만큼의 시점 수 | "window = len × 0.5" |

형태로 쓰면 예: `population_series(species_id, year, count, source)`. 스펙 텍스트에는 최소 시점 수가 적혀 있지 않다.

## 3. 지금의 추정식

```
τ   = clamp(−r ÷ 0.06, −1, 1)                      (V5_SPEC.ews.tauScale = 0.06)
EWS = σ(2 × (0.5τ + 0.3τ + 0.2τ)) × 100             (gain 2, τ 가중치 0.5/0.3/0.2 — 세 τ 가 같은 값)
    = σ(2τ) × 100
```

`r` 은 `trendToLambdaV4` 가 정한다: IUCN 추세(Decreasing/Stable/Increasing) → 없거나 Unknown 이면 한글 `population_trend` → 그것도 없으면 기본값.

| 추세 입력 | r | τ | EWS | 해석 문구 |
|---|---:|---:|---:|---|
| IUCN Decreasing | −0.06 | +1.0000 | **88.079708** | 강한 critical slowing down 신호 (> 70) |
| IUCN Stable | 0 | 0 | **50.000000** | 시계열 부재 — 중간값 (≤ 50) |
| IUCN Increasing | +0.06 | −1.0000 | **11.920292** | 시계열 부재 — 중간값 |
| IUCN Unknown 또는 없음 → 한글 '감소' | −0.06 | +1.0000 | 88.079708 | 강한 … 신호 |
| → 한글 '증가'·'회복' | +0.04 | −0.6667 | 20.860853 | 시계열 부재 — 중간값 |
| → 한글 '안정' | 0 | 0 | 50.000000 | 시계열 부재 — 중간값 |
| → 한글 칸도 없음 (기본값) | −0.02 | +0.3333 | **66.075637** | 약한 감소 추세 신호 (50 초과 70 이하) |

- EWS 의 가능한 값은 입력 r 이 가질 수 있는 값(−0.06 · −0.02 · 0 · +0.04 · +0.06)에 따라 **최대 5개**다.
- 범위는 σ(−2)·100 = 11.92 ~ σ(2)·100 = 88.08. 절멸·야생절멸 종은 계산하지 않고 100 이 저장된다.
- 신뢰도는 모든 종 0.25 (상수).

## 4. EWS 점수의 실제 분포 (DB `tipping_points.payload_json`)

| EWS | 종 수 | 추세 입력 |
|---:|---:|---|
| 88.079708 | 183 | IUCN Decreasing 183 |
| 66.075637 | 48 | IUCN Unknown + 한글 칸 없음 → 기본값 48 |
| 50.000000 | 47 | IUCN Stable 47 |
| 11.920292 | 32 | IUCN Increasing 32 |
| **합계 (계산 종)** | **310** | **고유값 4개** |
| 100 | 631 | 절멸·야생절멸 (계산 없음) |

- 한 고유값은 정확히 한 추세 입력에 대응한다. 추세 입력이 같은 종은 EWS 가 모두 같다.
- 계산 310종 중 한글 추세 칸 경로(`source = korean`)로 r 이 정해진 종은 0종이다.
- EWS 식에는 종별로 달라지는 입력(개체수, 분류군 등)이 없다.
