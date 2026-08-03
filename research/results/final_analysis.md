# 종합: LastWatch v5 vs IUCN + 세대시간 재검증 (2026-08-03)

## 배경
3~4일 연구에서 체중·세대시간이 IUCN 등급을 (부분적으로만) 설명함을 봤다. 이번엔 **LastWatch 자체
계산식(v5)**을 정면에 놓고 두 가지를 검증한다: (핵심 1) 종별로 IUCN 등급과 얼마나 다른가,
(핵심 2) LastWatch도 세대시간 신호를 포착하는가. 목표는 **"우리가 더 낫다"가 아니라 "어떻게 다른
정보를 주는가"**를 정직하게 규명하는 것.

## 사용 버전: LastWatch v5 (population-only)
- main HEAD `20751de` = v5 (v5-population-only 머지됨, `lib/tipping-point.ts` 바이트 동일).
- 검증 3종 점수 유지: 바키타 100/T4·자바코뿔소 78/T3·시베리아호랑이 66.5/T3, 테스트 **21 passed**.
- v5는 IUCN **등급을 점수에서 제거**(category_score=0), 실질 입력은 개체수·추세뿐. 상세 `version_check.md`.

## 표본
- **표본 A (LastWatch vs IUCN)**: tipping_points ∩ curated·유효등급 = **571종**
  (절멸 257 + 생존 314). 등급 LC55·NT45·VU32·EN64·CR118·EW78·EX179.
- **표본 B (세대시간 재검증)**: 세대시간 + LastWatch 점수 = **247종** (절멸 34 + 생존 213).

---

## 핵심 1: 개별 종 차이 (`individual_diff_analysis.md`, `case_studies.md`)
전체 상관(생존 r=0.74)은 **순환** 때문에 강할 수밖에 없음 — 공유 입력 통제 시 **편상관 0.16**
(공변동 95%가 공유 입력 경유). 그래서 개별 불일치에 집중.

- **기준 유형이 불일치를 예측:** 비개체수 기준(A/B) 종 평균|diff|=1.10 vs 개체수 기준(C/D)=0.55 (**2배**).
- **두 모드:** ① LW 저평가 — 회복 중 위협종(검은코뿔소 CR→T0, 따오기 EN→T0). IUCN 기준 A(과거붕괴)·
  B(지리범위)를 LW가 못 봄. ② LW 과평가 — 감소추세 LC종(팔라스고양이·마멋). LW가 "감소"를
  −6%/년으로 하드매핑해 위양성.
- **사례 5종**(IUCN API 실측+엔진 추적): 검은코뿔소·따오기·팔라스고양이·올림픽마멋·아프리카야생당나귀(일치 대조).
- **분류군별 상관 전부 유지**(포유류 +0.75 등) → 심슨의 역설 없음. **단 이는 공유 입력이 분류군
  무관하게 작동하기 때문**(강함이 아니라 순환의 증거).

## 핵심 2: 세대시간 재검증 (`comparison_iucn_vs_lastwatch_gen.md`)
동일 표본 B(생존 213)에서:
| | gen vs IUCN 등급 | gen vs LastWatch 점수 |
|---|---|---|
| 전체 r | +0.283 | **+0.145** |
| 포유류 r | +0.241 | **+0.099 (무의미)** |
| R² | 0.080 | 0.021 |

→ **LastWatch는 세대시간 신호를 거의 포착 안 함**(v5가 종별 세대시간 미사용, 분류군 기본값).
양날의 해석(둘 다 정직): ① 지난 세션의 "IUCN-gen 상관은 부분 방법론적 순환" 단서를 **간접 지지**
(방법론에 세대시간 안 쓰면 상관 사라짐). ② 동시에 "긴 세대=느린 회복" 취약성을 못 보는 **LastWatch 약점**.

---

## 결론
1. **LastWatch가 IUCN보다 낫다고 주장하지 않는다.** 자연의 "정답"이 없어 횡단면 우열 검증 불가
   (실제 절멸 소급 백테스트만 부분 대안 → "완전 불가"는 아님).
2. **두 시스템은 다른 질문에 답한다:** IUCN=다기준 회고 판정(A 과거감소·B 지리범위·C/D 개체수·E 확률).
   LastWatch v5=현재 개체수+추세+유전 Ne의 인구통계 궤적.
3. **LastWatch의 다른(추가) 정보:** 연속 점수(0~100)+티어+deadline_days(IUCN 서열엔 없음),
   현재 궤적 민감성(회복 위협종을 낮게·감소 LC종을 조기신호로 높게 — 단 선별효과). 하지만
   과거이력(A)·지리범위(B)·단일파국·세대시간 취약성엔 구조적으로 취약하고, 추세 하드매핑으로 위양성 생성.
4. **여전한 순환 위험:** 상관의 95%가 공유 입력 경유. LastWatch가 IUCN을 "확증"한다는 근거로 쓸 수 없음.
   판별력 시험은 A/B 기준 등재종에서만 유효.

## 한계
1. **데이터 공유 순환** — 편상관 0.74→0.16 (핵심 한계).
2. **표본 편향** — 절멸 46% 자동 일치·편의추출·아개체군 수치 혼입 가능(코드 L770-771).
3. **횡단면 검증 불가** — 자연 정답 없음.
4. **엔진 인공물** — 추세 −6%/년 하드매핑, 시계열 없는 EWS, 유전층 경계 아티팩트, 세대시간 미반영.

## 산출물
- 문서: `version_check.md` · `individual_diff_analysis.md` · `case_studies.md` ·
  `comparison_iucn_vs_lastwatch_gen.md` · (본) `final_analysis.md`
- 데이터: `dataset_lastwatch_vs_iucn.csv`(571) · `top_diff_species.csv`(30) · `dataset_gen_vs_lastwatch.csv`(247)
- 코드: `analyze_vs_iucn.py` · `plot_vs_iucn.py` · `analyze_gen_vs_lastwatch.py`
- 그림: `scatter_vs_iucn_overall/by_taxon/agreement.png` · `scatter_gen_vs_lastwatch_overall/by_taxon.png`
