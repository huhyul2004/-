# EWS 시계열 데이터 — 구할 수 있는 경로 조사

조사일 2026-09-13. 조사만 했다. 코드·DB 는 바꾸지 않았고, 시계열 값을 추정해서 채우지 않았다.
IUCN API 호출은 읽기만 했다(표본 조회 포함).

---

## 1. 명세서의 EWS 식 (전문)

출처: `scripts/build-verification-package.ts` 108–135행 (검증 문서 생성 스크립트에 들어 있는 명세 텍스트).
참고문헌으로 Drake & Griffen (2010) Nature 467:456, Dakos et al. (2012) PLoS ONE 7:e41010 을 든다.

```
주어진 시계열 N(t)에 대해:

1. Detrending: residual(t) = N(t) - smooth(N, σ = max(5, len*0.1))
2. Rolling window 통계 (window = len * 0.5):
   AR1(t)        = Cov(r[t], r[t-1]) / Var(r)
   Variance(t)   = Var(r in window)
   Skewness(t)   = E[(r-μ)³] / σ³
   Kurtosis(t)   = E[(r-μ)⁴] / σ⁴ - 3
   ReturnRate(t) = 1 - AR1(t)
3. Kendall's τ 단조성 검정 (각 통계량의 시간 추세):
   τ = (concordant - discordant) / (n*(n-1)/2)
4. EWS 합성 점수:
   ews_raw = 0.30·τ(AR1) + 0.25·τ(Var) + 0.20·τ(Skew)
           + 0.10·τ(Kurt) - 0.10·τ(ReturnRate)
   ews_score = sigmoid(2 · ews_raw) · 100  (0~100)
```

| 지표 | 무엇을 계산하나 | 입력 |
|---|---|---|
| 추세 제거 | 개체수 N(t) 에서 평활값(가우스 폭 σ = max(5, 길이×0.1))을 뺀 잔차 r(t) | 시계열 전체 |
| 자기상관 AR1 | 창 안의 잔차가 한 시점 전 값과 얼마나 닮았나 — 회복이 느려지면 커진다 | 창마다 잔차 |
| 분산 Variance | 창 안 잔차의 흩어짐 | 창마다 잔차 |
| 왜도 Skewness · 첨도 Kurtosis | 창 안 잔차 분포의 비대칭·꼬리 | 창마다 잔차 |
| 속도 ReturnRate | 1 − AR1 — 평형으로 돌아오는 빠르기 | AR1 |
| Kendall τ | 창을 한 칸씩 밀며 얻은 각 지표 값들이 시간에 따라 단조 증가·감소하는 정도 | 창 개수만큼의 지표 값 |

- 지금 코드와 다른 점: 코드의 추정식은 τ 가중치 0.5 / 0.3 / 0.2 세 개(첨도·속도 없음), 명세 텍스트는 0.30 / 0.25 / 0.20 / 0.10 / −0.10 다섯 개. 코드는 시계열이 없어 r 하나로 모든 τ 를 같은 값으로 둔다 (`docs/ews-layer-audit.md`).

### 필요한 시점 수

**명세 텍스트에는 최소 시점 수가 적혀 있지 않다.** 식에서 따라 나오는 것만 적는다.

| 항목 | 식에서 따라 나오는 것 |
|---|---|
| 창 크기 | 길이 × 0.5 — 시점 n 개면 창 n/2 |
| 창 개수 (Kendall τ 에 들어가는 값 수) | n − n/2 + 1 ≈ n/2 + 1 |
| AR1 | 창 안에 잔차가 적어도 2쌍 이상 있어야 계산된다 |
| Kendall τ | 값이 2개 이상이어야 계산되고, 값 k 개면 가능한 τ 는 k(k−1)/2 쌍으로 정해진다 |
| 추세 제거 | 평활 폭 σ 가 최소 5(시점 단위)라 짧은 시계열에서는 잔차가 거의 0 이 된다 |

인용된 참고문헌 Dakos et al. (2012) 은 "rolling windows half the size of the datasets" 를 쓰고, 창 크기는
"a trade-off between availability of data and reliability of the estimation of the indicators" 라고 적는다.
최소 전체 길이는 명시하지 않는다(DFA 지표에만 ">100 points for robust estimation").
참고로 이 논문의 예시 자료는 창이 485시점이다.

## 2. IUCN 과거 평가 (historic assessment)

### API 가 과거 평가를 주는가 — 준다

`GET /api/v4/taxa/scientific_name?genus_name=Rhinoceros&species_name=sondaicus` (자바코뿔소) → HTTP 200,
`assessments` 에 **8개** 평가가 온다 (`latest` 가 참인 것 1개 + 과거 7개). 각 `assessment_id` 로
`GET /api/v4/assessment/{id}` 를 부르면 과거 평가도 상세가 온다.

