# IUCN API — 위협·서식지·보전활동 수집 가능성 조사

조사일 2026-09-12. `IUCN_TOKEN` 없이 확인할 수 있는 범위만 다룬다. 사실과 표만 담는다.

---

## 1. API v4 문서 — assessment 응답에 필드가 있는가

토큰 없이 받아지는 것은 `https://api.iucnredlist.org/api-docs/v4/openapi.yaml` 하나뿐이다
(OpenAPI 3.0.1, 68,105 B, 경로 50개). 나머지 문서 URL 은 모두 HTTP 403.

| URL | 결과 |
|---|---|
| `/api-docs/v4/openapi.yaml` | **200** |
| `/api-docs/v4/openapi.json` | 403 |
| `/api-docs/index.html` | 403 |
| `/` | 403 |

### `/api/v4/assessment/{assessment_id}` — 응답 스키마가 비어 있다

```yaml
  "/api/v4/assessment/{assessment_id}":
    get:
      summary: Retrieves an assessment
      description: Returns assessment data for a supplied <code>assessment_id</code>.
        This endpoint returns the same assessment data that you would see on an assessment
        page on the IUCN Red List website. Accepts both latest and historic <code>assessment_id</code>.
      security:
      - Bearer: []
      responses:
        '200':
          description: assessment found
          content:
            application/json:
              schema:
                type: object
                properties: {}
                required:
                - assessment_id
```

- 응답 스키마가 `properties: {}` 로 **비어 있어** threats · habitats · conservation_actions 필드의
  존재 여부와 이름을 문서로 확인할 수 없다.
- 설명문은 "Red List 웹사이트 평가 페이지와 같은 데이터를 반환한다" 고 적는다.
- 이 파이프라인은 이미 같은 엔드포인트에서 스펙에 없는 `supplementary_info.generational_length`
  (`fetch_iucn_generation.py:84`) 와 `population_trend` · `red_list_category` 를 받아 쓰고 있다.
  즉 실제 응답에는 스펙에 적히지 않은 중첩 필드가 들어 있다.

**필드 구조와 이름의 확인은 토큰이 필요하다.** 토큰으로 assessment 하나를 받아 키 목록을 보면 된다.

### 코드별 역방향 엔드포인트 — 스펙에 있다

| 경로 | 설명 (스펙 원문 요약) |
|---|---|
| `/api/v4/threats/` | 위협 코드 목록 |
| `/api/v4/threats/{code}` | 해당 위협 코드의 최신 평가 목록. 하위 위협(예: 2_1)은 별도 요청 필요 |
| `/api/v4/habitats/` | 서식지 코드 목록 (IUCN Habitats Classification Scheme v3.1) |
| `/api/v4/habitats/{code}` | 해당 서식지 코드의 최신 평가 목록 |
| `/api/v4/conservation_actions/` · `/{code}` | 보전 활동 코드 목록 · 코드별 평가 목록 |

이 경로들은 "코드 → 평가 목록" 방향이라, 종별 위협을 얻으려면 모든 코드를 순회해 역으로 모아야 한다.
모두 Bearer 토큰이 필요하다.

## 2. 현재 파이프라인 — 수집 코드 없음

| 스크립트 | 줄 수 | threats · habitats · conservation 언급 |
|---|---:|---|
| `sync_iucn_all.py` | 333 | 없음 |
| `fetch_iucn_generation.py` | 106 | 없음 |
| `fetch_iucn_population.py` | 121 | 없음 |
| `fetch_iucn_taxonomy.py` | 125 | 없음 |
| `sync_iucn_test.py` | — | 없음 |

### 추가할 위치

`sync_iucn_all.py` 의 `fetch_species()` 가 이미 `api_get(f"assessment/{aid}")` 로 상세 응답(`detail`)을
받고 있고, `if detail:` 블록(137행 부근)에서 `population_trend` · `red_list_category` · `criteria` ·
`url` · `possibly_extinct` 만 읽는다. **추가 API 호출 없이 이 블록에서 위협·서식지·보전활동을 읽으면 된다.**

저장은 기존 테이블 `threats` · `habitats` · `conservation_actions` 에 행을 넣는 방식이라 스키마 변경이 필요 없다.
현재 `UPDATE_SQL` 은 `species` 의 `iucn_*` 컬럼만 갱신하므로 별도 INSERT 가 필요하다.

