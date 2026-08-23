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
      "@progression": r("./services/progression"),
    },
  },
  test: {
    /*
     * src/ is in here for the rules that live in the UI layer and are still
     * plain data -- the nav's tab order against the slide order, say. Most of
     * what src/ does needs a browser and belongs to tools/flows.mjs; this lane
     * is for the handful of invariants that do not, and would otherwise have no
     * gate at all.
     *
     * .tsx as well as .ts: TABS lives in a component file, because a second
     * module holding one array is how the two lists drift apart again.
     */
    include: [
      "packages/**/*.test.ts",
      "services/**/*.test.ts",
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
    ],
  },
});
