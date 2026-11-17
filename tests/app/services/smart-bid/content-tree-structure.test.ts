import {describe, expect, it} from 'vitest'
import {validateContentTreeStructure} from '@/services/smart-bid/content-tree-structure'

const nodes = [
  {nodeId: 'book', parentId: 'project', index: 0, type: 'document'},
  {nodeId: 'chapter', parentId: 'book', index: 0, type: 'chapter'},
  {nodeId: 'title', parentId: 'chapter', index: 0, type: 'heading'},
  {nodeId: 'text', parentId: 'chapter', index: 1, type: 'paragraph'},
]
describe('bidding content tree structure', () => {
  it('allows an empty project and one valid logical book', () => {
    expect(validateContentTreeStructure({projectId: 'project', nodes: []})).toEqual([])
    expect(validateContentTreeStructure({projectId: 'project', nodes})).toEqual([])
  })
  it('rejects a missing parent, duplicate identity and discontinuous order', () => {
    expect(validateContentTreeStructure({projectId: 'project', nodes: [...nodes, {...nodes[3]!, parentId: 'missing', index: 4}]}).length).toBeGreaterThan(0)
  })
  it('requires the first chapter child to be its sole heading', () => {
    expect(validateContentTreeStructure({projectId: 'project', nodes: nodes.filter(node => node.type !== 'heading')})).toContain('CHAPTER_HEADING:chapter')
  })
  it('rejects a cycle even when every parent exists', () => {
    expect(validateContentTreeStructure({projectId: 'project', nodes: nodes.map(node => node.nodeId === 'chapter' ? {...node, parentId: 'chapter'} : node)})).toContain('CYCLE:chapter')
  })
  it.each([
    {label: 'orphan', change: {parentId: 'missing'}, code: 'PARENT:text'},
    {label: 'negative order', change: {index: -1}, code: 'ORDER:chapter'},
    {label: 'gap', change: {index: 3}, code: 'ORDER:chapter'},
    {label: 'unknown type', change: {type: '__proto__'}, code: 'TYPE:text'},
  ])('rejects $label independently', ({change, code}) => {
    expect(validateContentTreeStructure({projectId: 'project', nodes: nodes.map(node => node.nodeId === 'text' ? {...node, ...change} : node)})).toContain(code)
  })
  it('rejects an unknown container type without throwing', () => {
    expect(validateContentTreeStructure({projectId: 'project', nodes: nodes.map(node => node.nodeId === 'chapter' ? {...node, type: '__proto__'} : node)})).toContain('TYPE:chapter')
  })
  it('accepts six chapter levels and rejects the seventh', () => {
    const tree = [{nodeId: 'book', parentId: 'project', index: 0, type: 'document'}]
    for (let depth = 1; depth <= 7; depth++) {
      tree.push({nodeId: `c${depth}`, parentId: depth === 1 ? 'book' : `c${depth - 1}`, index: depth === 1 ? 0 : 1, type: 'chapter'})
      tree.push({nodeId: `h${depth}`, parentId: `c${depth}`, index: 0, type: 'heading'})
      if (depth === 6) expect(validateContentTreeStructure({projectId: 'project', nodes: tree})).toEqual([])
    }
    expect(validateContentTreeStructure({projectId: 'project', nodes: tree})).toContain('CHAPTER_DEPTH:c7')
  })
  it('requires a table of contents to precede chapters', () => {
    expect(validateContentTreeStructure({projectId: 'project', nodes: [...nodes, {nodeId: 'toc', parentId: 'book', index: 1, type: 'toc'}]})).toContain('DOCUMENT:book')
  })
})
