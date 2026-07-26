# v4 Phase 1 완료 (2026-07-23)

## 오늘 완료된 것
- [x] IUCN Red List API v4 연동 (3,961/4,230 종 동기화, 93.6%)
- [x] 코드 이중화 문제 해결 (engine/consensus.ts → _deprecated)
- [x] v4 Phase 1 알고리즘 구현 (trendToLambdaV4)
- [x] DEFAULT 버그 발견/수정 (r=-0.02, v3와 동일 → 무정보 종 부작용 0)
- [x] 회귀 테스트 3-블록 구조로 갱신 (13/14 통과, 1 skip)
- [x] Curated 4,230종 전체 재계산 (v4 로직, 21분, 에러 0)
- [x] 브랜치 커밋 완료 (v4-phase1-trend-transition)

## 핵심 개선 지표
- 시베리아호랑이: T2(50) → T3(66.5) — IUCN "Decreasing"과 일치
- 176종 T2→T3 tier 상승
- 459종 consensus 상승 (IUCN Decreasing 반영)
- 2종 consensus 하락 (IUCN "Stable"이 한글 "감소"를 override)
  - Ursus maritimus (북극곰), Rana coreana (한국산개구리)
- 569종 무변화 / 3,200종 신규 계산(phylacine, tipping_points 최초 생성)
- 이상 종 0건 (tier 3단계+ 점프·|Δ|≥50 전무)

## Non-curated 영향
- 37,052 bulk_import 종: 변화 0 (iucn_population_trend=null → default 경로 = v3)

## 남은 작업
- [ ] not_found 269종 synonym 재조회 (별도 배치)
- [ ] IUCN 동기화 python 스크립트 별도 커밋 (test_iucn/sync_iucn_all/migrate/drop-unique)
- [ ] 24시간 관찰 후 main 머지 판단

## 안전 자산
- 백업 DB: data/species.db.backup_before_v4_phase1_reindex
- 스냅샷: data/snapshots/pre_v4p1_reindex_2026-07-23.json
- 브랜치: v4-phase1-trend-transition (main 미머지)
- 회귀 테스트: 13/14 통과 상태 유지 중

## 롤백 방법 (필요시)
```
cp data/species.db.backup_before_v4_phase1_reindex data/species.db
git checkout main
```