## 3. 캐시된 응답 — 위협 데이터 0종

| 파일 | 항목 수 | 담긴 것 | threats · habitats |
|---|---:|---|---|
| `data/iucn-generation-fetch.json` | 4,036 | `{gen, raw}` 추출값만 | 없음 |
| `data/iucn-population-fetch.json` | 3,952 | `{pop, raw}` 추출값만 | 없음 |
| `data/iucn-taxonomy-fetch.json` | 3,999 | `{kingdom … family}` 추출값만 | 없음 |

세 캐시 모두 **원 응답이 아니라 추출한 값만** 저장한다. 위협·서식지를 캐시에서 되살릴 수 없다.

## 4. DB 현황

| 테이블 | 행이 있는 종 (전체) | 큐레이티드 |
|---|---:|---:|
| `threats` | 18 | 18 |
| `habitats` | 22 | 22 |
| `conservation_actions` | 18 | 18 |

전부 수기 입력된 간판종이다. 점수가 계산된 310종 중 위협 정보가 있는 종은 **13종**, 없는 종 **297종**.

### IUCN 링크 — 지금 만들 수 있음

| 항목 | 종 수 |
|---|---:|
| `iucn_url` 보유 | 4,048 |
| `iucn_sis_id` 보유 | 4,048 (위와 같은 종 집합) |
| 링크 가능 (둘 중 하나) | **4,048** (큐레이티드 4,230종 중) |
| 점수가 계산된 310종 중 링크 가능 | **310** (전부) |

`iucn_url` 형식: `https://www.iucnredlist.org/species/{sis_id}/{assessment_id}`.

## 5. 토큰이 필요한 부분

| 항목 | 토큰 없이 | 토큰 필요 |
|---|---|---|
| assessment 응답에 threats 등 필드가 있는가 | 스펙상 미기재까지 확인 | **필드 존재·이름 확인** |
| 필드 구조 (코드·타이밍·심각도 등) | — | **확인** |
| 코드별 역방향 엔드포인트 | 스펙에 존재 확인 | **호출** |
| 종별 위협 수집 | — | **전부** |

`.env.local` 에는 `ANTHROPIC_API_KEY` · `GEMINI_API_KEY` 만 있고 `IUCN_TOKEN` 은 없다.

---

## 6. 토큰 확인 결과 (2026-09-12, `IUCN_API_TOKEN` 추가 후)

`GET /api/v4/assessment/13090494` (Aaptosyax grypus) → **HTTP 200**. 최상위 키에
`threats` · `habitats` · `conservation_actions` 가 모두 있다 (그 밖에 `stresses` · `use_and_trade` ·
`systems` · `locations` 등 33개).

| 필드 | 원소 키 | DB 저장 |
|---|---|---|
| `threats[]` | `code` · `description.en` · `severity` · `timing` · `scope` · `score` · `internationalTrade` · `ancestry` · `virus` · `ias` · `text` | `threat_code`=code, `threat_name`=description.en, `severity`=severity |
| `habitats[]` | `code` · `description.en` · `suitability` · `season` · `majorImportance` | `habitat_name`=description.en, `suitability`=suitability |
| `conservation_actions[]` | `code` · `description.en` · `note` | `action_code`=code, `action_name`=description.en |

예 — threats 원소:

```json
{"scope": "Majority (50-90%)", "timing": "Ongoing", "score": "Medium Impact: 7",
 "severity": "Rapid Declines", "description": {"en": "Intentional use: (subsistence/small scale) [harvest]"},
 "code": "5_4_1", "internationalTrade": null, "ancestry": null, "virus": null, "ias": null, "text": null}
```

- 저장할 컬럼이 없어 **`timing`(Ongoing/Future/Past…) · `scope` · `score` · `season` · `majorImportance` 는 저장하지 않는다.**
  → `threats` 에는 과거 위협(timing=Past)도 현재 위협과 구분 없이 들어간다.
- 이름은 IUCN 영문 그대로다 (수기 시드는 한국어).
- 같은 `code` 가 여러 번 나오면(계절별 서식지 등) 첫 항목만 남긴다.

