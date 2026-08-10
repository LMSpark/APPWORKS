import baseConfig from '../../eslint.config.js'
import tsParser from '@typescript-eslint/parser'

export default [
  ...baseConfig,
  {
    files: ['src/**/*.{ts,tsx,js}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {},
  },
]
