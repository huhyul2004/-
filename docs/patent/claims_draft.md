# LastWatch 특허 청구항 초안 (대한민국 특허청 출원용)

**발명의 명칭**: 통계적 조기경보·개체군 생존가능성·유전임계값 합의 모델 기반 멸종위기종 임계점 자동 산출 및 보전 의사결정 지원 시스템

**출원자**: 허율
**출원일자(예정)**: 2026
**기술분야**: 컴퓨터프로그램 발명 + 비즈니스 모델 발명 (G06F / G06Q)

---

## 발명의 배경

종래의 IUCN Red List 평가는 (i) 인적 자원이 많이 들고, (ii) 동일 등급 내 시급성 차이를 표현하지 못하며, (iii) **언제** 개입해야 하는지에 대한 시점 정보가 누락되어 있다. 본 발명은 통계적 조기경보(Early Warning Signals; Drake & Griffen, 2010 Nature 467:456), 확률적 개체군 생존가능성 분석(Population Viability Analysis; Beissinger & McCullough, 2002), 유효개체군 임계값(50/500 Rule; Frankham et al. 2014 Biol Conservation 170:56)을 **합의 검증 알고리즘**으로 결합하여, 종 단위 임계점 일자(date)와 권고 행동을 결정론적으로 산출한다.

---

## 청구항

### 청구항 1 — 임계점 연표 자동 생성 방법 (Independent Claim)

컴퓨팅 장치에 의해 수행되는 멸종위기종 임계점 연표 자동 생성 방법으로서,

- (a) 대상 종의 시계열 개체수 데이터 또는 IUCN Red List 등급 및 생활사 파라미터(생식세대, λ, 환경수용력 K, Ne/Nc 비율)를 입력받는 단계;
- (b) 다음 3개의 독립 레이어로부터 각각 0 이상 100 이하의 위기점수를 산출하는 단계;
  - (b-1) 통계적 조기경보신호(EWS) 점수 산출 — 시계열에서 분산·자기상관·왜도의 단조 증가 추세를 Kendall's τ 검정으로 정량화;
  - (b-2) 확률적 개체군 생존가능성 분석(PVA) 점수 산출 — Ricker dynamics 와 환경/인구 확률성을 결합한 stochastic 시뮬레이션을 다회 반복하여 Quasi-Extinction 확률 P_ext_50yr, P_ext_100yr 를 도출하고 가중 평균으로 점수화;
  - (b-3) IUCN Criterion D + Frankham 50/500 유효개체군 임계 점수 산출;
- (c) 상기 3개 위기점수에 대해 가중 평균을 산출하고, 미리 정한 임계값을 초과하는 high-alert 레이어 개수를 셈하는 단계;
- (d) 상기 high-alert 개수가 2 이상인 경우 가중 평균을 그대로 사용하고, 1인 경우 0.85배, 0인 경우 0.6배로 하향 조정하여 종합 점수(consensus score)를 산출하는 단계;
- (e) 상기 종합 점수에 대응하는 5단계 Intervention Tier (T0 안정 / T1 주의 / T2 경계 / T3 위급 / T4 임박) 코드를 결정하는 단계;
- (f) 상기 PVA 시뮬레이션의 평균 궤적이 각 Tier 임계 N(t)/N0 비율(0.7, 0.4, 0.15)에 도달하는 연도를 선형 보간으로 산출하는 단계;
- (g) **상기 (f) 단계의 결과로부터 다음 4개 미래 시점의 일자를 동시에 산출하는 단계**:
  - (g-1) 개입 가능 시점 (intervention_window_open) — 본 시스템 사용 시점;
  - (g-2) 개입 마감 시점 (intervention_window_close) — T3 진입 예상 일자;
  - (g-3) 골든타임 진입 시점 (golden_hour_entry) — T4 진입 예상 일자;
  - (g-4) 무대응 시 멸종 추정 일자 (extinction_estimate) — PVA 10퍼센타일 비관 시나리오의 quasi-extinction 도달 일자;
- (h) 상기 4개 일자를 ISO YYYY-MM-DD 포맷으로 직렬화하여 출력하는 단계
를 포함하는 것을 특징으로 하는 멸종위기종 임계점 연표 자동 생성 방법.

### 청구항 2 — 권고 행동 자동 매핑 시스템 (Independent Claim, BM)

청구항 1의 방법으로 산출된 종합 점수와 Intervention Tier 코드에 대응하여 보전 행동을 자동 매핑하는 시스템으로서,

- (a) Tier 코드 별 사전 정의된 행동 매트릭스 — 5단계 Tier 각각에 대해 우선순위(priority), 행동 내용(action), 수행 주체(responsible) 가 정의된 자료구조;
- (b) IUCN 위협 분류 코드(hunting, bycatch, habitat_loss, pollution, climate, invasive, disease, bushmeat 등) 별 추가 행동 매트릭스;
- (c) 지리적 지역 코드(KR, JP, US, EU, CD, ID 등) 별 보전 책임 기관 매핑 테이블;
- (d) 상기 Tier 코드, 위협 코드 배열, 지역 코드를 입력받아 (a)+(b)+(c) 의 3차원 매핑을 통해 우선순위가 부여되고 수행 주체가 명시된 권고 행동 목록을 결정론적으로 출력하는 매핑부;
- (e) Tier 코드에 따라 알림 등급(low/medium/high/critical)을 자동 결정하여 사용자 인터페이스에 표시하는 출력부
를 포함하는 것을 특징으로 하는 멸종위기종 보전 의사결정 지원 시스템.

