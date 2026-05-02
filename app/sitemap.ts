import { MetadataRoute } from "next";
import { getDb } from "@/lib/db";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  const db = getDb();
  const rows = db
    .prepare("SELECT id, category, updated_at FROM species")
    .all() as { id: string; category: string; updated_at: string }[];

  const speciesUrls: MetadataRoute.Sitemap = rows.map((r) => ({
    url:
      r.category === "EX" || r.category === "EW"
        ? `${base}/extinct/${r.id}`
        : `${base}/species/${r.id}`,
    lastModified: r.updated_at,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [
    { url: base, changeFrequency: "daily", priority: 1.0 },
    { url: `${base}/extinct`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/stats`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${base}/favorites`, changeFrequency: "monthly", priority: 0.3 },
    ...speciesUrls,
  ];
}
