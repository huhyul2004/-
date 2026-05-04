// Wikidata 대량 사이즈 sync — 분류군별 청크로 쪼개서 IUCN 등급별 모든 종 가져오기
// 기존 wikidata.ts 대체용, 무거운 OPTIONAL 빼고 essential 만

const SPARQL_URL = "https://query.wikidata.org/sparql";
const UA = "LastWatch/0.1 (educational, contact: huhyul2004@gmail.com)";

export const IUCN_WIKIDATA_IDS: Record<string, string> = {
  CR: "Q219127",
  EN: "Q96377276",
  VU: "Q278113",
  EX: "Q237350",
  EW: "Q239509",
  NT: "Q719675",
  LC: "Q211005",
};

// 주요 분류군 — 청크 단위로 나눠서 쿼리. P171* 대신 직접 wd:클래스 사용
// IUCN 평가 종의 99%+ 가 이 분류군 안에 있음
export const TAXON_CHUNKS: { qid: string; ko: string }[] = [
  { qid: "Q729",    ko: "동물" },          // Animalia 전체
  { qid: "Q756",    ko: "식물" },          // Plantae 전체
  { qid: "Q764",    ko: "균류" },          // Fungi
  { qid: "Q10876",  ko: "박테리아" },      // Bacteria
];

// 더 세밀한 분류군 (동물 청크가 timeout 시 fallback)
export const FINE_TAXON_CHUNKS: { qid: string; ko: string }[] = [
  { qid: "Q25324",  ko: "포유류" },        // Mammalia
  { qid: "Q5113",   ko: "조류" },          // Aves
  { qid: "Q10811",  ko: "파충류" },        // Reptilia
  { qid: "Q10908",  ko: "양서류" },        // Amphibia
  { qid: "Q152",    ko: "어류 (척추)" },   // Pisces (broad)
  { qid: "Q1390",   ko: "곤충" },          // Insecta
  { qid: "Q1357",   ko: "지렁이류" },      // Annelida
  { qid: "Q138134", ko: "거미강" },        // Arachnida
  { qid: "Q47542",  ko: "갑각류" },        // Crustacea
  { qid: "Q1306890", ko: "복족류" },       // Gastropoda
  { qid: "Q26214",  ko: "이매패류" },      // Bivalvia
  { qid: "Q25241",  ko: "산호류" },        // Anthozoa
  { qid: "Q25281",  ko: "두족류" },        // Cephalopoda
];

export interface BulkSpecies {
  qid: string;
  scientificName: string;
  category: string;
  commonNameKo: string | null;
  commonNameEn: string | null;
  wikipediaTitleEn: string | null;
  wikipediaTitleKo: string | null;
}

