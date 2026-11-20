/**
 * @module @spark-appworks/spark-ai:class-model/class-model/types
 * 职责：维护 DTS DtsTypeDeclarationModel 知识链路中的 types 能力，围绕 ClassModelDocument、SourceProvenanceMeta、ComponentClassModelLevel 等 11 个公开契约 提供声明投影、协议读取、知识查询或运行时适配。
 * 边界：只服务 .d.ts => JSON => guide 的知识索引链路，不直接执行业务页面逻辑。
 * AI用途：当需要判断 DtsTypeDeclarationModel 在 class-model/class-model/types 这一段如何生成、加载或投影时，用本模块定位职责。
 */
import type { JsonSchema, JsonSchemaObject } from '@spark-appworks/spark-json-document'
import type { AiRuntimeApiMetadataJson } from '../metadata'

/** DtsTypeDeclarationModel 投影版本；它独立于 runtime API metadata 的 schemaVersion。 */
export const CLASS_MODEL_DOCUMENT_VERSION = 1 as const

/**
 * DtsTypeDeclarationModel 文档：只保留 module 真源，不预存 models 索引。
 *
 * LLM 可见的 DtsTypeDeclarationModel 在 guide 投影时按 attribute 链从 module 按需派生；
 * 连通性由 auditClassModelReflectionConnectivity 验证。
 */
export type ClassModelDocument = Readonly<{
  /** 投影格式版本，与 runtime API metadata 的 schemaVersion 独立演进；bundle loader 据此判断是否需要迁移。 */
  schemaVersion: typeof CLASS_MODEL_DOCUMENT_VERSION
  /** 根节点语义标识；当前固定为 'module'，预留未来扩展为 'package' 等粒度。 */
  rootKind: string
  /** 知识链路真源：所有 DtsTypeDeclarationModel 按 attribute 链从此 module 按需派生，不预存 models 索引。 */
  module: AiRuntimeApiMetadataJson
  /** Draft 2020-12 共享定义；当 jsonSchema 使用 $ref 引用内部子 schema 时，被引用的片段存在此字典中以保证 bundle 自包含。 */
  $defs?: Readonly<Record<string, JsonSchemaObject>>
}>

/** Source Provenance Meta 的语义模型。 */
export type SourceProvenanceMeta = Readonly<{
  /** 声明在 class-model-emit `.d.ts` 中的文件路径（仓库相对）；gap 报告和 loader 溯源的主键。 */
  file: string
  /** 声明在 file 中的行号（1-based）；用于 fixHint 精确定位补 JSDoc 位置。 */
  line: number
  /** 声明所属的 DtsTypeDeclarationModel 符号名；成员级溯源时与 model.name 一致。 */
  className: string
  /** 成员级溯源时为属性/方法名；类型级溯源（整个 class/interface）时为 undefined。 */
  memberName?: string
  /** 类型声明入口文件路径，与 file 可能不同（如 re-export 场景 file 是消费方，typeEntryFile 是声明方）。 */
  typeEntryFile?: string
  /** SPARK 组件名；仅当声明来自组件源文件且能解析组件目录时存在。 */
  componentName?: string
  /** 组件类型标签（如 container、field）；来自组件目录元数据。 */
  componentType?: string
  /** 组件在 UI 层级中的级别（table-level、field-level 等）。 */
  componentLevel?: ComponentClassModelLevel
  /** 组件在架构分层中的归属（layout-container、data-field 等）。 */
  componentLayer?: ComponentClassModelLayer
  /** 组件源码目录的仓库相对路径；用于知识检索和 gap 报告的组件上下文。 */
  componentDirectory?: string
  /** 声明种类：class/interface/typeAlias/enum 等；与 DtsTypeDeclarationKind 及 value/namespace 声明区分。 */
  declarationKind?: 'class' | 'interface' | 'typeAlias' | 'enum' | 'function' | 'const' | 'component'
}>

/** Component Profile Meta 是持久化 JSON 中保留的组件检索画像，只包含 guide/query 实际消费的字段。 */
export type ComponentProfileMeta = Readonly<{
  /** SPARK 组件名；用于 query keyword、guide 组件上下文和组件检索结果。 */
  name?: string
  /** 组件类型标签（如 container、field、r-table）；来自组件目录或 Props 名推断。 */
  type?: string
  /** 组件在 UI 层级中的级别（table-level、field-level 等）。 */
  level?: ComponentClassModelLevel
  /** 组件在架构分层中的归属（layout-container、data-field 等）。 */
  layer?: ComponentClassModelLayer
  /** 组件源码目录；用于 guide 中表达组件上下文。 */
  directory?: string
}>

