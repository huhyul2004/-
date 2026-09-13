#!/usr/bin/env python3
"""
LastWatch 파인튜닝 데이터셋 생성 (254종 / 678건 / 결측 21.98%)

구성
  - 수기 시드  22종 × 7문항(한글명)        = 154건
  - API  종   178종 × 2문항(등급/추세)     = 356건  (결측 0)
    그중       57종 × 2문항(위협/서식지)   = 114건  (전부 결측)
  - DD   종    27종 × 1문항(등급·학명)     =  27건  (전부 결측)
  - 대조군     27종 × 1문항(등급·학명)     =  27건  (결측 0)
                                          ------
                                            678건, 결측 149건 = 21.98%

학명 문항 (신규)
  질문에 한글명 대신 학명을 쓴다.  "Murina aurata의 IUCN 등급은?"
    - DD 종   → "이 종의 데이터에는 없습니다."
    - 대조군  → "이 종의 IUCN 등급은 VU입니다."
  답변은 종을 "이 종"으로만 가리켜서 기존 규칙(답변에 학명 금지)을 지킨다.
  학명 문항 54건 중 결측 27건 = 정확히 50%.

  DD 27종은 전부 `phy-` (PHYLACINE) 포유류이고 IUCN 이 실제로 DD 판정한 종이다.
  한글명이 DB·리포지토리 어디에도 없어서 학명 문항으로만 쓸 수 있다.
  대조군 27종도 같은 `phy-` 풀에서, DD 와 **목(order) 분포를 똑같이 맞춰** 뽑는다
  (Rodentia 11 · Chiroptera 9 · Eulipotyphla 4 · Lagomorpha 2 · Cetartiodactyla 1).
  즉 두 집단은 출처·분류군이 같고 등급 유무만 다르다.
  대조군은 학명 문항만 갖는다 — 한글명 문항과 종이 겹치지 않는다.

확장 종 67 → 57
  학명 54건은 결측률 50% 라 전체를 위로 끌어올린다(무보정 시 24.2%).
  위협/서식지 확장 종을 10종 줄여 결측 20건·전체 20건을 상쇄, 21.98% 로 되돌린다.

문항 규칙 (기존과 동일)
  - 답변에 학명을 넣지 않는다. 한글명 질문은 원래 학명이 없으므로 그대로 둔다.
  - IUCN 등급 / 개체수 추세  → 답 있음
  - 주요 위협 / 서식지       → "이 종의 데이터에는 없습니다."
  - 개체수(마릿수) 질문 없음, 요약 문항 없음
  - population_trend 영문값은 한글로 매핑
  - 조사(은/는)는 종명 받침에 따라 자동 선택

분할: 종 단위 train 226 / valid 14 / test 14 (종이 두 split 에 걸치지 않음)
      결측 비율이 세 split 에 고루 가도록 확장 57종을 train 53 / valid 2 / test 2,
      DD·대조군은 각각 train 21 / valid 3 / test 3 배분
      → 학명 문항의 결측률이 세 split 모두 정확히 50%
"""
import json, re, sqlite3, sys
from collections import Counter, OrderedDict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DB = ROOT / "data" / "species.db"
OUT = ROOT / "data"
HERE = Path(__file__).resolve().parent
LIST_MD = HERE / "api_extended_57.md"
SCI_MD = HERE / "sci_questions_54.md"

SYSTEM = ("당신은 LastWatch의 멸종위기종 안내자입니다. 주어진 종에 대해 "
          "데이터베이스에 기록된 사실만 답하고, 데이터에 없는 내용은 지어내지 않습니다.")
NO_DATA = "이 종의 데이터에는 없습니다."

TREND_KO = {"Decreasing": "감소", "Increasing": "증가",
            "Stable": "안정", "Unknown": "알 수 없음"}

# 괄호 학명: 속명(대문자 시작) + 종소명 1~2개. 답변에서만 벗긴다.
#   "고기 사냥 (bushmeat)" / "(CITES Appendix I)" / "(Project Tiger 등)" 같은
#   비학명 괄호는 이 패턴에 걸리지 않는다.
SCI_PAREN = re.compile(r"\s?\(([A-Z][a-z]+(?: [a-z-]+){1,2})\)")


