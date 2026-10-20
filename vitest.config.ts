import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'jsdom',
    testTimeout: 15_000,
    hookTimeout: 60_000,
    include: ['tests/**/*.test.ts', 'packages/**/src/tests/**/*.test.ts', 'packages/**/tests/**/*.test.ts'],
    setupFiles: ['./tests/vitest-setup.ts']
  },
  resolve: {
    alias: {
      '@': resolve(root, './src'),
      'virtual:spark-components': resolve(root, './tests/support/mocks/virtual-spark-components.ts'),
      // 所有包 → 源码解析（测试不应依赖 dist）；底座链须先 utils 再 json-document（后者 workspace 依赖前者）。
      // --- spark-utils（HTTP / Logger / 导航与权限基础类型）---
      '@spark-appworks/spark-utils/internal': resolve(root, './packages/spark-utils/src/internal/index.ts'),
      '@spark-appworks/spark-utils': resolve(root, './packages/spark-utils/src/index.ts'),
      // --- spark-json-document（JSON Schema / 文档树 SSOT；依赖 spark-utils）---
      '@spark-appworks/spark-json-document/schema': resolve(root, './packages/spark-json-document/src/schema/index.ts'),
      '@spark-appworks/spark-json-document/tree': resolve(root, './packages/spark-json-document/src/tree/index.ts'),
      '@spark-appworks/spark-json-document': resolve(root, './packages/spark-json-document/src/index.ts'),
      '@spark-appworks/spark-component/runtime': resolve(root, './packages/spark-component/src/runtime/index.ts'),
      '@spark-appworks/spark-component': resolve(root, './packages/spark-component/src/index.ts'),
      '@spark-appworks/spark-data': resolve(root, './packages/spark-data/src/index.ts'),
      '@spark-appworks/spark-lowcode-api/contracts': resolve(root, './packages/spark-lowcode-api/src/contracts/index.ts'),
      '@spark-appworks/spark-lowcode-api': resolve(root, './packages/spark-lowcode-api/src/index.ts'),
      '@spark-appworks/spark-project-model': resolve(root, './packages/spark-project-model/src/index.ts'),
      '@spark-appworks/spark-app': resolve(root, './packages/spark-app/src/index.ts'),
      '@spark-appworks/spark-ai/agent': resolve(root, './packages/spark-ai/src/agent/index.ts'),
      '@spark-appworks/spark-ai/class-model': resolve(root, './packages/spark-ai/src/class-model/index.ts'),
      '@spark-appworks/spark-ai': resolve(root, './packages/spark-ai/src/index.ts'),
      '@spark-appworks/vite-plugin-spark-catalog': resolve(root, './packages/vite-plugin-spark-catalog/src/index.ts')
    }
  },
  esbuild: {
    target: 'node14'
  }
})
