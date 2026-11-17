import {readFileSync} from 'node:fs'
import {describe, expect, it} from 'vitest'
import {canonicalContentNode, hashContentNode} from '@/services/smart-bid/content-node-hash'

const samples = JSON.parse(readFileSync('notes/evidence/smart-bid-node-hash-vectors-20261117.json', 'utf8'))

describe('content node payload hashing specification §1.1', () => {
  for (const sample of samples.vectors) it(sample.name, async () => {
    const before = JSON.stringify(sample.input)
    expect(canonicalContentNode(sample.input)).toBe(sample.expected.canonical)
    expect(await hashContentNode(sample.input)).toBe(sample.expected.sha256)
    expect(JSON.stringify(sample.input)).toBe(before)
  })
  for (const sample of samples.reject) it(sample.name, () => {
    expect(() => canonicalContentNode(sample.input)).toThrow(sample.reason)
  })
  it('rejects non-JSON data and numeric business values instead of silently coercing them', () => {
    const input = samples.vectors[0].input
    for (const data of [{amount: 1200}, {value: undefined}, {value: new Date()}, {value: Infinity}]) {
      expect(() => canonicalContentNode({...input, data})).toThrow()
    }
    const cycle: Record<string, unknown> = {}; cycle['self'] = cycle
    expect(() => canonicalContentNode({...input, data: cycle})).toThrow('CYCLIC_PAYLOAD')
    const sparse = Object.assign(new Array<unknown>(2), {1: false, extra: true})
    expect(() => canonicalContentNode({...input, data: {items: sparse}})).toThrow('NON_JSON_ARRAY')
  })
  it('requires a valid node envelope', () => {
    const input = samples.vectors[0].input
    for (const change of [{index: -1}, {index: 0.5}, {nodeId: ''}, {class: [1]}, {data: []}]) {
      expect(() => canonicalContentNode({...input, ...change})).toThrow()
    }
  })
})
