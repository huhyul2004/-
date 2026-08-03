# 핵심 1: 개별 종 차이 분석 — LastWatch v5 vs IUCN (2026-08-03)

전체 상관은 순환(공유 입력) 때문에 강할 수밖에 없으므로 **기록만** 하고, 진짜 분석은
**개별 종의 불일치가 어디서·왜 생기는가**에 둔다.

## 전체 상관 (기록만)
표준화: IUCN = RLI/5 (0~1), LastWatch = score/100 (0~1). diff = LastWatch_norm − IUCN_norm.
| 표본 | n | Pearson r | Spearman ρ | R² |
|---|---|---|---|---|
| 절멸 포함 | 571 | +0.888 | +0.945 | 0.789 |
| 생존만 | 314 | +0.740 | +0.762 | 0.547 |

**순환 경고 (필수):** 생존·개체수보유 262종에서 단순 r=0.741이나, 공유 입력(logN0·추세)을
통제한 **편상관 = 0.159** → 공변동의 **~95%가 공유 입력 경유**. 강한 상관은 검증이 아님.

## 개별 차이 상위 30 (생존종) — `top_diff_species.csv`
- LW가 더 위험(diff>0) 10종 · IUCN이 더 위험(diff<0) 20종.

### 기준 유형이 불일치를 예측한다 (독립 재현)
IUCN 기준 문자열(iucn_criteria)을 조인해 검정:
| IUCN 기준 유형 | n | 평균 \|diff\| | 1등급이상 불일치 | LW 저평가 비율 |
|---|---|---|---|---|
| **C/D (개체수 기준)** | 132 | **0.55** | 15% | 11% |
| **A/B (비개체수 기준)** | 102 | **1.10** | 46% | 60% |

→ **비개체수 기준(A=과거감소·B=지리범위) 종의 불일치가 정확히 2배.**

### 두 불일치 모드 (계산 로직 추적)
LastWatch v5 입력 = `iucn_population_size`(또는 mature_individuals) + `iucn_population_trend` (나머지 분류군 기본값).
IUCN 등급/criteria는 점수에서 제거됨.

**모드 A — LW 저평가 (IUCN이 더 위험):** IUCN이 기준 A(과거 붕괴)·B(지리범위)로 등재.
LW는 현재 개체수·추세만 봐서 과거 이력·공간 위험을 못 봄.
| 종 | IUCN | LW | trend | pop_source | 로직 |
|---|---|---|---|---|---|
| Diceros bicornis 검은코뿔소 | CR(A2 85%붕괴) | 10/T0 | Increasing | iucn_pop_size | 현재 증가 → PVA=0, EWS 낮음 |
| Nipponia nippon 따오기 | EN(B1 EOO2300) | 0/T0 | Increasing | mature_ind | 600 증가 → PVA=0. 공간위험 무시 |
| Lepidochelys kempii 켐프바다거북 | CR | 15/T0 | Unknown | iucn_pop_size | 대개체수+추세불명 |
| Anas laysanensis 라이산오리 | CR | 20/T1 | Increasing | iucn_pop_size | 회복 중 |

**모드 B — LW 과평가 (LW가 더 위험):** IUCN LC(대개체수)이나 추세 감소.
LW가 "감소"를 고정 −6%/년으로 변환해 100년 외삽 → 개체수 규모 무시.
| 종 | IUCN | LW | trend | 로직 |
|---|---|---|---|---|
| Otocolobus manul 팔라스고양이 | LC | 40/T2 | Decreasing | EWS=88(시계열無), PVA=41 |
| Marmota olympus 올림픽마멋 | LC | 50/T2 | Decreasing | 3000×0.94^100≈6 파국 외삽 |
| Gazella bennettii | LC | 40/T2 | Decreasing | 동일 |

→ 대불일치의 ~40%가 모드 B로, **기준 유형으로 설명 안 됨.** 따라서 "기준 유형이 불일치를
대부분 설명"은 과장이며, **"LW-저평가 방향 불일치를 설명하는 최대 단일 요인(대불일치의 약 절반)"**이 정확.

## 정확 일치 대조 (|diff|<0.15)
Equus africanus(CR/81), Didunculus strigirostris(CR/82), Crocodylus mindorensis(CR/81) 등 —
전부 IUCN이 **개체수 기준(C/D)**으로 등재한 종. 일치는 **공유 입력의 산물**(독립 확증 아님).

## 결론 (핵심 1)
LastWatch와 IUCN의 불일치는 **IUCN이 어떤 기준을 썼는가**로 대부분 방향이 갈린다:
개체수 기준(C/D)→일치, 비개체수 기준(A/B)→LW 저평가, 감소추세 LC→LW 과평가.
LastWatch의 성격 = **현재 개체수+추세 렌즈**(과거이력·지리범위·파국에 구조적으로 취약,
추세 하드매핑으로 위양성 생성). 상세 5종: `case_studies.md`.
