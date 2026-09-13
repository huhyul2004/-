# 댓글 기능 보안 — RLS 정책 점검

작성 2026-09-13. 근거는 저장소의 `supabase/migrations/0001_comments.sql` 과 댓글 API 코드다.
실제 Supabase 프로젝트에 이 마이그레이션이 적용됐는지는 확인하지 못했다(접속 정보 없음).
**이 문서의 SQL 은 아무것도 적용하지 않았다.**

---

## 0. 전제 — 누가 어떤 키로 접근하는가

| 접근 경로 | 키 | RLS |
|---|---|---|
| 사이트의 댓글 API (`app/api/comments/**`, `app/api/admin/comments`) | `SUPABASE_SERVICE_ROLE_KEY` (`getSupabaseService`) | **우회한다** |
| Supabase REST(PostgREST)·RPC 로 직접 | anon 키 (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) | 적용된다 |

- 코드 안에서 anon 클라이언트(`getSupabaseAnon`)를 부르는 곳은 없다. 사이트 동작에는 anon 키가 필요 없다.
- 그러나 anon 키는 공개를 전제로 만든 키다(`NEXT_PUBLIC_` 접두어, Supabase 설계상 브라우저에 노출돼도 되는 키).
  프로젝트 URL 과 anon 키를 아는 사람은 누구나 REST 로 테이블에 직접 요청할 수 있고, 그때 막는 것은 **RLS 정책뿐**이다.
- Supabase 는 기본 설정에서 `public` 스키마 테이블에 `anon`·`authenticated` 역할 권한을 준다. 그래서 행 단위 접근은 사실상 정책이 결정한다.

아래 1~3절은 "마이그레이션 파일 그대로 적용된 상태에서 anon 키로 직접 요청하면" 가능한 일이다.

## 1. IP 가 공개되는 경로

| 테이블 | 정책 (파일 행) | 공개되는 것 | 요청 예 |
|---|---|---|---|
| `comments` | `"댓글 읽기" FOR SELECT USING (is_deleted = false)` (26–27) | 삭제 안 된 모든 댓글의 **`author_ip`** — 정책은 행만 거르고 컬럼은 거르지 않는다 | `GET /rest/v1/comments?select=author_name,author_ip,created_at` |
| `comment_likes` | `"좋아요 읽기" FOR SELECT USING (true)` (46) | 모든 좋아요의 **`liker_ip`** + 어느 댓글에 눌렀는지 | `GET /rest/v1/comment_likes?select=comment_id,liker_ip` |
| `comment_reports` | `"신고 읽기(관리자)" FOR SELECT USING (true)` (66) — 이름은 "관리자" 지만 조건이 `true` | 모든 신고의 **`reporter_ip`** + 신고 사유 | `GET /rest/v1/comment_reports?select=*` |

- 사이트 API 자체는 IP 를 내보내지 않는다. 목록은 `PUBLIC_COMMENT_COLUMNS = "id, species_id, author_name, content, likes, created_at"` 만 고른다(`lib/comments.ts`).
  IP 노출은 API 를 거치지 않는 직접 요청 경로에서만 생긴다.
- IP 는 `getClientIp` 가 `x-forwarded-for` 첫 값 → `x-real-ip` → `cf-connecting-ip` 순으로 뽑아 저장한다.

## 2. API 제한을 우회하는 경로

API 가 지키는 규칙과 DB 가 지키는 규칙이 다르다.

| API 의 규칙 (`app/api/comments/route.ts`) | DB 에도 있나 | 직접 INSERT 로 우회 |
|---|---|---|
| 1분에 같은 IP 3개까지 (`RATE_LIMIT_MAX`) | 없음 | `comments` 쓰기 정책이 `WITH CHECK (true)` (29–30) → 제한 없이 대량 작성 |
| 내용 1~1000자 | 있음 (`CHECK (char_length(content) BETWEEN 1 AND 1000)`) | 우회 불가 |
| 닉네임 40자 (`MAX_NAME_LEN`), 비면 익명 동물 이름 | 없음 | 임의 길이 닉네임 |
| `author_ip` 는 서버가 요청에서 뽑음 | 없음 | **`author_ip` 를 아무 값이나(또는 NULL) 넣을 수 있다** → 관리자 화면의 IP 기록을 속이고 IP 기준 제한을 흐림 |
| `likes`·`is_deleted`·`created_at` 은 기본값 | 없음 | 작성할 때 `likes = 9999`, 미래 `created_at` 등 원하는 값으로 넣을 수 있다 |

