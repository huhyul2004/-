# v4 Phase 1 배포 완료 (2026-07-24)

## 오늘 완료
- IUCN 개체수 데이터 확보 및 파싱 버그 수정
- Population Criterion 세분화
- 산점도 시각화 페이지 (/scatter)
- 종별 계산 근거 페이지
- mass_g 3종 수동 입력 (검증종 산점도 표시용)
- main 브랜치 커밋 및 Vercel 배포

## 커밋 이력
- c0177ae: v4 Phase 1 (어제)
- 9f014e9: population + criterion + scatter (오늘)
- main에 두 커밋 모두 반영, 라이브 확인

## 검증 URL (전부 200)
- /scatter
- /species/rhinoceros-sondaicus (78/T3)
- /species/panthera-tigris-altaica (66.5/T3)
- /species/phy-balaena-mysticetus (LC/T0)

## 오늘 지표
- 4,230 curated 재계산: 상승 165 · 하락 99 · tier변경 65
  (T3→T4 53 · T2→T3 9 · T3→T2 3, 전부 위협종)
- 이상 종: 0건
- 회귀 테스트: 13/1skip 유지
- IUCN population 확보 종: 369 (파싱 버그 수정 후, 범위형 161종 복구 포함)

## 남은 후속 작업 (별도 세션)
- PHYLACINE 종 상세페이지 문구 불일치 정리 (급하지 않음)
  → tipping_points 신규 생성으로 "위험도 계산 미적용" 안내와 점수가 함께 표시됨
- not_found 269종 synonym 재조회 (전부 이명 문제, accepted name 재매칭)
- Phase 2 mass_g 알로메트릭 실제 코드 배선 (Fenchel/MTE, r_max ∝ M^−0.25 등)
- 특허 명세서에 v4 개선 반영 (변리사 회신 후)
- 시연 사이트 스크린샷 → 특허 실시예 자료화

## 안전 자산
- 백업: data/species.db.backup_before_v4_phase1_reindex
- 백업: data/species.db.backup_before_pop_size
- 백업: data/species.db.backup_before_mass_input
- 브랜치: v4-phase1-trend-transition (병합 후 유지)

## 배포처
- https://lastwatch-safe.vercel.app (repo: huhyul2004/-, main 자동배포)
