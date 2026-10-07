/**
 * @module @spark-appworks/spark-ai:class-model/class-model/bundle/class-model-emit-fs
 * 职责：读取 DtsTypeDeclarationModel 内存 emit 对应源文件的 mtime，用于增量生成判断。
 * 边界：只服务 Node 编译期投影链路；运行时、浏览器入口和 Worker loader 不得导入本模块。
 * AI用途：排查增量 bundle 为什么重建或跳过某个 .d.ts shard 时，用本模块确认源文件时间戳读取规则。
 */
import { statSync } from 'node:fs'
import { resolve } from 'node:path'
import { sourceFileFromEmitPath } from './class-model-emit-path'

type ReadSourceModifiedAtIsoCommand = Readonly<{
  repoRoot: string
  emitSourcePath: string
  /** manifest / .dts-manifest 记录的源路径，优先于 emit 键推导。 */
  sourceFile?: string
}>

/** 读取 emit 虚拟键对应源文件的最后修改时间（ISO）；源文件不存在时返回 undefined。 */
export function readSourceModifiedAtIso(command: ReadSourceModifiedAtIsoCommand): string | undefined {
  const sourceRelativePath = command.sourceFile ?? sourceFileFromEmitPath(command.emitSourcePath)
  const absolutePath = resolve(command.repoRoot, sourceRelativePath)
  try {
    return statSync(absolutePath).mtime.toISOString()
  } catch {
    return undefined
  }
}