def strip_sci(text: str) -> str:
    """답변 문자열에서 괄호 학명을 제거. 이미 없으면 그대로(멱등)."""
    return SCI_PAREN.sub("", text)


SUFFIXES = ["주요 위협은?", "IUCN 등급은?", "개체수 추세는?", "어디에 사나요?",
            "보전 활동은?", "어떤 분류군인가요?", "무슨 과에 속하나요?"]

N_API = 178          # API 종 수
N_EXTENDED = 57      # 위협/서식지 문항까지 붙일 종 수 (학명 54건 희석분 보정)
EXT_VALID, EXT_TEST = 2, 2   # 확장 종의 valid/test 배분 (나머지 53은 train)

N_SCI = 27           # DD 종 — 학명 등급 문항, 전부 결측
N_CTRL = 27          # 대조군 — 학명 등급 문항, 전부 정답
SCI_VALID, SCI_TEST = 3, 3   # DD·대조군 각각의 valid/test 배분 (나머지 21은 train)


# ---------------------------------------------------------------- 조사
def has_batchim(name: str) -> bool:
    """종명 끝의 한글 음절로 받침 유무 판정. 괄호/공백 등 비한글 꼬리는 무시."""
    for ch in reversed(name):
        if "가" <= ch <= "힣":
            return (ord(ch) - 0xAC00) % 28 != 0
        if ch.isdigit():
            return ch in "01368"          # 영/일/삼/육/팔
    return True                            # 판정 불가 시 보수적으로 '은'


def eun_neun(name: str) -> str:
    return "은" if has_batchim(name) else "는"


# ---------------------------------------------------------------- 문항 생성
def api_records(name, category, trend_en, extended: bool):
    """API 종 문항. 등급/추세는 항상, 위협/서식지는 extended 종에만(전부 결측).

    답변에 학명은 넣지 않는다(질문은 원래부터 한글명만 쓴다).
    """
    recs = []
    if extended:
        recs.append((f"{name}의 주요 위협은?", NO_DATA))
    recs.append((f"{name}의 IUCN 등급은?",
                 f"{name}의 IUCN 등급은 {category}입니다."))
    recs.append((f"{name}의 개체수 추세는?",
                 f"{name}의 개체수 추세는 {TREND_KO[trend_en]}입니다."))
    if extended:
        recs.append((f"{name}{eun_neun(name)} 어디에 사나요?", NO_DATA))
    return recs


def sci_record(sci_name, category):
    """학명 등급 문항. category 가 None 이면 결측(DD 종).

    답변은 종을 '이 종'으로만 가리킨다 — 학명을 답변에 흘리지 않기 위해서다.
    """
    q = f"{sci_name}의 IUCN 등급은?"
    a = NO_DATA if category is None else f"이 종의 IUCN 등급은 {category}입니다."
    return (q, a)


def to_line(user: str, assistant: str) -> str:
    return json.dumps({"messages": [
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": user},
        {"role": "assistant", "content": assistant},
    ]}, ensure_ascii=False)


# ---------------------------------------------------------------- 시드 승계
def load_seed_species():
    """기존 train/valid/test 에서 7문항짜리(수기 시드) 22종 회수.

    질문은 원문 그대로, 답변은 괄호 학명만 벗겨서 승계한다.
    학명 문항 종(1문항)은 len!=7 이라 자동으로 걸러진다 — 재실행해도 멱등.
    """
    sp = OrderedDict()
    for split in ("train", "valid", "test"):
        p = OUT / f"{split}.jsonl"
        if not p.exists():
            sys.exit(f"[중단] 시드 승계 원본 없음: {p}")
        for line in p.open(encoding="utf-8"):
            rec = json.loads(line)
            u, a = rec["messages"][1]["content"], strip_sci(rec["messages"][2]["content"])
            for suf in SUFFIXES:
                if u.endswith(suf):
                    name = re.sub(r"(의|는|은|이)$", "", u[: -len(suf)].rstrip())
                    sp.setdefault(name, OrderedDict())[suf] = (u, a)
                    break
            else:
                sys.exit(f"[중단] 문항 어미 미매칭: {u}")
    seeds = OrderedDict((n, d) for n, d in sp.items() if len(d) == 7)
    if len(seeds) != 22:
        sys.exit(f"[중단] 수기 시드 22종이어야 하는데 {len(seeds)}종")
    return seeds