### 수집 방식

`sync_iucn_all.py` — `fetch_species()` 의 `if detail:` 블록에서 `parse_details()` 로 읽고,
UPDATE 성공 후 `insert_details()` 로 INSERT 한다(신규 동기화 경로).
이미 동기화된 4,048종은 `--details` 백필로 받는다 — 저장된 `iucn_assessment_id` 로 상세만 받아
같은 두 함수를 쓴다(종당 1콜, `species` 컬럼·점수 미변경, 행이 챗봇 링크와 같은 평가에서 나옴).

- 수기 시드 22종은 `SEED_IDS` 로 고정해 건너뛴다. 세 테이블 중 한 곳만 비어 있어도(예: 여행비둘기 위협 0행)
  IUCN 행을 넣지 않는다 — 한 종 안에서 출처가 섞이지 않게.
- 기존 행은 지우거나 고치지 않는다. 행이 이미 있는 종은 건너뛴다(재실행 안전).
- 진행 캐시 `data/iucn-details-fetch.json` (종별 aid·결과·항목 수). 재실행 시 캐시에 있는 종은 건너뛴다.

### 수집 결과 (2026-09-12)

대상 4,026종 (`iucn_assessment_id` 보유 4,048종 − 수기 시드 22종). 시험 10종 + 전체 4,016종,
종당 약 1.0초(호출 간 0.5초 지연), 소요 1시간 9분 46초. 실패(404·네트워크·401/403) **0**, 429 백오프 로그 없음.

| 결과 | 종 수 |
|---|---:|
| 행 삽입 | 3,903 |
| 평가에 세 항목 모두 없음 (`empty`) | 123 |

| 테이블 | 수집 전 행 / 종 | 수집 후 행 / 종 | IUCN 수집분 행 / 종 |
|---|---:|---:|---:|
| `threats` | 53 / 18 | 8,718 / 2,196 | 8,665 / 2,178 |
| `habitats` | 40 / 22 | 12,917 / 3,905 | 12,877 / 3,883 |
| `conservation_actions` | 51 / 18 | 5,191 / 1,756 | 5,140 / 1,738 |

IUCN 수집분 4,026종 중 세 항목 모두 채워진 종 1,490 · 하나 이상 3,903 · 없음 123.
점수 계산 종(`tipping_points` 941종) 중 위협 보유 18 → **444종**.

검증

- 수기 시드 22종: 세 테이블 행 144줄을 수집 전과 비교 — 동일 (MD5 `ba4a6f002279ee577451b4a1eb0234fe` 전후 일치).
  시드 종에 코드 달린(IUCN) 행 0.
- `species` · `tipping_points` 테이블 내용 해시 백업과 일치 — 점수·등급 변동 없음.
- `pragma integrity_check` ok.
- 백업 `data/species.db.backup_before_iucn_details_20260912-164238`
  (MD5 `4c711dbf87cb70ae4243b4b296023643`). 수집 후 `data/species.db` (WAL 체크포인트 후)
  MD5 `06edc39a1a31f04e4a47fa5c3a69d2aa`.
- 챗봇 POST (HTTP 200): 메콩자이언트연어잉어(시험 10종)·셰셀찌르레기(전체 수집분, 점수 계산 종)에
  "이 종의 주요 위협은 뭐야?" — 수집된 위협을 `[출처: threats]` 로 인용, 목록 밖 위협 서술 없음.

### 남은 문제 — 하위 항목 이름만으로는 뜻이 안 서는 위협

`description.en` 은 **맨 아래 항목 이름만** 준다. 상위 분류 없이 읽으면 무엇인지 알 수 없는 이름이 있다.

| threat_name | 행 | 종 | 코드 | 상위 분류 |
|---|---:|---:|---|---|
| Named species | 418 | 374 | 8_x_2 | 8_1 외래 침입종 / 8_2 문제성 토착종 … |
| Scale Unknown/Unrecorded | 344 | 266 | 2_x_4 | 2_1 작물 / 2_2 조림 / 2_3 가축 … |
| Unspecified species | 243 | 214 | 8_x_1 | 위와 같음 |

