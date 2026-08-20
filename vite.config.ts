import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@sim": r("./packages/sim/src"),
      "@contracts": r("./contracts"),
      "@catalog": r("./services/catalog"),
    },
  },
  test: {
    include: ["packages/**/*.test.ts", "services/**/*.test.ts"],
  },
});
