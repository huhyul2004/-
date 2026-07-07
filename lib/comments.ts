// 댓글 시스템 공용 유틸 (서버 라우트에서 사용)

/** 익명 닉네임용 동물 목록 (20종 이상) */
export const ANON_ANIMALS = [
  "수달", "호랑이", "팬더", "여우", "너구리", "삵", "담비", "고라니",
  "반달곰", "표범", "스라소니", "물범", "돌고래", "수리부엉이", "황새",
  "따오기", "두루미", "저어새", "산양", "하늘다람쥐", "도롱뇽", "청개구리",
  "장수풍뎅이", "물장군", "맹꽁이",
];

/** "익명의OO" 형태의 닉네임 생성 (index 미지정 시 회전용 seed 사용) */
export function randomAnonName(seed?: number): string {
  const i =
    seed === undefined
      ? Math.floor((Date.now() / 1000) % ANON_ANIMALS.length)
      : seed % ANON_ANIMALS.length;
  return `익명의${ANON_ANIMALS[i]}`;
}

/** x-forwarded-for 우선으로 클라이언트 IP 추출 */
export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return (
    req.headers.get("x-real-ip") ??
    req.headers.get("cf-connecting-ip") ??
    "unknown"
  );
}

export const MAX_CONTENT_LEN = 1000;
export const MAX_NAME_LEN = 40;
export const RATE_LIMIT_WINDOW_MS = 60_000; // 1분
export const RATE_LIMIT_MAX = 3; // 1분당 3개
export const AUTO_DELETE_REPORTS = 3; // 신고 3회 누적 시 자동 삭제

/** 응답에 노출해도 안전한 댓글 컬럼 (author_ip 제외 — 개인정보) */
export const PUBLIC_COMMENT_COLUMNS =
  "id, species_id, author_name, content, likes, created_at";