합계 1,005행 / 717종 (IUCN 위협 8,665행 중). 셰셀찌르레기 챗봇 답변에서 8_1_2 와 8_2_2 가
둘 다 "Named species" 라 한 항목으로 합쳐졌다. → 7절에서 해결.

---

## 7. 위협 상위 분류 · 시기 (2026-09-12)

### 위협 코드 체계 — `GET /api/v4/threats/`

HTTP 200, 130개 코드, **3단계** (대분류 12 · 중분류 45 · 세분류 73). 저장: `data/iucn-threat-codes.json`.
상위는 코드에서 역산된다 — `8_1_2` 의 상위는 `8_1`, 대분류는 `8`. 130개 모두 상위 코드가 목록에 있다.

| 대분류 | 이름 |
|---|---|
| 1 | Residential & commercial development |
| 2 | Agriculture & aquaculture |
| 3 | Energy production & mining |
| 4 | Transportation & service corridors |
| 5 | Biological resource use |
| 6 | Human intrusions & disturbance |
| 7 | Natural system modifications |
| 8 | Invasive and other problematic species, genes & diseases |
| 9 | Pollution |
| 10 | Geological events |
| 11 | Climate change & severe weather |
| 12 | Other options |

세분류 이름 12개가 여러 코드에 겹친다(Named species ×4 · Unspecified species ×4 · Scale Unknown/Unrecorded ×4 ·
Motivation Unknown/Unrecorded ×4 · Type Unknown/Unrecorded ×5 · Persecution/control ×3 · Intentional use … ×2 등).
이 이름을 쓰는 행은 5절의 3개 이름(1,005행)보다 넓은 **3,306행 / 1,780종**이다.

### 새 컬럼 (`threats`)

| 컬럼 | 내용 | 채우는 법 |
|---|---|---|
| `threat_parent` | 바로 위 분류 이름 (대분류 코드 행은 NULL, 중분류 코드 행은 대분류 이름) | 코드에서 역산 — API 재조회 없음 |
| `threat_category` | 대분류 이름 | 코드에서 역산 — API 재조회 없음 |
| `timing` | Ongoing · Future · Past, Unlikely to Return · Past, Likely to Return · Unknown | `iucn-details-fetch.json` 에 없어(종별 개수만 저장) **재조회** |

기존 `threat_name` 은 그대로다. 수기 시드 행(`threat_code` NULL)은 새 컬럼도 NULL.
스크립트 `migrate_threat_hierarchy.py` (컬럼 추가 · 상위 채우기 · `--timing` 재조회).
timing 재조회는 행을 넣을 때와 같은 평가(`iucn-details-fetch.json` 의 aid 와 일치 확인)를 받아
`(species_id, threat_code)` 로 맞춘다. 진행 캐시 `data/iucn-threat-timing-fetch.json`.
`sync_iucn_all.py` 의 `insert_details()` 도 앞으로 세 컬럼을 함께 넣는다.

### 같은 이름이 상위로 갈리는가

| threat_name | 코드 | 상위 (threat_parent) | 행 |
|---|---|---|---:|
| Named species | 8_1_2 | Invasive non-native/alien species/diseases (외래 침입종) | 330 |
| | 8_2_2 | Problematic native species/diseases (문제성 토착종) | 56 |
| | 8_5_2 | Viral/prion-induced diseases | 27 |
| | 8_4_2 | Problematic species/disease of unknown origin | 5 |
| Intentional use (species is the target) | 5_1_1 | Hunting & trapping terrestrial animals (육상 사냥·포획) | 537 |
| | 5_2_1 | Gathering terrestrial plants (식물 채취) | 114 |
| Intentional use: (subsistence/small scale) [harvest] | 5_4_1 | Fishing & harvesting aquatic resources (어획) | 85 |
| | 5_3_1 | Logging & wood harvesting (벌채) | 22 |
| Scale Unknown/Unrecorded | 2_1_4 | Annual & perennial non-timber crops | 184 |
| | 2_3_4 | Livestock farming & ranching | 101 |
| | 2_2_3 | Wood & pulp plantations | 55 |
| | 2_4_3 | Marine & freshwater aquaculture | 4 |

Named species 418행은 상위 4개로 갈리고 상위가 빈 행은 0. 침입종(8_1_2)과 어획·사냥 대상(5_x_1)은 대분류부터 다르다.

