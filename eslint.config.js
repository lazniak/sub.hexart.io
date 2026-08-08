// @ts-check
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/*.config.js',
      '**/*.config.mjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },

  // Guard 1 — the projector renders onto a live broadcast. No HTML injection, ever.
  {
    files: ['apps/web/app/projector/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'Projector output goes on air. Render text via textContent only.',
        },
        {
          selector: "MemberExpression[property.name='innerHTML']",
          message: 'Projector output goes on air. Render text via textContent only.',
        },
      ],
    },
  },

  // Guard 2 — pure packages must stay pure so they remain deterministically testable.
  {
    files: ['packages/caption-engine/src/**/*.ts', 'packages/billing/src/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'Pure package: no I/O. Inject results as parameters.' },
        { name: 'localStorage', message: 'Pure package: no I/O.' },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['node:*', 'fs', 'path', 'http', 'https', 'net'], message: 'Pure package: no I/O.' },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Date', property: 'now', message: 'Pure package: inject the clock as a parameter.' },
      ],
    },
  },
)