/** Component Class Model Level 的语义模型。 */
export type ComponentClassModelLevel =
  | 'table-level'
  | 'row-level'
  | 'container'
  | 'field-level'
  | 'display'
  | 'infrastructure'

/** Component Class Model Layer 的语义模型。 */
export type ComponentClassModelLayer =
  | 'data-view-container'
  | 'row-scope'
  | 'layout-container'
  | 'zone-container'
  | 'data-field'
  | 'field-support'
  | 'data-display'
  | 'static-display'
  | 'editor'
  | 'support'

/** Class Model Declaration Relation Kind 的语义模型。 */
export type ClassModelDeclarationRelationKind =
  | 'alias'
  | 'intersection'
  | 'union'
  | 'extends'
  | 'implements'

/** Class Model Declaration Relation 的语义模型。 */
export type ClassModelDeclarationRelation = Readonly<{
  /** 关系种类：extends/implements 表示继承，alias/union/intersection 表示类型组合。 */
  kind: ClassModelDeclarationRelationKind
  /** 原始类型文本，保留 extends/implements 后的完整类型表达式，供 LLM 在无法解析 targetName 时回退阅读。 */
  typeText: string
  /** 可解析的目标符号名；当 typeText 是复杂表达式（泛型、交叉）无法提取单一符号时为 undefined。 */
  targetName?: string
}>

/** DTS type-space declaration kind；对应官方 Declaration Files 中会创建 type name 的声明。 */
export type DtsTypeDeclarationKind =
  | 'class'
  | 'interface'
  | 'typeAlias'
  | 'enum'

/** DTS Type Declaration Base：所有 type-space 声明共享的最小身份和文档字段。 */
export type DtsTypeDeclarationBase<TDeclarationKind extends DtsTypeDeclarationKind> = Readonly<{
  /** 声明模型的唯一名称：class/interface/type/enum 的导出符号名。 */
  name: string
  /** 类型级 JSDoc 正文；guide 投影和 semantic gap audit 的语义链起点。 */
  jsdoc: JsDocMeta
  /** type-space 声明种类；判别 DtsTypeDeclarationModel 联合分支和 payload 结构。 */
  declarationKind: TDeclarationKind
  /** bundle shard 持久化的 Draft 2020-12 独立校验文档。 */
  jsonSchema?: JsonSchemaObject
  /** guide/query 实际消费的组件画像；替代持久化 provenance 中的 component* 冗余字段。 */
  component?: ComponentProfileMeta
  /** 声明在 emit `.d.ts` 和源文件中的溯源信息；gap 报告和 fixHint 定位依赖此字段。 */
  provenance?: SourceProvenanceMeta
}>

/** Class Declaration Members 的语义模型。 */
export type ClassDeclarationMembers = Readonly<{
  /** class 实例属性/字段的 AttributeMeta 列表；含 public/protected 及 accessor。 */
  attributes: readonly AttributeMeta[]
  /** class 实例方法的 MethodMeta 列表；不含 static 方法（若 emit 分离则不在此数组）。 */
  methods: readonly MethodMeta[]
}>

/** Interface Declaration Members 的语义模型。 */
export type InterfaceDeclarationMembers = Readonly<{
  /** interface 属性签名列表；对应 TypeDoc PropertySignature。 */
  attributes: readonly AttributeMeta[]
  /** interface 方法签名列表；对应 TypeDoc MethodSignature。 */
  methods: readonly MethodMeta[]
}>

/** Type Alias Declaration Members 的语义模型。 */
export type TypeAliasDeclarationMembers = Readonly<{
  /** 从 type alias 对象类型/交叉类型解构出的属性列表；纯别名无成员时为空数组。 */
  attributes: readonly AttributeMeta[]
  /** 从 type alias 对象类型/交叉类型解构出的方法列表；纯别名无成员时为空数组。 */
  methods: readonly MethodMeta[]
}>

/** Class Declaration Payload 的语义模型。 */
export type ClassDeclarationPayload = Readonly<{
  /** 构造函数元数据：签名、参数 schema 和 JSDoc；class 声明必有且仅有一个。 */
  constructorMeta: ConstructorMeta
  /** extends/implements 关系列表；无继承时为 undefined 或空数组。 */
  declarationRelations?: readonly ClassModelDeclarationRelation[]
  /** class 成员集合：attributes 与 methods 分区存放。 */
  members: ClassDeclarationMembers
}>

/** Interface Declaration Payload 的语义模型。 */
export type InterfaceDeclarationPayload = Readonly<{
  /** extends 关系列表；interface 仅支持 extends，不支持 implements。 */
  declarationRelations?: readonly ClassModelDeclarationRelation[]
  /** interface 成员集合：attributes 与 methods 分区存放。 */
  members: InterfaceDeclarationMembers
}>

