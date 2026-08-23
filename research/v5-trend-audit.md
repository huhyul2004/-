# v5 개체수 추세(trend) 필드 전수 조사

대상: `species` 중 `is_curated = 1` 인 **4,230종**
조사일: 2026-08-23 · DB: `data/species.db`
DB·코드 변경 없음 (읽기 전용 조사)

---

## 0. λ 매핑 요약

`lib/tipping-point.ts:84` `trendToLambdaV4(iucnTrend, koreanTrend, category)`

우선순위
1. `category` 가 `EX`/`EW` → r = 0, λ = 1.0, source `extinct` (조기 반환)
2. `iucn_population_trend` 가 `Decreasing`/`Stable`/`Increasing` → source `iucn`
3. 위에 안 걸리고(= `Unknown` 또는 `NULL`) 한글 `population_trend` 가 있으면 → source `korean`
4. 둘 다 없으면 → source `default`

| 경로 | 입력 | r | λ = e^r |
|---|---|---:|---:|
| iucn | `Decreasing` | −0.06 | 0.9418 |
| iucn | `Stable` | 0 | 1.0000 |
| iucn | `Increasing` | **+0.06** | 1.0618 |
| korean / default | `감소` 포함 또는 `decreas` | −0.06 | 0.9418 |
| korean / default | `증가`·`회복` 포함 또는 `increas` | **+0.04** | 1.0408 |
| korean / default | `안정` 포함 또는 `stable` | 0 | 1.0000 |
| korean / default | 그 외 (무정보) | −0.02 | 0.9802 |
| extinct | `EX`/`EW` | 0 | 1.0000 |

- **증가 방향의 r 이 경로마다 다르다**: iucn `+0.06`, 한글 폴백 `+0.04`.
- 한글 판정은 부분문자열 매칭이고 **`감소` → `증가/회복` → `안정` 순서**로 검사한다.
  - `안정~소폭 감소` 는 `감소` 가 먼저 걸려 **감소(−0.06)** 로 분류된다.
  - `급감` 은 `감소` 를 포함하지 않아 **기타(−0.02)** 로 분류된다.
  - `절멸`·`기능적 절멸` 도 **기타(−0.02)** 다.
- λ 는 세 상수(0.9418 / 1.0000 / 1.0618)와 폴백 두 값(1.0408 / 0.9802)뿐이며 추세의 크기는 반영되지 않는다.
- `trendToLambda(trend, r_max)` 의 두 번째 인자 `r_max` 는 함수 본문에서 사용되지 않는다.
- `lambda_sd` 는 모든 경로에서 0.15 고정.

---

## 1. 두 필드 보유 종 수

| 항목 | 종 수 |
|---|---:|
| 큐레이티드 전체 | 4,230 |
| `iucn_population_trend` NOT NULL | 3,725 |
| ├ `Decreasing` | 1,087 |
| ├ `Stable` | 1,149 |
| ├ `Increasing` | 78 |
| └ `Unknown` | 1,411 |
| `iucn_population_trend` IS NULL | 505 |
| 한글 `population_trend` 비어있지 않음 | **22** |
| **둘 다 있음** | **19** |

한글 `population_trend` 값 분포 (큐레이티드 4,230종)

| 값 | 종 수 |
|---|---:|
| (NULL 또는 빈 문자열) | 4,208 |
| 감소 | 8 |
| 절멸 | 5 |
| 증가 | 4 |
| 안정~소폭 감소 | 1 |
| 안정 (매우 적은 수) | 1 |
| 안정 | 1 |
| 기능적 절멸 | 1 |
| 급감 | 1 |

---

## 2. 정면으로 어긋나는 종 — **3종**

판정 기준: `Decreasing`↔증가/회복, `Increasing`↔감소, `Stable`↔감소, `Stable`↔증가
(한글 쪽은 위 0절의 부분문자열 규칙으로 분류)

| 학명 | 한글명 | 등급 | iucn_population_trend | 한글 population_trend | 한글 분류 | v5 점수 |
|---|---|---|---|---|---|---:|
| Ursus maritimus | 북극곰 | VU | `Stable` | 감소 | 감소 | 14.5 |
| Ursus thibetanus ussuricus | 반달가슴곰 | VU | `Decreasing` | 증가 | 증가 | 73.1 |
| Rana coreana | 한국산개구리 | VU | `Stable` | 감소 | 감소 | — (점수 없음) |

### 참고 — 위 기준에는 안 들어가지만 값이 다른 종 (2종)

| 한글명 | 등급 | iucn | 한글 | 한글 분류 | v5 점수 |
|---|---|---|---|---|---:|
| 한국호랑이 | EN | `Decreasing` | 안정 | 안정 | 66.5 |
| 바키타돌고래 | CR | `Decreasing` | 급감 | 기타(무정보) | 100 |

