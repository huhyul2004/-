# Step 2-A: 표본 유효성 조사 (2026-08-02)

**목적:** 개체수 필드 보유 종(S1)을 v5 계산식에 넣어, 유효 점수 못 낸 종의 원인 파악.
수정 가능한 오류 vs 정당한 계산 불가 구분. (read-only 조사)

## S1 정의 & 전체 분류

S1 = curated 중 개체수 필드(mature_individuals 또는 iucn_population_size) **non-null** 보유.

| 구분 | 종수 |
|---|---|
| **S1 (개체수 필드 보유)** | **380** (iucn_pop non-null 374 + mature-only 6) |
| ├ **계산 성공 (비절멸, 실측 개체수>0)** | **310** |
| ├ **EX/EW → 100 고정** (reason a) | **67** |
| └ **계산 실패 (null, 비절멸)** | **3** |

> 허율 예상 "375 표본 / 65 실패"와 대조: 표본 ≈ 374~380(일치), "실패 65" 중
> **62~64는 EX/EW 절멸(오류 아님)**, **진짜 비절멸 실패는 3종뿐.**

## 실패/제외 사유별 분류

### reason (a) — EX/EW 절멸: 67종 (오류 아님)
- iucn_population_size=0(raw "0", 절멸이라 실제 0마리)인 EX/EW 63 + 개체수>0인 EX/EW 4.
- v5는 EX/EW를 개체수 계산 없이 **100 고정**(절멸 사실). **오류 아님.**
- 예: Raphus cucullatus(도도, EX, raw "0"), Ectopistes migratorius(나그네비둘기, EX).

### reason (f) — CR인데 개체수 0 (raw "0-0"): 3종 ★ 유일한 실질 실패
| 종 | 등급 | iucn_pop | raw | class | mass |
|---|---|---|---|---|---|
| Partula arguta | CR | 0 | "0-0" | 복족류 | null |
| Litoria castanea | CR | 0 | "0-0" | 양서류 | null |
| Aloe bellatula | CR | 0 | "0-0" | null | null |
- raw "0-0" = **0마리(확인 개체 없음)**. v5 inferPopulation은 pop>0 만 유효로 봐서
  → data_insufficient → null(점수 없음).
- 성격: **CR인데 확인 개체수 0 = 사실상 possibly-extinct-in-wild(야생 절멸 임박)**.
  0마리를 "데이터 부족"으로 떨구면 **위험을 과소 표기**(가장 위험한 종을 놓침).

### reason (b) mass 없음 / (c) class 없음 / (e) 버그 — 해당 없음 (0종)
- **mass_g는 v5 계산에 미사용** → mass 결측이 실패 원인 아님 (실패 3종도 mass=null이나
  그것 때문이 아니라 pop=0 때문).
- **class 없어도** lifeFor가 DEFAULT_LIFE로 폴백 → 실패 아님 (Aloe bellatula class=null이나
  pop=0이 실패 원인).
- 예외/크래시 **0건** (310종 전부 정상 계산).

## 처리 방침 제안 (Step 2-B, 승인 후 실행)

1. **reason (a) EX/EW 67종 — 통계 표본 제외 권장.**
   상관분석의 Y(RLI 가중치)에서 EX/EW는 Y=5·점수=100으로 **고정**이라, 포함하면
   상관이 인위적으로 부풀려짐(예측이 아니라 사실). **모델 예측력 검증 표본에서는 제외**,
   별도로 "절멸 종은 100으로 사실 반영"이라고만 기술. → 상관 표본 = 310.

2. **reason (f) CR-0 3종 — 결정 필요 (수정 후보).**
   - 옵션 ①: **near-extinct로 채점** — pop=0 → N을 1~2(N_qext)로 두고 계산하면
     사실상 최고 위험 점수. "0마리 CR = 야생절멸 임박"을 정직하게 반영. 표본 +3 → 313.
   - 옵션 ②: 현행 유지(데이터 부족) — "0-0"을 "추정 불가"로 해석. 표본 310.
   - 권장: **옵션 ①** (0마리는 데이터 부족이 아니라 최악 상태). 단 3종뿐이라 영향 미미.

3. reason (b)(c)(e) — 수정 불필요 (실패 원인 아님).

## 예상 최종 표본
- **상관/검증 표본 = 310종** (비절멸 계산종, EX/EW 제외).
- CR-0 3종을 near-extinct로 채점 시 **313종**.
- 모집단 M1 = iucn_population_trend 보유 3,725(≈3,961은 재확인 필요 — 아래 주).

> **주의 — 모집단 수치 재확인 필요:** 허율 지시의 M1=3,961과 본 조사의 3,725가 다름.
> 3,961은 v5 이전(iucn_synced_at 기준) 값일 가능성. iucn_population_trend IS NOT NULL
> 기준 실측은 **3,725**. Step 2 통계 전 모집단 정의(어느 필드 기준)를 확정할 것.
