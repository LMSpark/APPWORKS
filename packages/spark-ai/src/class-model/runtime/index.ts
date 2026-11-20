/**
 * @module @spark-appworks/spark-ai:class-model/runtime/index
 * 职责：维护 DTS DtsTypeDeclarationModel 知识链路中的 runtime 能力，围绕 模块入口、副作用注册或内部组合逻辑 提供声明投影、协议读取、知识查询或运行时适配。
 * 边界：只服务 .d.ts => JSON => guide 的知识索引链路，不直接执行业务页面逻辑。
 * AI用途：当需要判断 DtsTypeDeclarationModel 在 class-model/runtime/index 这一段如何生成、加载或投影时，用本模块定位职责。
 */
export {
  createClassModelDocumentFromRuntimeApiMetadata,
  createClassModelDocumentFromRuntimeDocument,
} from '../class-model/from-runtime-metadata'

export {
  ClassModelRuntime,
} from './class-model-runtime'

export type {
  ClassModelRuntimeOptions,
  ClassModelScriptCommand,
  ClassModelScriptExecutor,
  ClassModelScriptExecutorResult,
  ClassModelToolArgs,
  ClassModelToolCheck,
  ClassModelToolResult,
  ClassModelToolSpec,
} from './class-model-runtime'
