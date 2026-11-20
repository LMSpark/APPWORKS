/**
 * @module @spark-appworks/spark-ai:class-model/class-model/bundle/dts-bundle-types
 * 职责：定义 DTS DtsTypeDeclarationModel bundle、per-file projection、module semantic metadata、duplicate record 和 semantic gap report 的持久化协议。
 * 边界：只维护 JSON 结构契约，不读取文件系统、不执行 TypeScript 投影，也不渲染知识提示词。
 * AI用途：修改 generated/dts-class-model 协议或消费 manifest/shard 时，用本模块确认字段含义和协议边界。
 */
import type { JsonSchemaObject } from '@spark-appworks/spark-json-document'
import type {
  DtsTypeDeclarationModel,
  ComponentClassModelLayer,
  ComponentClassModelLevel,
  ComponentProfileMeta,
  SourceProvenanceMeta,
} from '../types'

export const DTS_FILE_PROJECTION_VERSION = 3 as const
export const DTS_CLASS_MODEL_BUNDLE_PROTOCOL = 'spark-appworks.dts-class-model.bundle' as const
export const DTS_CLASS_MODEL_BUNDLE_VERSION = 1 as const

/** Dts File Projection Document 的语义模型。 */
export type DtsFileProjectionDocument = Readonly<{
  /** per-file 投影协议版本；与 bundle manifest 的 schemaVersion 独立演进。 */
  schemaVersion: typeof DTS_FILE_PROJECTION_VERSION
  /** 源码 repo 相对路径（如 packages/.../foo.ts）；与 manifest.files 索引键及 shard 路径一致。 */
  sourcePath: string
  /** 该 shard 的模块级语义元数据：名称、JSDoc、组件归属和导出 symbol 列表。 */
  module: DtsFileModuleSemanticMeta
  /** 本 shard 可进入全局 classIndex 的导出符号名列表；私有声明仍保留在 models。 */
  symbols: readonly string[]
  /** 本 shard 全部符号名 → 完整 DtsTypeDeclarationModel 投影，包含模块私有声明。 */
  models: Readonly<Record<string, DtsTypeDeclarationModel>>
  /** 对应源文件（module.sourceFile）最后修改时间 ISO；重编译时源码未改则保持不变。 */
  generatedAt?: string
}>

/** Dts File Projection Bundle Json 是写盘 shard 的精简形态；声明 schema 统一放入顶层 $defs。 */
export type DtsFileProjectionBundleJson = Readonly<{
  /** JSON Schema Draft 2020-12 标识；校验工具据此选择 schema 方言。 */
  $schema: 'https://json-schema.org/draft/2020-12/schema'
  /** per-file 投影协议版本，与 DtsFileProjectionDocument.schemaVersion 对齐。 */
  schemaVersion: typeof DTS_FILE_PROJECTION_VERSION
  /** 该 shard 的模块级语义元数据，与内存投影 document.module 一致。 */
  module: DtsFileModuleSemanticMeta
  /** 共享 JSON Schema 定义池；models 内各声明的 jsonSchema 通过 $ref 引用此字典以保证 shard 自包含。 */
  $defs: Readonly<Record<string, JsonSchemaObject>>
  /** 符号名 → 精简 model 载荷；强类型字段已剥离，仅保留 JSON 可序列化结构。 */
  models: Readonly<Record<string, unknown>>
  /** 对应源文件（module.sourceFile）最后修改时间 ISO；重编译时源码未改则保持不变。 */
  generatedAt?: string
}>

/** Dts File Module JsDoc Source 标记模块语义来自源码注释还是路径推导。 */
export type DtsFileModuleJsDocSource =
  | 'leading-jsdoc'
  | 'source-file-jsdoc'
  | 'inferred'

