// tsconfig 의 "@/*" 경로 별칭을 테스트에서도 쓰게 한다 (app/ 라우트를 직접 불러 검사하는 테스트가 있다).
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
});
