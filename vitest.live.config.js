import { defineConfig } from "vitest/config";

// Live tests against dblp.org (`npm run test:live`). Kept apart from the unit
// tests so `npm test` never needs the network.
export default defineConfig({
  test: {
    include: ["tests/live/**/*.test.js"],
  },
});