| 연도 | assessment_id | latest | 등급 | `supplementary_info.population_size` | `documentation.population` 글자 수 |
|---|---:|---|---|---|---:|
| 1965 | 8925928 | 아니오 | N/A | 없음 | 0 |
| 1986 | 8925944 | 아니오 | E | 없음 | 0 |
| 1988 | 8926350 | 아니오 | E | 없음 | 0 |
| 1990 | 8926367 | 아니오 | E | 없음 | 0 |
| 1994 | 8926333 | 아니오 | E | 없음 | 0 |
| 1996 | 8926229 | 아니오 | CR | 없음 | 109 |
| 2008 | 8925965 | 아니오 | CR | `46-66` (범위) | 750 |
| 2020 | 18493900 | 예 | CR | `18` | 1,395 |

- 과거 평가 8개 중 개체수 칸에 값이 있는 것은 **2개**(그중 하나는 범위)였다.
- 1990년대 이전 평가에는 개체수 칸도 본문도 비어 있다.
- 이 종의 DB 값 `mature_individuals` 76 은 수기 입력이고, IUCN 최신 평가의 칸 값은 18 이다 — 두 값의 기준(전체/성숙 개체)이 다르다(`app/api/chat/route.ts` 주석 참조).

### 이미 받아 둔 캐시 — 과거 평가 없음

| 파일 | 항목 | 키 | 과거 평가 |
|---|---:|---|---|
| `data/iucn-population-fetch.json` | 3,952 | 최신 assessment_id | 0 — 값은 `{pop, raw}` 만 |
| `data/iucn-generation-fetch.json` | 4,036 | 최신 assessment_id | 0 — 값은 `{gen, raw}` 만 |
| `data/iucn-taxonomy-fetch.json` | 3,999 | 학명 | 평가 없음 — 분류 계급(kingdom … family)만 |
| `data/iucn-details-fetch.json` | 4,026 | 종 id | 0 — 최신 평가 id 와 항목 수만 |
| `data/iucn-threat-timing-fetch.json` | 2,178 | 종 id | 0 — 최신 평가 id 와 갱신 수만 |

과거 평가를 쓰려면 API 를 새로 불러야 한다.

## 3. 표본 20종 — 과거 평가로 시계열을 만들면

점수가 계산되는 310종에서 무작위로 20종(seed 20260913)을 뽑아 `taxa/scientific_name` 으로 평가 목록을 받고,
**모든 평가**의 상세를 받아 `supplementary_info.population_size` 를 확인했다. API 호출 119회(호출 사이 0.5초).
원자료: 이 저장소 밖(작업용 임시 폴더)에 JSON 으로 두었고 DB 에는 넣지 않았다.

| 종 | 분류군 | 평가 수 | 개체수 칸에 값이 있는 평가 (연도: 원문) | 값이 있는 서로 다른 연도 |
|---|---|---:|---|---:|
| *Histriophoca fasciata* | 포유류 | 4 | 2016: `183000` | 1 |
| *Pronolagus saundersiae* | 포유류 | 2 | 2019: `10000` | 1 |
| *Accipiter luteoschistaceus* | 조류 | 8 | 2000: `2500-9999`; 2004: `2500-9999`; 2008: `2500-9999`; 2012: `2500-9999`; 2016: `1000-2499`; 2018: `1000-2499` | 6 |
| *Turbinicarpus gielsdorfianus* | 식물 (쌍떡잎) | 2 | 2013: `4000` | 1 |
| *Turbinicarpus horripilus* | 식물 (쌍떡잎) | 2 | 2013: `1000` | 1 |
| *Eubalaena glacialis* | 포유류 | 7 | 2020: `200-250`; 2020: `200-250`; 2023: `20-49` | 2 |
| *Turbinicarpus laui* | 식물 (쌍떡잎) | 2 | 2013: `4000` | 1 |
| *Capra cylindricornis* | 포유류 | 5 | 1996: `25000`; 2008: `18000-38000`; 2008: `18000-38000`; 2020: `23000` | 3 |
| *Mammillaria anniana* | 식물 (쌍떡잎) | 2 | 2013: `500` | 1 |
| *Dryococelus australis* | 곤충 | 8 | 2017: `9-35` | 1 |
| *Sminthopsis dolichura* | 포유류 | 5 | 2026: `10000-20000` | 1 |
| *Antilophia bokermanni* | 조류 | 12 | 2000: `50-249`; 2004: `1-49`; 2008: `250-999`; 2009: `250-999`; 2010: `250-999`; 2011: `250-999`; 2012: `150-700`; 2015: `150-700`; 2016: `150-700`; 2018: `150-700` | 10 |
| *Myzopoda schliemanni* | 포유류 | 2 | 2008: `61453-134630`; 2017: `61453-134630` | 2 (같은 값 반복) |
| *Pantholops hodgsonii* | 포유류 | 5 | 2016: `100000-150000` | 1 |
| *Capra sibirica* | 포유류 | 3 | 1996: `250000`; 2020: `102000-150000` | 2 |
| *Mecistops cataphractus* | 파충류 | 7 | 2014: `1000-20000` | 1 |
| *Crocodylus mindorensis* | 파충류 | 7 | 2016: `92-137` | 1 |
| *Notoryctes typhlops* | 포유류 | 3 | 2016: `10000-100000` | 1 |
| *Necrosyrtes monachus* | 조류 | 13 | 2008: `200000-330000`; 2009: `200000-330000`; 2011: `197000`; 2022: `131000` | 4 |
| *Plectrohyla pachyderma* | 양서류 | 0 | — | 0 |

