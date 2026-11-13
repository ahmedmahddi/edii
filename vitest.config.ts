import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: { testTimeout: 20_000, exclude: [...configDefaults.exclude, "tests/e2e/**"] },
});
