/**
 * @module app:services/class-model-artifacts/artifact-urls
 * 职责：提供主应用 ClassModel 静态 bundle 的 HTTP manifest URL。
 * 边界：只解析发布路径；bundle 真源在 generated/dts-class-model/（入库，可人工评审）。
 * AI用途：Worker 按需 fetch shard 时，用本模块定位 manifest 入口 URL。
 */

/** HTTP 路径；Vite 插件将 generated/dts-class-model 映射到此前缀。 */
export const DTS_CLASS_MODEL_MANIFEST_PATH = '/dts-class-model/manifest.json' as const

/** 运行时解析 manifest 绝对 URL；必须在调用时执行，勿在模块顶层缓存。 */
export function getDtsClassModelManifestUrl(origin?: string | URL): string {
  return new URL(DTS_CLASS_MODEL_MANIFEST_PATH, resolveManifestBaseOrigin(origin)).href
}

function resolveManifestBaseOrigin(explicit?: string | URL): string | URL {
  if (explicit !== undefined) return explicit

  const browserOrigin = readBrowserOrigin()
  if (browserOrigin !== undefined) return browserOrigin

  const envOrigin = readConfiguredOrigin()
  if (envOrigin !== undefined) return envOrigin

  throw new Error(
    'Cannot resolve ClassModel manifest origin. Open the app in a browser, pass origin to getDtsClassModelManifestUrl(), or set VITE_DEV_SERVER_ORIGIN / SPARK_FE_ORIGIN.',
  )
}

function readBrowserOrigin(): string | undefined {
  if (typeof globalThis === 'undefined' || !('location' in globalThis)) return undefined
  const origin = globalThis.location.origin
  if (typeof origin !== 'string' || origin.length === 0 || origin === 'null') return undefined
  return origin
}

function readConfiguredOrigin(): string | undefined {
  const viteOrigin = readOptionalText(import.meta.env['VITE_DEV_SERVER_ORIGIN'])
  if (viteOrigin !== undefined) return viteOrigin

  const nodeEnv = readProcessEnv('SPARK_FE_ORIGIN') ?? readProcessEnv('VITE_DEV_SERVER_ORIGIN')
  if (nodeEnv !== undefined) return nodeEnv

  return undefined
}

function readOptionalText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function readProcessEnv(key: string): string | undefined {
  if (typeof process === 'undefined') return undefined
  const value = process.env[key]
  return readOptionalText(value)
}
