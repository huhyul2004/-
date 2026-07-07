"use client";

import { useCallback, useEffect, useState } from "react";
import { ANON_ANIMALS, MAX_CONTENT_LEN } from "@/lib/comments";

interface Comment {
  id: string;
  species_id: string;
  author_name: string;
  content: string;
  likes: number;
  created_at: string;
}

const PAGE = 10;
const LIKED_KEY = "last-watch:liked-comments";

function readLiked(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    return new Set(JSON.parse(window.localStorage.getItem(LIKED_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}
function writeLiked(set: Set<string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LIKED_KEY, JSON.stringify(Array.from(set)));
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR");
}

export function CommentSection({ speciesId, dark = false }: { speciesId: string; dark?: boolean }) {
  const t = dark
    ? {
        wrap: "border-zinc-800",
        heading: "text-zinc-100",
        muted: "text-zinc-500",
        formCard: "border-zinc-800 bg-zinc-900",
        input: "border-zinc-700 bg-zinc-950 text-zinc-100 focus:border-zinc-500",
        card: "border-zinc-800 bg-zinc-900/40",
        author: "text-zinc-200",
        body: "text-zinc-300",
        moreBtn: "border-zinc-700 text-zinc-300 hover:border-zinc-500",
      }
    : {
        wrap: "border-zinc-200",
        heading: "text-zinc-900",
        muted: "text-zinc-400",
        formCard: "border-zinc-200 bg-white",
        input: "border-zinc-200 bg-white text-zinc-900 focus:border-zinc-400",
        card: "border-zinc-100 bg-zinc-50/50",
        author: "text-zinc-800",
        body: "text-zinc-700",
        moreBtn: "border-zinc-200 text-zinc-600 hover:border-zinc-300",
      };
  const [comments, setComments] = useState<Comment[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liked, setLiked] = useState<Set<string>>(new Set());

  // 페이지당 익명 닉네임 placeholder (마운트 시 1회 고정)
  const [placeholder, setPlaceholder] = useState("익명의수달");

  useEffect(() => {
    setLiked(readLiked());
    const pick = ANON_ANIMALS[Math.floor((Date.now() / 1000) % ANON_ANIMALS.length)];
    setPlaceholder(`익명의${pick}`);
  }, []);

  const load = useCallback(
    async (offset: number, replace: boolean) => {
      try {
        const res = await fetch(
          `/api/comments?species_id=${encodeURIComponent(speciesId)}&limit=${PAGE}&offset=${offset}`,
          { cache: "no-store" }
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "불러오기 실패");
        setComments((prev) => (replace ? json.comments : [...prev, ...json.comments]));
        setTotal(json.total ?? 0);
        setHasMore(!!json.hasMore);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [speciesId]
  );

  useEffect(() => {
    setLoading(true);
    load(0, true);
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          species_id: speciesId,
          author_name: name.trim(),
          content: content.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "작성 실패");
      setComments((prev) => [json.comment, ...prev]);
      setTotal((t) => t + 1);
      setContent("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleLike(id: string) {
    try {
      const res = await fetch(`/api/comments/${id}/like`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "좋아요 실패");
      setComments((prev) => prev.map((c) => (c.id === id ? { ...c, likes: json.likes } : c)));
      setLiked((prev) => {
        const next = new Set(prev);
        if (json.liked) next.add(id);
        else next.delete(id);
        writeLiked(next);
        return next;
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function report(id: string) {
    const reason = window.prompt("신고 사유를 입력해주세요 (선택). 신고가 누적되면 자동으로 숨겨집니다.");
    if (reason === null) return; // 취소
    try {
      const res = await fetch(`/api/comments/${id}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "신고 실패");
      if (json.autoDeleted) {
        setComments((prev) => prev.filter((c) => c.id !== id));
        setTotal((t) => Math.max(0, t - 1));
      }
      window.alert(json.autoDeleted ? "신고 누적으로 댓글이 숨겨졌습니다." : "신고가 접수되었습니다.");
    } catch (e) {
      window.alert((e as Error).message);
    }
  }

  const remaining = MAX_CONTENT_LEN - content.length;

  return (
    <section className={`mt-10 border-t ${t.wrap} pt-8`}>
      <h2 className={`mb-4 text-lg font-bold ${t.heading}`}>
        댓글 <span className={t.muted}>{total}</span>
      </h2>

      {/* 작성 폼 */}
      <form onSubmit={submit} className={`mb-6 rounded-2xl border ${t.formCard} p-4`}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`닉네임 (미입력 시 ${placeholder})`}
          maxLength={40}
          className={`mb-2 w-full rounded-lg border px-3 py-2 text-sm outline-none ${t.input}`}
        />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value.slice(0, MAX_CONTENT_LEN))}
          placeholder="이 종에 대한 생각을 남겨주세요."
          rows={3}
          className={`w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none ${t.input}`}
        />
        <div className="mt-2 flex items-center justify-between">
          <span className={`text-xs ${remaining < 0 ? "text-[#D81E05]" : t.muted}`}>
            {content.length} / {MAX_CONTENT_LEN}
          </span>
          <button
            type="submit"
            disabled={submitting || !content.trim()}
            className="rounded-full bg-[#D81E05] px-4 py-1.5 text-xs font-bold text-white transition hover:bg-[#b81904] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? "작성 중…" : "댓글 작성"}
          </button>
        </div>
      </form>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-[#D81E05]">{error}</p>
      )}

      {/* 목록 */}
      {loading ? (
        <p className={`py-6 text-center text-sm ${t.muted}`}>불러오는 중…</p>
      ) : comments.length === 0 ? (
        <p className={`py-6 text-center text-sm ${t.muted}`}>첫 번째 댓글을 남겨보세요.</p>
      ) : (
        <ul className="space-y-4">
          {comments.map((c) => (
            <li key={c.id} className={`rounded-2xl border ${t.card} p-4`}>
              <div className="mb-1 flex items-center gap-2">
                <span className={`text-sm font-bold ${t.author}`}>{c.author_name}</span>
                <span className={`text-xs ${t.muted}`}>{timeAgo(c.created_at)}</span>
              </div>
              <p className={`whitespace-pre-wrap break-words text-sm ${t.body}`}>{c.content}</p>
              <div className="mt-2 flex items-center gap-3">
                <button
                  onClick={() => toggleLike(c.id)}
                  className={`inline-flex items-center gap-1 text-xs transition ${
                    liked.has(c.id) ? "text-[#D81E05]" : `${t.muted} hover:text-zinc-600`
                  }`}
                  aria-label="좋아요"
                >
                  <span>{liked.has(c.id) ? "♥" : "♡"}</span>
                  <span>{c.likes}</span>
                </button>
                <button
                  onClick={() => report(c.id)}
                  className={`text-xs ${t.muted} transition hover:text-zinc-600`}
                  aria-label="신고"
                >
                  신고
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {hasMore && (
        <button
          onClick={() => load(comments.length, false)}
          className={`mt-4 w-full rounded-full border py-2 text-xs font-bold transition ${t.moreBtn}`}
        >
          더 보기 ({total - comments.length})
        </button>
      )}
    </section>
  );
}
