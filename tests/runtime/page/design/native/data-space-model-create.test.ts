import {afterEach, describe, expect, it, vi} from 'vitest'
import {DataView} from '@spark-appworks/spark-data'
import {dataSpacePageFixture} from './data-space-page.fixture'

const fixtures: ReturnType<typeof dataSpacePageFixture>[] = []
afterEach(() => {vi.restoreAllMocks(); fixtures.splice(0).forEach(f => f.dispose())})
const source = {type: 'table' as const, id: 'SOURCE', name: 'Orders', description: '新来源', dbid: 'DB', databaseName: 'database', providerId: ''}
const prepared = {source, model: {Type: '数据库', MetaName: source.name, description: source.description, DbId: source.dbid, DbName: source.databaseName,
  JoinType: '', ForeignKeyFields: '', JoinFilter: '', PId: ''}, fields: [
  {type: 'dataModel' as const, Name: 'id', description: '主键', FieldType: 'varchar', IsPKey: 1, IsOutput: 1, AsName: '', ValueFun: '', Expression: '', allowAIAdd: 0, OrderType: '', Order: 0, Group: 0},
  {type: 'dataModel' as const, Name: 'title', description: '标题', FieldType: 'varchar', IsPKey: 0, IsOutput: 0, AsName: '', ValueFun: '', Expression: '', allowAIAdd: 0, OrderType: '', Order: 0, Group: 0},
]}
async function setup(options: Parameters<typeof dataSpacePageFixture>[0] = {}) {
  const reader = {query: vi.fn(async () => ({rows: [source], total: 1})), prepare: vi.fn(async () => structuredClone(prepared))}
  const f = dataSpacePageFixture({allowModelAdd: true, allowFieldAdd: true, modelSources: reader, ...options}); fixtures.push(f)
  const session = await f.open('A')
  const owner = session.getModelCreate()
  await owner.preview(source)
  return {f, session, owner, reader, writes: () => f.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')}
}
describe('native model creation with formal metadata ownership', () => {
  it.each(['before-preview', 'before-save'] as const)('creates and reopens a named view after model browsing changes input scope %s', async timing => {
    const {f, session, owner, writes} = await setup({overviewOnly: true,
      businessRows: {SalesOrders: [{rowid: 'ORDER-1', id: 'ORDER-1'}]}})
    if (timing === 'before-preview') owner.discard()
    await session.loadModelInputFields('M1')
    if (timing === 'before-preview') await owner.preview(source)
    owner.setName('SalesOrders')
    const id = await owner.save()
    expect(writes()).toHaveLength(1)
    expect(session.metadataDataSet.getView('Base_DataModel_Field')?.rows).toEqual([])
    expect(session.metadataDataSet.getView('Base_DataModel_Relation')?.rows).toEqual([])
    const reopened = await f.open('A')
    await reopened.metadataDataSet.getView('DataViewDefinition')!.addRow({dataSetId: reopened.targetId, tableName: 'Sales', dataModelId: id, dataModelName: 'SalesOrders', viewId: 'list'})
    await expect(reopened.metadataDataSet.saveChanges({views: [{tableName: 'DataViewDefinition', viewId: 'default'}]})).resolves.toMatchObject({success: true})
    const consumer = await f.open('A'), view = consumer.definitionDataSet!.getView('Sales', 'list')!
    expect(view.dataTable?.modelBinding).toEqual({modelId: id, modelName: 'SalesOrders'})
    expect((await view.loadFromServer()).success).toBe(true)
    expect(view.rows).toMatchObject([{id: 'ORDER-1'}])
    expect(f.fileWrites).toHaveLength(1)
  })

  it('keeps the created-field query identity when another workspace changes the template input during loading', async () => {
    const {session, owner, writes} = await setup({overviewOnly: true})
    const template = session.metadataDataSet.getView('Base_DataModel_Field', 'modelInputFields')!
    template.configure({queryContext: {dataSpaceId: 'A', modelId: 'M1', modelIds: ['M1']}})
    const refresh = DataView.prototype.refresh
    let captured: Record<string, unknown> | undefined
    vi.spyOn(DataView.prototype, 'refresh').mockImplementation(async function (this: DataView, ...args) {
      const result = await refresh.apply(this, args)
      if (this.viewId.startsWith('createModel:') && !captured) {
        captured = structuredClone(this.queryContext)
        template.configure({queryContext: {dataSpaceId: 'A', modelId: 'M2', modelIds: ['M2']}})
      }
      return result
    })
    const id = await owner.save()
    expect(captured).toEqual({dataSpaceId: 'A', modelId: id, modelIds: [id]})
    expect(template.queryContext).toEqual({dataSpaceId: 'A', modelId: 'M2', modelIds: ['M2']})
    expect(writes()).toHaveLength(1)
    expect(Object.keys(template.dataTable!.views).some(key => key.startsWith('createModel:'))).toBe(false)
  })

  it('rejects a replaced query template before staging any model records', async () => {
    const {session, owner, writes} = await setup()
    const table = session.metadataDataSet.getTable('Base_DataModel_Field')!
    table.destroyView('modelInputFields'); table.addView('modelInputFields')
    await expect(owner.save()).rejects.toThrow('查询或目标已变化')
    expect(session.metadataDataSet.getView('Base_DataModel')?.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(writes()).toHaveLength(0)
  })

  it('still rejects changes to the new model own query and can discard only its unsubmitted rows', async () => {
    const {owner, writes, session} = await setup({overviewOnly: true})
    const refresh = DataView.prototype.refresh
    let fields: DataView | undefined, original: Record<string, unknown> | undefined
    vi.spyOn(DataView.prototype, 'refresh').mockImplementation(async function (this: DataView, ...args) {
      const result = await refresh.apply(this, args)
      if (this.viewId.startsWith('createModel:') && !fields) {
        fields = this; original = structuredClone(this.queryContext)
        this.configure({queryContext: {...this.queryContext, modelIds: ['M2']}})
      }
      return result
    })
    await expect(owner.save()).rejects.toThrow('新增字段查询范围已变化')
    expect(writes()).toHaveLength(0)
    expect(owner.getState().status).toBe('unsubmitted')
    expect(session.metadataDataSet.getView('Base_DataModel')?.dirtyTracking.pendingCreateIds.size).toBe(1)
    fields!.configure({queryContext: original!})
    expect(await owner.verify()).toEqual({confirmed: false, modelId: null})
    expect(session.metadataDataSet.getView('Base_DataModel')?.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(writes()).toHaveLength(0)
  })

  it('creates source fields with an idle directory and reads back only the new model fields', async () => {
    const {f, session, owner, writes} = await setup({overviewOnly: true})
    const directory = session.metadataDataSet.getView('Base_DataModel_Field', 'default')!
    const initial = directory.requestState
    expect(directory.rows).toHaveLength(0)
    const start = f.requests.length
    const id = await owner.save()
    expect(writes()).toHaveLength(1)
    expect(directory.requestState).toBe(initial)
    expect(directory.rows).toHaveLength(0)
    expect(f.created.get('Base_DataModel_Field')).toHaveLength(2)
    const reads = f.requests.slice(start).filter(request => request.url.includes('GetData')
      && JSON.stringify(request.data).includes('Base_DataModel_Field'))
    expect(reads.length).toBeGreaterThanOrEqual(2)
    for (const read of reads) {
      expect(JSON.stringify(read.data)).toContain(id)
      expect(JSON.stringify(read.data)).toContain('dataModelId')
    }
    const reopened = await f.open('A')
    expect(reopened.metadataDataSet.getView('Base_DataModel')!.rows.some(row => row['rowid'] === id)).toBe(true)
  })

  it('preserves unrelated field drafts while creating a model and its source fields', async () => {
    const {session, owner, writes} = await setup()
    const directory = session.metadataDataSet.getView('Base_DataModel_Field', 'default')!
    directory.updateEditingValue('F1', 'description', 'unrelated field draft')
    await owner.save()
    expect(directory.getEditingRow('F1')?.['description']).toBe('unrelated field draft')
    expect(directory.hasEditingChanges('F1')).toBe(true)
    expect(writes()).toHaveLength(1)
    expect(JSON.stringify(writes()[0]?.data)).not.toContain('unrelated field draft')
  })

  it('creates an explicit registration, reopens it and queries its separately saved named view', async () => {
    const {f, owner, writes} = await setup({businessRows: {SalesOrders: [{rowid: 'ORDER-1', id: 'ORDER-1'}]}})
    owner.setName('SalesOrders')
    expect(owner.getState()).toMatchObject({nameError: '', preview: {name: 'SalesOrders'}})
    const id = await owner.save()
    expect(f.created.get('Base_DataModel')).toEqual([expect.objectContaining({rowid: id, Name: 'SalesOrders', MetaName: 'Orders', dataSetId: 'A'})])
    const reopened = await f.open('A')
    expect(reopened.metadataDataSet.getView('Base_DataModel', 'default')?.rows.find(row => row['rowid'] === id)?.['Name']).toBe('SalesOrders')
    await reopened.metadataDataSet.getView('DataViewDefinition')!.addRow({dataSetId: reopened.targetId, tableName: 'Sales', dataModelId: id, dataModelName: 'SalesOrders', viewId: 'list'})
    await expect(reopened.metadataDataSet.saveChanges({views: [{tableName: 'DataViewDefinition', viewId: 'default'}]})).resolves.toMatchObject({success: true})
    const consumer = await f.open('A'), view = consumer.definitionDataSet?.getView('Sales', 'list')
    expect(view?.dataTable?.modelBinding).toMatchObject({modelId: id, modelName: 'SalesOrders'})
    expect((await view!.loadFromServer()).success).toBe(true)
    expect(view?.rows).toMatchObject([{id: 'ORDER-1'}])
    expect(JSON.stringify(f.requests.at(-1)?.data)).toContain('SalesOrders')
    expect(writes()).toHaveLength(1); expect(f.fileWrites).toHaveLength(1)
  })

  it.each(['', ' ', ' SalesOrders', 'SalesOrders ', 'A@B', '#Orders', 'Orders'])('preserves invalid registration %j until explicitly repaired', async name => {
    const {owner, writes} = await setup()
    owner.setName(name)
    expect(owner.getState().preview?.name).toBe(name)
    expect(owner.getState().nameError).not.toBe('')
    await expect(owner.save()).rejects.toThrow('注册名')
    expect(writes()).toHaveLength(0)
    expect(owner.getState().preview?.name).toBe(name)
    owner.setName('SalesOrders'); expect(owner.getState().nameError).toBe('')
    await owner.save(); expect(writes()).toHaveLength(1)
  })

  it('lets a source with a reserved binding character use a different registration without changing its source name', async () => {
    const {f, owner, reader} = await setup()
    const other = {...source, name: 'Orders@warehouse'}
    reader.query.mockResolvedValue({rows: [other], total: 1})
    reader.prepare.mockResolvedValue({...prepared, source: other, model: {...prepared.model, MetaName: other.name}})
    await owner.preview(other)
    expect(owner.getState().nameError).not.toBe('')
    owner.setName('WarehouseOrders'); await owner.save()
    expect(f.created.get('Base_DataModel')?.[0]).toMatchObject({Name: 'WarehouseOrders', MetaName: other.name})
  })

  it('rechecks an explicit name after source preparation and keeps a conflicting draft for repair', async () => {
    const {f, session, owner, reader, writes} = await setup()
    owner.setName('SalesOrders')
    reader.prepare.mockImplementationOnce(async () => {
      f.setModelValues({Name: 'SalesOrders'})
      await session.metadataDataSet.getView('Base_DataModel', 'default')!.loadFromServer({allPages: true})
      return structuredClone(prepared)
    })
    await expect(owner.save()).rejects.toThrow('注册名')
    expect(writes()).toHaveLength(0)
    expect(owner.getState()).toMatchObject({status: 'ready', preview: {name: 'SalesOrders'}})
    owner.setName('SalesOrders2'); await owner.save()
    expect(f.created.get('Base_DataModel')?.[0]?.['Name']).toBe('SalesOrders2')
  })

  it('locks an explicit name while saving and after an unknown receipt, then verifies without replay', async () => {
    const {f, owner, writes} = await setup()
    owner.setName('SalesOrders')
    const release = f.holdModelResponse(); f.loseNextResponse()
    const saving = expect(owner.save()).rejects.toThrow()
    await vi.waitFor(() => expect(writes()).toHaveLength(1))
    expect(() => owner.setName('Other')).toThrow('先核验')
    release(); await saving
    expect(() => owner.setName('Other')).toThrow('先核验')
    expect(owner.getState().preview?.name).toBe('SalesOrders')
    expect(await owner.verify()).toMatchObject({confirmed: true})
    expect(writes()).toHaveLength(1)
  })

  it('prepares again, creates a unique registration and exact owned fields, then independently reopens', async () => {
    const {f, session, owner, reader, writes} = await setup()
    expect(owner.getState().preview?.name).toBe('Orders（1）')
    expect(session.hasPendingModelCreate()).toBe(true)
    const id = await owner.save()
    expect(reader.prepare).toHaveBeenCalledTimes(2)
    expect(writes()).toHaveLength(1); expect(f.fileWrites).toHaveLength(0)
    expect(f.created.get('Base_DataModel')).toEqual([expect.objectContaining({rowid: id, Name: 'Orders（1）', MetaName: 'Orders', dataSetId: 'A'})])
    expect(f.created.get('Base_DataModel_Field')).toHaveLength(2)
    expect(f.created.get('Base_DataModel_Field')?.every(row => row['dataModelId'] === id && row['dataSetId'] === 'A')).toBe(true)
    expect(session.hasPendingModelCreate()).toBe(false)
    const fresh = await f.open('A')
    expect(fresh.metadataDataSet.getView('Base_DataModel', 'default')?.rows).toHaveLength(3)
    expect(fresh.metadataDataSet.getView('Base_DataModel_Field', 'default')?.rows).toHaveLength(3)
    await fresh.metadataDataSet.getView('DataViewDefinition')!.addRow({dataSetId: fresh.targetId, tableName: 'NewOrders', dataModelId: id, dataModelName: 'Orders（1）', viewId: 'list'})
    await expect(fresh.metadataDataSet.saveChanges({views: [{tableName: 'DataViewDefinition', viewId: 'default'}]})).resolves.toMatchObject({success: true})
    const withViews = await f.open('A')
    expect(withViews.definitionDataSet?.getView('NewOrders', 'list')?.columns.some(column => column.name === 'id')).toBe(true)
    expect(f.fileWrites).toHaveLength(1)
  })

  it.each([{allowModelAdd: false}, {allowFieldAdd: false}])('uses both formal add permissions: %j', async options => {
    const {owner, session, writes} = await setup(options)
    await expect(owner.save()).rejects.toThrow('不允许新增')
    expect(writes()).toHaveLength(0)
    expect(session.metadataDataSet.getView('Base_DataModel', 'default')!.dirtyTracking.hasPendingChanges()).toBe(false)
    owner.discard(); expect(session.hasPendingModelCreate()).toBe(false)
  })

  it('requires a new preview after source fields change', async () => {
    const {owner, reader, writes} = await setup()
    reader.prepare.mockResolvedValueOnce({...prepared, fields: []})
    await expect(owner.save()).rejects.toThrow('重新预览')
    expect(writes()).toHaveLength(0)
  })

  it('cleans only unchanged owned rows when staging is interrupted before dispatch', async () => {
    const {owner, session, writes} = await setup()
    const fields = session.metadataDataSet.getView('Base_DataModel_Field', 'default')!
    const add = DataView.prototype.addRow
    const mock = vi.spyOn(DataView.prototype, 'addRow').mockImplementation(async function(this: DataView, values) {
      const result = await add.call(this, values)
      if (this.tableName === fields.tableName && this.viewId.startsWith('createModel:')) throw new Error('staging interrupted')
      return result
    })
    await expect(owner.save()).rejects.toThrow('staging interrupted')
    expect(owner.getState().status).toBe('ready')
    expect(fields.rows).toHaveLength(1); expect(writes()).toHaveLength(0)
    mock.mockRestore(); await owner.save(); expect(writes()).toHaveLength(1)
  })

  it.each(['unknown', 'readback'])('verifies %s without replaying the create', async mode => {
    const {owner, f, writes} = await setup()
    const release = f.holdModelResponse()
    if (mode === 'unknown') f.loseNextResponse()
    const saving = expect(owner.save()).rejects.toThrow()
    await vi.waitFor(() => expect(writes()).toHaveLength(1))
    if (mode === 'readback') f.failNextFieldRead()
    release(); await saving
    expect(owner.getState().status).toBe(mode)
    await expect(owner.save()).rejects.toThrow('先核验')
    expect(await owner.verify()).toMatchObject({confirmed: true})
    expect(writes()).toHaveLength(1); expect(owner.getState().pending).toBe(false)
  })

  it('confirms a missing receipt by exact readback, without creating a second set', async () => {
    const {owner, writes} = await setup({omitFieldReceipt: true})
    await expect(owner.save()).rejects.toThrow('回执')
    expect(await owner.verify()).toMatchObject({confirmed: true})
    expect(writes()).toHaveLength(1)
  })

  it('keeps a partial write unresolved until explicitly adopting the read formal state', async () => {
    const {owner, f, writes} = await setup({omitFieldReceipt: true, omitFieldWrite: true})
    await expect(owner.save()).rejects.toThrow()
    expect(() => owner.acceptCurrent()).toThrow('先核验')
    expect(await owner.verify()).toEqual({confirmed: false, modelId: null})
    expect(owner.getState().status).toBe('different')
    await expect(owner.save()).rejects.toThrow('先核验')
    owner.acceptCurrent(); expect(owner.getState().pending).toBe(false)
    expect(f.created.get('Base_DataModel')).toHaveLength(1)
    expect(f.created.get('Base_DataModel_Field')).toBeUndefined()
    expect(writes()).toHaveLength(1)
  })

  it('does not overwrite a different model draft during readback', async () => {
    const {owner, f, session, writes} = await setup()
    const models = session.metadataDataSet.getView('Base_DataModel', 'default')!
    const release = f.holdModelResponse()
    const saving = expect(owner.save()).rejects.toThrow('其他模型')
    await vi.waitFor(() => expect(writes()).toHaveLength(1))
    await expect(owner.verify()).rejects.toThrow('仍在进行')
    models.updateEditingValue('M1', 'description', 'other draft')
    release(); await saving
    await expect(owner.verify()).rejects.toThrow('其他模型')
    expect(models.getEditingRow('M1')?.['description']).toBe('other draft')
    models.discardEditingRows(['M1']); expect(await owner.verify()).toMatchObject({confirmed: true})
    expect(writes()).toHaveLength(1)
  })

  it('rejects a changed target before dispatch and a released session after dispatch', async () => {
    const first = await setup()
    first.session.metadataDataSet.getView('Base_DataModel', 'default')!.queryContext = {dataSpaceId: 'B'}
    await expect(first.owner.save()).rejects.toThrow('目标已变化')
    expect(first.writes()).toHaveLength(0)
    const {owner, f, session, writes} = await setup()
    const release = f.holdModelResponse()
    const saving = expect(owner.save()).rejects.toThrow()
    await vi.waitFor(() => expect(writes()).toHaveLength(1))
    session.dispose(); release(); await saving
    await expect(owner.verify()).rejects.toThrow('释放')
    expect(writes()).toHaveLength(1)
  })

  it('does not install an obsolete source preview after cancellation', async () => {
    const {owner, reader, writes} = await setup()
    let release = () => {}
    reader.prepare.mockImplementationOnce(() => new Promise(resolve => {release = () => resolve(structuredClone(prepared))}))
    const preview = owner.preview(source)
    owner.discard(); release(); await preview
    expect(owner.getState()).toMatchObject({status: 'idle', preview: null})
    await expect(owner.save()).rejects.toThrow('先预览'); expect(writes()).toHaveLength(0)
  })
})
