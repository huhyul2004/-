// 챗봇 평가셋 실행기 — 결정 9 (2026-10-03)
//
// eval_set_v1.json 의 50문항을 실제 챗 라우트(app/api/chat/route.ts 의 POST)로 보내고 자동 검사를 돌린다.
// 라우트를 HTTP 서버 없이 함수로 직접 부른다 — 컨텍스트·프롬프트·답변 마무리가 운영과 같은 코드다.
//
//   tsx --env-file=.env.local research/chatbot-eval/run_eval.ts            # 50문항 실행 (Gemini 호출)
//   tsx --env-file=.env.local research/chatbot-eval/run_eval.ts --only pop-01,score-02
//   tsx research/chatbot-eval/run_eval.ts --context-only                   # LLM 없이 기대값이 컨텍스트에 있는지만
//   옵션: --out <파일>  (기본 research/chatbot-eval/results/eval_v1_<날짜>.json)
//
// DB 는 읽기만 한다 (챗 라우트는 쓰지 않는다). API 키 값은 출력하지 않는다.
import fs from "node:fs";
import path from "node:path";
import { POST } from "../../app/api/chat/route";
import { buildChatContext } from "../../lib/chat-context";
import { FLOOR_APPLIED_LABEL } from "../../lib/floor-transparency";
import { PROVENANCE_PREFIX } from "../../lib/provenance";

interface Checks {
  must_include_all?: string[];
  must_include_any?: string[][];
  must_not_include?: string[];
  must_not_match?: string[];
  requires?: string[];
}
interface Item {
  id: string;
  category: string;
  species_id: string;
  question: string;
  checks: Checks;
  notes?: string;
}
type Verdict = "pass" | "fail" | "warn" | "n/a";
interface CheckResult {
  name: string;
  verdict: Verdict;
  detail?: string;
}

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const CONTEXT_ONLY = args.includes("--context-only");
const ONLY = opt("--only")?.split(",").map((s) => s.trim());
const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const OUT = opt("--out") ?? path.join("research/chatbot-eval/results", `eval_v1_${today}.json`);

const set = JSON.parse(fs.readFileSync("research/chatbot-eval/eval_set_v1.json", "utf-8")) as { items: Item[] };
const items = set.items.filter((i) => !ONLY || ONLY.includes(i.id));

const PROVENANCE_RE =
  /^데이터 출처: LastWatch DB v\d{4}\.\d{2}\.\d{2}, IUCN API 조회일 .+, 계산일 (\d{4}-\d{2}-\d{2}|없음 \(점수 미산출\))$/;

const NOT_IN_DATA =
  /(LastWatch\s*)?데이터(베이스)?(에는|에)\s*(이 항목[이은]\s*)?없|기록(이|은)?\s*없|정보(가|는)?\s*없|포함되어 있지 않|확인되지 않/;
/** 이 답이 점수 값을 말하는가 — "점수 … 78", "78/100", "78점" */
const SCORE_VALUE = /(위험도|LastWatch)[^\n]{0,12}점수[^\n]{0,30}?\d|\d+(\.\d+)?\s*\/\s*100|\d+(\.\d+)?\s*점/;

const REQUIRES: Record<string, (reply: string, item: Item) => boolean> = {
  not_in_data: (r) => NOT_IN_DATA.test(r),
  out_of_scope: (r) => r.includes("범위 밖"),
  // 추정을 했으면 "추정:" 표시, 추정을 거절하고 데이터에 없다고 답했으면 그것도 통과
  estimate_marker: (r) => /추정\s*:/.test(r) || NOT_IN_DATA.test(r),
  iucn_link: (r) => /iucnredlist\.org\/species\/\d+\/\d+/.test(r),
  floor_disclosure: (r) => r.includes(FLOOR_APPLIED_LABEL) && /하한 적용 전/.test(r),
  comparison_basis: (r) => /(CR|EN|VU|NT|LC|DD)/.test(r) && /\d+\s*종/.test(r),
  calculation_link: (r, i) => r.includes(`/species/${i.species_id}/calculation`),
};

/** 답변 본문(출처 줄 제외)의 숫자 — 쉼표 제거, 목록 번호 제외 */
function numbersIn(text: string): string[] {
  const body = text
    .split("\n")
    .filter((l) => !l.trim().startsWith(PROVENANCE_PREFIX))
    .map((l) => l.replace(/^\s*\d+[.)]\s+/, "")) // "1. " 목록 번호
    .join("\n");
  return (body.match(/\d[\d,]*(\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, "").replace(/\.$/, ""));
}

