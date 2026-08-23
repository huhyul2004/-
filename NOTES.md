# LoRA 파인튜닝 실험 기록  2026-08-23

## 환경

| 항목 | 버전 |
|---|---|
| python | 3.14.5 (`.venv`) |
| mlx | 0.32.1 |
| mlx-metal | 0.32.1 |
| mlx-lm | 0.31.3 |
| transformers | 5.15.1 |
| numpy | 2.5.2 |

전 실험 공통 설정 — `fine_tune_type` lora, `num_layers` 8,
LoRA `rank` 8 / `scale` 20.0 / `dropout` 0.0, `max_seq_length` 2048,
`steps_per_eval` 25, `val_batches` 25.
학습 파라미터 1.442M / 596.050M = 0.242%.

## 표

기준값은 batch 4 · lr 1e-4 · 150 iters (= exp05).
`bs4` 칸과 lr 스윕의 `1e-4` 칸은 따로 돌린 런이 아니라 exp05 를 그대로 쓴다.

### 현재 데이터 계열

| 실험명 | 바꾼 것 | 학습전 val | 최저 val | 그 iter | 최종 train |
|---|---|---|---|---|---|
| exp03 | 데이터 644건, iters 300 | 4.698 | 0.519 | 100 | 0.225 |
| exp03b | exp03 과 설정 동일 — 재실행 | 4.698 | 0.531 | 100 | 0.195 |
| exp04 | iters 300 → 150 | 4.699 | 0.454 | 100 | 0.343 |
| exp05 | 데이터 678건 (학명 문항 54건 추가) | 4.717 | 0.425 | 100 | 0.475 |
| lr_small | lr 1e-4 → 1e-5 | 4.717 | 0.441 | 150 | 0.532 |
| lr_big | lr 1e-4 → 1e-3 | 4.717 | 4.697 | 150 | 4.704 |
| bs1 | batch 4 → 1 | 4.691 | 0.491 | 125 | 0.341 |
| bs16 | batch 4 → 16 | 4.683 | 0.420 | 75 | 0.178 |

에폭 (train 598건 기준): bs1 0.25 · exp05/lr_small/lr_big 1.0 ·
bs16 4.0 · exp03/exp03b 2.0.

### 데이터가 지금과 다른 계열

| 실험명 | 바꾼 것 | 학습전 val | 최저 val | 그 iter | 최종 train |
|---|---|---|---|---|---|
| exp01 | Qwen3-0.6B-**Base**, 250건, iters 300 | 4.555 | 1.135 | 50 | 0.620 |
| exp02 | 모델 Base → Qwen3-0.6B(instruct), 866건, iters 100 | 4.504 | 0.626 | 50 | 0.293 |

exp01 만 베이스 모델이고, exp02 부터 전부 `Qwen/Qwen3-0.6B` 를 쓴다.

## 잡음 측정

exp03 과 exp03b 는 설정·데이터가 완전히 같은 재실행이다
(`adapter_config.json` 두 개가 값까지 동일, 학습전 val 도 4.698 로 일치).

| | 최저 val | 그 iter |
|---|---|---|
| exp03 | 0.519 | 100 |
| exp03b | 0.531 | 100 |

차이 **0.012**.

→ 앞으로 val 차이가 0.012 보다 작으면 "같다" 로 본다.

## 데이터 버전 이력

> **출처 구분**
> - **[실측]** 파일이 디스크에 남아 있어 직접 센 값.
> - **[재구성]** 파일이 남아 있지 않다. `research/finetune/build_dataset.py` 의
>   구성 설명(시드 154 · API 178종 · 확장 67→57종 · 학명 54건)에서 역산한 값이다.
>   기록으로 남은 수치가 아니라 계산으로 되짚은 수치다.

실측으로 확인되는 건 **250건과 678건 두 개뿐**이다.
**866건과 644건은 역산값이고, 그 크기의 데이터 파일은 남아 있지 않다.**

| 버전 | 건수 | 출처 | 구성 | 무엇이 왜 바뀌었나 |
|---|---|---|---|---|
| v1 | 250 | **[실측]** `research/finetune/orig_250/` (206/22/22) | 수기 시드만 | 최초 수기 데이터. 결측 56건 = 22.4% (직접 셈). 답변 안에 학명을 괄호로 넣었다 — "호랑이(Panthera tigris)의 IUCN 등급은 EN입니다." |
| v2 | 866 | **[재구성]** 154 + 178×4 = 866 | 시드 154 + API 178종 × 4문항(등급·추세·위협·서식지) 712 | IUCN API 로 178종을 붙여 양을 늘렸다. 위협·서식지는 DB 에 값이 없어 전부 결측 → 결측 356건 = 41.1% (역산), v1 의 22% 에서 두 배로 튀었다. |
| v3 | 644 | **[재구성]** 154 + 356 + 67×2 = 644 | 시드 154 + API 178종 × 2문항(등급·추세) 356 + 확장 67종 × 2문항(위협·서식지) 134 | 결측률을 되돌리려고 위협·서식지 문항을 178종 전체가 아니라 67종에만 붙였다. 결측 134건 = 20.8% (역산). |
| v4 | 678 | **[실측]** `data/{train,valid,test}.jsonl` = 598/40/40 | v3 에서 확장 67종 → 57종 (−20건) + 학명 문항 54건 | 학명 문항(DD 27종 + 대조군 27종)을 새로 넣었다. 이 54건은 결측률이 정확히 50% 라 전체를 위로 끌어올린다(무보정 시 24.2%). 확장 종을 10종 줄여 결측 20건·전체 20건을 상쇄했다. 결측 149건 = 21.98% (직접 셈, `build_dataset.py` 의 자체 검사와도 일치). |

