import { describe, expect, it } from 'vitest'
import type { JsonSchemaObject } from '@spark-appworks/spark-json-document'

import type { AttributeMeta, DtsTypeDeclarationModel, ConstructorMeta, MethodMeta } from '../class-model/types'
import {
  hydrateModelSchemasFromJsonSchema,
  stripRedundantModelSchemas,
} from '../class-model/schema/class-model-schema-projection'
import { attachModelJsonSchemas } from '../class-model/schema/class-model-to-json-schema'

function makeAttribute(overrides: Partial<AttributeMeta> & Pick<AttributeMeta, 'name'>): AttributeMeta {
  return {
    schema: { type: 'string' },
    readable: true,
    writable: true,
    jsdoc: '',
    ...overrides,
  }
}

function makeMethod(overrides: Partial<MethodMeta> & Pick<MethodMeta, 'name'>): MethodMeta {
  return {
    jsdoc: '',
    ...overrides,
  }
}

function makeConstructor(overrides: Partial<ConstructorMeta> = {}): ConstructorMeta {
  return {
    signatureText: 'constructor()',
    parameterStyle: 'positional',
    parameters: [],
    paramsSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    jsdoc: '',
    ...overrides,
  }
}

function makeInterfaceModel(): Extract<DtsTypeDeclarationModel, { declarationKind: 'interface' }> {
  return {
    name: 'Demo',
    jsdoc: 'demo',
    declarationKind: 'interface',
    interfaceDecl: {
      members: {
        attributes: [makeAttribute({ name: 'id', schema: { type: 'string' } })],
        methods: [],
      },
    },
  }
}

