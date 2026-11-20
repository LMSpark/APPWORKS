import { describe, expect, it } from 'vitest'

import { auditDraft2020Schema } from '../schema/schema-draft2020-audit'
import { standardizeJsonSchema } from '../schema/schema-standardize'

describe('standardizeJsonSchema', () => {
  it('preserves Draft 2020-12 schema header on document roots', () => {
    expect(standardizeJsonSchema({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
    })).toEqual({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: true,
    })
    expect(standardizeJsonSchema({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      title: 'Only',
      const: 'only',
    })).toEqual({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      title: 'Only',
      const: 'only',
    })
  })

  it('unwraps single-branch combinators and preserves direct $ref', () => {
    expect(standardizeJsonSchema({
      anyOf: [{ $ref: '#/$defs/HttpEndpoint' }],
    })).toEqual({ $ref: '#/$defs/HttpEndpoint' })
  })

  it('unwraps single-branch combinators without dropping wrapper descriptions', () => {
    expect(standardizeJsonSchema({
      allOf: [{ $ref: '#/$defs/QueryParams' }],
      description: '查询参数。',
    })).toEqual({
      $ref: '#/$defs/QueryParams',
      description: '查询参数。',
    })
  })

  it('normalizes boolean schemas without redundant enum', () => {
    expect(standardizeJsonSchema({
      type: 'boolean',
      enum: [false, true],
    })).toEqual({ type: 'boolean' })
  })

  it('maps non-standard function type to boolean true schema', () => {
    expect(standardizeJsonSchema({ type: 'function' })).toBe(true)
  })

  it('normalizes homogeneous arrays to type + items', () => {
    expect(standardizeJsonSchema({ type: 'array' })).toEqual({
      type: 'array',
      items: true,
    })
    expect(standardizeJsonSchema({
      type: 'array',
      items: { type: 'string' },
    })).toEqual({
      type: 'array',
      items: { type: 'string' },
    })
  })

  it('preserves tuple arrays with prefixItems and items false', () => {
    expect(standardizeJsonSchema({
      type: 'array',
      prefixItems: [{ type: 'string' }, { type: 'number' }],
      items: false,
    })).toEqual({
      type: 'array',
      prefixItems: [{ type: 'string' }, { type: 'number' }],
      items: false,
    })
  })

  it('normalizes bare object schemas and empty fixed objects', () => {
    expect(standardizeJsonSchema({ type: 'object' })).toEqual({
      type: 'object',
      additionalProperties: true,
    })
    expect(standardizeJsonSchema({
      type: 'object',
      properties: {},
    })).toEqual({
      type: 'object',
      properties: {},
      additionalProperties: false,
    })
  })

  it('keeps nullable union types in stable order', () => {
    expect(standardizeJsonSchema({
      type: ['null', 'string'],
    })).toEqual({
      type: ['null', 'string'],
    })
  })

  it('collapses single-value enums into const', () => {
    expect(standardizeJsonSchema({
      type: 'string',
      enum: ['rule.json'],
    })).toEqual({
      const: 'rule.json',
    })
  })

  it('normalizes null literal and boolean combinator branches', () => {
    expect(standardizeJsonSchema({ type: 'null', const: null })).toEqual({ type: 'null' })
    expect(standardizeJsonSchema({
      anyOf: [
        { const: false },
        { const: true },
      ],
    })).toEqual({
      type: 'boolean',
    })
    expect(standardizeJsonSchema({
      anyOf: [
        { type: 'null', const: null },
        { $ref: '#/$defs/Error' },
      ],
    })).toEqual({
      anyOf: [
        { type: 'null' },
        { $ref: '#/$defs/Error' },
      ],
    })
  })

  it('collapses literal-only combinators into enum or const schemas', () => {
    const legacyLiteralUnion = {
      anyOf: [
        { type: 'string', enum: ['error'] },
        { type: 'string', enum: ['warn'] },
        { type: 'string', enum: ['info'] },
      ],
    }

    expect(standardizeJsonSchema(legacyLiteralUnion)).toEqual({
      enum: ['error', 'warn', 'info'],
    })
    expect(auditDraft2020Schema(legacyLiteralUnion).map(issue => issue.rule)).toContain('LITERAL_COMBINATOR_ENUM')
    expect(auditDraft2020Schema(standardizeJsonSchema(legacyLiteralUnion))).toEqual([])

    expect(standardizeJsonSchema({
      oneOf: [
        { const: 'ready' },
        { type: 'string', enum: ['ready'] },
      ],
    })).toEqual({
      const: 'ready',
    })
  })
})
