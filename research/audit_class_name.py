#!/usr/bin/env python3
"""class_name 과 IUCN 분류(iucn_class)가 어긋나는 큐레이티드 종을 전수 검사한다.

읽기 전용(mode=immutable). DB 는 건드리지 않는다.

왜 중요한가: lib/tipping-point.ts 의 lifeFor() 가 class_name 으로 생활사
파라미터(generation_time·r_max·ne_nc)를 고른다. class_name 이 틀리면
v5 점수가 틀린 파라미터로 계산된다. 빈 값이면 DEFAULT_LIFE 로 떨어진다.

실행: python3 research/audit_class_name.py
"""
import sqlite3, collections
con=sqlite3.connect("file:data/species.db?immutable=1",uri=True); con.row_factory=sqlite3.Row

# IUCN class → v5 LIFE_HISTORY 키. v5 에 키가 없으면 DEFAULT_LIFE 로 떨어진다.
MAP={
 "MAMMALIA":"포유류","AVES":"조류","REPTILIA":"파충류","AMPHIBIA":"양서류",
 "ACTINOPTERYGII":"어류 (조기어류)","CHONDRICHTHYES":"어류 (연골어류)",
 "PETROMYZONTI":"어류","INSECTA":"곤충","ARACHNIDA":"거미류",
 "MALACOSTRACA":"갑각류","MAXILLOPODA":"갑각류","HEXANAUPLIA":"갑각류",
 "GASTROPODA":"복족류","BIVALVIA":"이매패류","ANTHOZOA":"산호류 (육방산호)",
 "PINOPSIDA":"식물 (침엽수)","CYCADOPSIDA":"식물 (소철)",
 "MAGNOLIOPSIDA":"식물 (쌍떡잎)","LILIOPSIDA":"식물 (쌍떡잎)",
 "POLYPODIOPSIDA":"양치식물","JUNGERMANNIOPSIDA":"이끼류 (우산이끼)",
 "BRYOPSIDA":"이끼류 (우산이끼)","TAKAKIOPSIDA":"이끼류 (우산이끼)",
 "ANTHOCEROTOPSIDA":"이끼류 (우산이끼)","LECANOROMYCETES":"지의류",
}
UNMAPPED_OK={"AGARICOMYCETES","FLORIDEOPHYCEAE","CLITELLATA"}  # v5 에 대응 키 없음

rows=con.execute("""SELECT id, scientific_name, common_name_ko, common_name_en, category,
                    class_name, iucn_class, iucn_order, iucn_family, iucn_kingdom, iucn_phylum,
                    mature_individuals, iucn_population_size
                    FROM species WHERE is_curated=1""").fetchall()

mismatch=[]; no_iucn=[]; unmapped=[]; blank=[]
for r in rows:
    ic=(r["iucn_class"] or "").strip().upper()
    cn=(r["class_name"] or "").strip()
    if not ic:
        no_iucn.append(r); continue
    if ic in UNMAPPED_OK:
        unmapped.append(r); continue
    exp=MAP.get(ic)
    if exp is None:
        unmapped.append(r); continue
    if not cn:
        blank.append(r); continue
    # 어류는 v5 에서 3개 키가 사실상 같은 파라미터라 경골/조기 혼용은 동치로 본다
    same = (cn==exp) or (exp=="어류 (조기어류)" and cn in ("어류 (경골어류)","어류 (조기어류)"))
    if not same: mismatch.append((r,exp))

print("큐레이티드 종           %5d" % len(rows))
print("iucn_class 없음         %5d  (대조 불가)" % len(no_iucn))
print("class_name 비어 있음    %5d  (DEFAULT_LIFE 로 떨어짐)" % len(blank))
print("v5 에 대응 키 없는 분류 %5d" % len(unmapped))
print("대조 가능              %5d" % (len(rows)-len(no_iucn)-len(unmapped)))
print()
print(">>> 어긋나는 종        %5d <<<" % len(mismatch))
print()
c=collections.Counter((r["class_name"], exp) for r,exp in mismatch)
print("틀린 방향 (현재 class_name → iucn_class 기준 정답):")
for (cur,exp),n in c.most_common():
    print("  %-18s → %-18s %5d 종" % (cur or "(빈값)", exp, n))
haspop=[ (r,e) for r,e in mismatch if (r["mature_individuals"] or 0)>0 or (r["iucn_population_size"] or 0)>0 ]
print()
print("그중 개체수가 있어 v5 점수가 실제로 산출되는 종: %d" % len(haspop))
import json
json.dump([{ "id":r["id"],"sci":r["scientific_name"],"ko":r["common_name_ko"],
             "cat":r["category"],"cur":r["class_name"],"exp":e,
             "iucn_class":r["iucn_class"],"iucn_order":r["iucn_order"],
             "iucn_family":r["iucn_family"],
             "pop":(r["mature_individuals"] or r["iucn_population_size"])}
            for r,e in mismatch],
          open("/tmp/class_name_mismatch.json","w"),ensure_ascii=False)
print()
print("점수 산출되는 어긋난 종 목록:")
for r,e in sorted(haspop,key=lambda x:-(x[0]["mature_individuals"] or x[0]["iucn_population_size"] or 0)):
    print("  %-28s %-4s %-14s → %-14s (%s / %s)" % (
        (r["common_name_ko"] or r["scientific_name"])[:28], r["category"],
        r["class_name"], e, r["iucn_class"], r["iucn_order"]))
con.close()
