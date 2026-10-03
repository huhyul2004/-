# IUCN 토큰으로 할 일 — 체크리스트 (2026-10-03)

로드맵은 "IUCN_TOKEN 발급 후 할 일" 을 요청했지만, 토큰은 **이미 발급되어 쓰이고 있다.**
이 문서는 지금 토큰으로 할 수 있는 일과, 각 일을 끝냈을 때 확인할 것을 순서대로 적는다.

## 0. 현재 상태 (2026-10-03 확인)

| 항목 | 상태 |
|---|---|
| 변수 이름 | **`IUCN_API_TOKEN`** (`.env.local`, 36자). 예전 `.env.local.example` 의 `IUCN_TOKEN` 은 어디서도 읽지 않는 이름이었다 — 2026-10-03 정정 |
| 유효성 | `GET https://api.iucnredlist.org/api/v4/information/api_version` → **HTTP 200** `{"api_version":"v4"}` (2026-10-03, 토큰 값은 출력하지 않음) |
| 읽는 코드 | 수집 스크립트만 — `sync_iucn_all.py`(+ 같은 TOKEN 을 쓰는 `migrate_threat_hierarchy.py`) · `fetch_iucn_population.py` · `synonym_relookup.py` · `fetch_iucn_generation.py` · `fetch_iucn_taxonomy.py` · `scripts/sync-iucn-assessment-scope.ts`. 웹 런타임은 읽지 않는다 (Vercel 에 넣을 필요 없음). 2026-10-03 전까지 네 스크립트(population·synonym·generation·taxonomy)는 `.env` 만 열어 `.env.local` 의 토큰을 못 읽었다 — 이제 환경 변수 → `.env` → `.env.local` 순으로 `IUCN_API_TOKEN` 줄만 읽는다 |
| 지금까지 쓴 곳 | 평가 동기화 2026-07-26~29 (`species.iucn_synced_at`, 4,048종) · 위협·서식지·보전 활동 수집 2026-09-12 (`species.iucn_details_synced_at`, 4,026종) |
| 화면 반영 | 챗봇 답변 끝 "IUCN API 조회일", 계산 근거 페이지, CSV 의 `iucn_synced_kst` · `iucn_details_synced_kst` 가 위 두 컬럼을 읽는다 |

## 1. 데이터 갱신 — 기존 스크립트 재실행 (v5 계산 무변경)

- [ ] **개체수 미조회 79종**에 `fetch_iucn_population.py` 재실행 — 예상 +~6종 점수 (`docs/v5-coverage-scope.md` §4 1번)
- [ ] **미동기화 175종** 학명 재매칭(`synonym_relookup.py`) 후 개체수 조회 — 예상 +~13종 (같은 문서 2번, 카카포·목화머리타마린 포함)
- [ ] **평가 재동기화** — 2026-07 이후 IUCN 이 새로 낸 평가 반영 (`sync_iucn_all.py`). 바뀐 등급·연도·개체수 종 목록을 남긴다
- [ ] **사이트 표시 등급과 IUCN API 등급이 다른 종** — 점수 행이 있는 941종 중 38종 (예: 북극고래 사이트 LC / API VU, 바이지 사이트 EX / API CR).
      재동기화 뒤 다시 세고, 어느 쪽을 표시할지 결정 대기에 올린다 (챗봇은 지금 두 값을 함께 싣는다)
- [ ] **위협·서식지 미수집 종** — 수기 시드 22종(예: 자바코뿔소)은 `iucn_details_synced_at` 이 비어 있다. IUCN 행을 더할지(수기 행과의 중복 처리) 정한다
- [ ] **평가 범위 바로잡기 (결정 대기 항목 12)** — 점수 종 중 지역(유럽) 평가가 저장된 16종(14종은 그 개체수를 N0 로 씀)과
      종 단위 평가에 연결된 아종 14종(3종은 종 전체 개체수를 N0 로 씀). `sync_iucn_all.py` 의 `pick_latest()` 가 범위(scopes 에 Global)와
      평가 대상(taxon)을 확인하도록 고친 뒤 재동기화 → `tsx --env-file=.env.local scripts/sync-iucn-assessment-scope.ts --all` 로 다시 확인
- [ ] 세대시간 단위 확인 — 스코트나무타기캥거루 `iucn_generation_length` 3650 (일 단위로 보임, `docs/data-quality-suspects-2026-08-27.md` §2). 값은 고치지 말고 API 원문 단위를 먼저 확인

## 2. Damuth K 선행조건 ① — 서식 면적 (결정 대기 항목 2)

- [ ] assessment 응답에서 서식 면적 후보 필드를 확인 — `supplementary_info` 안의 AOO(점유 면적)·EOO(출현 범위) 계열 키.
      `/api/v4/assessment/{id}` 는 스펙에 응답 스키마가 비어 있어(`docs/iucn-threats-habitats-api.md` §1) 실제 응답 키 이름을 표본으로 확인해야 한다
- [ ] AOO 와 EOO 중 무엇을 K 의 A 로 쓸지 결정 — 결정 대기 항목 2 에 선택지로 올린다 (EOO 는 서식하지 않는 땅까지 포함해 K 를 키운다)
- [ ] `species.habitat_area_km2` 에 채우는 스크립트 — `scripts/migrate-*.ts` 관례(기본 dry-run · `--apply` 백업 · `--rollback`)
- [ ] 채운 뒤 `npx tsx scripts/compute-tipping-points.ts` 로 재계산하기 **전에** 영향 측정 — Damuth K 가 적용되는 종(포유류만, 상수 검증 범위)과 점수·티어 변화
- [ ] 결정 대기 항목 10(Ricker 폭주)도 함께 다시 센다 — K 가 바뀌면 N > K 폭주 빈도가 바뀐다

## 3. 매번 갱신 뒤 확인

- [ ] `npx vitest run` — 회귀 기대값(바키타 100 · 자바코뿔소 78 · 한국호랑이 75.2) 과 비밀값 검사 통과
- [ ] `research/decisions_recount_2026-10-03.ts` 로 결정 대기 숫자 재집계, `docs/decisions-pending.md` 갱신
- [ ] `PRAGMA user_version` 이 재계산 날짜인지 (챗봇 "LastWatch DB v…" 가 이 값이다), `data/species.db-wal` 이 비었는지
- [ ] 챗봇 평가셋 재실행 — `npx tsx --env-file=.env.local research/chatbot-eval/run_eval.ts` (점수가 바뀐 종의 기대값 확인)
- [ ] 커밋 → `main` 병합 → 운영에서 `/species/rhinoceros-sondaicus/calculation` · `/species/export` · 챗봇 출처 줄 확인

## 4. 토큰 관리

- [ ] 토큰은 `.env.local` 에만 둔다. 커밋·문서·채팅에 붙여 넣지 않는다 (`__tests__/secrets.test.ts` 가 추적 파일을 검사한다)
- [ ] 노출이 의심되면 IUCN 계정 페이지에서 폐기·재발급 후 `.env.local` 교체 (README "API 키 설정")
- [ ] 호출 간격 0.5초 이상 유지 (2026-09-12 수집 기준, 4,026종 1시간 10분)
