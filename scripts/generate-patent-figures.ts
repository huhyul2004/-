// 특허 명세서 도면 자동 생성 — SVG 4종
import fs from "fs";
import path from "path";

const OUT = path.join(process.cwd(), "docs/patent/figures");
fs.mkdirSync(OUT, { recursive: true });

// ========================================================
// Fig 1. System Architecture
// ========================================================
const fig1 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 920 600" font-family="Pretendard, sans-serif">
  <style>
    .box { fill: #fff; stroke: #18181b; stroke-width: 2; }
    .layer { fill: #f4f4f5; stroke: #71717a; stroke-width: 1.5; }
    .core { fill: #fef3c7; stroke: #d97706; stroke-width: 2; }
    .arrow { stroke: #18181b; stroke-width: 1.5; fill: none; marker-end: url(#arrow); }
    text { font-size: 13px; fill: #18181b; }
    .title { font-size: 16px; font-weight: 900; }
    .small { font-size: 11px; fill: #52525b; }
    .file { font-family: monospace; font-size: 11px; fill: #6366f1; }
  </style>
  <defs>
    <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
      <path d="M0,0 L0,6 L9,3 z" fill="#18181b" />
    </marker>
  </defs>

  <text x="460" y="30" text-anchor="middle" class="title">Fig 1. LastWatch EWS-PVA-IUCN Hybrid Engine — System Architecture</text>

  <!-- Inputs -->
  <rect x="40" y="80" width="180" height="100" class="box" rx="8"/>
  <text x="130" y="105" text-anchor="middle" font-weight="700">Data Inputs</text>
  <text x="130" y="125" text-anchor="middle" class="small">IUCN Red List</text>
  <text x="130" y="142" text-anchor="middle" class="small">Wikidata SPARQL</text>
  <text x="130" y="159" text-anchor="middle" class="small">Time-series (optional)</text>
  <text x="130" y="174" text-anchor="middle" class="file">scripts/sync-*.ts</text>

  <!-- 3-Layer Engine -->
  <rect x="280" y="50" width="200" height="60" class="layer" rx="6"/>
  <text x="380" y="75" text-anchor="middle" font-weight="700">Layer 1 · EWS</text>
  <text x="380" y="92" text-anchor="middle" class="small">Critical Slowing Down</text>
  <text x="380" y="105" text-anchor="middle" class="file">engine/* (Drake 2010)</text>

  <rect x="280" y="130" width="200" height="60" class="layer" rx="6"/>
  <text x="380" y="155" text-anchor="middle" font-weight="700">Layer 2 · PVA</text>
  <text x="380" y="172" text-anchor="middle" class="small">Stochastic Ricker × 1500</text>
  <text x="380" y="185" text-anchor="middle" class="file">lib/tipping-point.ts</text>

  <rect x="280" y="210" width="200" height="60" class="layer" rx="6"/>
  <text x="380" y="235" text-anchor="middle" font-weight="700">Layer 3 · IUCN + Genetic</text>
  <text x="380" y="252" text-anchor="middle" class="small">50/500 Rule (Frankham)</text>
  <text x="380" y="265" text-anchor="middle" class="file">lib/tipping-point.ts</text>

  <!-- Consensus -->
  <rect x="540" y="130" width="180" height="80" class="core" rx="8"/>
  <text x="630" y="155" text-anchor="middle" font-weight="700">Consensus Layer</text>
  <text x="630" y="173" text-anchor="middle" class="small">Generate-then-Verify</text>
  <text x="630" y="188" text-anchor="middle" class="small">2-of-3 alert filter</text>
  <text x="630" y="202" text-anchor="middle" class="file">engine/consensus.ts</text>

  <!-- Outputs -->
  <rect x="780" y="60" width="120" height="60" class="box" rx="6"/>
  <text x="840" y="85" text-anchor="middle" font-weight="700">Tier (T0-T4)</text>
  <text x="840" y="102" text-anchor="middle" class="file">tipping-point.ts</text>

  <rect x="780" y="140" width="120" height="60" class="box" rx="6"/>
  <text x="840" y="165" text-anchor="middle" font-weight="700">Timeline</text>
  <text x="840" y="180" text-anchor="middle" class="small">4-tuple dates</text>
  <text x="840" y="194" text-anchor="middle" class="file">engine/timeline.ts</text>

  <rect x="780" y="220" width="120" height="60" class="box" rx="6"/>
  <text x="840" y="245" text-anchor="middle" font-weight="700">Recommendation</text>
  <text x="840" y="260" text-anchor="middle" class="small">Tier × Threat × Region</text>
  <text x="840" y="274" text-anchor="middle" class="file">engine/recommendation.ts</text>

  <!-- Arrows -->
  <path d="M220 130 L280 80" class="arrow"/>
  <path d="M220 130 L280 160" class="arrow"/>
  <path d="M220 130 L280 240" class="arrow"/>
  <path d="M480 80 L540 150" class="arrow"/>
  <path d="M480 160 L540 170" class="arrow"/>
  <path d="M480 240 L540 190" class="arrow"/>
  <path d="M720 170 L780 90" class="arrow"/>
  <path d="M720 170 L780 170" class="arrow"/>
  <path d="M720 170 L780 250" class="arrow"/>

  <!-- Fallback path -->
  <rect x="40" y="320" width="200" height="80" class="box" stroke-dasharray="4 4" rx="6"/>
  <text x="140" y="345" text-anchor="middle" font-weight="700">Fallback Estimator</text>
  <text x="140" y="362" text-anchor="middle" class="small">Taxon defaults + IUCN priors</text>
  <text x="140" y="378" text-anchor="middle" class="small">confidence_cap = 0.4</text>
  <text x="140" y="392" text-anchor="middle" class="file">engine/fallback.ts</text>
  <path d="M240 360 Q 280 360 280 230" class="arrow" stroke-dasharray="4 4"/>
  <text x="290" y="320" class="small">when N₀ unknown</text>

  <!-- UI Layer -->
  <rect x="540" y="320" width="360" height="80" class="box" rx="6"/>
  <text x="720" y="345" text-anchor="middle" font-weight="700">User Interface (Next.js)</text>
  <text x="720" y="365" text-anchor="middle" class="small">Detail page · Timeline SVG · Recommendation list</text>
  <text x="720" y="382" text-anchor="middle" class="file">app/species/[id]/page.tsx · components/tipping-timeline.tsx</text>
  <path d="M840 280 L740 320" class="arrow"/>

  <!-- Footnote -->
  <text x="40" y="540" class="small">References:</text>
  <text x="40" y="558" class="small">[1] Drake &amp; Griffen (2010) Nature 467:456 · [2] Frankham et al. (2014) Biol Conservation 170:56</text>
  <text x="40" y="572" class="small">[3] Beissinger &amp; McCullough (2002) Population Viability Analysis · [4] Lacy (1993) Wildlife Research 20:45</text>
  <text x="40" y="586" class="small">[5] IUCN Red List Categories &amp; Criteria v3.1 (2012)</text>
</svg>`;

// ========================================================
// Fig 2. Timeline Example (Vaquita Porpoise)
// ========================================================
const fig2 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 920 320" font-family="Pretendard, sans-serif">
  <style>
    text { font-size: 13px; fill: #18181b; }
    .title { font-size: 16px; font-weight: 900; }
    .small { font-size: 11px; fill: #52525b; }
    .label { font-size: 12px; font-weight: 700; }
    .date { font-family: monospace; font-size: 12px; }
  </style>

  <text x="460" y="30" text-anchor="middle" class="title">Fig 2. Tipping Point Timeline — Vaquita Porpoise (Phocoena sinus)</text>
  <text x="460" y="50" text-anchor="middle" class="small">N₀=10, IUCN=CR, consensus_score=98 · T4 (Imminent)</text>

  <!-- Main timeline bar -->
  <line x1="80" y1="180" x2="860" y2="180" stroke="#18181b" stroke-width="2"/>

  <!-- Gradient region -->
  <defs>
    <linearGradient id="urgency" x1="0%" x2="100%">
      <stop offset="0%" stop-color="#60C659" stop-opacity="0.3"/>
      <stop offset="40%" stop-color="#FC7F3F" stop-opacity="0.3"/>
      <stop offset="80%" stop-color="#D81E05" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.5"/>
    </linearGradient>
  </defs>
  <rect x="80" y="170" width="780" height="20" fill="url(#urgency)"/>

  <!-- Markers -->
  <!-- 1. Open -->
  <circle cx="100" cy="180" r="10" fill="#60C659"/>
  <line x1="100" y1="180" x2="100" y2="100" stroke="#60C659" stroke-width="1.5"/>
  <text x="100" y="92" text-anchor="middle" class="label" fill="#3a8836">개입 가능</text>
  <text x="100" y="80" text-anchor="middle" class="date">2026-05-04</text>
  <text x="100" y="115" text-anchor="middle" class="small">today (T+0)</text>

  <!-- 2. Close -->
  <circle cx="100" cy="180" r="10" fill="#FC7F3F" stroke="#fff" stroke-width="2"/>
  <text x="180" y="220" text-anchor="middle" class="label" fill="#c46928">개입 마감</text>
  <text x="180" y="240" text-anchor="middle" class="date">2026-05-04</text>
  <text x="180" y="256" text-anchor="middle" class="small">already in T3 zone</text>

  <!-- 3. Golden -->
  <circle cx="200" cy="180" r="10" fill="#D81E05" stroke="#fff" stroke-width="2"/>
  <text x="290" y="120" text-anchor="middle" class="label" fill="#a01103">골든타임</text>
  <text x="290" y="105" text-anchor="middle" class="date">~2027-01-15</text>
  <text x="290" y="135" text-anchor="middle" class="small">T+0.7y (T4 entry)</text>

  <!-- 4. Extinction -->
  <circle cx="450" cy="180" r="10" fill="#000"/>
  <line x1="450" y1="180" x2="450" y2="240" stroke="#000" stroke-width="1.5"/>
  <text x="450" y="260" text-anchor="middle" class="label">멸종 추정 (p10)</text>
  <text x="450" y="278" text-anchor="middle" class="date">2031-08-30</text>
  <text x="450" y="294" text-anchor="middle" class="small">PVA p10 quasi-extinction</text>

  <!-- Year axis -->
  <text x="80" y="305" class="small">2026</text>
  <text x="290" y="305" class="small">2028</text>
  <text x="500" y="305" class="small">2031</text>
  <text x="710" y="305" class="small">2056</text>
  <text x="860" y="305" text-anchor="end" class="small">2126 (T+100y)</text>
</svg>`;

// ========================================================
// Fig 3. Consensus Flowchart
// ========================================================
const fig3 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 920 700" font-family="Pretendard, sans-serif">
  <style>
    .box { fill: #fff; stroke: #18181b; stroke-width: 1.8; }
    .decision { fill: #fef3c7; stroke: #d97706; stroke-width: 2; }
    .output { fill: #dcfce7; stroke: #16a34a; stroke-width: 2; }
    .alert { fill: #fee2e2; stroke: #dc2626; stroke-width: 2; }
    .arrow { stroke: #18181b; stroke-width: 1.5; fill: none; marker-end: url(#arrow); }
    text { font-size: 13px; fill: #18181b; text-anchor: middle; }
    .title { font-size: 16px; font-weight: 900; }
    .small { font-size: 11px; fill: #52525b; }
    .formula { font-family: monospace; font-size: 12px; fill: #1e40af; }
  </style>
  <defs>
    <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
      <path d="M0,0 L0,6 L9,3 z" fill="#18181b" />
    </marker>
  </defs>

  <text x="460" y="30" class="title">Fig 3. Generate-then-Verify Consensus Algorithm</text>

  <!-- Inputs -->
  <rect x="60"  y="70" width="180" height="60" class="box" rx="6"/>
  <text x="150" y="95" font-weight="700">EWS Score</text>
  <text x="150" y="115" class="small">0~100 (CSD signal)</text>

  <rect x="370" y="70" width="180" height="60" class="box" rx="6"/>
  <text x="460" y="95" font-weight="700">PVA Score</text>
  <text x="460" y="115" class="small">0~100 (P_ext-based)</text>

  <rect x="680" y="70" width="180" height="60" class="box" rx="6"/>
  <text x="770" y="95" font-weight="700">IUCN/Genetic Score</text>
  <text x="770" y="115" class="small">0~100 (Criterion + Ne)</text>

  <!-- Weighted -->
  <rect x="280" y="180" width="360" height="60" class="box" rx="6"/>
  <text x="460" y="205" font-weight="700">Weighted Average</text>
  <text x="460" y="225" class="formula">raw = 0.20·EWS + 0.50·PVA + 0.30·IUCN</text>

  <path d="M150 130 L 380 180" class="arrow"/>
  <path d="M460 130 L 460 180" class="arrow"/>
  <path d="M770 130 L 540 180" class="arrow"/>

  <!-- Decision: high alerts -->
  <polygon points="460,290 660,360 460,430 260,360" class="decision"/>
  <text x="460" y="350" font-weight="700">High-Alert Count</text>
  <text x="460" y="370" class="small">EWS&gt;70 + PVA&gt;50 + IUCN&gt;60</text>

  <path d="M460 240 L 460 290" class="arrow"/>

  <!-- Branches -->
  <rect x="40"  y="470" width="220" height="80" class="alert" rx="6"/>
  <text x="150" y="495" font-weight="700">0 alerts</text>
  <text x="150" y="515" class="formula">adjusted = raw · 0.6</text>
  <text x="150" y="533" class="small">confidence = 0.5</text>

  <rect x="350" y="470" width="220" height="80" class="alert" rx="6"/>
  <text x="460" y="495" font-weight="700">1 alert</text>
  <text x="460" y="515" class="formula">adjusted = raw · 0.85</text>
  <text x="460" y="533" class="small">confidence = 0.7</text>

  <rect x="660" y="470" width="220" height="80" class="output" rx="6"/>
  <text x="770" y="495" font-weight="700">2+ alerts</text>
  <text x="770" y="515" class="formula">adjusted = raw</text>
  <text x="770" y="533" class="small">confidence = 0.95 (consensus)</text>

  <path d="M280 380 L 150 470" class="arrow"/>
  <path d="M460 430 L 460 470" class="arrow"/>
  <path d="M640 380 L 770 470" class="arrow"/>

  <!-- Final output -->
  <rect x="280" y="600" width="360" height="60" class="output" rx="6"/>
  <text x="460" y="625" font-weight="700">Consensus Output</text>
  <text x="460" y="645" class="small">{ score, confidence, primary_signal }</text>

  <path d="M150 550 L 350 600" class="arrow"/>
  <path d="M460 550 L 460 600" class="arrow"/>
  <path d="M770 550 L 570 600" class="arrow"/>
</svg>`;

// ========================================================
// Fig 4. Recommendation Matrix
// ========================================================
const TIERS = ["T0", "T1", "T2", "T3", "T4"];
const THREATS = ["hunting", "bycatch", "habitat_loss", "pollution", "climate", "invasive", "disease"];
const PRIORITY_ACTION: Record<string, Record<string, string>> = {
  T0: { hunting: "정기 조사", bycatch: "기준선 데이터", habitat_loss: "토지 모니터링", pollution: "수질 측정", climate: "기온 추적", invasive: "외래종 등록", disease: "질병 감시" },
  T1: { hunting: "사냥 통계 추적", bycatch: "혼획 보고제", habitat_loss: "규제 검토", pollution: "오염원 추적", climate: "예측 모델", invasive: "조기 경보", disease: "백신 검토" },
  T2: { hunting: "단속 강화", bycatch: "자망 제한", habitat_loss: "보호구역 확장", pollution: "정화 명령", climate: "적응 계획", invasive: "제거 시작", disease: "치료 프로그램" },
  T3: { hunting: "법적 보호 격상", bycatch: "조업 금지구역", habitat_loss: "긴급 보전", pollution: "긴급 정화", climate: "이주 검토", invasive: "전면 제거", disease: "긴급 격리" },
  T4: { hunting: "전면 사냥 금지", bycatch: "어업 봉쇄", habitat_loss: "서식지 봉쇄", pollution: "오염원 차단", climate: "ex-situ 이전", invasive: "유전자 보존", disease: "포획 + 치료" },
};

let cells = "";
const cellW = 110, cellH = 50;
const colorMap: Record<string, string> = { T0: "#dcfce7", T1: "#ecfccb", T2: "#fef9c3", T3: "#fed7aa", T4: "#fecaca" };
THREATS.forEach((th, ti) => {
  TIERS.forEach((tier, tii) => {
    const x = 130 + tii * cellW;
    const y = 100 + ti * cellH;
    const text = PRIORITY_ACTION[tier][th] ?? "—";
    cells += `<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" fill="${colorMap[tier]}" stroke="#a1a1aa"/>`;
    cells += `<text x="${x + cellW / 2}" y="${y + cellH / 2 + 4}" font-size="10" text-anchor="middle">${text}</text>`;
  });
});
THREATS.forEach((th, ti) => {
  cells += `<text x="125" y="${100 + ti * cellH + cellH / 2 + 4}" font-size="11" font-weight="700" text-anchor="end">${th}</text>`;
});
TIERS.forEach((tier, tii) => {
  cells += `<text x="${130 + tii * cellW + cellW / 2}" y="92" font-size="13" font-weight="700" text-anchor="middle">${tier}</text>`;
});

const fig4 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 460" font-family="Pretendard, sans-serif">
  <text x="400" y="30" text-anchor="middle" font-size="16" font-weight="900">Fig 4. Recommendation Matrix — Tier × Threat (region 매핑은 별도 룩업)</text>
  <text x="400" y="52" text-anchor="middle" font-size="11" fill="#52525b">각 셀 = (Tier, Threat) 조합의 최우선 행동. 실제 출력엔 priority/responsible/agency 메타데이터 포함</text>
  ${cells}
  <text x="60" y="450" font-size="11" fill="#52525b">출처: engine/recommendation.ts — IUCN Threat Classification + 본 발명 매트릭스</text>
</svg>`;

fs.writeFileSync(path.join(OUT, "fig1_architecture.svg"), fig1, "utf-8");
fs.writeFileSync(path.join(OUT, "fig2_timeline_example.svg"), fig2, "utf-8");
fs.writeFileSync(path.join(OUT, "fig3_consensus_flowchart.svg"), fig3, "utf-8");
fs.writeFileSync(path.join(OUT, "fig4_recommendation_matrix.svg"), fig4, "utf-8");
console.log("✓ 4 figures generated in", OUT);
