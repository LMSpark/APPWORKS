/**
 * @module @spark-appworks/spark-ai:class-model/class-model/dts-surface-types
 * 职责：维护 DTS DtsTypeDeclarationModel 知识链路中的 dts-surface-types 能力，围绕 DtsClassModelSurfaceDocument、ProjectDtsClassModelSurfaceOptions 提供声明投影、协议读取、知识查询或运行时适配。
 * 边界：只服务 .d.ts => JSON => guide 的知识索引链路，不直接执行业务页面逻辑。
 * AI用途：当需要判断 DtsTypeDeclarationModel 在 class-model/class-model/dts-surface-types 这一段如何生成、加载或投影时，用本模块定位职责。
 */
import type { DtsTypeDeclarationModel } from './types'
import type { ClassModelEmitSource } from './bundle/class-model-emit-path'

export const DTS_CLASS_MODEL_SURFACE_VERSION = 1 as const

/** Dts Class Model Surface Document 的语义模型。 */
export type DtsClassModelSurfaceDocument = Readonly<{
  /** surface 文档格式版本，与 bundle shard 的 schemaVersion 独立演进。 */
  schemaVersion: typeof DTS_CLASS_MODEL_SURFACE_VERSION
  /** 投影来源标识，区分 emit 路径与生成策略。 */
  source: ClassModelEmitSource
  /** 触发 surface 投影的配置文件路径（相对 repoRoot）。 */
  configPath: string
  /** 按 className 索引的 DtsTypeDeclarationModel 快照。 */
  models: Readonly<Record<string, DtsTypeDeclarationModel>>
  /** 源文件路径到该文件导出 className 列表的反向索引。 */
  fileIndex: Readonly<Record<string, readonly string[]>>
  /** ISO 8601 生成时间戳；离线 bundle 可省略。 */
  generatedAt?: string
}>

/** Project Dts Class Model Surface Options 的调用配置。 */
export type ProjectDtsClassModelSurfaceOptions = Readonly<{
  /** 投影配置文件路径，决定 rootFiles 与 emit 范围。 */
  configPath: string
  /** true 时跳过 Vue 组件 .vue.d.ts，只投影 TS 声明。 */
  skipVueComponentDts?: boolean
  /** true 时只保留 export 可见的 declaration symbol。 */
  exportedOnly?: boolean
  /** true 时遇到跨文件 className 重复立即失败。 */
  failOnDuplicate?: boolean
}>