/** Type Alias Declaration Payload 的语义模型。 */
export type TypeAliasDeclarationPayload = Readonly<{
  /** 类型别名右侧的原始 TypeScript 类型文本；无法解构成员时 LLM 回退阅读此字段。 */
  declarationTypeText: string
  /** 交叉/联合/extends 关系列表；纯别名无关系时为 undefined。 */
  declarationRelations?: readonly ClassModelDeclarationRelation[]
  /** 从对象类型解构出的成员；纯 primitive 别名时 attributes/methods 均为空。 */
  members: TypeAliasDeclarationMembers
}>

/** Enum Declaration Payload 的语义模型。 */
export type EnumDeclarationPayload = Readonly<{
  /** 枚举成员列表；每个成员复用 AttributeMeta 承载 name、literal schema 和 JSDoc。 */
  members: readonly AttributeMeta[]
}>

/** Class Declaration Model 的语义模型。 */
export type ClassDeclarationModel =
  & DtsTypeDeclarationBase<'class'>
  & Readonly<{
    /** class 专属载荷：constructor、继承关系和成员分区。 */
    classDecl: ClassDeclarationPayload
  }>

/** Interface Declaration Model 的语义模型。 */
export type InterfaceDeclarationModel =
  & DtsTypeDeclarationBase<'interface'>
  & Readonly<{
    /** interface 专属载荷：extends 关系和成员分区。 */
    interfaceDecl: InterfaceDeclarationPayload
  }>

/** Type Alias Declaration Model 的语义模型。 */
export type TypeAliasDeclarationModel =
  & DtsTypeDeclarationBase<'typeAlias'>
  & Readonly<{
    /** type alias 专属载荷：原始类型文本、关系和解构成员。 */
    typeAlias: TypeAliasDeclarationPayload
  }>

/** Enum Declaration Model 的语义模型。 */
export type EnumDeclarationModel =
  & DtsTypeDeclarationBase<'enum'>
  & Readonly<{
    /** enum 专属载荷：成员名和 literal 值列表。 */
    enumDecl: EnumDeclarationPayload
  }>

/** guide 投影时的 type-space 声明视图；按 declarationKind 判别，不承载 value/namespace 声明。 */
export type DtsTypeDeclarationModel =
  | ClassDeclarationModel
  | InterfaceDeclarationModel
  | TypeAliasDeclarationModel
  | EnumDeclarationModel

/** Js Doc Meta 的语义模型。 */
export type JsDocMeta = string

/** Constructor Meta 的语义模型。 */
export type ConstructorMeta = Readonly<{
  /** 构造函数完整签名字符串；与 emit `.d.ts` 中 constructor 声明文本一致。 */
  signatureText?: string
  /** 调用约定：positional = 按位置传参，named = 对象解构传参（影响 paramsSchema 的结构：positional 是 tuple，named 是 object）。 */
  parameterStyle?: MethodParameterStyle
  /** 构造函数形参列表；按 TypeDoc ParameterReflection 投影，含 name 和 DtsTypeMeta。 */
  parameters?: readonly MethodParameterMeta[]
  /** 参数 JSON Schema；positional 风格为 tuple schema，named 风格为 object schema，用于 LLM 工具调用时的参数校验。 */
  paramsSchema?: JsonSchemaObject
  /** 构造函数 JSDoc 正文；semantic gap audit 在 kind='constructor' 时检查此字段。 */
  jsdoc: JsDocMeta
  /** 构造函数在 emit `.d.ts` 和源文件中的溯源信息。 */
  provenance?: SourceProvenanceMeta
}>

/** Attribute Meta 的语义模型。 */
export type AttributeMeta = Readonly<{
  /** 属性/字段/枚举成员名；与 emit `.d.ts` 中的标识符一致。 */
  name: string
  /** 属性类型的 JSON Schema；由 DtsTypeMeta 映射而来，复杂类型可能缺失。 */
  schema?: JsonSchema
  /** 可读性标记；getter 或 public 属性为 true，write-only setter 为 false。 */
  readable: boolean
  /** 可写性标记；setter 或 public mutable 属性为 true，readonly/getter-only 为 false。 */
  writable: boolean
  /** 成员级 JSDoc 正文；guide 投影和 semantic gap audit 的语义链节点。 */
  jsdoc: JsDocMeta
  /** 成员在 emit `.d.ts` 和源文件中的溯源信息。 */
  provenance?: SourceProvenanceMeta
}>

/**
 * Method Parameter Style 表达 .d.ts 签名的调用形态。
 * positional 表示调用方按参数位置传入实参；named 表示签名使用对象解构，调用方传入一个承载命名字段的对象。
 */
export type MethodParameterStyle = 'positional' | 'named'

