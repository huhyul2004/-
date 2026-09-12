// 같은 IUCN 등급 + 같은 분류군 안에서의 비교 — 챗봇 프롬프트 컨텍스트 전용.
//
// 그룹 키 = (species.category, species.iucn_class)
//   - 등급은 프롬프트가 "IUCN 등급"으로 보여주는 category 를 쓴다 (한 프롬프트에 두 등급을 섞지 않는다).
//   - 분류군은 iucn_class 를 쓴다. class_name 은 비어 있거나 틀린 종이 많아
//     (조류가 '파충류'로 붙은 사례 등, docs/data-quality-suspects-2026-08-27.md) 비교 기준이 못 된다.
// 대상 = v5 점수가 있는 종. EX/EW 는 점수가 100 으로 고정된 사실값이라 비교에서 뺀다.
//
// 점수 계산에는 관여하지 않는다. tipping_points 를 읽기만 한다.
import { getDb, type SpeciesRow } from "./db";
import { floorBreakdown, FLOOR_TAG } from "./floor-transparency";

/** 그룹이 이 크기보다 작으면 비교 블록을 넣지 않는다. research/analyze_peer_groups.py 와 같아야 한다. */
export const MIN_GROUP_SIZE = 3;

const EXCLUDED_CATEGORIES = new Set(["EX", "EW"]);

const CLASS_KO: Record<string, string> = {
  MAMMALIA: "포유류",
  AVES: "조류",
  REPTILIA: "파충류",
  AMPHIBIA: "양서류",
  ACTINOPTERYGII: "조기어류",
  CHONDRICHTHYES: "연골어류",
  INSECTA: "곤충",
  ARACHNIDA: "거미류",
  MALACOSTRACA: "갑각류",
  GASTROPODA: "복족류",
  BIVALVIA: "이매패류",
  ANTHOZOA: "산호류",
  PINOPSIDA: "침엽수",
  CYCADOPSIDA: "소철류",
  MAGNOLIOPSIDA: "쌍떡잎식물",
  LILIOPSIDA: "외떡잎식물",
  POLYPODIOPSIDA: "양치식물",
  JUNGERMANNIOPSIDA: "우산이끼류",
  LECANOROMYCETES: "지의류",
  AGARICOMYCETES: "주름버섯류",
};

/** 상위 목록에서 한 점수대(동점 묶음)에 이름을 몇 개까지 적을지 */
const NAMES_PER_TIE = 5;

const TAG = "[출처: tipping_points, 같은 등급·분류군 내 비교]";

interface Peer {
  id: string;
  name: string;
  score: number;
  /** v5 기준 개체수 — inferPopulationWithSource 와 같은 우선순위 */
  n0: number | null;
  n0Src: "mature_individuals" | "iucn_population_size" | null;
  /** 개체수 하한을 뺐다면의 점수 (lib/floor-transparency.ts). 재구성할 수 없으면 null */
  noFloor: number | null;
}

/** 하한 적용 전 점수를 재구성하는 데 필요한 원 컬럼 */
type PeerRaw = {
  payload_json: string;
  category: SpeciesRow["category"];
  population_trend: string | null;
  mature_individuals: number | null;
  iucn_population_size: number | null;
};

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** 경쟁 순위(1,2,2,4…) — 동점이면 같은 순위를 주고 그 수를 함께 돌려준다. */
function rankOf(value: number, all: number[], higherIsFirst: boolean) {
  const ahead = all.filter((v) => (higherIsFirst ? v > value : v < value)).length;
  const ties = all.filter((v) => v === value).length;
  return { rank: ahead + 1, ties };
}

function rankText(r: { rank: number; ties: number }, n: number) {
  return `${n}종 중 ${r.rank}위${r.ties > 1 ? ` (동점 ${r.ties}종)` : ""}`;
}

const fmt = (x: number) => x.toFixed(1);

/**
 * 같은 등급·분류군 비교 블록. 비교할 수 없으면 빈 배열 —
 * 점수가 없거나, EX/EW 이거나, iucn_class 가 없거나, 그룹이 MIN_GROUP_SIZE 미만일 때.
 */
