import {afterEach, describe, expect, it, vi} from 'vitest'
import {RequestState} from '@spark-appworks/spark-data'
import {dataSpacePageFixture} from './data-space-page.fixture'
import {fieldEditStageOutputBatch} from '@/lowcode/data-space/model-source/field/lowcode-data-space-field-edit-session'

const fixtures: ReturnType<typeof dataSpacePageFixture>[] = []
afterEach(() => {fixtures.splice(0).forEach(fixture => fixture.dispose())})
function fixture(extra: Parameters<typeof dataSpacePageFixture>[0] = {}) {
  const result = dataSpacePageFixture({allowFieldEdit: true, editableFieldProperties: ['description', 'IsOutput'], sourceFields: [
    {rowid: 'PK', dataModelId: 'M1', Name: 'rowid', type: 'dataModel', FieldType: 'string', IsPKey: 1, IsOutput: 1},
    {rowid: 'F1', dataModelId: 'M1', Name: 'amount', type: 'dataModel', FieldType: 'number', IsPKey: 0, IsOutput: 1, description: '金额'},
    {rowid: 'OTHER', dataModelId: 'M2', Name: 'customer', type: 'dataModel', FieldType: 'string', IsPKey: 0, IsOutput: 1},
  ], ...extra}); fixtures.push(result); return result
}
function writes(f: ReturnType<typeof fixture>) {return f.requests.filter(request => request.url?.includes('BatchTableOperate'))}