/**
 * DTS Type Meta 按 TypeDoc JSONOutput 的 type discriminator 表达参数和返回值类型。
 * intrinsic/literal 可直接用于 FC 基础类型校验；reference 通过 sourcePath 和 typeArguments 递归定位声明；
 * array/union/intersection 保留组合结构，避免把 .d.ts 类型降级成不可验证的字符串。
 *
 * 改造清单（optional / reflection / tuple / rest）：[`docs/typedoc-signature-alignment.md`](../../docs/typedoc-signature-alignment.md)
 */
export type DtsTypeMeta =
  | Readonly<{ type: 'intrinsic'; name: string }>
  | Readonly<{ type: 'reference'; name: string; sourcePath?: string; refersToTypeParameter?: boolean; typeArguments?: readonly DtsTypeMeta[] }>
  | Readonly<{ type: 'array'; elementType: DtsTypeMeta }>
  | Readonly<{ type: 'union'; types: readonly DtsTypeMeta[] }>
  | Readonly<{ type: 'intersection'; types: readonly DtsTypeMeta[] }>
  | Readonly<{ type: 'literal'; value: string | number | boolean | null }>
  | Readonly<{ type: 'optional'; elementType: DtsTypeMeta }>
  | Readonly<{ type: 'rest'; elementType: DtsTypeMeta }>
  | Readonly<{ type: 'tuple'; elements: readonly DtsTypeMeta[] }>
  | DtsReflectionTypeMeta
  | Readonly<{ type: 'unknown'; name: string }>

/** TypeDoc `ReflectionType` 精简：函数/构造签名。 */
export type DtsReflectionSignature = Readonly<{
  /** 签名形参列表；回调/内联函数类型的参数在此数组，而非外层 MethodMeta.parameters。 */
  parameters: readonly MethodParameterMeta[]
  /** 签名返回类型；与 MethodMeta.type 不同，此处是 reflection 内嵌的返回类型，用于回调/内联函数场景。 */
  type: DtsTypeMeta
}>

/** DTS reflection 类型：承载函数或对象字面量中的签名树，用于回调参数和内联函数类型的递归寻址。 */
export type DtsReflectionTypeMeta = Readonly<{
  /** 固定为 'reflection'；判别 DtsTypeMeta 联合中的函数/对象字面量分支。 */
  type: 'reflection'
  /** 反射声明容器；signatures 数组至少一个元素，空数组表示 TypeDoc 解析异常。 */
  declaration: Readonly<{
    signatures: readonly DtsReflectionSignature[]
  }>
}>

/** Method Parameter Meta 按 TypeDoc JSONOutput.ParameterReflection 记录 DTS 参数。 */
export type MethodParameterMeta = Readonly<{
  /** 形参名；named 风格下为对象解构的字段名，positional 风格下为位置参数名。 */
  name: string
  /** 形参类型；按 TypeDoc type discriminator 投影为 DtsTypeMeta 树。 */
  type: DtsTypeMeta
  /** TypeDoc 参数标志；isOptional 为 true 表示 TypeScript 可选参数（`?` 或默认值）。 */
  flags?: Readonly<{ isOptional?: boolean }>
  /** 默认值字面量；仅当 emit 签名含 `= expr` 时存在，否则为 undefined。 */
  defaultValue?: string | number | boolean | null
}>

/** Method Meta 的语义模型。 */
export type MethodMeta = Readonly<{
  /** 方法名；与 emit `.d.ts` 中的标识符一致。 */
  name: string
  /** 方法完整签名字符串；含参数列表和返回类型，与 emit 声明文本一致。 */
  signatureText?: string
  /** 调用约定：positional 按位置传参，named 使用对象解构；影响 paramsSchema 结构。 */
  parameterStyle?: MethodParameterStyle
  /** 方法形参列表；takesContext 为 true 时首参为上下文对象，LLM 工具调用应跳过。 */
  parameters?: readonly MethodParameterMeta[]
  /** TypeDoc SignatureReflection.type（返回类型 SSOT）。 */
  type?: DtsTypeMeta
  /** 参数 JSON Schema；由 parameters 映射，用于 LLM 工具调用的入参校验。 */
  paramsSchema?: JsonSchemaObject
  /** 返回值 JSON Schema；仅在返回类型可完整映射为 JSON Schema 时存在，复杂类型（泛型/回调）可能缺失。 */
  returnSchema?: JsonSchema
  /** 方法首参是否为上下文对象（如 SparkScriptContext）；标记为 true 时 LLM 在工具调用中应跳过该参数。 */
  takesContext?: boolean
  /** 方法 JSDoc 正文；guide 投影和 semantic gap audit 的语义链节点。 */
  jsdoc: JsDocMeta
  /** 方法在 emit `.d.ts` 和源文件中的溯源信息。 */
  provenance?: SourceProvenanceMeta
}>
