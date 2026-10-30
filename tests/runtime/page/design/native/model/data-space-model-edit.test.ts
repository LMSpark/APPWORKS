import {afterEach, describe, expect, it, vi} from 'vitest'
import {DataViewFilter} from '@spark-appworks/spark-data'
import {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {dataSpacePageFixture} from '../data-space-page.fixture'

const fixtures: ReturnType<typeof dataSpacePageFixture>[] = []
afterEach(() => {vi.restoreAllMocks(); fixtures.splice(0).forEach(f => f.dispose())})
async function setup(options: Parameters<typeof dataSpacePageFixture>[0] = {}) {
  const f = dataSpacePageFixture(options); fixtures.push(f)
  const session = await f.open('A')
  const view = session.metadataDataSet.getView('Base_DataModel', 'default')!
  return {f, session, view, owner: session.getModelEdit('M1'),
    writes: () => f.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')}
}

describe('formal model configuration maintenance', () => {
  it.each([
    ['Filter', ''], ['OutputType', 'Join'], ['parentField', '订单编号'], ['hasChildField', 'haschild'],
    ['selfType', 'parent'], ['topValue', '0'], ['cacheType', '页面'], ['RequestComplete', 'completed'],
  ] as const)('keeps legacy request property %s out of the model structure entry', async (field, value) => {
    const {owner, view, writes} = await setup()
    expect(owner.read().fields.some(item => item.name === field)).toBe(false)
    expect(owner.readRequestScheme().fields.some(item => item.name === field)).toBe(true)
    expect(() => owner.stage(field, value)).toThrow('不能修改')
    expect(view.hasEditingChanges()).toBe(false)
    expect(writes()).toHaveLength(0)
  })

  it('saves a model description with unloaded fields and an incomplete model list without additional reads', async () => {
    const {f, session, owner, view, writes} = await setup()
    await view.loadFromServer({page: 1, pageSize: 1})
    expect(view.rows).toHaveLength(1)
    expect(view.total).toBe(2)
    session.metadataDataSet.getView('Base_DataModel_Field', 'default')!.clearAll()
    const before = f.requests.length
    owner.stage('description', '按变更保存')
    await owner.save()
    expect(f.requests).toHaveLength(before + 1)
    expect(writes().at(-1)?.data).toEqual([expect.objectContaining({TableName: 'Base_DataModel', CrudModel: {
      Added: [], Changed: [{rowid: 'M1', description: '按变更保存', lingma_sys_key: 'token-A-M1'}], Deleted: [],
    }})])
    expect(view.total).toBe(2)
    expect(session.metadataDataSet.getView('Base_DataModel_Field', 'default')!.rows).toEqual([])
    expect(owner.getState()).toEqual({status: 'idle', pending: false})
    owner.stage('description', '再次修改')
    await owner.save()
    expect(f.requests).toHaveLength(before + 2)
    expect(f.modelRow().description).toBe('再次修改')
  })

  it('saves only changed model fields, retaining unknown legacy values and reopening all models', async () => {
    const {f, session, view, owner, writes} = await setup()
    f.setModelValues({cacheType: 'legacy-cache', Filter: ' legacy filter '})
    await owner.reload(false)
    owner.stage('description', '订单说明')
    owner.stage('IsBusinessMain', 1)
    owner.stage('IsBusiness', 0)
    expect(view.rows[0]?.['description']).toBe('')
    expect(session.hasPendingModelEdits()).toBe(true)
    await owner.save()
    expect(writes()).toHaveLength(1)
    expect(writes()[0]?.data).toEqual([expect.objectContaining({TableName: 'Base_DataModel', CrudModel: expect.objectContaining({Changed: [
      {rowid: 'M1', description: '订单说明', IsBusinessMain: 1, lingma_sys_key: 'token-A-M1'},
    ]})})])
    expect(f.modelRow()).toMatchObject({cacheType: 'legacy-cache', Filter: ' legacy filter '})
    expect(f.fileWrites).toHaveLength(0)
    expect(session.hasPendingModelEdits()).toBe(false)
    expect(() => session.definitionDataSet).toThrow('定义投影已失效')
    const fresh = await f.open('A')
    expect(fresh.metadataDataSet.getView('Base_DataModel', 'default')!.rows).toHaveLength(2)
    expect(fresh.getModelEdit('M1').read().fields.find(field => field.name === 'IsBusinessMain')?.value).toBe(1)
    expect(fresh.definitionDataSet!.getView('OrdersAlias', 'default')).toBeDefined()
  })

  it('leaves another model staged change pending when saving the current model', async () => {
    const {f, owner, view, writes} = await setup()
    await view.editRowById('M2', {description: 'other staged'})
    owner.stage('description', 'current')
    const before = f.requests.length
    await owner.save()
    expect(f.requests).toHaveLength(before + 1)
    expect(writes()).toHaveLength(1)
    expect(f.modelRow('M1').description).toBe('current')
    expect(f.modelRow('M2').description).toBe('')
    expect(view.dirtyTracking.isDirty('M2')).toBe(true)
    expect(view.rows.find(row => row['rowid'] === 'M2')?.['description']).toBe('other staged')
    expect(owner.getState()).toEqual({status: 'idle', pending: false})
  })

  it('preserves saved wire filters and tree/request/cache values while changing only model properties', async () => {
    const {owner, f, writes} = await setup()
    const filter = DataSpaceDesignApi.serializeFilter(DataViewFilter.group({logic: 'or', filters: [
      {field: '订单编号', operator: 'ne', value: '0'}, {field: '订单编号', operator: 'in', value: ['A', 'B']}]}))
    const legacy = {Filter: filter, OutputType: 'SelfRefData', parentField: '订单编号', hasChildField: 'haschild',
      selfType: 'parent', topValue: '0', cacheType: '页面', RequestComplete: 'completed'}
    f.setModelValues(legacy); await owner.reload(false)
    owner.stage('description', '模型属性')
    await owner.save()
    expect(f.modelRow()).toMatchObject({...legacy, description: '模型属性'})
    const reopened = await f.open('A')
    expect(reopened.metadataDataSet.getView('Base_DataModel')!.rows.find(row => row['rowid'] === 'M1')).toMatchObject(legacy)
    expect(writes()[0]?.data).toEqual([expect.objectContaining({CrudModel: expect.objectContaining({Changed: [
      {rowid: 'M1', description: '模型属性', lingma_sys_key: 'token-A-M1'},
    ]})})])
    expect(f.fileWrites).toHaveLength(0); expect(writes()).toHaveLength(1)
  })

  it.each([{readOnly: true}, {hidden: true}])('refuses denied access without mutating the metadata row: %j', async options => {
    const {owner, writes, view} = await setup(options)
    expect(() => owner.stage('description', 'denied')).toThrow('不可写')
    expect(view.hasEditingChanges()).toBe(false); expect(writes()).toHaveLength(0)
  })

  it('rechecks field permissions without blocking unrelated writable fields', async () => {
    const {owner, f, writes} = await setup()
    f.denyModelField('description'); await owner.reload(false)
    expect(() => owner.stage('description', 'denied')).toThrow('不可写')
    owner.stage('IsBusinessMain', 1); await owner.save()
    expect(writes()).toHaveLength(1)
    expect(f.modelRow().description).toBe('')
  })

  it('rejects identity edits, invalid flags and request properties through the model owner', async () => {
    const {owner, view, writes} = await setup()
    for (const [field, value] of Object.entries({Name: 'renamed', MetaName: 'newSource', cacheType: 'bad', IsBusiness: '1', Filter: '{', parentField: 'missing'})) {
      expect(() => owner.stage(field, value)).toThrow()
    }
    view.updateEditingValue('M1', 'Name', 'renamed')
    await expect(owner.save()).rejects.toThrow('不能修改身份')
    owner.discard(); expect(view.hasEditingChanges()).toBe(false)
    expect(writes()).toHaveLength(0)
  })

  it('excludes input parameters and preserves interface filters while editing other fields', async () => {
    const {owner, f, writes} = await setup({sourceInput: true})
    expect(owner.read().columns.map(column => column.name)).toEqual(['订单编号'])
    expect(owner.read().fields.some(field => field.name === 'Filter')).toBe(false)
    expect(() => owner.stage('Filter', '{}')).toThrow('不能修改')
    expect(() => owner.stage('parentField', 'customerArg')).toThrow('不能修改')
    owner.stage('description', '接口说明'); await owner.save()
    expect(f.sourceValue()).toContain('SystemData'); expect(writes()).toHaveLength(1)
  })

  it('rejects request drafts introduced after asynchronous apply before dispatch', async () => {
    const {owner, view, writes} = await setup()
    owner.stage('description', '模型属性')
    const apply = view.applyEditingRows.bind(view)
    vi.spyOn(view, 'applyEditingRows').mockImplementation(async ids => {
      const result = await apply(ids)
      view.updateEditingValue('M1', 'OutputType', 'Join')
      return result
    })
    await expect(owner.save()).rejects.toThrow('提交前模型草稿已变化')
    expect(writes()).toHaveLength(0)
  })

  it('preserves other model drafts before staging and after dispatch without reloading them', async () => {
    const {owner, view, f, writes} = await setup()
    view.updateEditingValue('M2', 'description', 'other')
    owner.stage('description', 'new')
    const release = f.holdModelResponse()
    const before = f.requests.length
    const saving = owner.save()
    await vi.waitFor(() => expect(writes()).toHaveLength(1))
    await expect(owner.save()).rejects.toThrow('先核验')
    await expect(owner.reload(true)).rejects.toThrow('仍在进行')
    view.updateEditingValue('M2', 'description', 'late')
    release(); await saving
    expect(view.getEditingRow('M2')?.['description']).toBe('late')
    expect(view.rows.find(row => row['rowid'] === 'M2')?.['description']).toBe('')
    expect(writes()[0]?.data).toEqual([expect.objectContaining({TableName: 'Base_DataModel', CrudModel: {
      Added: [], Changed: [{rowid: 'M1', description: 'new', lingma_sys_key: 'token-A-M1'}], Deleted: [],
    }})])
    expect(f.requests).toHaveLength(before + 1)
    expect(owner.getState()).toEqual({status: 'idle', pending: false})
  })

  it.each(['row identity', 'identity field permission'] as const)('does not certify a pending model mutation after %s becomes invalid', async invalidation => {
    const {owner, f, view} = await setup()
    owner.stage('description', 'saving')
    const release = f.holdModelResponse()
    const saving = owner.save()
    await vi.waitFor(() => expect(view.mutating).toBe(true))
    const originalName = view.rows[0]?.['Name']
    if (invalidation === 'row identity') view.rows[0]!['Name'] = 'changed identity'
    else {
      const fieldAccess = view.fieldAccess.bind(view)
      vi.spyOn(view, 'fieldAccess').mockImplementation((row, field) => field === 'Name'
        ? {...fieldAccess(row, field), read: 'invisible'}
        : fieldAccess(row, field))
    }
    expect(() => owner.isKnownPendingMutation()).toThrow()
    if (invalidation === 'row identity') view.rows[0]!['Name'] = originalName
    else vi.mocked(view.fieldAccess).mockRestore()
    release()
    await saving
  })

  it('certifies a normal pending mutation only while the full model identity remains valid', async () => {
    const {owner, f, view} = await setup()
    owner.stage('description', 'saving')
    const release = f.holdModelResponse()
    const saving = owner.save()
    await vi.waitFor(() => expect(view.mutating).toBe(true))
    expect(owner.isKnownPendingMutation()).toBe(true)
    release()
    await saving
    expect(owner.isKnownPendingMutation()).toBe(false)
  })

  it.each(['unknown', 'readback'])('recovers %s without repeating a model write', async mode => {
    const {owner, f, writes} = await setup()
    owner.stage('description', mode)
    if (mode === 'unknown') {
      f.loseNextResponse()
      await expect(owner.save()).rejects.toThrow()
    } else {
      await owner.save()
      f.failNextModelRead()
      await expect(owner.reload(false)).rejects.toThrow()
    }
    expect(owner.getState().status).toBe(mode)
    await expect(owner.save()).rejects.toThrow('先核验')
    await owner.reload(owner.getState().pending)
    expect(owner.getState()).toEqual({status: 'idle', pending: false})
    expect(f.modelRow().description).toBe(mode); expect(writes()).toHaveLength(1)
  })

  it('isolates equal model IDs across targets and refuses a changed query context', async () => {
    const {owner, f, view, writes} = await setup()
    const second = await f.open('B')
    const other = second.getModelEdit('M1')
    owner.stage('description', 'A'); other.stage('description', 'B')
    await owner.save(); await other.save()
    expect(f.modelRow('M1', 'A').description).toBe('A')
    expect(f.modelRow('M1', 'B').description).toBe('B')
    view.queryContext = {dataSpaceId: 'B'}
    expect(() => owner.stage('description', 'wrong')).toThrow('目标已变化')
    expect(writes()).toHaveLength(2)
  })

  it('rejects stale scope before dispatch and cannot confirm a response after disposal', async () => {
    const {owner, session, f, writes} = await setup()
    owner.stage('description', 'new')
    const release = f.holdModelResponse()
    const saving = expect(owner.save()).rejects.toThrow()
    await vi.waitFor(() => expect(writes()).toHaveLength(1))
    session.dispose(); release(); await saving
    await expect(owner.reload(true)).rejects.toThrow('释放')
    const fresh = await f.open('A'); const next = fresh.getModelEdit('M1')
    next.stage('description', 'not sent'); f.invalidate()
    await expect(next.save()).rejects.toThrow('SCOPE_STALE')
    expect(writes()).toHaveLength(1)
  })
})
