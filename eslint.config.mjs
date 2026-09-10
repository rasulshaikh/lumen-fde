import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

/**
 * One rule, and it is here because it has already cost something.
 *
 * `aim` was added to the provider's `useMemo` body and not to its dependency array, so the context
 * object never recomputed. The button label, the aria-pressed state, the card border, the card
 * ordering and the Overview marker all read a stale snapshot; only the one consumer reading a ref
 * worked. The commit that introduced it was itself a fix for a dead control, and it shipped, passed
 * tsc, passed a build and passed fifteen test suites, because none of those can see a stale memo.
 *
 * `react-hooks/exhaustive-deps` is the rule written for exactly that, and this project had no lint
 * configured at all, so it had never run. It is an error rather than a warning: a warning nobody
 * fails on is the same as no rule, and this codebase has already learned that lesson once with
 * "this list is now exhaustive" as a comment with nothing checking it.
 *
 * Deliberately narrow. This is not a style pass over 40 files; it is one guard against one class of
 * defect that silently produces a UI which looks correct and is not.
 */
export default tseslint.config(
  { ignores: [".tmp/**", ".next/**", "node_modules/**", "reports/**", "data/**", "scripts/**", "mcp/**"] },
  {
    files: ["app/**/*.tsx", "app/**/*.ts", "components/**/*.tsx", "lib/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true }, sourceType: "module" },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/exhaustive-deps": "error",
      "react-hooks/rules-of-hooks": "error",
    },
  },
);
