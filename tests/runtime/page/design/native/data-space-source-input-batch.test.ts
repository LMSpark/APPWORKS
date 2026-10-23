import {afterEach, describe, expect, it, vi} from 'vitest'
import {RequestState} from '@spark-appworks/spark-data'
import {dataSpacePageFixture} from './data-space-page.fixture'
import {LowcodeDataSpaceSourceInputEdit} from '@/lowcode/data-space/model-source/source-input/lowcode-data-space-source-input-session'
import {verifyAndDiscardDataSpaceDefinitionCapture} from '@/lowcode/data-space/model-source/save/data-space-definition-save'

const fixtures: ReturnType<typeof dataSpacePageFixture>[] = []
afterEach(() => {vi.restoreAllMocks(); fixtures.splice(0).forEach(f => f.dispose())})
async function setup(overviewOnly = false) {
  const f = dataSpacePageFixture({overviewOnly, allowSourceEdit: true, editableFieldProperties: ['description'], sourceFields: [
    {rowid: 'F1', dataModelId: 'M1', Name: 'rowid', type: 'dataModel', FieldType: 'string', IsOutput: 1, IsPKey: 1, description: '原字段'},
    {rowid: 'I1', dataModelId: 'M1', Name: 'customer', type: 'inputParams', ValueFun: ' {"Type":"SystemData","ParamName":"customer"} '},
    {rowid: 'I2', dataModelId: 'M1', Name: 'flags', type: 'inputParams', ValueFun: ''},
    {rowid: 'OTHER', dataModelId: 'M2', Name: 'other', type: 'inputParams', ValueFun: ''},
  ]})
  fixtures.push(f); f.setModelValues({Type: '接口'})
  const session = await f.open('A'), fields = await session.loadModelFields('M1')
  const view = await session.loadSourceInputFields('M1'), inputs = session.getModelSourceInputs('M1')
  return {f, session, fields, view, inputs, model: session.getModelEdit('M1'), field: session.getFieldEdit('F1', 'modelFields'),
    writes: () => f.requests.filter(r => r.url?.includes('BatchTableOperate'))}
}
const reference = '{"Type":"GetInputParam","ParamName":"customer"}'
const constant = '{"Type":"GetConstValue","Value":[false,1]}'

