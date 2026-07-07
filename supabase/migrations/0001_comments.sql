-- LastWatch 댓글 시스템 마이그레이션
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하세요.
-- (원본 스펙의 잘린 부분을 정합성 있게 복원 + 중복 방지 제약 추가)

-- =====================================================================
-- 1. 댓글 테이블
-- =====================================================================
CREATE TABLE IF NOT EXISTS comments (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  species_id  TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_ip   TEXT,
  content     TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 1000),
  likes       INTEGER NOT NULL DEFAULT 0,
  is_deleted  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comments_species ON comments(species_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_ip_time ON comments(author_ip, created_at DESC);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- 삭제되지 않은 댓글만 공개 읽기
CREATE POLICY "댓글 읽기" ON comments
  FOR SELECT USING (is_deleted = false);
-- 익명 댓글 쓰기 허용 (검증은 API Route 에서)
CREATE POLICY "익명 댓글 쓰기" ON comments
  FOR INSERT WITH CHECK (true);

-- =====================================================================
-- 2. 좋아요 중복 방지 테이블
-- =====================================================================
CREATE TABLE IF NOT EXISTS comment_likes (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  liker_ip   TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (comment_id, liker_ip)   -- 같은 IP 는 댓글당 한 번만
);

CREATE INDEX IF NOT EXISTS idx_likes_comment ON comment_likes(comment_id);

ALTER TABLE comment_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "좋아요 읽기" ON comment_likes FOR SELECT USING (true);
CREATE POLICY "좋아요 쓰기" ON comment_likes FOR INSERT WITH CHECK (true);
CREATE POLICY "좋아요 삭제" ON comment_likes FOR DELETE USING (true);

-- =====================================================================
-- 3. 신고 테이블
-- =====================================================================
CREATE TABLE IF NOT EXISTS comment_reports (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  comment_id  UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  reporter_ip TEXT NOT NULL,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (comment_id, reporter_ip)  -- 같은 IP 는 댓글당 한 번만 신고
);

CREATE INDEX IF NOT EXISTS idx_reports_comment ON comment_reports(comment_id);

ALTER TABLE comment_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "신고 쓰기" ON comment_reports FOR INSERT WITH CHECK (true);
CREATE POLICY "신고 읽기(관리자)" ON comment_reports FOR SELECT USING (true);

-- =====================================================================
-- 4. 원자적 좋아요 증감 RPC (경쟁 상태 방지)
-- =====================================================================
CREATE OR REPLACE FUNCTION adjust_comment_likes(target UUID, delta INT)
RETURNS INTEGER
LANGUAGE sql
AS $$
  UPDATE comments
     SET likes = GREATEST(0, likes + delta),
         updated_at = now()
   WHERE id = target
  RETURNING likes;
$$;
