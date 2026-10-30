import {afterEach, describe, expect, it, vi} from 'vitest'
import {dataSpacePageFixture} from './data-space-page.fixture'
import {LowcodeDataSpaceFieldValue} from '@/lowcode/data-space/model-source/field/lowcode-data-space-field-value'

const fixtures: ReturnType<typeof dataSpacePageFixture>[] = []
const reference = '{"Type":"GetInputParam","ParamName":"customer"}'
const constant = '{"Type":"GetConstValue","Value":false}'
afterEach(() => fixtures.splice(0).forEach(f => f.dispose()))
async function setup(options: Parameters<typeof dataSpacePageFixture>[0] = {}) {
  const f = dataSpacePageFixture({...options, sourceInput: true}); fixtures.push(f)
  const session = await f.open('A')
  return {f, session, fields: session.metadataDataSet.getView('Base_DataModel_Field', 'default')!,
    declarations: session.metadataDataSet.getView('Base_DataSet', 'default')!,
    writes: () => f.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')}
}

describe('source parameter maintenance through the metadata DataSet', () => {
  it.each([false, true])('edits only the queried source parameter on a partial field page (existing owner=%s)', async existing => {
    const {session, f, fields, writes} = await setup()
    const previous = existing ? session.getSourceInput('F2') : undefined
    expect((await fields.loadFromServer({page: 2, pageSize: 1, allPages: false})).success).toBe(true)
    expect(fields.rows.map(row => row['rowid'])).toEqual(['F2'])
    expect(fields.total).toBe(2)
    const owner = previous ?? session.getSourceInput('F2'), original = f.sourceValue()
    const before = f.requests.length
    owner.stage(reference); owner.discard()
    expect(owner.read().value).toBe(original)
    expect(owner.getState()).toEqual({status: 'idle', pending: false})
    expect(f.requests).toHaveLength(before)
    owner.stage(constant); await owner.save()
    expect(f.requests).toHaveLength(before + 1)
    expect(writes()).toHaveLength(1)
    expect(writes()[0]?.data).toMatchObject([{CrudModel: {Changed: [{rowid: 'F2', ValueFun: constant}], Added: [], Deleted: []}}])
    expect(fields.rows.map(row => row['rowid'])).toEqual(['F2'])
    expect(fields.total).toBe(2)
    expect(owner.getState()).toEqual({status: 'idle', pending: false})
    const reopened = await f.open('A')
    expect(reopened.getSourceInput('F2').read().value).toBe(constant)
    expect(reopened.metadataDataSet.getView('Base_DataModel_Field')?.rows.find(row => row['rowid'] === 'F1')?.['ValueFun']).toBe('')
    expect(f.fileWrites).toEqual([])
    await fields.loadFromServer({page: 1, pageSize: 1, allPages: false})
    expect(() => owner.stage(reference)).toThrow('来源入参身份')
    expect(writes()).toHaveLength(1)
  })

  it('separates the space call catalogue from scoped source input names without editing definitions', async () => {
    const {session, writes} = await setup()
    const directory = new LowcodeDataSpaceFieldValue({dataSet: session.metadataDataSet, targetId: 'A', modelId: 'M1'})
    expect(directory.readQueryParameters('mapped')).toMatchObject({schema: {properties: {customer: {description: '客户'}}}, warning: ''})
    expect(directory.readQueryParameters('direct').warning).toContain('未完整读取')
    await session.loadSourceInputFields('M1')
    expect(Object.keys(directory.readQueryParameters('direct').schema.properties!)).toEqual(['customerArg'])
    const wrongModel = new LowcodeDataSpaceFieldValue({dataSet: session.metadataDataSet, targetId: 'A', modelId: 'M2'})
    expect(wrongModel.readQueryParameters('direct').warning).toContain('未完整读取')
    expect(writes()).toHaveLength(0)
  })
  it('reports unavailable parameter names instead of publishing a misleading empty catalogue', async () => {
    const {session} = await setup({hiddenFieldProperties: ['Name']})
    await session.loadSourceInputFields('M1')
    const result = new LowcodeDataSpaceFieldValue({dataSet: session.metadataDataSet, targetId: 'A', modelId: 'M1'}).readQueryParameters('direct')
    expect(result.warning).toContain('来源测试参数名称不可读'); expect(result.schema.properties).toEqual({})
  })
  it.each([{readOnly: true}, {hidden: true}])('rejects denied ValueFun access: %j', async options => {
    const {session, writes} = await setup(options)
    expect(() => session.getSourceInput('F2').stage(reference)).toThrow()
    expect(writes()).toHaveLength(0)
  })

  it('preserves the original source text and refuses implicit legacy conversion or undeclared references', async () => {
    const {session, f, fields, writes} = await setup()
    const owner = session.getSourceInput('F2')
    expect(owner.read().value).toBe(f.sourceValue())
    expect(() => owner.stage(f.sourceValue())).toThrow('旧原文不会自动转换')
    expect(() => owner.stage('{"Type":"GetInputParam","ParamName":"missing"}')).toThrow('未声明')
    expect(fields.hasEditingChanges()).toBe(false)
    expect(writes()).toHaveLength(0)
  })

  it('does not overwrite other field drafts or save a non-ValueFun field', async () => {
    const {session, fields, writes, f} = await setup()
    const owner = session.getSourceInput('F2')
    fields.updateEditingValue('F1', 'ValueFun', 'keep-other-draft')
    owner.stage(reference); await owner.save()
    expect(fields.getEditingRow('F1')?.['ValueFun']).toBe('keep-other-draft')
    expect(f.sourceValue()).toBe(reference)
    expect(writes()).toHaveLength(1)
    expect(writes()[0]?.data).toMatchObject([{CrudModel: {Changed: [{rowid: 'F2', ValueFun: reference}]}}])
    fields.updateEditingValue('F2', 'Name', 'must-not-save')
    await expect(owner.save()).rejects.toThrow('只允许修改ValueFun')
    expect(fields.getEditingRow('F2')?.['Name']).toBe('must-not-save')
    expect(writes()).toHaveLength(1)
  })

  it('requires persisted declarations for references but saves a typed constant independently', async () => {
    const {session, declarations, writes, f} = await setup()
    const owner = session.getSourceInput('F2')
    owner.stage(reference)
    declarations.updateEditingValue('A', 'inputParams', '[]')
    await expect(owner.save()).rejects.toThrow('先保存或放弃')
    expect(owner.read().inputParams).toEqual([])
    owner.stage(constant)
    await owner.save()
    expect(f.sourceValue()).toBe(constant)
    expect(declarations.getEditingRow('A')?.['inputParams']).toBe('[]')
    expect(declarations.hasEditingChanges()).toBe(true)
    expect(writes()).toHaveLength(1)
  })

  it('checks the model query target as well as the source row target', async () => {
    const {session, writes} = await setup()
    const owner = session.getSourceInput('F2')
    session.metadataDataSet.getView('Base_DataModel', 'default')!.queryContext = {dataSpaceId: 'B'}
    expect(() => owner.stage(reference)).toThrow('所属模型')
    expect(writes()).toHaveLength(0)
  })

  it('rechecks the latest data permission before staging and rejects stale execution scope', async () => {
    const {session, f, fields, writes} = await setup()
    const owner = session.getSourceInput('F2')
    f.denySourceWrite()
    expect((await fields.loadFromServer({allPages: true})).success).toBe(true)
    expect(owner.read().writable).toBe(false)
    expect(() => owner.stage(reference)).toThrow('不可写')
    f.invalidate()
    await expect(owner.save()).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
    expect(writes()).toHaveLength(0)
  })

  it('blocks duplicate in-flight writes and preserves an unrelated draft without forced readback', async () => {
    const {session, f, fields, writes} = await setup()
    const owner = session.getSourceInput('F2')
    const release = f.holdSourceResponse()
    owner.stage(reference)
    const saving = owner.save()
    const completed = expect(saving).resolves.toBeUndefined()
    await vi.waitFor(() => expect(writes()).toHaveLength(1))
    expect(() => session.definitionDataSet).toThrow('定义投影已失效')
    await expect(owner.save()).rejects.toThrow('先核验')
    await expect(owner.reload(true)).rejects.toThrow('仍在进行')
    fields.updateEditingValue('F1', 'ValueFun', 'late-draft')
    const beforeReceipt = f.requests.length
    release(); await completed
    expect(f.requests).toHaveLength(beforeReceipt)
    expect(owner.getState().status).toBe('idle')
    expect(fields.getEditingRow('F1')?.['ValueFun']).toBe('late-draft')
    expect(owner.read().value).toBe(reference)
    expect(owner.getState()).toEqual({status: 'idle', pending: false})
    expect(fields.rows).toHaveLength(2)
    expect(writes()).toHaveLength(1)
  })

  it('keeps confirmed save separate from an explicit read failure without replaying save', async () => {
    const {session, f, writes} = await setup()
    const owner = session.getSourceInput('F2')
    owner.stage(reference); f.failNextFieldRead()
    await owner.save()
    expect(owner.getState()).toEqual({status: 'idle', pending: false})
    expect(owner.read().value).toBe(reference)
    await expect(owner.reload(false)).rejects.toThrow('field read unavailable')
    expect(session.hasPendingSourceInputs()).toBe(true)
    await owner.reload(false)
    expect(owner.read().value).toBe(reference)
    expect(session.hasPendingSourceInputs()).toBe(false)
    expect(writes()).toHaveLength(1)
  })

  it('isolates same field IDs in different target spaces', async () => {
    const {session, f, fields} = await setup()
    const second = await f.open('B')
    session.getSourceInput('F2').stage(reference)
    const secondOwner = second.getSourceInput('F2')
    secondOwner.stage(constant); await secondOwner.save()
    expect(f.sourceValue('B')).toBe(constant)
    expect(f.sourceValue('A')).toContain('SystemData')
    expect(fields.getEditingRow('F2')?.['ValueFun']).toBe(reference)
    expect(session.hasPendingSourceInputs()).toBe(true)
  })

  it('rejects a target change between applying the edit and dispatching the write', async () => {
    const {session, fields, writes} = await setup()
    const owner = session.getSourceInput('F2')
    owner.stage(reference)
    const saving = owner.save()
    fields.queryContext = {dataSpaceId: 'B'}
    await expect(saving).rejects.toThrow('来源查询 owner 或目标已变化')
    expect(owner.getState().status).toBe('unsubmitted')
    expect(writes()).toHaveLength(0)
  })

  it('does not accept a late save result after the design session is released', async () => {
    const {session, f, writes} = await setup()
    const owner = session.getSourceInput('F2')
    const release = f.holdSourceResponse()
    owner.stage(reference)
    const outcome = owner.save().catch((cause: unknown) => cause)
    await vi.waitFor(() => expect(writes()).toHaveLength(1))
    session.dispose(); release()
    expect(await outcome).toBeInstanceOf(Error)
    expect(() => owner.read()).toThrow('会话已释放')
    expect(writes()).toHaveLength(1)
  })

  it('clears a source expression only by an explicit staged save', async () => {
    const {session, f, fields, writes} = await setup()
    const owner = session.getSourceInput('F2')
    owner.stage(''); owner.discard()
    expect(owner.read().value).toBe(f.sourceValue())
    expect(writes()).toHaveLength(0)
    owner.stage(''); await owner.save()
    expect(f.sourceValue()).toBe('')
    expect(fields.rows).toHaveLength(2)
    expect(writes()).toHaveLength(1)
  })
})