describe('source parameters in the model workspace batch', () => {
  it('loads and saves source parameters using their owning model on a partial model page', async () => {
    const {f, session, writes} = await setup(true)
    const models = session.metadataDataSet.getView('Base_DataModel')!
    await models.loadFromServer({page: 1, pageSize: 1})
    const view = await session.loadSourceInputFields('M1'), inputs = session.getModelSourceInputs('M1'), input = inputs[0]!
    input.stage(constant); input.discard()
    expect(view.hasEditingChanges()).toBe(false)
    input.stage(reference)
    const before = f.requests.length
    await session.getModelEdit('M1').save([], inputs)
    expect(f.requests).toHaveLength(before + 1); expect(writes()).toHaveLength(1)
    expect(models.rows).toHaveLength(1); expect(models.total).toBe(2)
    const reopened = await f.open('A'), saved = await reopened.loadSourceInputFields('M1')
    expect(saved.rows.find(row => row['rowid'] === 'I1')?.['ValueFun']).toBe(reference)
    expect(f.fileWrites).toEqual([])
  })

  it.each([false, true])('accepts the native input receipt without a second query and preserves a later draft: %s', async lateDraft => {
    const {f, view, inputs, writes} = await setup(true)
    const input = inputs[0]!
    input.stage(reference)
    const before = f.requests.length, release = f.holdModelResponse()
    const saving = input.save().then(() => undefined, (error: unknown) => error)
    await vi.waitFor(() => expect(writes()).toHaveLength(1))
    if (lateDraft) view.updateEditingValue('I1', 'ValueFun', constant)
    release()
    expect(await saving).toBeUndefined()
    expect(f.requests.slice(before).map(request => request.url)).toEqual(['/api/DataOperation/BatchTableOperateRequestByCRUD'])
    expect(view.rows.find(row => row['rowid'] === 'I1')?.['ValueFun']).toBe(reference)
    expect(input.getState()).toEqual({status: 'idle', pending: lateDraft})
    expect(view.getEditingRow('I1')?.['ValueFun']).toBe(lateDraft ? constant : reference)
    const fresh = await f.open('A'), reopened = await fresh.loadSourceInputFields('M1')
    expect(reopened.rows.find(row => row['rowid'] === 'I1')?.['ValueFun']).toBe(reference)
    if (lateDraft) input.discard()
    expect(view.getEditingRow('I1')?.['ValueFun']).toBe(reference)
  })
  it('saves two parameters, model settings and field edits in one request and reopens the result', async () => {
    const {f, session, fields, inputs, view, model, field, writes} = await setup()
    expect(view.rows.map(row => row['rowid'])).toEqual(['I1', 'I2'])
    inputs[0]!.stage(reference); inputs[1]!.stage(constant)
    fields.updateEditingValue('F1', 'description', '统一字段')
    model.stage('description', '来源映射与模型属性')
    await model.save([field], inputs)
    expect(writes()).toHaveLength(1)
    expect(session.hasPendingSourceInputs()).toBe(false)
    expect(view.rows.map(row => row['ValueFun'])).toEqual([reference, constant])
    const fresh = await f.open('A'), reloaded = await fresh.loadSourceInputFields('M1')
    expect(reloaded.rows.map(row => row['ValueFun'])).toEqual([reference, constant])
    expect(fresh.getModelEdit('M1').read().fields.find(item => item.name === 'description')?.value).toBe('来源映射与模型属性')
    expect(fresh.metadataDataSet.getView('Base_DataModel_Field')?.rows.find(row => row['rowid'] === 'F1')?.['description']).toBe('统一字段')
  })
  it('validates every parameter before applying any model change and preserves unedited legacy text', async () => {
    const {inputs, view, model, writes} = await setup()
    inputs[1]!.stage(constant); model.stage('description', '模型草稿')
    view.updateEditingValue('I1', 'ValueFun', '{"Type":"GetInputParam","ParamName":"missing"}')
    await expect(model.save([], inputs)).rejects.toThrow('未声明')
    expect(writes()).toHaveLength(0); expect(model.getState().pending).toBe(true)
    inputs[0]!.discard()
    await model.save([], inputs)
    expect(view.rows[0]?.['ValueFun']).toBe(' {"Type":"SystemData","ParamName":"customer"} ')
    expect(writes()).toHaveLength(1)
  })
  it('allows model-only changes when unchanged source parameters are readonly', async () => {
    const {f, view, inputs, model, writes} = await setup()
    f.denySourceWrite(); await view.loadFromServer()
    expect(inputs.every(owner => !owner.read().writable)).toBe(true)
    model.stage('description', '模型可改')
    await model.save([], inputs)
    expect(writes()).toHaveLength(1)
    expect(view.hasEditingChanges()).toBe(false)
  })

  it('rejects parameter permissions tightened after editing without applying the model draft', async () => {
    const {f, inputs, view, model, writes} = await setup()
    f.denySourceWrite(); await view.loadFromServer()
    view.updateEditingValue('I1', 'ValueFun', reference); model.stage('description', '模型草稿')
    await expect(model.save([], inputs)).rejects.toThrow('不可写')
    expect(model.getState().pending).toBe(true); expect(writes()).toHaveLength(0)
  })

  it('keeps all owners recoverable after an uncertain receipt without replay', async () => {
    const {f, inputs, model, writes} = await setup()
    inputs[0]!.stage(reference); inputs[1]!.stage(constant); model.stage('description', '写入')
    f.loseNextResponse()
    await expect(model.save([], inputs)).rejects.toThrow()
    expect(inputs.map(owner => owner.getState().status)).toEqual(['unknown', 'unknown'])
    await expect(model.save([], inputs)).rejects.toThrow()
    const capture = inputs[0]!.getRecoveryCapture()
    expect(capture).toBeDefined(); expect(model.getRecoveryCapture()).toBe(capture)
    await expect(model.reload(true)).rejects.toThrow('3 字段呈现')
    expect(await verifyAndDiscardDataSpaceDefinitionCapture(f.sessions[0]!.metadataDataSet, capture!)).toBe('confirmed')
    await model.reload(true); await LowcodeDataSpaceSourceInputEdit.reloadBatch(inputs, true)
    expect(inputs.every(owner => owner.getState().status === 'idle')).toBe(true)
    expect(writes()).toHaveLength(1)
  })
  it('rejects a cross-space batch and late changed drafts without losing the edit', async () => {
    const {f, session, view, inputs, model, writes} = await setup()
    f.setModelValues({Type: '接口'}, 'B')
    const other = await f.open('B'); await other.loadSourceInputFields('M1')
    const foreign = other.getModelSourceInputs('M1'); foreign[0]!.stage(reference)
    await expect(model.save([], foreign)).rejects.toThrow('当前数据空间实例')
    inputs[0]!.stage(reference); model.stage('description', '模型')
    const models = session.metadataDataSet.getView('Base_DataModel')!, apply = models.applyEditingRows.bind(models)
    vi.spyOn(models, 'applyEditingRows').mockImplementation(async ids => {
      const result = await apply(ids); view.updateEditingValue('I1', 'ValueFun', constant); return result
    })
    await expect(model.save([], inputs)).rejects.toThrow('草稿已变化')
    expect(view.getEditingRow('I1')?.['ValueFun']).toBe(constant)
    expect(writes()).toHaveLength(0)
  })
})

