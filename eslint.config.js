// @ts-check
import eslint from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/*.orphan-root/**",
      "**/.pnpm-store/**",
      "**/coverage/**",
      "drizzle/**",
      "drizzle.config.ts",
      "data/generated/**",
      "prettier.config.js",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  prettier,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parserOptions: {
        project: "./tsconfig.json",
        projectService: false,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  {
    files: ["**/*.test.ts", "**/*.int.test.ts", "packages/testing/**"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "no-console": "off",
    },
  },
  {
    files: ["eslint.config.js"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      parserOptions: {
        project: null,
        tsconfigRootDir: undefined,
        projectService: false,
      },
    },
  },
  {
    files: ["drizzle.config.ts", "vitest.config.ts", "scripts/**"],
    rules: {
      "no-console": "off",
    },
  },
);
