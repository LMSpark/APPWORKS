import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
  },
  resolve: {
    alias: {
      '@spark-appworks/spark-data': resolve(__dirname, '../spark-data/src/index.ts'),
      '@spark-appworks/spark-lowcode-api': resolve(__dirname, './src/index.ts'),
      '@spark-appworks/spark-lowcode-api/contracts': resolve(__dirname, './src/contracts/index.ts'),
      '@spark-appworks/spark-utils': resolve(__dirname, '../spark-utils/src/index.ts'),
    },
  },
})
