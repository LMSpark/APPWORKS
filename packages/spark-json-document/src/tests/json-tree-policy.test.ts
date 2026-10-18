import {describe, expect, it} from 'vitest'
import {addChildNode, addSiblingNode, buildTreeModel, deleteNode, exportJsonDocument, renameNodeKey, rootOf, toDisplayRows, updateNodeType, type JsonTreePolicy} from '../index'

const boundary: JsonTreePolicy = {
  canAddChild: path => path.length > 0,
  canEditKey: path => path.length > 1 && typeof path.at(-1) === 'string',
  isProtected: path => path.length === 1,
}
describe('JSON tree structural policy', () => {
  it.each([{value: {}}, {value: []}])('protects the wrapper while keeping children editable for $value', ({value}) => {
    const model = buildTreeModel({value}), root = rootOf(model)
    const row = toDisplayRows(model, boundary).find(node => node.path.length === 1)!
    expect(toDisplayRows(model, boundary)[0]).toMatchObject({childAddable: false, siblingAddable: false})
    expect(row).toMatchObject({childAddable: true, siblingAddable: false, deletable: false, keyEditable: false, typeEditable: true})
    for (const result of [addChildNode(model, root, boundary), addSiblingNode(model, root, boundary), addSiblingNode(model, row.id, boundary), deleteNode(model, row.id, boundary), renameNodeKey({model, uid: row.id, nextKeyInput: 'other', policy: boundary})]) expect(result.model).toBe(model)
    const added = addChildNode(model, row.id, boundary)
    expect(added.model).not.toBe(model)
    expect(deleteNode(added.model, added.focusId, boundary).model.size).toBe(model.size)
    expect(exportJsonDocument(model)).toEqual({value})
  })
  it('checks sibling insertion against its parent container and preserves array order', () => {
    const model = buildTreeModel({items: ['a', 'b']})
    const row = toDisplayRows(model).find(node => JSON.stringify(node.path) === '["items",0]')!
    const denied: JsonTreePolicy = {canAddChild: path => path[0] !== 'items'}
    expect(toDisplayRows(model, denied).find(node => node.id === row.id)?.siblingAddable).toBe(false)
    expect(addSiblingNode(model, row.id, denied).model).toBe(model)
    const added = addSiblingNode(model, row.id)
    expect(exportJsonDocument(added.model)).toEqual({items: ['a', '', 'b']})
    expect(exportJsonDocument(deleteNode(added.model, added.focusId).model)).toEqual({items: ['a', 'b']})
  })
  it('keeps default root insertion and does not interpret deletion protection as insertion protection', () => {
    const model = buildTreeModel({value: {}}), rows = toDisplayRows(model, {isProtected: () => true})
    expect(rows[0]?.childAddable).toBe(true)
    expect(rows[1]).toMatchObject({childAddable: true, siblingAddable: true, deletable: false})
    expect(exportJsonDocument(addChildNode(model, rootOf(model)).model)).toEqual({value: {}, newKey: ''})
    expect(exportJsonDocument(addChildNode(model, rows[1]!.id, {isProtected: () => true}).model)).toEqual({value: {newKey: ''}})
  })
  it('allows changing the protected value type without removing or renaming its identity', () => {
    const model = buildTreeModel({value: {old: 1}}), value = toDisplayRows(model).find(row => row.path.length === 1)!
    const changed = updateNodeType({model, uid: value.id, nextType: 'boolean', policy: boundary})
    expect(exportJsonDocument(changed.model)).toEqual({value: false})
    expect(toDisplayRows(changed.model, boundary).find(row => row.id === value.id)).toMatchObject({childAddable: false, siblingAddable: false, deletable: false, typeEditable: true})
  })
})
