import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(20, Math.max(1, Number(url.searchParams.get("limit") ?? 10)));

  if (q.length < 1) return NextResponse.json({ results: [] });

  const db = getDb();
  const like = `%${q.replace(/[%_]/g, (m) => "\\" + m)}%`;

  const rows = db
    .prepare(
      `SELECT id, scientific_name, common_name_en, common_name_ko, category, photo_url, class_name
       FROM species
       WHERE common_name_ko LIKE ? ESCAPE '\\'
          OR common_name_en LIKE ? ESCAPE '\\'
          OR scientific_name LIKE ? ESCAPE '\\'
       ORDER BY
         CASE WHEN common_name_ko LIKE ? ESCAPE '\\' THEN 0 ELSE 1 END,
         CASE category WHEN 'CR' THEN 0 WHEN 'EN' THEN 1 WHEN 'VU' THEN 2
                       WHEN 'EX' THEN 3 WHEN 'EW' THEN 4 ELSE 5 END,
         common_name_ko COLLATE NOCASE
       LIMIT ?`
    )
    .all(like, like, like, `${q}%`, limit);

  return NextResponse.json({ results: rows });
}