### 챗봇

`app/api/chat/route.ts` — IUCN 위협(코드 있음)을 `대분류 > 중분류 > 항목 (코드)` 경로로 적고 **시기별 줄로 나눈다**
(진행 중 · 앞으로 예상 · 과거-재발 가능 · 과거-재발 가능성 낮음 · 시기 미상 · 시기 기록 없음).
과거 줄에는 "현재 진행 중 아님" 을 붙인다. 수기 시드 위협(코드 없음)은 예전처럼 이름만.
시스템 프롬프트 `[위협]` — 상위 분류와 함께 쓰고, 같은 항목 이름이라도 상위가 다르면 합치지 않으며,
과거 위협을 현재 위협으로 서술하지 않는다. 위협은 점수 계산에 들어가지 않으므로 v5 영향 없음.

챗봇 POST (HTTP 200):

| 종 | 질문 | 결과 |
|---|---|---|
| 지위안 전나무 (Abies ziyuanensis) — Past 위협 있음 | 주요 위협, 진행 중·과거 구분 | 진행 중 2개(2_3_4 · 10_3)와 과거 1개(5_3_1 벌채, Past, Unlikely to Return — 현재 진행 중 아님)를 나눠 답함 |
| 와이오밍 두꺼비 (Anaxyrus baxteri) — Named species 2건 | 주요 위협 | 8_1_2 외래 침입종 > Named species 와 8_2_2 문제성 토착종 > Named species 를 **따로** 답함 (이전 셰셀찌르레기 답변에서는 한 항목으로 합쳐졌음) |

종 상세 페이지(`app/species/[id]/page.tsx:221`) · 절멸 페이지(`app/extinct/[id]/page.tsx:103`) ·
`/api/recommend` 는 여전히 `threat_name` 만 보여 준다 — 이번 범위(챗봇) 밖, 미변경.

### 결과

상위 분류: IUCN 위협 8,665행 전부 `threat_category` · `threat_parent` 채움 (코드 목록에 없는 코드 0).

timing 재조회: 대상 2,178종(IUCN 위협 행이 있는 종) — 시험 10 + 본 실행 2,132 + 재시도 36 = **2,178종 갱신**,
코드 불일치 0 · 평가 ID 변경 0 · 최종 실패 0. 본 실행 중 노트북이 배터리 잠자기에 들어가
네트워크 오류 36종이 났고(캐시에 기록하지 않아 저장된 값 없음) 재시도에서 모두 받았다.
본 실행 5시간 30분 중 대부분은 잠자기 시간이다(깨어 있는 동안 종당 약 1초).

| timing | 행 | 종 |
|---|---:|---:|
| Ongoing | 7,763 | 2,006 |
| Past, Unlikely to Return | 466 | 255 |
| Future | 293 | 195 |
| Past, Likely to Return | 93 | 57 |
| Unknown | 46 | 28 |
| NULL (IUCN 응답에 timing 없음) | 4 | 3 |

과거 위협(Past…)이 있는 종 **290종** — 이전에는 현재 위협과 구분 없이 챗봇에 나갔다.

검증

- 수기 시드 22종: 세 테이블 원래 컬럼 144줄 전후 동일 (MD5 `ba4a6f002279ee577451b4a1eb0234fe`).
  시드 위협 53행 중 새 컬럼이 채워진 행 0.
- `species` · `tipping_points` 내용 해시 백업과 일치 — v5 점수·floor·Ne/Nc 변동 없음. habitats 12,917 · actions 5,191 행 그대로.
- `pragma integrity_check` ok. 타입체크(`tsc --noEmit`) — 이번 변경 파일 오류 0
  (`__tests__/regression.test.ts` 의 기존 오류 12개는 7월 커밋 `c0177ae` 부터 있던 것, 미변경).
- 백업 `data/species.db.backup_before_threat_hierarchy_20260912-180914` (MD5 `df93b3a4d9fa68742f194329238ec837`).
  수정 전 `data/species.db` MD5 `06edc39a1a31f04e4a47fa5c3a69d2aa` → 수정 후 (WAL 체크포인트 후)
  `f657067bdf8a012b40db3d282eaea6ec`.
