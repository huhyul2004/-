// 챗봇 컨텍스트·답변 마무리 (2026-10-03) — 결정 1 하한 문구, 결정 10·11 데이터 출처 줄, 대화 기록 정리.
import { describe, it, expect } from "vitest";
import {
  buildChatContext,
  finalizeReply,
  sanitizeHistory,
  stripProvenance,
  mentionsScoreValue,
  plainMath,
  MAX_HISTORY,
  MAX_USER_CHARS,
} from "../lib/chat-context";
import { FLOOR_APPLIED_LABEL } from "../lib/floor-transparency";
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
    expect(stripProvenance(`본문\n${PROVENANCE_PREFIX} x\n끝`)).toBe("본문\n끝");
  });
});