- 20종의 평가는 모두 99개였고, 그중 개체수 칸에 값이 있는 평가는 43개다 — 한 숫자 11개, 범위(`50-249` 형태) 32개.
- 값이 2개 이상인데 전부 같은 값이 반복되는 종: 1종 — 평가마다 같은 범위 문구가 다시 적힌 것으로, 개체수 변화를 담고 있지 않다.
- 같은 해에 평가가 두 개인 경우가 있다(표의 연도 중복). 이번 조회에서는 평가의 범위(scope, 예: 지역 평가)를 기록하지 않아 구분하지 못했다.
- 학명 조회로 평가가 0개 나온 종: *Plectrohyla pachyderma* — DB 에는 평가 id 가 있으므로 동의어 재조회 등으로 연결된 종일 수 있다(확인하지 않음).

### 값이 있는 서로 다른 연도 수의 분포

| 연도 수 | 종 수 (20종 중) |
|---|---:|
| 0 | 1 |
| 1 | 12 |
| 2 | 3 |
| 3 | 1 |
| 4–5 | 1 |
| 6–9 | 1 |
| 10 이상 | 1 |

## 4. 최소 시점 수를 만족하는 종 — 추정

명세에 최소 시점 수가 없어(1절) 문턱을 몇 가지로 두고 표본 비율로 추정했다. **표본 20종 기준 추정이며, 구간은 Wilson 95% 신뢰구간이다.**
값이 범위인 평가도 한 시점으로 셌다 — 범위를 한 숫자로 바꾸는 규칙은 정하지 않았고 적용하지 않았다.

| 연도 수 문턱 | 표본에서 만족 | 95% 구간 | 310종으로 환산 |
|---|---:|---:|---|
| 3 이상 | 4 / 20 (20%) | 8% – 42% | 약 25 – 129종 (점 추정 62종) |
| 5 이상 | 2 / 20 (10%) | 3% – 30% | 약 9 – 93종 (점 추정 31종) |
| 10 이상 | 1 / 20 (5%) | 1% – 24% | 약 3 – 73종 (점 추정 16종) |
| 20 이상 | 0 / 20 (0%) | 0% – 16% | 약 0 – 50종 (점 추정 0종) |

- 1절의 식은 창을 시계열 길이의 절반으로 잡고, 창 개수만큼의 지표 값으로 Kendall τ 를 계산한다. 인용 문헌의 예시 자료는 창 하나가 485시점이다.
- IUCN 평가는 대개 수년 간격으로 나오므로(표본의 연도 참조), 연도 수가 곧 연 단위 시계열 길이는 아니다.

## 5. 공개 데이터셋

| 데이터 | 내용 | 라이선스·조건 (원문) | 이 사이트 종과의 관계 |
|---|---|---|---|
| **Living Planet Database** (ZSL · WWF) | 척추동물 개체군 시계열 "tens of thousands of vertebrate population time-series", 1970–2020 | 내려받기 전 사용 목적 입력과 data-use agreement 동의 필요. "The data are supplied only for conservation purposes, scientific analysis or research." / "The recipient will not pass the original datasets on to third parties" / "will not publish the data in their original format" / 직접 금전적 이익을 위한 재생산은 서면 허가 필요. 공개된 LPI 추세만 CC BY-SA 4.0 | 척추동물만. 이 사이트 계산 310종 중 척추동물(포유류·조류·파충류·양서류·어류) 232종 — 나머지는 식물 72 · 이끼류 1 · 무척추(곤충·복족류) 3 · 분류 없음 2. 종별 일치 수는 자료를 받지 않아 확인하지 못했다 |
| **BioTIME 2.0** | 군집 시계열 — 종별 풍부도·생물량, 12,000,000+ 기록, 해양 229 · 육상 328 · 담수 151 연구 | "CC-BY 4.0" (일부 연구 "CC-BY-NC"). 인용: Dornelas et al. 2025, Global Ecol Biogeogr 34(5):e70003 | 조사 지점 단위 풍부도라 종 전체 개체수가 아니다. 종별 일치 수는 확인하지 못했다 |
| **GBIF** | 출현 기록 중심 — 데이터셋 136,523개 중 OCCURRENCE 53,642 · CHECKLIST 77,107 · SAMPLING_EVENT 5,235 · METADATA 539 (API `dataset/search` 집계) | 데이터셋별 CC0 77,516 · CC BY 4.0 49,421 · CC BY-NC 4.0 9,433 · 미지정 150 · 미지원 3 | 자바코뿔소: 출현 기록 390건, 기록이 있는 해 26개(1821–2023). 앞 300건 중 `individualCount` 가 있는 22건은 모두 1(표본 기록) — 개체수 시계열로 쓸 수 있는 값이 아니다 |

- GBIF 라이선스 안내 웹페이지(`gbif.org/terms`)는 이 환경에서 HTTP 403 이라 API 집계로 대신했다.
- BioTIME 의 라이선스·규모는 내려받기 페이지(`biotime.st-andrews.ac.uk/download.php`) 문구다.
