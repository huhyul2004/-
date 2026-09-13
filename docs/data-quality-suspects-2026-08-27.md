# 데이터 의심 항목 — 미해결

작성 2026-08-27. **DB 는 수정하지 않았다.** 두 건 모두 기록만 한다.

---

## 1. class_name ↔ IUCN 분류 불일치 (27종) — 수정 보류

재현: `python3 research/audit_class_name.py` (읽기 전용)

### 왜 문제인가

`lib/tipping-point.ts` 의 `lifeFor()` 가 `class_name` 으로 생활사 파라미터
(`generation_time` · `r_max` · `ne_nc`) 를 고른다. 틀리면 v5 점수가 틀린
파라미터로 계산되고, 빈 값이면 `DEFAULT_LIFE` (5 / 0.1 / 0.15) 로 떨어진다.

| 잘못 적용되는 값 | generation_time | r_max | ne_nc |
|---|---:|---:|---:|
| 파충류 (현재) | 10 | 0.06 | 0.15 |
| 조류 (정답) | 5 | 0.10 | 0.20 |

### 규모

| 구분 | 종 수 |
|---|---:|
| 큐레이티드 종 | 4,230 |
| `iucn_class` 없음 (대조 불가) | 316 |
| v5 에 대응 키 없는 분류 | 3 |
| 대조 가능 | 3,911 |
| **불일치** | **27** |
| `class_name` 이 빈 값 → `DEFAULT_LIFE` | **727** |

불일치 27종보다 **빈 값 727종이 규모가 크다.** 둘 다 같은 경로(`lifeFor`)를 탄다.

### 방향별

| 현재 class_name | 정답 (iucn_class 기준) | 종 수 |
|---|---|---:|
| 파충류 | 조류 | 24 |
| 양치식물 (속새류) | 식물 (소철) | 1 |
| 이매패류 | 복족류 | 1 |
| 어류 | 어류 (조기어류) | 1 |

### 전체 목록

`개체수` 가 있는 종은 v5 점수가 실제로 산출되므로 지금도 틀린 값으로 계산되고 있다 (22종).

| 종 | 등급 | 현재 | 정답 | iucn_class | iucn_order | 개체수 |
|---|---|---|---|---|---|---:|
| 언덕소철 | CR | 양치식물 (속새류) | 식물 (소철) | CYCADOPSIDA | CYCADALES | — |
| 뱀장어 | EN | 어류 | 어류 (조기어류) | ACTINOPTERYGII | ANGUILLIFORMES | — |
| 나수투스라니스테스 | CR | 이매패류 | 복족류 | GASTROPODA | — | — |
| 관주머니새 | CR | 파충류 | 조류 | AVES | PASSERIFORMES | 25 |
| 뉴칼레도니아올빼미야행조 | CR | 파충류 | 조류 | AVES | CAPRIMULGIFORMES | 25 |
| 레이산오리 | CR | 파충류 | 조류 | AVES | ANSERIFORMES | 590 |
| 마사푸에라 까투리새 | CR | 파충류 | 조류 | AVES | PASSERIFORMES | 210 |
| 마스카렌슴새 | CR | 파충류 | 조류 | AVES | PROCELLARIIFORMES | 150 |
| 사회성물떼새 | CR | 파충류 | 조류 | AVES | CHARADRIIFORMES | 11 |
| 상투메따오기 | CR | 파충류 | 조류 | AVES | PELECANIFORMES | 915 |
| 섭정꿀빨새 | CR | 파충류 | 조류 | AVES | PASSERIFORMES | 375 |
| 세이셸올빼미 | CR | 파충류 | 조류 | AVES | STRIGIFORMES | 240 |
| 아라리페솔다디뉴 | CR | 파충류 | 조류 | AVES | PASSERIFORMES | 425 |
| 아처종달새 | CR | 파충류 | 조류 | AVES | PASSERIFORMES | 149 |
| 아프리카펭귄 | CR | 파충류 | 조류 | AVES | SPHENISCIFORMES | 19,800 |
| 인도수독수리 | CR | 파충류 | 조류 | AVES | ACCIPITRIFORMES | 10,000 |
| 자바파랑딱새 | CR | 파충류 | 조류 | AVES | PASSERIFORMES | 550 |
| 주황배개미새 | CR | 파충류 | 조류 | AVES | PASSERIFORMES | 149 |
| 청색플라이캐처 | CR | 파충류 | 조류 | AVES | PASSERIFORMES | 60 |
| 캘리포니아콘도르 | CR | 파충류 | 조류 | AVES | CATHARTIFORMES | 93 |
| 톱니부리비둘기 | CR | 파충류 | 조류 | AVES | COLUMBIFORMES | 100 |
| 투구새 | CR | 파충류 | 조류 | AVES | BUCEROTIFORMES | — |
| 트리니다드파이핑완 | CR | 파충류 | 조류 | AVES | GALLIFORMES | 240 |
| 필리핀독수리 | CR | 파충류 | 조류 | AVES | ACCIPITRIFORMES | 526 |
| 후드독수리 | CR | 파충류 | 조류 | AVES | ACCIPITRIFORMES | 131,000 |
| 흰날개보풀꼬리새 | CR | 파충류 | 조류 | AVES | GRUIFORMES | 149 |
| 흰등독수리 | CR | 파충류 | 조류 | AVES | ACCIPITRIFORMES | — |

