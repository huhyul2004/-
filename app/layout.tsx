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
      <body className="min-h-screen font-sans text-zinc-900 antialiased" style={{ fontFamily: '"Pretendard", system-ui, -apple-system, sans-serif' }}>
        <header className="sticky top-0 z-30 border-b border-zinc-200/70 glass">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
            <Link href="/" className="group flex items-center gap-2.5 font-black tracking-tight">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#D81E05] opacity-40" aria-hidden />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#D81E05]" aria-hidden />
              </span>
              <span className="text-base tracking-tight">Last Watch</span>
              <span className="hidden text-[10px] font-medium tracking-[0.2em] text-zinc-400 sm:inline">EST. 2026</span>
            </Link>
            <div className="hidden sm:block">
              <HeaderNav />
            </div>
          </div>
        </header>
        <main className="min-h-[calc(100vh-3.5rem)] pb-[calc(64px+env(safe-area-inset-bottom))] sm:pb-0">
          {children}
        </main>
        <footer className="border-t border-zinc-200/70 glass pb-[calc(24px+env(safe-area-inset-bottom)+56px)] sm:pb-8">
          <div className="mx-auto max-w-6xl px-4 py-8">
            <div className="grid gap-6 sm:grid-cols-3">
              <div>
                <div className="flex items-center gap-2 font-black tracking-tight">
                  <span className="inline-block h-2 w-2 rounded-full bg-[#D81E05]" aria-hidden />
                  <span>Last Watch</span>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
                  멸종위기 야생생물의 임계점을 기록하고, 우리가 무엇을 할 수 있는지 함께 생각합니다.
                </p>
              </div>
              <div>
                <p className="text-[10px] font-black tracking-widest text-zinc-400">DATA SOURCES</p>
                <ul className="mt-2 space-y-1 text-[11px] text-zinc-500">
                  <li>· IUCN Red List v2024-1</li>
                  <li>· Wikidata · Wikipedia</li>
                  <li>· 한국 환경부 · 국립생태원</li>
                </ul>
              </div>
              <div>
                <p className="text-[10px] font-black tracking-widest text-zinc-400">METHODOLOGY</p>
                <ul className="mt-2 space-y-1 text-[11px] text-zinc-500">
                  <li>· EWS-PVA-IUCN Hybrid Engine</li>
                  <li>· Frankham 50/500 Rule</li>
                  <li>· Beissinger PVA simulation</li>
                </ul>
              </div>
            </div>
            <p className="mt-6 border-t border-zinc-200/70 pt-4 text-center text-[10px] tracking-widest text-zinc-400">
              EDUCATIONAL · NON-COMMERCIAL · 2026
            </p>
          </div>
        </footer>
        <MobileBottomNav />
      </body>
    </html>
  );
}
