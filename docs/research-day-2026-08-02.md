# 연구 세션 요약 — 2026-08-02 (통계 가설 검정: IUCN 등급 vs 체중)

브랜치: `research-statistical-analysis` (main·프로덕션 무손상)

## 가설
**H1: IUCN 등급이 높을수록(더 위협받을수록) 성체 체중이 클 것이다.**
(대형종=고위험이라는 보전생물학 통념)
- X = log₁₀(성체 체중 g), Y = IUCN RLI 가중치(LC=0·NT=1·VU=2·EN=3·CR=4)
- 모집단: iucn_population_trend 보유 종(≈3,725~3,961)
- 표본 S1: 실측 개체수(mature_individuals 또는 iucn_population_size) 보유 종

## 데이터 준비
- **원본 mass_g 무손상 원칙** 준수. 신규 체중은 `mass_g_external`(+`mass_g_external_source`) 컬럼에만 백필.
- `mass_effective = COALESCE(mass_g, mass_g_external)` 채택.
- 백업: `data/species.db.backup_before_mass_expansion`.
- 소스: PHYLACINE(포유류 mass), AVONET1_BirdLife(조류 mass, Tobias et al. 2022).
- GBIF backbone로 taxon 재검증(class_name 오분류 교정, 식물 76종 제외 확인).
- 표본 확대: 기존 107(전부 포유류) → **204**(포유류 148 + 조류 56). 파충·양서·어류·무척추 33종은 전용 소스 미확보로 제외.
- 위협종(VU+EN+CR): 11(10%) → **105(51%)** — 검정력 확보.

## 결과

### 전체 표본 (n=204, 포유류+조류)
| 지표 | 값 |
|---|---|
| Pearson r | −0.242 (p = 4.97×10⁻⁴, 유의) |
| 95% CI | [−0.367, −0.108] |
| Spearman ρ | −0.276 (p = 6.3×10⁻⁵) |
| R² | 0.058 (5.8%) |
| 판정 | 유의하나 **방향 반대(음의 상관)** → 가설 기각 |

### 포유류 표본 (n=148, 조류 제외)
| 지표 | 값 |
|---|---|
| Pearson r | **−0.051 (p = 0.536, 유의하지 않음)** |
| 95% CI | [−0.211, +0.111] ← **0 포함** |
| Spearman ρ | −0.115 (p = 0.165, NS) |
| R² | 0.003 (0.3%) |
| 판정 | **상관 없음** → 가설 기각 |

등급 분포(포유류): LC 54·NT 45·VU 7·EN 8·CR 34 (위협종 49).

## 핵심 결론
1. **가설 기각 확정.** 대형종=고위험 통념은 이 데이터에서 지지되지 않음.
2. **조류를 빼자 유의한 음의 상관이 소멸**(r=−0.24→−0.05, p<0.001→0.54).
   → 전체의 음의 상관은 소형·위협등급에 몰린 **조류가 만든 겉보기 상관**(혼재변수=분류군).
3. **자연 상태에서 체중은 IUCN 등급 예측 요인이 아님.** 회귀선 사실상 수평,
   CR·LC·NT 모두 log 1~8 전 체중 대역에 분산 → 등급은 체중과 무관하게 발생.
4. **표본 구성이 결론을 좌우함**(데이터 리터러시 실증): 동일 원자료·동일 가설에서
   조류 포함 여부 하나로 "유의(p<0.001)"↔"무관(p=0.54)"이 뒤집힘. 통계적 유의성이
   관계의 실재를 보장하지 않으며, 인용 전 표본 대표성·교란요인 검증이 필수.

## 산출물
- 데이터셋: `research/data/dataset_iucn_score_vs_mass_v2.csv` (204행)
- 분석 코드: `research/analyze_iucn_vs_mass_v2.py`, `research/analyze_mammals.py`
- 산점도: `research/results/scatter_iucn_vs_mass_v2.png` (전체), `scatter_iucn_vs_mass_mammals.png` (포유류)
- 분석 문서: `research/results/analysis_iucn_vs_mass_v2.md`, `analysis_iucn_vs_mass_mammals.md`,
  `comparison_full_vs_mammals.md`
- 조사 문서: `research/investigation/` (iucn_score_system, population_definition, sample_validity,
  missing_mass_species, taxon_verification)
- DB 변경: `mass_g_external`·`mass_g_external_source` 컬럼 추가 + 포유류 41·조류 56 백필
  (원본 mass_g 무손상). 백업: `data/species.db.backup_before_mass_expansion`.

## 무손상 확인
- main 브랜치·프로덕션(lastwatch-safe.vercel.app) 미변경. 모든 작업은
  `research-statistical-analysis` 브랜치에 격리.
- 원본 `mass_g` 컬럼 수정 없음. 점수 계산식 로직(`lib/tipping-point.ts`) 이 세션에서 변경 없음.
