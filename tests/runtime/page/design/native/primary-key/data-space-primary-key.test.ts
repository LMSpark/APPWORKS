import {afterEach, describe, expect, it, vi} from 'vitest'
import {dataSpacePageFixture} from '../data-space-page.fixture'
import {LowcodeDataSpacePrimaryKey} from '@/lowcode/data-space/model-source/primary-key/lowcode-data-space-primary-key'
import {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {isRecord} from '@spark-appworks/spark-utils'
import {DataViewFilterLocal} from '../../../../../../packages/spark-data/src/query/filter/data-view-filter-local'

const fixtures: ReturnType<typeof dataSpacePageFixture>[] = []
afterEach(() => {vi.restoreAllMocks(); fixtures.splice(0).forEach(f => f.dispose())})
const sourceFields = () => [
  {rowid: 'F1', dataModelId: 'M1', type: 'dataModel', Name: 'rowid', AsName: '', FieldType: 'string', IsPKey: 1, IsOutput: 1, ValueFun: '', Expression: ''},
  {rowid: 'F2', dataModelId: 'M1', type: 'dataModel', Name: 'code', AsName: 'businessCode', FieldType: 'string', IsPKey: 0, IsOutput: 0, ValueFun: '', Expression: ''},
  {rowid: 'F3', dataModelId: 'M1', type: 'dataModel', Name: 'parentId', AsName: '', FieldType: 'string', IsPKey: 0, IsOutput: 1, ValueFun: '', Expression: ''},
]
async function setup(extra: Parameters<typeof dataSpacePageFixture>[0] = {}) {
  const f = dataSpacePageFixture({allowSourceEdit: true, sourceFields: sourceFields(), editableFieldProperties: ['IsPKey', 'IsOutput'], ...extra})
  fixtures.push(f); f.setModelValues({Type: 'JSON', PrimaryKeyFields: 'rowid'})
  const session = await f.open('A'), owner = session.getModelEdit('M1')
  return {f, session, owner, models: session.metadataDataSet.getView('Base_DataModel')!, fields: session.metadataDataSet.getView('Base_DataModel_Field')!,
    writes: () => f.requests.filter(r => r.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')}
}
describe('formal primary key configuration', () => {
  it('queries only the target model and its model fields while preserving configured restrictions', async () => {
    const {f, session, models, fields, writes} = await setup()
    for (const source of [models, fields]) source.filterExpression = {logic: 'and', filters: [
      ...source.filterExpression ? [source.filterExpression] : [], {field: 'Name', operator: 'ne', value: 'EXCLUDED'},
    ]}
    const before = [models, fields].map(view => JSON.stringify(view.filterExpression)), start = f.requests.length
    await LowcodeDataSpacePrimaryKey.prepare({dataSet: session.metadataDataSet, targetId: 'A', modelId: 'M1', name: 'code', assertLive: () => {}})
    const queries = f.requests.slice(start).map(request => request.data).filter(isRecord)
      .flatMap(data => Array.isArray(data['Table']) ? data['Table'].filter(isRecord) : [])
    expect(queries).toHaveLength(2)
    for (const query of queries) {
      const parsed = DataSpaceDesignApi.parseFilter(JSON.stringify(query['Filter']))
      expect(parsed).toBeDefined()
      const filter = new DataViewFilterLocal(parsed!), model = query['Name'] === 'Base_DataModel'
      const row = model ? {rowid: 'M1', dataSetId: 'A', Name: 'Orders'}
        : {rowid: 'F2', dataSetId: 'A', dataModelId: 'M1', type: 'dataModel', Name: 'code'}
      expect(filter.matches(row)).toBe(true)
      expect(filter.matches({...row, dataSetId: 'OTHER'})).toBe(false)
      expect(filter.matches({...row, ...model ? {rowid: 'M2'} : {dataModelId: 'M2'}})).toBe(false)
      expect(filter.matches({...row, Name: 'EXCLUDED'})).toBe(false)
      if (!model) expect(filter.matches({...row, type: 'inputParams'})).toBe(false)
    }
    expect([models, fields].map(view => JSON.stringify(view.filterExpression))).toEqual(before)
    expect([models, fields].flatMap(view => Object.keys(view.dataTable!.views)).filter(id => id.startsWith('keyCheck_'))).toEqual([])
    expect(writes()).toEqual([])
  })
  it.each(['model', 'field', 'input'])('rejects an out-of-scope %s response without applying or discarding the original draft', async kind => {
    const {owner, models, fields, writes} = await setup({sourceFields: [...sourceFields(),
      {rowid: 'OTHER', dataModelId: kind === 'input' ? 'M1' : 'M2', type: kind === 'input' ? 'inputParams' : 'dataModel', Name: 'other', FieldType: 'string', IsOutput: 1},
    ]})
    owner.stage('PrimaryKeyFields', 'code')
    const source = kind === 'model' ? models : fields, create = source.createQueryView.bind(source)
    const ids: string[] = []
    vi.spyOn(source, 'createQueryView').mockImplementation(id => {
      const fresh = create(id), load = fresh.loadFromServer.bind(fresh); ids.push(id)
      // Simulate a service ignoring the requested model boundary; keep the real ingestion/permission path.
      vi.spyOn(fresh, 'loadFromServer').mockImplementation(options => load({...options,
        filter: {field: 'dataSetId', operator: 'eq', value: 'A'}}))
      return fresh
    })
    await expect(owner.save()).rejects.toThrow('范围')
    expect(models.getEditingRow('M1')?.['PrimaryKeyFields']).toBe('code')
    expect(fields.rows.find(row => row['rowid'] === 'F1')?.['IsPKey']).toBe(1)
    expect(fields.hasEditingChanges()).toBe(false)
    expect(ids.length).toBeGreaterThan(0)
    expect(ids.every(id => source.dataTable!.getView(id) === undefined)).toBe(true)
    expect(writes()).toEqual([])
  })
  it.each(['model', 'field'])('detects changed formal %s metadata in the scoped query and preserves the draft', async kind => {
    const source = sourceFields()
    const {f, owner, models, fields, writes} = await setup({sourceFields: source})
    owner.stage('PrimaryKeyFields', 'code')
    if (kind === 'model') f.setModelValues({PrimaryKeyFields: 'parentId'})
    else source[1]!.AsName = 'changedBusinessCode'
    await expect(owner.save()).rejects.toThrow('正式定义已变化')
    expect(models.getEditingRow('M1')?.['PrimaryKeyFields']).toBe('code')
    expect(fields.rows.find(row => row['rowid'] === 'F2')?.['AsName']).toBe('businessCode')
    expect(fields.hasEditingChanges()).toBe(false); expect(writes()).toEqual([])
  })
  it('invalidates a preflight when its original configured filter changes while awaiting a query', async () => {
    const {session, models, fields, writes} = await setup()
    const create = models.createQueryView.bind(models)
    vi.spyOn(models, 'createQueryView').mockImplementation(id => {
      const fresh = create(id), load = fresh.loadFromServer.bind(fresh)
      vi.spyOn(fresh, 'loadFromServer').mockImplementation(async options => {
        const result = await load(options)
        fields.filterExpression = {field: 'Name', operator: 'eq', value: 'other'}
        return result
      })
      return fresh
    })
    await expect(LowcodeDataSpacePrimaryKey.prepare({dataSet: session.metadataDataSet, targetId: 'A', modelId: 'M1', name: 'code', assertLive: () => {}})).rejects.toThrow('查询已变化')
    expect(fields.hasEditingChanges()).toBe(false); expect(writes()).toEqual([])
  })
  it('prepares the native key from fresh formal metadata without mutating original rows', async () => {
    const {session, fields, writes} = await setup()
    const plan = await LowcodeDataSpacePrimaryKey.prepare({dataSet: session.metadataDataSet, targetId: 'A', modelId: 'M1', name: 'code', assertLive: () => {}})
    expect(plan.candidate.primaryKey).toBe('businessCode')
    expect(plan.changes).toEqual([{id: 'F1', patch: {IsPKey: 0}}, {id: 'F2', patch: {IsPKey: 1, IsOutput: 1}}])
    expect(fields.rows.find(r => r['rowid'] === 'F2')?.['IsOutput']).toBe(0)
    expect(writes()).toEqual([])
  })
  it('saves the declaration and all field flags in one original DataSet batch', async () => {
    const {f, owner, models, fields, writes} = await setup({formalProjection: true, businessRows: {Orders: [{rowid: 'R1', businessCode: 'B1', parentId: ''}]}})
    owner.stage('PrimaryKeyFields', 'code')
    expect(models.rows[0]?.['PrimaryKeyFields']).toBe('rowid')
    await owner.save()
    expect(writes()).toHaveLength(1)
    expect(f.modelRow()).toMatchObject({PrimaryKeyFields: 'code'})
    expect(fields.rows.find(r => r['rowid'] === 'F1')).toMatchObject({IsPKey: 0, IsOutput: 1})
    expect(fields.rows.find(r => r['rowid'] === 'F2')).toMatchObject({IsPKey: 1, IsOutput: 1, AsName: 'businessCode'})
    expect(owner.getState()).toEqual({status: 'idle', pending: false})
    expect(f.fileWrites).toEqual([])
    const reopened = await f.open('A')
    for (const viewId of ['default', 'shared']) expect(reopened.definitionDataSet!.getView('OrdersAlias', viewId)!.primaryKey).toBe('businessCode')
    const view = reopened.definitionDataSet!.getView('OrdersAlias')!
    await view.refresh()
    expect(view.loadingError).toBeNull()
    view.setSelectedRows(view.rows)
    expect(view.getSelectedValues()).toEqual(['B1'])
  })
  it('can explicitly clear the declaration and reopen as a keyless read-only table', async () => {
    const {f, owner, fields, writes} = await setup({formalProjection: true})
    owner.stage('PrimaryKeyFields', ''); await owner.save()
    expect(fields.rows.every(row => Number(row['IsPKey']) === 0)).toBe(true)
    const reopened = await f.open('A')
    expect(reopened.definitionDataSet!.getView('OrdersAlias')!.primaryKey).toBe('')
    expect(writes()).toHaveLength(1)
  })
  it('discards an unapplied selection without modifying field flags', async () => {
    const {owner, fields, writes} = await setup()
    owner.stage('PrimaryKeyFields', 'code'); owner.discard()
    expect(owner.getState().pending).toBe(false)
    expect(fields.hasEditingChanges()).toBe(false)
    expect(fields.rows.find(row => row['rowid'] === 'F1')?.['IsPKey']).toBe(1)
    expect(writes()).toHaveLength(0)
  })
  it('does not modify a database table physical primary key', async () => {
    const {f, owner, writes} = await setup()
    f.setModelValues({Type: '数据库表'}); await expect(owner.reload(false)).rejects.toThrow('来源身份已变化')
    const fresh = await f.open('A'), next = fresh.getModelEdit('M1')
    expect(next.read().fields.find(field => field.name === 'PrimaryKeyFields')?.writable).toBe(false)
    expect(() => next.stage('PrimaryKeyFields', 'code')).toThrow('来源目录')
    expect(writes()).toHaveLength(0)
  })
  it.each(['IsPKey', 'IsOutput', 'PrimaryKeyFields'])('rechecks fresh permission for %s before staging field flags', async property => {
    const {f, owner, fields, writes} = await setup()
    owner.stage('PrimaryKeyFields', 'code')
    if (property === 'PrimaryKeyFields') f.denyModelField(property); else f.denyFieldProperty(property)
    await expect(owner.save()).rejects.toThrow('不可写')
    expect(fields.hasEditingChanges()).toBe(false); expect(writes()).toHaveLength(0)
  })
  it.each(['unknown', 'readback'])('reads back %s and never repeats a dispatched write', async mode => {
    const {f, owner, fields, writes} = await setup()
    owner.stage('PrimaryKeyFields', 'code')
    if (mode === 'unknown') f.loseNextResponse(); else {
      const apply = fields.applyEditingRows.bind(fields)
      vi.spyOn(fields, 'applyEditingRows').mockImplementation(async (...args) => {
        const result = await apply(...args); f.failNextFieldRead(); return result
      })
    }
    await expect(owner.save()).rejects.toThrow()
    expect(writes()).toHaveLength(1)
    expect(owner.getState().status).toBe(mode)
    await expect(owner.save()).rejects.toThrow('先核验')
    if (mode === 'unknown' && owner.requiresWorkspaceRecovery()) {
      await expect(owner.reload(true)).rejects.toThrow(/3 字段呈现.*重新核验字段配置/)
      await owner.verifyRecovery(true)
      await owner.reload(false)
    } else await owner.reload(owner.getState().pending)
    expect(fields.rows.find(row => row['rowid'] === 'F2')?.['IsPKey']).toBe(1)
    expect(writes()).toHaveLength(1)
  })
  it('detects partial stored field changes and explicitly adopts the readback for a fresh repair', async () => {
    const {f, owner, fields, writes} = await setup({omitFieldProperties: ['IsPKey']})
    owner.stage('PrimaryKeyFields', 'code')
    await expect(owner.save()).rejects.toThrow('基线已变化')
    expect(owner.getState().status).toBe('readback')
    expect(f.modelRow()).toMatchObject({PrimaryKeyFields: 'code'})
    expect(fields.rows.find(row => row['rowid'] === 'F1')?.['IsPKey']).toBe(1)
    await owner.reload(false)
    expect(owner.getState().status).toBe('idle'); expect(writes()).toHaveLength(1)
  })
  it('retains fields edited by another consumer during primary-key preflight', async () => {
    const {owner, fields, writes} = await setup({editableFieldProperties: ['IsPKey', 'IsOutput', 'description']})
    owner.stage('PrimaryKeyFields', 'code')
    const prepare = LowcodeDataSpacePrimaryKey.prepare.bind(LowcodeDataSpacePrimaryKey)
    vi.spyOn(LowcodeDataSpacePrimaryKey, 'prepare').mockImplementation(async (...args) => {
      const result = await prepare(...args); fields.updateEditingValue('F3', 'description', 'other'); return result
    })
    await expect(owner.save()).rejects.toThrow()
    expect(fields.getEditingRow('F3')?.['description']).toBe('other'); expect(writes()).toHaveLength(0)
  })
  it.each(['computed', 'tenant', 'duplicate-output'])('rejects a %s candidate through the shared formal projection', async mode => {
    const source = sourceFields()
    if (mode === 'computed') source[1]!.ValueFun = JSON.stringify({Type: 'GetConstValue', Value: 'derived-code'})
    if (mode === 'tenant') source[1]!.Name = 'lingma_sys_ent'
    if (mode === 'duplicate-output') source[1]!.AsName = 'parentId'
    const {owner, fields, writes} = await setup({sourceFields: source})
    owner.stage('PrimaryKeyFields', source[1]!.Name)
    await expect(owner.save()).rejects.toThrow('主键')
    expect(fields.hasEditingChanges()).toBe(false); expect(writes()).toHaveLength(0)
  })
  it('preserves a desensitization rule ID when selecting and reopening a non-derived primary key', async () => {
    const source = sourceFields()
    source[1]!.Expression = 'MASK-RULE-1'
    const {f, owner, fields, writes} = await setup({sourceFields: source, formalProjection: true})
    owner.stage('PrimaryKeyFields', 'code')
    await owner.save()
    expect(fields.rows.find(row => row['rowid'] === 'F2')).toMatchObject({Expression: 'MASK-RULE-1', ValueFun: '', IsPKey: 1, IsOutput: 1})
    const reopened = await f.open('A')
    expect(reopened.metadataDataSet.getView('Base_DataModel_Field')!.rows.find(row => row['rowid'] === 'F2')?.['Expression']).toBe('MASK-RULE-1')
    expect(reopened.definitionDataSet!.getView('OrdersAlias')!.primaryKey).toBe('businessCode')
    expect(writes()).toHaveLength(1)
  })
  it('does not apply or discard a foreign field draft added while the model draft is being applied', async () => {
    const {owner, models, fields, writes} = await setup({editableFieldProperties: ['IsPKey', 'IsOutput', 'description']})
    owner.stage('PrimaryKeyFields', 'code')
    const apply = models.applyEditingRows.bind(models)
    vi.spyOn(models, 'applyEditingRows').mockImplementation(async (...args) => {
      const result = await apply(...args); fields.updateEditingValue('F2', 'description', 'other'); return result
    })
    await expect(owner.save()).rejects.toThrow()
    await expect(owner.reload(true)).rejects.toThrow('其他')
    expect(fields.getEditingRow('F2')?.['description']).toBe('other')
    expect(fields.rows.find(row => row['rowid'] === 'F2')?.['description']).not.toBe('other')
    expect(writes()).toHaveLength(0)
  })
  it.each(['new-field', 'expression'])('detects remote %s changes before mutation', async mode => {
    const source = sourceFields(), {owner, writes} = await setup({sourceFields: source})
    owner.stage('PrimaryKeyFields', 'code')
    if (mode === 'expression') source[1]!.Expression = 'changed remotely'
    else source.push({...source[1]!, rowid: 'F4', Name: 'new', AsName: ''})
    await expect(owner.save()).rejects.toThrow('正式定义已变化')
    expect(writes()).toHaveLength(0)
  })
  it('refuses stale query context even when the target parameter remains unchanged', async () => {
    const {session, fields, writes} = await setup()
    const plan = await LowcodeDataSpacePrimaryKey.prepare({dataSet: session.metadataDataSet, targetId: 'A', modelId: 'M1', name: 'code', assertLive: () => {}})
    fields.queryContext = {...fields.queryContext, anotherInput: 'changed'}
    expect(() => plan.assertCurrent()).toThrow('查询已变化'); expect(writes()).toHaveLength(0)
  })
  it.each(['fieldProjection', 'remote'])('preserves conflicting %s configuration instead of overwriting it', async mode => {
    const {f, owner, session, writes} = await setup()
    if (mode === 'remote') {
      f.stored.set('A', JSON.stringify({scenarioId: 'A', tables: {}}))
      owner.stage('PrimaryKeyFields', 'code')
      await expect(owner.save()).rejects.toThrow('远端视图配置已变化')
    } else {
      f.stored.set('A', JSON.stringify({scenarioId: 'A', tables: {OrdersAlias: {modelBinding: {modelId: 'M1', modelName: 'Orders'},
        views: {default: {fieldProjection: [{fieldId: 'F1', resourceField: 'rowid', viewField: 'rowid', source: 'resource',
          resourceFieldId: 'F1', type: 'string', primaryKey: true, label: 'ID', output: true, sortOrder: 0, sortDirection: null,
          expression: '', valueFunction: '', value: '', group: 0, distinct: false}]}}}}}))
      const reopened = await f.open('A'), next = reopened.getModelEdit('M1')
      next.stage('PrimaryKeyFields', 'code'); await expect(next.save()).rejects.toThrow('fieldProjection[0].primaryKey')
    }
    expect(session.metadataDataSet.getView('Base_DataModel_Field')!.hasEditingChanges()).toBe(false)
    expect(f.fileWrites).toHaveLength(0); expect(writes()).toHaveLength(0)
  })
  it('repairs an invalid stored declaration without requiring the old definition to assemble', async () => {
    const {f, owner, writes} = await setup({formalProjection: true})
    f.setModelValues({PrimaryKeyFields: 'missing'}); await owner.reload(false)
    const reopened = await f.open('A'), next = reopened.getModelEdit('M1')
    expect(() => reopened.definitionDataSet).toThrow('正式主键')
    next.stage('PrimaryKeyFields', 'code'); await next.save()
    expect((await f.open('A')).definitionDataSet?.getView('OrdersAlias')?.primaryKey).toBe('businessCode')
    expect(writes()).toHaveLength(1)
  })
})
