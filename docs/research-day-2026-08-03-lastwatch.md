# 연구 세션 요약 — 2026-08-03 (LastWatch v5 vs IUCN + 세대시간 재검증)

브랜치: `research-lastwatch-vs-iucn`. main·프로덕션·이전 연구 브랜치 무손상. 원본 데이터·회귀테스트(21 passed) 무손상.

## 사용 버전: LastWatch v5 (population-only)
main==v5, 검증 3종 유지(바키타 100/자바코뿔소 78/시베리아호랑이 66.5). v5는 IUCN 등급을 점수에서
제거, 실질 입력은 개체수·추세뿐.

## 핵심 1: LastWatch vs IUCN 개별 종 차이
- 표본 A n=571 (절멸 257 + 생존 314).
- 전체 상관 생존 r=0.74 — 그러나 **공유 입력 통제 시 편상관 0.16**(95% 공유입력 경유) → 부분 순환.
- **기준 유형이 불일치 예측:** A/B(비개체수) 종 평균|diff|=1.10 vs C/D(개체수) 0.55 (2배).
- 두 모드: LW 저평가(회복 위협종·기준 A/B) / LW 과평가(감소추세 LC, 추세 하드매핑 위양성).
- 사례 5종(IUCN API+엔진 추적): 검은코뿔소·따오기·팔라스고양이·올림픽마멋·아프리카야생당나귀.

## 핵심 2: 세대시간 재검증 (IUCN vs LastWatch)
- 표본 B n=247 (동일 표본 공정비교).
- gen vs IUCN 등급 +0.283 / gen vs LastWatch **+0.145** (포유류 +0.099 무의미).
- **LastWatch는 세대시간 신호 거의 미포착**(v5가 종별 세대시간 미사용).
- 양날: ① 지난 세션 "IUCN-gen 상관=부분 방법론 순환" 단서를 간접 지지, ② 장기취약성 미반영 약점.

## 심슨의 역설 재발 여부
- **vs IUCN(핵심1):** 재발 안 함 — 분류군 내 상관 유지(포유류 +0.75). 단 이는 공유 입력 때문(강함 아님).
- **gen vs LastWatch(핵심2):** 포유류 내부 무상관(+0.099)·조류 음(−0.40) → 약한 전체 상관이 분류군 내 유지 안 됨.

## 4일 연구 총정리
| 일자 | 가설/분석 | 결과 |
|---|---|---|
| 08-02 | H1 체중 vs IUCN | 기각 + 심슨의 역설(분류군 내 무상관) |
| 08-03 오전 | 분류군별 위험 박스플롯 | 표본 편향 실증 |
| 08-03 오후 | 체중 분류군 내 | 심슨의 역설 확정 |
| 08-03 (gen) | H2 세대시간 vs IUCN | 부분 지지 + 순환 위험(기준 A/C/E 시간창) |
| **08-03 (vs) 본세션** | **LastWatch v5 vs IUCN + 세대시간 재검증** | **부분 순환(편상관 0.16)·기준유형이 불일치 예측·LastWatch는 세대시간 미포착** |

**공통 통찰:** 상관계수의 크기보다 **변수가 등급/점수 산정에 얼마나 내재하는가(순환성)**가 결론을
좌우한다. 통계 해석엔 방법론 이해가 필수.

## 자소서 활용 방향
- **자체 시스템조차 순환 위험을 정량화(편상관 0.74→0.16)**해 발표 — 유리한 결과도 자기비판.
- **기준유형×불일치, 사례 5종 심층**(IUCN Criterion A/B/C/D의 실제 의미까지 추적) = 도메인+통계 융합.
- **세대시간 재검증으로 지난 순환 단서를 교차검증** = 가설 반복·자기 일관성 검증력.
- **4일 지속 탐구**: 체중 기각 → 심슨의 역설 → 세대시간 부분지지 → LastWatch vs IUCN. 집착적 탐구.

## 산출물
- 문서: version_check.md · individual_diff_analysis.md · case_studies.md ·
  comparison_iucn_vs_lastwatch_gen.md · final_analysis.md
- 데이터: dataset_lastwatch_vs_iucn.csv · top_diff_species.csv · dataset_gen_vs_lastwatch.csv · dataset_vs_iucn.csv
- 코드: analyze_vs_iucn.py · plot_vs_iucn.py · analyze_gen_vs_lastwatch.py
- 그림: scatter_vs_iucn_{overall,by_taxon,agreement}.png · scatter_gen_vs_lastwatch_{overall,by_taxon}.png