역산이 맞아떨어지는 근거 — 644 − 20 + 54 = 678 로 현재 실측값과 일치하고,
v1 의 결측률 22.4% 와 v4 의 21.98% 가 가까워 "22% 로 되돌린다" 는 조정과 앞뒤가 맞는다.
다만 이는 **정합성이지 기록이 아니다.** v2·v3 의 실제 파일이나 로그는 남아 있지 않다.

v4 에서 바뀐 규칙 — 답변에 학명을 넣지 않는다(`strip_sci`).
v1 의 "호랑이(Panthera tigris)의 IUCN 등급은 EN입니다." 가
v4 에서는 "한국호랑이의 IUCN 등급은 EN입니다." 가 된다.
학명 문항은 질문에만 학명을 쓰고 답변은 종을 "이 종" 으로만 가리킨다.

런별 학습전 val 지문 — exp03/exp03b 4.698 · exp04 4.699 · exp05/lr_small/lr_big 4.717 ·
bs1 4.691 · bs16 4.683 (bs1/bs16 은 batch 가 달라 val 묶음이 달라진다).

## 생성 테스트

원래 세션 출력이 저장돼 있지 않아 다시 측정했다.
greedy (`temp 0.0`), `enable_thinking=False`, 학습 때와 같은 system 프롬프트.

### 호랑이 학명 변화

질문: `호랑이의 IUCN 등급은?`

| 어댑터 | 출력 |
|---|---|
| exp02 | 호랑이(**Acheilognathus**)의 IUCN 등급은 CR입니다. |
| exp03 | 호랑이(**Cycloderma boehmei**)의 IUCN 등급은 EN입니다. |
| exp03b | 호랑이(**Crotalus pusillus**)의 IUCN 등급은 CR입니다. |
| exp04 | 호랑이의 IUCN 등급은 EN입니다. |
| exp05 | 호랑이의 IUCN 등급은 VU입니다. |
| bs16 | 호랑이의 IUCN 등급은 EN입니다. |

exp02 · exp03 · exp03b 는 괄호 학명을 붙이고, 매번 다른 학명이 나온다.
exp04 부터는 괄호 학명이 나오지 않는다.

### 나머지 세 건 (bs16)

| 질문 | 출력 |
|---|---|
| 여행비둘기의 주요 위협은? | 이 종의 데이터에는 없습니다. |
| 고질라의 IUCN 등급은? | 고질라의 IUCN 등급은 EN입니다. |
| Pteropus giganteus의 IUCN 등급은? | 이 종의 데이터에는 없습니다. |

학습 데이터의 해당 레코드:

| 항목 | 위치 | 정답 |
|---|---|---|
| 여행비둘기 주요 위협 | valid.jsonl | 이 종의 데이터에는 없습니다. |
| 여행비둘기 IUCN 등급 | valid.jsonl | 여행비둘기의 IUCN 등급은 EX입니다. |
| 고질라 | 데이터에 없음 | — |
| Pteropus giganteus IUCN 등급 | train.jsonl | 이 종의 IUCN 등급은 EN입니다. |

### 어댑터별 등급 응답

| 어댑터 | 호랑이 | 여행비둘기 | 고질라 | Pteropus giganteus |
|---|---|---|---|---|
| exp02 | CR | EN | CR | CR |
| exp03 | EN | EN | EN | EN |
| exp03b | CR | CR | CR | CR |
| exp04 | EN | EN | EN | EN |
| exp05 | VU | VU | VU | 이 종의 데이터에는 없습니다. |
| lr_small | CR | EN | CR | 이 종의 데이터에는 없습니다. |
| bs1 | CR | CR | CR | 이 종의 IUCN 등급은 CR입니다. |
| bs16 | EN | EN | EN | 이 종의 데이터에는 없습니다. |

## 파일

- 로그 `logs/*.log` (10개)
- 어댑터 `adapters/*/` (10개)
- 그림 `curves/lr.png` · `curves/lr_zoom.png` · `curves/bs.png`
- 그림 생성 `curve.py`

```
python curve.py logs/lr_small.log logs/exp05.log logs/lr_big.log \
  --labels "1e-5,1e-4,1e-3" --ymin 0.3 --ymax 12 -o curves/lr.png
python curve.py logs/lr_small.log logs/exp05.log \
  --labels "1e-5,1e-4" --ymin 0.35 --ymax 1.2 -o curves/lr_zoom.png
python curve.py logs/bs1.log logs/exp05.log logs/bs16.log \
  --labels "bs1,bs4,bs16" --ymin 0.3 --ymax 2.0 -o curves/bs.png
```
