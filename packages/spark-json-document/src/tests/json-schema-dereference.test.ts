import { describe, expect, it } from 'vitest'

import { dereferenceJsonSchema } from '../schema/schema-dereference'

describe('dereferenceJsonSchema', () => {
  it('inlines document-level $defs for adapter paramsSchema consumption', () => {
    const resolved = dereferenceJsonSchema(
      {
        type: 'object',
        properties: {
          node: { $ref: '#/$defs/JsonTreeNode' },
        },
      },
      {
        JsonTreeNode: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
      },
    )

    expect(resolved).toEqual({
      type: 'object',
      properties: {
        node: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
      },
    })
  })
})
