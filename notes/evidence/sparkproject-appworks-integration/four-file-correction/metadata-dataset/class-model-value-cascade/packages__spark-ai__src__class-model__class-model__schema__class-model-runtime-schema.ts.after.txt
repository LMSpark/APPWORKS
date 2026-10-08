/**
 * @module @spark-appworks/spark-ai:class-model/class-model/schema/class-model-runtime-schema
 * 职责：把动作参数引用的声明闭包绑定成可独立校验的运行schema。
 * 边界：只消费已加载声明；保留递归引用，不补造缺失定义或展开业务模型。
 * AI用途：确认脚本参数与bundle声明使用相同约束，缺失引用必须修复知识闭包。
 */
import type {JsonSchema, JsonSchemaObject} from '@spark-appworks/spark-json-document'
import {isRecord} from '@spark-appworks/spark-utils'
import type {DtsClassModelSurfaceDocument} from '../dts-surface-types'
import {modelJsonSchemaRefPointer, parseModelJsonSchemaRef} from './model-json-schema-ref'

/** 当前schema资源内的局部定义；不同资源的同名定义分别寻址。 */
type ClassModelRuntimeSchemaDefinition = Readonly<{
  key: string
  schema: JsonSchema
  scope: ClassModelRuntimeSchemaScope
}>
/** 局部名称保留声明时的作用域，不随引用位置的同名定义改变。 */
type ClassModelRuntimeSchemaScope = ReadonlyMap<string, ClassModelRuntimeSchemaDefinition>

/** 为单个参数schema收集可达定义，生成不依赖原shard相对路径的校验资源。 */
export class ClassModelRuntimeSchema {
  private definitions: Record<string, JsonSchema> = {}
  private scopeId = 0
  private scopes = new WeakMap<JsonSchemaObject, ClassModelRuntimeSchemaScope>()

  /** 绑定只读取当前loader已加载的声明，不触发文件或网络访问。 */
  public constructor(private readonly surface: DtsClassModelSurfaceDocument) {}

  /** 每个参数资源独立收集定义，保持无引用参数的原有结构。 */
  public bind(schema: JsonSchemaObject): JsonSchemaObject {
    this.definitions = {}
    this.scopeId = 0
    this.scopes = new WeakMap()
    const bound = this.visit(schema, new Map())
    if (typeof bound === 'boolean') throw new Error('ClassModel parameters require an object schema')
    return Object.keys(this.definitions).length === 0 ? bound : {...bound, $defs: {...this.definitions}}
  }

  private visit(schema: JsonSchema, parent: ClassModelRuntimeSchemaScope): JsonSchema {
    if (typeof schema === 'boolean') return schema
    let scope = parent
    if (isRecord(schema['$defs'])) {
      const cached = this.scopes.get(schema)
      if (cached !== undefined) scope = cached
      else {
        const local = new Map(parent)
        const owner = `local${this.scopeId++}`
        for (const [name, definition] of Object.entries(schema['$defs'])) {
          if (!isSchema(definition)) throw new Error(`Invalid ClassModel schema definition: ${name}`)
          local.set(name, {key: `@${owner}/${name}`, schema: definition, scope: local})
        }
        scope = local
        this.scopes.set(schema, scope)
      }
    }
    const next: Record<string, unknown> = {...schema}
    delete next['$defs']
    if (schema.$ref !== undefined) next['$ref'] = this.reference(schema.$ref, scope)
    for (const keyword of ['properties', 'patternProperties', 'dependentSchemas'] as const) {
      const children = schema[keyword]
      if (isRecord(children)) next[keyword] = Object.fromEntries(Object.entries(children).map(([key, child]) => {
        if (!isSchema(child)) throw new Error(`Invalid ClassModel schema: ${keyword}.${key}`)
        return [key, this.visit(child, scope)]
      }))
    }
    for (const keyword of ['items', 'additionalProperties', 'not', 'contains', 'propertyNames',
      'unevaluatedItems', 'unevaluatedProperties', 'if', 'then', 'else'] as const) {
      const child = schema[keyword]
      if (isSchema(child)) next[keyword] = this.visit(child, scope)
    }
    for (const keyword of ['anyOf', 'oneOf', 'allOf', 'prefixItems'] as const) {
      const children = schema[keyword]
      if (children !== undefined) next[keyword] = children.map(child => this.visit(child, scope))
    }
    return next
  }

  private reference(ref: string, scope: ClassModelRuntimeSchemaScope): string {
    const name = parseModelJsonSchemaRef(ref)
    if (name === undefined) throw new Error(`Unsupported ClassModel schema reference: ${ref}`)
    const local = ref.startsWith('#') ? scope.get(name) : undefined
    const key = local?.key ?? name
    if (!Object.hasOwn(this.definitions, key)) {
      const target = local?.schema ?? this.surface.models[name]?.jsonSchema
      if (target === undefined) throw new Error(`Missing ClassModel schema definition: ${ref}`)
      this.definitions[key] = true
      this.definitions[key] = this.visit(target, local?.scope ?? new Map())
    }
    return modelJsonSchemaRefPointer(key)
  }
}

function isSchema(value: unknown): value is JsonSchema {
  return typeof value === 'boolean' || isRecord(value)
}
