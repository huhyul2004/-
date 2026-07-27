# mass_g 수동 입력 기록 (검증 3종)

## 배경
검증 실시예 대표 3종은 `data_source = lastwatch_original`이라 PHYLACINE 체중 데이터
(mass_g)가 없었다. 산점도 시각화(`/scatter`)에서 체중 축에 표시되지 않아, 공인된
성체 평균 체중을 **수동 입력**했다.

## 입력값 (2026-07-27)

| 종 | 학명 | mass_g | = | 출처 |
|---|---|---|---|---|
| 바키타돌고래 | Phocoena sinus | 50,000 | 50 kg | 공인 성체 평균 |
| 자바코뿔소 | Rhinoceros sondaicus | 2,000,000 | 2 t | 공인 성체 평균 |
| 시베리아호랑이 | Panthera tigris altaica | 250,000 | 250 kg | 공인 성체 평균 |

적용 SQL:
```sql
UPDATE species SET mass_g = 50000   WHERE scientific_name = 'Phocoena sinus';
UPDATE species SET mass_g = 2000000 WHERE scientific_name = 'Rhinoceros sondaicus';
UPDATE species SET mass_g = 250000  WHERE scientific_name = 'Panthera tigris altaica';
```

## 계산 영향 — **없음**
- 현재(Phase 2 알로메트릭 미도입) `lib/tipping-point.ts`의 위기점수 계산은 `mass_g`를
  **전혀 사용하지 않는다**(`evaluateTippingPoint` 경로에 mass 참조 0건).
- 따라서 이 입력은 **점수를 바꾸지 않는다.** 3종 정본값 유지 확인:
  - 바키타 100 / T4, 자바코뿔소 78 / T3, 시베리아호랑이 66.5 / T3
  - 회귀 테스트 통과 (13/1 skip) — 재계산 불필요, 산점도 JSON만 재생성.

## 목적 및 향후
- **목적:** 산점도(`/scatter`) 체중 축 표시 — 특허·논문 실시예 대표종을 시각화에 노출.
- **향후:** Phase 2 알로메트릭(Fenchel/MTE, r_max ∝ M^−0.25 등) 도입 시 이 mass_g가
  실제 계산 입력으로 활용될 예정. 그 시점엔 값의 출처·정확도를 재검토한다.

## 백업
- `data/species.db.backup_before_mass_input` (입력 직전 상태 보존)
