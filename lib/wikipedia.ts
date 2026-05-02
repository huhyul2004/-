// Wikipedia REST API — 무인증, page summary 엔드포인트 사용
// docs: https://en.wikipedia.org/api/rest_v1/

const UA = "LastWatch/0.1 (educational, contact: huhyul2004@gmail.com)";

export interface WikipediaSummary {
  title: string;
  description: string | null;
  extract: string | null;
  thumbnail: string | null;
  pageUrl: string | null;
}

export async function fetchWikipediaSummary(
  title: string,
  lang: "en" | "ko" = "en"
): Promise<WikipediaSummary | null> {
  if (!title) return null;
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
    title.replace(/\s/g, "_")
  )}?redirect=true`;

  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`);

  const data: any = await res.json();
  if (data.type === "disambiguation") return null;

  return {
    title: data.title ?? title,
    description: data.description ?? null,
    extract: data.extract ?? null,
    thumbnail: data.thumbnail?.source ?? data.originalimage?.source ?? null,
    pageUrl: data.content_urls?.desktop?.page ?? null,
  };
}