describe('model field workspace uses formal query views', () => {
  it('edits, cancels and saves a column with only its owning model page loaded', async () => {
    const f = fixture({overviewOnly: true}), session = await f.open('A')
    const models = session.metadataDataSet.getView('Base_DataModel')!
    await models.loadFromServer({page: 1, pageSize: 1})
    const view = await session.loadModelFields('M1'), owner = session.getFieldEdit('F1', 'modelFields')
    expect(models.rows).toHaveLength(1); expect(models.total).toBe(2)
    view.updateEditingValue('F1', 'description', '取消说明'); owner.discard()
    expect(view.getEditingRow('F1')?.['description']).toBe('金额')
    view.updateEditingValue('F1', 'description', '按所属模型保存')
    const before = f.requests.length
    await owner.save()
    expect(f.requests).toHaveLength(before + 1); expect(writes(f)).toHaveLength(1)
    expect(models.rows).toHaveLength(1); expect(models.total).toBe(2)
    expect(session.metadataDataSet.getView('Base_DataModel_Field')!.rows).toEqual([])
    const reopened = await f.open('A'); await reopened.loadDefinition()
    expect(reopened.definitionDataSet!.getTable('OrdersAlias')!.columns.find(column => column.name === 'amount')?.label).toBe('按所属模型保存')
    await models.loadFromServer({page: 2, pageSize: 1})
    view.updateEditingValue('F1', 'description', '所属模型已离开当前查询')
    await expect(owner.save()).rejects.toThrow('所属模型不可确认')
    expect(writes(f)).toHaveLength(1); expect(view.hasEditingChanges('F1')).toBe(true)
  })

  it('keeps a confirmed column save usable when refreshing the separate loaded directory fails', async () => {
    const f = fixture(), session = await f.open('A'), view = await session.loadModelFields('M1')
    const owner = session.getFieldEdit('F1', 'modelFields'), directory = session.metadataDataSet.getView('Base_DataModel_Field')!
    view.updateEditingValue('F1', 'description', '已保存列说明'); f.failNextFieldRead()
    await owner.save()
    expect(owner.getState()).toEqual({status: 'idle', pending: false})
    expect(view.rows.find(row => row['rowid'] === 'F1')?.['description']).toBe('已保存列说明')
    expect(view.requestState).toBe(RequestState.Loaded)
    expect(directory.requestState).toBe(RequestState.Failed)
    expect(directory.loadingError?.message).toContain('field read unavailable')
    await session.loadMetadataViews(['Base_DataModel_Field'])
    expect(directory.rows.find(row => row['rowid'] === 'F1')?.['description']).toBe('已保存列说明')
    const reopened = await f.open('A')
    expect(reopened.definitionDataSet?.getTable('OrdersAlias')?.columns.find(column => column.name === 'amount')?.label).toBe('已保存列说明')
    expect(writes(f)).toHaveLength(1)
  })
  it('binds request candidates to the loaded model view and rejects a later model switch', async () => {
    const f = fixture({overviewOnly: true}), session = await f.open('A')
    await session.loadModelFields('M1')
    const owner = session.getModelEdit('M1')
    expect(owner.read().columns.map(column => column.name)).toEqual(['rowid', 'amount'])
    expect(owner.read().warning).toBe('')
    await session.loadModelFields('M2')
    expect(owner.read().columns).toEqual([])
    expect(owner.read().warning).toContain('字段视图')
    expect(session.getModelEdit('M2').read().columns.map(column => column.name)).toEqual(['customer'])
    expect(writes(f)).toEqual([])
  })

  it('retains primary output, batches other output changes, and cancels without a write', async () => {
    const f = fixture(), session = await f.open('A'), view = await session.loadModelFields('M1')
    const owners = view.rows.map(row => session.getFieldEdit(String(row['rowid']), 'modelFields'))
    await fieldEditStageOutputBatch(owners, 'invert')
    expect(view.getEditingRow('PK')?.['IsOutput']).toBe(1)
    expect(view.getEditingRow('F1')?.['IsOutput']).toBe(0)
    await expect(session.loadModelFields('M2')).rejects.toThrow('字段草稿')
    owners.forEach(owner => owner.discard())
    expect(view.getEditingRow('F1')?.['IsOutput']).toBe(1)
    expect(writes(f)).toHaveLength(0)
  })

  it('rejects a denied output target before staging any part of the batch', async () => {
    const f = fixture({deniedFieldOutputIds: ['F1']}), session = await f.open('A'), view = await session.loadModelFields('M1')
    const owners = view.rows.map(row => session.getFieldEdit(String(row['rowid']), 'modelFields'))
    await expect(fieldEditStageOutputBatch(owners, 'invert')).rejects.toThrow()
    expect(view.hasEditingChanges()).toBe(false)
    expect(writes(f)).toHaveLength(0)
  })

  it('keeps uncertain writes in the same view until explicit readback without replay', async () => {
    const f = fixture(), session = await f.open('A'), view = await session.loadModelFields('M1')
    const owner = session.getFieldEdit('F1', 'modelFields')
    view.updateEditingValue('F1', 'description', '已派发修改'); f.loseNextResponse()
    await expect(owner.save()).rejects.toThrow()
    expect(owner.getState().status).toBe('unknown')
    await expect(session.loadModelFields('M2')).rejects.toThrow('字段草稿')
    await owner.reload(true)
    expect(view.getEditingRow('F1')?.['description']).toBe('已派发修改')
    expect(session.metadataDataSet.getView('Base_DataModel_Field', 'default')!.getEditingRow('F1')?.['description']).toBe('已派发修改')
    expect(owner.getState()).toEqual({status: 'idle', pending: false})
    expect(writes(f)).toHaveLength(1)
  })

  it('rejects saving when another field view contains a conflicting draft', async () => {
    const f = fixture(), session = await f.open('A'), view = await session.loadModelFields('M1')
    const owner = session.getFieldEdit('F1', 'modelFields')
    view.updateEditingValue('F1', 'description', '命名视图草稿')
    const directory = session.metadataDataSet.getView('Base_DataModel_Field', 'default')!
    directory.updateEditingValue('F1', 'description', '另一视图草稿')
    await expect(owner.save()).rejects.toThrow()
    expect(writes(f)).toHaveLength(0)
    expect(owner.getState().status).toBe('idle')
    expect(view.getEditingRow('F1')?.['description']).toBe('命名视图草稿')
    expect(directory.getEditingRow('F1')?.['description']).toBe('另一视图草稿')
  })
})

