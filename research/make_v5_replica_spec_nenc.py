#!/usr/bin/env python3
"""research/_v5_replica.ts → research/_v5_replica_spec_nenc.ts 생성.

LIFE_HISTORY 의 ne_nc 만 특허 명세서 계열(lastwatch_score_full_spec v3/v4 §2.4,
발명신고서 §8)의 분류군 상수로 치환한다. 그 외에는 한 글자도 바꾸지 않는다.

명세서 값:
    mammal 0.20 / bird 0.25 / reptile 0.15 / amphibian 0.10 /
    fish 0.10 / invertebrate 0.05 / plant 0.10

lib/tipping-point.ts 와 research/_v5_replica.ts 는 절대 수정하지 않는다.
"""
import io, re, sys

SRC = "research/_v5_replica.ts"
DST = "research/_v5_replica_spec_nenc.ts"

# v5 LIFE_HISTORY 키 → (코드 현재값, 명세서 값)
SPEC = {
    "포유류": (0.15, 0.20),
    "조류": (0.2, 0.25),
    "파충류": (0.15, 0.15),
    "양서류": (0.1, 0.10),
    '"어류 (조기어류)"': (0.05, 0.10),
    '"어류 (경골어류)"': (0.05, 0.10),
    '"어류 (연골어류)"': (0.1, 0.10),
    "어류": (0.05, 0.10),
    "곤충": (0.1, 0.05),
    "거미류": (0.1, 0.05),
    "갑각류": (0.08, 0.05),
    "복족류": (0.1, 0.05),
    "이매패류": (0.05, 0.05),
    '"산호류 (육방산호)"': (0.05, 0.05),
    '"식물 (침엽수)"': (0.2, 0.10),
    '"식물 (소철)"': (0.2, 0.10),
    '"식물 (쌍떡잎)"': (0.2, 0.10),
    "양치식물": (0.15, 0.10),
    '"양치식물 (속새류)"': (0.15, 0.10),
    '"이끼류 (우산이끼)"': (0.15, 0.10),
    "지의류": (0.15, 0.10),
}
# DEFAULT_LIFE 는 명세서에 대응 항목이 없어 그대로 둔다 (0.15).

src = io.open(SRC, encoding="utf-8").read()
out = src
changed = []

for key, (_cur, new) in SPEC.items():
    # `  키: { generation_time: N, r_max: N, ne_nc: N },` 한 줄만 겨냥한다.
    pat = re.compile(
        r"(^  " + re.escape(key) + r": \{ generation_time: [\d.]+, r_max: [\d.]+, ne_nc: )([\d.]+)( \},)$",
        re.M,
    )
    m = pat.search(out)
    if not m:
        sys.exit("앵커 실패: " + key)
    old = m.group(2)
    out = pat.sub(lambda mm: mm.group(1) + repr(new).rstrip("0").rstrip(".") if False else mm.group(1) + ("%g" % new) + mm.group(3), out, count=1)
    changed.append((key, old, "%g" % new))

out = out.replace(
    "// LastWatch EWS-PVA Hybrid Engine",
    "// [자동 생성] research/make_v5_replica_spec_nenc.py — ne_nc 만 명세서 값으로 치환한 사본.\n"
    "// 원본: research/_v5_replica.ts. 계산 로직은 동일하다. 직접 수정하지 말 것.\n"
    "// LastWatch EWS-PVA Hybrid Engine",
    1,
)

io.open(DST, "w", encoding="utf-8").write(out)
print("생성:", DST)
for k, a, b in changed:
    mark = "" if a == b else "  ←"
    print("  %-20s %s → %s%s" % (k, a, b, mark))
print("바뀐 항목: %d / %d" % (sum(1 for _, a, b in changed if a != b), len(changed)))
