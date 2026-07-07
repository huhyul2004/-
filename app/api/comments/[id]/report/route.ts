import { NextResponse } from "next/server";
import { getSupabaseService, SupabaseConfigError } from "@/lib/supabase";
import { getClientIp, AUTO_DELETE_REPORTS } from "@/lib/comments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/comments/[id]/report  body: { reason? }
// 같은 IP 중복 신고 거부. 신고 3회 이상이면 자동 삭제(is_deleted=true).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const commentId = params.id;
  if (!commentId) {
    return NextResponse.json({ error: "댓글 ID 가 필요합니다." }, { status: 400 });
  }

  let reason: string | null = null;
  try {
    const body = await req.json();
    if (typeof body?.reason === "string") reason = body.reason.trim().slice(0, 500) || null;
  } catch {
    // reason 은 선택 — body 없어도 됨
  }

  const ip = getClientIp(req);

  try {
    const sb = getSupabaseService();

    // 중복 신고 방지 — 앱 레벨 선검사 (DB unique 제약이 있으면 아래 insert 에서도 한 번 더 걸림)
    const { data: dup, error: dupErr } = await sb
      .from("comment_reports")
      .select("id")
      .eq("comment_id", commentId)
      .eq("reporter_ip", ip)
      .maybeSingle();
    if (dupErr) throw dupErr;
    if (dup) {
      return NextResponse.json({ error: "이미 신고한 댓글입니다." }, { status: 409 });
    }

    const { error: insErr } = await sb
      .from("comment_reports")
      .insert({ comment_id: commentId, reporter_ip: ip, reason });

    if (insErr) {
      // unique(comment_id, reporter_ip) 위반 = 이미 신고함 (제약이 있는 경우)
      if (/duplicate|unique|23505/i.test(insErr.message)) {
        return NextResponse.json(
          { error: "이미 신고한 댓글입니다." },
          { status: 409 }
        );
      }
      throw insErr;
    }

    // 누적 신고 수 확인 → 임계치 이상이면 자동 삭제
    const { count, error: cntErr } = await sb
      .from("comment_reports")
      .select("id", { count: "exact", head: true })
      .eq("comment_id", commentId);
    if (cntErr) throw cntErr;

    const reportCount = count ?? 0;
    let autoDeleted = false;
    if (reportCount >= AUTO_DELETE_REPORTS) {
      const { error: delErr } = await sb
        .from("comments")
        .update({ is_deleted: true, updated_at: new Date().toISOString() })
        .eq("id", commentId);
      if (delErr) throw delErr;
      autoDeleted = true;
    }

    return NextResponse.json({ reported: true, reportCount, autoDeleted });
  } catch (e) {
    return NextResponse.json({ error: friendly(e) }, { status: 500 });
  }
}

function friendly(e: unknown): string {
  if (e instanceof SupabaseConfigError) return e.message;
  return "신고 처리 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.";
}