# ---------------------------------------------------------------- API 종 선정
POOL_SQL = """
select scientific_name, common_name_ko, iucn_category, iucn_population_trend, iucn_class
from species
where id like 'wd-q%'
  and common_name_ko is not null and trim(common_name_ko) <> ''
  and iucn_category is not null and trim(iucn_category) <> ''
  and iucn_population_trend is not null and trim(iucn_population_trend) <> ''
order by scientific_name
"""

# 기존 24종 — 원 데이터셋과 동일하게 유지 (선정 순서 1~24)
KEEP_24 = ["메콩자이언트연어잉어", "백산주전나무", "히달고 전나무", "위안바오산 전나무",
           "지위안 전나무", "아카시아 호위티", "뉴브리튼수리매", "버틀러매", "군들라치매",
           "헨시매", "누란매", "왕매", "종이껍질단풍나무", "긴몸납자루", "긴지느러미쑤기",
           "뮤티카천일홍", "스털렛", "유럽철갑상어", "엘크뿔산호", "아크티넬라 오브세라타",
           "수아레즈바오밥", "일본산개구리", "넓은부채산호", "날개씨자나무"]


def select_api_species(con, n_total=N_API):
    """기존 24종(순서 1~24) + 속별 라운드로빈 154종(순서 25~178).

    학명 알파벳순 그대로 이어붙이면 178종 중 38종이 Aloe 한 속이 되어 쏠린다.
    속별 라운드로빈(각 속에서 1종씩 순회)이면 결정적이면서 분류군이 고르게 퍼진다.
    """
    rows = con.execute(POOL_SQL).fetchall()

    by_name = {r["common_name_ko"]: r for r in rows}
    missing = [n for n in KEEP_24 if n not in by_name]
    if missing:
        sys.exit(f"[중단] 기존 24종 중 풀에서 사라진 종: {missing}")

    chosen = [by_name[n] for n in KEEP_24]
    taken = set(KEEP_24)

    by_genus = OrderedDict()
    for r in rows:
        if r["common_name_ko"] in taken:
            continue
        by_genus.setdefault(r["scientific_name"].split()[0], []).append(r)

    depth = max(len(v) for v in by_genus.values())
    for i in range(depth):
        for genus_rows in by_genus.values():
            if i < len(genus_rows) and len(chosen) < n_total:
                chosen.append(genus_rows[i])
        if len(chosen) >= n_total:
            break

    if len(chosen) != n_total:
        sys.exit(f"[중단] API 종 {n_total}종 필요한데 {len(chosen)}종만 확보")
    return chosen


# ---------------------------------------------------------------- 학명 문항 종
def select_dd_species(con):
    """IUCN 이 DD 로 판정한 종 전부. 학명순.

    전부 `phy-` 포유류이고 common_name_ko / common_name_en / wikipedia_title 이
    모두 비어 있다 — 그래서 한글명 문항을 만들 수 없고 학명 문항 전용이다.
    """
    rows = con.execute("""
        select scientific_name, order_name, family_name, iucn_population_trend
        from species where iucn_category = 'DD' order by scientific_name""").fetchall()
    if len(rows) != N_SCI:
        sys.exit(f"[중단] DD 종 {N_SCI}종이어야 하는데 {len(rows)}종")
    return rows


# 대조군에서 제외할 등급: NA(Not Applicable)·RE(Regionally Extinct)는
# IUCN 위협범주가 아니라서 '등급이 있는 종'의 대조군으로 부적절하다.
CTRL_CATEGORIES = ("CR", "EN", "VU", "NT", "LC")
CTRL_RANK = {c: i for i, c in enumerate(CTRL_CATEGORIES)}


