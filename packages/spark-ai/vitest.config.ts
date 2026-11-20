import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '@spark-appworks/spark-json-document': resolve(root, '../spark-json-document/src/index.ts'),
      '@spark-appworks/spark-utils/internal': resolve(root, '../spark-utils/src/internal/index.ts'),
      '@spark-appworks/spark-utils': resolve(root, '../spark-utils/src/index.ts'),
    },
  },
})
