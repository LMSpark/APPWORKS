import {describe, expect, it} from 'vitest'
import {jsonSchemaToTypeText} from '../class-model/schema/json-schema-to-type'

describe('JSON Schema guide type text', () => {
  it.each(['route', false, 0, null])('preserves the literal discriminator %s', value => {
    expect(jsonSchemaToTypeText({const: value})).toBe(JSON.stringify(value))
  })

  it('keeps a closed empty object distinct from an unrestricted record', () => {
    expect(jsonSchemaToTypeText({type: 'object', properties: {}, additionalProperties: false})).toBe('Record<string, never>')
    expect(jsonSchemaToTypeText({type: 'object', properties: {}})).toBe('Record<string, unknown>')
    expect(jsonSchemaToTypeText({type: 'object', properties: {}, additionalProperties: true})).toBe('Record<string, unknown>')
  })

  it('preserves the value type of an otherwise empty dictionary', () => {
    expect(jsonSchemaToTypeText({type: 'object', properties: {}, additionalProperties: {$ref: '#/$defs/Value'}}))
      .toBe('Record<string, Value>')
  })

  it('keeps intersected member constraints grouped around a union', () => {
    expect(jsonSchemaToTypeText({allOf: [{type: 'string'}, {anyOf: [{const: 'a'}, {const: 'b'}]}]}))
      .toBe('string & ("a" | "b")')
  })
})
