import {describe, expect, it, vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {HttpClientBase, isRecord, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {DataSpaceRuntimeApi} from '../data-space-runtime-api'
import type {DataSpaceDesignApi} from '../../design/data-space-design-api'

type Model = Awaited<ReturnType<DataSpaceDesignApi['readModel']>>
const model: Model = {id: 'MODEL', metaName: 'Orders', name: 'Orders', sourceName: 'PhysicalOrders', sourceId: 'RESOURCE',
  sourceType: 'table', primaryKey: 'id', businessMain: true, raw: {}, fields: [
    {id: 'KEY', modelId: 'MODEL', name: 'rowid', canonicalName: 'id', type: 'string', primaryKey: true,
      description: '', output: true, computed: false, order: 0, orderType: '', raw: {}},
    {id: 'TITLE', modelId: 'MODEL', name: 'title', canonicalName: 'caption', type: 'string', primaryKey: false,
      description: '', output: true, computed: false, order: 0, orderType: '', raw: {}},
    {id: 'STATE', modelId: 'MODEL', name: 'STATE', canonicalName: 'state', type: 'string', primaryKey: false,
      description: '', output: false, computed: false, order: 0, orderType: '', raw: {}},
    {id: 'COMPUTED', modelId: 'MODEL', name: 'computed', canonicalName: 'computed', type: 'string', primaryKey: false,
      description: '', output: false, computed: true, order: 0, orderType: '', raw: {}},
  ]}

class InputHttp extends HttpClientBase {
  readonly queries: RequestConfig[] = []
  readonly saves: RequestConfig[] = []
  allowAdd = true
  childAdd = false
  lateRows: ReadonlyArray<Readonly<Record<string, unknown>>> | undefined
  saveError: Error | undefined
  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    if (config.url === '/api/DataOperation/GetData') {
      this.queries.push(config)
      return {status: 200, statusText: 'OK', headers: {}, data: {Code: 200, Result: {
        primaryKeyField: 'rowid', allowAdd: this.allowAdd, lingma_sys_key: 'ADD-SIGNED',
        data: {Count: this.lateRows?.length ?? 1, Items: this.lateRows ?? [{id: 'A', caption: 'before', ...(this.childAdd ? {parentId: 'ROOT'} : {}), lingma_sys_key: 'ROW-SIGNED',
          lingma_sys_params: {e: ['caption', 'state', 'parentId'], h: ['state'], c: this.childAdd}}]},
      }}}
    }
    if (config.url !== '/api/DataOperation/BatchTableOperateRequestByCRUD') throw new Error('Unexpected endpoint')
    this.saves.push(config)
    if (this.saveError) throw this.saveError
    const command = Array.isArray(config.data) ? config.data[0] : undefined
    const crud = isRecord(command) ? command['CrudModel'] : undefined
    const rows = isRecord(crud) ? crud['Added'] : undefined
    if (!Array.isArray(rows)) throw new Error('Missing native added batch')
    return {status: 200, statusText: 'OK', headers: {}, data: {Code: 200,
      Result: {maplistadd: [{PhysicalOrders: rows}]}}}
  }
}

function fixture(newRowFields?: readonly string[], child = false) {
  const formal: Model = child ? {...model, raw: {ParentField: 'parent_id', TopValue: 'ROOT'}, fields: [...model.fields,
    {...model.fields[2]!, id: 'PARENT', name: 'parent_id', canonicalName: 'parentId', output: true}]} : model
  const ds = DataSet.fromJson({scenarioId: 'SCENE', tables: {Orders: {
    modelBinding: {modelId: 'MODEL', modelName: 'Orders'}, columns: [
      {name: 'id', type: 'string', isPrimaryKey: true}, {name: 'caption', type: 'string'},
      {name: 'state', type: 'string'}, {name: 'computed', type: 'string', isComputed: true},
      ...(child ? [{name: 'parentId', type: 'string'}] : []),
    ], views: {default: {commitMode: 'staged', queryConfig: {fields: ['id', 'caption', ...(child ? ['parentId'] : [])], cacheType: 'browser'},
      ...(newRowFields === undefined ? {} : {newRowFields})}},
  }}})
  const view = ds.getView('Orders')!, http = new InputHttp()
  http.childAdd = child
  const runtime = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'SCOPE', headers: {}})})
  runtime.bindModelView(view, formal)
  return {ds, view, http, runtime}
}