---

## 2. 스코트나무타기캥거루 세대시간 3650 — 단위 미확인, 값 유지

| 항목 | 값 |
|---|---|
| 종 | `Dendrolagus scottae` / 스코트나무타기캥거루 (`wd-q209159`) |
| `iucn_generation_length` | 3650.0 |
| `iucn_generation_length_raw` | `"3650"` |
| IUCN SIS id | 6435 |
| assessment id | 21956375 |
| 평가 연도 | 2019 |
| 동기화 시각 | 2026-07-26T06:04:02Z |

### 값이 어디서 왔나

`fetch_iucn_generation.py:84` 가 IUCN API v4 `/assessment/{id}` 의
`supplementary_info.generational_length` 를 그대로 가져온다.
`parse_gen()` 은 `float()` 만 하고 **단위 변환을 하지 않는다.**

API 응답 캐시(`data/iucn-generation-fetch.json`)에도 평가ID `21956375` 가
`{"gen": 3650.0, "raw": "3650"}` 로 남아 있다 — **파싱 오류가 아니라 원천 값 그대로**다.

### 일(day) 단위로 의심하는 근거

| 근거 | 값 |
|---|---|
| 3650 ÷ 365 | 정확히 **10.0** |
| 같은 속 `Dendrolagus pulcherrimus` | **10.0** (raw `"10"`, 2016년 평가) |
| 같은 속 `Dendrolagus lumholtzi` | 8.0 (raw `"8"`, 2016년 평가) |
| 같은 과 MACROPODIDAE 세대시간 범위 | 3.5 ~ 3650 (이 종 제외 시 3.5~10) |

형제종이 10년인데 이 종만 3650이고, 3650/365 가 정확히 10이다.

### 확인 경로 — 현재 전부 막힘

| 경로 | 결과 |
|---|---|
| IUCN API v4 `/assessment/21956375` 재조회 | **HTTP 403** — `IUCN_TOKEN` 미설정 (`.env.local` 에 없음) |
| Red List 공개 페이지 `iucnredlist.org/species/6435/21956375` | **HTTP 403** — 봇 차단 |
| 저장소 내 원 응답 캐시 | raw `"3650"` 만 있고 단위 표기 없음 |
| IUCN 문서상 필드 단위 정의 | 저장소 내 기록 없음 |

**결론: 원천 확인 불가. 값은 그대로 둔다.**
`IUCN_TOKEN` 을 넣으면 `python3 fetch_iucn_generation.py` 로 재조회해 확인할 수 있다.

### 같은 의심이 걸리는 다른 값

캐시 전체에서 세대시간 100 초과는 5건이고, 이 종을 뺀 4건은 전부 식물이라 값 자체는 자연스럽다.

| 평가ID | 값 | 종 | 판단 |
|---|---:|---|---|
| 21956375 | 3650 | 스코트나무타기캥거루 (포유류) | **의심** |
| 2841558 | 1000 | 세쿼이아 | 식물 — 자연스러움 |
| 243386884 | 500 | 푸르푸시소철 | 식물 — 자연스러움 |
| 126604124 | 388 | 포키에리아 칼룸나리스 | 식물 — 자연스러움 |
| 243427216 | 200 | 동케이프 블루 소철 | 식물 — 자연스러움 |

### 영향

`docs/v5-r-estimation-2026-08-26.md` 의 49종에 이 종이 포함된다.
세대시간 3650 으로 계산한 `r_user` 는 **−0.0001** 로, CR 등급에 80% 감소를
선언한 종이 사실상 "변화 없음" 이 된다. 10년으로 보면 `ln(0.2)/30 = −0.0536` 이다.
