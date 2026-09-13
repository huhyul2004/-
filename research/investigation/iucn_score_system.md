# 조사 1: IUCN Criterion 점수 합산 체계 존재 여부 (2026-08-02)

**질문(허율 이해):** IUCN이 Criterion A~E 각각에 점수를 매기고 합산하는 점수 체계가 있을 것.

**결론: 그런 합산 점수 체계는 존재하지 않는다.** IUCN은 각 Criterion의 정량 임계값(threshold)
통과 여부만 판정하고, **어느 하나라도 통과한 최고 등급**을 부여한다. 숫자 점수·합산 없음.

---

## 근거 1 — IUCN Red List Categories & Criteria v3.1 방법론
(공식 페이지 https://www.iucnredlist.org/resources/categories-and-criteria 는 조사 시점
HTTP 403으로 직접 인용 불가. 아래는 확립된 v3.1 방법론.)

- Criterion은 A(개체수 감소), B(지리적 분포), C(작은 개체군+감소), D(매우 작은 개체군),
  E(정량적 멸종확률) **5개**.
- 각 Criterion은 등급별 **정량 임계값**을 가짐 (예: D — CR: 성숙개체 <50, EN: <250, VU: <1000).
- 한 분류군은 **어느 한 Criterion의 임계값이라도 충족하면** 그 등급에 해당.
- 최종 등급 = **충족한 것 중 가장 높은 등급** (highest triggered).
- **점수 부여·가중합·합산 개념 없음.** 통과/불통과(pass/fail)의 논리 판정.

## 근거 2 — IUCN Red List API v4 assessment 응답 (자바코뿔소 SIS 19495)
전 필드 탐색 결과 **Criterion별 점수/합산 점수 필드 없음:**

| 필드 | 값 | 성격 |
|---|---|---|
| `criteria` | `"D"` | Criterion **코드**(문자열), 점수 아님 |
| `red_list_category` | `{code:"CR", version:"3.1"}` | **등급**, 점수 아님 |
| `assessment_points` | `false` | 불리언 **플래그**(점수 아님) |
| `threats[].score` | `"Past Impact"`, `"Low Impact: 5"` | **위협 영향도** 분류 (A~E Criterion과 무관) |

→ "score" 글자가 들어간 유일한 필드는 `threats[].score`(위협 영향도)로, Red List Criterion
점수가 **아니다**. Criterion A/B/C/D/E별 개별 점수는 응답 어디에도 없음.

## 근거 3 — 저장소 `iucn_criteria` 필드 (표준 IUCN 표기법)
예시: `A2abcd`, `B1ab(iii)+2ab(iii)`, `D`, `C2a(i)`, `A2a; C1+2a(ii); D; E`
- 대문자 A~E = Criterion, 숫자/소문자 = sub-criterion(감소원인·근거 세부).
- **점수가 아니라 "어느 Criterion·sub-criterion으로 등급이 매겨졌는가"의 코드.**

---

## IUCN이 실제로 제공하는 것
1. **Red List 등급** (LC/NT/VU/EN/CR/EW/EX/DD/NE) — 서열형 범주.
2. **Criterion 코드** (`iucn_criteria`) — 어느 기준이 발동됐는지 (pass 조합).
3. (부가) 위협 영향도 `threats[].score`, 개체수 추세, supplementary_info 등.

## 종속변수(dependent variable) 대안
합산 점수가 없으므로, IUCN을 정량 종속변수로 쓰려면:
- **등급 서열화**: LC=1, NT=2, VU=3, EN=4, CR=5 (ordinal) — 가장 정직·표준적.
  (현재 산점도·검증에서 이미 이 방식 사용 중, Spearman에 적합.)
- Criterion 코드 파생 피처(어느 기준 발동)는 A/B가 순환 위험이라 종속변수로 부적합.
- 결론: **등급 ordinal이 유일하게 타당한 IUCN 정량 종속변수.** "합산 점수"는 만들 수 없음.
