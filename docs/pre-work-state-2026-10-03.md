# 작업 전 상태 — 2026-10-03

"LastWatch 챗봇 완성 로드맵" 작업을 시작하기 직전의 저장소·DB·운영 사이트 상태를 기록한다.
이 문서 작성 시점까지 코드·DB 는 아래 §1 의 주석 보존 커밋 외에 바꾸지 않았다.

---

## 1. 미커밋 변경 — `lib/tipping-point.ts` 주석 51줄

| 항목 | 내용 |
|---|---|
| 상태 | 작업 디렉터리에 미커밋 변경 1개 파일 (`lib/tipping-point.ts`, +51 / −5줄), 수정 시각 2026-09-17 16:30 |
| 성격 | **주석만.** 주석·공백을 제거한 코드는 HEAD 와 동일함을 문자열 리터럴을 보존하는 간이 토크나이저로 확인 |
| 내용 | Layer 3 Ne 흐름, (1) 3레이어 산출, (2) 고정 가중치 vs 명세서 신뢰도 동적 가중치, (3-a) 레이어별 다수결 문턱 vs 명세서 H=60, (4) m 분기의 명세서 α/β/γ 대응(m≥2 블렌딩 미구현, m=0 0.70 vs 0.60), (3-b) 저신뢰 압축, (5) 개체수 하한이 합의점수를 덮어쓰는 지점 |
| 결정 | **보존** — EWS·신뢰도·m 분기와 그 주변 계산 흐름에 관한 주석이라 지시 기준(EWS·신뢰도·m 분기 관련이면 보존)에 해당 |
| 커밋 | `b6c139e` 엔진 흐름 주석 보존 (계산 무변경) |
| 후속 | m≥2 주석의 "max 블렌딩 미구현"은 블렌딩 구현 커밋에서 함께 고친다 |

## 2. 브랜치·원격

| 항목 | 값 |
|---|---|
| 작업 브랜치 | `research-lastwatch-vs-iucn` — `84d3685` (원격보다 1커밋 앞섬, 미푸시) → 주석 보존 후 `b6c139e` |
| `main` / `origin/main` | `039524b` "research-lastwatch-vs-iucn 병합 — EWS 현재 상태 공개, 한계 절 정리" |
| 원격 | `origin` = `https://github.com/huhyul2004/-.git` — **공개 저장소** (비인증 GitHub API HTTP 200) |
| 배포 | `main` → `https://lastwatch-safe.vercel.app` (Vercel Git 연동으로 추정. 저장소에 `vercel.json`·`.vercel/` 없음, Vercel CLI 미로그인) |

`main` 반영 여부는 운영 `/methodology` 에 `039524b` 의 EWS 4개 값 표(`88.08`·`66.08`)·`#ews`·`#confidence`·`#spec-diff` 앵커가
모두 있는 것으로 확인했다.

## 3. 다른 세션의 여섯 커밋 (2026-09-13)

| 커밋 | 내용 | 코드·DB 영향 |
|---|---|---|
| `ebe0017` | 위험 점수 계산식 페이지 `/methodology` 신설. 엔진 숫자를 `V5_SPEC` 이름 붙인 상수로 옮김(값·연산 순서 무변경, 941종 payload 차이 0). 종 목록 산출 범위 문구, 메뉴 "계산식" | 표시·상수 정리. 점수 무변경 |
| `1e0a04c` | `docs/ews-layer-audit.md`·`docs/confidence-audit.md` 조사 문서. 푸터 METHODOLOGY → `/methodology` | 문서·링크 |
| `f194883` | 종 상세 "신뢰도 60% (모든 종 동일 …)" 표시, `/methodology#confidence` 절 | 표시만 |
| `c2b32ee` | `docs/ews-timeseries-options.md` — EWS 시계열 데이터 경로 조사(IUCN 과거 평가·LPD·BioTIME·GBIF) | 문서만 |
| `47683fc` | EWS 현재 상태 공개 — 4개 값 표(DB 집계), 종 상세 "(추세 기반 추정값)", 한계 절 정리·`#spec-diff` | 표시만 |
| `84d3685` | `docs/decisions-pending.md` 에 7(EWS)·8(신뢰도)·9(다수결 문턱) 추가 | 문서만 |

그보다 앞선 다른 세션 작업 중 이번 로드맵과 직접 닿는 것:

