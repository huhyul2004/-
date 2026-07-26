/**
 * @deprecated 이 모듈은 프로덕션에서 사용되지 않았습니다.
 * 실제 consensus 계산은 lib/tipping-point.ts의
 * evaluateTippingPoint() 내부 인라인 로직으로 수행됩니다.
 *
 * 이력 (2026-05-05 ~ 2026-07-23):
 * - 2026-05-05: 특허용 모듈 분리 시도로 신설
 * - 2026-05-06: 원본 lib/tipping-point.ts만 v3 스펙 적용
 * - 결과: 이 파일은 원본과 다른 가중치(0.20/0.50/0.30)로
 *   박제됨. 프로덕션 점수 생성에는 사용되지 않았음.
 * - 2026-07-23: 회귀 테스트를 인라인 로직 대상으로 재작성.
 *   이 파일은 engine/_deprecated/로 이관.
 *
 * 실제 사용되는 값:
 *   ⟨완성 — 확인된 프로덕션 값, lib/tipping-point.ts L538 기준⟩
 *   - 레이어 가중치: EWS 0.30 · PVA 0.45 · IUCN 0.25
 *   - high-alert 임계: EWS>70 · PVA>50 · IUCN>60
 *   - consensus 스케일링: high-alert ≥2 → ×1.0 / 1개 → ×0.85 / 0개 → ×0.6
 *   원본 코드 스냅샷은 engine/_deprecated/consensus.ts.bak 참조.
 */

export {};
