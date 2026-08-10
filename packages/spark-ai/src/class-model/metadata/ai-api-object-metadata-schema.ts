/**
 * @module @spark-appworks/spark-ai:class-model/metadata/ai-api-object-metadata-schema
 * 职责：维护 @spark-appworks/spark-ai 中 class-model/metadata/ai-api-object-metadata-schema 的 AiApiActionFailureMode、AiApiActionExample、AiApiActionAntiExample 等 11 个公开类型语义。
 * 边界：只服务 spark-ai 包内部的 Agent/DtsTypeDeclarationModel 能力，不直接耦合应用页面或 Vue 组件。
 * AI用途：定位 spark-ai 公共 API、运行时协议或知识索引字段时，用本模块作为语义入口。
 */

import type { JsonSchema, JsonSchemaObject, JsonValue } from '@spark-appworks/spark-json-document'

/** Ai Api Action Failure Mode 的语义模型。 */
export type AiApiActionFailureMode = Readonly<{
  /** 错误码（LLM 可见，用于识别失败类型）。 */
  code: string
  /** 发生条件（自然语言描述何时触发此错误）。 */
  when: string
  /** 修复建议（LLM 在失败后可参考的恢复步骤）。 */
  fix: string
}>

/** Ai Api Action Example 的语义模型。 */
export type AiApiActionExample = Readonly<{
  /** 用户输入示例，可用于判断触发条件。 */
  user?: string
  /** 示例意图说明。 */
  intent?: string
  /** 业务 action 参数示例。 */
  args?: JsonValue
  /** 完整调用示例，通常展示 model_script 对象链或 tool arguments。 */
  call?: JsonValue
}>

/** Ai Api Action Anti Example 的语义模型。 */
export type AiApiActionAntiExample = Readonly<{
  /** 用户输入或场景示例。 */
  user?: string
  /** 不应调用该 action 的原因。 */
  reason: string
  /** 容易误传的参数示例。 */
  args?: JsonValue
}>

/** 从源码 JSDoc 原样拷贝的语义块；源码 JSDoc 是 SSOT，generated JSON 只是缓存快照。 */
export type AiApiJsDocMetadata = string

/** 反射来源；file/line 指向源码声明，typeEntryFile 仅记录可能的 .d.ts 类型入口。 */
export type AiApiSourceProvenanceMetadata = Readonly<{
  /** 源码文件路径（相对 repoRoot 或 emit 路径）。 */
  file: string
  /** 声明所在源码行号（1-based）。 */
  line: number
  /** 声明所属 class/interface/type 名。 */
  className: string
  /** 成员级溯源时的属性/方法名；类型级溯源时为 undefined。 */
  memberName?: string
  /** 可能的 .d.ts 类型入口路径，与 file 可能不同。 */
  typeEntryFile?: string
}>

/** API 对象元数据（根对象或 action 返回的嵌套对象）。 */
export type AiApiObjectMetadata = Readonly<{
  /** API kind 标识，脚本与 registry 中的唯一键。 */
  kind: string
  /** 对外展示名，通常与 kind 一致。 */
  name: string
  /** 面向 LLM 的简短说明。 */
  description: string
  /** 从源码 JSDoc 原样拷贝的语义块。 */
  jsdoc?: AiApiJsDocMetadata
  /** 反射溯源，指向源码声明位置。 */
  provenance?: AiApiSourceProvenanceMetadata
  /** 可选构造函数元数据。 */
  constructorSignature?: AiApiConstructorMetadata
  /** 该 API 对象可调用的 action 列表。 */
  actions: readonly AiApiActionMetadata[]
  /** 可读/可写属性元数据列表。 */
  attributes?: readonly AiApiAttributeMetadata[]
}>

