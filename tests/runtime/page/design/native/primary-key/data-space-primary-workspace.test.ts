import {afterEach, describe, expect, it, vi} from 'vitest'
import {fieldEditReloadBatch, fieldEditSaveBatch, fieldEditStageOutputBatch} from '@/lowcode/data-space/model-source/field-edit/lowcode-data-space-field-edit-session'
import {LowcodeDataSpacePrimaryKey} from '@/lowcode/data-space/model-source/primary-key/lowcode-data-space-primary-key'
import {dataSpacePageFixture} from '../data-space-page.fixture'

const fixtures: ReturnType<typeof dataSpacePageFixture>[] = []
afterEach(() => {vi.restoreAllMocks(); fixtures.splice(0).forEach(f => f.dispose())})
async function setup(extra: Parameters<typeof dataSpacePageFixture>[0] = {}, withoutReferences = false) {
  const f = dataSpacePageFixture({allowSourceEdit: true, allowFieldAdd: true, allowFieldEdit: true, formalProjection: true,
    editableFieldProperties: ['IsPKey', 'IsOutput', 'description'], sourceFields: [
      {rowid: 'PK', dataModelId: 'M1', type: 'dataModel', Name: 'rowid', AsName: '', FieldType: 'string', IsPKey: 1, IsOutput: 1, ValueFun: ''},
      {rowid: 'CODE', dataModelId: 'M1', type: 'dataModel', Name: 'code', AsName: 'businessCode', FieldType: 'string', IsPKey: 0, IsOutput: 0, ValueFun: ''},
    ], businessRows: {Orders: [{rowid: 'R1', businessCode: 'B1'}]}, ...extra})
  fixtures.push(f); f.setModelValues({Type: 'JSON', PrimaryKeyFields: 'rowid'})
  if (withoutReferences) f.stored.set('A', JSON.stringify({scenarioId: 'A', tables: {OrdersAlias: {modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {default: {}}}}}))
  const session = await f.open('A'), view = await session.loadModelFields('M1'), model = session.getModelEdit('M1')
  const owners = () => view.rows.map(row => session.getFieldEdit(String(row['rowid']), 'modelFields'))
  owners()
  const confirm = (id: string, value: number) => {
    view.updateEditingValue(id, 'IsPKey', value)
    session.getFieldEdit(id, 'modelFields').confirmContract(view.rows.map(row => String(row['rowid'])))
  }
  return {f, session, view, model, owners, confirm, writes: () => f.requests.filter(r => r.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')}
}

describe('reference field primary key and workspace save', () => {
  it('edits the original field flag, rejects duplicate keys, auto-outputs and cancels locally', async () => {
    const {session, view, model, confirm, writes} = await setup()
    const owner = session.getFieldEdit('CODE', 'modelFields')
    expect(owner.readContract().find(field => field.name === 'IsPKey')?.writable).toBe(true)
    const checkpoint = view.createEditingCheckpoint('CODE', ['IsPKey', 'IsOutput'])
    expect(() => confirm('CODE', 1)).toThrow(/已有|一个|唯一/)
    checkpoint.restore()
    expect(view.getEditingPatch('CODE')).toBeUndefined()
    expect(model.getState().pending).toBe(false)
    confirm('PK', 0); confirm('CODE', 1)
    expect(view.getEditingRow('CODE')).toMatchObject({IsPKey: 1, IsOutput: 1})
    expect(session.metadataDataSet.getView('Base_DataModel')!.getEditingRow('M1')?.['PrimaryKeyFields']).toBe('code')
    expect(writes()).toEqual([])
  })
  it('saves a moved key, old-field changes and new computed fields once and reopens the native selected value', async () => {
    const {f, session, view, model, owners, confirm, writes} = await setup({overviewOnly: true})
    const directory = session.metadataDataSet.getView('Base_DataModel_Field')!
    expect(directory.rows).toEqual([])
    confirm('PK', 0); confirm('CODE', 1)
    view.updateEditingValue('PK', 'description', 'old key')
    const create = session.getFieldCreate('M1', 'modelFields'); create.begin()
    for (const [key, value] of Object.entries({Name: 'total', AsName: 'total', description: 'computed'})) create.input.updateEditingValue('draft', key, value)
    const added = await create.stage()
    expect(model.read().columns.map(column => column.name)).toEqual(['rowid', 'code'])
    expect(model.read().warning).toBe('')
    await model.save(owners())
    expect(writes()).toHaveLength(1)
    expect(f.modelRow()).toMatchObject({PrimaryKeyFields: 'code'})
    expect(view.rows.find(row => row['rowid'] === 'PK')).toMatchObject({IsPKey: 0, description: 'old key'})
    expect(view.rows.find(row => row['rowid'] === 'CODE')).toMatchObject({IsPKey: 1, IsOutput: 1})
    expect(view.rows.some(row => row['rowid'] === added)).toBe(true)
    expect(directory.rows).toEqual([])
    expect(session.hasPendingFieldEdits()).toBe(false); expect(session.hasPendingModelEdits()).toBe(false)
    const reopened = await f.open('A'), result = reopened.definitionDataSet!.getView('OrdersAlias')!
    expect(result.primaryKey).toBe('businessCode'); await result.refresh(); result.setSelectedRows(result.rows)
    expect(result.getSelectedValues()).toEqual(['B1']); expect(f.fileWrites).toEqual([])
  })
  it('does not allow an isolated field save to bypass the model declaration', async () => {
    const {view, owners, writes} = await setup()
    view.updateEditingValue('PK', 'IsPKey', 0)
    await expect(fieldEditSaveBatch(owners())).rejects.toThrow(/主键.*(模型|统一)/)
    expect(writes()).toEqual([])
  })
  it('aligns the model selector with existing field drafts in the same workspace', async () => {
    const {view, model, owners, writes} = await setup()
    view.updateEditingValue('PK', 'description', 'preserve'); model.stage('PrimaryKeyFields', 'code')
    await model.save(owners())
    expect(view.rows.find(row => row['rowid'] === 'CODE')).toMatchObject({IsPKey: 1, IsOutput: 1})
    expect(view.rows.find(row => row['rowid'] === 'PK')).toMatchObject({IsPKey: 0, description: 'preserve'})
    expect(writes()).toHaveLength(1)
  })
  it.each([false, true])('uses the new key for output inversion while retaining old-field references: no references=%s', async withoutReferences => {
    const {f, view, model, owners, confirm, writes} = await setup({sourceFields: [
      {rowid: 'PK', dataModelId: 'M1', type: 'dataModel', Name: 'rowid', AsName: '', FieldType: 'string', IsPKey: 1, IsOutput: 1, ValueFun: ''},
      {rowid: 'CODE', dataModelId: 'M1', type: 'dataModel', Name: 'code', AsName: 'businessCode', FieldType: 'string', IsPKey: 0, IsOutput: 0, ValueFun: ''},
      {rowid: 'PARENT', dataModelId: 'M1', type: 'dataModel', Name: 'parentId', AsName: '', FieldType: 'string', IsPKey: 0, IsOutput: 1, ValueFun: ''},
    ]}, withoutReferences)
    if (!withoutReferences) expect(JSON.parse(f.stored.get('A')!).tables.OrdersAlias.views.shared.treeConfig).toEqual({idField: 'rowid', parentIdField: 'parentId'})
    confirm('PK', 0); confirm('CODE', 1)
    expect(await fieldEditStageOutputBatch(owners(), 'invert')).toEqual({changedCount: 2, primaryCount: 1})
    expect(view.getEditingRow('PK')?.['IsOutput']).toBe(0)
    if (withoutReferences) {
      await model.save(owners())
      expect(view.rows.find(row => row['rowid'] === 'PK')).toMatchObject({IsPKey: 0, IsOutput: 0})
      expect(writes()).toHaveLength(1)
    } else {
      await expect(model.save(owners())).rejects.toThrow('treeConfig.idField')
      expect(writes()).toEqual([])
    }
  })
  it.each(['IsPKey', 'IsOutput', 'PrimaryKeyFields'])('rechecks fresh %s permission before sending the combined batch', async property => {
    const {f, view, model, owners, confirm, writes} = await setup()
    confirm('PK', 0); confirm('CODE', 1)
    if (property === 'PrimaryKeyFields') f.denyModelField(property); else f.denyFieldProperty(property)
    await expect(model.save(owners())).rejects.toThrow('不可写')
    expect(view.getEditingRow('CODE')?.['IsPKey']).toBe(1); expect(writes()).toEqual([])
  })
  it('does not change a physical source key or promote a computed field', async () => {
    const {f, session, view, confirm, writes} = await setup()
    const create = session.getFieldCreate('M1', 'modelFields'); create.begin()
    create.input.updateEditingValue('draft', 'Name', 'computed'); create.input.updateEditingValue('draft', 'AsName', 'computed')
    const id = await create.stage(), computed = session.getFieldEdit(id, 'modelFields')
    expect(computed.readContract().find(field => field.name === 'IsPKey')?.writable).toBe(false)
    expect(() => confirm(id, 1)).toThrow('计算'); computed.discard()
    f.setModelValues({Type: '数据库表'})
    const next = await f.open('A'); await next.loadModelFields('M1')
    expect(next.getFieldEdit('CODE', 'modelFields').readContract().find(field => field.name === 'IsPKey')?.writable).toBe(false)
    expect(view.rows.some(row => row['rowid'] === id)).toBe(false); expect(writes()).toEqual([])
  })
  it.each(['draft', 'query', 'file'])('rejects a changed %s during primary preflight without overwriting it', async kind => {
    const {f, view, model, owners, confirm, writes} = await setup()
    confirm('PK', 0); confirm('CODE', 1)
    const original = LowcodeDataSpacePrimaryKey.prepare.bind(LowcodeDataSpacePrimaryKey)
    vi.spyOn(LowcodeDataSpacePrimaryKey, 'prepare').mockImplementationOnce(async (...args) => {
      const result = await original(...args)
      if (kind === 'draft') view.updateEditingValue('PK', 'description', 'concurrent')
      if (kind === 'query') view.configure({queryContext: {...view.queryContext, extra: 'changed'}})
      if (kind === 'file') f.stored.set('A', '{}')
      return result
    })
    await expect(model.save(owners())).rejects.toThrow()
    if (kind === 'draft') expect(view.getEditingRow('PK')?.['description']).toBe('concurrent')
    expect(writes()).toEqual([])
  })
  it.each(['unknown', 'partial', 'readback'])('retains %s results for explicit verification without replay', async mode => {
    const {f, session, view, model, owners, confirm, writes} = await setup(mode === 'partial' ? {omitFieldProperties: ['IsPKey']} : {})
    confirm('PK', 0); confirm('CODE', 1)
    const batch = owners()
    if (mode === 'unknown') f.loseNextResponse()
    if (mode === 'readback') {
      const apply = view.applyEditingRows.bind(view)
      vi.spyOn(view, 'applyEditingRows').mockImplementationOnce(async (...args) => {const result = await apply(...args); f.failNextFieldRead(); return result})
    }
    await expect(model.save(batch)).rejects.toThrow()
    expect(session.hasPendingModelEdits()).toBe(true); expect(session.hasPendingFieldEdits()).toBe(true)
    await expect(model.save(batch)).rejects.toThrow('先核验')
    expect(writes()).toHaveLength(1)
    await model.reload(true); await fieldEditReloadBatch(batch, true)
    expect(model.getState().status).toBe('idle'); expect(session.hasPendingFieldEdits()).toBe(false)
    expect(view.rows.find(row => row['rowid'] === 'CODE')?.['IsPKey']).toBe(mode === 'partial' ? 0 : 1)
    expect(writes()).toHaveLength(1)
  })
  it('rejects another session before staging any primary flags in it', async () => {
    const first = await setup(), other = await setup()
    first.model.stage('PrimaryKeyFields', 'code')
    await expect(first.model.save(other.owners())).rejects.toThrow('当前数据空间实例')
    expect(other.view.hasEditingChanges()).toBe(false)
    expect(first.writes()).toEqual([]); expect(other.writes()).toEqual([])
  })
})
