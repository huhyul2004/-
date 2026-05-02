// Wikidata SPARQL client — IUCN 분류군 종 가져오기
// 무인증 / 5 req/sec 권장, 60s timeout

const SPARQL_URL = "https://query.wikidata.org/sparql";
const UA = "LastWatch/0.1 (educational, contact: huhyul2004@gmail.com)";

// IUCN 카테고리 → Wikidata 클래스 ID
// 검증된 IDs (https://www.wikidata.org/wiki/Property:P141)
export const IUCN_WIKIDATA_IDS: Record<string, string> = {
  CR: "Q219127", // Critically Endangered
  EN: "Q96377276", // Endangered status (P141 에서 실제로 쓰이는 IRI)
  VU: "Q278113", // Vulnerable
  EX: "Q237350", // Extinct
  EW: "Q239509", // Extinct in the wild
  NT: "Q719675", // Near threatened
  LC: "Q211005", // Least concern
};

export interface WikidataSpecies {
  qid: string; // Q-id
  scientificName: string;
  category: string;
  commonNameKo: string | null;
  commonNameEn: string | null;
  wikipediaTitleEn: string | null;
  wikipediaTitleKo: string | null;
  taxonClass: string | null;
  range: string | null;
}

async function runSparql(query: string): Promise<{ results: { bindings: Record<string, { value: string }>[] } }> {
  const res = await fetch(SPARQL_URL + "?query=" + encodeURIComponent(query) + "&format=json", {
    headers: { "User-Agent": UA, Accept: "application/sparql-results+json" },
  });
  if (!res.ok) throw new Error(`Wikidata HTTP ${res.status}: ${await res.text().catch(() => "")}`);
  return res.json() as Promise<{ results: { bindings: Record<string, { value: string }>[] } }>;
}

// 카테고리별로 한 번씩 호출. limit 으로 제한.
export async function fetchSpeciesByCategory(category: string, limit = 500): Promise<WikidataSpecies[]> {
  const qid = IUCN_WIKIDATA_IDS[category];
  if (!qid) throw new Error(`Unknown category: ${category}`);

  // 분류군(taxonomic class) 단계 walk 는 너무 무거워서 (P171*) 빼고
  // P171 (parent taxon) 한 단계만 시도. 분류군은 별도 enrichment 단계에서.
  const query = `
    SELECT DISTINCT ?species ?sciName ?koLabel ?enLabel ?enArticle ?koArticle WHERE {
      ?species wdt:P141 wd:${qid} .
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
  const out: WikidataSpecies[] = [];
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
      taxonClass: b.className?.value ?? null,
      range: null,
    });
  }
  return out;
}

// 한국어 분류군 명 매핑
export function koreanizeClass(taxonClass: string | null): string | null {
  if (!taxonClass) return null;
  const map: Record<string, string> = {
    Mammalia: "포유류",
    Aves: "조류",
    Reptilia: "파충류",
    Amphibia: "양서류",
    Actinopterygii: "어류",
    Chondrichthyes: "어류 (연골어류)",
    Sarcopterygii: "어류 (육기어류)",
    Insecta: "곤충",
    Arachnida: "거미류",
    Malacostraca: "갑각류",
    Gastropoda: "복족류",
    Bivalvia: "이매패류",
    Cephalopoda: "두족류",
    Anthozoa: "산호류",
    Magnoliopsida: "식물 (쌍떡잎)",
    Liliopsida: "식물 (외떡잎)",
    Pinopsida: "식물 (침엽수)",
    Polypodiopsida: "양치식물",
    Bryopsida: "선태식물",
    Cycadopsida: "식물 (소철)",
    Ginkgoopsida: "식물 (은행)",
  };
  return map[taxonClass] ?? taxonClass;
}
