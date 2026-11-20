import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    setupFiles: ['./src/tests/vitest-setup.ts']
  },
  resolve: {
    alias: {
      '@spark-appworks/spark-component': resolve(__dirname, './src/index.ts'),
      '@spark-appworks/spark-component/*': resolve(__dirname, './src/*'),
      '@spark-appworks/spark-utils/internal': resolve(__dirname, '../spark-utils/src/internal/index.ts'),
      '@spark-appworks/spark-utils': resolve(__dirname, '../spark-utils/src/index.ts'),
      '@spark-appworks/spark-utils/*': resolve(__dirname, '../spark-utils/src/*'),
      '@spark-appworks/spark-data': resolve(__dirname, '../spark-data/src/index.ts'),
      '@spark-appworks/spark-json-document': resolve(__dirname, '../spark-json-document/src/index.ts'),
      '@spark-appworks/spark-project-model': resolve(__dirname, '../spark-project-model/src/index.ts'),
      '@spark-appworks/spark-ai/agent': resolve(__dirname, '../spark-ai/src/agent/index.ts'),
      '@spark-appworks/spark-ai': resolve(__dirname, '../spark-ai/src/index.ts')
    }
  }
})
