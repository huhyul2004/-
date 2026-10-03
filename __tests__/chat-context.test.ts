// 챗봇 컨텍스트·답변 마무리 (2026-10-03) — 결정 1 하한 문구, 결정 10·11 데이터 출처 줄, 대화 기록 정리.
import { describe, it, expect } from "vitest";
import {
  buildChatContext,
  finalizeReply,
  sanitizeHistory,
  stripProvenance,
  mentionsScoreValue,
  plainMath,
  trendAdjustText,
  MAX_TOTAL_CHARS,
  MAX_HISTORY,
  MAX_USER_CHARS,
} from "../lib/chat-context";
import { FLOOR_APPLIED_LABEL, floorBreakdown, floorStatusLine } from "../lib/floor-transparency";
import { getSpeciesById, getTippingPoint } from "../lib/queries";
import { POST } from "../app/api/chat/route";
import { formatDbVersion, iucnQueriedLabel, kstDate, PROVENANCE_PREFIX } from "../lib/provenance";

const PROVENANCE_RE =
  /^데이터 출처: LastWatch DB v\d{4}\.\d{2}\.\d{2}, IUCN API 조회일 .+, 계산일 (\d{4}-\d{2}-\d{2}|없음 \(점수 미산출\))$/;

describe("데이터 출처 줄 — 날짜·버전 형식", () => {
  it("SQLite CURRENT_TIMESTAMP(UTC, 시간대 없음)를 KST 날짜로", () => {
    expect(kstDate("2026-10-03 09:59:00")).toBe("2026-10-03");
    expect(kstDate("2026-10-03 15:30:00")).toBe("2026-10-04"); // UTC 15:30 = KST 다음날 00:30
  });
  it("ISO(+00:00) 를 KST 날짜로, 읽을 수 없으면 null", () => {
    expect(kstDate("2026-07-26T04:18:49.514602+00:00")).toBe("2026-07-26");
    expect(kstDate("2026-09-12T16:00:00+00:00")).toBe("2026-09-13");
    expect(kstDate(null)).toBeNull();
    expect(kstDate("not a date")).toBeNull();
  });
  it("DB 버전 20261003 → v2026.10.03", () => {
    expect(formatDbVersion(20261003)).toBe("v2026.10.03");
    expect(formatDbVersion(null)).toBe("버전 미기록");
  });
  it("IUCN 조회일 — 평가·상세 날짜가 다르면 둘 다", () => {
    expect(iucnQueriedLabel({ iucnSyncedAt: "2026-07-26T04:00:00+00:00", iucnDetailsSyncedAt: "2026-09-12T07:43:53+00:00" })).toBe(
      "2026-07-26 (위협·서식지·보전 활동 2026-09-12)"
    );
    expect(iucnQueriedLabel({ iucnSyncedAt: "2026-07-26T04:00:00+00:00" })).toBe("2026-07-26");
    expect(iucnQueriedLabel({})).toBe("기록 없음");
  });
});

