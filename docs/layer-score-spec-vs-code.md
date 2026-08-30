# 자바코뿔소 레이어 점수 — 명세서 vs 코드

조사일 2026-08-30. 코드·DB 를 수정하지 않았다. 사실과 표만 담는다.

재현: `tsx research/trace_layers_rhino.ts` (읽기 전용)

명세서 계열 3종이 서로 다른 값을 적고 있어 먼저 구분한다.

| 문서 | 레이어 점수 | 종합 | 티어 |
|---|---|---:|---|
| `lastwatch_score_full_spec.md` §11.2 (v3) | L1 ≈ 50, L2 ≈ **37**, L3 ≈ 95 | ≈ **78** | T3 |
| `lastwatch_score_full_spec_v4.md` §12.1 (v4) | L1 50, L2 **37**, L3 95 | **78** | T3 |
| `PKA-1551_명세서초안_수정요청서.pdf` C-1 | 50, **45**, 95 | 약 **82** | T3 |

---

## 0. 앞선 문서의 오기 정정

`docs/ne-nc-spec-vs-code-2026-08-27.md` §4 에 "코드가 산출하는 레이어 점수는
EWS 88.1 / PVA 69.5 / IUCN 95" 라고 적었으나 **틀렸다.** 그 값은 검은코뿔소의 것이다.
자바코뿔소의 실제 코드 산출값은 아래 §1 과 같다.

## 1. 코드가 실제로 산출하는 값

`data/species.db` 입력값과 `lib/tipping-point.ts` 경로 (`seed: 42`):

| 항목 | 값 |
|---|---|
| `class_name` | 포유류 |
| `category` | CR |
| `iucn_population_trend` | **Stable** |
| `population_trend` (한글) | 안정 (매우 적은 수) |
| N0 | 76 (`mature_individuals`) |
| r | **0** |
| λ_mean / λ_sd | 1.000000 / 0.15 |
| K | **126** |
| N_allee / N_qext | 20 / 2 |

| 레이어 | 코드 | full_spec v3·v4 | PKA-1551 C-1 |
|---|---:|---:|---:|
| L1 EWS | **50.0000** | ≈ 50 | 50 |
| L2 PVA | **35.8433** | ≈ 37 | 45 |
| L3 IUCN | **95** | ≈ 95 | 95 |
| 종합 | **78.0** | ≈ 78 | 약 82 |
| 티어 | **T3** | T3 | T3 |

**L1 과 L3 는 세 문서 모두와 일치한다. 어긋나는 것은 L2 하나뿐이다.**
코드 35.84 · full_spec 37 · PKA-1551 45.

종합 78.0 은 full_spec v3/v4 의 ≈78 과 일치하고, PKA-1551 의 약 82 와 다르다.

## 2. 레이어별 — 식이 다른가, 입력이 다른가

### L1 EWS — **식이 다르다. 값은 우연히 같다.**

| | 식 | 위치 |
|---|---|---|
| 명세서 | `S₁ = sigmoid(3.0 × τ_composite) × 100` | full_spec §2.6 (216~218행) |
| 코드 | `score = sigmoid(2 × composite) × 100`, `composite = (0.5+0.3+0.2)·τ = τ` | `lib/tipping-point.ts:evaluateEws` |

sigmoid 계수가 명세서 3.0, 코드 2.0 이다.
다만 자바코뿔소는 시계열이 없어 `τ = clamp(−r/0.06) = −0/0.06 = 0` 이고,
`sigmoid(0) = 0.5` 이므로 **계수와 무관하게 50** 이 된다.

τ 가 0 이 아닌 종에서는 두 식이 갈린다. 예: 바키타(r = −0.06, τ = 1)
→ 코드 `sigmoid(2)×100 = 88.08`, 명세서 식으로는 `sigmoid(3)×100 = 95.26`.

코드의 `evaluateEws` 주석은 `sigmoid(0.5·τ_AR1 + 0.3·τ_Var + 0.2·τ_Skew)` 를
스펙 v3 으로 인용하나, 실제 곱해지는 계수는 2 다.

### L2 PVA — **식이 다르다. 이것이 유일한 실질 차이다.**

| | 식 | 위치 |
|---|---|---|
| 명세서 | `S₂ = 100 × (1 − exp(−3.5 × P_ext_50yr))` | full_spec §3.6 (381행) |
| 코드 | `pvaRaw = 0.45·P_ext_50 + 0.35·P_ext_100 + 0.20·(1 − min(N0/N_safe, 1))` | `lib/tipping-point.ts:runPva` |

코드가 산출한 입력: `P_ext_50 = 0.334`, `P_ext_100 = 0.5947`,
`N_safe = max(K×0.1, 50) = max(12.6, 50) = 50`, `ratio = min(1, 76/50) = 1`.

