/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Vercel 배포 시 SQLite 파일을 서버 번들에 포함
    outputFileTracingIncludes: {
      "/api/**/*": ["./data/species.db"],
      "/species/**/*": ["./data/species.db"],
      "/extinct/**/*": ["./data/species.db"],
      "/stats": ["./data/species.db"],
      "/favorites": ["./data/species.db"],
      "/": ["./data/species.db"],
      "/sitemap.xml": ["./data/species.db"],
    },
    serverComponentsExternalPackages: ["better-sqlite3"],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "upload.wikimedia.org" },
      { protocol: "https", hostname: "*.wikipedia.org" },
    ],
  },
};

export default nextConfig;
