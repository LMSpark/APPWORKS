/**
 * @module @spark-appworks/spark-ai:class-model/class-model/from-runtime-metadata
 * 职责：维护 DTS DtsTypeDeclarationModel 知识链路中的 from-runtime-metadata 能力，围绕 RuntimeDocumentInput 提供声明投影、协议读取、知识查询或运行时适配。
 * 边界：只服务 .d.ts => JSON => guide 的知识索引链路，不直接执行业务页面逻辑。
 * AI用途：当需要判断 DtsTypeDeclarationModel 在 class-model/class-model/from-runtime-metadata 这一段如何生成、加载或投影时，用本模块定位职责。
 */
import type { JsonSchemaObject } from '@spark-appworks/spark-json-document'
import type { AiRuntimeApiMetadataJson } from '../metadata'
import type { ClassModelDocument } from './types'
import { CLASS_MODEL_DOCUMENT_VERSION } from './types'

/** Runtime Document Input 的输入数据。 */
type RuntimeDocumentInput = Readonly<{
  /** 共享 JSON Schema 定义，映射为 ClassModelDocument.$defs。 */
  $defs?: Readonly<Record<string, JsonSchemaObject>>
  /** 运行时 API 元数据数组；首元素作为 ClassModelDocument.module（真源），缺失时 throw。 */
  modules: readonly AiRuntimeApiMetadataJson[]
}>

/** 输入适配：runtime metadata → ClassModelDocument（只存 module，不物化 models）。 */
export function createClassModelDocumentFromRuntimeDocument(
  document: RuntimeDocumentInput,
): ClassModelDocument {
  const module = document.modules[0]
  if (module === undefined) {
    throw new Error('DtsTypeDeclarationModel runtime document requires at least one runtime API metadata entry.')
  }
  return createClassModelDocumentFromRuntimeApiMetadata({
    module,
    ...(document.$defs === undefined ? {} : { schemaDefs: document.$defs }),
  })
}

export function createClassModelDocumentFromRuntimeApiMetadata(command: Readonly<{
  module: AiRuntimeApiMetadataJson
  schemaDefs?: Readonly<Record<string, JsonSchemaObject>>
}>): ClassModelDocument {
  return {
    schemaVersion: CLASS_MODEL_DOCUMENT_VERSION,
    rootKind: command.module.rootApi.kind,
    module: command.module,
    ...(command.schemaDefs === undefined ? {} : { $defs: command.schemaDefs }),
  }
}