| 경로 | 계산 | 결과 |
|---|---|---:|
| 코드 식 | `0.45×0.334 + 0.35×0.5947 + 0.20×(1−1)` | **35.84** |
| 명세서 식에 코드 P 대입 | `100×(1−exp(−3.5×0.334))` | **68.93** |
| 명세서 기재값 (full_spec §11.2) | — | 37 |
| 명세서 기재값 (PKA-1551 C-1) | — | 45 |

명세서 식에 코드의 `P_ext_50` 를 넣으면 68.93 이 나와 명세서 기재값 37 과도 맞지 않는다.
즉 **식도 다르고 입력(P_ext_50)도 다르다.** 명세서 기재값 37 을 명세서 식으로 역산하면
`P_ext_50 ≈ 0.132` 인데, 코드는 0.334 를 산출한다.

`P_ext_50` 가 갈리는 이유는 §3 의 K·λ 입력 차이다.

### L3 IUCN — **식이 다르다. 값은 우연히 같다.**

| | 산출 방식 | 위치 |
|---|---|---|
| 명세서 | `final_category = argmax(severity) of {crit_A, crit_D, crit_G}` → `score_map = {LC:5, NT:25, VU:50, EN:75, CR:95}` | full_spec §4.5·§4.6 (498~518행) |
| 코드 | `Ne` 단독. `Ne<50 → 95` | `lib/tipping-point.ts:evaluateIucn` (438행) |

명세서는 Criterion A·D 와 유전 기준(crit_G) 중 가장 위험한 것을 골라 등급 점수로 바꾸고,
코드 v5 는 **순환 방지를 위해 IUCN 등급·Criterion D 를 점수에서 제거하고 Ne 만 쓴다**
(`lib/tipping-point.ts:451` 주석: `v5 (2026-08-01): IUCN 등급/Criterion D 의존 제거 → 유효개체군(Ne) 기반 단독`).

자바코뿔소는 `Ne = round(76 × 0.15) = 11 < 50` → 95, 명세서는 `final_category = CR` → 95.
**경로가 다른데 값이 같다.**

## 3. K 값 대조 — **코드는 Damuth 를 쓰지 않는다**

| | K 산출 | 자바코뿔소 K |
|---|---|---:|
| PKA-1551 C-1 / 발명신고서 §8 | Damuth: `density = 91.2 × W^(−0.75)`, `K = density × habitat_area`<br>`91.2 × 2000^(−0.75) = 0.308`, `0.308 × 480 = 148` | **148** |
| full_spec v3 §11.2 | 사용자 지정 | 200 |
| full_spec v3 §8.3 (fallback) | `max(max_N × 2, 100)` | — |
| **코드** (`lib/tipping-point.ts`) | `r < 0 ? max(N0×1.5, N0+100) : max(N0×1.2, N0+50)` | **126** |

코드의 K 식에는 **체중도 서식 면적도 들어가지 않는다.** N0 하나와 r 의 부호만 쓴다.
자바코뿔소는 r = 0 이므로 `max(76×1.2, 76+50) = max(91.2, 126) = 126`.

`lib/allometry.ts` 에 Damuth 상수(포유류 91.2, 조류 55.0)가 구현되어 있으나
(`docs/phase2-allometry-constants.md` §3), `evaluateTippingPoint` 는 이를 호출하지 않는다.
`useAllometric` 플래그는 v4-P2 경로용이며 현재 점수 산출 경로는 v4-P1 이다.

**148 은 코드에서 나오지 않는다.** 세 값(148 / 200 / 126)이 모두 다르다.

## 4. 종합 점수까지의 경로

| 단계 | 코드 | 명세서 (full_spec §5.3) |
|---|---|---|
| 가중합 | `0.30·EWS + 0.45·PVA + 0.25·IUCN` = **54.8795** | 신뢰도 동적 가중치 `w_i = w_(0,i)×(0.5+0.5·c_i)` 후 정규화 |
| 고위험 레이어 수 | `[EWS>70, PVA>50, IUCN>60]` → **m = 1** (IUCN 95 만) | `m = |{k : s_k > H}|`, `H = 60` |
| 감쇠 | m=1 → `×0.85` = 46.65 | m=1 → `S_weighted × β`, `β = 0.85` |
| 신뢰도 압축 | `overall_conf = 0.30×0.25 + 0.45×0.7 + 0.25×0.85 = 0.6025 ≥ 0.5` → 미적용 | — |
| **개체수 floor** | `N=76 < 100` → **floor 78**, `consensus = max(46.65, 78)` = **78** | **명세서에 대응 규칙 없음** |
| 추세 보정 | 한글 trend "안정 (매우 적은 수)" → 급감·감소·증가 어디에도 안 걸림 → 없음 | — |
| 최종 | **78.0 → T3** | — |

