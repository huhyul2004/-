import fs from "fs";
import path from "path";
import Link from "next/link";
import { ScatterView, type ScatterSpecies } from "@/components/scatter-view";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "체중 vs 위기도 산점도 — LastWatch",
  description: "성체 체중과 LastWatch 위기점수·IUCN 등급의 상관 비교",
};

export default function ScatterPage({ searchParams }: { searchParams: { highlight?: string } }) {
  const file = path.join(process.cwd(), "data", "scatter", "species_scatter.json");
  const data = JSON.parse(fs.readFileSync(file, "utf8")) as {
    count: number;
    count_with_mass: number;
    species: ScatterSpecies[];
  };
  const initialHighlight = searchParams?.highlight !== "0"; // 기본 ON, ?highlight=0 으로 끄기

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6">
        <Link href="/stats" className="text-sm text-zinc-500 hover:text-zinc-900">
          ← 통계
        </Link>
        <h1 className="mt-2 text-2xl font-black tracking-tight">체중 vs 위기도 — 산점도 분석</h1>
        <p className="mt-1 text-sm text-zinc-600">
          큐레이션 {data.count.toLocaleString()}종 중 성체 체중(mass_g) 보유{" "}
          {data.count_with_mass.toLocaleString()}종. LastWatch 위기점수와 IUCN 등급이 체중과
          어떻게 상관되는지 비교합니다.
        </p>
      </div>
      <ScatterView species={data.species} initialHighlight={initialHighlight} />
    </main>
  );
}
