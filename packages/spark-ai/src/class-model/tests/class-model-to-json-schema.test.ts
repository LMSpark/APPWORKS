import { describe, expect, it } from 'vitest'

import { auditDraft2020Schema } from '@spark-appworks/spark-json-document'

import type { JsonSchemaObject } from '@spark-appworks/spark-json-document'
import type { AttributeMeta, DtsTypeDeclarationModel, ConstructorMeta, MethodMeta } from '../class-model/types'
import type { DtsFileProjectionDocument } from '../class-model/bundle/dts-bundle-types'
import { DTS_FILE_PROJECTION_VERSION } from '../class-model/bundle/dts-bundle-types'
import { classModelToJsonSchema, shardToJsonSchemas } from '../class-model/schema/class-model-to-json-schema'

function makeAttribute(overrides: Partial<AttributeMeta> & Pick<AttributeMeta, 'name'>): AttributeMeta {
  return {
    schema: { type: 'string' },
    readable: true,
    writable: true,
    jsdoc: '',
    ...overrides,
  }
}

function makeConstructor(): ConstructorMeta {
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
  }
}

function makeClassModel(options: Readonly<{
  name: string
  jsdoc?: string
  attributes?: readonly AttributeMeta[]
  methods?: readonly MethodMeta[]
  jsonSchema?: JsonSchemaObject
}>): Extract<DtsTypeDeclarationModel, { declarationKind: 'class' }> {
  return {
    name: options.name,
    jsdoc: options.jsdoc ?? '',
    declarationKind: 'class',
    ...(options.jsonSchema === undefined ? {} : { jsonSchema: options.jsonSchema }),
    classDecl: {
      constructorMeta: makeConstructor(),
      members: {
        attributes: options.attributes ?? [],
        methods: options.methods ?? [],
      },
    },
  }
}

function makeEnumModel(options: Readonly<{
  name: string
  jsdoc?: string
  members: readonly AttributeMeta[]
}>): Extract<DtsTypeDeclarationModel, { declarationKind: 'enum' }> {
  return {
    name: options.name,
    jsdoc: options.jsdoc ?? '',
    declarationKind: 'enum',
    enumDecl: {
      members: options.members,
    },
  }
}

function makeTypeAliasModel(options: Readonly<{
  name: string
  jsdoc?: string
  jsonSchema?: JsonSchemaObject
  attributes?: readonly AttributeMeta[]
  methods?: readonly MethodMeta[]
}>): Extract<DtsTypeDeclarationModel, { declarationKind: 'typeAlias' }> {
  return {
    name: options.name,
    jsdoc: options.jsdoc ?? '',
    declarationKind: 'typeAlias',
    ...(options.jsonSchema === undefined ? {} : { jsonSchema: options.jsonSchema }),
    typeAlias: {
      declarationTypeText: options.name,
      members: {
        attributes: options.attributes ?? [],
        methods: options.methods ?? [],
      },
    },
  }
}