def select_ctrl_species(con, dd_rows, exclude_sci):
    """DD 와 목(order) 분포를 똑같이 맞춘 대조군. 같은 `phy-` 풀에서 뽑는다.

    목별 할당량 안에서는 (위협등급 높은 순, 학명순)으로 결정적으로 자른다.
    LC 가 압도적으로 많은 풀이라 그냥 학명순으로 자르면 27종이 전부 LC 가 된다.
    """
    quota = Counter(r["order_name"] for r in dd_rows)
    chosen = []
    for order_name in sorted(quota):
        rows = con.execute(f"""
            select scientific_name, iucn_category, order_name, family_name
            from species
            where id like 'phy-%' and order_name = ?
              and iucn_category in ({','.join('?' * len(CTRL_CATEGORIES))})
            order by scientific_name""", (order_name, *CTRL_CATEGORIES)).fetchall()
        rows = [r for r in rows if r["scientific_name"] not in exclude_sci]
        rows.sort(key=lambda r: (CTRL_RANK[r["iucn_category"]], r["scientific_name"]))
        need = quota[order_name]
        if len(rows) < need:
            sys.exit(f"[중단] 대조군 {order_name} {need}종 필요한데 {len(rows)}종만 있음")
        chosen += rows[:need]
    if len(chosen) != N_CTRL:
        sys.exit(f"[중단] 대조군 {N_CTRL}종이어야 하는데 {len(chosen)}종")
    return chosen


# ---------------------------------------------------------------- 분할
# 시드: 결측 2건짜리(절멸종) 4종을 train 2 / valid 1 / test 1 로 나눠
#       valid·test 결측 비율이 전체와 비슷하게 맞도록 배치. 호랑이는 valid 고정.
SEED_VALID = ["호랑이", "여행비둘기"]
SEED_TEST = ["자이언트판다", "도도새"]
# API: 기존 분할 4종 유지 (넷 다 확장 57종 안에 있고, EXT_VALID/TEST=2 를 정확히 채운다)
API_VALID_KEEP = ["히달고 전나무", "유럽철갑상어"]
API_TEST_KEEP = ["위안바오산 전나무", "뮤티카천일홍"]


def stride_pick(seq, k):
    """길이 k 를 균등 간격으로 결정적 추출."""
    if k == 0:
        return []
    step = len(seq) / float(k)
    out = [seq[int(i * step)] for i in range(k)]
    assert len(set(out)) == k, "간격 추출에서 중복 발생"
    return out


def split_api(chosen, extended_names):
    """valid/test 각 8종, 그중 확장 종이 정확히 EXT_VALID/EXT_TEST 종 오도록 배분."""
    keep_v, keep_t = list(API_VALID_KEEP), list(API_TEST_KEEP)
    assert all(n in extended_names for n in keep_v + keep_t), \
        "기존 분할 4종은 확장 종 안에 있어야 함"

    ext = [r["common_name_ko"] for r in chosen
           if r["common_name_ko"] in extended_names and r["common_name_ko"] not in keep_v + keep_t]
    non = [r["common_name_ko"] for r in chosen if r["common_name_ko"] not in extended_names]

    ext_pick = stride_pick(ext, (EXT_VALID - len(keep_v)) + (EXT_TEST - len(keep_t)))
    valid = set(keep_v) | set(ext_pick[0::2])
    test = set(keep_t) | set(ext_pick[1::2])

    n_non = 8 - EXT_VALID
    non_pick = stride_pick(non, n_non * 2)
    valid |= set(non_pick[0::2])
    test |= set(non_pick[1::2])

    assert not (valid & test), "valid/test 겹침"
    assert len(valid) == len(test) == 8, (len(valid), len(test))
    assert len(valid & extended_names) == EXT_VALID
    assert len(test & extended_names) == EXT_TEST

    train = [r for r in chosen if r["common_name_ko"] not in (valid | test)]
    return (train,
            [r for r in chosen if r["common_name_ko"] in valid],
            [r for r in chosen if r["common_name_ko"] in test])


def split_sci(rows):
    """학명 문항 종(DD·대조군 공통)을 train 21 / valid 3 / test 3 으로 결정적 배분."""
    names = [r["scientific_name"] for r in rows]
    pick = stride_pick(names, SCI_VALID + SCI_TEST)
    valid, test = set(pick[0::2]), set(pick[1::2])
    assert len(valid) == SCI_VALID and len(test) == SCI_TEST, (len(valid), len(test))
    assert not (valid & test)
    return ([r for r in rows if r["scientific_name"] not in (valid | test)],
            [r for r in rows if r["scientific_name"] in valid],
            [r for r in rows if r["scientific_name"] in test])


