import { defineConfig, loadEnv, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { fileURLToPath } from 'node:url'
import { sparkComponentsPlugin } from './tools/vite-plugin-spark-components'
import { classModelStaticPlugin } from './tools/vite-plugin-class-model-static'
import {
  COMPONENT_SCAN_PATTERNS,
  COMPONENT_EXCLUDE_PATTERNS,
  SYNC_COMPONENTS,
  ASYNC_COMPONENTS,
  SIZE_THRESHOLD
} from './packages/vite-plugin-spark-catalog/src/scan-config'

const root = fileURLToPath(new URL('.', import.meta.url))
const viteCacheDir = process.env['VITE_CACHE_DIR'] ?? path.resolve(root, 'node_modules', '.vite')
const utf8TextMediaTypes = new Set([
  'application/javascript',
  'application/json',
  'application/x-javascript',
  'text/css',
  'text/html',
  'text/javascript',
])

function appendUtf8Charset(contentType: string): string {
  const mediaType = contentType.split(';', 1)[0]?.trim().toLowerCase()
  if (!mediaType || !utf8TextMediaTypes.has(mediaType) || /;\s*charset=/iu.test(contentType)) {
    return contentType
  }
  return `${contentType}; charset=utf-8`
}

function withUtf8Charset(value: number | string | readonly string[]): number | string | readonly string[] {
  if (typeof value === 'string') return appendUtf8Charset(value)
  if (Array.isArray(value)) return value.map(item => appendUtf8Charset(item))
  return value
}

function utf8TextResponsePlugin(): Plugin {
  return {
    name: 'spark:utf8-text-response',
    configureServer(server) {
      server.middlewares.use((_req, res, next) => {
        const setHeader = res.setHeader.bind(res)
        res.setHeader = (name, value) => {
          if (name.toLowerCase() === 'content-type') {
            return setHeader(name, withUtf8Charset(value))
          }
          return setHeader(name, value)
        }
        next()
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((_req, res, next) => {
        const setHeader = res.setHeader.bind(res)
        res.setHeader = (name, value) => {
          if (name.toLowerCase() === 'content-type') {
            return setHeader(name, withUtf8Charset(value))
          }
          return setHeader(name, value)
        }
        next()
      })
    },
  }
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, root, '')
  const lowcodeGatewayUrl = env['LOWCODE_GATEWAY_URL']?.trim()
  if (command === 'serve' && !lowcodeGatewayUrl) {
    throw new Error('LOWCODE_GATEWAY_URL 未配置，拒绝启动：开发态 /api 必须明确代理到 lowcode gateway')
  }

  return {
  cacheDir: viteCacheDir,
  resolve: {
    alias: {
      '@': path.resolve(root, 'src'),
      // monorepo 内始终指向 src 源码——Vite 直接编译 TS，无需预构建 dist JS
      // dist 仅包含 .d.ts 类型声明，供外部 npm 消费者使用
      '@spark-appworks/spark-component/runtime': path.resolve(root, 'packages', 'spark-component', 'src', 'runtime', 'index.ts'),
      '@spark-appworks/spark-component': path.resolve(root, 'packages', 'spark-component', 'src', 'index.ts'),
      '@spark-appworks/spark-data': path.resolve(root, 'packages', 'spark-data', 'src', 'index.ts'),
      '@spark-appworks/spark-lowcode-api': path.resolve(root, 'packages', 'spark-lowcode-api', 'src', 'index.ts'),
      '@spark-appworks/spark-utils/internal': path.resolve(root, 'packages', 'spark-utils', 'src', 'internal', 'index.ts'),
      '@spark-appworks/spark-utils': path.resolve(root, 'packages', 'spark-utils', 'src', 'index.ts'),
      '@spark-appworks/spark-json-document': path.resolve(root, 'packages', 'spark-json-document', 'src', 'index.ts'),
      '@spark-appworks/spark-project-model': path.resolve(root, 'packages', 'spark-project-model', 'src', 'index.ts'),
      '@spark-appworks/spark-app': path.resolve(root, 'packages', 'spark-app', 'src', 'index.ts'),
      '@spark-appworks/spark-ai/json': path.resolve(root, 'packages', 'spark-ai', 'src', 'json', 'index.ts'),
      '@spark-appworks/spark-ai/agent': path.resolve(root, 'packages', 'spark-ai', 'src', 'agent', 'index.ts'),
      '@spark-appworks/spark-ai/class-model': path.resolve(root, 'packages', 'spark-ai', 'src', 'class-model', 'index.ts'),
      '@spark-appworks/spark-ai': path.resolve(root, 'packages', 'spark-ai', 'src', 'index.ts'),
    }
  },
  optimizeDeps: {
    include: ['vxe-table']
  },
  server: {
    port: 5273,
    strictPort: true,
    proxy: {
      // 开发态所有 /api 请求只代理到显式配置的 lowcode gateway。
      '/api': {
        target: lowcodeGatewayUrl ?? 'http://127.0.0.1',
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            if (req.headers.accept?.includes('text/event-stream') === true) {
              proxyReq.removeHeader('Accept-Encoding')
            }
          })
          proxy.on('proxyRes', (proxyRes) => {
            const contentType = proxyRes.headers['content-type']
            if (typeof contentType === 'string' && contentType.includes('text/event-stream')) {
              proxyRes.headers['X-Accel-Buffering'] = 'no'
              proxyRes.headers['Cache-Control'] = 'no-cache, no-transform'
            }
          })
        },
      },
    }
  },
  plugins: [
    utf8TextResponsePlugin(),

    vue({
      include: /\.(vue)$/,
    }),

    sparkComponentsPlugin({
      // 使用统一配置源
      patterns: [...COMPONENT_SCAN_PATTERNS],
      syncComponents: [...SYNC_COMPONENTS],
      asyncComponents: [...ASYNC_COMPONENTS],
      sizeThreshold: SIZE_THRESHOLD,
      exclude: [...COMPONENT_EXCLUDE_PATTERNS],
      verbose: false
    } satisfies Parameters<typeof sparkComponentsPlugin>[0]),

    // ClassModel JSON：dev/build 均直接读 generated/dts-class-model（入库 SSOT，便于评审）
    classModelStaticPlugin(),
  ],
  build: {
    rollupOptions: {
      output: {
        chunkFileNames: 'js/[name]-[hash].js',
        entryFileNames: 'js/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          const name = assetInfo.name
          if (!name) return 'assets/[name]-[hash].[ext]'

          if (/\.(png|jpe?g|gif|svg|ico)$/i.test(name)) {
            return 'images/[name]-[hash].[ext]'
          }
          if (/\.css$/i.test(name)) {
            return 'css/[name]-[hash].[ext]'
          }
          if (/\.(woff2?|ttf|eot)$/i.test(name)) {
            return 'fonts/[name]-[hash].[ext]'
          }
          return 'assets/[name]-[hash].[ext]'
        },
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/')

          // Vue核心库
          if (normalizedId.includes('vue/dist') || normalizedId.includes('vue/index') || normalizedId === 'vue') {
            return 'vue-core'
          }
          // Vue Router
          if (normalizedId.includes('vue-router')) {
            return 'vue-router'
          }
          // Element Plus UI库（拆分 runtime / components，避免单块过大）
          if (normalizedId.includes('/node_modules/@element-plus/icons-vue/')) {
            return 'element-plus-icons'
          }
          if (normalizedId.includes('/node_modules/element-plus/')) {
            if (normalizedId.includes('/es/components/')) {
              const componentMatch = normalizedId.match(/\/es\/components\/([^/]+)\//)
              const componentName = componentMatch?.[1]
              if (!componentName) return 'element-plus-components-misc'
              const firstCharCode = componentName.charCodeAt(0)
              if (firstCharCode < 106) return 'element-plus-components-a-i'
              if (firstCharCode < 115) return 'element-plus-components-j-r'
              return 'element-plus-components-s-z'
            }
            if (normalizedId.includes('/es/directives/')) return 'element-plus-directives'
            if (normalizedId.includes('/es/locale/')) return 'element-plus-locale'
            if (
              normalizedId.includes('/es/hooks/')
              || normalizedId.includes('/es/utils/')
            ) {
              return 'element-plus-runtime'
            }
            if (
              normalizedId.includes('/es/constants/')
              || normalizedId.includes('/es/tokens/')
            ) {
              return 'element-plus-tokens'
            }
            if (normalizedId.includes('/es/')) return 'element-plus-core'
            return 'element-plus'
          }


          // ── 智能路由级代码分割 ──
          // 基于文件路径进行更细粒度的分割，提高缓存命中率

          // SPARK packages - 按功能模块分割
          // ⚠️ spark-utils 必须独立 chunk：它是 spark-data 和 spark-component 的共同依赖，
          //    若不单独分配，Rollup 可能将 spark-utils 模块分入 spark-component chunk，
          //    导致 spark-data chunk 反向引用 spark-component chunk（虚假循环依赖）。
          if (normalizedId.includes('packages/spark-json-document')) {
            return 'spark-json-document'
          }
          if (normalizedId.includes('packages/spark-utils')) {
            return 'spark-utils'
          }
          if (normalizedId.includes('packages/spark-component')) {
            return 'spark-component'
          }
          if (normalizedId.includes('packages/spark-data')) {
            return 'spark-data'
          }
          if (normalizedId.includes('packages/spark-lowcode-api')) {
            return 'spark-lowcode-api'
          }
          if (normalizedId.includes('packages/spark-ai')) {
            return 'spark-ai'
          }
          if (normalizedId.includes('packages/spark-app')) {
            return 'spark-app'
          }
          if (normalizedId.includes('packages/spark-project-model')) {
            return 'spark-config'
          }

          // ── 页面组件懒加载分组 ──
          // 将大型页面组件分组，便于按需加载

          // 数据密集型页面（包含大量图表/表格）
          if (normalizedId.includes('views/app/Dashboard') || normalizedId.includes('views/app/CapabilityDemo')) {
            return 'pages-data-heavy'
          }
          // 配置管理页面
          if (normalizedId.includes('views/tenant/Settings') || normalizedId.includes('views/tenant/TenantConfig')) {
            return 'pages-config'
          }
          // ── 第三方库智能分组 ──

          // 表单和验证库
          if (normalizedId.includes('async-validator') || normalizedId.includes('vxe-table')) {
            return 'vendor-forms'
          }

          // 编辑器生态（CodeMirror / Lezer）
          if (
            normalizedId.includes('/node_modules/@codemirror/')
            || normalizedId.includes('/node_modules/@lezer/')
            || normalizedId.includes('/node_modules/codemirror/')
            || normalizedId.includes('/node_modules/crelt/')
            || normalizedId.includes('/node_modules/w3c-keyname/')
          ) {
            return 'vendor-editor'
          }

          // JSON 编辑器
          if (
            normalizedId.includes('/node_modules/vanilla-jsoneditor/')
            || normalizedId.includes('/node_modules/svelte-jsoneditor/')
            || normalizedId.includes('/node_modules/jsonrepair/')
          ) {
            return 'vendor-jsoneditor'
          }

          // Node modules通用处理
          if (normalizedId.includes('node_modules')) {
            return 'vendor'
          }

          return undefined
        }
      }
    },
    chunkSizeWarningLimit: 1000
  }
  }
})
