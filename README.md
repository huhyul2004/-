# LastWatch

멸종위기종의 IUCN 등급·개체수·위협 자료와 LastWatch 자체 위험 점수(v5)를 보여주는 사이트.
운영: https://lastwatch-safe.vercel.app (`main` 브랜치가 Vercel 로 자동 배포된다)

- Next.js 14 App Router + better-sqlite3. 데이터는 `data/species.db` 하나이고 git 으로 함께 배포된다. 종 데이터는 런타임에 읽기만 하지만,
  `/api/recommend`·`/api/retrospective` 는 AI 응답 캐시 행을 같은 DB 에 쓴다 — 로컬에서는 추적 파일 `data/species.db` 자체가 바뀐다
  (Vercel 에서는 `/tmp` 사본). 커밋 전에 `git status data/` 를 확인한다.
- 위험 점수는 LastWatch 자체 계산이며 IUCN 공식 지표가 아니다. 계산식: `/methodology`, 종별 계산 근거: `/species/<id>/calculation`.
- 종 데이터 CSV: `/species/export` (`?scope=curated` 기본 · `scored` · `all`).

## 시작하기

```bash
npm install
cp .env.local.example .env.local   # 아래 "API 키 설정" 대로 값을 채운다
npm run dev                        # http://localhost:3000
```

| 명령 | 하는 일 |
|---|---|
| `npm run build` | 프로덕션 빌드 |
| `npx tsc --noEmit` | 타입 검사 |
| `npx vitest run` | 테스트 (`__tests__/`). 일부 테스트는 앱의 `getDb()` 로 DB 를 열어 WAL 설정을 건다 — 데이터는 바꾸지 않는다 |
| `npx tsx scripts/compute-tipping-points.ts` | 위험 점수 재계산 → `data/species.db` 의 `tipping_points` 갱신, `PRAGMA user_version` = 계산일 |
| `npx tsx --env-file=.env.local research/chatbot-eval/run_eval.ts` | 챗봇 평가셋 50문항 실행 (Gemini 호출) |

## API 키 설정

키는 **환경 변수로만** 넣는다. 코드·문서·커밋·이슈·채팅에 키 값을 붙여 넣지 않는다.

| 변수 | 쓰는 곳 | 발급 | 없으면 |
|---|---|---|---|
| `GEMINI_API_KEY` | 챗봇 `/api/chat`, 보전 전략 `/api/recommend`, 회고 `/api/retrospective` (`lib/gemini.ts`) | [Google AI Studio](https://aistudio.google.com/apikey) | 세 기능이 "점검 중" 안내(503)를 낸다. 나머지 사이트는 동작 |
| `ANTHROPIC_API_KEY` | `scripts/` 의 일회성 배치만 (`lib/anthropic.ts`). 웹 런타임은 읽지 않는다 | [Anthropic Console](https://console.anthropic.com/settings/keys) | 배치 스크립트만 멈춘다 |
| `IUCN_API_TOKEN` | IUCN 수집 스크립트만 — `sync_iucn_all.py` · `fetch_iucn_population.py` · `synonym_relookup.py` · `fetch_iucn_generation.py` · `fetch_iucn_taxonomy.py` · `scripts/sync-iucn-assessment-scope.ts`. 웹 런타임은 읽지 않는다 | [IUCN Red List API](https://api.iucnredlist.org) | 수집 스크립트만 멈춘다 |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | 댓글 기능 전체 — 보기·쓰기·좋아요·신고·관리 (`lib/supabase`, 서버 전용 비밀값은 SERVICE_ROLE_KEY) | Supabase 대시보드 → Project Settings → API | 댓글 기능 전체가 멈추고 댓글 영역이 숨겨진다 |
| `ADMIN_PASSWORD` | 댓글 관리 화면 `/admin/comments` | 운영자가 정하는 값 | 관리 화면만 멈춘다 |

**로컬** — `.env.local` 에 적는다. `.gitignore` 의 `.env*.local` 규칙으로 커밋되지 않는다.

**Vercel** — Project → Settings → Environment Variables 에 같은 이름으로 넣고(Production·Preview), 다시 배포한다.
`.env.local` 은 배포되지 않는다.

**지켜야 할 것**

- 비밀값에 `NEXT_PUBLIC_` 접두어를 붙이지 않는다 — 그 변수는 브라우저 번들에 그대로 들어간다.
- 키를 쓰는 코드는 서버 라우트·`lib/` 에만 둔다. `"use client"` 컴포넌트에서 `process.env` 의 비밀값을 읽지 않는다.
- Gemini 키는 요청 헤더 `x-goog-api-key` 로만 보낸다. URL 쿼리(`?key=`)·로그·응답 본문에 넣지 않는다.
  오류는 `friendlyError` 가 사용자용 문장으로 바꿔 돌려준다 (키·원본 오류 메시지를 화면에 내보내지 않는다).
- `__tests__/secrets.test.ts` 가 추적 파일에 키 형식 문자열이나 `.env.local` 의 실제 값(일부라도)이 들어 있으면 실패한다.
  커밋 전에 `npx vitest run` 을 돌린다.

**키가 노출됐을 때** (채팅·스크린샷·커밋 등에 키 값이 한 번이라도 나갔다면)

1. 발급처에서 그 키를 **즉시 폐기(삭제)** 하고 새 키를 만든다 — 키 값을 지우는 것만으로는 안전하지 않다.
   Google AI Studio → API keys / Anthropic Console → API Keys / IUCN 계정 페이지.
2. 새 키를 `.env.local` 과 Vercel 환경 변수에 넣고 다시 배포한다.
3. 커밋에 들어갔다면 이력에서도 지우고(푸시 전이면 해당 커밋을 고쳐 쓴다), 공개 저장소에 이미 올라갔다면 1번이 먼저다.

## 데이터와 문서

- 스키마 변경은 `scripts/migrate-*.ts` (기본 dry-run, `--apply` 때 백업 후 적용, `--rollback`).
- 결정 대기 항목: `docs/decisions-pending.md`. 엔진 변경 영향: `docs/max-blending-impact-2026-10-03.md`.
- 작업 전 상태 기록: `docs/pre-work-state-2026-10-03.md`. IUCN 토큰 후속 작업: `docs/iucn-token-checklist-2026-10-03.md`.