# ---------------------------------------------------------------- main
def main():
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row

    seeds = load_seed_species()
    api = select_api_species(con)
    extended_names = {r["common_name_ko"] for r in api[:N_EXTENDED]}

    # 학명 문항 종은 한글명 문항 종과 절대 겹치면 안 된다.
    seed_sci = set()
    for n in seeds:
        r = con.execute("select scientific_name from species where common_name_ko = ? limit 1",
                        (n,)).fetchone()
        if r:
            seed_sci.add(r["scientific_name"])
    api_sci = {r["scientific_name"] for r in api}

    dd = select_dd_species(con)
    ctrl = select_ctrl_species(con, dd, exclude_sci=seed_sci | api_sci
                               | {r["scientific_name"] for r in dd})
    con.close()

    seed_valid = [n for n in seeds if n in SEED_VALID]
    seed_test = [n for n in seeds if n in SEED_TEST]
    seed_train = [n for n in seeds if n not in SEED_VALID + SEED_TEST]
    assert (len(seed_train), len(seed_valid), len(seed_test)) == (18, 2, 2)
    assert "호랑이" in seed_valid, "valid 에 호랑이 유지 조건 위반"

    api_train, api_valid, api_test = split_api(api, extended_names)
    assert (len(api_train), len(api_valid), len(api_test)) == (162, 8, 8)

    dd_train, dd_valid, dd_test = split_sci(dd)
    ctrl_train, ctrl_valid, ctrl_test = split_sci(ctrl)

    splits, split_of = {}, {}
    for split, s_names, a_rows, d_rows, c_rows in (
            ("train", seed_train, api_train, dd_train, ctrl_train),
            ("valid", seed_valid, api_valid, dd_valid, ctrl_valid),
            ("test", seed_test, api_test, dd_test, ctrl_test)):
        lines = []
        for n in s_names:
            for suf in SUFFIXES:                       # 시드는 원문 그대로
                u, a = seeds[n][suf]
                lines.append(to_line(u, a))
            split_of[n] = split
        for r in a_rows:
            nm = r["common_name_ko"]
            for u, a in api_records(nm, r["iucn_category"],
                                    r["iucn_population_trend"], nm in extended_names):
                lines.append(to_line(u, a))
            split_of[nm] = split
        for r in d_rows:                               # DD — 학명, 결측
            u, a = sci_record(r["scientific_name"], None)
            lines.append(to_line(u, a))
            split_of[r["scientific_name"]] = split
        for r in c_rows:                               # 대조군 — 학명, 정답
            u, a = sci_record(r["scientific_name"], r["iucn_category"])
            lines.append(to_line(u, a))
            split_of[r["scientific_name"]] = split
        splits[split] = lines

    for split, lines in splits.items():
        (OUT / f"{split}.jsonl").write_text("\n".join(lines) + "\n", encoding="utf-8")

    # ------------------------------------------------------------ 확장 종 목록
    md = [f"# 위협/서식지 문항을 추가한 API {N_EXTENDED}종",
          "",
          "API 종 선정 순서(기존 24종 → 속별 라운드로빈) **앞에서부터 "
          f"{N_EXTENDED}종**.",
          "각 종에 `주요 위협은?` / `어디에 사나요?` 2문항이 추가되며 답은 전부",
          f"`{NO_DATA}` — 이 {N_EXTENDED * 2}건이 결측의 대부분이다.",
          "나머지 결측은 수기 시드 절멸종 4종 8건 + DD 종 학명 문항 27건.",
          "",
          f"※ 원래 67종이었으나 학명 문항 54건(결측률 50%)이 전체 결측률을 24.2% 로",
          f"  끌어올려서, 10종을 덜어내 21.98% 로 되돌렸다(보정A).",
          "",
          f"배분: train {N_EXTENDED - EXT_VALID - EXT_TEST} / valid {EXT_VALID} / test {EXT_TEST}",
          "",
          "| # | 한글명 | 학명 | IUCN | 추세 | split |",
          "|---:|---|---|---|---|---|"]
    for i, r in enumerate(api[:N_EXTENDED], 1):
        nm = r["common_name_ko"]
        md.append(f"| {i} | {nm} | *{r['scientific_name']}* | {r['iucn_category']} "
                  f"| {TREND_KO[r['iucn_population_trend']]} | {split_of[nm]} |")
    LIST_MD.write_text("\n".join(md) + "\n", encoding="utf-8")

    # ------------------------------------------------------------ 학명 문항 목록
    smd = ["# 학명 등급 문항 54종 (DD 27 + 대조군 27)",
           "",
           "질문은 `{학명}의 IUCN 등급은?`, 답변은 종을 `이 종`으로만 가리킨다",
           "(기존 규칙 — 답변에 학명을 넣지 않는다).",
           "",
           "두 집단 모두 `phy-` (PHYLACINE) 포유류이고 **목(order) 분포가 동일**하다.",
           "차이는 등급 유무뿐이라, 모델이 '학명 질문이면 모른다'가 아니라",
           "'데이터에 등급이 있으면 답하고 없으면 없다고 한다'를 배우도록 짠 통제군이다.",
           "",
           "## DD 27종 — 답변 결측",
           "",
           "IUCN 이 실제로 Data Deficient 로 판정한 종. `common_name_ko` /",
           "`common_name_en` / `wikipedia_title` 이 모두 비어 있어 한글명 문항은 불가능하다.",
           "",
           "| # | 학명 | 목 | 과 | 추세 | split |",
           "|---:|---|---|---|---|---|"]
    for i, r in enumerate(dd, 1):
        smd.append(f"| {i} | *{r['scientific_name']}* | {r['order_name']} | {r['family_name']} "
                   f"| {r['iucn_population_trend'] or '-'} | {split_of[r['scientific_name']]} |")
    smd += ["", "## 대조군 27종 — 답변 있음", "",
            "| # | 학명 | 등급 | 목 | 과 | split |",
            "|---:|---|---|---|---|---|"]
    for i, r in enumerate(ctrl, 1):
        smd.append(f"| {i} | *{r['scientific_name']}* | {r['iucn_category']} | {r['order_name']} "
                   f"| {r['family_name']} | {split_of[r['scientific_name']]} |")
    SCI_MD.write_text("\n".join(smd) + "\n", encoding="utf-8")

    # ------------------------------------------------------------ 리포트
    counts = {"train": (len(seed_train), len(api_train), len(dd_train), len(ctrl_train)),
              "valid": (len(seed_valid), len(api_valid), len(dd_valid), len(ctrl_valid)),
              "test": (len(seed_test), len(api_test), len(dd_test), len(ctrl_test))}
    api_rows = {"train": api_train, "valid": api_valid, "test": api_test}

    print("=" * 76)
    print("줄 수")
    print("=" * 76)
    print(f"  {'':6} {'종':>4} {'시드×7':>8} {'확장API×4':>10} {'일반API×2':>10} "
          f"{'DD×1':>6} {'대조×1':>7} {'건수':>7}")
    tot_sp = tot_ln = 0
    for split in ("train", "valid", "test"):
        ns, na, nd, nc = counts[split]
        ne = len({r["common_name_ko"] for r in api_rows[split]} & extended_names)
        ln = len(splits[split])
        tot_sp += ns + na + nd + nc
        tot_ln += ln
        print(f"  {split:<6} {ns + na + nd + nc:>4} {ns:>4}×7 {ne:>7}×4 {na - ne:>7}×2 "
              f"{nd:>4}×1 {nc:>5}×1 {ln:>7}건")
    print(f"  {'합계':<5} {tot_sp:>4} {'':>42} {tot_ln:>7}건")

    print()
    print("=" * 76)
    print(f"결측 비율  (assistant == '{NO_DATA}')")
    print("=" * 76)
    rates = {}
    all_m = all_t = 0
    for split in ("train", "valid", "test"):
        recs = [json.loads(l) for l in splits[split]]
        m = sum(1 for r in recs if r["messages"][2]["content"] == NO_DATA)
        rates[split] = m / len(recs) * 100
        all_m += m
        all_t += len(recs)
        print(f"  {split:<6} {m:>3} / {len(recs):>3}  = {rates[split]:5.2f}%")
    overall = all_m / all_t * 100
    print(f"  {'전체':<5} {all_m:>3} / {all_t:>3}  = {overall:5.2f}%   "
          f"(목표 22.0% · 직전 데이터셋 22.05%)")
    print(f"  → split 간 최대 편차 {max(rates.values()) - min(rates.values()):.2f}%p, "
          f"전체 대비 최대 차이 {max(abs(v - overall) for v in rates.values()):.2f}%p")

    print()
    print("=" * 76)
    print("학명 문항 결측 비율  (질문에 한글명 대신 학명을 쓴 문항)")
    print("=" * 76)
    SCI_Q = re.compile(r"^[A-Z][a-z]+ [a-z-]+의 IUCN 등급은\?$")
    s_all_m = s_all_t = 0
    for split in ("train", "valid", "test"):
        t = m = 0
        for l in splits[split]:
            r = json.loads(l)
            if SCI_Q.match(r["messages"][1]["content"]):
                t += 1
                m += r["messages"][2]["content"] == NO_DATA
        s_all_m += m
        s_all_t += t
        print(f"  {split:<6} {m:>3} / {t:>3}  = {m / t * 100:5.1f}%")
    print(f"  {'전체':<5} {s_all_m:>3} / {s_all_t:>3}  = {s_all_m / s_all_t * 100:5.1f}%   (목표 50.0%)")
    print(f"  한글명 문항 결측: {all_m - s_all_m:>3} / {all_t - s_all_t:>3}  "
          f"= {(all_m - s_all_m) / (all_t - s_all_t) * 100:5.2f}%")

    print()
    print("=" * 76)
    print("DD / 대조군 배분")
    print("=" * 76)
    print(f"  {'':8} {'train':>6} {'valid':>6} {'test':>6} {'계':>5}   등급 분포")
    print(f"  {'DD':<8} {len(dd_train):>6} {len(dd_valid):>6} {len(dd_test):>6} {len(dd):>5}"
          f"   (등급 없음 — 전부 결측)")
    cc = Counter(r["iucn_category"] for r in ctrl)
    print(f"  {'대조군':<7} {len(ctrl_train):>6} {len(ctrl_valid):>6} {len(ctrl_test):>6} "
          f"{len(ctrl):>5}   " + " ".join(f"{k}:{cc[k]}" for k in CTRL_CATEGORIES if cc[k]))
    print()
    print("  목(order) 분포 — 두 집단이 같아야 통제가 성립")
    dord, cord = Counter(r["order_name"] for r in dd), Counter(r["order_name"] for r in ctrl)
    for o in sorted(dord):
        mark = "OK " if dord[o] == cord[o] else "FAIL"
        print(f"    [{mark}] {o:<18} DD {dord[o]:>2}  |  대조군 {cord[o]:>2}")
    print()
    print("  valid 에 들어간 종")
    print(f"    DD    : {[r['scientific_name'] for r in dd_valid]}")
    print(f"    대조군: {[(r['scientific_name'], r['iucn_category']) for r in ctrl_valid]}")
    print("  test 에 들어간 종")
    print(f"    DD    : {[r['scientific_name'] for r in dd_test]}")
    print(f"    대조군: {[(r['scientific_name'], r['iucn_category']) for r in ctrl_test]}")

    print()
    print("=" * 76)
    print("문항 슬롯별 결측")
    print("=" * 76)
    st, sm = Counter(), Counter()
    for split in splits:
        for l in splits[split]:
            r = json.loads(l)
            u, a = r["messages"][1]["content"], r["messages"][2]["content"]
            slot = "IUCN 등급은?(학명)" if SCI_Q.match(u) else None
            if slot is None:
                for suf in SUFFIXES:
                    if u.endswith(suf):
                        slot = suf
                        break
            st[slot] += 1
            sm[slot] += (a == NO_DATA)
    for suf in SUFFIXES + ["IUCN 등급은?(학명)"]:
        print(f"  {suf:<20} {sm[suf]:>3} / {st[suf]:>3}  = {sm[suf] / st[suf] * 100:5.1f}%")

    print()
    print("=" * 76)
    print("학명 잔존 검사  (답변 기준, 0건이어야 정상)")
    print("=" * 76)
    # 괄호 학명 + 괄호 밖 맨몸 학명(속 종) 둘 다 훑는다.
    FREE_SCI = re.compile(r"(?<![(\w])[A-Z][a-z]{2,} [a-z]{3,}")
    left = []
    for split in ("train", "valid", "test"):
        for l in splits[split]:
            rec = json.loads(l)
            u, a = rec["messages"][1]["content"], rec["messages"][2]["content"]
            hits = SCI_PAREN.findall(a) + FREE_SCI.findall(a)
            if hits:
                left.append((split, u, a, hits))
    for split, u, a, hits in left[:10]:
        print(f"  [{split}] {u} → {a}   {hits}")
    print(f"  답변 내 학명 잔존: {len(left)}건")
    q_sci = sum(1 for split in splits for l in splits[split]
                if SCI_Q.match(json.loads(l)["messages"][1]["content"]))
    print(f"  (참고) 질문 내 학명: {q_sci}건 — 학명 문항 도입분, 의도된 값")

    print()
    print("=" * 76)
    print("누수 검사")
    print("=" * 76)
    ok = True

    sets = {}
    for split in ("train", "valid", "test"):
        names = set()
        for l in splits[split]:
            u = json.loads(l)["messages"][1]["content"]
            for suf in SUFFIXES:
                if u.endswith(suf):
                    names.add(re.sub(r"(의|는|은|이)$", "", u[: -len(suf)].rstrip()))
                    break
        sets[split] = names

    def check(label, bad, sample=None):
        nonlocal ok
        ok &= not bad
        n = bad if isinstance(bad, int) else len(bad)
        extra = f" → {sorted(bad)[:5]}" if not isinstance(bad, int) and bad else ""
        print(f"  [{'OK ' if not bad else 'FAIL'}] {label}: {n}건{extra}")

    for a, b in (("train", "valid"), ("train", "test"), ("valid", "test")):
        check(f"종 겹침 {a}∩{b}", sets[a] & sets[b])

    sci = {}
    for s, arows, drows, crows in (("train", api_train, dd_train, ctrl_train),
                                   ("valid", api_valid, dd_valid, ctrl_valid),
                                   ("test", api_test, dd_test, ctrl_test)):
        sci[s] = {r["scientific_name"] for r in list(arows) + list(drows) + list(crows)}
    for a, b in (("train", "valid"), ("train", "test"), ("valid", "test")):
        check(f"학명 겹침 {a}∩{b}", sci[a] & sci[b])

    qs = {s: {json.loads(l)["messages"][1]["content"] for l in splits[s]} for s in splits}
    for a, b in (("train", "valid"), ("train", "test"), ("valid", "test")):
        check(f"질문 문자열 겹침 {a}∩{b}", qs[a] & qs[b])

    for split in ("train", "valid", "test"):
        check(f"{split} 내부 중복 레코드", len(splits[split]) - len(set(splits[split])))

    dd_sci = {r["scientific_name"] for r in dd}
    ctrl_sci = {r["scientific_name"] for r in ctrl}
    check("DD ∩ 대조군", dd_sci & ctrl_sci)
    check("학명 문항 종 ∩ API 178종 학명", (dd_sci | ctrl_sci) & api_sci)
    check("학명 문항 종 ∩ 수기 시드 22종 학명", (dd_sci | ctrl_sci) & seed_sci)

    for label, cond in (("답변 내 학명 잔존 0건", not left),
                        (f"총 {22 + N_API + N_SCI + N_CTRL}종", tot_sp == 22 + N_API + N_SCI + N_CTRL),
                        ("총 678건", tot_ln == 678),
                        ("결측 149건", all_m == 149),
                        (f"확장 종 {N_EXTENDED}종", len(extended_names) == N_EXTENDED),
                        ("학명 문항 54건", s_all_t == 54),
                        ("학명 문항 결측률 50%", s_all_m * 2 == s_all_t),
                        ("valid 에 DD ≥1종", len(dd_valid) >= 1),
                        ("valid 에 대조군 ≥1종", len(ctrl_valid) >= 1),
                        ("test 에 DD ≥1종", len(dd_test) >= 1),
                        ("test 에 대조군 ≥1종", len(ctrl_test) >= 1)):
        ok &= cond
        print(f"  [{'OK ' if cond else 'FAIL'}] {label}")

    print()
    print(f"  확장 종 목록  → {LIST_MD.relative_to(ROOT)}")
    print(f"  학명 문항 목록 → {SCI_MD.relative_to(ROOT)}")
    print("  >>> " + ("누수 없음 — 전 항목 통과" if ok else "*** 실패 항목 있음 ***"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
