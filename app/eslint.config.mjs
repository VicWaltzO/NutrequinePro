import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "dist/**",
    "dist-node/**",
    ".wrangler/**",
    ".sites-runtime/**",
    "coverage/**",
  ]),
  {
    files: ["{app,features,shared,lib,db}/**/*.{ts,tsx,mts,mjs,js,jsx}"],
    rules: {
      "one-var": ["error", "never"],
      "no-duplicate-imports": ["error", { allowSeparateTypeImports: true }],
    },
  },
  {
    files: ["{app,features,shared,lib,db}/**/*.{ts,mts,mjs,js}"],
    rules: {
      "no-nested-ternary": "error",
    },
  },
  {
    files: ["components/ui/**/*.{ts,tsx}", "hooks/use-mobile.ts"],
    rules: {
      // These files are vendored verbatim from shadcn@4.17.0. Keep the
      // registry source intact while applying the stricter rules to Site code.
      "@typescript-eslint/no-unused-vars": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
