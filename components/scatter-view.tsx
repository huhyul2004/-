"use client";

import { useMemo, useRef, useState } from "react";

export type ScatterSpecies = {
  scientific_name: string;
  common_name: string;
  class_name: string | null;
  mass_g: number | null;
  consensus_score: number;
  intervention_tier: string;
  iucn_category: string;
  population_size: number;
  population_source: string;
};

const TIER_COLOR: Record<string, string> = {
  T0: "#60C659", T1: "#CCE226", T2: "#F9E814", T3: "#FC7F3F", T4: "#D81E05", EX: "#000000",
};
const CAT_COLOR: Record<string, string> = {
  LC: "#60C659", NT: "#CCE226", VU: "#F9E814", EN: "#FC7F3F", CR: "#D81E05",
};
const CAT_Y: Record<string, number> = { LC: 1, NT: 2, VU: 3, EN: 4, CR: 5 };
const CAT_LABEL: Record<number, string> = { 1: "LC", 2: "NT", 3: "VU", 4: "EN", 5: "CR" };
const CAT_ORDER = ["CR", "EN", "VU", "NT", "LC"];

const TAXA = ["전체", "포유류", "조류", "파충류", "양서류", "어류"];
const HIGHLIGHT = new Set([
  "Phocoena sinus", "Rhinoceros sondaicus", "Panthera tigris altaica", "Haliaeetus leucocephalus",
]);
const REG_COLOR = "#2563eb"; // 회귀선 파란색

const W = 480, H = 380, M = { t: 20, r: 16, b: 44, l: 48 };
const PW = W - M.l - M.r, PH = H - M.t - M.b;

// 체중(log10 g) 눈금 → 사람이 읽는 단위 (1g / 1kg / 1톤 …)
function massTick(t: number): string {
  const g = Math.pow(10, t);
  if (g < 1000) return `${Math.round(g)}g`;
  if (g < 1_000_000) return `${Math.round(g / 1000)}kg`;
  return `${Math.round(g / 1_000_000)}톤`;
}

// 결정적 지터 (종명 해시 → [-0.15, +0.15]) — 렌더마다 안 흔들리게
function jitterFor(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (Math.imul(h, 31) + name.charCodeAt(i)) | 0;
  return (((h >>> 0) % 1000) / 1000 - 0.5) * 0.3;
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let cov = 0, sx = 0, sy = 0;
  for (let i = 0; i < n; i++) {
    cov += (xs[i] - mx) * (ys[i] - my);
    sx += (xs[i] - mx) ** 2;
    sy += (ys[i] - my) ** 2;
  }
  return sx && sy ? cov / Math.sqrt(sx * sy) : 0;
}
function regression(xs: number[], ys: number[]) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  const b = den ? num / den : 0;
  return { b, a: my - b * mx };
}

function downloadSvgPng(svg: SVGSVGElement | null, name: string) {
  if (!svg) return;
  const xml = new XMLSerializer().serializeToString(svg);
  const svg64 = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));
  const img = new Image();
  img.onload = () => {
    const c = document.createElement("canvas");
    c.width = W * 2; c.height = H * 2;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png"); a.download = name; a.click();
  };
  img.src = svg64;
}

// y = 통계용 실제값, dy = 화면 표시값(지터 적용). 회귀·상관은 y 사용.
type Pt = { x: number; y: number; dy: number; s: ScatterSpecies; color: string; hl: boolean };

