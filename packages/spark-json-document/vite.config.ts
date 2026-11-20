import { defineConfig } from 'vite'
import { isAbsolute, resolve } from 'node:path'

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        'schema/index': resolve(__dirname, 'src/schema/index.ts'),
        'tree/index': resolve(__dirname, 'src/tree/index.ts'),
      },
      formats: ['es'],
    },
    emptyOutDir: true,
    rollupOptions: {
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