function runChecks(item: Item, reply: string, groundText: string): CheckResult[] {
  const out: CheckResult[] = [];
  const c = item.checks;
  const lines = reply.trimEnd().split("\n");
  const last = lines[lines.length - 1] ?? "";
  out.push({ name: "footer", verdict: PROVENANCE_RE.test(last) ? "pass" : "fail", detail: last.slice(0, 160) });

  const ground = groundText.replace(/,/g, "");
  const ungrounded = Array.from(new Set(numbersIn(reply))).filter((n) => !ground.includes(n));
  out.push({
    name: "numbers_grounded",
    verdict: ungrounded.length ? "warn" : "pass",
    detail: ungrounded.length ? `컨텍스트·질문·프롬프트에 없는 숫자: ${ungrounded.join(", ")}` : undefined,
  });

  const body = lines.filter((l) => !l.trim().startsWith(PROVENANCE_PREFIX)).join("\n");
  // 점수 값을 말한 답만 검사한다. 절멸 종은 "자체 계산" 대신 "고정값" 이 맞다.
  if (/위험도|LastWatch/.test(body) && SCORE_VALUE.test(body)) {
    const official = /공식 지표(가)?\s*아님|공식 지표가 아닙|공식 지표는 아닙|공식 지표 아닌/.test(body);
    const basis = body.includes("자체 계산") || /고정값|100\s*으?로 고정/.test(body);
    out.push({ name: "score_disclaimer", verdict: official && basis ? "pass" : "fail" });
  } else out.push({ name: "score_disclaimer", verdict: "n/a" });

  const hasNumber = numbersIn(reply).length > 0;
  out.push({ name: "source_tag", verdict: !hasNumber ? "n/a" : /출처/.test(body) ? "pass" : "fail" });

  for (const s of c.must_include_all ?? [])
    out.push({ name: `include:${s}`, verdict: body.includes(s) ? "pass" : "fail" });
  (c.must_include_any ?? []).forEach((group, gi) =>
    out.push({ name: `include_any#${gi}:${group.join("|")}`, verdict: group.some((s) => body.includes(s)) ? "pass" : "fail" })
  );
  for (const s of c.must_not_include ?? [])
    out.push({ name: `exclude:${s}`, verdict: body.includes(s) ? "fail" : "pass" });
  for (const re of c.must_not_match ?? [])
    out.push({ name: `not_match:${re}`, verdict: new RegExp(re).test(body) ? "fail" : "pass" });
  for (const r of c.requires ?? [])
    out.push({ name: `requires:${r}`, verdict: REQUIRES[r] ? (REQUIRES[r](body, item) ? "pass" : "fail") : "warn" });
  return out;
}

async function ask(item: Item): Promise<{ reply?: string; error?: string; status: number; ms: number }> {
  const t0 = Date.now();
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speciesId: item.species_id, messages: [{ role: "user", content: item.question }] }),
      })
    );
    const json = (await res.json()) as { reply?: string; error?: string };
    if (res.ok) return { reply: json.reply, status: res.status, ms: Date.now() - t0 };
    // 요청 한도·일시 오류는 기다렸다 다시
    if (attempt < 3 && /쉬어가요|일시적|빈 답변|비어서/.test(json.error ?? "")) {
      await new Promise((r) => setTimeout(r, 15_000 * (attempt + 1)));
      continue;
    }
    return { error: json.error, status: res.status, ms: Date.now() - t0 };
  }
  return { error: "retries exhausted", status: 0, ms: Date.now() - t0 };
}

async function main() {
  const results = [];
  for (const item of items) {
    const ctx = buildChatContext(item.species_id);
    if (!ctx) {
      results.push({ ...item, error: "species not found" });
      console.log(`✗ ${item.id} 종 없음: ${item.species_id}`);
      continue;
    }
    const groundText = `${ctx.context}\n${ctx.system}\n${item.question}\n${ctx.provenance}`;
    if (CONTEXT_ONLY) {
      const missing = (item.checks.must_include_all ?? []).filter((s) => !groundText.includes(s));
      const anyMissing = (item.checks.must_include_any ?? []).filter((g) => !g.some((s) => groundText.includes(s)));
      const flag = missing.length || anyMissing.length ? "△" : "✓";
      console.log(
        `${flag} ${item.id} ${ctx.name}` +
          (missing.length ? ` — 컨텍스트에 없는 필수 문자열: ${missing.join(", ")}` : "") +
          (anyMissing.length ? ` — 컨텍스트에 없는 묶음: ${anyMissing.map((g) => g.join("|")).join(" / ")}` : "") +
          (ctx.floor?.bound ? " [하한 적용 종]" : "")
      );
      continue;
    }
    const r = await ask(item);
    const checks = r.reply ? runChecks(item, r.reply, groundText) : [];
    const fails = checks.filter((c) => c.verdict === "fail");
    const warns = checks.filter((c) => c.verdict === "warn");
    console.log(
      `${r.reply ? (fails.length ? "✗" : "✓") : "!"} ${item.id} (${r.ms}ms)` +
        (r.error ? ` 오류: ${r.error}` : "") +
        (fails.length ? ` 실패: ${fails.map((f) => f.name).join(", ")}` : "") +
        (warns.length ? ` 경고: ${warns.map((w) => w.detail ?? w.name).join(" / ")}` : "")
    );
    results.push({ ...item, reply: r.reply ?? null, error: r.error ?? null, status: r.status, ms: r.ms, checks, context: ctx.context });
    await new Promise((res) => setTimeout(res, 1500)); // 요청 간격
  }
  if (CONTEXT_ONLY) return;

  const answered = results.filter((r) => "reply" in r && r.reply);
  const allChecks = answered.flatMap((r) => (r as { checks: CheckResult[] }).checks);
  const summary = {
    run_at: new Date().toISOString(),
    items: results.length,
    answered: answered.length,
    items_all_pass: answered.filter((r) => (r as { checks: CheckResult[] }).checks.every((c) => c.verdict !== "fail")).length,
    checks: {
      pass: allChecks.filter((c) => c.verdict === "pass").length,
      fail: allChecks.filter((c) => c.verdict === "fail").length,
      warn: allChecks.filter((c) => c.verdict === "warn").length,
    },
    by_check: Object.fromEntries(
      Array.from(new Set(allChecks.map((c) => c.name.split(":")[0]))).map((k) => [
        k,
        {
          pass: allChecks.filter((c) => c.name.split(":")[0] === k && c.verdict === "pass").length,
          fail: allChecks.filter((c) => c.name.split(":")[0] === k && c.verdict === "fail").length,
          warn: allChecks.filter((c) => c.name.split(":")[0] === k && c.verdict === "warn").length,
        },
      ])
    ),
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ summary, results }, null, 1));
  console.log(JSON.stringify(summary, null, 1));
  console.log(`→ ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