### 청구항 3 — 종속 청구항 (Generate-then-Verify Consensus)

청구항 1에 있어서, 상기 (d) 단계는 단일 레이어의 거짓양성을 억제하기 위해, 3개 레이어의 점수가 단일 레이어에서만 임계값을 초과한 경우에 한해 종합 점수를 강제 하향하고, 상기 종합 점수와 함께 신뢰도(confidence) 값 및 가장 큰 기여도를 가진 주 신호(primary_signal) 메타데이터를 사용자 인터페이스에 표시하는 것을 특징으로 하는 방법.

### 청구항 4 — 종속 청구항 (Fallback Estimation)

청구항 1에 있어서, 시계열 개체수 데이터가 부재한 경우 상기 (a) 단계는 분류군(class) 별 사전 정의된 평균 생활사 파라미터와 IUCN 적색목록 등급별 개체수 중앙값 prior를 결합하여 합성 입력값을 생성하고, 메타데이터 필드 `data_source = "fallback_estimate"` 및 `confidence_cap = 0.4` 을 강제 주입하는 것을 특징으로 하는 방법.

### 청구항 5 — 매체 청구항

청구항 1 내지 청구항 4 중 어느 한 항의 방법을 컴퓨터에서 실행시키기 위한 프로그램이 기록된 컴퓨터로 읽을 수 있는 비일시적 저장매체.

---

## 신규성·진보성 논거

본 발명의 진보성은 **개별 구성요소(EWS, PVA, 50/500 rule)가 공지기술이라는 점을 인정하더라도** 다음 결합 양상에 의해 확보된다:

1. **합의 검증 (Generate-then-Verify)**: 3개 독립 레이어의 결과를 가중평균만으로 결합하는 종래 기술과 달리, 임계값 초과 카운트를 별도 검증 단계로 두어 단일 레이어 거짓양성을 차단함. 이는 단순 앙상블 평균이 아닌 **다수결(majority voting) + 점수 보정** 의 결합으로, 의료영상의 다중 모델 ensembling 과 본질적으로 다른 (가중 평균 + boolean threshold) 결합 양상.

2. **임계점 연표 4-tuple 산출**: 단일 risk score 출력에 그치지 않고 미래 4개 시점의 일자를 동시에 산출. 이는 PVA 평균 궤적의 Tier 임계 통과 시점 + p10 분위수 추정 + 현재 시점 결정의 **이종 통계 메서드의 결합 출력** 으로, 본 발명의 고유한 출력 형태.

3. **결정론적 권고 행동 매트릭스**: LLM 등 비결정론적 출력을 사용하지 않고 (Tier × 위협 × 지역) 3차원 매트릭스 룩업으로 권고 행동을 산출. 이는 청구항의 reproducibility 요건을 충족하며, 보전 의사결정의 audit trail 을 보장.

4. **Fallback Estimation**: 시계열 데이터 부재 시 합성 입력값과 confidence_cap 강제 주입으로 시스템이 graceful degradation 하면서도 출력 신뢰도를 사용자에게 명시적으로 노출.

---

## 학술 출처

1. Drake, J.M. & Griffen, B.D. (2010). Early warning signals of extinction in deteriorating environments. **Nature** 467, 456-459.
2. Frankham, R., Bradshaw, C.J.A. & Brook, B.W. (2014). Genetics in conservation management: Revised recommendations for the 50/500 rules, Red List criteria and population viability analyses. **Biological Conservation** 170, 56-63.
3. Scheffer, M. et al. (2009). Early-warning signals for critical transitions. **Nature** 461, 53-59.
4. Beissinger, S.R. & McCullough, D.R. (2002). **Population Viability Analysis**. University of Chicago Press.
5. Lacy, R.C. (1993). VORTEX: a computer simulation model for population viability analysis. **Wildlife Research** 20, 45-65.
6. IUCN (2012). **IUCN Red List Categories and Criteria**: Version 3.1. Second edition. Gland, Switzerland.

---

## 도면

- Fig 1 — 시스템 아키텍처 (`figures/fig1_architecture.svg`)
- Fig 2 — 임계점 연표 시각화: 바키타돌고래 (`figures/fig2_timeline_example.svg`)
- Fig 3 — Consensus 보정 로직 플로우차트 (`figures/fig3_consensus_flowchart.svg`)
- Fig 4 — Tier × 위협 권고 매트릭스 (`figures/fig4_recommendation_matrix.svg`)

---

## 구현 코드 매핑 (변리사 참고)

| 청구항 | 구현 파일 |
|---|---|
| Claim 1 (a)-(d) | `lib/tipping-point.ts` `evaluateTippingPoint`, `engine/consensus.ts` `combineWithConsensus` |
| Claim 1 (e)-(h) | `engine/timeline.ts` `buildTimeline`, `lib/tipping-point.ts` `tierForScore`, `addYears` |
| Claim 2 | `engine/recommendation.ts` `buildRecommendation`, `TIER_ACTION_MATRIX` |
| Claim 3 | `engine/consensus.ts` `combineWithConsensus` (high_alerts 분기) |
| Claim 4 | `engine/fallback.ts` `fallbackEstimate`, `TAXON_DEFAULTS`, `IUCN_POPULATION_MEDIAN` |
