import { cpSync, existsSync, readFile, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, normalize, resolve } from 'node:path'
import type { Plugin } from 'vite'

const requireModule = createRequire(import.meta.url)
const { assertClassModelBundleComplete } = requireModule('../scripts/lib/class-model-bundle-assert.mjs')
const { buildDebugBreak } = requireModule('../scripts/lib/build-debug.mjs')

/** HTTP 前缀；与 src/class-model-artifacts/artifact-urls.ts 中 DTS_CLASS_MODEL_MANIFEST_PATH 对齐。 */
export const CLASS_MODEL_HTTP_PREFIX = '/dts-class-model'

/** 编译 SSOT（入库，开发可直接评审）；运行时由本插件映射到 CLASS_MODEL_HTTP_PREFIX。 */
export const CLASS_MODEL_GENERATED_DIR = 'generated/dts-class-model'

export type ClassModelStaticPluginOptions = Readonly<{
  generatedDir?: string
  httpPrefix?: string
}>

type ClassModelStaticRequest = Readonly<{
  url?: string | undefined
}>

type ClassModelStaticResponse = {
  destroyed: boolean
  statusCode: number
  writableEnded: boolean
  setHeader(name: string, value: number | string | readonly string[]): unknown
  end(chunk?: string | Uint8Array): unknown
}

/** Dev 静态映射 + 生产 build 拷贝 generated → dist/dts-class-model。 */
export function classModelStaticPlugin(options: ClassModelStaticPluginOptions = {}): Plugin {
  const httpPrefix = options.httpPrefix ?? CLASS_MODEL_HTTP_PREFIX
  let repoRoot = process.cwd()
  let distDir = resolve(repoRoot, 'dist')

  return {
    name: 'vite-plugin-class-model-static',
    configResolved(config) {
      repoRoot = config.root
      distDir = resolve(config.root, config.build.outDir)
    },
    configureServer(server) {
      const sourceDir = resolve(repoRoot, options.generatedDir ?? CLASS_MODEL_GENERATED_DIR)
      server.middlewares.use(createClassModelStaticMiddleware(sourceDir, httpPrefix))
    },
    closeBundle() {
      const sourceDir = resolve(repoRoot, options.generatedDir ?? CLASS_MODEL_GENERATED_DIR)
      buildDebugBreak('vite-plugin-class-model:closeBundle-before-assert', { sourceDir, distDir })
      assertClassModelBundleComplete(sourceDir)
      const targetDir = join(distDir, httpPrefix.slice(1))
      buildDebugBreak('vite-plugin-class-model:closeBundle-before-cpSync', { sourceDir, targetDir })
      cpSync(sourceDir, targetDir, { recursive: true })
      buildDebugBreak('vite-plugin-class-model:closeBundle-complete', { targetDir })
    },
  }
}

export function createClassModelStaticMiddleware(sourceDir: string, httpPrefix: string) {
  const normalizedPrefix = httpPrefix.endsWith('/') ? httpPrefix.slice(0, -1) : httpPrefix
  const resolvedSourceDir = resolve(sourceDir)

  return (req: ClassModelStaticRequest, res: ClassModelStaticResponse, next: (err?: unknown) => void) => {
    const requestUrl = req.url?.split('?')[0] ?? ''
    if (!requestUrl.startsWith(normalizedPrefix)) {
      next()
      return
    }

    const relativePath = requestUrl.slice(normalizedPrefix.length).replace(/^\//, '') || 'manifest.json'
    const safeRelative = normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '')
    const filePath = resolve(resolvedSourceDir, safeRelative)
    if (!filePath.startsWith(resolvedSourceDir)) {
      res.statusCode = 403
      res.end('Forbidden')
      return
    }
    if (!existsSync(filePath)) {
      next()
      return
    }
    const fileStat = statSync(filePath)
    if (fileStat.isDirectory()) {
      next()
      return
    }

    res.setHeader('Content-Type', contentTypeForPath(filePath))
    if (!canWriteResponse(res)) {
      next(new Error('ClassModel static middleware response is not writable or already ended.'))
      return
    }
    readFile(filePath, (error, content) => {
      if (error !== null) {
        next(error)
        return
      }
      res.end(content)
    })
  }
}

function canWriteResponse(res: ClassModelStaticResponse): boolean {
  return !res.writableEnded && !res.destroyed && typeof res.end === 'function'
}

function contentTypeForPath(filePath: string): string {
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8'
  if (filePath.endsWith('.log')) return 'text/plain; charset=utf-8'
  return 'application/octet-stream'
}
