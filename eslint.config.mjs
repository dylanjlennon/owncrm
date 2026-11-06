import { FlatCompat } from '@eslint/eslintrc';
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });
const config = [
  { ignores: ['.next/**','node_modules/**','next-env.d.ts','.e2e/**','public/**'] },
  ...compat.extends('next/core-web-vitals','next/typescript'),
  { rules: { '@typescript-eslint/no-explicit-any': 'off', '@typescript-eslint/no-require-imports': 'off' } },
];
export default config;