/** API 对象构造函数元数据。 */
export type AiApiConstructorMetadata = Readonly<{
  /** 构造函数面向 LLM 的说明。 */
  description: string
  /** 从源码 JSDoc 原样拷贝的语义块。 */
  jsdoc?: AiApiJsDocMetadata
  /** 反射溯源，指向源码声明位置。 */
  provenance?: AiApiSourceProvenanceMetadata
  /** 构造参数 JSON Schema（object 形态）。 */
  paramsSchema: JsonSchemaObject
}>

/** API 属性元数据。 */
export type AiApiAttributeMetadata = Readonly<{
  /** 属性名，脚本 object 链上的键。 */
  name: string
  /** 面向 LLM 的简短说明。 */
  description: string
  /** 从源码 JSDoc 原样拷贝的语义块。 */
  jsdoc?: AiApiJsDocMetadata
  /** 反射溯源，指向源码声明位置。 */
  provenance?: AiApiSourceProvenanceMetadata
  /** 属性值 JSON Schema。 */
  schema: JsonSchema
  /** LLM/脚本是否可读该属性。 */
  readable: boolean
  /** LLM/脚本是否可写该属性。 */
  writable: boolean
  /** 子 API kind；标量对象与集合属性均指向元素/值类型的 API（schema.type=array 表示集合）。 */
  api?: AiApiObjectMetadata
}>

/** API action 元数据。 */
export type AiApiActionMetadata = Readonly<{
  /** action 对外名称，script 上下文中的 callable 键。 */
  name: string
  /** 业务 class 上实际调用的 methodName。 */
  methodName: string
  /** 可选完整方法签名文本，供 guide 投影。 */
  signatureText?: string
  /** 面向 LLM 的简短说明。 */
  description: string
  /** 从源码 JSDoc 原样拷贝的语义块。 */
  jsdoc?: AiApiJsDocMetadata
  /** 反射溯源，指向源码声明位置。 */
  provenance?: AiApiSourceProvenanceMetadata
  /** 调用参数 JSON Schema（object 形态）。 */
  paramsSchema: JsonSchemaObject
  /** 是否将 AiNativePathContext 作为首参注入 method。 */
  takesContext?: boolean
  /** 返回值 JSON Schema。 */
  resultSchema?: JsonSchema
  /** action 返回值中嵌套 API 对象的引用列表。 */
  resultApis?: readonly AiApiResultApiRef[]
  /** 调用前须遵守的使用规则（自然语言）。 */
  usageRules?: readonly string[]
  /** 调用前必须先完成的 action 名列表。 */
  requiredBeforeCall?: readonly string[]
  /** 已知失败模式与修复建议。 */
  failureModes?: readonly AiApiActionFailureMode[]
  /** 单参数示例；多示例场景优先 examples。 */
  example?: JsonValue
  /** 多组调用示例。 */
  examples?: readonly AiApiActionExample[]
  /** 不应调用的反例与原因。 */
  antiExamples?: readonly AiApiActionAntiExample[]
}>

/** action 返回值中的 API-bearing 对象引用（runtime 紧凑格式用 $ref，解析后为 api）。 */
export type AiApiResultApiRef = Readonly<{
  /** 从 result.data 到 API 对象实例的路径；空数组表示 result.data 本身。 */
  resultPath: readonly string[]
  /** 嵌套 API 对象元数据；紧凑 runtime JSON 中可由 $ref 替代。 */
  api?: AiApiObjectMetadata
  /** 紧凑 runtime JSON：指向 apiRegistry 中的 API kind。 */
  $ref?: string
}>

/** 运行时 API 元数据：由 DTS DtsTypeDeclarationModel 或显式注册入口投影出脚本可执行的 API surface。 */
export type AiRuntimeApiMetadataJson = Readonly<{
  /** runtime metadata 格式版本：1 内联嵌套，2 使用 apiRegistry 去重。 */
  schemaVersion: 1 | 2
  /** 脚本入口 root API 对象元数据。 */
  rootApi: AiApiObjectMetadata
  /** schemaVersion=2 时：按 kind 去重后的 action 返回 API 注册表。 */
  apiRegistry?: Readonly<Record<string, AiApiObjectMetadata>>
}>