export function buildPeerComparisonLines(speciesId: string): string[] {
  const db = getDb();
  const me = db
    .prepare(`SELECT category, iucn_class FROM species WHERE id = ?`)
    .get(speciesId) as { category: string; iucn_class: string | null } | undefined;
  if (!me || EXCLUDED_CATEGORIES.has(me.category)) return [];
  const cls = (me.iucn_class ?? "").trim();
  if (!cls) return [];

  const peers = (
    db
      .prepare(
        `SELECT s.id, COALESCE(s.common_name_ko, s.scientific_name) AS name,
                t.consensus_score AS score, t.payload_json,
                s.category, s.population_trend, s.mature_individuals, s.iucn_population_size,
                CASE WHEN s.mature_individuals > 0 THEN s.mature_individuals
                     WHEN s.iucn_population_size > 0 THEN s.iucn_population_size END AS n0,
                CASE WHEN s.mature_individuals > 0 THEN 'mature_individuals'
                     WHEN s.iucn_population_size > 0 THEN 'iucn_population_size' END AS n0Src
         FROM tipping_points t JOIN species s ON s.id = t.species_id
         WHERE s.category = ? AND s.iucn_class = ?`
      )
      .all(me.category, cls) as (Omit<Peer, "noFloor"> & PeerRaw)[]
  ).map((p) => ({ ...p, noFloor: floorBreakdown(p, JSON.parse(p.payload_json))?.withoutFloor ?? null }));
  const self = peers.find((p) => p.id === speciesId);
  if (!self || peers.length < MIN_GROUP_SIZE) return [];

  const n = peers.length;
  const group = `${me.category} ${CLASS_KO[cls] ?? cls}(iucn_class=${cls})`;
  const scores = peers.map((p) => p.score);
  const out: string[] = [];

  out.push(`[같은 등급·분류군 비교 — ${group}, LastWatch v5 점수가 계산된 ${n}종 기준. 점수는 LastWatch 자체 계산이며 IUCN 공식 지표가 아님]`);

  // 개체수 하한 적용 전 순위도 함께 — 하한에 묶인 종이 많은 그룹은 순위가 크게 달라진다.
  const postRank = rankOf(self.score, scores, true);
  const preScores = peers.map((p) => p.noFloor);
  const canPre = self.noFloor != null && preScores.every((v) => v != null);
  const preRank = canPre ? rankOf(self.noFloor as number, preScores as number[], true) : null;
  if (preRank && (preRank.rank !== postRank.rank || preRank.ties !== postRank.ties)) {
    out.push(
      `위험도 점수 순위 (높은 순): ${rankText(postRank, n)}(개체수 하한 적용 후) / ` +
        `하한 적용 전 기준 ${rankText(preRank, n)}, 이 종 ${fmt(self.score)}점 (하한 적용 전 ${fmt(self.noFloor as number)}점)  ` +
        `${TAG} ${FLOOR_TAG}`
    );
  } else {
    out.push(
      `위험도 점수 순위 (높은 순): ${rankText(postRank, n)}, 이 종 ${fmt(self.score)}점` +
        `${preRank ? " — 개체수 하한 적용 전후 순위 같음" : ""}  ${TAG}${preRank ? ` ${FLOOR_TAG}` : ""}`
    );
  }
  out.push(`그룹 점수 중앙값: ${fmt(median(scores))}점 (이 종 ${fmt(self.score)}점)  ${TAG}`);

  // 상위 3위 안에 드는 종 — 3위 점수와 동점인 종까지 전부 포함한다 (임의로 잘라내지 않는다).
  const sorted = [...peers].sort((a, b) => b.score - a.score);
  const cutoff = sorted[Math.min(2, sorted.length - 1)].score;
  const top = sorted.filter((p) => p.score >= cutoff);
  const tiers: string[] = [];
  for (const s of Array.from(new Set(top.map((p) => p.score)))) {
    const at = top.filter((p) => p.score === s);
    const { rank } = rankOf(s, scores, true);
    const names = at.slice(0, NAMES_PER_TIE).map((p) => p.name).join(", ");
    const more = at.length > NAMES_PER_TIE ? ` 외 ${at.length - NAMES_PER_TIE}종` : "";
    tiers.push(`${rank}위${at.length > 1 ? `(동점 ${at.length}종)` : ""} ${fmt(s)}점: ${names}${more}`);
  }
  out.push(`그룹 내 점수 상위 3위 (동점 포함 ${top.length}종): ${tiers.join(" / ")}  ${TAG}`);

  if (self.n0 != null) {
    const withN = peers.filter((p) => p.n0 != null);
    const nRank = rankOf(self.n0, withN.map((p) => p.n0 as number), false);
    out.push(
      `개체수 순위 (적은 순): ${rankText(nRank, withN.length)}, 이 종 ${self.n0.toLocaleString()}마리  ${TAG}`
    );
    const bySrc = { mature_individuals: 0, iucn_population_size: 0 };
    for (const p of withN) if (p.n0Src) bySrc[p.n0Src]++;
    // 컬럼 이름과 내용이 반대다 (app/api/chat/route.ts 주석 참조) — 이름만 쓰면 모델이 거꾸로 읽으므로 뜻을 붙인다.
    //   mature_individuals   → 실제로는 '전체 개체수'
    //   iucn_population_size → 실제로는 '성숙 개체수'
    out.push(
      `개체수 비교 기준: v5 기준 개체수 N0 (전체 개체수 species.mature_individuals 가 있으면 우선, 없으면 성숙 개체수 species.iucn_population_size). ` +
        `이 그룹은 성숙 개체수(species.iucn_population_size) ${bySrc.iucn_population_size}종·` +
        `전체 개체수(species.mature_individuals) ${bySrc.mature_individuals}종이 섞여 있어, ` +
        `서로 다른 두 기준이 한 순위에 함께 들어 있음  ${TAG}`
    );
  }
  return out;
}
