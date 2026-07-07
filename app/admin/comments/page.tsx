"use client";

import { useState } from "react";

interface AdminComment {
  id: string;
  species_id: string;
  author_name: string;
  author_ip: string | null;
  content: string;
  likes: number;
  is_deleted: boolean;
  created_at: string;
  report_count: number;
}

export default function AdminCommentsPage() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [comments, setComments] = useState<AdminComment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load(pw: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/comments", {
        headers: { "x-admin-password": pw },
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "불러오기 실패");
      setComments(json.comments);
      setAuthed(true);
    } catch (e) {
      setError((e as Error).message);
      setAuthed(false);
    } finally {
      setLoading(false);
    }
  }

  async function act(id: string, action: "delete" | "restore") {
    try {
      const res = await fetch("/api/admin/comments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ id, action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "처리 실패");
      setComments((prev) =>
        prev.map((c) => (c.id === id ? { ...c, is_deleted: action === "delete" } : c))
      );
    } catch (e) {
      window.alert((e as Error).message);
    }
  }

  if (!authed) {
    return (
      <div className="mx-auto max-w-sm px-4 py-20">
        <h1 className="mb-4 text-lg font-bold text-zinc-900">관리자 로그인</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            load(password);
          }}
        >
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="ADMIN_PASSWORD"
            className="mb-3 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
          />
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full rounded-full bg-zinc-900 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            {loading ? "확인 중…" : "입장"}
          </button>
        </form>
        {error && <p className="mt-3 text-xs text-[#D81E05]">{error}</p>}
      </div>
    );
  }

  const reported = comments.filter((c) => c.report_count > 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-xl font-black text-zinc-900">댓글 관리</h1>
        <span className="text-xs text-zinc-500">
          전체 {comments.length} · 신고됨 {reported.length} · 삭제됨{" "}
          {comments.filter((c) => c.is_deleted).length}
        </span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-zinc-200">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead className="bg-zinc-50 text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-bold">신고</th>
              <th className="px-3 py-2 font-bold">종</th>
              <th className="px-3 py-2 font-bold">작성자</th>
              <th className="px-3 py-2 font-bold">내용</th>
              <th className="px-3 py-2 font-bold">♥</th>
              <th className="px-3 py-2 font-bold">상태</th>
              <th className="px-3 py-2 font-bold">작업</th>
            </tr>
          </thead>
          <tbody>
            {comments.map((c) => (
              <tr
                key={c.id}
                className={`border-t border-zinc-100 ${c.is_deleted ? "bg-red-50/40" : ""}`}
              >
                <td className="px-3 py-2">
                  {c.report_count > 0 ? (
                    <span className="rounded-full bg-[#D81E05] px-2 py-0.5 font-bold text-white">
                      {c.report_count}
                    </span>
                  ) : (
                    <span className="text-zinc-300">0</span>
                  )}
                </td>
                <td className="px-3 py-2 text-zinc-600">{c.species_id}</td>
                <td className="px-3 py-2">
                  <div className="font-bold text-zinc-800">{c.author_name}</div>
                  <div className="text-[10px] text-zinc-400">{c.author_ip ?? "-"}</div>
                </td>
                <td className="max-w-[280px] px-3 py-2 text-zinc-700">
                  <div className="line-clamp-3 whitespace-pre-wrap break-words">{c.content}</div>
                  <div className="mt-0.5 text-[10px] text-zinc-400">
                    {new Date(c.created_at).toLocaleString("ko-KR")}
                  </div>
                </td>
                <td className="px-3 py-2 text-zinc-600">{c.likes}</td>
                <td className="px-3 py-2">
                  {c.is_deleted ? (
                    <span className="text-[#D81E05]">삭제됨</span>
                  ) : (
                    <span className="text-[#60C659]">공개</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {c.is_deleted ? (
                    <button
                      onClick={() => act(c.id, "restore")}
                      className="rounded-full border border-zinc-200 px-2.5 py-1 font-bold text-zinc-600 hover:border-zinc-300"
                    >
                      복원
                    </button>
                  ) : (
                    <button
                      onClick={() => act(c.id, "delete")}
                      className="rounded-full border border-[#D81E05] px-2.5 py-1 font-bold text-[#D81E05] hover:bg-[#D81E05] hover:text-white"
                    >
                      삭제
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
