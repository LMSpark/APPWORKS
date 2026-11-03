import {DataSpaceQueryNested, type DataSpaceQueryNestedNode} from '../query/data-space-query-nested'
import {DataSpaceDesignApi} from '../../design/data-space-design-api'
import {describe, expect, it} from 'vitest'
import {DataSpaceQueryContext} from '../query/data-space-query-context'
import {DataSpaceQueryTable} from '../protocol/data-space-query-table'

const identity = {scenarioId: 'SPACE', metaName: 'Parent'}
describe('independent nested readonly result semantics', () => {
  it.each(['navigation', 'hierarchy'] as const)('never adopts signed entity writes for %s', resultKind => {
    const snapshot = new DataSpaceQueryTable(identity).applyResult({Result: {primaryKeyField: 'id', allowAdd: true,
      lingma_sys_key: 'TABLE', data: {Items: [{id: 'P', Name: 'parent', lingma_sys_key: 'ROW',
        lingma_sys_params: {e: ['Name'], d: true}}], Count: 1}}})
    const context = new DataSpaceQueryContext({identity, snapshot, scope: 'S', readScope: () => 'S', resultKind})
    expect(context.resultKind).toBe(resultKind)
    expect(context.resultPrimaryKey).toBe('')
    expect(context.readFieldAccess(context.rows[0]!, 'Name')).toBe('visible')
    expect(context.addActionState()).not.toBe('enabled')
    expect(context.editActionState('P')).not.toBe('enabled')
    expect(() => context.prepareSaveChanges({changed: [{id: 'P', Name: 'edited'}]})).toThrow()
    expect(() => context.prepareNewRow({Name: 'new'})).toThrow()
  })
})


function node(metaName: string, children: readonly DataSpaceQueryNestedNode[] = []): DataSpaceQueryNestedNode {
  const model = DataSpaceDesignApi.projectModel({rowid: metaName, Name: metaName, MetaName: metaName, DbId: 'DB', Type: '表', PrimaryKeyFields: 'id'},
    ['id', 'Name', 'secret', 'phone'].map(Name => ({rowid: metaName + Name, dataModelId: metaName, Name, FieldType: 'string', IsOutput: 1, IsPKey: Name === 'id' ? 1 : 0})), '')
  return {model, columns: ['id', 'Name', 'secret', 'phone'].map(name => ({name, type: 'string'})), children}
}
function nested(mode: 'navigation' | 'hierarchy' = 'navigation') {
  let scope = 'S'
  const child = {id: 'C', Name: 'child', secret: 'hidden child', phone: 'masked child', lingma_sys_key: 'CHILD_KEY',
    lingma_sys_params: {h: ['secret'], m: ['phone'], e: ['Name'], d: true}}
  const rows = [{id: 'P', Name: 'parent', lingma_sys_key: 'PARENT_KEY', lingma_sys_params: {h: ['Name']},
    [mode === 'navigation' ? 'Child' : 'Items']: [child]}, {id: 'P', Name: 'same key other parent',
      [mode === 'navigation' ? 'Child' : 'Items']: []}]
  const snapshot = new DataSpaceQueryTable(identity).applyResult({Result: {data: rows}})
  const result = DataSpaceQueryNested.read({identity, snapshot, mode, scope, readScope: () => scope,
    node: node('Parent', [node('Child')]), maxRows: 10})
  return {result, stale: () => {scope = 'NEW'}}
}
describe('nested per-model query owner', () => {
  it.each(['navigation', 'hierarchy'] as const)('splits %s children before publication and consumes their own h/m', mode => {
    const {result, stale} = nested(mode)
    expect(result.rows[0]).not.toHaveProperty(mode === 'navigation' ? 'Child' : 'Items')
    const child = result.childResult(result.rows[0]!, 'Child')
    expect(child.rows[0]?.['Name']).toBe('child')
    expect(child.rows[0]).not.toHaveProperty('lingma_sys_key')
    expect(child.readFieldAccess(child.rows[0]!, 'secret')).toBe('invisible')
    expect(child.readFieldAccess(child.rows[0]!, 'phone')).toBe('masked')
    expect(child.readFieldAccess(child.rows[0]!, 'Name')).toBe('visible')
    expect(result.readFieldAccess(result.rows[0]!, 'Name')).toBe('invisible')
    expect(child.resultPrimaryKey).toBe('')
    expect(child.countReported).toBe(false)
    expect(result.childResult(result.rows[1]!, 'Child').rows).toEqual([])
    expect(result.childResult(null, 'Child').rows).toEqual([])
    expect(() => result.childResult({...result.rows[0]}, 'Child')).toThrow('PARENT')
    expect(() => result.childResult(result.rows[0]!, 'Unknown')).toThrow('MODEL')
    stale(); expect(() => child.rows).toThrow('STALE')
  })
})



