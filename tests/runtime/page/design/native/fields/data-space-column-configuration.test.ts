import {afterEach, describe, expect, it} from 'vitest'
import {dataSpacePageFixture} from '../data-space-page.fixture'

const fixtures: ReturnType<typeof dataSpacePageFixture>[] = []
afterEach(() => fixtures.splice(0).forEach(f => f.dispose()))
function fixture(extra: Parameters<typeof dataSpacePageFixture>[0] = {}) {
  const f = dataSpacePageFixture({allowFieldEdit: true, editableFieldProperties: ['description', 'Expression', 'allowAIAdd'],
    desensitizationRules: [{rowid: 'RULE', name: '隐藏手机号'}], sourceFields: [
      {rowid: 'F1', dataModelId: 'M1', Name: 'amount', type: 'dataModel', FieldType: 'number', IsPKey: 0, IsOutput: 1, Expression: '', allowAIAdd: 0},
      {rowid: 'HIDDEN', dataModelId: 'M1', Name: 'internal', type: 'dataModel', FieldType: 'string', IsPKey: 0, IsOutput: 0},
      {rowid: 'INPUT', dataModelId: 'M1', Name: 'arg', type: 'inputParams', FieldType: 'string', IsPKey: 0, IsOutput: 1},
      {rowid: 'OTHER', dataModelId: 'M2', Name: 'customer', type: 'dataModel', FieldType: 'string', IsPKey: 0, IsOutput: 1},
    ], ...extra}); fixtures.push(f); return f
}
const writes = (f: ReturnType<typeof fixture>) => f.requests.filter(r => r.url?.includes('BatchTableOperate'))

describe('unified model column configuration workflow', () => {
  it('queries all model columns, saves rule and AI properties through the same view and reopens independently', async () => {
    const f = fixture(), session = await f.open('A'), view = await session.loadModelFields('M1')
    expect(view.rows.map(r => r['rowid'])).toEqual(['F1', 'HIDDEN'])
    const owner = session.getFieldEdit('F1', 'modelFields')
    expect(owner.read().fields.map(field => field.name)).toEqual(expect.arrayContaining(['description', 'Expression', 'allowAIAdd']))
    view.updateEditingValue('F1', 'description', '成交金额')
    view.updateEditingValue('F1', 'Expression', 'RULE'); view.updateEditingValue('F1', 'allowAIAdd', 1)
    await owner.save()
    expect(writes(f)).toHaveLength(1)
    const next = await f.open('A'), reopened = await next.loadModelFields('M1')
    expect(reopened.rows[0]).toMatchObject({description: '成交金额', Expression: 'RULE', allowAIAdd: 1})
    expect(owner.getState()).toEqual({status: 'idle', pending: false})
  })
  it('protects drafts from regeneration and cancels without writing', async () => {
    const f = fixture(), session = await f.open('A'), view = await session.loadModelFields('M1')
    const owner = session.getFieldEdit('F1', 'modelFields')
    view.updateEditingValue('F1', 'allowAIAdd', 1)
    await expect(session.loadModelFields('M1')).rejects.toThrow('字段草稿')
    owner.discard(); await session.loadModelFields('M1')
    expect(view.rows[0]?.['allowAIAdd']).toBe(0); expect(writes(f)).toHaveLength(0)
  })
  it('rejects unknown rule ids, wrong value types and unrelated mutations without losing drafts', async () => {
    const f = fixture(), session = await f.open('A'), view = await session.loadModelFields('M1')
    const owner = session.getFieldEdit('F1', 'modelFields')
    for (const [field, value] of [['Expression', 'MISSING'], ['allowAIAdd', true], ['dataModelId', 'M2']] as const) {
      view.updateEditingValue('F1', field, value)
      await expect(owner.save()).rejects.toThrow()
      expect(view.hasEditingChanges(), field).toBe(true); owner.discard()
    }
    expect(writes(f)).toHaveLength(0)
  })
  it('keeps unknown save receipts for readback and does not replay', async () => {
    const f = fixture(), session = await f.open('A'), view = await session.loadModelFields('M1')
    const owner = session.getFieldEdit('F1', 'modelFields')
    view.updateEditingValue('F1', 'allowAIAdd', 1); f.loseNextResponse()
    await expect(owner.save()).rejects.toThrow(); expect(owner.getState().status).toBe('unknown')
    await owner.reload(true)
    expect(view.rows[0]?.['allowAIAdd']).toBe(1); expect(writes(f)).toHaveLength(1)
  })
  it('retains an old missing rule while changing another property and allows explicit clearing', async () => {
    const f = fixture({sourceFields: [{rowid: 'F1', dataModelId: 'M1', Name: 'amount', type: 'dataModel', FieldType: 'number', IsPKey: 0, IsOutput: 1, Expression: 'OLD_RULE', allowAIAdd: 0}]}),
      session = await f.open('A'), view = await session.loadModelFields('M1'), owner = session.getFieldEdit('F1', 'modelFields')
    view.updateEditingValue('F1', 'allowAIAdd', 1); await owner.save()
    expect(view.rows[0]?.['Expression']).toBe('OLD_RULE')
    view.updateEditingValue('F1', 'Expression', ''); await owner.save()
    expect(view.rows[0]?.['Expression']).toBe('')
  })
  it('rechecks field permission and request identity at submission', async () => {
    const f = fixture(), session = await f.open('A'), view = await session.loadModelFields('M1'), owner = session.getFieldEdit('F1', 'modelFields')
    view.updateEditingValue('F1', 'allowAIAdd', 1)
    f.invalidate()
    await expect(owner.save()).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
    expect(writes(f)).toHaveLength(0)
    const denied = fixture({readOnly: true}), readSession = await denied.open('A'), readView = await readSession.loadModelFields('M1'), readOwner = readSession.getFieldEdit('F1', 'modelFields')
    expect(readOwner.read().fields.every(field => !field.writable)).toBe(true)
    readView.updateEditingValue('F1', 'allowAIAdd', 1)
    await expect(readOwner.save()).rejects.toThrow('不可写')
    expect(writes(denied)).toHaveLength(0)
  })
})
