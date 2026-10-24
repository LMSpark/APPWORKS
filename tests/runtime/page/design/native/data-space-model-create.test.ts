import {afterEach, describe, expect, it, vi} from 'vitest'
import {DataView} from '@spark-appworks/spark-data'
import {createModelCreateHost, modelCreatePreview, modelCreateSave, modelCreateVerify} from '@/lowcode/data-space/model-source/lowcode-data-space-model-create-session'
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

  it('preserves an unrelated sibling DataView capture while verifying the model create', async () => {
    const {owner, session, f, writes} = await setup()
    f.loseNextResponse()
    await expect(owner.save()).rejects.toThrow()

    const sibling = session.metadataDataSet.getView('Base_DataSet', 'default')!
    sibling.updateEditingValue('A', 'inputParams', '[{"rowid":"P1","Name":"sibling change"}]')
    expect((await sibling.applyEditingRows(['A'])).success).toBe(true)
    f.loseNextResponse()
    await expect(session.metadataDataSet.saveChanges({applyEditingRows: false, views: [
      {tableName: sibling.tableName, viewId: sibling.viewId, ids: ['A']},
    ]})).rejects.toThrow()
    expect(sibling.hasUnconfirmedSave).toBe(true)

    await expect(owner.verify()).resolves.toMatchObject({confirmed: true})
    expect(writes()).toHaveLength(2)
    expect(sibling.hasUnconfirmedSave).toBe(true)
  })

  it('refuses to infer or discard an unknown create when its original capture is missing', async () => {
    const {session, reader, f, writes} = await setup()
    const host = createModelCreateHost({dataSet: session.metadataDataSet, targetId: session.targetId, sources: reader,
      lifecycle: {assertCurrent: () => undefined, onDispatch: () => undefined}})
    await modelCreatePreview(host, source)
    f.loseNextResponse()
    await expect(modelCreateSave(host)).rejects.toThrow()
    const modelId = host.flow.staged.find(item => item.view === host.models)?.id
    expect(modelId).toBeTruthy()
    host.flow.capture = null
    await expect(modelCreateVerify(host)).rejects.toThrow('缺少模型新增原SPARK捕获')
    expect(host.models.dirtyTracking.isPendingCreate(modelId!)).toBe(true)
    expect(host.flow.staged.some(item => item.id === modelId)).toBe(true)
    expect(writes()).toHaveLength(1)
  })

  it.each(['overlay', 'applied'] as const)('preserves a later model %s edit through the first native verification await and retry', async kind => {
    const {owner, session, f, writes} = await setup()
    f.loseNextResponse()
    await expect(owner.save()).rejects.toThrow()
    const modelId = owner.getState().modelId!
    const dataSet = session.metadataDataSet, models = dataSet.getView('Base_DataModel', 'default')!
    const nativeSave = dataSet.saveChanges.bind(dataSet)
    let release!: () => void
    const gate = new Promise<void>(resolve => {release = resolve})
    const held = vi.spyOn(dataSet, 'saveChanges').mockImplementationOnce(async options => {
      const result = await nativeSave(options)
      await gate
      return result
    })
    const verification = owner.verify()
    await vi.waitFor(() => expect(held).toHaveBeenCalledTimes(1))
    models.updateEditingValue(modelId, 'description', `late ${kind}`)
    if (kind === 'applied') expect((await models.applyEditingRows([modelId])).success).toBe(true)
    release()
    await expect(verification).rejects.toThrow()
    expect(models.getEditingRow(modelId)?.['description'] ?? models.rows.find(row => row['rowid'] === modelId)?.['description']).toBe(`late ${kind}`)
    expect(owner.getState()).toMatchObject({status: 'readback', pending: true, modelId})
    await expect(owner.verify()).rejects.toThrow()
    expect(writes()).toHaveLength(1)

    if (kind === 'overlay') models.discardEditingRows([modelId])
    else models.discardPendingChanges([modelId])
    await expect(owner.verify()).resolves.toMatchObject({confirmed: true, modelId})
    expect(writes()).toHaveLength(1)
  })

  it.each(['overlay', 'applied'] as const)('keeps the derived field DataView alive when a later %s edit arrives during verification', async kind => {
    const {owner, session, f, writes} = await setup()
    f.loseNextResponse()
    await expect(owner.save()).rejects.toThrow()
    const modelId = owner.getState().modelId!, dataSet = session.metadataDataSet
    const fields = dataSet.getView('Base_DataModel_Field', `createModel:${modelId}`)!
    const fieldId = [...fields.dirtyTracking.pendingCreateIds][0] as string
    const nativeSave = dataSet.saveChanges.bind(dataSet)
    let release!: () => void
    const gate = new Promise<void>(resolve => {release = resolve})
    const held = vi.spyOn(dataSet, 'saveChanges').mockImplementationOnce(async options => {
      const result = await nativeSave(options)
      await gate
      return result
    })
    const verification = owner.verify()
    await vi.waitFor(() => expect(held).toHaveBeenCalledTimes(1))
    fields.updateEditingValue(fieldId, 'description', `late field ${kind}`)
    if (kind === 'applied') expect((await fields.applyEditingRows([fieldId])).success).toBe(true)
    release()
    await expect(verification).rejects.toThrow()
    expect(dataSet.getView('Base_DataModel_Field', fields.viewId)).toBe(fields)
    expect(fields.getEditingRow(fieldId)?.['description'] ?? fields.rows.find(row => fields.getPkKey(row) === fieldId)?.['description']).toBe(`late field ${kind}`)
    expect(owner.getState()).toMatchObject({status: 'readback', pending: true, modelId})
    await expect(owner.verify()).rejects.toThrow()
    expect(dataSet.getView('Base_DataModel_Field', fields.viewId)).toBe(fields)
    expect(fields.getEditingRow(fieldId)?.['description'] ?? fields.rows.find(row => fields.getPkKey(row) === fieldId)?.['description']).toBe(`late field ${kind}`)
    expect(writes()).toHaveLength(1)

    if (kind === 'overlay') fields.discardEditingRows([fieldId])
    else fields.discardPendingChanges([fieldId])
    await expect(owner.verify()).resolves.toMatchObject({confirmed: true, modelId})
    expect(dataSet.getView('Base_DataModel_Field', fields.viewId)).toBeUndefined()
    expect(writes()).toHaveLength(1)
  })

  it.each(['model', 'field'] as const)('preserves a later %s edit during the domain readback await', async target => {
    const {owner, session, f, writes} = await setup()
    f.loseNextResponse()
    await expect(owner.save()).rejects.toThrow()
    const modelId = owner.getState().modelId!, dataSet = session.metadataDataSet
    const view = target === 'model' ? dataSet.getView('Base_DataModel', 'default')!
      : dataSet.getView('Base_DataModel_Field', `createModel:${modelId}`)!
    const id = target === 'model' ? modelId : [...view.dirtyTracking.pendingCreateIds][0] as string
    let release!: () => void
    const gate = new Promise<void>(resolve => {release = resolve})
    const held = vi.fn()
    if (target === 'model') {
      const load = view.loadFromServer.bind(view)
      vi.spyOn(view, 'loadFromServer').mockImplementationOnce(async options => {
        held(); const result = await load(options); await gate; return result
      })
    } else {
      const refresh = view.refresh.bind(view)
      vi.spyOn(view, 'refresh').mockImplementationOnce(async () => {
        held(); const result = await refresh(); await gate; return result
      })
    }
    const verification = owner.verify()
    await vi.waitFor(() => expect(held).toHaveBeenCalledTimes(1))
    view.updateEditingValue(id, 'description', `late ${target} readback edit`)
    release()
    await expect(verification).rejects.toThrow()
    expect(view.getEditingRow(id)?.['description']).toBe(`late ${target} readback edit`)
    expect(owner.getState()).toMatchObject({status: 'readback', pending: true, modelId})
    expect(writes()).toHaveLength(1)
    await expect(owner.verify()).rejects.toThrow()
    expect(view.getEditingRow(id)?.['description']).toBe(`late ${target} readback edit`)
    expect(writes()).toHaveLength(1)
  })

  it('confirms a missing receipt by exact readback, without creating a second set', async () => {
    const {owner, writes} = await setup({omitFieldReceipt: true})
    await expect(owner.save()).rejects.toThrow('回执')
    expect(await owner.verify()).toMatchObject({confirmed: true})
    expect(writes()).toHaveLength(1)
  })

  it('keeps generated IDs and recovery state when the DataSet receipt duplicates a target', async () => {
    const {owner, session, f, writes} = await setup()
    const dataSet = session.metadataDataSet, nativeSave = dataSet.saveChanges.bind(dataSet)
    const intercepted = vi.spyOn(dataSet, 'saveChanges').mockImplementationOnce(async options => {
      const result = await nativeSave(options)
      const data = result.data
      if (!data) return result
      return {...result, data: {...data, viewCount: data.viewCount + 1, viewResults: [...data.viewResults, ...data.viewResults]}}
    })
    const before = dataSet.getView('Base_DataModel', 'default')!.dirtyTracking.pendingCreateIds.size
    await expect(owner.save()).rejects.toThrow('回执')
    const modelId = owner.getState().modelId
    expect(intercepted).toHaveBeenCalledTimes(1)
    expect(modelId).toBeTruthy()
    expect(owner.getState()).toMatchObject({status: 'readback', pending: true, modelId})
    expect(f.created.get('Base_DataModel')?.some(row => row['rowid'] === modelId)).toBe(true)
    expect(writes()).toHaveLength(1)
    await expect(owner.verify()).rejects.toThrow()
    expect(owner.getState()).toMatchObject({pending: true, modelId})
    expect(dataSet.getView('Base_DataModel', 'default')!.dirtyTracking.pendingCreateIds.size).toBe(before)
    expect(writes()).toHaveLength(1)
    expect('acceptCurrent' in owner).toBe(false)
  })

  it('keeps partial model creation unresolved and blocks generic accept-current', async () => {
    const {owner, session, f, writes} = await setup({omitFieldReceipt: true, omitFieldWrite: true})
    await expect(owner.save()).rejects.toThrow()
    expect('acceptCurrent' in owner).toBe(false)
    const modelId = owner.getState().modelId
    await expect(owner.verify()).rejects.toThrow('SPARK_SAVE_UNVERIFIABLE')
    expect(owner.getState()).toMatchObject({status: 'unknown', pending: true, modelId})
    expect(session.metadataDataSet.getView('Base_DataModel', 'default')!.hasUnconfirmedSave).toBe(true)
    await expect(owner.save()).rejects.toThrow('先核验')
    expect('acceptCurrent' in owner).toBe(false)
    expect(owner.getState().pending).toBe(true)
    expect(f.created.get('Base_DataModel')?.[0]?.['rowid']).toBe(modelId)
    expect(f.created.get('Base_DataModel')).toHaveLength(1)
    expect(f.created.get('Base_DataModel_Field')).toBeUndefined()
    expect(writes()).toHaveLength(1)
  })

  it('retains the original generated identity until explicitly abandoning an authoritative not-applied capture', async () => {
    const {owner, f, writes} = await setup({omitModelWrite: true, omitFieldWrite: true})
    f.loseNextResponse()
    await expect(owner.save()).rejects.toThrow()
    const modelId = owner.getState().modelId
    expect(modelId).toBeTruthy()
    expect(owner.getState().status).toBe('unknown')
    expect(await owner.verify()).toEqual({confirmed: false, modelId: null})
    expect(owner.getState()).toMatchObject({status: 'different', pending: true, modelId, canAbandonNotApplied: true})
    expect(owner.getState().preview).not.toBeNull()
    expect(writes()).toHaveLength(1)
    await expect(owner.save()).rejects.toThrow('先核验')

    await owner.abandonNotApplied()
    expect(owner.getState()).toMatchObject({status: 'idle', pending: false, modelId: null, preview: null, canAbandonNotApplied: false})
    expect(f.created.get('Base_DataModel')).toBeUndefined()
    expect(f.created.get('Base_DataModel_Field')).toBeUndefined()
    expect(writes()).toHaveLength(1)
    await expect(owner.save()).rejects.toThrow('先预览')
  })

  it('preflights all original targets before abandoning a not-applied model create', async () => {
    const {owner, session, f, writes} = await setup({omitModelWrite: true, omitFieldWrite: true})
    f.loseNextResponse()
    await expect(owner.save()).rejects.toThrow()
    await owner.verify()
    const modelId = owner.getState().modelId!
    const models = session.metadataDataSet.getView('Base_DataModel', 'default')!
    const fields = session.metadataDataSet.getView('Base_DataModel_Field', `createModel:${modelId}`)
    expect(fields).toBeDefined()
    fields!.mutating = true
    await expect(owner.abandonNotApplied()).rejects.toThrow('仍在操作')
    expect(models.dirtyTracking.isPendingCreate(modelId)).toBe(true)
    expect(owner.getState()).toMatchObject({status: 'different', modelId, pending: true})
    expect(writes()).toHaveLength(1)
    fields!.mutating = false
    await owner.abandonNotApplied()
    expect(owner.getState().status).toBe('idle')
  })

  it.each(['model-overlay', 'model-applied', 'field-overlay', 'field-applied'] as const)(
    'preserves a post-click %s edit while explicitly abandoning a not-applied create', async edit => {
      const {owner, session, f, writes} = await setup({omitModelWrite: true, omitFieldWrite: true})
      f.loseNextResponse()
      await expect(owner.save()).rejects.toThrow()
      await owner.verify()
      const modelId = owner.getState().modelId!, fields = session.metadataDataSet.getView('Base_DataModel_Field', `createModel:${owner.getState().modelId}`)!
      const isField = edit.startsWith('field'), id = isField ? [...fields.dirtyTracking.pendingCreateIds][0] as string : modelId
      const view = isField ? fields : session.metadataDataSet.getView('Base_DataModel', 'default')!
      const abandoning = owner.abandonNotApplied()
      view.updateEditingValue(id, 'description', `post-click ${edit}`)
      if (edit.endsWith('applied')) expect((await view.applyEditingRows([id])).success).toBe(true)
      await expect(abandoning).rejects.toThrow()
      expect(owner.getState()).toMatchObject({status: 'different', pending: true, modelId})
      expect(view.getEditingRow(id)?.['description'] ?? view.rows.find(row => view.getPkKey(row) === id)?.['description']).toBe(`post-click ${edit}`)
      expect(writes()).toHaveLength(1)
      expect(f.fileWrites).toHaveLength(0)
    })

  it.each(['model-overlay', 'model-applied', 'field-overlay', 'field-applied'] as const)(
    'explicitly discards only the confirmed create target after a %s edit and completes readback', async edit => {
      const {owner, session, f, writes} = await setup()
      f.loseNextResponse()
      await expect(owner.save()).rejects.toThrow()
      const modelId = owner.getState().modelId!, dataSet = session.metadataDataSet
      const isField = edit.startsWith('field')
      const view = isField ? dataSet.getView('Base_DataModel_Field', `createModel:${modelId}`)!
        : dataSet.getView('Base_DataModel', 'default')!
      const id = isField ? [...view.dirtyTracking.pendingCreateIds][0] as string : modelId
      const nativeSave = dataSet.saveChanges.bind(dataSet)
      let release!: () => void
      const gate = new Promise<void>(resolve => {release = resolve})
      const held = vi.spyOn(dataSet, 'saveChanges').mockImplementationOnce(async options => {
        const result = await nativeSave(options); await gate; return result
      })
      const verification = owner.verify()
      await vi.waitFor(() => expect(held).toHaveBeenCalledTimes(1))
      view.updateEditingValue(id, 'description', `discard confirmed ${edit}`)
      if (edit.endsWith('applied')) expect((await view.applyEditingRows([id])).success).toBe(true)
      release()
      await expect(verification).rejects.toThrow()
      expect(owner.getState()).toMatchObject({status: 'readback', pending: true, modelId})

      await expect(owner.discardLocalChanges()).resolves.toBe(modelId)
      expect(owner.getState()).toMatchObject({status: 'idle', pending: false, modelId: null})
      expect(writes()).toHaveLength(1)
      expect(f.fileWrites).toHaveLength(0)
      expect(view.getEditingRow(id)?.['description'] ?? view.rows.find(row => view.getPkKey(row) === id)?.['description']).not.toBe(`discard confirmed ${edit}`)
    })

  it.each(['model-overlay', 'model-applied', 'field-overlay', 'field-applied'] as const)(
    'preserves a post-click %s edit during explicit confirmed-create domain readback', async edit => {
      const {owner, session, f, writes} = await setup()
      f.loseNextResponse()
      await expect(owner.save()).rejects.toThrow()
      const modelId = owner.getState().modelId!, dataSet = session.metadataDataSet
      const isField = edit.startsWith('field'), view = isField
        ? dataSet.getView('Base_DataModel_Field', `createModel:${modelId}`)!
        : dataSet.getView('Base_DataModel', 'default')!
      const id = isField ? [...view.dirtyTracking.pendingCreateIds][0] as string : modelId
      const nativeSave = dataSet.saveChanges.bind(dataSet)
      let releaseNative!: () => void
      const nativeGate = new Promise<void>(resolve => {releaseNative = resolve})
      const nativeHeld = vi.spyOn(dataSet, 'saveChanges').mockImplementationOnce(async options => {
        const result = await nativeSave(options); await nativeGate; return result
      })
      const verification = owner.verify()
      await vi.waitFor(() => expect(nativeHeld).toHaveBeenCalledTimes(1))
      view.updateEditingValue(id, 'description', `original ${edit}`)
      releaseNative()
      await expect(verification).rejects.toThrow()

      let releaseReadback!: () => void
      const readbackGate = new Promise<void>(resolve => {releaseReadback = resolve})
      const entered = vi.fn()
      if (isField) {
        const refresh = view.refresh.bind(view)
        vi.spyOn(view, 'refresh').mockImplementationOnce(async () => {entered(); const result = await refresh(); await readbackGate; return result})
      } else {
        const load = view.loadFromServer.bind(view)
        vi.spyOn(view, 'loadFromServer').mockImplementationOnce(async options => {entered(); const result = await load(options); await readbackGate; return result})
      }
      const discarding = owner.discardLocalChanges()
      await vi.waitFor(() => expect(entered).toHaveBeenCalledTimes(1))
      view.updateEditingValue(id, 'description', `post-click ${edit}`)
      if (edit.endsWith('applied')) expect((await view.applyEditingRows([id])).success).toBe(true)
      releaseReadback()
      await expect(discarding).rejects.toThrow()
      expect(owner.getState()).toMatchObject({status: 'readback', pending: true, modelId})
      expect(view.getEditingRow(id)?.['description'] ?? view.rows.find(row => view.getPkKey(row) === id)?.['description']).toBe(`post-click ${edit}`)
      expect(writes()).toHaveLength(1)
      expect(f.fileWrites).toHaveLength(0)
    })

  it('preflights every confirmed-create target before discarding any local draft', async () => {
    const {owner, session, f, writes} = await setup()
    f.loseNextResponse()
    await expect(owner.save()).rejects.toThrow()
    const modelId = owner.getState().modelId!, dataSet = session.metadataDataSet
    const models = dataSet.getView('Base_DataModel', 'default')!
    const fields = dataSet.getView('Base_DataModel_Field', `createModel:${modelId}`)!
    const nativeSave = dataSet.saveChanges.bind(dataSet)
    let release!: () => void
    const gate = new Promise<void>(resolve => {release = resolve})
    const held = vi.spyOn(dataSet, 'saveChanges').mockImplementationOnce(async options => {const result = await nativeSave(options); await gate; return result})
    const verification = owner.verify()
    await vi.waitFor(() => expect(held).toHaveBeenCalledTimes(1))
    models.updateEditingValue(modelId, 'description', 'keep until all targets ready')
    release(); await expect(verification).rejects.toThrow()
    fields.mutating = true
    await expect(owner.discardLocalChanges()).rejects.toThrow()
    expect(models.getEditingRow(modelId)?.['description']).toBe('keep until all targets ready')
    expect(owner.getState()).toMatchObject({status: 'readback', pending: true, modelId})
    expect(writes()).toHaveLength(1)
    fields.mutating = false
    await expect(owner.discardLocalChanges()).resolves.toBe(modelId)
    expect(owner.getState().pending).toBe(false)
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

  it('retains the original save capture when its DataView query context changes', async () => {
    const {owner, session, f, writes} = await setup()
    f.loseNextResponse()
    await expect(owner.save()).rejects.toThrow()
    const models = session.metadataDataSet.getView('Base_DataModel', 'default')!
    models.queryContext = {...models.queryContext, modelId: 'M2'}
    await expect(owner.verify()).rejects.toThrow('查询或目标已变化')
    expect(models.hasUnconfirmedSave).toBe(true)
    expect(owner.getState()).toMatchObject({status: 'unknown', pending: true, modelId: expect.any(String)})
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
