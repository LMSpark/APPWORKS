import { describe, expect, it, vi } from 'vitest'
import { DataSet } from '../../../dataset'
import type { DataRow, DataSetMetadata } from '../../../types'

type Command = { changes: ReadonlyArray<{ identity: { metaName: string }; changes: { added?: readonly DataRow[]; changed?: readonly DataRow[] } }> }

let sequence = 0
function query(tableName: string, rows: DataRow[]) {
  return {
    rows, total: rows.length,
    assertIdentity(identity: { scenarioId: string; metaName: string }) {
      if (identity.scenarioId !== 'SPACE' || identity.metaName !== tableName) throw new Error('identity mismatch')
    },
    rowKey: (row: DataRow) => row['id'],
    prepareNewRow: (row: DataRow) => ({ ...row, id: `NEW${++sequence}` }),
    fieldAccess: () => ({ read: 'visible' as const, write: 'allowed' as const,
      component: 'editable' as const, required: false, writeMode: 'editable' as const }),
    readFieldAccess: () => 'visible' as const,
    addActionState: (available?: boolean) => available === false ? 'disabled' as const : 'enabled' as const,
    editActionState: () => 'enabled' as const,
    deleteActionState: (_key: unknown, available?: boolean) => available === false ? 'disabled' as const : 'enabled' as const,
    createChildActionState: () => 'enabled' as const, viewActionState: () => 'enabled' as const,
  }
}

/** 每个表的远端行；filter 读取本次查询上下文，模拟来源按调用参数限定范围。 */
type Source = Readonly<{ rows: DataRow[]; filter?: (row: DataRow, context: Record<string, unknown>) => boolean }>

async function open(tables: DataSetMetadata['tables'], sources: Record<string, Source>, extra?: Partial<DataSetMetadata>) {
  const dataSet = DataSet.fromJson({ scenarioId: 'SPACE', dataSetName: 'SPACE', tables, ...extra })
  const save = vi.fn(async (_command: Command): Promise<never> => { throw new Error('owner reached') })
  for (const [tableName, table] of Object.entries(tables)) {
    for (const viewId of Object.keys(table.views ?? {})) {
      dataSet.getView(tableName, viewId)!.bindQueryExecutor({ save, executeQuery: async (_view, params) => {
        const source = sources[tableName] ?? { rows: [] }
        const context = { ...params?.context }
        return query(tableName, source.rows.filter(row => source.filter?.(row, context) ?? true).map(row => ({ ...row })))
      } })
    }
  }
  return { dataSet, save }
}

const id = { name: 'id', type: 'string', isPrimaryKey: true }
const model = (name: string) => ({ modelId: name, modelName: name })