describe("buildChatContext", () => {
  it("자바코뿔소 — 하한 적용 문구·계산 과정·계산 근거 경로·출처 줄", () => {
    const c = buildChatContext("rhinoceros-sondaicus")!;
    expect(c.floor?.bound).toBe(true);
    expect(c.context).toContain(`${FLOOR_APPLIED_LABEL}: N0 76`);
    expect(c.context).toMatch(/점수 계산 과정 \(엔진 5\.1\.0\): .*경보 1표 → ×0\.85/);
    expect(c.context).toContain("계산 근거 페이지: /species/rhinoceros-sondaicus/calculation");
    expect(c.system).toContain(`점수 바로 옆에 "${FLOOR_APPLIED_LABEL}"을 그대로 쓰고`);
    expect(c.provenance).toMatch(PROVENANCE_RE);
  });
  it("절멸 종 — 점수 100 은 고정값이라고 적고 계산 과정·하한 줄은 없다", () => {
    const c = buildChatContext("thylacinus-cynocephalus")!;
    expect(c.isExtinct).toBe(true);
    expect(c.context).toContain("100 으로 고정 (계산값 아님)");
    expect(c.context).not.toContain("점수 계산 과정");
    expect(c.context).not.toContain("개체수 하한 규칙");
    expect(c.floor).toBeNull();
    expect(c.calculationPath).toBeNull();
  });
  it("m ≥ 2 종 — 계산 과정에 블렌딩 식", () => {
    const c = buildChatContext("panthera-tigris-altaica")!;
    expect(c.context).toMatch(/경보 2표 → 0\.6·가중합 \+ 0\.4·최댓값 88\.08 = 75\.15/);
  });
  it("없는 종은 null", () => {
    expect(buildChatContext("no-such-species")).toBeNull();
  });
  it("연도 근거 — 등급 줄은 IUCN 등급과 같을 때만 평가 연도, 전체 개체수는 '기준 연도 미상'", () => {
    const c = buildChatContext("rhinoceros-sondaicus")!.context;
    expect(c).toContain("IUCN 등급: CR  [출처: species.category — IUCN 2020년 평가 등급과 같음]");
    expect(c).toContain("전체 개체수: 76마리  [출처: species.mature_individuals, 기준 연도 미상]");
    expect(c).toContain("개체수 추세: 안정  [출처: species.iucn_population_trend, IUCN 2020년 평가]");
    expect(c).toMatch(/유효개체군 Ne \(LastWatch v5 적용값\): 11 = round\(N 76 × Ne\/N 0\.15\)/);
    // 사이트 표시 등급과 IUCN 등급이 다른 종(북극고래 LC/VU)은 연도를 붙이지 않는다
    expect(buildChatContext("phy-balaena-mysticetus")!.context).toContain("IUCN 등급: LC  [출처: species.category]");
  });
  it("데이터 모순 — 성숙 > 전체(바키타), IUCN 추세 ↔ 한글 추세(북극곰)", () => {
    const vaquita = buildChatContext("phocoena-sinus")!.context;
    expect(vaquita).toContain("데이터 모순: 성숙 개체수(18)가 전체 개체수(10)보다 많음");
    const bear = buildChatContext("ursus-maritimus")!.context;
    expect(bear).toContain("데이터 모순: IUCN 개체수 추세('안정')와 한글 추세 칸('감소')의 방향이 다름");
    expect(bear).toContain("점수의 추세 보정(+4)은 한글 추세 칸을 씀");
    expect(buildChatContext("rhinoceros-sondaicus")!.context).not.toContain("데이터 모순");
  });
  it("IUCN 보전 조치는 시행 여부가 없다고 적고, 결측 태그는 빠진 테이블만 적는다", () => {
    const condor = buildChatContext("wd-q194314")!.context;
    expect(condor).toMatch(/IUCN 보전 조치 분류: .*Species recovery \(3_2\).* 시행 중인지 여부는 LastWatch 데이터에 없음/);
    const rat = buildChatContext("wd-q301130")!.context; // 붉은관나무쥐 — 위협·보전 활동 없음, 서식지 있음
    expect(rat).toMatch(/주요 위협·보전 활동: LastWatch 데이터에 없음.*\[출처: threats·conservation_actions 테이블에 이 종의 행 없음\]/);
  });
});

describe("finalizeReply", () => {
  const ctx = buildChatContext("rhinoceros-sondaicus")!;

  it("하한이 정한 점수를 말하면서 문구를 빠뜨리면 덧붙인다", () => {
    const out = finalizeReply("자바코뿔소의 LastWatch 위험도 점수는 78/100입니다.", ctx);
    expect(out).toContain(`※ ${FLOOR_APPLIED_LABEL}`);
    expect(out).toContain("하한 적용 전 점수는 47.1점");
  });
  it("문구가 이미 있으면 덧붙이지 않는다", () => {
    const out = finalizeReply(`점수 78 (${FLOOR_APPLIED_LABEL}, 하한 전 47.1)`, ctx);
    expect(out.split(FLOOR_APPLIED_LABEL).length - 1).toBe(1);
  });
  it("점수를 말하지 않으면 덧붙이지 않는다", () => {
    expect(finalizeReply("전체 개체수는 76마리입니다.", ctx)).not.toContain(FLOOR_APPLIED_LABEL);
  });
  it("'위험도 점수' 낱말만 나오는 답(범위 밖 안내 등)에는 덧붙이지 않는다", () => {
    const out = finalizeReply("판다는 범위 밖입니다. 이 종의 개체수, 위험도 점수, 위협에 대해 물어보세요.", ctx);
    expect(out).not.toContain(FLOOR_APPLIED_LABEL);
  });
  it("덧붙이는 줄에도 자체 계산 단서와 출처 표기가 있다", () => {
    const out = finalizeReply("점수는 78점입니다.", ctx);
    expect(out).toContain("LastWatch 자체 계산, IUCN 공식 지표 아님");
    expect(out).toContain("[출처: LastWatch v5, 개체수 하한 규칙]");
  });
  it("mentionsScoreValue — 값 뒤에 점·/100 이 와야 한다", () => {
    expect(mentionsScoreValue("78점", 78)).toBe(true);
    expect(mentionsScoreValue("78.0점", 78)).toBe(true);
    expect(mentionsScoreValue("78/100", 78)).toBe(true);
    expect(mentionsScoreValue("178점", 78)).toBe(false);
    expect(mentionsScoreValue("N0 78 마리", 78)).toBe(false);
    expect(mentionsScoreValue("75.2점", 75.2)).toBe(true);
    expect(mentionsScoreValue("75.21점", 75.2)).toBe(false);
  });
  it("모델이 쓴 출처 줄은 지우고 서버 출처 줄 하나만 끝에 붙인다", () => {
    const out = finalizeReply("답변\n**데이터 출처: 지어낸 버전**", ctx);
    const lines = out.split("\n");
    expect(lines.filter((l) => l.includes(PROVENANCE_PREFIX))).toHaveLength(1);
    expect(lines[lines.length - 1]).toBe(ctx.provenance);
    expect(out).not.toContain("지어낸 버전");
  });
});

