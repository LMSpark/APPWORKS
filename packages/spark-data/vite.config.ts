import { defineConfig } from 'vite'
import { resolve, isAbsolute } from 'path'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
    },
    emptyOutDir: true,
    rollupOptions: {
      // 外部化所有非相对路径的导入（库构建标准做法）
      external: (id) => !id.startsWith('.') && !id.startsWith('\0') && !isAbsolute(id),
      output: {
        preserveModules: true,
        preserveModulesRoot: 'src',
        dir: 'dist',
        entryFileNames: '[name].js',
      },
    },
  },
})
