import { describe, expect, it } from 'vitest'

import {
  JsonSchemaValidator,
  noParamsSchema,
  numberSchema,
  paramsSchema,
  stringSchema,
} from '@spark-appworks/spark-json-document'

describe('JsonSchemaValidator', () => {
  it('validates deserialized params with standard JSON Schema object roots', () => {
    const schema = paramsSchema({
      name: stringSchema('姓名', { minLength: 1 }),
      days: numberSchema('天数'),
    }, ['name', 'days'])

    expect(JsonSchemaValidator.validateDeserializedParams({ name: 'Ada', days: 2 }, schema)).toEqual({
      ok: true,
      issues: [],
    })
  })

  it('reports required/type/additionalProperties issues in Chinese diagnostics', () => {
    const schema = {
      ...paramsSchema({
        name: stringSchema('姓名'),
        days: numberSchema('天数'),
      }, ['name', 'days']),
      additionalProperties: false,
    }

    const result = JsonSchemaValidator.validateDeserializedParams({ days: '2', extra: true }, schema)
    expect(result.ok).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      { path: '$.name', message: '缺少必填字段' },
      { path: '$.days', message: '应为数字' },
      { path: '$.extra', message: '未声明的字段' },
    ]))
    expect(JsonSchemaValidator.formatJsonValidationIssues(result.issues)).toContain('参数校验失败')
  })

  it('rejects non-object params and non-object schema roots fail-fast', () => {
    expect(JsonSchemaValidator.validateDeserializedParams([], noParamsSchema())).toEqual({
      ok: false,
      issues: [{ path: '$', message: '参数必须是 JSON 对象' }],
    })
    expect(JsonSchemaValidator.validateDeserializedParams({}, { type: 'string' })).toEqual({
      ok: false,
      issues: [{ path: '$', message: 'schema 根节点必须是 type=object 的标准 JSON Schema' }],
    })
  })

  it('formats long issue lists with a bounded summary', () => {
    const text = JsonSchemaValidator.formatJsonValidationIssues([
      { path: '$.a', message: '缺少必填字段' },
      { path: '$.b', message: '缺少必填字段' },
      { path: '$.c', message: '缺少必填字段' },
    ], 2)

    expect(text).toBe('参数校验失败：$.a 缺少必填字段；$.b 缺少必填字段；另有 1 个问题')
  })

  it('resolves document-level $defs through AJV 2020 when validating params', () => {
    const schema = paramsSchema({
      node: { $ref: '#/$defs/SparkNode' },
    }, ['node'])
    const schemaDefs = {
      SparkNode: {
        type: 'object' as const,
        properties: {
          type: { type: 'string' as const },
          id: { type: 'string' as const },
        },
        required: ['type', 'id'],
      },
    }

    expect(JsonSchemaValidator.validateDeserializedParams(
      { node: { type: 'div', id: 'root' } },
      schema,
      { schemaDefs },
    )).toEqual({ ok: true, issues: [] })

    expect(JsonSchemaValidator.validateDeserializedParams(
      { node: { type: 'div' } },
      schema,
      { schemaDefs },
    ).ok).toBe(false)
  })
})