`두루미(단정학)` 은 한글이 `안정~소폭 감소` 이나 부분문자열 규칙상 `감소` 로 분류되어
iucn `Decreasing` 과 일치, 모순에 해당하지 않는다.

---

## 3. 한글 폴백이 실제로 쓰이는 종 — **3종**

조건: `iucn_population_trend` 가 `NULL` 또는 `Unknown` **이면서** 한글 `population_trend` 가 비어있지 않음

| 학명 | 한글명 | 등급 | iucn | 한글 | 한글 분류 | 적용 r |
|---|---|---|---|---|---|---:|
| Raphus cucullatus | 도도새 | EX | NULL | 절멸 | 기타(무정보) | −0.02 |
| Thylacinus cynocephalus | 주머니늑대 (태즈메이니아호랑이) | EX | NULL | 절멸 | 기타(무정보) | −0.02 |
| Ectopistes migratorius | 여행비둘기 | EX | NULL | 절멸 | 기타(무정보) | −0.02 |

3종 모두 `category = EX` 이므로 `trendToLambdaV4` 상단의 EX/EW 조기 반환에 먼저 걸린다.
따라서 위 r 값이 점수 계산에 실제로 도달하는 종은 **0종**이다.

---

## 4. EX 인데 trend 가 Stable/Increasing — **2종**

| 학명 | 한글명 | 등급 | iucn_population_trend | 한글 population_trend | extinction_year |
|---|---|---|---|---|---:|
| Canis lupus coreanus | 한국늑대 | EX | `Stable` | 절멸 | 1996 |
| Cervus nippon hortulorum | 꽃사슴 (한반도 아종) | EX | `Increasing` | 절멸 | 1940 |

EX/EW 전체(270종) 중 `iucn_population_trend` 분포

| 값 | 종 수 |
|---|---:|
| NULL | 265 |
| `Stable` | 1 |
| `Increasing` | 1 |
| `Decreasing` | 3 |

---

## 5. v5 점수가 계산된 310종 한정

`is_curated = 1` · `category NOT IN ('EX','EW')` · `tipping_points` 행 존재 = **310종**

| 항목 | 전체 4,230종 | 점수 계산된 310종 |
|---|---:|---:|
| 1. 두 필드 둘 다 있음 | 19 | **13** |
| 2. 정면 모순 | 3 | **2** |
| 3. 한글 폴백 실제 사용 | 3 | **0** |
| 4. EX + Stable/Increasing | 2 | **0** |

- 2번의 310종 내 2종: 북극곰(14.5), 반달가슴곰(73.1). 한국산개구리는 점수가 없어 제외.
- 3번이 0인 이유: 해당 3종이 전부 EX 라 310종 집합(비절멸)에 포함되지 않는다.
- 4번이 0인 이유: 310종 집합이 정의상 EX/EW 를 제외한다.

---

## 6. [계산] 우선순위를 뒤집었을 때의 점수 변화

**DB 를 변경하지 않은 순수 계산 결과다.** 저장된 `tipping_points` 값은 그대로다.

방법
- `lib/tipping-point.ts` 의 `evaluateTippingPoint(species, { n_sim: 1500, T: 100 })` 를
  실제로 호출했다 (`scripts/compute-tipping-points.ts:49` 와 동일 옵션).
- "뒤집음" 은 입력 객체의 `iucn_population_trend` 를 `null` 로 만들어
  `trendToLambdaV4` 가 한글 폴백 경로를 타게 한 것이다.
- `seed` 는 `hashSeed(species.id)` 로 두 계산 모두 동일하므로 결정적 비교다.

**검증**: 위 방법으로 310종의 현재 점수를 재계산한 결과 **310종 전부 저장값과 완전일치**
(부동소수 오차 1e-9 미만) — 재계산 경로가 저장값을 정확히 재현함을 확인했다.

### 두 필드가 모두 있는 19종 전체

★ = 2절의 정면 모순

