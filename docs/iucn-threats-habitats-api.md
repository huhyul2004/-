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
둘 다 "Named species" 라 한 항목으로 합쳐졌다. `threat_code` 는 저장돼 있으므로
`/api/v4/threats/` 코드 목록(1콜)으로 상위 이름을 붙이면 되돌릴 수 있다 — 저장 형식을 바꾸는 결정이라 적용하지 않았다.