describe('classModelToJsonSchema', () => {
  it('maps a class with required and optional attributes to Draft 2020-12', () => {
    const model = makeClassModel({
      name: 'DemoModel',
      jsdoc: 'A demo model for testing.',
      attributes: [
        makeAttribute({ name: 'id', writable: true }),
        makeAttribute({ name: 'label', writable: false }),
      ],
    })

    const schema = classModelToJsonSchema(model)

    expect(schema['$schema']).toBe('https://json-schema.org/draft/2020-12/schema')
    expect(schema.type).toBe('object')
    expect(schema.title).toBe('DemoModel')
    expect(schema.description).toBe('A demo model for testing.')
    expect(schema.properties).toEqual({
      id: { type: 'string' },
      label: { type: 'string' },
    })
    expect(schema.required).toEqual(['id'])
    expect(schema.additionalProperties).toBe(false)
    expect(auditDraft2020Schema(schema)).toEqual([])
  })

  it('maps JSDoc to description', () => {
    const schema = classModelToJsonSchema(makeClassModel({
      name: 'WithJsDoc',
      jsdoc: '/** Described. */',
    }))
    expect(schema.description).toBe('/** Described. */')
  })

  it('omits description when jsdoc is empty', () => {
    const schema = classModelToJsonSchema(makeClassModel({ name: 'NoJsDoc' }))
    expect(schema.description).toBeUndefined()
  })

  it('produces minimal schema for class with no readable attributes', () => {
    const model = makeClassModel({
      name: 'EmptyModel',
      attributes: [
        makeAttribute({ name: 'hidden', readable: false, writable: true }),
      ],
    })

    const schema = classModelToJsonSchema(model)

    expect(schema['$schema']).toBe('https://json-schema.org/draft/2020-12/schema')
    expect(schema.type).toBe('object')
    expect(schema.title).toBe('EmptyModel')
    expect(schema.properties).toBeUndefined()
    expect(schema.required).toBeUndefined()
    expect(schema.additionalProperties).toBeUndefined()
    expect(auditDraft2020Schema(schema)).toEqual([])
  })

  it('handles enum declarationKind', () => {
    const model = makeEnumModel({
      name: 'Status',
      members: [
        makeAttribute({ name: 'active', schema: { type: 'string', enum: ['active'] } }),
        makeAttribute({ name: 'inactive', schema: { type: 'string', enum: ['inactive'] } }),
      ],
    })

    const schema = classModelToJsonSchema(model)

    expect(schema['$schema']).toBe('https://json-schema.org/draft/2020-12/schema')
    expect(schema.title).toBe('Status')
    expect(schema.enum).toEqual(['active', 'inactive'])
    expect(schema.type).toBeUndefined()
    expect(schema.properties).toBeUndefined()
    expect(auditDraft2020Schema(schema)).toEqual([])
  })

  it('handles enum with const values', () => {
    const schema = classModelToJsonSchema(makeEnumModel({
      name: 'Color',
      members: [
        makeAttribute({ name: 'red', schema: { const: 'red' } }),
        makeAttribute({ name: 'blue', schema: { const: 'blue' } }),
      ],
    }))
    expect(schema.enum).toEqual(['red', 'blue'])
    expect(auditDraft2020Schema(schema)).toEqual([])
  })

  it('includes $schema header', () => {
    const schema = classModelToJsonSchema(makeClassModel({ name: 'WithSchema' }))
    expect(schema['$schema']).toBe('https://json-schema.org/draft/2020-12/schema')
  })

  it('every output passes auditDraft2020Schema', () => {
    const models: DtsTypeDeclarationModel[] = [
      makeClassModel({ name: 'Simple' }),
      makeClassModel({
        name: 'WithAttrs',
        attributes: [
          makeAttribute({ name: 'name', writable: true }),
          makeAttribute({ name: 'opt', writable: false }),
        ],
      }),
      makeEnumModel({
        name: 'EnumLike',
        members: [
          makeAttribute({ name: 'a', schema: { const: 'a' } }),
          makeAttribute({ name: 'b', schema: { const: 'b' } }),
        ],
      }),
    ]

    for (const model of models) {
      const schema = classModelToJsonSchema(model)
      expect(auditDraft2020Schema(schema)).toEqual([])
    }
  })

  it('standardizes nullable attribute schema', () => {
    const model = makeClassModel({
      name: 'NullableModel',
      attributes: [
        makeAttribute({
          name: 'maybe',
          schema: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        }),
      ],
    })

    const schema = classModelToJsonSchema(model)

    expect(schema.properties!['maybe']).toEqual({ type: ['null', 'string'] })
    expect(auditDraft2020Schema(schema)).toEqual([])
  })

  it('maps type declarationKind via model jsonSchema', () => {
    const model = makeTypeAliasModel({
      name: 'Status',
      jsonSchema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        title: 'Status',
        enum: ['active', 'inactive'],
      },
    })

    const schema = classModelToJsonSchema(model)
    expect(schema.title).toBe('Status')
    expect(schema.enum).toEqual(['active', 'inactive'])
    expect(auditDraft2020Schema(schema)).toEqual([])
  })

  it('attaches executable method schemas through $defs for declaration members', () => {
    const model = makeClassModel({
      name: 'Worker',
      methods: [{
        name: 'run',
        paramsSchema: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
        returnSchema: { type: 'boolean' },
        jsdoc: '',
      }],
    })

    const schema = classModelToJsonSchema(model)
    expect(schema['$defs']?.['method.run.params']).toMatchObject({
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    })
    expect(schema['$defs']?.['method.run.return']).toEqual({ type: 'boolean' })
    expect(auditDraft2020Schema(schema)).toEqual([])
  })
})