describe('declared save rules', () => {
  it('rejects or normalizes surrounding whitespace and treats blank text as empty', async () => {
    const { dataSet, save } = await open({ Items: { modelBinding: model('Items'), columns: [id,
      { name: 'code', type: 'string', trim: 'reject' }, { name: 'title', type: 'string', required: true, trim: 'normalize' }],
    views: { default: { commitMode: 'staged' } } } }, { Items: { rows: [{ id: '1', code: 'A', title: 'T' }] } })
    try {
      const view = dataSet.getView('Items')!
      await view.loadFromServer()
      view.updateEditingValue('1', 'code', ' A ')
      await expect(dataSet.saveChanges()).rejects.toThrow('Items@default.code')
      view.updateEditingValue('1', 'code', 'B')
      view.updateEditingValue('1', 'title', '   ')
      await expect(dataSet.saveChanges()).rejects.toThrow('Items@default.title')
      view.updateEditingValue('1', 'title', '  New  ')
      await expect(dataSet.saveChanges()).rejects.toThrow('owner reached')
      expect(save.mock.calls[0]![0].changes[0]!.changes.changed![0]).toMatchObject({ code: 'B', title: 'New' })
    } finally { dataSet.destroy() }
  })

  it('checks uniqueness across retained rows, immutability after creation and the declared field range', async () => {
    const { dataSet, save } = await open({ Items: { modelBinding: model('Items'), columns: [id,
      { name: 'name', type: 'string', unique: true, immutable: true }, { name: 'desc', type: 'string' }, { name: 'secret', type: 'string' }],
    views: { default: { commitMode: 'staged', queryConfig: { fields: ['id', 'name', 'desc'] } } } } },
    { Items: { rows: [{ id: '1', name: 'a', desc: '', secret: '' }, { id: '2', name: 'b', desc: '', secret: '' }] } })
    try {
      const view = dataSet.getView('Items')!
      await view.loadFromServer()
      expect(view.fieldAccess(view.getRowById('1'), 'name').write).toBe('denied')
      const created = await view.addRow({ name: 'a' })
      expect(view.fieldAccess(created, 'name').write).toBe('allowed')
      await expect(dataSet.saveChanges()).rejects.toThrow('Items@default.name: name 重复：a')
      view.updateRowById(view.getPkKey(created)!, { name: 'c' })
      await view.editRowById('1', { name: 'z' })
      await expect(dataSet.saveChanges()).rejects.toThrow('创建后不能修改')
      await view.editRowById('1', { name: 'a', secret: 'x' })
      await expect(dataSet.saveChanges()).rejects.toThrow('Items@default.secret: 字段不在当前视图的保存范围内')
      await view.editRowById('1', { secret: '', desc: 'ok' })
      await expect(dataSet.saveChanges()).rejects.toThrow('owner reached')
      expect(save).toHaveBeenCalledTimes(1)
    } finally { dataSet.destroy() }
  })

  it('disables deletion of existing rows while still allowing a local draft to be withdrawn', async () => {
    const { dataSet } = await open({ Items: { modelBinding: model('Items'), columns: [id],
      views: { default: { commitMode: 'staged', allowDelete: false } } } }, { Items: { rows: [{ id: '1' }] } })
    try {
      const view = dataSet.getView('Items')!
      await view.loadFromServer()
      expect(view.deleteActionState(view.getRowById('1'))).toBe('disabled')
      await expect(view.removeRow('1')).rejects.toThrow('DATA_VIEW_DELETE_DISABLED')
      const draft = await view.addRow({})
      await expect(view.removeRow(view.getPkKey(draft)!)).resolves.toBe(true)
      expect(view.toJson().allowDelete).toBe(false)
    } finally { dataSet.destroy() }
  })

  it('validates option references with row context and fills matched option fields before capture', async () => {
    const { dataSet, save } = await open({
      Params: { modelBinding: model('Params'), columns: [id, { name: 'interfaceId', type: 'string', required: true,
        optionsView: { tableName: 'Apis', valueField: 'rowid', fill: { interfaceName: 'Name' } } },
      { name: 'output', type: 'string', optionsView: { tableName: 'Fields', valueField: 'enname', context: { interfaceId: 'interfaceId' } } },
      { name: 'interfaceName', type: 'string' }], views: { default: { commitMode: 'staged' } } },
      Apis: { modelBinding: model('Apis'), columns: [{ name: 'rowid', type: 'string', isPrimaryKey: true }, { name: 'Name', type: 'string' }], views: { default: {} } },
      Fields: { modelBinding: model('Fields'), columns: [{ name: 'rowid', type: 'string', isPrimaryKey: true }, { name: 'tblid', type: 'string' }, { name: 'enname', type: 'string' }], views: { default: {} } },
    }, {
      Params: { rows: [] },
      Apis: { rows: [{ rowid: 'A1', Name: 'Api one' }] },
      Fields: { rows: [{ rowid: 'F1', tblid: 'A1', enname: 'token' }], filter: (row, context) => row['tblid'] === context['interfaceId'] },
    })
    try {
      const view = dataSet.getView('Params')!
      await view.loadFromServer()
      const row = await view.addRow({ interfaceId: 'MISSING' })
      const key = view.getPkKey(row)!
      await expect(dataSet.saveChanges()).rejects.toThrow('Params@default.interfaceId: interfaceId 不在当前可选范围内或不唯一')
      view.updateEditingValue(key, 'interfaceId', 'A1')
      view.updateEditingValue(key, 'output', 'absent')
      await expect(dataSet.saveChanges()).rejects.toThrow('Params@default.output')
      view.updateEditingValue(key, 'output', 'token')
      await expect(dataSet.saveChanges()).rejects.toThrow('owner reached')
      expect(save.mock.calls[0]![0].changes[0]!.changes.added![0]).toMatchObject({ interfaceId: 'A1', output: 'token', interfaceName: 'Api one' })
    } finally { dataSet.destroy() }
  })

  it('preserves edits made while option fill is awaiting its source', async () => {
    const {dataSet, save} = await open({
      Params: {modelBinding: model('Params'), columns: [id,
        {name: 'source', type: 'string', optionsView: {tableName: 'Apis', valueField: 'id', fill: {title: 'title'}}},
        {name: 'title', type: 'string'}], views: {default: {commitMode: 'staged'}}},
      Apis: {modelBinding: model('Apis'), columns: [id, {name: 'title', type: 'string'}], views: {default: {}}},
    }, {Params: {rows: [{id: '1', source: '', title: ''}]}})
    try {
      const view = dataSet.getView('Params')!
      await view.refresh()
      let release = () => {}
      let entered = () => {}
      const started = new Promise<void>(resolve => {entered = resolve})
      const gate = new Promise<void>(resolve => {release = resolve})
      vi.spyOn(dataSet.getView('Apis')!, 'queryOptionRows').mockImplementation(async () => {
        entered(); await gate
        return [{id: 'A1', title: 'Old title'}, {id: 'A2', title: 'New title'}]
      })
      view.updateEditingValue('1', 'source', 'A1')
      const saving = dataSet.saveChanges()
      const rejected = expect(saving).rejects.toThrow('DATA_VIEW_SAVE_STALE')
      await started
      view.updateEditingValue('1', 'source', 'A2')
      view.updateEditingValue('1', 'title', 'User edit')
      release()
      await rejected
      expect(view.getEditingRow('1')).toMatchObject({source: 'A2', title: 'User edit'})
      expect(save).not.toHaveBeenCalled()
    } finally {dataSet.destroy()}
  })

  it('rechecks an earlier prepared view when a later view awaits options', async () => {
    const params = (name: string) => ({modelBinding: model(name), columns: [id,
      {name: 'source', type: 'string' as const, optionsView: {tableName: `${name}Options`, valueField: 'id', fill: {title: 'title'}}},
      {name: 'title', type: 'string' as const}], views: {default: {commitMode: 'staged' as const}}})
    const options = (name: string) => ({modelBinding: model(name), columns: [id, {name: 'title', type: 'string' as const}], views: {default: {}}})
    const {dataSet, save} = await open({A: params('A'), B: params('B'), AOptions: options('AOptions'), BOptions: options('BOptions')},
      {A: {rows: [{id: '1', source: '', title: ''}]}, B: {rows: [{id: '2', source: '', title: ''}]}})
    try {
      const first = dataSet.getView('A')!, second = dataSet.getView('B')!
      await first.refresh(); await second.refresh()
      const rows = [{id: 'A1', title: 'Old title'}, {id: 'A2', title: 'New title'}]
      vi.spyOn(dataSet.getView('AOptions')!, 'queryOptionRows').mockResolvedValue(rows)
      let release = () => {}, entered = () => {}
      const started = new Promise<void>(resolve => {entered = resolve})
      const gate = new Promise<void>(resolve => {release = resolve})
      vi.spyOn(dataSet.getView('BOptions')!, 'queryOptionRows').mockImplementation(async () => {entered(); await gate; return rows})
      first.updateEditingValue('1', 'source', 'A1'); second.updateEditingValue('2', 'source', 'A1')
      const rejected = expect(dataSet.saveChanges()).rejects.toThrow('DATA_VIEW_SAVE_STALE')
      await started
      first.updateEditingValue('1', 'source', 'A2')
      first.updateEditingValue('1', 'title', 'User edit')
      release()
      await rejected
      expect(first.getEditingRow('1')).toMatchObject({source: 'A2', title: 'User edit'})
      expect(save).not.toHaveBeenCalled()
    } finally {dataSet.destroy()}
  })

  it('validates value functions against declared candidate sources', async () => {
    const { dataSet, save } = await open({
      Headers: { modelBinding: model('Headers'), columns: [id,
        { name: 'value', type: 'string', valueFunction: { format: 'text', capabilities: ['huoshan'],
          sources: { apiPublicParams: { tableName: 'Publics', valueField: 'paramName', labelField: 'desc' } } } },
        { name: 'body', type: 'string', valueFunction: { format: 'json-object' } }],
      views: { default: { commitMode: 'staged' } } },
      Publics: { modelBinding: model('Publics'), columns: [{ name: 'rowid', type: 'string', isPrimaryKey: true },
        { name: 'paramName', type: 'string' }, { name: 'desc', type: 'string' }], views: { default: {} } },
    }, { Headers: { rows: [{ id: '1', value: 'plain', body: '' }] }, Publics: { rows: [{ rowid: 'P', paramName: 'token', desc: 'Token' }] } })
    try {
      const view = dataSet.getView('Headers')!
      await view.loadFromServer()
      view.updateEditingValue('1', 'body', '[1]')
      await expect(dataSet.saveChanges()).rejects.toThrow('Headers@default.body: 须为JSON对象')
      view.updateEditingValue('1', 'body', '{"a":"b"}')
      view.updateEditingValue('1', 'value', JSON.stringify({ Type: 'GetApiPublicParam', ParamName: 'other' }))
      await expect(dataSet.saveChanges()).rejects.toThrow('Headers@default.value')
      view.updateEditingValue('1', 'value', 'just text')
      await expect(dataSet.saveChanges()).rejects.toThrow('owner reached')
      expect(save).toHaveBeenCalledTimes(1)
    } finally { dataSet.destroy() }
  })
})