describe('nested owner rejection boundaries', () => {
  const read = (rows: Record<string, unknown>[], plan = node('Parent', [node('Child')]), maxRows = 10) => DataSpaceQueryNested.read({
    identity, snapshot: new DataSpaceQueryTable(identity).applyResult({Result: {data: rows}}), node: plan,
    mode: 'navigation', scope: 'S', readScope: () => 'S', maxRows})
  it.each([null, {}, [null], [1], [['nested array']]])('rejects malformed declared children %j', Child => {
    expect(() => read([{id: 'P', Child}])).toThrow('SHAPE')
  })
  it('counts descendants in the same row budget and never truncates', () => {
    expect(() => read([{id: 'P', Child: [{id: 'C1'}, {id: 'C2'}]}], undefined, 2)).toThrow('BUDGET')
  })
  it('rejects collisions and heterogeneous Hierarchy before reading rows', () => {
    const collision = node('Parent', [node('Name')])
    expect(() => DataSpaceQueryNested.validatePlan(collision, 'navigation')).toThrow('PATH')
    expect(() => DataSpaceQueryNested.validatePlan(node('Parent', [node('Child'), node('Other')]), 'hierarchy')).toThrow('MODEL')
  })
  it('preserves the unsupported authorization guard for undeclared JSON values', () => {
    expect(() => read([{id: 'P', secret: {lingma_sys_key: 'MUST_NOT_APPEAR_IN_ERROR'}, Child: []}])).toThrow('SPARK_NESTED_RESULT_UNSUPPORTED')
  })
  it('invalidates descendants when the retained parent context is invalidated', () => {
    const {result} = nested()
    const child = result.childResult(result.rows[0]!, 'Child')
    result.invalidate()
    expect(() => child.rows).toThrow('STALE')
  })
})


it('checks the ancestor scope only once when reading a deep descendant', () => {
  let plan = node('Leaf'), row: Record<string, unknown> = {id: 'L'}, guards = 0
  for (let level = 8; level > 0; level--) {
    row = {id: String(level), [plan.model.metaName]: [row]}
    plan = node(level === 1 ? 'Parent' : `Level${level}`, [plan])
  }
  let context = DataSpaceQueryNested.read({identity, snapshot: new DataSpaceQueryTable(identity).applyResult({Result: {data: [row]}}),
    node: plan, mode: 'navigation', maxRows: 20, scope: 'S', readScope: () => {guards++; return 'S'}})
  let current = plan
  while (current.children[0]) {
    current = current.children[0]
    context = context.childResult(context.rows[0]!, current.model.metaName)
  }
  guards = 0
  expect(context.rows).toHaveLength(1)
  expect(guards).toBe(1)
})


it('matches the query configuration limit of 64 explicit child levels', () => {
  let plan = node('Leaf')
  for (let level = 64; level > 0; level--) plan = node(`Depth${level}`, [plan])
  expect(() => DataSpaceQueryNested.validatePlan(plan, 'navigation')).not.toThrow()
  expect(() => DataSpaceQueryNested.validatePlan(node('Extra', [plan]), 'navigation')).toThrow('BUDGET')
})
