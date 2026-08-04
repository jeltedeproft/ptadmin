import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

/**
 * Deliberately narrow.
 *
 * This is not here to police style — the point is the rules-of-hooks check.
 * A hook placed after an early return renders a different number of hooks on
 * the first pass than on the second, which React reports as error #310 and the
 * user sees as a black screen. It typechecks and builds cleanly, so nothing
 * else in the pipeline catches it. That happened once; this makes it fail the
 * build instead.
 */
export default tseslint.config(
  { ignores: ["dist", "node_modules", ".smoke.mjs", ".import.mjs", "data"] },
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // Handled by tsc, and noisier here than it is useful.
      "no-undef": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
);
