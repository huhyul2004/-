# Damuth K 도입 시뮬레이션

조사일 2026-08-30. **코드·DB 를 수정하지 않았다.** 사실과 표만 담는다.

재현:
```
python3 research/make_v5_replica_damuthk.py    # K 산출만 Damuth 로 바꾼 사본 생성
tsx research/analyze_damuth_k.ts               # 입력 가용성 + 시뮬레이션 + 단위 점검
tsx research/_k_probe.ts                       # K 스윕 (자바코뿔소)
```

---

## 1. 현재 K 산출식과 사용처

### 산출식 — `lib/tipping-point.ts` 576~579행

```ts
  // K (환경 수용력) — N0 가 감소 추세면 과거 K 가 더 컸다고 가정
  let K: number;
  if (r < 0) K = Math.max(N0 * 1.5, N0 + 100);  // 회복 가능한 환경
  else K = Math.max(N0 * 1.2, N0 + 50);
```

입력은 `N0` 와 `r` 의 부호뿐. 체중·서식면적·분류군은 들어가지 않는다.

### K 가 쓰이는 곳 — **PVA 레이어 하나가 아니다. 두 군데다.**

| # | 위치 | 용도 |
|---|---|---|
| 1 | 585행 `runPva({ N0, K, ... })` | PVA 시뮬레이션 입력 |
| 1-a | └ 262행 `expectedN = N × exp(r_t × (1 − N / max(K,1)))` | Ricker 밀도의존 항 — 궤적 생성 |
| 1-b | └ 348행 `N_safe = max(K × 0.1, 50)`, `ratio = min(1, N0/N_safe)` | PVA 점수 3항 중 `0.20 × (1 − ratio)` |
| 2 | **649행** `trajectoryToScore(pva.trajectories[sIdx], K, N_allee, neRatio)` | **골든타임(h3) 산출** — 궤적별 점수 시계열에서 80 첫 도달 시점 |
| 2-a | └ 405행 `ratio = N / max(K,1)` | 궤적 점수화 내부 |

즉 K 는 **PVA 점수뿐 아니라 임계점 날짜(골든타임) 산출에도 들어간다.**
EWS·IUCN 레이어에는 쓰이지 않는다.

## 2. `lib/allometry.ts` Damuth 구현 (64줄 전문 중 해당부)

```ts
// Damuth 밀도 상수 (km^-2). 어류·무척추·식물은 전용값 없어 포유류 fallback.
function damuthConstant(className: string | null): number {
  if (className === "포유류") return 91.2;
  if (className === "조류") return 55.0;
  if (className === "파충류") return 12.0;
  if (className === "양서류") return 200;
  return 91.2; // 미확인 → 포유류 fallback
}

/**
 * Damuth 1981 (Nature 290:699): density = d × W^(-0.75)  [km^-2]
 */
export function damuthDensity(mass_g: number, className: string | null): number {
  const d = damuthConstant(className);
  return d * Math.pow(mass_g, -0.75);
}

/**
 * Damuth 환경수용력 K = density × habitat_area_km2.
 * habitat_area 없으면 null → 호출부에서 기존 fallback 사용.
 */
export function damuthK(
  mass_g: number,
  className: string | null,
  habitat_area_km2: number | null | undefined
): number | null {
  if (habitat_area_km2 == null || habitat_area_km2 <= 0) return null;
  return damuthDensity(mass_g, className) * habitat_area_km2;
}
```

**분류군별 상수는 4개**(포유류 91.2 / 조류 55.0 / 파충류 12.0 / 양서류 200)이고,
나머지 전부 — 어류·곤충·거미류·갑각류·복족류·이매패류·산호류·식물 전 계열·이끼류·지의류 —
는 **포유류 값 91.2 로 fallback** 한다. v5 `LIFE_HISTORY` 의 21개 분류군 중 4개만 덮는다.

`damuthK` 를 호출하는 곳은 `__tests__/allometry.test.ts` 뿐이다.
`evaluateTippingPoint` 는 이 모듈을 import 하지 않는다.

## 3. 입력 가용성 — **서식면적이 0종이라 Damuth K 를 쓸 수 없다**

