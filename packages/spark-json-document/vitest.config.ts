import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

const pkgRoot = resolve(import.meta.dirname)

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/tests/**/*.test.ts', 'src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@spark-appworks/spark-utils/internal': resolve(pkgRoot, '../spark-utils/src/internal/index.ts'),
      '@spark-appworks/spark-utils': resolve(pkgRoot, '../spark-utils/src/index.ts'),
      '@spark-appworks/spark-json-document/schema': resolve(pkgRoot, './src/schema/index.ts'),
      '@spark-appworks/spark-json-document/tree': resolve(pkgRoot, './src/tree/index.ts'),
      '@spark-appworks/spark-json-document': resolve(pkgRoot, './src/index.ts'),
    },
  },
})
