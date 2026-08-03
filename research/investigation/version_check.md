# Step 1~2: 계산식 버전 확인 & 자동 결정 (2026-08-03)

## 사용 버전: **v5 (population-only)** — 조건 A 충족

## Step 1 조사 결과

### 1. 브랜치 상태
- `v5-population-only` 존재 (HEAD `74f80d4`).
- **v5는 이미 main에 머지됨**: main HEAD `20751de` = "Reapply feat(v5): population-only scoring".
- `git diff main v5-population-only -- lib/tipping-point.ts` = **빈 결과** → 계산식 동일.

### 2. main HEAD 계산식의 IUCN 등급 의존
`lib/tipping-point.ts` (v5):
- `evaluateIucn`: `const category_score = 0; const iucn_score = genetic_score;`
  → **IUCN 등급(CR/EN/…) 점수 직접 사용 안 함** (Ne 기반 유전점수만).
- `evaluateTippingPoint`: `const N0 = inferPopulation(species); if (N0 === null) return null;`
  → 실측 개체수 없으면 점수 산출 안 함.
- `inferPopulationWithSource` (v5): `mature_individuals>0` → 사용 / else `iucn_population_size>0` → 사용 / else `null`.
- `inferPopFromCriterion`·`CATEGORY_FALLBACK`: **v5에서 죽은 코드**(호출 안 됨). 주석: "v5(2026-08-01): IUCN 등급/Criterion 기반 개체수 추정 전면 제거."
- Bottleneck floor: 순수 개체수 임계만(N<50→90, N<100→78, N<250→70, N<500→60). 카테고리 floor 제거.

### 3. 검증 3종 점수 유지 여부 (테스트 기대값 vs 테이블)
`__tests__/regression.test.ts`가 `tipping_points` 테이블을 읽어 검증:
| 종 | 기대 | 테이블 현재 | 일치 |
|---|---|---|---|
| 바키타 (Phocoena sinus) | 100.0 / T4 (±0.5) | 100.0 / T4 | ✓ |
| 자바코뿔소 (Rhinoceros sondaicus) | 78.0 / T3 (±5) | 78.0 / T3 | ✓ |
| 시베리아호랑이 (P. tigris altaica) | 66.5 / T3 (±3) | 66.5 / T3 | ✓ |
- `npx vitest run` → **21 passed, 1 skipped**. 검증 3종 점수 유지 확인.

### 4. 사전계산 점수 소재
- `tipping_points` 테이블 941행 (computed_at **2026-08-01**, v5 이후).
- 테스트가 이 테이블을 검증 → **테이블 = v5 엔진 결과**. 재계산 불필요.
- payload_json: layer_scores(ews/pva/iucn), primary_driver, confidence, rationale 포함.

## Step 2 자동 결정 (사전 규칙 적용)
- **조건 A**: v5 커밋됨(✓) + 검증 3종 점수 유지(✓) → **v5 사용**.
- 조건 B(main fallback)·C(중단) 미해당.

## ⚠️ 순환 위험 명시 (사전 확정 원칙)
LastWatch v5는 **IUCN 등급을 직접 쓰지 않으나**, 점수 입력으로
`iucn_population_size`·`iucn_population_trend`(둘 다 IUCN 발)를 사용한다.
IUCN 역시 개체수(기준 C/D)·추세(기준 A)로 등급을 매긴다.
→ **입력 데이터 공유로 인한 부분 순환**. LastWatch vs IUCN 상관은
"독립적 재발견"이 아니라 **공유 입력 때문에 양의 상관이 기대됨**. 결과 해석 시 반드시 반영.

## 브랜치 기반 (Step 3)
- `research-vs-iucn` 생성. 기반 = `research-generation-time` HEAD.
- 근거: 해당 브랜치의 `lib/tipping-point.ts`·`lib/db.ts`는 **main/v5와 바이트 동일**(계산식 v5)이며,
  연구용 DB 컬럼(iucn_class·generation·mass_g_external)을 상속해 분류군별 분석에 필요.
- main·프로덕션·이전 연구 브랜치 무손상.

## 표본 (Step 4 예고)
- tipping_points ∩ (curated·유효등급) = **571종**.
- 절멸(EX/EW) 257 + 생존 314. 생존종 개체수 출처: iucn_population_size 296 · mature_individuals 13.
- n≥100 → 정상 진행. 단 절멸 257종은 양 시스템 자명 일치(점수 100=RLI 5) → 상관 팽창 → **절멸 포함/제외 양쪽 보고**.
