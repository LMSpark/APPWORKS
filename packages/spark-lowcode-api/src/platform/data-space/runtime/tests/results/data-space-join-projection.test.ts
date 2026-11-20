import {afterEach, describe, expect, it, vi} from 'vitest'
import {DataSet, type DataColumn} from '@spark-appworks/spark-data'
import {DataSpaceQueryTable} from '../../protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../query/data-space-query-context'

const identity = {scenarioId: 'SPACE', metaName: 'Orders'}
const columns: DataColumn[] = [{name: 'rowid', type: 'string', isPrimaryKey: true},
  {name: 'childCaption', type: 'string', label: '子标题'}]
const sets: DataSet[] = []
afterEach(() => sets.splice(0).forEach(set => set.destroy()))

function result(count: number, signed = false, join = true) {
  const rows = Array.from({length: count}, (_, index) => ({rowid: 'PARENT',
    ...join ? {childCaption: `Child ${index}`} : {rootLabel: 'Entity'},
    ...signed ? {lingma_sys_key: 'ROW_RECEIPT', lingma_sys_params: {e: ['rowid', join ? 'childCaption' : 'rootLabel'], r: [], h: [], m: [], d: true, c: true}} : {}}))
  return new DataSpaceQueryContext({identity, scope: 'SCOPE', readScope: () => 'SCOPE',
    ...join ? {resultKind: 'join' as const, columns} : {},
    snapshot: new DataSpaceQueryTable(identity).applyResult({Result: {
      data: {Items: rows, Count: count}, primaryKeyField: 'rowid', allowAdd: true, lingma_sys_key: 'TABLE_RECEIPT',
    }})})
}

function setup() {
  const ds = DataSet.fromJson({scenarioId: 'SPACE', tables: {Orders: {
    tableName: 'Orders', resourceType: 'database-table', modelBinding: {modelId: 'MODEL', modelName: 'Orders'},
    columns: [{name: 'rowid', type: 'string', isPrimaryKey: true}, {name: 'rootLabel', type: 'string'}],
    views: {default: {autoCurrentFirst: false, autoSelectFirst: false}, sibling: {}},
  }}})
  sets.push(ds)
  return {ds, view: ds.getView('Orders')!, sibling: ds.getView('Orders', 'sibling')!}
}

