# 특허 명세서 파일 소재 조사

조사일 2026-08-27. **어떤 파일이 어디에 몇 개 있고 각각 무엇을 담고 있는가**만 기록한다.
해석·권고는 쓰지 않는다. 이 조사 중 코드·DB 를 수정하지 않았다.

검색 범위: 저장소 전체(`node_modules`·`.git` 제외), git 전체 이력,
그리고 `~/Downloads` · `~/Documents` · `~/Desktop` · `~/dev` (깊이 4).

---

## 1. 파일 목록

### 1-1. 저장소 내 — `docs/patent/`

| 파일 | 줄 수 | 마지막 수정 | 담고 있는 것 |
|---|---:|---|---|
| `claims_draft.md` | 107 | 2026-05-05 22:20 | 청구항 초안. 발명의 배경, 청구항 1(독립항, (a)~(g) 단계), 종속항, 진보성 논거, 참고문헌 8건 |
| `figures/fig1_architecture.svg` | 97 | 2026-05-05 22:19 | 3레이어 구조도 |
| `figures/fig2_timeline_example.svg` | 59 | 2026-05-05 22:19 | 임계점 연표 예시 도면 |
| `figures/fig3_consensus_flowchart.svg` | 77 | 2026-05-05 22:19 | 합의 산출 흐름도 (`raw = 0.20·EWS + 0.50·PVA + 0.30·IUCN` 표기) |
| `figures/fig4_recommendation_matrix.svg` | 5 | 2026-05-05 22:19 | 권고 행동 매트릭스 |
| `ne-nc-provenance-2026-08-27.md` | 137 | 2026-08-28 | Ne/Nc 출처 조사 기록 (2026-08-27 작성) |

### 1-2. 저장소 내 — `docs/patent/` 밖

| 파일 | 줄 수 | 마지막 수정 | 담고 있는 것 | git |
|---|---:|---|---|---|
| `data/export/engine_formula_spec.md` | 163 | 2026-07-11 22:59 | 엔진 계산식 정확본. `LIFE_HISTORY` 전체 표, N0 추정, 3레이어 계산식, `Ne = round(N0 * ne_nc)` | **미추적** (`.gitignore:44` `data/export/`) |
| `scripts/generate-patent-figures.ts` | 299 | 2026-05-05 22:19 | 위 4개 SVG 도면 생성기 | 추적 |
| `scripts/build-verification-package.ts` | 303 | 2026-05-06 17:35 | 검증 패키지 생성기. `Ne = Nc · (Ne/Nc ratio, default 0.15)` 표기 | 추적 |
| `scripts/build-full-verification.ts` | 336 | 2026-05-06 22:39 | 전체 검증본 생성기. `Ne = Nc × (Ne/Nc ratio, default 0.15)` 표기 | 추적 |
| `engine/consensus.ts` | 22 | 2026-07-28 22:14 | 별도 특허 모듈. `engine_formula_spec.md` 4행에 "안 쓰이는 별도 특허 모듈" 로 기재됨 | 추적 |
| `docs/patent-materials/screenshots/*.png` | 6개 | 2026-07-28 ~ 07-31 | 시연 화면 캡처 6장 (scatter 2, rhino, tiger, bowhead, home) | 추적 |

### 1-3. 저장소 밖 — `~/Downloads`

`docs/phase2-allometry-constants.md:6-7` 이 이 두 파일을 참조하고 있으나
(`발명신고서_LastWatch §5-3 / lastwatch_score_full_spec_v4.md`) 당시 접근하지 못했다고 기록되어 있다.

