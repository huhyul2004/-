#!/usr/bin/env python3
"""class_name 교정 + tipping_points 재계산 결과를 백업과 대조한다. 읽기 전용.

  수정 전 = data/species.db.backup_before_class_name_fix_20260830-124547 (수정 전 DB 와 MD5 동일)
  수정 후 = data/species.db
  예측   = /tmp/class_name_fix_sim_dbseed.json (DB_SEED=1 tsx research/simulate_class_name_fix.ts)
  대상   = /tmp/class_name_applied.json      (python3 research/apply_class_name_fix.py)

대상 밖 종은 payload 까지 전부 같아야 한다. 하나라도 다르면 백업으로 롤백해야 한다.
실행: python3 research/verify_class_name_fix.py
"""
import sqlite3, json
from collections import Counter

BACKUP = "data/species.db.backup_before_class_name_fix_20260830-124547"


def load(path):
    con = sqlite3.connect(f"file:{path}?immutable=1", uri=True)
    out = {}
    for sid, score, tier, dl, ext, pj in con.execute(
        "SELECT species_id, consensus_score, intervention_tier, deadline_days, extinction_days, payload_json FROM tipping_points"):
        p = json.loads(pj)
        out[sid] = {"score": score, "tier": tier, "dl": dl, "ext": ext,
                    "ne": p.get("layer_scores", {}).get("iucn", {}).get("Ne"), "payload": pj}
    n_species = con.execute("SELECT COUNT(*) FROM species").fetchone()[0]
    con.close()
    return out, n_species


before, sp_before = load(BACKUP)
after, sp_after = load("data/species.db")
targets = {r["id"] for r in json.load(open("/tmp/class_name_applied.json"))}
predicted = {c["id"] for c in json.load(open("/tmp/class_name_fix_sim_dbseed.json"))["changed"]}

print(f"species 행 수        {sp_before} → {sp_after}")
print(f"tipping_points 행 수 {len(before)} → {len(after)}")
print(f"행 집합 동일          {set(before) == set(after)}")

changed = {k for k in before if k in after and
           (before[k]["score"], before[k]["tier"], before[k]["ne"]) != (after[k]["score"], after[k]["tier"], after[k]["ne"])}
payload_diff = {k for k in before if k in after and before[k]["payload"] != after[k]["payload"]}
collateral = payload_diff - targets

print(f"\n점수·티어·Ne 가 바뀐 종   {len(changed)}")
print(f"payload 가 조금이라도 바뀐 종 {len(payload_diff)}")
print(f">>> 대상 밖인데 payload 가 바뀐 종 {len(collateral)}  (0 이어야 정상 — 아니면 롤백)")
for k in sorted(collateral)[:10]:
    print("   ", k)

print(f"\n예측 {len(predicted)}종 vs 실제 {len(changed)}종 — 집합 일치: {predicted == changed}")
for k in sorted(predicted - changed)[:10]:
    print("   예측엔 있고 실제엔 없음:", k)
for k in sorted(changed - predicted)[:10]:
    print("   실제엔 있고 예측엔 없음:", k)

d = [after[k]["score"] - before[k]["score"] for k in changed]
print(f"\n점수 하락 {sum(x < 0 for x in d)} / 상승 {sum(x > 0 for x in d)} / 동일(Ne 만 변화) {sum(x == 0 for x in d)}")
moves = Counter(f"{before[k]['tier']}→{after[k]['tier']}" for k in changed if before[k]["tier"] != after[k]["tier"])
print(f"티어 이동 {sum(moves.values())}종: {dict(moves)}")