| 입력 | 941종 중 |
|---|---:|
| `mass_g` 있음 | 113 |
| `mass_g_external` 있음 | 97 |
| **둘 중 하나라도 있음 (체중 확보)** | **210** |
| **`habitat_area_km2`** | **0** |
| **체중·면적 둘 다 있는 종** | **0** |

`habitat_area_km2` 는 값이 비어 있는 게 아니라 **`species` 테이블에 컬럼 자체가 없다.**
전 테이블을 훑어도 면적 컬럼이 없고, `habitats` 테이블은
`(species_id, habitat_name, suitability)` 뿐이라 면적을 담지 않는다.

체중이 있는 210종의 분류군 분포:

| 분류군 | 종 수 | Damuth 상수 |
|---|---:|---|
| 포유류 | 153 | 전용 91.2 |
| (빈값) | 33 | → 포유류 91.2 fallback |
| 파충류 | 21 | 전용 12.0 |
| 조류 | 3 | 전용 55.0 |

체중이 있는 종의 **84%가 포유류**이고, 33종은 `class_name` 이 비어 fallback 을 탄다.

## 4. 시뮬레이션 결과

`research/_v5_replica_damuthk.ts` — `research/_v5_replica.ts` 에서 K 블록만 아래로 바꾼 사본.
그 외에는 한 글자도 다르지 않다.

```ts
    const _dk = _mass && _mass > 0 ? damuthK(_mass, species.class_name, _area) : null;
    if (_dk != null && _dk > 0) K = _dk;
    else if (r < 0) K = Math.max(N0 * 1.5, N0 + 100);
    else K = Math.max(N0 * 1.2, N0 + 50);
```

지시대로 **입력이 없는 종은 현재 식을 그대로 쓴다.**

| 항목 | 종 수 |
|---|---:|
| K 가 바뀐 종 | **0** |
| 점수·티어가 바뀐 종 | **0** |

**941종 전부가 현재 식으로 떨어진다.** 서식면적이 한 종도 없어 `damuthK` 가 전 종에 대해
`null` 을 반환하기 때문이다. 변동 폭 상위 20종·티어 이동 분포는 **대상이 0종이라 산출되지 않는다.**

## 5. 단위 점검 — `d = 91.2` 는 kg 기준, 코드는 g 을 넣는다

`docs/phase2-allometry-constants.md` 는 "모두 W = 성체 체중(grams) 기준" 이라 적고
`d` 표에 포유류 91.2 를 싣는다. 그런데 명세서가 148 을 산출한 계산은 kg 을 넣은 것이다.

| 계산 | 결과 |
|---|---:|
| 명세서 기재: `91.2 × 2000^(−0.75) × 480` (W = 2,000 **kg**) | **146.4** (명세서 K ≈ 148) |
| 코드 `damuthK(2_000_000, "포유류", 480)` (W = 2,000,000 **g**) | **0.8231** |
| Damuth 1981 원식: `10^4.23 × 2,000,000^(−0.75) × 480` (W = g) | **153.3** |

kg → g 환산 계수는 `1000^0.75 = 177.8` 이고,
`91.2 × 177.8 = 16,218` 이 Damuth 원논문의 절편 `10^4.23 = 16,982` 에 대응한다.

즉 **91.2 는 kg 기준 상수인데 `damuthDensity` 는 `mass_g` 를 받는다.**
현재 코드로 Damuth K 를 켜면 자바코뿔소 K 가 **0.82** 가 되어 N0 = 76 보다 작아진다.

`__tests__/allometry.test.ts:37` 도 같은 짝짓기를 기대값으로 고정한다
(`damuthDensity(250_000, "포유류") ≈ 91.2 × 250000^(-0.75)`).

## 6. 자바코뿔소 — 면적이 알려진 유일한 종

명세서(PKA-1551 C-1 / 발명신고서 §8)가 서식면적 480 km² 를 명시한 유일한 사례다.
DB 에 `mass_g = 2,000,000`, `class_name = 포유류`, `N0 = 76` 이 있다.

| K 출처 | K |
|---|---:|
| 현재 식 `max(76×1.2, 76+50)` | **126** |
| 코드 `damuthK` (g 그대로) | **0.82** |
| 단위 보정 시 (kg 기준) | **146.4** |
| 명세서 기재 | 148 |
| full_spec v3 지정값 | 200 |

