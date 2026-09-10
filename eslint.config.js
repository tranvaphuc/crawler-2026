import globals from 'globals';

const rules = {
  'no-unused-vars': 'warn',
  'no-undef': 'error',
};

export default [
  {
    ignores: ['node_modules/**', 'dist/**', '.cache/**', 'output/**', 'outputs/**'],
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
    rules,
  },
  {
    files: ['**/*.cjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules,
  },
  {
    files: ['src/scrapers/batdongsan.js', 'test/batdongsan-detail.js'],
    languageOptions: {
      globals: globals.browser,
    },
  },
];
