import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts']
  },
  resolve: {
    alias: {
      '@spark-appworks/spark-data': resolve(__dirname, './src/index.ts'),
      '@spark-appworks/spark-data/*': resolve(__dirname, './src/*'),
      '@spark-appworks/spark-utils': resolve(__dirname, '../spark-utils/src/index.ts'),
      '@spark-appworks/spark-utils/*': resolve(__dirname, '../spark-utils/src/*'),
      '@spark-appworks/spark-json-document/schema': resolve(__dirname, '../spark-json-document/src/schema/index.ts'),
      '@spark-appworks/spark-json-document/tree': resolve(__dirname, '../spark-json-document/src/tree/index.ts'),
      '@spark-appworks/spark-json-document': resolve(__dirname, '../spark-json-document/src/index.ts'),
    }
  }
})