**종합 78.0 은 레이어 점수에서 나온 값이 아니라 개체수 floor 가 만든 값이다.**
가중합 경로의 결과는 46.65 였고, `N0 < 100` 규칙이 78 로 끌어올렸다.

`lib/tipping-point.ts:610-616` 의 floor 표:

| N0 | floor |
|---|---:|
| < 50 | 90 |
| < 100 | **78** |
| < 250 | 70 |
| < 500 | 60 |

PKA-1551 C-1 은 "다수결 형성(m=2) 조건에 의해 종합 위기점수는 약 82" 라고 적는다.
그러나 같은 문단의 레이어 점수 50 / 45 / 95 에 `H = 60` 을 적용하면 초과 레이어는
95 하나뿐이라 **m = 1** 이다.

## 5. 요약

| 레이어 | 값 일치 | 식 일치 | 입력 일치 |
|---|---|---|---|
| L1 EWS | 일치 (50) | **불일치** (sigmoid 계수 3.0 vs 2.0) | 일치 (τ=0) |
| L2 PVA | **불일치** (35.84 / 37 / 45) | **불일치** (지수 매핑 vs 3항 가중합) | **불일치** (P_ext_50 및 K) |
| L3 IUCN | 일치 (95) | **불일치** (등급 argmax vs Ne 단독) | — |
| K | **불일치** (126 / 148 / 200) | **불일치** (Damuth 미사용) | **불일치** (체중·면적 미사용) |
| 종합 | 78.0 = full_spec, ≠ PKA-1551 82 | 코드에 개체수 floor 추가 존재 | — |

세 레이어 중 **값이 다른 것은 L2 하나**이고, **식은 세 레이어 모두 다르다.**
L1·L3 는 이 종의 입력값(τ=0, Ne<50 이면서 category=CR)에서 우연히 같은 값이 나온다.

---

## 6. Frankham 50/500 임계표 — PKA-1551 C-3 요청 대비 구현 현황

**구현되어 있다.** `lib/tipping-point.ts:433-442` `evaluateIucn()`.

```ts
function evaluateIucn(N: number, category: string, ne_nc: number): IucnResult {
  const Ne = Math.round(N * ne_nc);

  let genetic_status: IucnResult["genetic_status"];
  let genetic_score: number;
  if (Ne < 50)        { genetic_status = "CRITICAL";    genetic_score = 95; }
  else if (Ne < 100)  { genetic_status = "ENDANGERED";  genetic_score = 80; }
  else if (Ne < 500)  { genetic_status = "VULNERABLE";  genetic_score = 55; }
  else if (Ne < 1000) { genetic_status = "NEAR_THREAT"; genetic_score = 30; }
  else                { genetic_status = "SAFE";        genetic_score = 10; }
```

경계값 대조 — **5개 구간의 경계값이 요청서와 전부 같다.**

| 구간 | PKA-1551 C-3 (16쪽) 요청 | 코드 `genetic_status` | 코드 `genetic_score` | 경계값 |
|---|---|---|---:|---|
| Ne < 50 | CR (근친약세 즉시 위험) | `CRITICAL` | 95 | 일치 |
| Ne < 100 | EN (단기 근친 위험) | `ENDANGERED` | 80 | 일치 |
| Ne < 500 | VU (장기 적응력 손실) | `VULNERABLE` | 55 | 일치 |
| Ne < 1000 | NT (진화잠재력 불안정) | `NEAR_THREAT` | 30 | 일치 |
| Ne ≥ 1000 | LC (장기 존속 가능) | `SAFE` | 10 | 일치 |

요청서는 IUCN 등급 문자열(CR/EN/VU/NT/LC)로 매핑하고 코드는 자체 라벨과 0~100 점수를 쓴다.
`full_spec.md` §4.4 (482~496행) 는 요청서와 같은 등급 문자열 매핑(`crit_G`)을 정의하며,
경계값 50/100/500/1000 은 세 곳이 모두 같다.

### 같은 파일의 다른 Ne 사용처

| 위치 | 내용 |
|---|---|
| `lib/tipping-point.ts:415` | `if (Ne < 50) base = Math.min(100, base + 10);` — 궤적 점수화(`trajectoryToScore`)에서 Ne<50 일 때 +10 가산 |
| `lib/tipping-point.ts:444-448` | `criterion_D_score` (N<50 → 90, N<250 → 70, N<1000 → 45, else 5) 계산은 남아 있으나 **v5 에서 점수에 반영되지 않는다** |
| `scripts/build-verification-package.ts:174-176` | 같은 임계표를 검증자료 문서에 문자열로 재기술 |

`engine/` 하위에는 이 임계표가 없다.
