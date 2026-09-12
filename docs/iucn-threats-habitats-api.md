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