describe('source input sibling views and scoped readback', () => {
  it.each([false, true])('refreshes the loaded directory separately from the accepted input save: read fails=%s', async fails => {
    const {f, session, inputs, view, writes} = await setup()
    const directory = session.metadataDataSet.getView('Base_DataModel_Field')!
    inputs[0]!.stage(reference)
    if (fails) f.failNextFieldRead()
    await inputs[0]!.save()
    expect(inputs[0]!.getState()).toEqual({status: 'idle', pending: false})
    expect(view.rows.find(row => row['rowid'] === 'I1')?.['ValueFun']).toBe(reference)
    expect(directory.requestState).toBe(fails ? RequestState.Failed : RequestState.Loaded)
    if (fails) {
      expect(directory.loadingError?.message).toContain('field read unavailable')
      await session.loadMetadataViews(['Base_DataModel_Field'])
    }
    expect(directory.rows.find(row => row['rowid'] === 'I1')?.['ValueFun']).toBe(reference)
    const reopened = await f.open('A'), fresh = await reopened.loadSourceInputFields('M1')
    expect(fresh.rows.find(row => row['rowid'] === 'I1')?.['ValueFun']).toBe(reference)
    expect(writes()).toHaveLength(1)
  })
  it('saves and cancels scoped inputs without loading the space-wide field directory', async () => {
    const {f, session, inputs, view, model, writes} = await setup(true)
    const directory = session.metadataDataSet.getView('Base_DataModel_Field', 'default')!
    inputs[0]!.stage(reference); inputs[0]!.discard()
    expect(writes()).toHaveLength(0); expect(directory.rows).toEqual([])
    inputs[0]!.stage(reference)
    const start = f.requests.length
    await model.save([], inputs)
    expect(view.getEditingRow('I1')?.['ValueFun']).toBe(reference)
    expect(directory.rows).toEqual([])
    const reads = f.requests.slice(start).filter(request => request.url?.endsWith('/GetData'))
    expect(reads).toHaveLength(0)
    const reopened = await f.open('A'), result = await reopened.loadSourceInputFields('M1')
    expect(result.getEditingRow('I1')?.['ValueFun']).toBe(reference)
    expect(reopened.metadataDataSet.getView('Base_DataModel_Field', 'default')?.rows).toEqual([])
    expect(writes()).toHaveLength(1)
  })

  it('rejects a same-input draft in another view before applying or dispatching', async () => {
    const {session, inputs, view, model, writes} = await setup()
    inputs[0]!.stage(reference)
    const directory = session.metadataDataSet.getView('Base_DataModel_Field', 'default')!
    directory.updateEditingValue('I1', 'ValueFun', constant)
    await expect(model.save([], inputs)).rejects.toThrow('同一字段')
    expect(writes()).toHaveLength(0)
    expect(view.getEditingRow('I1')?.['ValueFun']).toBe(reference)
    expect(directory.getEditingRow('I1')?.['ValueFun']).toBe(constant)
  })

  it('rechecks a conflict introduced while applying input changes before dispatch', async () => {
    const {session, inputs, view, model, writes} = await setup()
    inputs[0]!.stage(reference)
    const directory = session.metadataDataSet.getView('Base_DataModel_Field', 'default')!, apply = view.applyEditingRows.bind(view)
    vi.spyOn(view, 'applyEditingRows').mockImplementation(async ids => {
      const result = await apply(ids); directory.updateEditingValue('I1', 'ValueFun', constant); return result
    })
    await expect(model.save([], inputs)).rejects.toThrow('同一字段')
    expect(writes()).toHaveLength(0)
    expect(view.dirtyTracking.hasPendingChanges('I1')).toBe(true)
    expect(inputs[0]!.getState().status).toBe('unsubmitted')
  })

  it('recovers an unknown input write while preserving an unrelated directory draft and never replays it', async () => {
    const {f, session, inputs, view, model, writes} = await setup()
    inputs[0]!.stage(reference)
    const directory = session.metadataDataSet.getView('Base_DataModel_Field', 'default')!
    directory.updateEditingValue('OTHER', 'ValueFun', constant)
    f.loseNextResponse()
    await expect(model.save([], inputs)).rejects.toThrow()
    expect(inputs[0]!.getState().status).toBe('unknown')
    await LowcodeDataSpaceSourceInputEdit.reloadBatch(inputs, true)
    expect(inputs[0]!.getState().status).toBe('idle')
    expect(view.getEditingRow('I1')?.['ValueFun']).toBe(reference)
    expect(directory.getEditingRow('OTHER')?.['ValueFun']).toBe(constant)
    expect(directory.hasEditingChanges('OTHER')).toBe(true)
    expect(writes()).toHaveLength(1)
  })
})
