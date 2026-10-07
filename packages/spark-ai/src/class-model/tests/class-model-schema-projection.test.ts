import { describe, expect, it } from 'vitest'

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
