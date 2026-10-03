// 이 종에 연결된 IUCN 평가 기록의 성격 (2026-10-03, 결정 대기 항목 12)
//
// sync_iucn_all.py 는 평가 범위·평가 대상을 확인하지 않고 latest 평가를 저장했다. scripts/sync-iucn-assessment-scope.ts 가
// 저장된 평가를 다시 조회해 species.iucn_assessment_scope · iucn_assessed_taxon 을 채웠다 (점수 행이 있는 종 573종).
//   regional   — 지역 평가(Europe 등). NA·RE 는 지역 평가에만 쓰는 등급이라 범위 기록이 없어도 지역 평가로 본다
//   parentTaxon— 아종이 종 단위 평가에 연결됨 (예: Panthera tigris amoyensis → Panthera tigris). IUCN 개체수는 종 전체의 값
//   synonym    — 같은 종의 다른 학명 (예: Plectrohyla pachyderma → Sarcohyla pachyderma). 값 자체는 이 종의 것
import type { SpeciesRow } from "./db";

export interface IucnRecordNote {
  scope: string | null;
  regional: boolean;
  parentTaxon: string | null;
  synonym: string | null;
}

const REGIONAL_ONLY_CATEGORIES = ["NA", "RE"];

export function iucnRecordNote(
  s: Pick<SpeciesRow, "scientific_name" | "iucn_category" | "iucn_assessment_scope" | "iucn_assessed_taxon">
): IucnRecordNote {
  const scope = s.iucn_assessment_scope ?? null;
  const regional =
    (!!scope && !scope.split("; ").includes("Global")) || REGIONAL_ONLY_CATEGORIES.includes(s.iucn_category ?? "");
  const taxon = s.iucn_assessed_taxon?.trim() || null;
  let parentTaxon: string | null = null;
  let synonym: string | null = null;
  if (taxon && taxon !== s.scientific_name) {
    if (s.scientific_name.startsWith(`${taxon} `)) parentTaxon = taxon;
    else synonym = taxon;
  }
  return { scope, regional, parentTaxon, synonym };
}

/** IUCN 값(등급·성숙 개체수·추세) 뒤에 붙이는 짧은 단서. 문제가 없으면 "" */
export function iucnValueQualifier(n: IucnRecordNote): string {
  if (n.regional) return n.scope ? `${n.scope} 지역 평가` : "지역 평가";
  if (n.parentTaxon) return `${n.parentTaxon} 종 단위 평가`;
  return "";
}
