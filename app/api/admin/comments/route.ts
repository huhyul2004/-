import { NextResponse } from "next/server";
import { getSupabaseService, SupabaseConfigError } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 관리자 인증 — ADMIN_PASSWORD 와 대조. 미설정 시 fail-closed.
function authorized(req: Request): boolean {
  const expected = process.env.ADMIN_PASSWORD?.trim();
  if (!expected) return false;
  const given = req.headers.get("x-admin-password")?.trim();
  return !!given && given === expected;
}

// GET — 전체 댓글(삭제 포함) + 신고 수, 신고 많은 순 정렬
export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }
  try {
    const sb = getSupabaseService();

    const { data: comments, error: cErr } = await sb
      .from("comments")
      .select("id, species_id, author_name, author_ip, content, likes, is_deleted, created_at")
      .order("created_at", { ascending: false });
    if (cErr) throw cErr;

    const { data: reports, error: rErr } = await sb
      .from("comment_reports")
      .select("comment_id, reason");
    if (rErr) throw rErr;

    const countByComment = new Map<string, number>();
    for (const r of reports ?? []) {
      countByComment.set(r.comment_id, (countByComment.get(r.comment_id) ?? 0) + 1);
    }

    const withCounts = (comments ?? []).map((c) => ({
      ...c,
      report_count: countByComment.get(c.id) ?? 0,
    }));
    // 신고 많은 순 → 최신순
    withCounts.sort((a, b) => b.report_count - a.report_count || (a.created_at < b.created_at ? 1 : -1));

    return NextResponse.json({ comments: withCounts });
  } catch (e) {
    return NextResponse.json({ error: friendly(e) }, { status: 500 });
  }
}

// PATCH — 댓글 삭제/복원  body: { id, action: "delete" | "restore" }
export async function PATCH(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }
  let body: { id?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const { id, action } = body;
  if (!id || (action !== "delete" && action !== "restore")) {
    return NextResponse.json({ error: "id 와 action(delete|restore) 필요" }, { status: 400 });
  }
  try {
    const sb = getSupabaseService();
    const { error } = await sb
      .from("comments")
      .update({ is_deleted: action === "delete", updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true, is_deleted: action === "delete" });
  } catch (e) {
    return NextResponse.json({ error: friendly(e) }, { status: 500 });
  }
}

function friendly(e: unknown): string {
  if (e instanceof SupabaseConfigError) return e.message;
  return "처리 중 오류가 발생했어요.";
}