describe('field saves preserve independent query drafts', () => {
  it.each(['editing', 'applied', 'created', 'deleted'] as const)('saves and reopens one model while retaining an unrelated %s row in the directory', async mode => {
    const f = fixture({allowFieldAdd: true, allowDelete: true}), session = await f.open('A')
    const view = await session.loadModelFields('M1'), owner = session.getFieldEdit('F1', 'modelFields')
    const directory = session.metadataDataSet.getView('Base_DataModel_Field', 'default')!
    if (mode === 'created') {
      await directory.addRowWithIdentity({field: 'rowid', value: 'NEW'}, {dataSetId: 'A', dataModelId: 'M2', Name: 'extra', type: 'dataModel', FieldType: '计算字段', IsPKey: 0, IsOutput: 1})
      expect(directory.dirtyTracking.isPendingCreate('NEW')).toBe(true)
    } else if (mode === 'deleted') {
      expect(await directory.removeRow('OTHER')).toBe(true)
    } else {
      directory.updateEditingValue('OTHER', 'description', '保留其他模型草稿')
      if (mode === 'applied') expect((await directory.applyEditingRows(['OTHER'])).success).toBe(true)
    }
    const snapshot = () => JSON.stringify({rows: directory.rows, editing: directory.getEditingRow('OTHER'),
      changed: [...directory.dirtyTracking.dirtyRowIds], added: [...directory.dirtyTracking.pendingCreateIds], deleted: [...directory.dirtyTracking.pendingDeleteIds]})
    const before = snapshot()
    view.updateEditingValue('F1', 'description', '取消这次修改'); owner.discard()
    expect(snapshot()).toBe(before); expect(writes(f)).toHaveLength(0)
    view.updateEditingValue('F1', 'description', '独立保存')
    const start = f.requests.length
    await owner.save()
    expect(owner.getState()).toEqual({status: 'idle', pending: false})
    expect(view.getEditingRow('F1')?.['description']).toBe('独立保存')
    expect(snapshot()).toBe(before)
    expect(writes(f)).toHaveLength(1)
    expect(JSON.stringify(writes(f)[0]?.data)).not.toContain('保留其他模型草稿')
    expect(JSON.stringify(writes(f)[0]?.data)).not.toContain('OTHER')
    const reads = f.requests.slice(start).filter(request => request.url?.endsWith('/GetData'))
    expect(reads).toHaveLength(0)
    const reopened = await f.open('A'), reloaded = await reopened.loadModelFields('M1')
    expect(reloaded.getEditingRow('F1')?.['description']).toBe('独立保存')
    expect(snapshot()).toBe(before)
    expect(writes(f)).toHaveLength(1)
  })

  it.each(['applied', 'deleted'] as const)('still rejects a %s conflict for the same formal field', async mode => {
    const f = fixture({allowDelete: true}), session = await f.open('A'), view = await session.loadModelFields('M1')
    const owner = session.getFieldEdit('F1', 'modelFields'), directory = session.metadataDataSet.getView('Base_DataModel_Field', 'default')!
    view.updateEditingValue('F1', 'description', '本视图修改')
    if (mode === 'deleted') expect(await directory.removeRow('F1')).toBe(true)
    else {directory.updateEditingValue('F1', 'description', '已应用修改'); expect((await directory.applyEditingRows(['F1'])).success).toBe(true)}
    await expect(owner.save()).rejects.toThrow('同一字段')
    expect(writes(f)).toHaveLength(0)
    expect(view.getEditingRow('F1')?.['description']).toBe('本视图修改')
    expect(directory.dirtyTracking.hasPendingChanges('F1')).toBe(true)
  })

  it('checks a sibling conflict introduced while applying edits before dispatch', async () => {
    const f = fixture(), session = await f.open('A'), view = await session.loadModelFields('M1')
    const owner = session.getFieldEdit('F1', 'modelFields'), directory = session.metadataDataSet.getView('Base_DataModel_Field', 'default')!
    view.updateEditingValue('F1', 'description', '本视图修改')
    const apply = view.applyEditingRows.bind(view)
    const spy = vi.spyOn(view, 'applyEditingRows').mockImplementation(async ids => {
      const result = await apply(ids)
      directory.updateEditingValue('F1', 'description', '应用期间的新冲突')
      return result
    })
    try {await expect(owner.save()).rejects.toThrow('同一字段')} finally {spy.mockRestore()}
    expect(writes(f)).toHaveLength(0)
    expect(owner.getState()).toEqual({status: 'unsubmitted', pending: true})
    expect(directory.getEditingRow('F1')?.['description']).toBe('应用期间的新冲突')
    expect(view.dirtyTracking.hasPendingChanges('F1')).toBe(true)
  })

  it('recovers an unknown field submission without replay or discarding an unrelated directory draft', async () => {
    const f = fixture(), session = await f.open('A'), view = await session.loadModelFields('M1')
    const owner = session.getFieldEdit('F1', 'modelFields'), directory = session.metadataDataSet.getView('Base_DataModel_Field', 'default')!
    directory.updateEditingValue('OTHER', 'description', '独立未提交')
    view.updateEditingValue('F1', 'description', '服务器已保存'); f.loseNextResponse()
    await expect(owner.save()).rejects.toThrow()
    expect(owner.getState().status).toBe('unknown')
    await owner.reload(true)
    expect(owner.getState()).toEqual({status: 'idle', pending: false})
    expect(view.getEditingRow('F1')?.['description']).toBe('服务器已保存')
    expect(directory.getEditingRow('OTHER')?.['description']).toBe('独立未提交')
    expect(directory.hasEditingChanges('OTHER')).toBe(true)
    expect(writes(f)).toHaveLength(1)
  })
})
