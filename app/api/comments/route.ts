import { NextResponse } from "next/server";
import { getSupabaseService, SupabaseConfigError } from "@/lib/supabase";
import {
  getClientIp,
  randomAnonName,
  MAX_CONTENT_LEN,
  MAX_NAME_LEN,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX,
  PUBLIC_COMMENT_COLUMNS,
} from "@/lib/comments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/comments?species_id=xxx&limit=10&offset=0
// 해당 종의 댓글을 최신순으로 반환 (삭제된 것 제외). author_ip 는 노출하지 않음.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const speciesId = (url.searchParams.get("species_id") ?? "").trim();
  if (!speciesId) {
    return NextResponse.json({ error: "species_id 가 필요합니다." }, { status: 400 });
  }
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 10)));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0));

  try {
    const sb = getSupabaseService();
    const { data, count, error } = await sb
      .from("comments")
      .select(PUBLIC_COMMENT_COLUMNS, { count: "exact" })
      .eq("species_id", speciesId)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const total = count ?? 0;
    return NextResponse.json({
      comments: data ?? [],
      total,
      hasMore: offset + (data?.length ?? 0) < total,
    });
  } catch (e) {
    return NextResponse.json({ error: friendly(e) }, { status: 500 });
  }
}

// POST /api/comments  body: { species_id, author_name?, content }
export async function POST(req: Request) {
  let body: { species_id?: string; author_name?: string; content?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const speciesId = (body.species_id ?? "").trim();
  const content = (body.content ?? "").trim();
  let authorName = (body.author_name ?? "").trim();

  if (!speciesId) {
    return NextResponse.json({ error: "species_id 가 필요합니다." }, { status: 400 });
  }
  if (content.length < 1) {
    return NextResponse.json({ error: "댓글 내용을 입력해주세요." }, { status: 400 });
  }
  if (content.length > MAX_CONTENT_LEN) {
    return NextResponse.json(
      { error: `댓글은 ${MAX_CONTENT_LEN}자 이하로 입력해주세요.` },
      { status: 400 }
    );
  }
  if (!authorName) authorName = randomAnonName();
  if (authorName.length > MAX_NAME_LEN) authorName = authorName.slice(0, MAX_NAME_LEN);

  const ip = getClientIp(req);

  try {
    const sb = getSupabaseService();

    // 스팸 방지: 같은 IP 가 최근 1분 내 3개 이상 작성했으면 거부
    if (ip !== "unknown") {
      const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
      const { count, error: rlErr } = await sb
        .from("comments")
        .select("id", { count: "exact", head: true })
        .eq("author_ip", ip)
        .gte("created_at", since);
      if (rlErr) throw rlErr;
      if ((count ?? 0) >= RATE_LIMIT_MAX) {
        return NextResponse.json(
          { error: "잠시 후 다시 시도해주세요. (1분에 3개까지 작성 가능)" },
          { status: 429 }
        );
      }
    }

    const { data, error } = await sb
      .from("comments")
      .insert({ species_id: speciesId, author_name: authorName, content, author_ip: ip })
      .select(PUBLIC_COMMENT_COLUMNS)
      .single();

    if (error) throw error;
    return NextResponse.json({ comment: data }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: friendly(e) }, { status: 500 });
  }
}

function friendly(e: unknown): string {
  if (e instanceof SupabaseConfigError) return e.message;
  return "댓글 처리 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.";
}