| 커밋 | 내용 |
|---|---|
| `d8584a0` (09-12) | **IUCN 위협·서식지·보전활동 수집 — 4,026종 중 3,903종** |
| `89ae4b7`·`25578a4`·`06d8968` | 위협 상위 분류·시기(timing)·코드 표시, AI 보전 전략에 위협 계층·시기 전달 |
| `6758790` | v5 점수 커버리지 확장 범위 조사 — 지금 데이터로 추가 가능 0종, IUCN 재실행으로 ~20종 |
| `cda655c` | `species.db` VACUUM (58.7 → 19.5 MiB) |

## 4. DB (`data/species.db`)

| 항목 | 값 |
|---|---|
| MD5 | `f881fffea27213e3c02cd48c7c46694a` |
| 크기 | 20,463,616 B (19.5 MiB) |
| species | 41,282행 (큐레이티드 4,230) |
| tipping_points | 941행 = 계산 310 + 절멸·야생절멸 631 (100 고정) |
| threats | **2,196종 · 8,718행** |
| habitats | **3,905종** |
| conservation_actions | **1,756종** |
| threats.timing | Ongoing 7,763 · Past, Unlikely to Return 466 · Future 293 · Past, Likely to Return 93 · Unknown 46 · NULL 57 |

## 5. 운영 사이트 (`lastwatch-safe.vercel.app`)

| 경로 | 결과 |
|---|---|
| `/` | HTTP 200 |
| `/methodology` | HTTP 200 — `039524b` 내용 반영 |
| `/species/rhinoceros-sondaicus` | HTTP 200 |
| `/species/rhinoceros-sondaicus/calculation` | HTTP 404 (이번 작업에서 신설 예정) |
| `/species/export` | HTTP 404 (이번 작업에서 신설 예정) |
| `POST /api/chat` (자바코뿔소 "개체수가 몇 마리야?") | HTTP 200 — 전체 76 / 성숙 18 을 출처와 함께 답함. Gemini 키가 운영 환경에 설정되어 있음 |

## 6. 비밀값

| 항목 | 결과 |
|---|---|
| `.env.local` | git 미추적, 이력에도 없음. 키 이름: `IUCN_API_TOKEN`(값 있음) · `GEMINI_API_KEY`(값 있음). `ANTHROPIC_API_KEY` 는 없음 |
| 추적 파일 속 키 문자열 | `sk-ant-…` · `AIza…` · `AQ.…` 패턴 0건 |
| 대화창 노출 | 2026-08-26 세션에서 Anthropic 키와 Gemini 키가 대화창에 붙여넣어짐 — **키 폐기·재발급은 각 콘솔에서 사용자가 해야 한다** |
| IUCN 토큰 이름 | 코드가 읽는 이름은 `IUCN_API_TOKEN` (sync_iucn_all.py 등). `.env.local.example` 의 `IUCN_TOKEN` 은 어디서도 읽지 않는 틀린 이름 |

## 7. 결정 대기 항목 (작업 전)

`docs/decisions-pending.md` 9건 — 1 개체수 floor · 2 Damuth K · 3 Ne/Nc · 4 floor LC/VU 예외 ·
5 class_name(해결) · 6 damuthConstant 단위·fallback · 7 EWS 시계열 · 8 신뢰도 · 9 다수결 문턱.
이번 로드맵은 1·2(Ne/Nc 기록)·6·7·8·9(평가셋)·10~14 를 다룬다 — 로드맵의 결정 번호는 이 문서의 항목 번호와 다르다.

## 8. 이 문서 초안의 정정

초안은 `.env.local` 키를 "`ANTHROPIC_API_KEY`·`GEMINI_API_KEY`, `IUCN_TOKEN` 없음" 으로 적었으나 틀렸다.
9월 조사 기록(`docs/iucn-threats-habitats-api.md`)을 다시 확인하지 않고 옮겼고, 셸 환경에서 `IUCN_TOKEN` 이라는
**틀린 이름**만 찾았다. 실제로는 `IUCN_API_TOKEN` 이 값과 함께 들어 있다 (§6 표는 고친 값).

## 9. 2026-10-03 로드맵 답변의 정정

같은 날 앞선 답변에서 "위협·서식지 18~22종, IUCN_TOKEN 이 가장 값싼 다음 단계" 라고 했으나 틀렸다.
DB 를 다시 보지 않고 09-12 기준 숫자를 그대로 말했다. 실제로는 `d8584a0` 에서 이미 수집되어
위협 2,196종 · 서식지 3,905종 · 보전활동 1,756종이 들어 있다.
