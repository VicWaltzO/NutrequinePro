import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import hooks from "eslint-plugin-react-hooks";
import accessibility from "eslint-plugin-jsx-a11y";
import globals from "globals";

const eslintConfig = defineConfig([
  globalIgnores([
    "node_modules/**",
    "outputs/**",
    "work/**",
    "demo-linkedin/**",
    "vendor/**",
    ".next/**",
    ".vinext/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "dist/**",
    "dist-node/**",
    "dist-client/**",
    ".wrangler/**",
    ".sites-runtime/**",
    "coverage/**",
  ]),
  {
    files: ["**/*.{js,mjs,ts,mts,tsx,jsx}"],
    extends: [js.configs.recommended],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: { "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }] },
  },
  {
    files: ["**/*.{ts,mts,tsx}"],
    extends: [tseslint.configs.recommended],
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }],
    },
  },
  {
    files: ["**/*.{tsx,jsx}"],
    extends: [
      react.configs.flat.recommended,
      react.configs.flat["jsx-runtime"],
      hooks.configs.flat.recommended,
      accessibility.flatConfigs.recommended,
    ],
    settings: { react: { version: "19.2" } },
    rules: { "react/prop-types": "off" },
  },
  { files: ["**/*.{ts,mts}"], extends: [hooks.configs.flat.recommended] },
  {
    files: ["{client,features,shared,lib,db,server}/**/*.{ts,tsx,mts,mjs,js,jsx}"],
    rules: {
      "one-var": ["error", "never"],
      "no-duplicate-imports": ["error", { allowSeparateTypeImports: true }],
    },
  },
  {
    files: ["{client,features,shared,lib,db,server}/**/*.{ts,mts,mjs,js}"],
    rules: {
      "no-nested-ternary": "error",
    },
  },
]);

export default eslintConfig;
