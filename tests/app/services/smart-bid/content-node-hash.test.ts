import {readFileSync} from 'node:fs'
import {describe, expect, it} from 'vitest'
import {canonicalContentNode,canonicalOperationNode, hashContentNode} from '@/services/smart-bid/content-node-hash'

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
  it.each([canonicalContentNode,canonicalOperationNode])('rejects class accessors before reading any array values',canonical=>{
    let reads=0
    const classes:unknown[]=[]
    Object.defineProperty(classes,'0',{enumerable:true,get:()=>{reads++;return 'write'}})
    const input={id:'N',nodeId:'N',parentId:'P',index:0,type:'task',class:classes,value:'',data:{}}
    expect(()=>canonical(input)).toThrow('NON_JSON_ARRAY')
    expect(reads).toBe(0)
    for(const invalid of [new Array<unknown>(1),Object.assign(['write'],{extra:'hidden'}),Object.assign(['write'],{[Symbol('extra')]:true})]){
      expect(()=>canonical({...input,class:invalid})).toThrow('NON_JSON_ARRAY')
    }
  })
  it.each([canonicalContentNode,canonicalOperationNode])('rejects selected envelope accessors but never reads ignored hash metadata',canonical=>{
    const input={id:'N',nodeId:'N',parentId:'P',index:0,type:'task',class:[],value:'',data:{}}
    let reads=0
    const invalid=Object.defineProperty({...input},'value',{enumerable:true,get:()=>{reads++;return 'changed'}})
    expect(()=>canonical(invalid)).toThrow('INVALID_NODE_PAYLOAD')
    expect(reads).toBe(0)
    const metadata=Object.defineProperty({...input},'hash',{enumerable:true,get:()=>{reads++;return 'ignored'}})
    expect(canonical(metadata)).toBe(canonical(input))
    expect(reads).toBe(0)
  })
})