describe('shardToJsonSchemas', () => {
  it('produces a schema per model in the shard', () => {
    const shard: DtsFileProjectionDocument = {
      schemaVersion: DTS_FILE_PROJECTION_VERSION,
      sourcePath: 'test.d.ts',
      module: {
        name: 'test',
        sourcePath: 'test.d.ts',
        sourceFile: 'test.ts',
        modulePath: 'test',
        jsdoc: '',
        jsdocSource: 'inferred',
        symbols: ['Foo', 'Bar'],
      },
      symbols: ['Foo', 'Bar'],
      models: {
        Foo: makeClassModel({
          name: 'Foo',
          attributes: [makeAttribute({ name: 'x', writable: true })],
        }),
        Bar: makeClassModel({
          name: 'Bar',
          attributes: [makeAttribute({ name: 'y', writable: false })],
        }),
      },
    }

    const result = shardToJsonSchemas(shard)

    expect(Object.keys(result)).toEqual(['Foo', 'Bar'])
    expect(result['Foo']!['$schema']).toBe('https://json-schema.org/draft/2020-12/schema')
    expect(result['Bar']!['$schema']).toBe('https://json-schema.org/draft/2020-12/schema')
    expect(result['Foo']!.required).toEqual(['x'])
    expect(result['Bar']!.required).toBeUndefined()
  })

  it('preserves $defs refs in attribute schemas', () => {
    const shard: DtsFileProjectionDocument = {
      schemaVersion: DTS_FILE_PROJECTION_VERSION,
      sourcePath: 'ref.d.ts',
      module: {
        name: 'ref',
        sourcePath: 'ref.d.ts',
        sourceFile: 'ref.ts',
        modulePath: 'ref',
        jsdoc: '',
        jsdocSource: 'inferred',
        symbols: ['Owner', 'Nested'],
      },
      symbols: ['Owner', 'Nested'],
      models: {
        Owner: makeClassModel({
          name: 'Owner',
          attributes: [
            makeAttribute({
              name: 'child',
              schema: { $ref: '#/$defs/Nested' },
            }),
          ],
        }),
        Nested: makeClassModel({
          name: 'Nested',
          attributes: [makeAttribute({ name: 'id', writable: true })],
        }),
      },
    }

    const result = shardToJsonSchemas(shard)

    expect(result['Owner']!.properties?.['child']).toEqual({ $ref: '#/$defs/Nested' })
    expect(result['Nested']!.required).toEqual(['id'])
  })

  it('passes Draft 2020-12 audit for every output', () => {
    const shard: DtsFileProjectionDocument = {
      schemaVersion: DTS_FILE_PROJECTION_VERSION,
      sourcePath: 'audit.d.ts',
      module: {
        name: 'audit',
        sourcePath: 'audit.d.ts',
        sourceFile: 'audit.ts',
        modulePath: 'audit',
        jsdoc: '',
        jsdocSource: 'inferred',
        symbols: ['Model'],
      },
      symbols: ['Model'],
      models: {
        Model: makeClassModel({
          name: 'Model',
          attributes: [
            makeAttribute({ name: 'id', writable: true }),
            makeAttribute({ name: 'opt', writable: false, schema: { type: 'number' } }),
          ],
        }),
      },
    }

    const result = shardToJsonSchemas(shard)
    for (const [name, schema] of Object.entries(result)) {
      expect(auditDraft2020Schema(schema), `audit failed for ${name}`).toEqual([])
    }
  })
})