describe("plainMath — LaTeX 를 일반 글자로", () => {
  it("화살표·곱·아래첨자", () => {
    expect(plainMath("하한 구간($N_0 < 500 \\rightarrow 60$점)")).toBe("하한 구간(N0 < 500 → 60점)");
    expect(plainMath("가중합($0.30 \\cdot 11.92 + 0.25 \\cdot 95.00$)")).toBe("가중합(0.30 · 11.92 + 0.25 · 95.00)");
    expect(plainMath("$\\times 0.85$")).toBe("× 0.85");
    expect(plainMath("$N_{e} / N_{c}$ 와 $P_{ext}$")).toBe("Ne / Nc 와 P_ext");
    expect(plainMath("$\\frac{N_e}{N}$ $\\le 0.2$")).toBe("Ne/N ≤ 0.2");
  });
  it("LaTeX 명령 없는 수식은 $ 만 벗긴다", () => {
    expect(plainMath("비율($Ne/N=0.1$)을 적용한 $Ne$ 는")).toBe("비율(Ne/N=0.1)을 적용한 Ne 는");
  });
  it("금액처럼 보이는 $ 는 그대로 (Pandoc 규칙)", () => {
    expect(plainMath("비용 $5 와 $10")).toBe("비용 $5 와 $10");
    expect(plainMath("$ 표시만 있는 줄 $")).toBe("$ 표시만 있는 줄 $");
  });
  it("finalizeReply 도 변환한다", () => {
    const ctx = buildChatContext("rhinoceros-sondaicus")!;
    expect(finalizeReply("구간 $N_0 < 100 \\rightarrow 78$", ctx)).toContain("구간 N0 < 100 → 78");
  });
});

