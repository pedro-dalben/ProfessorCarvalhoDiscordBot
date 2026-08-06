import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    exclude: ["**/node_modules/**", "**/*.orphan-root/**", "**/dist/**", "**/coverage/**"],
    alias: {
      "@bigbangcraft/config": fileURLToPath(
        new URL("./packages/config/src/index.ts", import.meta.url),
      ),
      "@bigbangcraft/domain": fileURLToPath(
        new URL("./packages/domain/src/index.ts", import.meta.url),
      ),
      "@bigbangcraft/observability": fileURLToPath(
        new URL("./packages/observability/src/index.ts", import.meta.url),
      ),
      "@bigbangcraft/pokemon-data": fileURLToPath(
        new URL("./packages/pokemon-data/src/index.ts", import.meta.url),
      ),
      "@bigbangcraft/cobblemon-data": fileURLToPath(
        new URL("./packages/cobblemon-data/src/index.ts", import.meta.url),
      ),
      "@bigbangcraft/csa-integration": fileURLToPath(
        new URL("./packages/csa-integration/src/index.ts", import.meta.url),
      ),
      "@bigbangcraft/discord-ui": fileURLToPath(
        new URL("./packages/discord-ui/src/index.ts", import.meta.url),
      ),
      "@bigbangcraft/database": fileURLToPath(
        new URL("./packages/database/src/index.ts", import.meta.url),
      ),
      "@bigbangcraft/queue": fileURLToPath(
        new URL("./packages/queue/src/index.ts", import.meta.url),
      ),
      "@bigbangcraft/testing": fileURLToPath(
        new URL("./packages/testing/src/index.ts", import.meta.url),
      ),
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      // A cobertura é aferida nos pacotes centrais da integração CSA.
      // (pokemon-data, cobblemon-data, discord-ui/commands e bot-api/worker
      // possuem cobertura parcial e serão tratados em fase dedicada.)
      include: ["packages/csa-integration/src/**/*.ts", "packages/domain/src/**/*.ts"],
      exclude: [
        "**/dist/**",
        "**/*.test.ts",
        "**/*.int.test.ts",
        "packages/testing/**",
        "**/drizzle/**",
        "**/*.config.ts",
      ],
      thresholds: {
        lines: 85,
        functions: 85,
        statements: 85,
        branches: 80,
      },
    },
  },
});
