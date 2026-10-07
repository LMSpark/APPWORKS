/**
 * @module @spark-appworks/spark-ai:class-model/class-model/bundle/dts-bundle-url
 * 职责：DTS DtsTypeDeclarationModel bundle 的相对路径与 manifest URL 解析（纯字符串/URL，无 Node FS）。
 * 边界：供运行时 loader 与编译脚本共用；不得引入 node:path / node:fs / typescript。
 * AI用途：解析 manifest 相对 URL 或 bundle 文件相对路径时，用本模块保持与 guide shard 命名一致。
 */
import { sourceFileFromEmitPath } from './class-model-emit-path'

/** 将 manifest 源码键映射为 shard 相对路径（仅 `files/<native>.ts.json` / `*.vue.json`）。 */
export function dtsSourcePathToBundleRelativeJson(sourcePath: string): string {
  const normalized = sourceFileFromEmitPath(sourcePath.replace(/\\/g, '/'))
  return `files/${normalized}.json`
}

export function resolveDtsBundleRelativeUrl(manifestUrl: string, relativePath: string): string {
  return new URL(relativePath.replace(/\\/g, '/'), new URL(manifestUrl)).href
}
