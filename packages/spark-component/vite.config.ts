import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve, isAbsolute } from 'path'

/**
 * spark-component 库模式构建配置
 *
 * 使用 vite build --lib + preserveModules 保证：
 * 1. Vue SFC 被 @vitejs/plugin-vue 正确编译为带 render 函数的 JS（而非 vue-tsc 的 type-aug stub）
 * 2. 各模块保持独立文件，支持 tree-shaking
 * 3. 外部依赖（vue、@spark-appworks/* 等）不被打包进去
 *
 * 构建顺序（见 package.json "build" script）：
 *   1. vite build → 生成 dist/**‌/*.js
 *   2. vue-tsc --emitDeclarationOnly → 生成 dist/**‌/*.d.ts（追加，不清理 js）
 */
export default defineConfig({
  plugins: [vue()],
  // 禁用 PostCSS 配置文件自动搜索，避免 Windows BOM 导致的 JSON 解析错误
  css: { postcss: {} },
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        'runtime/index': resolve(__dirname, 'src/runtime/index.ts'),
      },
      formats: ['es'],
    },
    // 清空旧产物（.d.ts 由后续 vue-tsc 步骤追加）
    emptyOutDir: true,
    rollupOptions: {
      // 外部化所有非相对路径的导入（库构建标准做法）
      external: (id) => !id.startsWith('.') && !id.startsWith('\0') && !isAbsolute(id),
      output: {
        // 保留模块文件结构，与源码目录对应
        preserveModules: true,
        preserveModulesRoot: 'src',
        dir: 'dist',
        // .vue 文件输出为 PageRenderer.vue.js（与 index.js 中 import './PageRenderer.vue' 匹配）
        entryFileNames: '[name].js',
      },
    },
  },
})