/** Dts File Module Semantic Meta 描述单个 DTS shard 的模块级入口语义。 */
export type DtsFileModuleSemanticMeta = Readonly<{
  /** 模块语义标识；monorepo 包内为 `packageName:modulePath`，workspace 根为 modulePath。 */
  name: string
  /** 源码 repo 相对路径；与 DtsFileProjectionDocument.sourcePath 及 manifest.files 键一致。 */
  sourcePath: string
  /** 对应 TypeScript/Vue 源文件的仓库相对路径；由 emit 路径反推，用于 gap 修复提示和组件归属推断。 */
  sourceFile: string
  /** monorepo 包名（如 `@spark-appworks/spark-ai`）；workspace 根 `src/` 下文件为 `app`，无法推断时为 undefined。 */
  packageName?: string
  /** 去掉 packages 包 src 前缀或 workspace src 前缀后的模块路径，不含扩展名。 */
  modulePath: string
  /** 模块级 JSDoc 正文；来自 leading-jsdoc、源文件注释或路径/symbol 推导。 */
  jsdoc: string
  /** jsdoc 字段的来源：leading-jsdoc = emit 文件首段注释，source-file-jsdoc = 源文件顶部注释，inferred = 自动推导。 */
  jsdocSource: DtsFileModuleJsDocSource
  /** 本 shard 导出的 DtsTypeDeclarationModel 符号名列表。 */
  symbols: readonly string[]
  /** SPARK 组件名；仅当 shard 对应 Vue/组件源文件且能解析组件目录时存在。 */
  componentName?: string
  /** 组件类型标签（如 container、field）；来自组件目录元数据。 */
  componentType?: string
  /** 组件在 UI 层级中的级别（table-level、field-level 等）。 */
  componentLevel?: ComponentClassModelLevel
  /** 组件在架构分层中的归属（layout-container、data-field 等）。 */
  componentLayer?: ComponentClassModelLayer
  /** 组件源码目录的仓库相对路径；用于 gap 报告和知识检索时的组件上下文。 */
  componentDirectory?: string
}>

/** Dts Class Model Bundle File Entry 的语义模型。 */
export type DtsClassModelBundleFileEntry = Readonly<{
  /** shard JSON 文件名（相对 generated/dts-class-model/files/）；不含目录前缀。 */
  file: string
  /** 该 shard 的模块级语义元数据快照，与 manifest 构建时内存投影一致。 */
  module: DtsFileModuleSemanticMeta
}>

/** Dts Class Model Bundle Class Entry 的语义模型。 */
export type DtsClassModelBundleClassEntry = Readonly<{
  /** 声明所在 shard 的 emit `.d.ts` 仓库相对路径；classIndex 的主键之一。 */
  sourcePath: string
  /** 承载该 class 声明的 shard JSON 文件名；loader 据此定位 models 载荷。 */
  file: string
}>

/** Dts Class Model Bundle Component Entry 是 componentIndex.entries 的规范化行。 */
export type DtsClassModelBundleComponentEntry = Readonly<{
  /** DtsTypeDeclarationModel className；也是 componentIndex.entries 的键。 */
  className: string
  /** 声明所在源码路径；与 manifest.files/sourcePath 对齐。 */
  sourcePath: string
  /** 承载该 class 声明的 shard JSON 文件名。 */
  file: string
  /** 可查询组件画像；仅包含 query/guide 实际消费的字段。 */
  component: ComponentProfileMeta
}>

/** Dts Class Model Bundle Component Index：entries 是表，by* 是倒排索引。 */
export type DtsClassModelBundleComponentIndex = Readonly<{
  /** className → component entry，保存一次完整行。 */
  entries: Readonly<Record<string, DtsClassModelBundleComponentEntry>>
  /** component.name → className[]。 */
  byName: Readonly<Record<string, readonly string[]>>
  /** component.type → className[]。 */
  byType: Readonly<Record<string, readonly string[]>>
  /** component.level → className[]，如 table-level / row-level / field-level。 */
  byLevel: Readonly<Record<string, readonly string[]>>
  /** component.layer → className[]，如 data-view-container / row-scope / data-field。 */
  byLayer: Readonly<Record<string, readonly string[]>>
  /** component.directory → className[]。 */
  byDirectory: Readonly<Record<string, readonly string[]>>
}>

/** Dts Class Model Bundle Manifest 的语义模型。 */
export type DtsClassModelBundleManifest = Readonly<{
  /** bundle 协议版本；loader 据此判断是否需要迁移或拒绝不兼容 manifest。 */
  schemaVersion: typeof DTS_CLASS_MODEL_BUNDLE_VERSION
  /** 协议标识常量，固定为 `spark-appworks.dts-class-model.bundle`。 */
  protocol: typeof DTS_CLASS_MODEL_BUNDLE_PROTOCOL
  /** 扫描到的 emit `.d.ts` 文件总数；含被 duplicate 跳过的文件。 */
  scannedFileCount: number
  /** sourcePath → 文件条目；索引每个 shard 的 JSON 文件名和模块语义。 */
  files: Readonly<Record<string, DtsClassModelBundleFileEntry>>
  /** className → 类条目；跨 shard 全局索引，duplicate 时仅保留 keptFile 对应条目。 */
  classIndex: Readonly<Record<string, DtsClassModelBundleClassEntry>>
  /** 组件查询倒排索引；让 table-level/row-level/field-level 等查询无需扫全量 shard。 */
  componentIndex?: DtsClassModelBundleComponentIndex
  /** 同名 class 冲突记录；manifest 构建时后者被跳过，仅保留 keptFile。 */
  duplicates?: readonly DtsClassModelDuplicateRecord[]
}>

