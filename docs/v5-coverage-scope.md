# v5 점수 커버리지 — 늘릴 수 있는 범위

조사일 2026-09-12. 읽기 전용 조사다. 코드·v5 계산·floor·Ne/Nc 는 바꾸지 않았다.
표본 조회(40종) 외에 API 로 DB 를 고치지 않았다.

---

## 1. 점수가 붙는 조건 — 개체수 하나뿐

`scripts/compute-tipping-points.ts` 가 `species` 전체(`SELECT * FROM species ORDER BY id`, 26행)를 돌며
`evaluateTippingPoint` 를 부르고, `null` 이면 행을 지운다(42 · 50–53행).

| 조건 | 위치 |
|---|---|
| EX/EW → 입력 없이 점수 100 | `lib/tipping-point.ts:568-570` |
| 그 밖 → 개체수가 있어야 함, 없으면 `null`(점수 없음) | `lib/tipping-point.ts:573-574` |
| 개체수 = `mature_individuals` > 0 → 없으면 `iucn_population_size` > 0 → 없으면 `data_insufficient` | `lib/tipping-point.ts:805-811` |

`class_name` · 추세 · `mass_g` · 세대 길이 · criteria 는 점수 유무를 가르지 않는다(값만 바꾸거나 쓰이지 않음).
**위협·서식지·보전활동은 점수 계산에 들어가지 않는다** — `lib/tipping-point.ts` 에 참조 없음.

## 2. 현재

| 항목 | 종 수 |
|---|---:|
| `tipping_points` | 941 (큐레이티드 580 + 비큐레이티드 361) |
| 규칙상 자격 | 941 — 행과 1:1 일치 |
| 큐레이티드 | 4,230 |
| 큐레이티드 점수 있음 | 580 (EX/EW 270 · `iucn_population_size` 297 · `mature_individuals` 13) |
| 큐레이티드 점수 없음 | **3,650** |
| **지금 데이터로 바로 점수를 붙일 수 있는 종** | **0** (재계산만으로는 1종도 늘지 않는다) |
| 비큐레이티드 중 개체수 있는데 점수 없음 | 0 |

## 3. 점수 없는 큐레이티드 3,650종 — 왜 없나

| 사유 | 종 수 | 등급 |
|---|---:|---|
| IUCN 평가에 `supplementary_info.population_size` 가 비어 있음 | 3,390 | — |
| IUCN 미동기화 (`iucn_assessment_id` 없음) | 175 | CR 10 · EN 13 · VU 10 · NT 15 · LC 127 |
| 평가 ID 는 있으나 개체수 조회 안 됨 (`iucn-population-fetch.json` 에 없음) | 79 | CR 9 · EN 2 · VU 7 · NT 5 · LC 56 |
| `population_size` 가 `"0"` | 3 | Partula arguta · Litoria castanea · Aloe bellatula (전부 CR) |
| `population_size` 가 숫자 없는 글 | 3 | — |
| 합계 | 3,650 | |

`fetch_iucn_population.py` 는 `supplementary_info.population_size` 만 읽는다(100행). 3,390종은 파서 문제가 아니라
**IUCN 이 그 칸을 비워 둔 것**이다 — 동기화된 큐레이티드 4,048종 중 이 칸이 채워진 종은 308종(7.6%).

## 4. 늘릴 수 있는 길 — 크기와 조건

| # | 방법 | 대상 | 예상 증가 | 조건 · 비고 |
|---|---|---:|---:|---|
| 1 | 개체수 미조회 79종에 `fetch_iucn_population.py` 재실행 | 79 | ~6 | 코드 변경 없음. 7.6% 기준 추정 |
| 2 | 미동기화 175종 학명 재매칭(`synonym_relookup.py`) 후 개체수 조회 | 175 | ~13 (상한 175) | 매칭 실패 원인별 처리 필요. 카카포(Strigops habroptila)·목화머리타마린(Saguinus oedipus) 포함 |
| 3 | 평가 본문 `documentation.population` 에서 수치 추출 | 611 (CR/EN/VU) · 3,390 전체 | 표본상 최대 ~27% | 아래 표본 참조. 밀도·조사 개체수·하위개체군 수가 섞여 있어 **총 성숙 개체수로 바로 쓸 수 없다**. 사람 또는 LLM 추출 + 검증, 출처를 `iucn_population_size` 와 분리한 새 칸이 필요 |
| 4 | IUCN criteria 로 개체수 상한 추정 (D: ≤1,000 등 · C: <250/2,500/10,000) | D 58 · C 14 | 72 | **v5 계산 변경** — `inferPopFromCriterion`(`lib/tipping-point.ts:767`)은 남아 있으나 호출되지 않는다. 되살리면 v5 가 바뀌므로 이번 범위 밖 |

1·2 는 기존 파이프라인 재실행이라 v5 를 바꾸지 않고 입력만 늘린다. 합쳐도 약 20종 규모다.
의미 있는 규모(수백 종)는 3(본문 추출) 또는 4(계산 변경)로만 가능하다.

### 3번 표본 — `documentation.population`

점수 없는 CR/EN/VU 중 `population_size` 가 빈 611종에서 무작위 40종(seed 20260912)을 조회.

| 항목 | 종 수 |
|---|---:|
| 본문 있음 | 34 / 40 |
| 본문에 "숫자 + individuals/adults/pairs/…" 표현 | 11 / 40 |
| `supplementary_info.population_size` 있음 | 0 / 40 |

11종의 표현 예 — 총 개체수로 쓸 수 있는 것과 없는 것이 섞여 있다:

| 종 | 등급 | 본문 표현 | 총 개체수로 |
|---|---|---|---|
| Mammillaria luethyi | VU | "estimated population of less than 200 individuals" | 상한값 |
| Romanichthys valsanicola | CR | "increase to c. 200 individuals in 2003" | 가능 (연도 오래됨) |
| Eucalyptus leucoxylon | VU | "known from more than 2,000 individuals" | 하한값 |
| Cremnomys elvira | CR | "only 12 adults were recorded" | 조사 개체수 — 아님 |
| Oophaga histrionica | CR | "27 individuals were recorded" | 조사 개체수 — 아님 |
| Pithecia albicans | VU | "8.8 individuals/km²" | 밀도 — 아님 |
| Callicebus oenanthe | CR | "1.4 individuals per ha" | 밀도 — 아님 |
| Vipera darevskii | CR | "10 to 12 animals per hectare" | 밀도 — 아님 |
| Arthrocereus glaziovii | EN | "subpopulations … less than 100 individuals" | 하위개체군 — 아님 |
| Fouquieria columnaris | VU | "analysis of 3,780 individuals" | 표본 크기 — 아님 |

표본 40종 중 총 개체수로 쓸 만한 것은 2–3종이다. 3번의 실제 증가는 27% 가 아니라 **대략 5–8%** 로 보는 편이 맞다
(611종 기준 30–50종, 3,390종 기준 170–270종 — 추정, 표본 40종).

## 5. 결론

- 지금 데이터로 점수를 더 붙일 수 있는 종은 **0종**이다. 개체수가 유일한 관문이다.
- v5 를 건드리지 않고 늘릴 수 있는 것은 기존 스크립트 재실행(1·2번) **약 20종**.
- 수백 종 규모는 IUCN 본문에서 개체수를 뽑는 새 데이터 작업(3번) 또는 criteria 기반 추정 복원(4번, v5 변경)이 필요하다.