describe('class-model-schema-projection', () => {
  it('restores common union member types without changing the correlated root schema', () => {
    const jsonSchema = {anyOf: [
      {type: 'object', properties: {id: {type: 'string'}, type: {const: 'empty'}, data: {type: 'object', properties: {}, additionalProperties: false}}, required: ['id', 'type', 'data'], additionalProperties: false},
      {type: 'object', properties: {id: {type: 'string'}, type: {const: 'task'}, data: {type: 'object', properties: {station: {type: 'string'}}, required: ['station'], additionalProperties: false}}, required: ['id', 'type', 'data'], additionalProperties: false},
    ]} satisfies JsonSchemaObject
    const model: DtsTypeDeclarationModel = {name: 'Node', jsdoc: '', declarationKind: 'typeAlias', jsonSchema,
      typeAlias: {declarationTypeText: 'Common & (Empty | Task)',
        members: {attributes: ['id', 'type', 'data'].map(name => ({name, readable: true, writable: false, jsdoc: ''})), methods: []}}}
    const original = structuredClone(jsonSchema)
    const hydrated = hydrateModelSchemasFromJsonSchema(model)
    if (hydrated.declarationKind !== 'typeAlias') throw new Error('expected type alias')
    const attributes = hydrated.typeAlias.members.attributes
    expect.soft(attributes.find(item => item.name === 'id')?.schema).toEqual({type: 'string'})
    expect.soft(attributes.find(item => item.name === 'type')?.schema).toEqual({anyOf: [{const: 'empty'}, {const: 'task'}]})
    expect.soft(attributes.find(item => item.name === 'data')?.schema).toEqual({anyOf: jsonSchema.anyOf.map(branch => branch.properties.data)})
    expect(attributes.every(item => !item.writable)).toBe(true)
    expect(hydrated.jsonSchema).toEqual(original)
    expect(model.jsonSchema).toEqual(original)
  })

  it('intersects repeated property constraints and does not invent union-only members', () => {
    const model: DtsTypeDeclarationModel = {name: 'Node', jsdoc: '', declarationKind: 'typeAlias',
      jsonSchema: {allOf: [{type: 'object', properties: {id: {type: 'string'}}},
        {anyOf: [{type: 'object', properties: {id: {const: 'a'}, onlyA: {type: 'string'}}},
          {type: 'object', properties: {id: {const: 'b'}}}]}]},
      typeAlias: {declarationTypeText: 'Common & (A | B)',
        members: {attributes: ['id', 'onlyA'].map(name => ({name, readable: true, writable: true, jsdoc: ''})), methods: []}}}
    const hydrated = hydrateModelSchemasFromJsonSchema(model)
    if (hydrated.declarationKind !== 'typeAlias') throw new Error('expected type alias')
    expect(hydrated.typeAlias.members.attributes[0]?.schema).toEqual({allOf: [{type: 'string'}, {anyOf: [{const: 'a'}, {const: 'b'}]}]})
    expect(hydrated.typeAlias.members.attributes[1]?.schema).toBeUndefined()
  })

  it('strips attribute schemas and hydrates them from jsonSchema on read', () => {
    const withJsonSchema = attachModelJsonSchemas({ Demo: makeInterfaceModel() })['Demo']!
    const stripped = stripRedundantModelSchemas(withJsonSchema)
    expect(stripped.declarationKind).toBe('interface')
    if (stripped.declarationKind !== 'interface') throw new Error('expected interface model')
    expect(stripped.interfaceDecl.members.attributes[0]).not.toHaveProperty('schema')
    expect(stripped.jsonSchema?.properties?.['id']).toEqual({ type: 'string' })

    const hydrated = hydrateModelSchemasFromJsonSchema(stripped)
    if (hydrated.declarationKind !== 'interface') throw new Error('expected interface model')
    expect(hydrated.interfaceDecl.members.attributes[0]?.schema).toEqual({ type: 'string' })
  })

  it('strips declaration member method schemas and hydrates from jsonSchema', () => {
    const model: Extract<DtsTypeDeclarationModel, { declarationKind: 'interface' }> = {
      name: 'Runner',
      jsdoc: '',
      declarationKind: 'interface',
      interfaceDecl: {
        members: {
          attributes: [],
          methods: [makeMethod({
            name: 'run',
            parameterStyle: 'positional',
            parameters: [],
            type: { type: 'intrinsic', name: 'void' },
            paramsSchema: {
              type: 'object',
              properties: { id: { type: 'string' } },
              required: ['id'],
            },
            returnSchema: true,
            signatureText: 'run(id: string): void',
          })],
        },
      },
    }
    const withJsonSchema = attachModelJsonSchemas({ Runner: model })['Runner']!
    const stripped = stripRedundantModelSchemas(withJsonSchema)
    if (stripped.declarationKind !== 'interface') throw new Error('expected interface model')
    expect(stripped.interfaceDecl.members.methods[0]).not.toHaveProperty('paramsSchema')

    const hydrated = hydrateModelSchemasFromJsonSchema(stripped)
    if (hydrated.declarationKind !== 'interface') throw new Error('expected interface model')
    expect(hydrated.interfaceDecl.members.methods[0]?.paramsSchema).toMatchObject({
      type: 'object',
      properties: { id: { type: 'string' } },
    })
    expect(hydrated.interfaceDecl.members.methods[0]?.returnSchema).toBe(true)
  })

  it('strips class executable schemas and hydrates them from jsonSchema defs', () => {
    const model: Extract<DtsTypeDeclarationModel, { declarationKind: 'class' }> = {
      name: 'Worker',
      jsdoc: 'worker',
      declarationKind: 'class',
      classDecl: {
        constructorMeta: makeConstructor({
          signatureText: 'constructor(id: string)',
          parameters: [{ name: 'id', type: { type: 'intrinsic', name: 'string' } }],
          paramsSchema: {
            type: 'object',
            properties: { id: { type: 'string' } },
            required: ['id'],
            additionalProperties: false,
          },
          jsdoc: 'create worker',
        }),
        members: {
          attributes: [],
          methods: [makeMethod({
            name: 'run',
            parameterStyle: 'positional',
            parameters: [{ name: 'count', type: { type: 'intrinsic', name: 'number' } }],
            type: { type: 'intrinsic', name: 'boolean' },
            paramsSchema: {
              type: 'object',
              properties: { count: { type: 'number' } },
              required: ['count'],
              additionalProperties: false,
            },
            returnSchema: { type: 'boolean' },
            signatureText: 'run(count: number): boolean',
          })],
        },
      },
    }

    const withJsonSchema = attachModelJsonSchemas({ Worker: model })['Worker']!
    const stripped = stripRedundantModelSchemas(withJsonSchema)
    if (stripped.declarationKind !== 'class') throw new Error('expected class model')
    expect(stripped.classDecl.constructorMeta).not.toHaveProperty('paramsSchema')
    expect(stripped.classDecl.members.methods[0]).not.toHaveProperty('paramsSchema')
    expect(stripped.classDecl.members.methods[0]).not.toHaveProperty('returnSchema')
    const defs = stripped.jsonSchema?.['$defs'] as Readonly<Record<string, unknown>> | undefined
    expect(defs?.['constructor.params']).toMatchObject({
      type: 'object',
      properties: { id: { type: 'string' } },
    })
    expect(defs?.['method.run.params']).toMatchObject({
      type: 'object',
      properties: { count: { type: 'number' } },
    })
    expect(defs?.['method.run.return']).toEqual({ type: 'boolean' })

    const hydrated = hydrateModelSchemasFromJsonSchema(stripped)
    if (hydrated.declarationKind !== 'class') throw new Error('expected class model')
    expect(hydrated.classDecl.constructorMeta.paramsSchema).toMatchObject({
      type: 'object',
      properties: { id: { type: 'string' } },
    })
    expect(hydrated.classDecl.members.methods[0]?.paramsSchema).toMatchObject({
      type: 'object',
      properties: { count: { type: 'number' } },
    })
    expect(hydrated.classDecl.members.methods[0]?.returnSchema).toEqual({ type: 'boolean' })
  })
})