function Scatter({
  svgRef, title, pts, xDomain, yDomain, yTicks, yFmt, corr, dimOthers, onHover,
}: {
  svgRef: React.RefObject<SVGSVGElement>;
  title: string; pts: Pt[]; xDomain: [number, number]; yDomain: [number, number];
  yTicks: number[]; yFmt: (v: number) => string; corr: number; dimOthers: boolean;
  onHover: (p: Pt | null, e?: React.MouseEvent) => void;
}) {
  const sx = (x: number) => M.l + ((x - xDomain[0]) / (xDomain[1] - xDomain[0] || 1)) * PW;
  const sy = (y: number) => M.t + PH - ((y - yDomain[0]) / (yDomain[1] - yDomain[0] || 1)) * PH;
  const reg = pts.length >= 2 ? regression(pts.map((p) => p.x), pts.map((p) => p.y)) : null;
  const xTicks = [0, 2, 4, 6, 8].filter((t) => t >= xDomain[0] - 0.5 && t <= xDomain[1] + 0.5);
  const base = pts.filter((p) => !p.hl);
  const hlPts = pts.filter((p) => p.hl);

  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ background: "#fff" }}>
      <text x={M.l} y={14} fontSize={13} fontWeight={700} fill="#18181b">{title}</text>
      {/* 축 */}
      <line x1={M.l} y1={M.t + PH} x2={M.l + PW} y2={M.t + PH} stroke="#a1a1aa" />
      <line x1={M.l} y1={M.t} x2={M.l} y2={M.t + PH} stroke="#a1a1aa" />
      {yTicks.map((t) => (
        <g key={"y" + t}>
          <line x1={M.l - 4} y1={sy(t)} x2={M.l + PW} y2={sy(t)} stroke="#f1f1f4" />
          <text x={M.l - 7} y={sy(t) + 3} fontSize={10} textAnchor="end" fill="#71717a">{yFmt(t)}</text>
        </g>
      ))}
      {xTicks.map((t) => (
        <text key={"x" + t} x={sx(t)} y={M.t + PH + 14} fontSize={10} textAnchor="middle" fill="#71717a">{massTick(t)}</text>
      ))}
      <text x={M.l + PW / 2} y={H - 6} fontSize={10} textAnchor="middle" fill="#52525b">체중 (log 스케일)</text>
      {/* 일반 점 (강조 시 흐리게) */}
      {base.map((p, i) => (
        <circle
          key={i} cx={sx(p.x)} cy={sy(p.dy)} r={2.6}
          fill={p.color} fillOpacity={dimOthers ? 0.3 : 0.5}
          onMouseEnter={(e) => onHover(p, e)} onMouseLeave={() => onHover(null)}
        />
      ))}
      {/* 회귀선 (파란 실선) */}
      {reg && (
        <line
          x1={sx(xDomain[0])} y1={sy(reg.a + reg.b * xDomain[0])}
          x2={sx(xDomain[1])} y2={sy(reg.a + reg.b * xDomain[1])}
          stroke={REG_COLOR} strokeWidth={3}
        />
      )}
      {/* 강조 종 (위에 크게) */}
      {hlPts.map((p, i) => (
        <circle
          key={"hl" + i} cx={sx(p.x)} cy={sy(p.dy)} r={8}
          fill={p.color} fillOpacity={1} stroke="#000" strokeWidth={1.8}
          onMouseEnter={(e) => onHover(p, e)} onMouseLeave={() => onHover(null)}
        />
      ))}
      {hlPts.map((p, i) => (
        <text
          key={"lbl" + i} x={sx(p.x) + 11} y={sy(p.dy) + 3}
          fontSize={11} fontWeight={700} fill="#18181b"
          stroke="#fff" strokeWidth={3} paintOrder="stroke"
        >
          {p.s.common_name}
        </text>
      ))}
      <text x={M.l + PW - 4} y={M.t + 14} fontSize={12} fontWeight={700} textAnchor="end" fill="#18181b">
        r = {corr.toFixed(3)}
      </text>
    </svg>
  );
}

