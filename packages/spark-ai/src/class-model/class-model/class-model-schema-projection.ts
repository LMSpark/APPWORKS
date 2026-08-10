/**
 * @module @spark-appworks/spark-ai:class-model/class-model/class-model-schema-projection
 * 职责：在写盘前剥离成员级重复 schema，并在读盘后从 shard.$defs 恢复成员 schema 片段。
 * 边界：不生成 JSON Schema、不解析 TypeScript AST，只做 DtsTypeDeclarationModel 与 shard schema 的投影还原。
 * AI用途：排查生成产物为什么没有成员级 paramsSchema/returnSchema，或读盘后 schema 如何恢复时，用本模块定位。
 */
import type { JsonSchema, JsonSchemaObject } from '@spark-appworks/spark-json-document'
import { standardizeJsonSchema } from '@spark-appworks/spark-json-document'
import type { AttributeMeta, DtsTypeDeclarationModel, ConstructorMeta, MethodMeta } from './types'
import {
  CLASS_MODEL_CONSTRUCTOR_PARAMS_DEF_KEY,
  classModelMethodParamsDefKey,
  classModelMethodReturnDefKey,
} from './class-model-json-schema-def-keys'

function isJsonSchemaObject(schema: JsonSchema | undefined): schema is JsonSchemaObject {
  return schema !== undefined && schema !== true && schema !== false && typeof schema === 'object' && !Array.isArray(schema)
}

/** bundle 写盘：保留 jsonSchema，去掉与其重复的 schema 副本。 */
export function stripRedundantModelSchemas(model: DtsTypeDeclarationModel): DtsTypeDeclarationModel {
  if (model.jsonSchema === undefined) return model

  if (model.declarationKind === 'class') {
    return {
      ...model,
      classDecl: {
        ...model.classDecl,
        constructorMeta: stripConstructorSchema(model.classDecl.constructorMeta),
        members: {
          attributes: model.classDecl.members.attributes.map(stripAttributeSchema),
          methods: model.classDecl.members.methods.map(stripMethodSchemas),
        },
      },
    }
  }
  if (model.declarationKind === 'interface') {
    return {
      ...model,
      interfaceDecl: {
        ...model.interfaceDecl,
        members: {
          attributes: model.interfaceDecl.members.attributes.map(stripAttributeSchema),
          methods: model.interfaceDecl.members.methods.map(stripMethodSchemas),
        },
      },
    }
  }
  if (model.declarationKind === 'typeAlias') {
    return {
      ...model,
      typeAlias: {
        ...model.typeAlias,
        members: {
          attributes: model.typeAlias.members.attributes.map(stripAttributeSchema),
          methods: model.typeAlias.members.methods.map(stripMethodSchemas),
        },
      },
    }
  }
  return {
    ...model,
    enumDecl: {
      members: model.enumDecl.members.map(stripAttributeSchema),
    },
  }
}

function stripAttributeSchema(attribute: AttributeMeta): AttributeMeta {
  return {
    name: attribute.name,
    jsdoc: attribute.jsdoc,
    readable: attribute.readable,
    writable: attribute.writable,
    ...(attribute.provenance === undefined ? {} : { provenance: attribute.provenance }),
  }
}

function stripConstructorSchema(constructorMeta: ConstructorMeta): ConstructorMeta {
  return {
    jsdoc: constructorMeta.jsdoc,
    ...(constructorMeta.signatureText === undefined ? {} : { signatureText: constructorMeta.signatureText }),
    parameterStyle: constructorMeta.parameterStyle ?? 'positional',
    parameters: constructorMeta.parameters ?? [],
    ...(constructorMeta.provenance === undefined ? {} : { provenance: constructorMeta.provenance }),
  }
}

function stripMethodSchemas(method: MethodMeta): MethodMeta {
  const core: MethodMeta = {
    name: method.name,
    jsdoc: method.jsdoc,
    parameterStyle: method.parameterStyle ?? 'positional',
    parameters: method.parameters ?? [],
    ...(method.type === undefined ? {} : { type: method.type }),
    ...(method.signatureText === undefined ? {} : { signatureText: method.signatureText }),
    ...(method.takesContext === undefined ? {} : { takesContext: method.takesContext }),
    ...(method.provenance === undefined ? {} : { provenance: method.provenance }),
  }
  return core
}

/** bundle 读盘：从 jsonSchema 恢复 attribute/method/root schema，供 guide 与 runtime API 消费。 */
export function hydrateModelSchemasFromJsonSchema(model: DtsTypeDeclarationModel): DtsTypeDeclarationModel {
  if (model.jsonSchema === undefined) return model

  const jsonSchema = standardizeJsonSchema(model.jsonSchema)
  if (typeof jsonSchema === 'boolean') return model

  if (model.declarationKind === 'enum') {
    return hydrateEnumModel(model, jsonSchema)
  }
  if (model.declarationKind === 'typeAlias') {
    return hydrateTypeAliasModel(model, jsonSchema)
  }
  return hydrateObjectModel(model, jsonSchema)
}

