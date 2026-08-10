import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'packages/spark-ai/src/tests/**/*.test.ts',
    ],
  },
  resolve: {
    alias: {
      '@spark-appworks/spark-ai/agent': resolve(root, './packages/spark-ai/src/agent/index.ts'),
      '@spark-appworks/spark-ai/class-model': resolve(root, './packages/spark-ai/src/class-model/index.ts'),
      '@spark-appworks/spark-ai': resolve(root, './packages/spark-ai/src/index.ts'),
      '@spark-appworks/spark-json-document': resolve(root, './packages/spark-json-document/src/index.ts'),
      '@spark-appworks/spark-data': resolve(root, './packages/spark-data/src/index.ts'),
      '@spark-appworks/spark-utils/internal': resolve(root, './packages/spark-utils/src/internal/index.ts'),
      '@spark-appworks/spark-utils': resolve(root, './packages/spark-utils/src/index.ts'),
    },
  },
})
