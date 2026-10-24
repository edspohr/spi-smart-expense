import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

const sharedRules = {
  'no-unused-vars': ['error', {
    varsIgnorePattern: '^[A-Z_]',
    argsIgnorePattern: '^[A-Z_]|^_',
  }],
  // Truly empty `catch {}` blocks fail lint. Catches with a comment
  // are allowed per ESLint's own semantics (comments count as content),
  // so the convention is: either call `logger.*` or leave a comment
  // explaining why silence is safe.
  'no-empty': ['error', { allowEmptyCatch: false }],
  // React Compiler rules from eslint-plugin-react-hooks 7.x flag 18 spots in
  // the monolithic pages (ExpenseForm, AdminApprovals...). Re-enable when
  // those components are decomposed — see TD-023 in docs/technical-debt.md.
  'react-hooks/set-state-in-effect': 'off',
  'react-hooks/refs': 'off',
  'react-hooks/immutability': 'off',
}

export default defineConfig([
  globalIgnores(['dist', '.firebase', 'node_modules', 'coverage', '_backup', 'public', 'functions']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: sharedRules,
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      ...sharedRules,
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', {
        varsIgnorePattern: '^[A-Z_]',
        argsIgnorePattern: '^[A-Z_]|^_',
      }],
    },
  },
])