describe('joined query results retain source identity without acquiring entity operations', () => {
  it.each([0, 1, 2].flatMap(count => [false, true].map(signed => ({count, signed}))))(
    'keeps $count joined rows read-only from context construction (signed=$signed)', ({count, signed}) => {
      const context = result(count, signed)
      expect(context.resultKind).toBe('join')
      expect(context.reportedPrimaryKey).toBe('rowid')
      expect(context.resultPrimaryKey).toBe('')
      expect(context.rows).toHaveLength(count)
      expect(context.allowAdd).toBe(false)
      expect(context.addActionState()).toBe('hidden')
      for (const row of context.rows) {
        expect(context.rowKey(row)).toBeUndefined()
        expect(context.editActionState(context.rowKey(row))).not.toBe('enabled')
        expect(context.deleteActionState(context.rowKey(row))).not.toBe('enabled')
        expect(context.readFieldAccess(row, 'childCaption')).toBe('visible')
      }
      expect(() => context.prepareNewRow({})).toThrow()
      expect(() => context.prepareNewRowWithIdentity({}, {field: 'rowid', value: 'NEW'})).toThrow()
      for (const changes of [{added: [{rowid: 'NEW'}]}, {changed: [{rowid: 'PARENT', childCaption: 'changed'}]}, {deleted: [{rowid: 'PARENT'}]}]) {
        expect(() => context.prepareSaveChanges(changes)).toThrow('READONLY')
        expect(() => context.buildSaveRequest(changes)).toThrow('READONLY')
      }
    })

  it('binds all joined rows and formal result columns to one view without changing the shared model', async () => {
    const {ds, view, sibling} = setup(), baseline = JSON.stringify(ds.toJson())
    const save = vi.fn(), context = result(2)
    view.bindQueryExecutor({executeQuery: async () => context, save})
    await view.loadFromServer()
    expect(view.rows).toHaveLength(2)
    expect(view.columns.map(column => column.name)).toEqual(['rowid', 'childCaption'])
    expect(view.getColumn('childCaption')?.label).toBe('子标题')
    expect(view.getColumn('rootLabel')).toBeUndefined()
    expect(view.primaryKey).toBe('')
    expect(view.resultKind).toBe('join')
    expect(view.reportedPrimaryKey).toBe('rowid')
    expect(view.getPkKey(view.rows[0]!)).toBeUndefined()
    expect(view.buildServerPk(view.rows[1]!)).toEqual({})
    const second = view.rows[1]!
    view.setCurrentRow(second); view.setSelectedRows([second])
    expect(view.currentRow).toBe(second)
    expect(view.selectedRows).toEqual([second])
    expect(view.fieldAccess(second, 'childCaption')).toMatchObject({read: 'visible', write: 'denied'})
    expect(view.newRowFieldAccess('childCaption').write).toBe('denied')
    await expect(view.addRow({childCaption: 'new'})).rejects.toThrow('READONLY')
    await expect(view.removeRow('PARENT')).rejects.toThrow('READONLY')
    expect(save).not.toHaveBeenCalled()
    expect(sibling.columns.some(column => column.name === 'childCaption')).toBe(false)
    expect(JSON.stringify(ds.toJson())).toBe(baseline)
    await view.refresh()
    expect(view.currentRow).toBeNull()
    expect(view.selectedRows).toEqual([])
  })

  it('replaces rows and columns atomically and restores entity identity only after a successful entity query', async () => {
    const {view} = setup()
    let mode: 'join' | 'fail' | 'entity' = 'join'
    view.bindQueryExecutor({executeQuery: async () => {
      if (mode === 'fail') throw new Error('expected source failure')
      return result(1, true, mode === 'join')
    }})
    await view.loadFromServer()
    const previousRows = view.rows
    mode = 'fail'
    await expect(view.loadFromServer()).rejects.toThrow('expected source failure')
    expect(view.rows).toBe(previousRows)
    expect(view.getColumn('childCaption')).toBeDefined()
    expect(view.primaryKey).toBe('')
    mode = 'entity'; await view.refresh()
    expect(view.getColumn('childCaption')).toBeUndefined()
    expect(view.getColumn('rootLabel')).toBeDefined()
    expect(view.primaryKey).toBe('rowid')
    expect(view.editActionState(view.rows[0]!)).toBe('enabled')
  })

  it('releases result columns and their lookup index when the current result is reset', async () => {
    const {view} = setup()
    view.bindQueryExecutor({executeQuery: async () => result(2)})
    await view.loadFromServer()
    view.resetState()
    expect(view.columns.some(column => column.name === 'childCaption')).toBe(false)
    expect(view.getColumn('childCaption')).toBeUndefined()
    expect(view.getColumn('rootLabel')).toBeDefined()
    expect(view.resultKind).toBeUndefined()
    expect(view.reportedPrimaryKey).toBeUndefined()
    expect(view.primaryKey).toBe('rowid')
  })

  it('consumes each exact original row read state even when the source entity key repeats', async () => {
    const {view} = setup()
    const rows = [true, false].map(hidden => ({rowid: 'PARENT', childCaption: 'private', lingma_sys_key: 'ROW_RECEIPT',
      lingma_sys_params: {e: ['childCaption'], r: [], h: hidden ? ['childCaption'] : [], m: hidden ? [] : ['childCaption'], d: true, c: true}}))
    const context = new DataSpaceQueryContext({identity, scope: 'SCOPE', readScope: () => 'SCOPE', resultKind: 'join', columns,
      snapshot: new DataSpaceQueryTable(identity).applyResult({Result: {data: {Items: rows, Count: 2}, primaryKeyField: 'rowid'}})})
    view.bindQueryExecutor({executeQuery: async () => context})
    await view.loadFromServer()
    expect(view.fieldAccess(view.rows[0]!, 'childCaption')).toMatchObject({read: 'invisible', write: 'denied'})
    expect(view.fieldAccess(view.rows[1]!, 'childCaption')).toMatchObject({read: 'masked', write: 'denied'})
    expect(view.fieldAccess({...view.rows[1]}, 'childCaption').read).toBe('invisible')
  })

  it('rejects duplicate result columns before replacing the current rows or column index', async () => {
    const {view} = setup()
    let invalid = false
    view.bindQueryExecutor({executeQuery: async () => invalid ? new DataSpaceQueryContext({identity, scope: 'SCOPE',
      readScope: () => 'SCOPE', resultKind: 'join', columns: [columns[0]!, columns[0]!],
      snapshot: new DataSpaceQueryTable(identity).applyResult({Result: {data: {Items: [], Count: 0}, primaryKeyField: 'rowid'}})}) : result(2)})
    await view.loadFromServer()
    const previous = view.rows
    invalid = true
    await expect(view.loadFromServer()).rejects.toThrow('DATA_VIEW_RESULT_COLUMNS')
    expect(view.rows).toBe(previous)
    expect(view.getColumn('childCaption')?.label).toBe('子标题')
    expect(view.resultKind).toBe('join')
  })

  it('rolls back the result column index if ingestion fails after accepting a different result shape', async () => {
    const {view} = setup()
    let entity = false
    view.bindQueryExecutor({executeQuery: async () => result(1, true, !entity)})
    await view.loadFromServer()
    const previous = view.rows
    entity = true
    vi.spyOn(view, 'updateFromServer').mockImplementationOnce(() => {throw new Error('expected ingestion failure')})
    await expect(view.loadFromServer()).rejects.toThrow('expected ingestion failure')
    expect(view.rows).toBe(previous)
    expect(view.getColumn('childCaption')).toBeDefined()
    expect(view.getColumn('rootLabel')).toBeUndefined()
    expect(view.primaryKey).toBe('')
  })

  it('keeps ordinary entity defaults and copies projected column metadata', () => {
    expect(result(1, false, false).editActionState('PARENT')).toBe('enabled')
    const projected = result(1)
    const before = columns[1]!.label ?? ''
    columns[1]!.label = 'changed after capture'
    expect(projected.columns?.[1]?.label).toBe(before)
    columns[1]!.label = before
  })

  it('does not present undeclared payload fields as projected columns', async () => {
    const {view} = setup()
    const context = new DataSpaceQueryContext({identity, scope: 'SCOPE', readScope: () => 'SCOPE', resultKind: 'join', columns,
      snapshot: new DataSpaceQueryTable(identity).applyResult({Result: {
        data: {Items: [{rowid: 'PARENT', childCaption: 'caption', undeclared: 'not an output'}], Count: 1}, primaryKeyField: 'rowid',
      }})})
    view.bindQueryExecutor({executeQuery: async () => context})
    await view.loadFromServer()
    expect(view.fieldAccess(view.rows[0]!, 'undeclared')).toMatchObject({read: 'invisible', write: 'denied'})
  })
})