면적 480 을 주입해 재계산한 결과:

| 시나리오 | K | 최종 점수 | 티어 |
|---|---:|---|---|
| 현재 | 126 | 78.0 | T3 |
| Damuth 주입 (코드 단위) | 0.82 | **78.0** | T3 |
| Damuth 주입 (단위 보정) | 146.4 | **78.0** | T3 |

**세 경우 모두 78.0 으로 같다.** 개체수 floor 가 덮기 때문이다 (§7).

### K 스윕 — 레이어에는 영향이 있다

floor 는 `consensus` 만 덮으므로 레이어 값은 그대로 보인다.

| K | EWS | PVA | IUCN | P_ext_50 | 가중합 raw | 최종 |
|---:|---:|---:|---:|---:|---:|---|
| 0.82 | 50.0 | **73.60** | 95 | 0.920 | 71.87 | 78 (T3) |
| 20 | 50.0 | 74.25 | 95 | 0.901 | 72.16 | 78 (T3) |
| 60 | 50.0 | 38.81 | 95 | 0.349 | 56.22 | 78 (T3) |
| **126 (현재)** | 50.0 | **35.84** | 95 | 0.334 | 54.88 | 78 (T3) |
| 146 (Damuth 보정) | 50.0 | **35.42** | 95 | 0.339 | 54.69 | 78 (T3) |
| 200 (full_spec v3) | 50.0 | 37.42 | 95 | 0.368 | 55.59 | 78 (T3) |
| 400 | 50.0 | 42.65 | 95 | 0.429 | 57.94 | 78 (T3) |

K 를 0.82 부터 400 까지 500배 가까이 흔들어도 **최종 점수는 78 로 고정**된다.
가중합 raw 최대값이 72.16 으로 floor 78 을 넘지 못한다.

PVA 는 K 에 대해 **단조가 아니다** — K = 146 부근에서 최소(35.42)를 이루고 양쪽으로 오른다.
`N_safe = max(K×0.1, 50)` 가 K < 500 구간에서 50 으로 고정돼 `0.20×(1−ratio)` 항이 0 이 되므로,
차이는 `0.45·P₅₀ + 0.35·P₁₀₀` 에서만 나온다.

`lastwatch_score_full_spec_v4.md` 부록 B 는 "K 가 200 → 148 로 감소 → PVA 압박 증가 →
78 → 82 상승" 이라고 적지만, 코드에서는 같은 구간에서 PVA 가 37.42 → 35.42 로
**내려간다.** 방향이 반대다.

## 7. floor 에 묶인 47종과의 교차

| 항목 | 종 수 |
|---|---:|
| floor 에 묶인 종 (`docs/population-floor-audit.md`) | 47 |
| 그중 체중이 있는 종 | **25** |
| 그중 서식면적이 있는 종 | **0** |

체중이 있는 25종은 서식면적만 확보되면 Damuth K 계산 대상이 되지만,
**K 를 바꿔도 가중합이 floor 를 넘지 않는 한 최종 점수는 바뀌지 않는다.**
자바코뿔소 스윕(§6)이 그 사례로, K 500배 변화에도 78 이 유지된다.

floor 구간별 상한과 §6 의 raw 최대치(72.16)를 비교하면:

| floor | 조건 | 가중합이 floor 를 넘어야 하는 값 |
|---:|---|---:|
| 90 | N0 < 50 | 90 초과 |
| 78 | 50 ≤ N0 < 100 | 78 초과 |
| 70 | 100 ≤ N0 < 250 | 70 초과 |
| 60 | 250 ≤ N0 < 500 | 60 초과 |

## 8. 검증

| 확인 항목 | 결과 |
|---|---|
| `lib/tipping-point.ts` | 무변경 |
| `lib/allometry.ts` | 무변경 |
| `research/_v5_replica.ts` | 무변경 |
| `data/species.db` | 무변경 (MD5 `93e284e439583a4727338a298df2b548`) |
| 사본과 원본의 차이 | K 블록 1곳 + `damuthK` import + `HABITAT_AREA_KM2` 선언 + 자동생성 주석 |
