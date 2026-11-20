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
      '@spark-appworks/spark-utils': resolve(__dirname, './src/index.ts'),
      '@spark-appworks/spark-utils/*': resolve(__dirname, './src/*')
    }
  }
})