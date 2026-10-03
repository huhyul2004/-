// GET /species/export[?scope=curated|scored|all] — 종 데이터 CSV 내려받기 (결정 13, 2026-10-03)
// 열 설명은 lib/species-export.ts 와 /methodology#export. 정적 세그먼트라 /species/[id] 보다 먼저 잡힌다.
import { gzipSync } from "node:zlib";
import { buildExportRows, toCsv, acceptsGzip, EXPORT_SCOPES, type ExportScope } from "@/lib/species-export";
import { dbUserVersion } from "@/lib/provenance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vercel 함수 응답 본문 한도(4.5MB) 아래로 두려고, 이보다 큰 CSV(scope=all ≈ 6.5MB)는 gzip 으로 보낸다.
// 브라우저는 Content-Encoding: gzip 을 자동으로 풀어 원래 CSV 로 저장한다.
const GZIP_OVER_BYTES = 3_000_000;

export function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("scope") ?? "curated";
  if (!EXPORT_SCOPES.includes(raw as ExportScope)) {
    return new Response(`scope 는 ${EXPORT_SCOPES.join(" · ")} 중 하나여야 합니다.\n`, {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  const scope = raw as ExportScope;
  const version = dbUserVersion() ?? "unversioned";
  // UTF-8 BOM — 엑셀이 한글을 깨지 않고 연다
  const body = Buffer.from("﻿" + toCsv(buildExportRows(scope)), "utf-8");
  const headers: Record<string, string> = {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="lastwatch-species-${scope}-db${version}.csv"`,
    // DB 는 배포 때만 바뀐다 — CDN 에 한 시간 두고, 새 배포는 캐시를 새로 만든다
    "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    "X-Content-Type-Options": "nosniff",
    Vary: "Accept-Encoding",
  };
  if (body.length > GZIP_OVER_BYTES) {
    if (!acceptsGzip(req.headers.get("accept-encoding"))) {
      return new Response("이 범위는 gzip 을 받을 수 있는 클라이언트로만 내려받을 수 있습니다 (예: curl --compressed).\n", {
        status: 406,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    return new Response(new Uint8Array(gzipSync(body)), { headers: { ...headers, "Content-Encoding": "gzip" } });
  }
  return new Response(new Uint8Array(body), { headers });
}
