import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: [
      { find: /^@spark-appworks\/spark-data$/, replacement: resolve(__dirname, '../spark-data/src/index.ts') },
      { find: /^@spark-appworks\/spark-utils$/, replacement: resolve(__dirname, '../spark-utils/src/index.ts') },
      { find: /^@spark-appworks\/spark-utils\/internal$/, replacement: resolve(__dirname, '../spark-utils/src/internal/index.ts') },
      { find: /^@spark-appworks\/spark-project-model$/, replacement: resolve(__dirname, './src/index.ts') },
    ],
  },
})
