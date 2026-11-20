import { describe, expect, it } from 'vitest'

import { attachJsonSchemaDefs } from '../schema/schema-attach'
import {
  extractJsonSchemaLocalDefs,
  findMissingJsonSchemaDefRefs,
  standardizeJsonSchemaWithLocalDefs,
} from '../schema/schema-defs'

describe('JSON Schema $defs helpers', () => {
  it('extracts nested local defs before $ref normalization', () => {
    const extracted = extractJsonSchemaLocalDefs({
      type: 'object',
      properties: {
        params: {
          $ref: '#/$defs/QueryParams',
          $defs: {
            QueryParams: {
              type: 'object',
              properties: {
                page: { type: 'number' },
              },
            },
          },
        },
      },
    })

    expect(extracted.schema).toEqual({
      type: 'object',
      properties: {
        params: { $ref: '#/$defs/QueryParams' },
      },
    })
    expect(extracted.defs).toEqual({
      QueryParams: {
        type: 'object',
        properties: {
          page: { type: 'number' },
        },
      },
    })
  })

  it('does not treat property names as schema $defs keywords', () => {
    const extracted = extractJsonSchemaLocalDefs({
      type: 'object',
      properties: {
        $defs: {
          type: 'object',
          additionalProperties: true,
        },
        value: { type: 'string' },
      },
    })

    expect(extracted.schema).toEqual({
      type: 'object',
      properties: {
        $defs: {
          type: 'object',
          additionalProperties: true,
        },
        value: { type: 'string' },
      },
    })
    expect(extracted.defs).toEqual({})
  })

  it('standardizes root refs with local defs without creating $ref siblings', () => {
    const schema = standardizeJsonSchemaWithLocalDefs({
      $ref: '#/$defs/QueryParams',
      $defs: {
        QueryParams: {
          type: 'object',
          properties: {
            page: { type: 'number' },
          },
        },
      },
    })

    expect(schema).toEqual({
      allOf: [{ $ref: '#/$defs/QueryParams' }],
      $defs: {
        QueryParams: {
          type: 'object',
          properties: {
            page: { type: 'number' },
          },
        },
      },
    })
  })

  it('attaches defs to non-object schemas through allOf', () => {
    expect(attachJsonSchemaDefs(true, {
      AnyPayload: { type: 'object', additionalProperties: true },
    })).toEqual({
      allOf: [true],
      $defs: {
        AnyPayload: { type: 'object', additionalProperties: true },
      },
    })
  })

  it('reports missing document-level defs refs', () => {
    expect(findMissingJsonSchemaDefRefs({
      $defs: {
        QueryParams: { type: 'object' },
      },
      type: 'object',
      properties: {
        ok: { $ref: '#/$defs/QueryParams' },
        missing: { $ref: '#/$defs/MissingType' },
      },
    })).toEqual(['MissingType'])
  })
})