신고와 좋아요도 같은 방식이다.

- **신고 자동 삭제 악용** — `comment_reports` 쓰기 정책이 `WITH CHECK (true)` (65).
  1. 서로 다른 가짜 `reporter_ip` 로 신고 행 2개를 직접 넣는다.
  2. 사이트에서 신고 버튼을 한 번 누른다.
  3. 신고 API 는 행 수를 세어 3 이상이면 `is_deleted = true` 로 바꾸므로(`AUTO_DELETE_REPORTS = 3`), **아무 댓글이나 숨길 수 있다.**
- **좋아요 부풀리기** — `comment_likes` 쓰기 정책이 `WITH CHECK (true)` (47).
  - 좋아요 API 는 `likes` 컬럼을 `comment_likes` 행 수로 다시 계산한다(주석: "comment_likes 테이블 count 를 진실의 원천으로").
  - 가짜 `liker_ip` 로 행을 직접 넣어 두면, 누군가 그 댓글에 좋아요를 누르는 순간 늘어난 수가 `likes` 에 반영된다.
- **좋아요 RPC** — `adjust_comment_likes` 함수는 `SECURITY DEFINER` 가 아니다.
  - `comments` 에 UPDATE 정책이 없으므로, anon 이 RPC 로 불러도 RLS 때문에 바뀌는 행은 0이다(파일 기준).
  - 다만 함수 실행 권한 자체는 막혀 있지 않다.

## 3. 남의 좋아요를 지우는 경로

- `comment_likes` 의 `"좋아요 삭제" FOR DELETE USING (true)` (48) — 조건 없이 누구나 어떤 행이든 지울 수 있다.
  예: `DELETE /rest/v1/comment_likes?comment_id=eq.<댓글 id>` → 그 댓글의 좋아요 기록 전부 삭제.
- 효과:
  - `likes` 숫자는 다음에 누군가 좋아요 API 를 부를 때 남은 행 수로 다시 계산되므로 줄어든다.
  - 지워진 IP 는 "아직 안 누름" 상태가 되어 다시 누를 수 있다.
  - 자기 행을 지우고 다시 누르는 반복도 가능하다(API 는 IP 당 1행만 허용하지만, 지우는 쪽이 막혀 있지 않다).

## 4. 제안 SQL 전문 (적용하지 않음)

사이트는 service_role 로만 접근하므로, anon·authenticated 역할의 직접 접근을 **전부** 막아도 사이트 동작은 바뀌지 않는다.
컬럼 하나만 `REVOKE SELECT (author_ip)` 하는 방식은 테이블 단위 SELECT 권한이 남아 있으면 효과가 없다 —
그래서 테이블 권한 자체를 회수한다(이전 보고의 컬럼 단위 REVOKE 제안을 이 방식으로 바로잡는다).

