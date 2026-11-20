import { describe, expect, it } from 'vitest'
import { type SparkNode, getSparkNodeChildren, normalizeSparkNode, isSparkNode, nodeInputProps, nodeInputProp } from '@spark-appworks/spark-data'

describe('SparkNode input helpers', () => {
  it('nodeInputProp should only read props', () => {
    const node: SparkNode & Record<string, unknown> = {
      type: 'r-text',
      field: 'root-field',
      props: {
        field: 'props-field',
        label: '姓名',
      },
      label: '根级标签',
    }

    expect(nodeInputProp(node, 'field')).toBe('props-field')
    expect(nodeInputProp(node, 'label')).toBe('姓名')
  })

  it('nodeInputProp should ignore root-level non-props fields', () => {
    const node: SparkNode & Record<string, unknown> = {
      type: 'r-number',
      name: 'node-id',
      field: 'root-field',
    }

    expect(nodeInputProp(node, 'field')).toBeUndefined()
    expect(nodeInputProp(node, 'name')).toBeUndefined()
  })

  it('nodeInputProps should only return props and exclude structural keys', () => {
    const node: SparkNode & Record<string, unknown> = {
      type: 'r-step',
      id: 'step-1',
      order: 2,
      title: '步骤一',
      name: 'step-one',
      gridGap: 16,
      props: {
        title: 'props title wins',
        status: 'process',
      },
      children: [],
    }

    const merged = nodeInputProps(node)

    expect(merged['title']).toBe('props title wins')
    expect(merged['status']).toBe('process')
    expect(merged['name']).toBeUndefined()
    expect(merged['gridGap']).toBeUndefined()
    expect(merged['id']).toBeUndefined()
    expect(merged['order']).toBeUndefined()
    expect(merged['children']).toBeUndefined()
    expect(merged['type']).toBeUndefined()
  })

  it('isSparkNode should reject arrays even if they carry a type property', () => {
    const value = Object.assign([], { type: 'r-text' })

    expect(isSparkNode(value)).toBe(false)
  })

  it('isSparkNode should reject empty type strings', () => {
    expect(isSparkNode({ type: '' })).toBe(false)
    expect(isSparkNode({ type: '   ' })).toBe(false)
  })

  it('normalizeSparkNode should reject missing or empty type', () => {
    expect(() => normalizeSparkNode({ type: '' })).toThrow(/type must be a non-empty string/)
    // @ts-expect-error negative runtime validation case: missing required type
    expect(() => normalizeSparkNode({ props: {} })).toThrow(/type must be a non-empty string/)
  })

  it('getSparkNodeChildren should filter text and invalid entries', () => {
    const child: SparkNode = { type: 'r-text', props: { field: 'name' }, children: [] }
    const children = [
      child,
      'plain text',
      42,
      { props: { label: 'missing type' } },
      Object.assign([], { type: 'r-button' }),
    ]

    // @ts-expect-error negative runtime validation case: children may contain invalid external input
    expect(getSparkNodeChildren(children)).toEqual([child])
  })
})
