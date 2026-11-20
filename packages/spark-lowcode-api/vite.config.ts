import { defineConfig } from 'vite'
import { isAbsolute, resolve } from 'path'

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        'contracts/index': resolve(__dirname, 'src/contracts/index.ts'),
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
