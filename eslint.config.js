import js from "@eslint/js";
import tseslint from "typescript-eslint";
import sonarjs from "eslint-plugin-sonarjs";

export default tseslint.config(
  {
    ignores: [
      "src-tauri/",
      "dist/",
      "node_modules/",
      "src/vite-env.d.ts",
      "vite.config.ts",
      "vitest.config.ts",
      "eslint.config.js",
    ],
  },

  js.configs.recommended,

  ...tseslint.configs.recommended,

  sonarjs.configs.recommended,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      complexity: ["warn", { max: 15 }],
      "sonarjs/cognitive-complexity": ["warn", 15],
      "max-len": [
        "warn",
        {
          code: 120,
          ignoreUrls: true,
          ignoreStrings: true,
          ignoreTemplateLiterals: true,
          ignoreRegExpLiterals: true,
        },
      ],
      "max-lines": [
        "warn",
        { max: 300, skipBlankLines: true, skipComments: true },
      ],
      "sonarjs/todo-tag": "off",
      "sonarjs/pseudo-random": "off",
    },
  },

  {
    files: ["**/*.test.ts", "**/*.test.tsx", "src/test/**"],
    rules: {
      "max-lines": "off",
      "sonarjs/no-duplicate-string": "off",
      "sonarjs/no-identical-functions": "off",
      "sonarjs/assertions-in-tests": "warn",
    },
  },
);