async function runSparql(query: string, timeoutMs = 60000): Promise<{ results: { bindings: Record<string, { value: string }>[] } }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(SPARQL_URL + "?query=" + encodeURIComponent(query) + "&format=json", {
      headers: { "User-Agent": UA, Accept: "application/sparql-results+json" },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => "")}`);
    return res.json() as Promise<{ results: { bindings: Record<string, { value: string }>[] } }>;
  } finally {
    clearTimeout(timer);
  }
}

// IUCN 등급 + 상위 분류군으로 chunked 쿼리
// limit 없이 5000 + 까지 가져옴 (Wikidata 기본 제한 ~10K)
export async function fetchByCategoryAndTaxon(
  category: string,
  taxonQid: string,
  limit = 5000
): Promise<BulkSpecies[]> {
  const iucnQid = IUCN_WIKIDATA_IDS[category];
  if (!iucnQid) throw new Error(`Unknown category: ${category}`);

  const query = `
    SELECT DISTINCT ?species ?sciName ?koLabel ?enLabel ?enArticle ?koArticle WHERE {
      ?species wdt:P141 wd:${iucnQid} .
      ?species wdt:P171* wd:${taxonQid} .
      ?species wdt:P225 ?sciName .
      OPTIONAL {
        ?enArticle schema:about ?species ;
          schema:isPartOf <https://en.wikipedia.org/> .
      }
      OPTIONAL {
        ?koArticle schema:about ?species ;
          schema:isPartOf <https://ko.wikipedia.org/> .
      }
      OPTIONAL { ?species rdfs:label ?koLabel . FILTER(LANG(?koLabel) = "ko") }
      OPTIONAL { ?species rdfs:label ?enLabel . FILTER(LANG(?enLabel) = "en") }
    }
    LIMIT ${limit}
  `;

  const data = await runSparql(query);
  return parseSparqlResults(data, category);
}

// 분류군 필터 없이 IUCN 카테고리만으로 가져오기 — QID 자릿수별 prefix 청크
// http://www.wikidata.org/entity/Q1xxxx, Q2xxxx, ..., Q9xxxx 로 10 청크 분할
export async function fetchByCategoryChunked(
  category: string,
  chunks = 10,
  perChunkLimit = 5000
): Promise<BulkSpecies[]> {
  const iucnQid = IUCN_WIKIDATA_IDS[category];
  if (!iucnQid) throw new Error(`Unknown category: ${category}`);

  const allResults: BulkSpecies[] = [];
  const seen = new Set<string>();

  // QID 첫 자리수 기준 분할 (0-9)
  // Q1xxxx, Q2xxxx, ... Q9xxxx — 거의 균등 분포
  const totalChunks = Math.min(10, Math.max(2, chunks));
  for (let i = 0; i < totalChunks; i++) {
    const query = `
      SELECT DISTINCT ?species ?sciName ?koLabel ?enLabel ?enArticle ?koArticle WHERE {
        ?species wdt:P141 wd:${iucnQid} .
        ?species wdt:P225 ?sciName .
        FILTER(STRSTARTS(STR(?species), "http://www.wikidata.org/entity/Q${i}"))
        OPTIONAL {
          ?enArticle schema:about ?species ;
            schema:isPartOf <https://en.wikipedia.org/> .
        }
        OPTIONAL {
          ?koArticle schema:about ?species ;
            schema:isPartOf <https://ko.wikipedia.org/> .
        }
        OPTIONAL { ?species rdfs:label ?koLabel . FILTER(LANG(?koLabel) = "ko") }
        OPTIONAL { ?species rdfs:label ?enLabel . FILTER(LANG(?enLabel) = "en") }
      }
      LIMIT ${perChunkLimit}
    `;
    try {
      const data = await runSparql(query, 90000);
      const chunk = parseSparqlResults(data, category);
      for (const s of chunk) {
        if (!seen.has(s.qid)) {
          seen.add(s.qid);
          allResults.push(s);
        }
      }
      console.log(`    chunk ${i + 1}/${chunks}: +${chunk.length}, dedup total ${allResults.length}`);
    } catch (e) {
      console.log(`    chunk ${i + 1}/${chunks}: ✗ ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }

  return allResults;
}

function parseSparqlResults(data: { results: { bindings: Record<string, { value: string }>[] } }, category: string): BulkSpecies[] {
  const out: BulkSpecies[] = [];
  const seen = new Set<string>();

  for (const b of data.results.bindings) {
    const speciesUrl = b.species?.value;
    if (!speciesUrl) continue;
    const qid = speciesUrl.split("/").pop() ?? speciesUrl;
    if (seen.has(qid)) continue;
    seen.add(qid);

    const enUrl = b.enArticle?.value;
    const koUrl = b.koArticle?.value;
    const enTitle = enUrl ? decodeURIComponent(enUrl.split("/").pop() ?? "").replace(/_/g, " ") : null;
    const koTitle = koUrl ? decodeURIComponent(koUrl.split("/").pop() ?? "").replace(/_/g, " ") : null;

    out.push({
      qid,
      scientificName: b.sciName?.value ?? "",
      category,
      commonNameKo: b.koLabel?.value ?? null,
      commonNameEn: b.enLabel?.value ?? null,
      wikipediaTitleEn: enTitle,
      wikipediaTitleKo: koTitle,
    });
  }
  return out;
}
