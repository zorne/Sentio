// @ts-check
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";

export default [
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/node_modules/**",
      // Sortie de construction et code recopié : la source est ailleurs, la corriger ici ne
      // servirait à personne (docs/adr/0023).
      "**/.svelte-kit/**",
      "**/build/**",
      "supabase/functions/_generated/**",
      // Engendré par Next à chaque construction, jamais écrit à la main.
      "apps/vitrine/next-env.d.ts",
    ],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      // Le préfixe `_` est une déclaration d'intention, pas une échappatoire :
      // il dit « ce paramètre est imposé par la signature et je ne m'en sers
      // pas ». Sans lui, la seule façon de satisfaire la règle serait de
      // casser la signature, ou de désactiver le contrôle ligne par ligne.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
];
