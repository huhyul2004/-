import { NextResponse } from "next/server";
import { listSpeciesByIds } from "@/lib/queries";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const idsParam = url.searchParams.get("ids") ?? "";
  const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 100);
  const rows = listSpeciesByIds(ids);
  const results = rows.map((s) => ({
    id: s.id,
    name: s.common_name_ko ?? s.common_name_en ?? s.scientific_name,
    scientific_name: s.scientific_name,
    category: s.category,
    photo_url: s.photo_url,
    class_name: s.class_name,
  }));
  return NextResponse.json({ results });
}
