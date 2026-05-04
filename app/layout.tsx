import type { Metadata, Viewport } from "next";
import "@fontsource/pretendard/400.css";
import "@fontsource/pretendard/500.css";
import "@fontsource/pretendard/600.css";
import "@fontsource/pretendard/700.css";
import "@fontsource/pretendard/800.css";
import "@fontsource/pretendard/900.css";
import "./globals.css";
import Link from "next/link";
import { HeaderNav } from "@/components/header-nav";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";

export const metadata: Metadata = {
  title: "Last Watch — 멸종위기 동물 학습",
  description:
    "전 세계의 멸종위기 야생생물과 이미 사라진 종을 살펴보고, 우리가 무엇을 할 수 있는지 함께 생각합니다.",
  openGraph: {
    title: "Last Watch — 멸종위기 동물 학습",
    description:
      "IUCN Red List 기반 멸종위기 종 데이터와 AI 보전 전략, 절멸 종 회고를 한 곳에서.",
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Last Watch — 멸종위기 동물 학습",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-zinc-50 font-sans text-zinc-900 antialiased" style={{ fontFamily: '"Pretendard", system-ui, -apple-system, sans-serif' }}>
        <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/85 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2 font-black tracking-tight">
              <span className="inline-block h-2 w-2 rounded-full bg-[#D81E05]" aria-hidden />
              <span className="text-base">Last Watch</span>
            </Link>
            <div className="hidden sm:block">
              <HeaderNav />
            </div>
          </div>
        </header>
        <main className="min-h-[calc(100vh-3.5rem)] pb-[calc(64px+env(safe-area-inset-bottom))] sm:pb-0">
          {children}
        </main>
        <footer className="border-t border-zinc-200 bg-white py-6 pb-[calc(24px+env(safe-area-inset-bottom)+56px)] text-center text-xs text-zinc-500 sm:pb-6">
          데이터 출처: IUCN Red List · Wikipedia · Wikidata · 큐레이션
        </footer>
        <MobileBottomNav />
      </body>
    </html>
  );
}
