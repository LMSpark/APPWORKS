import {afterEach, describe, expect, it, vi} from 'vitest'
import {RequestState} from '@spark-appworks/spark-data'
import {dataSpacePageFixture} from './data-space-page.fixture'

const fixtures: ReturnType<typeof dataSpacePageFixture>[] = []
afterEach(() => {vi.restoreAllMocks(); fixtures.splice(0).forEach(f => f.dispose())})
async function setup(deferred = false) {
  const f = dataSpacePageFixture({overviewOnly: deferred, deferDefinition: deferred,
    allowSourceEdit: true, allowFieldEdit: true, editableFieldProperties: ['description', 'AsName', 'Order'],
    sourceFields: [{rowid: 'F1', dataModelId: 'M1', Name: 'amount', type: 'dataModel', FieldType: 'number', IsPKey: 0, IsOutput: 1, description: '', AsName: 'amount'}]})
  fixtures.push(f)
  const session = await f.open('A'), fields = await session.loadModelFields('M1')
  const owner = session.getModelEdit('M1'), field = session.getFieldEdit('F1', 'modelFields')
  return {f, session, fields, owner, field, writes: () => f.requests.filter(r => r.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')}
}
describe('reference model workspace save', () => {
  it.each([false, true])('accepts the native column receipt without a second query and preserves a later draft: %s', async lateDraft => {
    const {f, session, fields, field, writes} = await setup(true)
    fields.updateEditingValue('F1', 'description', '已提交列标题')
    const before = f.requests.length, release = f.holdModelResponse()
    const saving = field.save().then(() => undefined, (error: unknown) => error)
    await vi.waitFor(() => expect(writes()).toHaveLength(1))
    if (lateDraft) fields.updateEditingValue('F1', 'description', '下一次列标题')
    release()
    expect(await saving).toBeUndefined()
    expect(f.requests.slice(before).map(request => request.url)).toEqual(['/api/DataOperation/BatchTableOperateRequestByCRUD'])
    expect(fields.rows.find(row => row['rowid'] === 'F1')?.['description']).toBe('已提交列标题')
    expect(field.getState()).toEqual({status: 'idle', pending: lateDraft})
    expect(fields.getEditingRow('F1')?.['description']).toBe(lateDraft ? '下一次列标题' : '已提交列标题')
    expect(session.metadataDataSet.getView('Base_DataModel_Field')?.requestState).toBe(RequestState.Idle)
    const fresh = await f.open('A'), reopened = await fresh.loadModelFields('M1')
    expect(reopened.rows.find(row => row['rowid'] === 'F1')?.['description']).toBe('已提交列标题')
    if (lateDraft) field.discard()
    expect(fields.getEditingRow('F1')?.['description']).toBe('已提交列标题')
  })
  it('distinguishes invalidation from failed assembly without allowing a stale projection or automatic reassembly', async () => {
    const {session, fields, field, writes} = await setup()
    expect(session.definitionStatus).toBe('ready')
    const old = session.definitionDataSet!, load = vi.spyOn(session, 'loadDefinition')
    fields.updateEditingValue('F1', 'description', '更新后按需读取')
    await field.save()
    expect(session.definitionStatus).toBe('unloaded')
    expect(session.definitionError).toBeNull()
    expect(old.destroyed).toBe(true)
    expect(() => session.definitionDataSet).toThrow('定义投影已失效')
    expect(load).not.toHaveBeenCalled()
    expect(field.readValueFunction().warning).toBe('')
    expect(field.readValueFunction().context.relatedFields).toEqual([{label: 'amount', value: 'amount'}])
    expect(field.readValueFunction().warning).not.toContain('STALE')
    const reading = session.loadDefinition()
    expect(session.definitionStatus).toBe('loading')
    await reading
    expect(session.definitionStatus).toBe('ready')
    expect(session.definitionDataSet).not.toBe(old)
    expect(writes()).toHaveLength(1)
  })
  it('distinguishes a missing file, a deferred definition and a real assembly failure, retaining scope checks', async () => {
    for (const [options, expected] of [[{missing: true}, 'absent'], [{deferDefinition: true}, 'unloaded'], [{broken: true}, 'failed']] as const) {
      const f = dataSpacePageFixture(options); fixtures.push(f)
      const session = await f.open('A')
      expect(session.definitionStatus).toBe(expected)
      if (expected === 'failed') expect(session.definitionError?.message).toContain('模型关系无法装配')
      f.invalidate()
      expect(() => session.definitionStatus).toThrow()
    }
  })

  it('saves model columns and model properties in one signed batch and reopens both', async () => {
    const {f, session, fields, owner, field, writes} = await setup(true)
    expect(session.definitionStatus).toBe('unloaded')
    expect(session.metadataDataSet.getView('Base_DataModel_Field')?.requestState).toBe(RequestState.Idle)
    fields.updateEditingValue('F1', 'description', '统一提交字段')
    owner.stage('description', '统一提交模型')
    owner.stage('IsBusinessMain', 1)
    await owner.save([field])
    expect(writes()).toHaveLength(1)
    expect(writes()[0]?.data).toEqual(expect.arrayContaining([
      expect.objectContaining({TableName: 'Base_DataModel', CrudModel: expect.objectContaining({Changed: [expect.objectContaining({rowid: 'M1', description: '统一提交模型', IsBusinessMain: 1})]})}),
      expect.objectContaining({TableName: 'Base_DataModel_Field', CrudModel: expect.objectContaining({Changed: [expect.objectContaining({rowid: 'F1', description: '统一提交字段'})]})}),
    ]))
    expect(session.metadataDataSet.getView('Base_DataModel_Field')?.requestState).toBe(RequestState.Idle)
    const fresh = await f.open('A')
    expect(fresh.getModelEdit('M1').read().fields.find(item => item.name === 'IsBusinessMain')?.value).toBe(1)
    const reopenedFields = await fresh.loadModelFields('M1')
    expect(reopenedFields).not.toBe(fields)
    expect(reopenedFields.rows.find(row => row['rowid'] === 'F1')?.['description']).toBe('统一提交字段')
    expect(field.getState()).toEqual({status: 'idle', pending: false})
  })
  it('keeps both owners unresolved after a lost receipt and never replays either part', async () => {
    const {f, fields, owner, field, writes} = await setup()
    fields.updateEditingValue('F1', 'description', '已写字段'); owner.stage('description', '已写模型')
    f.loseNextResponse()
    await expect(owner.save([field])).rejects.toThrow()
    expect([owner.getState().status, field.getState().status]).toEqual(['unknown', 'unknown'])
    await expect(owner.save([field])).rejects.toThrow()
    await expect(owner.reload(true)).rejects.toThrow(/3 字段呈现.*重新核验字段配置/)
    await owner.verifyRecovery(true)
    await owner.reload(false); await field.reload(false)
    expect(writes()).toHaveLength(1)
    expect([owner.getState().status, field.getState().status]).toEqual(['idle', 'idle'])
  })
  it('validates output changes together with the request draft before dispatch', async () => {
    const {fields, owner, field, writes} = await setup()
    fields.updateEditingValue('F1', 'AsName', 'totalAmount'); owner.stage('description', '输出金额')
    await owner.save([field])
    expect(writes()).toHaveLength(1)
    expect(fields.rows.find(row => row['rowid'] === 'F1')?.['AsName']).toBe('totalAmount')
  })
  it('does not submit the model when a field has lost write access', async () => {
    const {f, fields, owner, field, writes} = await setup()
    f.denyFieldProperty('description'); await fields.loadFromServer({allPages: true})
    fields.updateEditingValue('F1', 'description', '拒绝'); owner.stage('description', '保留模型草稿')
    await expect(owner.save([field])).rejects.toThrow('不可写')
    expect(writes()).toHaveLength(0); expect(owner.getState().status).toBe('idle')
  })
  it('refuses another instance even when there is no model patch', async () => {
    const {f, owner, writes} = await setup(), other = await f.open('B')
    const fields = await other.loadModelFields('M1'), field = other.getFieldEdit('F1', 'modelFields')
    fields.updateEditingValue('F1', 'description', '其他空间')
    await expect(owner.save([field])).rejects.toThrow('当前数据空间实例')
    expect(writes()).toHaveLength(0)
  })
  it('detects a field draft changed while another part is being applied', async () => {
    const {session, fields, owner, field, writes} = await setup()
    fields.updateEditingValue('F1', 'description', '预检前'); owner.stage('description', '模型')
    const modelView = session.metadataDataSet.getView('Base_DataModel')!, apply = modelView.applyEditingRows.bind(modelView)
    vi.spyOn(modelView, 'applyEditingRows').mockImplementation(async ids => {
      const result = await apply(ids); fields.updateEditingValue('F1', 'description', '异步修改'); return result
    })
    await expect(owner.save([field])).rejects.toThrow('应用前字段草稿已变化')
    expect(writes()).toHaveLength(0); expect(fields.getEditingPatch('F1')?.['description']).toBe('异步修改')
  })
})