export function ScatterView({ species, initialHighlight = true }: { species: ScatterSpecies[]; initialHighlight?: boolean }) {
  const [taxon, setTaxon] = useState("전체");
  const [highlight, setHighlight] = useState(initialHighlight);
  const [hover, setHover] = useState<{ p: Pt; x: number; y: number } | null>(null);
  const leftRef = useRef<SVGSVGElement>(null);
  const rightRef = useRef<SVGSVGElement>(null);

  const withMass = useMemo(
    () => species.filter((s) => s.mass_g != null && s.mass_g > 0), [species]
  );
  const filtered = useMemo(() => {
    if (taxon === "전체") return withMass;
    if (taxon === "어류") return withMass.filter((s) => (s.class_name || "").startsWith("어류"));
    return withMass.filter((s) => s.class_name === taxon);
  }, [withMass, taxon]);

  const leftPts: Pt[] = useMemo(
    () => filtered.map((s) => {
      const y = s.consensus_score;
      return { x: Math.log10(s.mass_g!), y, dy: y, s,
        color: TIER_COLOR[s.intervention_tier] ?? "#999", hl: highlight && HIGHLIGHT.has(s.scientific_name) };
    }), [filtered, highlight]
  );
  const rightPts: Pt[] = useMemo(
    () => filtered.filter((s) => CAT_Y[s.iucn_category]).map((s) => {
      const y = CAT_Y[s.iucn_category];
      return { x: Math.log10(s.mass_g!), y, dy: y + jitterFor(s.scientific_name), s, // 지터: 표시만
        color: CAT_COLOR[s.iucn_category] ?? "#999", hl: highlight && HIGHLIGHT.has(s.scientific_name) };
    }), [filtered, highlight]
  );

  const xDomain = useMemo(() => {
    const xs = leftPts.map((p) => p.x);
    if (!xs.length) return [0, 8] as [number, number];
    return [Math.floor(Math.min(...xs)), Math.ceil(Math.max(...xs))] as [number, number];
  }, [leftPts]);

  const catCounts = useMemo(() => {
    const c: Record<string, number> = { CR: 0, EN: 0, VU: 0, NT: 0, LC: 0 };
    for (const s of filtered) if (c[s.iucn_category] !== undefined) c[s.iucn_category]++;
    return c;
  }, [filtered]);

  const rL = pearson(leftPts.map((p) => p.x), leftPts.map((p) => p.y));
  const rR = pearson(rightPts.map((p) => p.x), rightPts.map((p) => p.y));

  return (
    <div className="relative">
      {/* 필터 */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {TAXA.map((t) => (
            <button
              key={t} onClick={() => setTaxon(t)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                taxon === t ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >{t}</button>
          ))}
        </div>
        <label className="ml-2 flex items-center gap-1.5 text-xs text-zinc-600">
          <input type="checkbox" checked={highlight} onChange={(e) => setHighlight(e.target.checked)} />
          검증 4종 강조
        </label>
        <span className="ml-auto text-xs text-zinc-400">{filtered.length}종 표시</span>
      </div>

      {/* 등급별 개수 */}
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {CAT_ORDER.map((c) => (
          <span key={c} className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: CAT_COLOR[c] }} />
            <span className="font-medium text-zinc-700">{c}</span>
            <span className="text-zinc-400">{catCounts[c].toLocaleString()}종</span>
          </span>
        ))}
      </div>

      {/* 산점도 2개 */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 p-3">
          <Scatter
            svgRef={leftRef} title="LastWatch 위기점수" pts={leftPts}
            xDomain={xDomain} yDomain={[0, 100]} yTicks={[0, 20, 40, 60, 80, 100]}
            yFmt={(v) => String(v)} corr={rL} dimOthers={highlight}
            onHover={(p, e) => setHover(p && e ? { p, x: e.clientX, y: e.clientY } : null)}
          />
          <button onClick={() => downloadSvgPng(leftRef.current, "lastwatch-score-vs-mass.png")}
            className="mt-2 rounded-md bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-200">
            PNG 다운로드
          </button>
        </div>
        <div className="rounded-xl border border-zinc-200 p-3">
          <Scatter
            svgRef={rightRef} title="IUCN Red List 등급 (지터 표시)" pts={rightPts}
            xDomain={xDomain} yDomain={[0.5, 5.5]} yTicks={[1, 2, 3, 4, 5]}
            yFmt={(v) => CAT_LABEL[v] ?? ""} corr={rR} dimOthers={highlight}
            onHover={(p, e) => setHover(p && e ? { p, x: e.clientX, y: e.clientY } : null)}
          />
          <button onClick={() => downloadSvgPng(rightRef.current, "iucn-category-vs-mass.png")}
            className="mt-2 rounded-md bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-200">
            PNG 다운로드
          </button>
        </div>
      </div>

      {/* 상관 요약 (사실 기술) */}
      <div className="mt-5 rounded-xl bg-zinc-50 p-4 text-sm">
        <div className="grid gap-2 sm:grid-cols-2">
          <div><span className="font-semibold">LastWatch</span> 위기점수 vs 체중: <span className="font-mono font-bold">r = {rL.toFixed(3)}</span></div>
          <div><span className="font-semibold">IUCN</span> 등급 vs 체중: <span className="font-mono font-bold">r = {rR.toFixed(3)}</span></div>
        </div>
        <p className="mt-2 text-xs text-zinc-600">
          체중 있는 {leftPts.length.toLocaleString()}종 대상 상관 분석: LastWatch r={rL.toFixed(3)}, IUCN r={rR.toFixed(3)}. 둘 다 약한 양의 상관.
        </p>
      </div>

      {/* hover 툴팁 */}
      {hover && (
        <div className="pointer-events-none fixed z-50 rounded-md bg-zinc-900 px-2.5 py-1.5 text-xs text-white shadow-lg"
          style={{ left: hover.x + 12, top: hover.y + 12 }}>
          <div className="font-semibold">{hover.p.s.common_name}</div>
          <div className="text-zinc-300">{hover.p.s.scientific_name}</div>
          <div className="mt-0.5">점수 {hover.p.s.consensus_score.toFixed(1)} · {hover.p.s.iucn_category} · {(hover.p.s.mass_g! / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}kg</div>
        </div>
      )}
    </div>
  );
}
