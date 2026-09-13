#!/usr/bin/env python3
"""class_name 을 iucn_class 기준으로 교정한다. **DB 를 실제로 수정한다.**

대상: 큐레이티드 종 중 (1) class_name 이 iucn_class 와 어긋나는 종
                      (2) class_name 이 비어 DEFAULT_LIFE 로 떨어지는 종
교정 규칙은 research/audit_class_name.py · research/simulate_class_name_fix.ts 의 MAP 과 같다.
실행 전 data/species.db 백업 필수. 적용 뒤 tipping_points 는 scripts/compute-tipping-points.ts 로 재계산.

실행: python3 research/apply_class_name_fix.py
"""
import sqlite3, json, collections

MAP = {
    "MAMMALIA": "포유류", "AVES": "조류", "REPTILIA": "파충류", "AMPHIBIA": "양서류",
    "ACTINOPTERYGII": "어류 (조기어류)", "CHONDRICHTHYES": "어류 (연골어류)",
    "PETROMYZONTI": "어류", "INSECTA": "곤충", "ARACHNIDA": "거미류",
    "MALACOSTRACA": "갑각류", "MAXILLOPODA": "갑각류", "HEXANAUPLIA": "갑각류",
    "GASTROPODA": "복족류", "BIVALVIA": "이매패류", "ANTHOZOA": "산호류 (육방산호)",
    "PINOPSIDA": "식물 (침엽수)", "CYCADOPSIDA": "식물 (소철)",
    "MAGNOLIOPSIDA": "식물 (쌍떡잎)", "LILIOPSIDA": "식물 (쌍떡잎)",
    "POLYPODIOPSIDA": "양치식물", "JUNGERMANNIOPSIDA": "이끼류 (우산이끼)",
    "BRYOPSIDA": "이끼류 (우산이끼)", "TAKAKIOPSIDA": "이끼류 (우산이끼)",
    "ANTHOCEROTOPSIDA": "이끼류 (우산이끼)", "LECANOROMYCETES": "지의류",
}


def equiv(cur, exp):
    # 어류 3키는 v5 파라미터가 사실상 같아 경골/조기 혼용은 동치로 본다
    return cur == exp or (exp == "어류 (조기어류)" and cur in ("어류 (경골어류)", "어류 (조기어류)"))


def plan_for(con):
    out = []
    for r in con.execute("SELECT id, class_name, iucn_class FROM species WHERE is_curated=1"):
        ic = (r["iucn_class"] or "").strip().upper()
        exp = MAP.get(ic) if ic else None
        if not exp:
            continue
        cur = (r["class_name"] or "").strip()
        kind = "blank" if not cur else ("mismatch" if not equiv(cur, exp) else None)
        if kind:
            out.append((r["id"], cur or None, exp, kind))
    return out


con = sqlite3.connect("data/species.db")
con.row_factory = sqlite3.Row
before_rows = con.execute("SELECT COUNT(*) FROM species").fetchone()[0]

plan = plan_for(con)
c = collections.Counter(k for *_, k in plan)
print("교정 대상 %d종 (불일치 %d + 빈값 %d)" % (len(plan), c["mismatch"], c["blank"]))

with con:
    con.executemany("UPDATE species SET class_name=? WHERE id=?", [(exp, sid) for sid, _, exp, _ in plan])

left = plan_for(con)
after_rows = con.execute("SELECT COUNT(*) FROM species").fetchone()[0]
print("적용 후 남은 대상: %d  (0 이어야 정상)" % len(left))
print("species 행 수: %d → %d" % (before_rows, after_rows))

json.dump([{"id": s, "from": f, "to": t, "kind": k} for s, f, t, k in plan],
          open("/tmp/class_name_applied.json", "w"), ensure_ascii=False)
con.close()