```sql
-- LastWatch 댓글 — anon/authenticated 직접 접근 차단
-- 전제: 사이트의 모든 댓글 읽기·쓰기는 서버 API 가 service_role 키로 한다 (RLS·권한 우회).
-- 적용 전 백업·검토 필요. 이 파일의 SQL 은 저장소에서 실행된 적 없다.

BEGIN;

-- 1) 쓰기·삭제 정책 제거 (조건이 true 라 누구나 가능하던 것)
DROP POLICY IF EXISTS "익명 댓글 쓰기"   ON comments;
DROP POLICY IF EXISTS "좋아요 쓰기"      ON comment_likes;
DROP POLICY IF EXISTS "좋아요 삭제"      ON comment_likes;
DROP POLICY IF EXISTS "신고 쓰기"        ON comment_reports;

-- 2) IP 가 보이던 읽기 정책 제거
DROP POLICY IF EXISTS "좋아요 읽기"      ON comment_likes;
DROP POLICY IF EXISTS "신고 읽기(관리자)" ON comment_reports;
DROP POLICY IF EXISTS "댓글 읽기"        ON comments;

-- 3) 테이블 권한 회수 — 정책이 없어도 RLS 가 켜져 있으면 행이 안 보이지만, 권한까지 회수해 이중으로 막는다
REVOKE ALL ON TABLE comments        FROM anon, authenticated;
REVOKE ALL ON TABLE comment_likes   FROM anon, authenticated;
REVOKE ALL ON TABLE comment_reports FROM anon, authenticated;

-- 4) 좋아요 증감 RPC 는 서버만
REVOKE EXECUTE ON FUNCTION adjust_comment_likes(UUID, INT) FROM PUBLIC, anon, authenticated;

-- 5) RLS 는 켠 채로 둔다 (정책 0개 + RLS on = anon 은 아무 행도 못 봄)
ALTER TABLE comments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_likes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_reports ENABLE ROW LEVEL SECURITY;

COMMIT;
```

적용 후 확인용 조회 (읽기만):

```sql
-- 남은 정책 — 세 테이블 모두 0행이어야 한다
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies WHERE tablename IN ('comments', 'comment_likes', 'comment_reports');

-- anon/authenticated 에 남은 테이블 권한 — 0행이어야 한다
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_name IN ('comments', 'comment_likes', 'comment_reports')
  AND grantee IN ('anon', 'authenticated');

-- RPC 실행 권한 — anon/authenticated 가 없어야 한다
SELECT grantee, privilege_type FROM information_schema.routine_privileges
WHERE routine_name = 'adjust_comment_likes';
```

나중에 브라우저에서 anon 키로 직접 댓글을 읽게 바꾸려면, 그때 IP 컬럼을 뺀 컬럼 단위 권한을 준다
(예: `GRANT SELECT (id, species_id, author_name, content, likes, created_at) ON comments TO anon;`
+ `USING (is_deleted = false)` 읽기 정책). 지금 코드에는 그런 경로가 없다.

## 5. 댓글을 켜기 전에 해야 할 순서 (권고)

1. **Supabase 프로젝트 확인·복구** — 프로젝트가 살아 있는지(일시정지면 복구) 대시보드에서 확인.
2. **현재 상태 조회** — SQL Editor 에서 4절 확인용 조회 3개를 먼저 실행해, 마이그레이션이 적용됐는지·어떤 정책이 있는지 본다.
   - 테이블이 없으면 `0001_comments.sql` 을 먼저 적용한다.
3. **기존 데이터 점검** — 이미 댓글·좋아요·신고 행이 있다면, 지금까지 `author_ip`·`liker_ip`·`reporter_ip` 가 anon 키로 읽을 수 있는 상태였다는 뜻이다. 보존·삭제 여부를 정한다.
4. **4절 제안 SQL 검토 후 적용** — 적용 전 백업.
5. **확인 조회 재실행** — 정책 0개, anon/authenticated 권한 0개, RPC 권한 없음.
6. **anon 키로 직접 요청해 거부되는지 확인** — `GET /rest/v1/comments?select=author_ip` 가 빈 결과 또는 권한 오류여야 한다.
7. **Vercel 환경변수** — `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (서버 전용 — 로그·클라이언트에 노출 금지), 관리자 화면을 쓸 경우 `ADMIN_PASSWORD`.
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` 는 현재 코드에서 쓰지 않는다.
8. **재배포** 후 사이트에서 댓글 작성 → 좋아요 → 좋아요 취소 → 신고 → (관리자) 삭제·복원을 한 번씩 확인.
9. **IP 헤더 확인** — `getClientIp` 는 `x-forwarded-for` 첫 값을 믿는다. 배포 환경에서 이 헤더를 클라이언트가 조작할 수 있는지(프록시가 덮어쓰는지) 확인하지 않았다 — 조작 가능하면 API 경유로도 IP 제한을 우회할 수 있다.