| 파일 | 크기 / 분량 | 마지막 수정 | 담고 있는 것 |
|---|---:|---|---|
| `발명신고서_LastWatch_허율_허찬.docx` | 413 단락 | 2026-07-11 22:30 | 발명신고서 v3. 청구항 구조, 가중치 0.25/0.45/0.30, **실시예 = 바키타돌고래** |
| `발명신고서_LastWatch_허율_허찬 (1).docx` | 418 단락 | 2026-07-12 00:06 | 발명신고서 v4. 위 + 알로메트릭 청구항 13~15, **실시예 = 자바코뿔소** |
| `lastwatch_score_full_spec.md` | 1,456줄 | 2026-07-11 22:30 | 점수 산출 전체 스펙 v3. §4.1 유효개체군, §4.4 50/500, §11.2 자바코뿔소 검증 예시 |
| `lastwatch_score_full_spec_v4.md` | 1,342줄 | 2026-07-12 00:06 | 점수 산출 전체 스펙 v4. §2.4 Ne/Nc, §12.1 자바코뿔소 v3/v4 비교, 부록 A 학술 근거표 |
| `PKA-1551_명세서초안_수정요청서.pdf` | 635,447 B | 2026-07-23 21:36 | **본문 확인 불가** — 이 환경에 PDF 텍스트 추출 도구(`pdftotext`/`pypdf`/Quartz)가 없다 |

`PKA-1551_…pdf` 는 `brew install poppler` 후 `pdftotext -layout` 으로 열람 가능하다.

---

## 2. 검색 결과

검색어: `76` · `Ne/N` · `Ne/Nc` · `ne_nc` · `유효개체군` · `0.2` · `0.15` · `실시례` · `실시예` · `예시`

### 2-1. `docs/patent/claims_draft.md` — 해당 3줄

13행 (발명의 배경) 앞뒤 5줄:

```
## 발명의 배경

종래의 IUCN Red List 평가는 (i) 인적 자원이 많이 들고, … 유효개체군 임계값(50/500 Rule;
Frankham et al. 2014 Biol Conservation 170:56)을 **합의 검증 알고리즘**으로 결합하여, …

---

## 청구항
```

23행 (청구항 1 (a)) 앞뒤 5줄:

```
### 청구항 1 — 임계점 연표 자동 생성 방법 (Independent Claim)

컴퓨팅 장치에 의해 수행되는 멸종위기종 임계점 연표 자동 생성 방법으로서,

- (a) 대상 종의 시계열 개체수 데이터 또는 IUCN Red List 등급 및 생활사 파라미터
      (생식세대, λ, 환경수용력 K, Ne/Nc 비율)를 입력받는 단계;
- (b) 다음 3개의 독립 레이어로부터 각각 0 이상 100 이하의 위기점수를 산출하는 단계;
  - (b-1) 통계적 조기경보신호(EWS) 점수 산출 …
```

27행: `- (b-3) IUCN Criterion D + Frankham 50/500 유효개체군 임계 점수 산출;`

31행의 `0.15` 는 Tier 임계 `N(t)/N0` 비율 `(0.7, 0.4, 0.15)` 이며 Ne/Nc 가 아니다.

이 파일에 **`76` 없음, `실시례`·`실시예`·`예시` 섹션 없음, Ne/Nc 수치 없음.**

### 2-2. `lastwatch_score_full_spec.md` (v3)

`§4.1 실효 개체수 및 유효 개체군 추정` (415~440행):

```
유효 개체군:
if current_Ne is provided:      N_e = current_Ne
elif Ne_Nc_ratio is provided:   N_e = N_c × Ne_Nc_ratio
else:                           N_e = N_c × default_ratio(taxonomic_class)

default_ratio = {
    'mammal':       0.20,
    'bird':         0.25,
    'reptile':      0.15,
    'amphibian':    0.10,
    'fish':         0.10,
    'invertebrate': 0.05,
    'plant':        0.10,
}
```

`§4.4 Frankham 50/500 Rule` (482~496행): `N_e < 50 → CR`, `< 100 → EN`, `< 500 → VU`, `< 1000 → NT`, `else LC`.

`§11.2 자바코뿔소` (1246~1262행):

```
Input:
    Nc = 76,  K = 200,  allee = 30,  Ne/Nc = 0.3
    λ_mean = 1.02 (약한 회복 추세)
    IUCN = CR
Expected Output:
    L1 ≈ 50, L2 ≈ 37, L3 ≈ 95
    Consensus ≈ 78,  Tier = T3
```

