import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'cad-lite-v*.js',
      'cad-lite-v*.css',
      'cad-lite-v*.html',
    ],
  },
  {
    files: ['src/**/*.ts', 'tests/**/*.ts', 'vite.config.ts', 'vitest.config.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      'no-undef': 'off',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
);
