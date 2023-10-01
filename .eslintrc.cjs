/* eslint-env node */
module.exports = {
  env: {
    browser: true,
    es2022: true,
  },
  extends: [
    'plugin:@typescript-eslint/recommended-type-checked',
    'plugin:@typescript-eslint/stylistic-type-checked',
  ],
  plugins: ['@typescript-eslint'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: ['./tsconfig.eslint.json'],
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  rules: {
    // Note: you must disable the base rule as it can report incorrect errors
    'space-before-function-paren': 'off',
    '@typescript-eslint/space-before-function-paren': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-return': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unsafe-argument': 'off',
  },
  root: true,
}