| 한글명 | 등급 | ★ | iucn | 한글 | r 현재 | r 뒤집음 | 점수 현재 | 점수 뒤집음 | Δ | 티어 |
|---|---|:-:|---|---|---:|---:|---:|---:|---:|---|
| 한국호랑이 | EN | | `Decreasing` | 안정 | −0.06 | 0.00 | 66.5 | 30.2 | **−36.3** | T3→T1 |
| 북극곰 | VU | ★ | `Stable` | 감소 | 0.00 | −0.06 | 14.5 | 44 | **+29.5** | T0→T2 |
| 반달가슴곰 | VU | ★ | `Decreasing` | 증가 | −0.06 | +0.04 | 73.1 | 68 | −5.1 | T3→T3 |
| 바키타돌고래 | CR | | `Decreasing` | 급감 | −0.06 | −0.02 | 100 | 98 | −2.0 | T4→T4 |
| 따오기 | EN | | `Increasing` | 증가 | +0.06 | +0.04 | 0.4 | 2 | +1.6 | T0→T0 |
| 자이언트판다 | VU | | `Increasing` | 증가 | +0.06 | +0.04 | 0.4 | 2 | +1.6 | T0→T0 |
| 동부저지대고릴라 | CR | | `Decreasing` | 감소 | −0.06 | −0.06 | 48.7 | 48.7 | 0.0 | T2→T2 |
| 두루미 (단정학) | VU | | `Decreasing` | 안정~소폭 감소 | −0.06 | −0.06 | 54.8 | 54.8 | 0.0 | T2→T2 |
| 산양 | VU | | `Decreasing` | 감소 | −0.06 | −0.06 | 55.2 | 55.2 | 0.0 | T2→T2 |
| 황새 | EN | | `Decreasing` | 감소 | −0.06 | −0.06 | 54.6 | 54.6 | 0.0 | T2→T2 |
| 호랑이 | EN | | `Decreasing` | 감소 | −0.06 | −0.06 | 54 | 54 | 0.0 | T2→T2 |
| 자바코뿔소 | CR | | `Stable` | 안정 (매우 적은 수) | 0.00 | 0.00 | 78 | 78 | 0.0 | T3→T3 |
| 수달 | VU | | `Increasing` | 증가 | +0.06 | +0.04 | 0 | 0 | 0.0 | T0→T0 |
| 한국늑대 | EX | | `Stable` | 절멸 | 0.00 | 0.00 | 100 | 100 | 0.0 | EX→EX |
| 꽃사슴 (한반도 아종) | EX | | `Increasing` | 절멸 | 0.00 | 0.00 | 100 | 100 | 0.0 | EX→EX |
| 양쯔강돌고래 (바이지) | EX | | `Decreasing` | 기능적 절멸 | 0.00 | 0.00 | 100 | 100 | 0.0 | EX→EX |
| 고래상어 | EN | | `Decreasing` | 감소 | −0.06 | −0.06 | — | — | — | 점수 없음 |
| 뱀장어 | EN | | `Decreasing` | 감소 | −0.06 | −0.06 | — | — | — | 점수 없음 |
| 한국산개구리 | VU | ★ | `Stable` | 감소 | 0.00 | −0.06 | — | — | — | 점수 없음 |

### 티어가 바뀌는 종 — 2종

| 한글명 | 점수 | 티어 | 개입 마감일 | 멸종 추정일 |
|---|---|---|---|---|
| 북극곰 | 14.5 → 44 | T0 → T2 | 2126-05-05 → 2068-05-04 | 2126-05-05 → 2072-04-16 |
| 한국호랑이 | 66.5 → 30.2 | T3 → T1 | 2062-05-04 → 2126-05-05 | 2063-03-16 → 2126-05-05 |

날짜만 바뀌고 티어는 유지되는 종 — 반달가슴곰
(개입 마감 2038-05-04 → 2044-09-27, 멸종 추정 2040-09-02 → 2047-05-04)

### 요약 수치

| 구분 | 종 수 |
|---|---:|
| 두 필드 모두 있음 | 19 |
| ├ 점수 변화 있음 | 6 |
| ├ 점수 변화 없음 (Δ = 0.0) | 10 |
| └ 점수 자체가 없음 | 3 |
| 티어가 바뀜 | 2 |
| \|Δ\| ≥ 10 | 2 (한국호랑이 36.3, 북극곰 29.5) |

---

## 부록 — 조사에 쓴 질의

```sql
-- 1
SELECT COUNT(*) FROM species WHERE is_curated=1;
SELECT COALESCE(iucn_population_trend,'(NULL)'), COUNT(*)
  FROM species WHERE is_curated=1 GROUP BY 1;
SELECT COUNT(*) FROM species
  WHERE is_curated=1 AND iucn_population_trend IS NOT NULL
    AND TRIM(COALESCE(population_trend,'')) <> '';

-- 5 (310종 집합)
SELECT COUNT(*) FROM species s JOIN tipping_points t ON t.species_id=s.id
  WHERE s.is_curated=1 AND s.category NOT IN ('EX','EW');
```

6절 계산은 `lib/tipping-point.ts` 를 Node v24.14.1 의 TypeScript 네이티브 실행으로
직접 import 하여 수행했다 (`node:sqlite` 읽기 전용 연결).