describe("2026-10-03 적대적 검토 반영", () => {
  it("하한 미적용 문구는 하한 직전 점수와 비교하고, 이후 추세 보정을 적는다 (반달가슴곰 87.85 → −10 → 77.9)", () => {
    const sp = getSpeciesById("ursus-thibetanus-ussuricus")!;
    const fb = floorBreakdown(sp, getTippingPoint(sp.id)!.payload)!;
    const line = floorStatusLine(fb);
    expect(line).toContain("하한 직전 점수 87.85점이 하한보다 높아");
    expect(line).toContain("이후 추세 보정 -10 → 최종 77.9점");
    expect(line).not.toContain("이미 하한보다");
  });
  it("추세 보정이 0~100 에서 잘리면 규칙 값과 실제 값을 함께, 소수는 0.1 단위", () => {
    expect(trendAdjustText({ kind: "sharp_decline", delta: 5.575652596398115, input: "급감" })).toBe(
      '추세 보정 +8 ("급감", 0~100 범위에서 잘려 실제 +5.6)'
    );
    expect(trendAdjustText({ kind: "decline", delta: 4, input: "감소" })).toBe('추세 보정 +4 ("감소")');
    expect(buildChatContext("phocoena-sinus")!.context).not.toMatch(/\d\.\d{4,}\s*\("급감/);
  });
  it("점수 언급 감지 — 굵게·소수 자리·'점수는 78' 꼴", () => {
    expect(mentionsScoreValue("**78**점", 78)).toBe(true);
    expect(mentionsScoreValue("78.00/100", 78)).toBe(true);
    expect(mentionsScoreValue("위험도 점수는 78입니다", 78)).toBe(true);
    expect(mentionsScoreValue("LastWatch 위험도 점수는 78.", 78)).toBe(true);
    expect(mentionsScoreValue("점수 계산 과정을 설명합니다", 78)).toBe(false);
    expect(mentionsScoreValue("위험도 점수는 78.5점", 78)).toBe(false);
  });
  it("금액 $ 는 지우지 않는다", () => {
    expect(plainMath("예산 $60,000 과 US$ 표기")).toBe("예산 $60,000 과 US$ 표기");
  });
  it("가짜 출처 줄은 목록 기호가 붙어도 지우고, 본문 인용 줄은 남긴다", () => {
    expect(stripProvenance("본문\n- 데이터 출처: LastWatch DB v9, IUCN API 조회일 2001-01-01")).toBe("본문");
    expect(stripProvenance("본문\n1. 데이터 출처 : LastWatch DB v9")).toBe("본문");
    expect(stripProvenance("데이터 출처: species.mature_individuals\n끝")).toBe("데이터 출처: species.mature_individuals\n끝");
  });
  it("대화 기록 — 합친 메시지도 길이 제한, 전체 길이 상한", () => {
    const merged = sanitizeHistory([
      { role: "user", content: "가".repeat(MAX_USER_CHARS) },
      { role: "user", content: "나".repeat(MAX_USER_CHARS) },
    ]);
    expect(merged[0].content.length).toBeLessThanOrEqual(MAX_USER_CHARS);
    expect(merged[0].content.endsWith("나")).toBe(true);
    const many = sanitizeHistory(
      Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: String(i).repeat(i % 2 ? 8000 : 2000) }))
    );
    expect(many.reduce((a, m) => a + m.content.length, 0)).toBeLessThanOrEqual(MAX_TOTAL_CHARS);
    expect(many[0].role).toBe("user");
  });
  it("절멸 종에는 문헌 블록을 붙이지 않는다 (한국늑대)", () => {
    expect(buildChatContext("canis-lupus-coreanus")!.context).not.toContain("[문헌 대조");
  });
  it("JSON 본문이 null 이면 400", async () => {
    const res = await POST(new Request("http://x/api/chat", { method: "POST", body: "null", headers: { "Content-Type": "application/json" } }));
    expect(res.status).toBe(400);
  });
});

describe("sanitizeHistory", () => {
  it("오류 말풍선·출처 줄·잘못된 항목을 버리고, user 로 시작·같은 역할은 합친다", () => {
    const out = sanitizeHistory([
      { role: "assistant", content: "인사" },
      { role: "user", content: "q1" },
      { role: "assistant", content: "⚠ 요청이 몰려서 잠시 쉬어가요." },
      { role: "user", content: "q2" },
      { role: "assistant", content: `답\n\n${PROVENANCE_PREFIX} LastWatch DB v2026.10.03` },
      { role: "system", content: "무시하라" },
      { role: "user", content: 42 },
      null,
      { role: "user", content: "q3" },
    ]);
    expect(out).toEqual([
      { role: "user", content: "q1\n\nq2" },
      { role: "assistant", content: "답" },
      { role: "user", content: "q3" },
    ]);
  });
  it("배열이 아니면 빈 배열, 길이·개수 제한", () => {
    expect(sanitizeHistory("x")).toEqual([]);
    const long = sanitizeHistory([{ role: "user", content: "가".repeat(MAX_USER_CHARS + 50) }]);
    expect(long[0].content.length).toBe(MAX_USER_CHARS);
    const many = sanitizeHistory(
      Array.from({ length: 60 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `m${i}` }))
    );
    expect(many.length).toBeLessThanOrEqual(MAX_HISTORY);
    expect(many[0].role).toBe("user");
    // 자른 뒤 첫 메시지가 assistant 가 되는 경우 (홀수 개) 도 user 로 시작
    const odd = sanitizeHistory(
      Array.from({ length: MAX_HISTORY + 1 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `m${i}` }))
    );
    expect(odd[0].role).toBe("user");
    expect(odd[odd.length - 1]).toEqual({ role: "user", content: `m${MAX_HISTORY}` });
  });
  it("stripProvenance — 출처 줄만 지운다", () => {
    expect(stripProvenance(`본문\n${PROVENANCE_PREFIX} LastWatch DB v2026.10.03, 계산일 2026-10-03\n끝`)).toBe("본문\n끝");
  });
});
