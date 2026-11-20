/**
 * @module @spark-appworks/spark-ai:class-model/tools/index
 * 职责：维护 DTS DtsTypeDeclarationModel 知识链路中的 tools 能力，围绕 模块入口、副作用注册或内部组合逻辑 提供声明投影、协议读取、知识查询或运行时适配。
 * 边界：只服务 .d.ts => JSON => guide 的知识索引链路，不直接执行业务页面逻辑。
 * AI用途：当需要判断 DtsTypeDeclarationModel 在 class-model/tools/index 这一段如何生成、加载或投影时，用本模块定位职责。
 */
export {
  CLASS_MODEL_TOOL_NAMES,
  isClassModelToolName,
} from './tool-names'

export type {
  ClassModelToolName,
} from './tool-names'

export {
  findClassModelToolSpec,
  listClassModelToolSpecs,
} from './class-model-tool-specs'

export type {
  ClassModelToolSpec,
} from './class-model-tool-specs'

export {
  buildClassModelToolSchemaRecoveryHint,
} from './class-model-tool-schema-recovery'