### 2-3. `lastwatch_score_full_spec_v4.md` (v4)

`§2.4 Ne/Nc 비율 — v3 유지 (분류군 상수)` (380~398행):

```
**정직성 원칙**: Ne/Nc는 체중과의 확립된 단일 관계식이 없다. 번식 성공 편차, 성비,
세대 중첩 등 여러 요인이 얽혀 있어 분류군·종별 편차가 매우 크다.

**v4 결정**: 분류군 상수 그대로 유지 (v3와 동일).

NE_NC_RATIOS = {
    'mammal': 0.20,  'bird': 0.25,  'reptile': 0.15,  'amphibian': 0.10,
    'fish': 0.10,    'invertebrate': 0.05,  'plant': 0.10,
}

**향후 개선 방향**: 데이터가 충분히 쌓인 후 종별 Ne/Nc 관측치를 회귀 분석하여
별도 예측 모형 개발 검토.
```

`§12.1 자바코뿔소` (948~975행): 입력 `Nc = 76, W = 2,000,000 g, taxon = mammal, IUCN = CR`,
파라미터 비교표에 `Ne_Nc_ratio | v3 0.3 (사용자 지정) | v4 0.3 (사용자 지정, 동일)`.

1230행: `**이 문서화는 특허 명세서의 "발명의 상세한 설명" 부분에 실시예로 포함될 것.**`

부록 A 학술 근거표 (1236~1247행) 중 해당 행:

```
| II.4 Ne/Nc 배제 | 확립된 단일식 없음 | Frankham (1995), Palstra & Ruzzante (2008) — 상충 결과 |
| V. 50/500 | Frankham Rule | Frankham et al. (2014) *Biol Conserv* 170:56 |
```

### 2-4. `발명신고서_LastWatch_허율_허찬 (1).docx` (v4)

`(iv) 유효-실효개체군 비율의 처리` (123단락):

```
유효-실효개체군 비율(Ne/Nc)은 체중과의 확립된 단일 관계식이 존재하지 않으므로,
본 발명은 분류군 사전분포에 의한 상수로 처리한다. 이는 정직성 원칙에 따른 것으로,
향후 데이터 축적 후 별도 예측 모형으로 개선 가능함을 명시한다.
```

`8. 실시예 — 자바코뿔소 (Rhinoceros sondaicus)` (245~263단락):

```
입력: 인도네시아 자바섬 우중쿨론 국립공원, 추정 개체수 76마리, 위험 등급 CR,
      성체 평균 체중 2,000 kg, 서식 면적 480 km².

▶ Step 0: 체중 기반 파라미터 산출
// (i) Fenchel r_max (분류군: 항온동물, a = 0.0025)
r_max = 0.0025 × (2,000,000 g)^(-0.25) = 0.00007
// (ii) MTE T_gen (b = 0.14)
T_gen = 0.14 × (2,000,000)^0.25 = 5.3년
// (iii) Damuth K (d = 91.2, 포유류)
density = 91.2 × (2,000)^(-0.75) = 0.308 개체/km²
K = 0.308 × 480 = 148 개체
// (iv) Ne/Nc (분류군 상수)
Ne_Nc = 0.20 (포유류 사전분포)
```

### 2-5. `발명신고서_LastWatch_허율_허찬.docx` (v3)

`8. 실시예 — 바키타돌고래 (Phocoena sinus)` (258단락~). 입력 개체수 약 10마리, CR.
Ne/Nc 수치는 이 실시예에 나오지 않는다. 145·196단락에 가중치 `0.25, 0.45, 0.30` 기재.

### 2-6. `data/export/engine_formula_spec.md`

27~36행에 `LIFE_HISTORY` 전체 표(코드와 동일), 103행에 `Ne = round(N0 * ne_nc)`.
14행: `모든 포유류가 generation_time=8, r_max=0.05, ne_nc=0.15로 동일`.

---

## 3. Ne/Nc 값이 문서별로 다른 현황

