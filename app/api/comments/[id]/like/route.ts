import { NextResponse } from "next/server";
import { getSupabaseService, SupabaseConfigError } from "@/lib/supabase";
import { getClientIp } from "@/lib/comments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/comments/[id]/like  — IP 기준 토글 (이미 눌렀으면 취소)
// likes 값은 comment_likes 테이블 count 를 진실의 원천으로 삼아 재계산 (경쟁 상태·집계 오류 방지)
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const commentId = params.id;
  if (!commentId) {
    return NextResponse.json({ error: "댓글 ID 가 필요합니다." }, { status: 400 });
  }
  const ip = getClientIp(req);

  try {
    const sb = getSupabaseService();

    // 이미 좋아요했는지 확인
    const { data: existing, error: selErr } = await sb
      .from("comment_likes")
      .select("id")
      .eq("comment_id", commentId)
      .eq("liker_ip", ip)
      .maybeSingle();
    if (selErr) throw selErr;

    let liked: boolean;
    if (existing) {
      // 토글 OFF: 좋아요 취소
      const { error: delErr } = await sb.from("comment_likes").delete().eq("id", existing.id);
      if (delErr) throw delErr;
      liked = false;
    } else {
      // 토글 ON: 좋아요 추가 (동시성 unique 충돌은 무시 — 이미 눌린 상태)
      const { error: insErr } = await sb
        .from("comment_likes")
        .insert({ comment_id: commentId, liker_ip: ip });
      if (insErr && !/duplicate|unique|23505/i.test(insErr.message)) throw insErr;
      liked = true;
    }

    // comment_likes 실제 개수로 likes 컬럼 동기화
    const { count, error: cntErr } = await sb
      .from("comment_likes")
      .select("id", { count: "exact", head: true })
      .eq("comment_id", commentId);
    if (cntErr) throw cntErr;
    const likes = count ?? 0;

    const { error: updErr } = await sb
      .from("comments")
      .update({ likes, updated_at: new Date().toISOString() })
      .eq("id", commentId);
    if (updErr) throw updErr;

    return NextResponse.json({ liked, likes });
  } catch (e) {
    return NextResponse.json({ error: friendly(e) }, { status: 500 });
  }
}

function friendly(e: unknown): string {
  if (e instanceof SupabaseConfigError) return e.message;
  return "좋아요 처리 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.";
}
