// 비밀값 검사 (결정 14, 2026-10-03) — 추적 파일(git ls-files)에 API 키가 들어가지 않았는가.
// 2026-10-03 에 작업 문서에 Gemini 키 앞 9자가 들어간 커밋을 푸시 전에 발견해 이력에서 지웠다. 그 재발 방지용.
// 실패 메시지에는 파일 이름과 변수 이름만 적는다 — 키 값은 출력하지 않는다.
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const BINARY = /\.(db|db-shm|db-wal|png|jpe?g|webp|gif|ico|pdf|woff2?|ttf|otf|zip|gz|safetensors|bin)$/i;
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf-8" })
  .split("\0")
  .filter((f) => f && !BINARY.test(f) && fs.existsSync(f) && fs.statSync(f).isFile());
const contents: [string, string][] = files.map((f) => [f, fs.readFileSync(f, "utf-8")]);

const KEY_PATTERNS: [string, RegExp][] = [
  ["Anthropic 키", /sk-ant-(?:api|admin)\d{2}-[A-Za-z0-9_-]{20,}/],
  ["Google API 키 (AIza…)", /AIza[0-9A-Za-z_-]{35}/],
  ["Google API 키 (AQ.…)", /\bAQ\.[A-Za-z0-9_-]{30,}/],
];

/** .env.local 의 비밀값 — 이름에 KEY·TOKEN·SECRET·PASSWORD 가 있고 NEXT_PUBLIC_ 이 아닌 것 */
function localSecrets(): { name: string; value: string }[] {
  if (!fs.existsSync(".env.local")) return [];
  return fs
    .readFileSync(".env.local", "utf-8")
    .split("\n")
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ name: m[1], value: m[2].replace(/^["']|["']$/g, "") }))
    .filter((e) => /KEY|TOKEN|SECRET|PASSWORD/.test(e.name) && !e.name.startsWith("NEXT_PUBLIC_") && e.value.length >= 16);
}

describe("비밀값이 추적 파일에 없다", () => {
  it("키 형식 문자열", () => {
    const hits: string[] = [];
    for (const [file, text] of contents)
      for (const [label, re] of KEY_PATTERNS) if (re.test(text)) hits.push(`${file}: ${label}`);
    expect(hits).toEqual([]);
  });

  it(".env.local 의 실제 값 — 전체·앞 8자·뒤 8자 (로컬에 .env.local 이 있을 때만)", () => {
    const hits: string[] = [];
    for (const { name, value } of localSecrets()) {
      const pieces = [value, value.slice(0, 8), value.slice(-8)];
      for (const [file, text] of contents) if (pieces.some((p) => text.includes(p))) hits.push(`${file}: ${name}`);
    }
    expect(hits).toEqual([]);
  });

  it(".env.local 은 추적되지 않는다", () => {
    expect(files.filter((f) => /(^|\/)\.env(\..*)?\.local$|(^|\/)\.env$/.test(f))).toEqual([]);
  });
});