| 출처 | 포유류 | 조류 | 파충류 | 양서류 | 어류 | 무척추 | 식물 |
|---|---:|---:|---:|---:|---:|---:|---:|
| `lastwatch_score_full_spec.md` §4.1 | 0.20 | 0.25 | 0.15 | 0.10 | 0.10 | 0.05 | 0.10 |
| `lastwatch_score_full_spec_v4.md` §2.4 | 0.20 | 0.25 | 0.15 | 0.10 | 0.10 | 0.05 | 0.10 |
| 발명신고서 (1).docx 실시예 | 0.20 | — | — | — | — | — | — |
| `lib/tipping-point.ts` `LIFE_HISTORY` | **0.15** | **0.20** | 0.15 | 0.10 | **0.05** | 0.05~0.10 | **0.20** |
| 검증 스크립트 2건 (`default`) | 0.15 | 0.15 | 0.15 | 0.15 | 0.15 | 0.15 | 0.15 |
| `docs/patent/claims_draft.md` | 기재 없음 | | | | | | |

자바코뿔소 `Nc = 76` 에 대한 Ne 값:

| 출처 | Ne/Nc | Ne |
|---|---:|---:|
| `lastwatch_score_full_spec.md` §11.2 (사용자 지정) | 0.3 | 22.8 |
| `lastwatch_score_full_spec_v4.md` §12.1 (사용자 지정) | 0.3 | 22.8 |
| 발명신고서 (1).docx §8 실시예 (포유류 사전분포) | 0.20 | 15.2 |
| `lib/tipping-point.ts` (포유류) — DB 저장값 | 0.15 | **11** |

---

## 4. git 이력 (`docs/patent/`)

| 커밋 | 내용 |
|---|---|
| `e085e19` 특허 출원 자료 + engine 모듈 분리 + 회귀 테스트 | `docs/patent/` 최초 생성 — `claims_draft.md` 107줄 + SVG 4개 |
| `1f414e4` Ne/Nc 비율 출처 조사 기록 | `ne-nc-provenance-2026-08-27.md` 추가 |

- `docs/patent/` 하위에서 **삭제·개명된 파일 없음** (`git log --diff-filter=DR` 결과 없음).
- `claims_draft.md` 는 `e085e19` 최초 커밋 이후 **내용 변경 없음** (`git diff e085e19 HEAD` 비어 있음).
- git 전체 이력에서 삭제된 파일 중 `patent`·`특허`·`명세`·`claim`·`발명`·`spec` 을 파일명에 포함한 것 **없음**.
- 위 1-3 의 저장소 밖 5개 파일은 **git 이력에 존재한 적이 없다.**

---

## 5. `ne-nc-provenance-2026-08-27.md` 정정 사항

같은 날 작성한 `docs/patent/ne-nc-provenance-2026-08-27.md` 는 조사 범위를 저장소 안으로 한정해
아래 두 항목을 사실과 다르게 적었다. 이 문서가 정정본이다.

| 해당 문서의 기술 | 정정 |
|---|---|
| "명세서에 예시 계산(실시례) 자체가 없다" | `docs/patent/claims_draft.md` 에 한해 참. 발명신고서 (1).docx §8 과 두 full_spec 에 자바코뿔소 실시예가 있다 |
| "`76 × 0.2` 형태의 예시는 저장소에서 발견되지 않았다" | 발명신고서 (1).docx §8: 입력 `76마리`, `Ne_Nc = 0.20 (포유류 사전분포)` |
| "Frankham 1995 는 인용되어 있지 않다" | `claims_draft.md` 에 한해 참. `lastwatch_score_full_spec_v4.md` 부록 A 에 `II.4 Ne/Nc 배제 \| 확립된 단일식 없음 \| Frankham (1995), Palstra & Ruzzante (2008) — 상충 결과` 로 인용됨 |

`ne-nc-provenance` 문서의 나머지 기술(저장소 내 ne_nc 기재 위치, 분류군별 값 표,
자바코뿔소 DB 저장 Ne = 11)은 변경 없이 유효하다.