/** Dts Class Model Duplicate Record 的记录结构。 */
export type DtsClassModelDuplicateRecord = Readonly<{
  /** 发生冲突的 DtsTypeDeclarationModel 符号名。 */
  className: string
  /** 保留在 classIndex 中的 shard 路径；manifest 构建时先遇者优先。 */
  keptFile: string
  /** 被跳过的 shard 路径；该文件中的同名声明不会进入 classIndex。 */
  skippedFile: string
}>

/** Dts Class Model Semantic Gap Kind 的语义模型。 */
export type DtsClassModelSemanticGapKind =
  | 'module'
  | 'model'
  | 'constructor'
  | 'attribute'
  | 'method'

/** Dts Class Model Semantic Gap 的语义模型。 */
export type DtsClassModelSemanticGap = Readonly<{
  /** 缺口层级：module = 模块 JSDoc，model = 类型声明，constructor/attribute/method = 成员级。 */
  kind: DtsClassModelSemanticGapKind
  /** 缺口所属 DtsTypeDeclarationModel 符号名；module 级缺口时为模块 name。 */
  className: string
  /** 缺口所属模块语义标识；module 级缺口时与 className 相同，成员级缺口时可选。 */
  moduleName?: string
  /** 成员级缺口时的属性/方法/constructor 名；module 和 model 级缺口时为 undefined。 */
  memberName?: string
  /** 缺口原因：missing-jsdoc = 无注释，inferred-module-jsdoc = 路径推导，weak-module-jsdoc = 注释过弱。 */
  reason: 'missing-jsdoc' | 'inferred-module-jsdoc' | 'weak-module-jsdoc'
  /** 人类可读的语义链断点描述；说明哪一环缺少 JSDoc 或语义不足。 */
  chainBreak: string
  /** 修复指引：指向应补 JSDoc 的源文件路径和后续 generate 命令。 */
  fixHint: string
  /** 缺口在 class-model-emit `.d.ts` 中的声明文件路径（仓库相对）。 */
  declarationFile: string
  /** 缺口在 declarationFile 中的行号（1-based）。 */
  declarationLine: number
  /** 应补 JSDoc 的 TypeScript/Vue 源文件路径（仓库相对）；由 declarationFile 反推。 */
  sourceFile: string
  /** 缺口所属 SPARK 组件名；仅组件 shard 存在。 */
  componentName?: string
  /** 缺口所属组件类型标签。 */
  componentType?: string
  /** 缺口所属组件 UI 级别。 */
  componentLevel?: ComponentClassModelLevel
  /** 缺口所属组件架构分层。 */
  componentLayer?: ComponentClassModelLayer
  /** 缺口所属组件源码目录。 */
  componentDirectory?: string
  /** 缺口所属声明种类；与 SourceProvenanceMeta.declarationKind 对齐。 */
  declarationKind?: NonNullable<SourceProvenanceMeta['declarationKind']>
}>

/** Dts Class Model Semantic Gap Report 的语义模型。 */
export type DtsClassModelSemanticGapReport = Readonly<{
  /** gaps 数组长度；与 manifest 构建或 audit 扫描结果一致。 */
  gapCount: number
  /** 报告级说明（如扫描范围、已知限制）；不参与逐条 gap 修复。 */
  notes: readonly string[]
  /** 逐条语义缺口记录；按 className 和 memberName 排序供 CI 或人工修复。 */
  gaps: readonly DtsClassModelSemanticGap[]
}>

/** Project Dts File Projection Options 的调用配置。 */
export type ProjectDtsFileProjectionOptions = Readonly<{
  /** monorepo 仓库根目录绝对路径；用于将 absolutePath 归一化为仓库相对 sourcePath。 */
  repoRoot: string
  /** 待投影的 emit `.d.ts` 文件绝对路径。 */
  absolutePath: string
  /** 为 true 时仅投影 export 导出的顶层声明；默认 false 包含非 export 声明。 */
  exportedOnly?: boolean
}>
