import {createHash} from 'node:crypto'
import {describe, expect, it} from 'vitest'
import {canonicalContentNode, canonicalOperationNode, hashContentNode, hashOperationNode} from '@/services/smart-bid/content-node-hash'

describe('operation node hashes share specification K1 canonicalization', () => {
  it('hashes the route root with an explicit null parent', async () => {
    const input = {id: 'route-1', parentId: null, index: 0, type: 'route', class: ['write', 'write'], value: '编制', data: {}}
    const expected = '{"class":["write"],"data":{},"id":"route-1","index":0,"parentId":null,"type":"route","value":"编制"}'
    expect(canonicalOperationNode(input)).toBe(expected)
    expect(await hashOperationNode(input)).toBe(createHash('sha256').update(expected, 'utf8').digest('hex'))
    expect(() => canonicalContentNode({...input, nodeId: input.id})).toThrow('INVALID_NODE_PAYLOAD')
  })
  it('uses the operation id and the same NFC, class and object-key ordering', async () => {
    const common = {parentId: 'route-1', index: 1, type: 'task', class: ['\uE000', '😀', 'e\u0301', 'é'],
      value: 'Cafe\u0301', data: {'\uE000': 'a', '😀': 'b', maxTimes: '2'}}
    const operation = {...common, id: 'task-1', nodeId: 'must-not-be-used', hash: 'old', childHashes: ['ignored']}
    const content = {...common, nodeId: 'task-1'}
    const before = JSON.stringify(operation)
    expect(canonicalOperationNode(operation)).toBe(canonicalContentNode(content))
    expect(await hashOperationNode(operation)).toBe(await hashContentNode(content))
    expect(JSON.stringify(operation)).toBe(before)
  })
  it('rejects missing identity, omitted parent and NFC-colliding data keys', () => {
    const input = {id: 'task', parentId: 'route', index: 0, type: 'task', class: [], value: '', data: {}}
    expect(() => canonicalOperationNode({...input, id: '', nodeId: 'not-a-fallback'})).toThrow('INVALID_NODE_PAYLOAD')
    expect(() => canonicalOperationNode({...input, parentId: undefined})).toThrow('INVALID_NODE_PAYLOAD')
    expect(() => canonicalOperationNode({...input, data: {'é': true, 'e\u0301': false}})).toThrow('NFC_KEY_COLLISION')
  })
})