describe('declared view operations', () => {
  const tables = {
    Apis: { modelBinding: model('Apis'), columns: [id, { name: 'ProviderID', type: 'string' }, { name: 'Name', type: 'string' }],
      views: { default: { commitMode: 'staged' as const, lockCurrentWhilePending: true, queryContext: { providerId: 'P1' },
        filterExpression: { field: 'ProviderID', operator: 'eq' as const, value: { Type: 'GetInputParam', ParamName: 'providerId' } } } } },
    Params: { modelBinding: model('Params'), columns: [id, { name: 'pid', type: 'string' }, { name: 'parname', type: 'string' }],
      views: { default: { commitMode: 'staged' as const } } },
  }
  const sources: Record<string, Source> = {
    Apis: { rows: [{ id: 'A1', ProviderID: 'P1', Name: 'one' }, { id: 'A2', ProviderID: 'P1', Name: 'two' }] },
    Params: { rows: [{ id: 'X', pid: 'A1', parname: 'x' }] },
  }
  const cascades = [{ kind: 'query' as const, cascadeId: 'apis-params', parentTable: 'Apis', parentViewId: 'default',
    childTable: 'Params', childViewId: 'default', filterBindings: [{ targetField: 'pid' }], autoLoad: false }]

  it('fills ownership from the view scope and gates child additions while the parent is a local draft', async () => {
    const { dataSet } = await open(tables, sources, { viewCascades: cascades })
    try {
      const apis = dataSet.getView('Apis')!, params = dataSet.getView('Params')!
      await apis.loadFromServer(); await params.loadFromServer()
      apis.setCurrentRowById('A1'); apis.setSelectedRows([apis.getRowById('A1')!])
      expect((await params.addRow({}))).toMatchObject({ pid: 'A1' })
      params.discardPendingChanges()
      const draft = await apis.addRow({})
      expect(draft).toMatchObject({ ProviderID: 'P1' })
      apis.setCurrentRow(draft); apis.setSelectedRows([draft])
      expect(params.addActionState()).toBe('disabled')
      await expect(params.addRow({})).rejects.toThrow('DATA_VIEW_ADD_PARENT_PENDING')
    } finally { dataSet.destroy() }
  })

  it('locks the current row while the view or its query children are pending and reloads after discarding', async () => {
    const { dataSet } = await open(tables, sources, { viewCascades: cascades })
    try {
      const apis = dataSet.getView('Apis')!, params = dataSet.getView('Params')!
      await apis.loadFromServer(); await params.loadFromServer()
      apis.setCurrentRowById('A1')
      params.updateEditingValue('X', 'parname', 'changed')
      expect(() => apis.setCurrentRowById('A2')).toThrow('DATA_VIEW_SELECTION_LOCKED')
      expect(apis.currentRow?.['id']).toBe('A1')
      await dataSet.discardAndReload({ views: [{ tableName: 'Params', viewId: 'default' }] })
      expect(params.hasEditingChanges()).toBe(false)
      apis.setCurrentRowById('A2')
      expect(apis.currentRow?.['id']).toBe('A2')
      await apis.editRowById('A2', { Name: 'renamed' })
      await apis.discardAndReload()
      expect(apis.getRowById('A2')?.['Name']).toBe('two')
    } finally { dataSet.destroy() }
  })
})
