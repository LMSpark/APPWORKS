import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts']
  },
  resolve: {
    alias: [
      { find: /^@spark-appworks\/spark-ai\/agent$/, replacement: resolve(__dirname, '../spark-ai/src/agent/index.ts') },
      { find: /^@spark-appworks\/spark-ai\/class-model$/, replacement: resolve(__dirname, '../spark-ai/src/class-model/index.ts') },
      { find: /^@spark-appworks\/spark-ai$/, replacement: resolve(__dirname, '../spark-ai/src/index.ts') },
      { find: /^@spark-appworks\/spark-utils$/, replacement: resolve(__dirname, '../spark-utils/src/index.ts') },
      { find: /^@spark-appworks\/spark-data$/, replacement: resolve(__dirname, '../spark-data/src/index.ts') },
      { find: /^@spark-appworks\/spark-project-model$/, replacement: resolve(__dirname, '../spark-project-model/src/index.ts') },
      { find: /^@spark-appworks\/spark-json-document$/, replacement: resolve(__dirname, '../spark-json-document/src/index.ts') },
      { find: /^@spark-appworks\/spark-app$/, replacement: resolve(__dirname, './src/index.ts') },
      { find: /^@spark-appworks\/spark-app\/(.*)$/, replacement: resolve(__dirname, './src/$1') },
    ]
  }
})
