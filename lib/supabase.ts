import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// 댓글/좋아요/신고 시스템 전용 Supabase 클라이언트.
// 종(species) 데이터는 여전히 로컬 SQLite(lib/db.ts)에 있고, 이 클라이언트는
// 사용자 생성 콘텐츠(UGC)만 다룬다.

export class SupabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseConfigError";
  }
}

const URL_ERR =
  "댓글 서비스가 잠시 점검 중이에요. 운영자가 환경 설정을 확인하면 곧 복구됩니다.";

function url(): string {
  const v = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!v || v === "undefined" || v === "null" || !/^https?:\/\//.test(v)) {
    throw new SupabaseConfigError(URL_ERR);
  }
  return v;
}

let _anon: SupabaseClient | null = null;
let _service: SupabaseClient | null = null;

/**
 * anon 키 클라이언트 — RLS 정책이 적용된다. 공개 읽기/쓰기(댓글 조회·작성·좋아요·신고)에 사용.
 * 서버·클라이언트 양쪽에서 안전하게 사용 가능.
 */
export function getSupabaseAnon(): SupabaseClient {
  if (_anon) return _anon;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!key || key === "undefined" || key === "null") {
    throw new SupabaseConfigError(URL_ERR);
  }
  _anon = createClient(url(), key, { auth: { persistSession: false } });
  return _anon;
}

/**
 * service_role 키 클라이언트 — RLS를 우회한다. **서버에서만** 사용.
 * (관리자 대시보드, 신고 3회 누적 자동 삭제 등 권한 상승이 필요한 작업)
 * 클라이언트 번들에 절대 포함되면 안 된다.
 */
export function getSupabaseService(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new SupabaseConfigError("service_role 클라이언트는 서버에서만 사용할 수 있습니다.");
  }
  if (_service) return _service;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key || key === "undefined" || key === "null") {
    throw new SupabaseConfigError(URL_ERR);
  }
  _service = createClient(url(), key, { auth: { persistSession: false } });
  return _service;
}