describe('formal new-row inputs separate from query output', () => {
  it.each(['generated', 'explicit'] as const)('keeps the original parent child-add contract with %s identity when root creation is disabled and its input range omits the foreign key', async identity => {
    const {ds, view, http} = fixture(['caption'], true)
    try {
      http.allowAdd = false
      await view.refresh()
      expect(view.newRowFieldAccess('caption').write).toBe('denied')
      const created = await view.addChildRow({parentRow: view.rows[0]!, parentField: 'id', childForeignKey: 'parentId', data: {caption: 'child'},
        ...(identity === 'explicit' ? {identity: {field: 'id', value: 'CHILD'}} : {})})
      if ('success' in created) throw new Error('Expected native staged child')
      expect(view.fieldAccess(created, 'caption').write).toBe('allowed')
      expect(view.fieldAccess(created, 'parentId').write).toBe('denied')
      expect((await ds.saveChanges({views: [view]})).success).toBe(true)
      expect(http.saves[0]?.data).toEqual([{TableName: 'Orders', CrudModel: {
        Added: [{rowid: expect.any(String), title: 'child', parent_id: 'A', lingma_sys_key: 'ROW-SIGNED'}], Changed: [], Deleted: [],
      }}])
    } finally {ds.destroy()}
  })

  it('retains the original child capture and local cancellation when a fresh query finds the child', async () => {
    const {ds, view, http} = fixture(['caption'], true)
    try {
      http.allowAdd = false
      await view.refresh()
      await view.addChildRow({parentRow: view.rows[0]!, parentField: 'id', childForeignKey: 'parentId', data: {caption: 'child'}})
      http.saveError = new Error('lost receipt')
      await expect(ds.saveChanges({views: [view]})).rejects.toThrow()
      expect(view.hasUnconfirmedSave).toBe(true)
      const command = Array.isArray(http.saves[0]?.data) ? http.saves[0]?.data[0] : undefined
      const crud = isRecord(command) ? command['CrudModel'] : undefined
      const row = isRecord(crud) && Array.isArray(crud['Added']) ? crud['Added'][0] : undefined
      if (!isRecord(row) || typeof row['rowid'] !== 'string') throw new Error('Missing original child capture')
      view.discardPendingChanges()
      expect(view.hasUnconfirmedSave).toBe(true)
      http.saveError = undefined
      http.lateRows = [{id: row['rowid'], caption: row['title'], parentId: row['parent_id'],
        lingma_sys_key: 'CHILD-SIGNED', lingma_sys_params: {e: ['caption'], d: true}}]
      const reads = http.queries.length
      await expect(ds.saveChanges({views: [view]})).rejects.toThrow('SPARK_SAVE_UNVERIFIABLE')
      expect(http.queries).toHaveLength(reads)
      const fresh = view.createQueryView('childReadback')
      try {
        await fresh.refresh()
        expect(http.queries).toHaveLength(reads + 1)
        expect(fresh.rows).toMatchObject([{id: row['rowid'], caption: 'child', parentId: 'A'}])
      } finally {fresh.destroy()}
      expect(view.hasUnconfirmedSaveFor([row['rowid']])).toBe(true)
      expect(view.rows.some(child => child['id'] === row['rowid'])).toBe(false)
      expect(http.saves).toHaveLength(1)
      expect(view.dirtyTracking.pendingCreateIds.has(row['rowid'])).toBe(false)
      expect(view.dirtyTracking.pendingDeleteIds.has(row['rowid'])).toBe(false)
    } finally {ds.destroy()}
  })
  it('submits an explicitly declared non-output input through the original DataSet without granting existing-row access', async () => {
    const {ds, view, http} = fixture(['caption', 'state'])
    try {
      await view.refresh()
      expect(view.getColumn('state')).toBeUndefined()
      expect(JSON.stringify(http.queries[0]?.data)).not.toContain('STATE')
      expect(view.fieldAccess(view.rows[0]!, 'state')).toMatchObject({read: 'invisible', write: 'denied'})
      expect(view.newRowFieldAccess('state').write).toBe('allowed')
      const created = await view.addRow({caption: 'new', state: '1'})
      if ('success' in created) throw new Error('Expected native staged creation')
      expect(view.fieldAccess(created, 'state')).toMatchObject({read: 'visible', write: 'allowed'})
      expect((await ds.saveChanges({views: [view]})).success).toBe(true)
      expect(http.saves).toHaveLength(1)
      expect(http.saves[0]?.data).toEqual([{TableName: 'Orders', CrudModel: {
        Added: [{rowid: expect.any(String), title: 'new', STATE: '1', lingma_sys_key: 'ADD-SIGNED'}], Changed: [], Deleted: [],
      }}])
      const saved = view.rows.find(row => row['caption'] === 'new')
      expect(saved).toBeDefined()
      expect(saved).not.toHaveProperty('state')
      expect(view.fieldAccess(saved!, 'state')).toMatchObject({read: 'invisible', write: 'denied'})
    } finally {ds.destroy()}
  })

  it('persists the complete input range and isolates changed ranges from an earlier cached query', async () => {
    const {ds, view, http} = fixture(['caption', 'state'])
    try {
      await view.loadFromServer()
      expect(view.toJson().newRowFields).toEqual(['caption', 'state'])
      view.newRowFields = ['caption']
      expect(view.newRowFieldAccess('state').write).toBe('denied')
      await view.loadFromServer()
      expect(http.queries).toHaveLength(2)
      await expect(view.addRow({caption: 'new', state: '1'})).rejects.toThrow(/NEW_ROW/)
      expect(http.saves).toHaveLength(0)
    } finally {ds.destroy()}
  })

  it('retains the original table-level add refusal even when inputs are configured', async () => {
    const {ds, view, http} = fixture(['caption', 'state'])
    try {
      http.allowAdd = false
      await view.refresh()
      expect(view.newRowFieldAccess('state').write).toBe('denied')
      await expect(view.addRow({caption: 'new', state: '1'})).rejects.toThrow(/NEW_ROW/)
      expect(http.saves).toHaveLength(0)
    } finally {ds.destroy()}
  })

  it('enforces the captured complete range again at the SDK save boundary', async () => {
    const {ds, view, http, runtime} = fixture(['state'])
    const query = vi.spyOn(runtime, 'executeQuery')
    try {
      await view.refresh()
      const first = query.mock.results[0]
      if (!first || first.type !== 'return') throw new Error('Missing original query')
      const context = await first.value
      for (const field of ['caption', 'STATE', 'computed', 'unknown']) {
        const row = context.prepareNewRow({state: '1', [field]: 'outside'})
        expect(() => context.buildSaveRequest({added: [row]})).toThrow('SPARK_MODEL_SAVE_FIELD')
      }
      expect(http.saves).toHaveLength(0)
    } finally {query.mockRestore(); ds.destroy()}
  })

  it.each(['id', 'STATE', 'computed', 'missing'])('rejects an invalid declared input %s without issuing a write', async field => {
    const {ds, view, http} = fixture([field])
    try {
      await view.refresh()
      expect(view.loadingError?.message).toContain('SPARK_NEW_ROW_INPUT')
      expect(view.rows).toEqual([])
      expect(http.saves).toHaveLength(0)
    } finally {ds.destroy()}
  })

  it('preserves pending input and the captured range until native cancellation', async () => {
    const fields = ['caption', 'state'], {ds, view, http} = fixture(fields)
    try {
      fields.pop()
      await view.refresh()
      expect(view.newRowFields).toEqual(['caption', 'state'])
      await view.addRow({caption: 'new', state: '1'})
      expect(() => {view.newRowFields = ['caption']}).toThrow('DATA_VIEW_UNSAVED_CHANGES')
      expect(view.newRowFields).toEqual(['caption', 'state'])
      view.discardPendingChanges()
      expect(view.rows.map(row => row['id'])).toEqual(['A'])
      expect(http.saves).toHaveLength(0)
    } finally {ds.destroy()}
  })

  it('keeps the original uncertain submission and prevents replacing its input range', async () => {
    const {ds, view, http} = fixture(['caption', 'state'])
    try {
      await view.refresh()
      await view.addRow({caption: 'new', state: '1'})
      http.saveError = new Error('lost receipt')
      await expect(ds.saveChanges({views: [view]})).rejects.toThrow()
      expect(view.hasUnconfirmedSave).toBe(true)
      expect(() => {view.newRowFields = ['caption']}).toThrow('DATA_VIEW_UNCONFIRMED_SAVE')
      expect(view.newRowFields).toEqual(['caption', 'state'])
      expect(http.saves).toHaveLength(1)
    } finally {ds.destroy()}
  })
})