function hydrateEnumModel(
  model: Extract<DtsTypeDeclarationModel, { declarationKind: 'enum' }>,
  jsonSchema: JsonSchemaObject,
): DtsTypeDeclarationModel {
  const enumValues = Array.isArray(jsonSchema.enum)
    ? jsonSchema.enum.filter(isJsonLiteralValue)
    : []
  const singleConst = isJsonLiteralValue(jsonSchema.const) ? jsonSchema.const : undefined
  return {
    ...model,
    enumDecl: {
      members: model.enumDecl.members.map((attribute, index) => {
        if (attribute.schema !== undefined) return attribute
        const fromEnum = enumValues[index]
        const constValue = fromEnum ?? (index === 0 ? singleConst : undefined)
        if (constValue === undefined) return attribute
        return { ...attribute, schema: { const: constValue } }
      }),
    },
  }
}

function isJsonLiteralValue(value: unknown): value is string | number | boolean | null {
  return typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
    || value === null
}

function hydrateTypeAliasModel(model: DtsTypeDeclarationModel, jsonSchema: JsonSchemaObject): DtsTypeDeclarationModel {
  return hydrateObjectModel(model, jsonSchema)
}

function hydrateObjectModel(model: DtsTypeDeclarationModel, jsonSchema: JsonSchemaObject): DtsTypeDeclarationModel {
  const properties = jsonSchema.properties ?? {}
  const defs = readSchemaDefs(jsonSchema)
  if (model.declarationKind === 'class') {
    return {
      ...model,
      classDecl: {
        ...model.classDecl,
        constructorMeta: {
          ...model.classDecl.constructorMeta,
          ...(model.classDecl.constructorMeta.paramsSchema === undefined
            ? readObjectDefProperty(defs, CLASS_MODEL_CONSTRUCTOR_PARAMS_DEF_KEY, 'constructor')
            : {}),
        },
        members: {
          attributes: hydrateAttributes(model.classDecl.members.attributes, properties),
          methods: hydrateMethods(model.classDecl.members.methods, defs),
        },
      },
    }
  }
  if (model.declarationKind === 'interface') {
    return {
      ...model,
      interfaceDecl: {
        ...model.interfaceDecl,
        members: {
          attributes: hydrateAttributes(model.interfaceDecl.members.attributes, properties),
          methods: hydrateMethods(model.interfaceDecl.members.methods, defs),
        },
      },
    }
  }
  if (model.declarationKind === 'typeAlias') {
    return {
      ...model,
      typeAlias: {
        ...model.typeAlias,
        members: {
          attributes: hydrateAttributes(model.typeAlias.members.attributes, properties),
          methods: hydrateMethods(model.typeAlias.members.methods, defs),
        },
      },
    }
  }
  return model
}

function hydrateAttributes(
  attributes: readonly AttributeMeta[],
  properties: Readonly<Record<string, JsonSchema>>,
): readonly AttributeMeta[] {
  return attributes.map((attribute) => {
    const existing = attribute.schema
    if (existing !== undefined && existing !== true && existing !== false) return attribute
    const schema = properties[attribute.name]
    return schema === undefined ? attribute : { ...attribute, schema }
  })
}

function hydrateMethods(
  methods: readonly MethodMeta[],
  defs: Readonly<Record<string, JsonSchema>>,
): readonly MethodMeta[] {
  return methods.map(method => ({
    ...method,
    ...(method.paramsSchema === undefined
      ? readObjectDefProperty(defs, classModelMethodParamsDefKey(method.name), method.name)
      : {}),
    ...(method.returnSchema === undefined && defs[classModelMethodReturnDefKey(method.name)] !== undefined
      ? { returnSchema: defs[classModelMethodReturnDefKey(method.name)] }
      : {}),
  }))
}

function readSchemaDefs(jsonSchema: JsonSchemaObject): Readonly<Record<string, JsonSchema>> {
  const defs = jsonSchema['$defs']
  if (defs === undefined || defs === null || typeof defs !== 'object' || Array.isArray(defs)) return {}
  const result: Record<string, JsonSchema> = {}
  for (const [name, schema] of Object.entries(defs)) {
    if (isJsonSchema(schema)) {
      result[name] = schema
    }
  }
  return result
}

function isJsonSchema(value: unknown): value is JsonSchema {
  return value === true
    || value === false
    || (value !== null && typeof value === 'object' && !Array.isArray(value))
}

function readObjectDefProperty(
  defs: Readonly<Record<string, JsonSchema>>,
  key: string,
  label: string,
): { paramsSchema?: JsonSchemaObject } {
  const schema = defs[key]
  if (isJsonSchemaObject(schema)) return { paramsSchema: schema }
  if (schema === undefined) return {}
  throw new Error(`DTS DtsTypeDeclarationModel ${label} params schema $defs entry must be a JSON Schema object.`)
}
