import {afterEach, describe, expect, it, vi} from 'vitest'
import {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {dataSpacePageFixture} from '../data-space-page.fixture'

const fixtures: ReturnType<typeof dataSpacePageFixture>[] = []
afterEach(() => {vi.restoreAllMocks(); fixtures.splice(0).forEach(f => f.dispose())})
const source = {type: 'table' as const, id: 'NEXT', name: 'NextOrders', description: '', dbid: 'DB2', databaseName: 'new', providerId: ''}
const field = {type: 'dataModel' as const, Name: 'rowid', description: '', FieldType: 'varchar', IsPKey: 1, IsOutput: 1,
  AsName: '', ValueFun: '', Expression: '', allowAIAdd: 0, OrderType: '', Order: 0, Group: 0}
const condition = (Field: string, ValueFun: Record<string, unknown>, Operator = 'equal') => ({Type: 'cond', Field, Operator, Value: null, ValueFun})
const filter = JSON.stringify({Type: 'or', extra: 'keep', Filters: [
  condition('Orders.parentId', {Type: 'GetTableField', Field: 'Customers.rowid', extension: false}),
  condition('parentId', {Type: 'GetConstValue', Value: {Field: 'Orders.parentId', Type: 'GetTableField'}}, 'notequal'),
]})
const relation = {rowid: 'R', parentModId: 'M2', childModId: 'M1', parentTable: 'Customers', childTable: 'Orders', filter, depType: 'DEPENDENCY', cascadeDel: 1}
async function setup(options: Parameters<typeof dataSpacePageFixture>[0] = {}) {
  const reader = {query: async () => ({rows: [source], total: 1}), prepare: vi.fn(async () => ({source,
    model: {Type: '数据库表', MetaName: source.name, description: '', DbId: 'DB2', DbName: 'new', JoinType: '', ForeignKeyFields: '', JoinFilter: '', PId: ''},
    fields: [field, {...field, Name: 'parentCode', IsPKey: 0}]}))}
  const f = dataSpacePageFixture({allowSourceEdit: true, allowFieldEdit: true, allowRelationEdit: true, modelSources: reader,
    sourceFields: [{...field, rowid: 'F1', dataModelId: 'M1'}, {...field, rowid: 'F2', dataModelId: 'M1', Name: 'parentId', IsPKey: 0}],
    relationRows: [relation], ...options})
  fixtures.push(f)
  const session = await f.open('A'), owner = session.getModelSourceEdit('M1')
  await owner.preview(source); await owner.mapField({fieldId: 'F2', sourceName: 'parentCode'})
  return {f, session, owner, reader, writes: () => f.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')}
}

describe('source field and formal relation migration', () => {
  it('saves a child-field migration through the original signed relation view and reopens the full expression', async () => {
    const {owner, f, writes} = await setup()
    expect(owner.getState().preview?.problems).toEqual([])
    const before = f.stored.get('A')
    expect(await owner.save()).toBe('M1')
    const fresh = await f.open('A')
    const row = fresh.metadataDataSet.getView('Base_DataModel_Relation', 'default')!.rows[0]!
    const expected = {...JSON.parse(filter), Filters: [
      condition('Orders.parentCode', {Type: 'GetTableField', Field: 'Customers.rowid', extension: false}),
      condition('parentCode', {Type: 'GetConstValue', Value: {Field: 'Orders.parentId', Type: 'GetTableField'}}, 'notequal'),
    ]}
    expect(JSON.parse(String(row['filter']))).toEqual(expected)
    expect(row).toMatchObject({rowid: 'R', parentModId: 'M2', childModId: 'M1', parentTable: 'Customers', childTable: 'Orders', depType: 'DEPENDENCY', cascadeDel: 1})
    expect(writes()[0]?.data).toEqual(expect.arrayContaining([expect.objectContaining({TableName: 'Base_DataModel_Relation',
      CrudModel: expect.objectContaining({Changed: [{rowid: 'R', filter: JSON.stringify(expected), lingma_sys_key: 'token-A-R'}]})})]))
    const native = fresh.definitionDataSet!.resourceRelations?.[0]
    expect(native?.filterExpression).toEqual({logic: 'or', filters: [
      {field: 'parentId', operator: 'eq', value: {Type: 'GetTableField', Field: 'rowid', extension: false}},
      {field: 'parentId', operator: 'ne', value: {Type: 'GetConstValue', Value: {Field: 'Orders.parentId', Type: 'GetTableField'}}},
    ]})
    expect(native).toMatchObject({sourceRelationId: 'R', parentTable: 'CustomersAlias', childTable: 'OrdersAlias', cascadeDelete: true})
    expect(f.stored.get('A')).toBe(before); expect(f.fileWrites).toHaveLength(0)
  })

  it.each([false, true])('migrates parent references with an explicit endpoint identity; self relation=%s', async self => {
    const original = JSON.stringify({Type: 'and', Filters: [
      condition(self ? 'Orders.parentId' : 'Customers.parentId', {Type: 'GetTableField', Field: 'parentId'}),
      condition('parentId', {Type: 'GetTableField', Field: 'Orders.parentId'}, 'greaterthan'),
    ]})
    const {owner, f} = await setup({relationRows: [{...relation, parentModId: 'M1', parentTable: 'Orders', childModId: self ? 'M1' : 'M2', childTable: self ? 'Orders' : 'Customers', filter: original}]})
    expect(owner.getState().preview?.problems).toEqual([])
    expect(owner.getState().preview?.relationChanges).toHaveLength(1)
    await owner.save()
    const fresh = await f.open('A')
    const wire = String(fresh.metadataDataSet.getView('Base_DataModel_Relation', 'default')!.rows[0]!['filter'])
    expect(DataSpaceDesignApi.parseFilter(wire)?.toJSON()).toEqual({logic: 'and', filters: [
      {field: self ? 'Orders.parentCode' : 'Customers.parentId', operator: 'eq', value: {Type: 'GetTableField', Field: 'parentCode'}},
      {field: self ? 'parentCode' : 'parentId', operator: 'gt', value: {Type: 'GetTableField', Field: 'Orders.parentCode'}},
    ]})
    expect(fresh.definitionDataSet!.resourceRelations).toHaveLength(1)
  })

  it('applies a field-name exchange simultaneously, preserving canonical view columns', async () => {
    const original = JSON.stringify(condition('parentId', {Type: 'GetTableField', Field: 'Orders.other'}))
    const {owner, f, reader} = await setup({sourceFields: [{...field, rowid: 'F1', dataModelId: 'M1'},
      {...field, rowid: 'F2', dataModelId: 'M1', Name: 'parentId', IsPKey: 0}, {...field, rowid: 'F3', dataModelId: 'M1', Name: 'other', IsPKey: 0}],
    relationRows: [{...relation, parentModId: 'M1', parentTable: 'Orders', filter: original}]})
    reader.prepare.mockResolvedValue({source, model: {Type: '数据库表', MetaName: source.name, description: '', DbId: 'DB2', DbName: 'new', JoinType: '', ForeignKeyFields: '', JoinFilter: '', PId: ''},
      fields: [field, {...field, Name: 'parentId', IsPKey: 0}, {...field, Name: 'other', IsPKey: 0}]})
    await owner.preview(source); await owner.mapField({fieldId: 'F2', sourceName: 'other'}); await owner.mapField({fieldId: 'F3', sourceName: 'parentId'})
    await owner.save()
    const fresh = await f.open('A')
    expect(JSON.parse(String(fresh.metadataDataSet.getView('Base_DataModel_Relation', 'default')!.rows[0]!['filter']))).toEqual(condition('other', {Type: 'GetTableField', Field: 'Orders.parentId'}))
    expect(fresh.definitionDataSet!.resourceRelations?.[0]?.filterExpression).toEqual({field: 'parentId', operator: 'eq', value: {Type: 'GetTableField', Field: 'other'}})
  })

  it('migrates named reference and group functions but leaves system and input parameters intact', async () => {
    const functions = [{Type: 'GetRefData', RefTableName: 'Orders', RefFieldName: 'parentId', FkFieldName: 'rowid', extra: {Field: 'parentId'}},
      {Type: 'GetGroupData', GroupTableName: 'Orders', GroupField: 'parentId', Field: 'parentId', ValType: 'sum'},
      {Type: 'GetInputParam', ParamName: 'parentId'}, {Type: 'SystemData', ParamName: 'parentId'}]
    const {owner, f} = await setup({relationRows: [{...relation, filter: JSON.stringify({Type: 'and', Filters: functions.map(fn => condition('rowid', fn))})}]})
    await owner.save()
    const fresh = await f.open('A')
    const tree = DataSpaceDesignApi.parseFilter(String(fresh.metadataDataSet.getView('Base_DataModel_Relation', 'default')!.rows[0]!['filter']))?.toJSON()
    expect(tree).toEqual({logic: 'and', filters: [
      {field: 'rowid', operator: 'eq', value: {...functions[0], RefFieldName: 'parentCode'}},
      {field: 'rowid', operator: 'eq', value: {...functions[1], GroupField: 'parentCode', Field: 'parentCode'}},
      ...functions.slice(2).map(value => ({field: 'rowid', operator: 'eq', value})),
    ]})
  })

  it.each(['unknown', 'partial', 'missing-receipt'])('verifies %s relation writes without replaying the batch', async kind => {
    const {owner, f, writes} = await setup({omitRelationWrite: kind === 'partial', omitRelationReceipt: kind === 'missing-receipt'})
    if (kind === 'unknown') f.loseNextResponse()
    await expect(owner.save()).rejects.toThrow()
    await expect(owner.save()).rejects.toThrow('先核验')
    const result = await owner.verify()
    expect(result.confirmed).toBe(kind !== 'partial'); expect(writes()).toHaveLength(1)
    if (kind === 'partial') {
      expect(owner.getState().status).toBe('different')
      expect(owner.getState().verification.some(item => item.table === 'Base_DataModel_Relation' && item.result.includes('不同'))).toBe(true)
      expect(() => owner.acceptCurrent()).toThrow('文件配置待处理')
      expect(writes()).toHaveLength(1)
    }
  })

  it('rechecks relation permissions before staging the model or field', async () => {
    const {owner, f, session, writes} = await setup()
    f.denyRelationWrite()
    await expect(owner.save()).rejects.toThrow('不允许修改关系')
    expect(writes()).toHaveLength(0)
    for (const name of ['Base_DataModel', 'Base_DataModel_Field', 'Base_DataModel_Relation']) expect(session.metadataDataSet.getView(name, 'default')!.dirtyTracking.hasPendingChanges()).toBe(false)
  })

  it('rejects a relation changed after preview and keeps its new original text', async () => {
    const {owner, f, writes} = await setup()
    const changed = JSON.stringify(condition('rowid', {Type: 'GetConstValue', Value: 'new'}))
    f.setRelationValues({filter: changed})
    await expect(owner.save()).rejects.toThrow('元数据已变化')
    expect(writes()).toHaveLength(0)
  })

  it('recovers relation staging failure but never discards a later edit on that relation', async () => {
    const {owner, session, writes} = await setup()
    const relations = session.metadataDataSet.getView('Base_DataModel_Relation', 'sourceReplace:M1')!
    const apply = relations.applyEditingRows.bind(relations)
    vi.spyOn(relations, 'applyEditingRows').mockImplementationOnce(async ids => {await apply(ids); throw new Error('relation staging failed')})
    await expect(owner.save()).rejects.toThrow('relation staging failed')
    relations.updateEditingValue('R', 'filter', 'later draft')
    await expect(owner.verify()).rejects.toThrow('关系迁移编辑已改变')
    expect(relations.getEditingRow('R')?.['filter']).toBe('later draft')
    relations.discardEditingRows(['R'])
    expect((await owner.verify()).confirmed).toBe(false)
    expect(relations.dirtyTracking.hasPendingChanges()).toBe(false); expect(writes()).toHaveLength(0)
  })

  it.each(['opaque', 'ambiguous', 'missing-model'])('preserves the original expression for an unresolved %s identity', async kind => {
    const value = kind === 'opaque' ? {Type: 'GetExpData', refTableName: 'Orders', expression: 'parentId + 1'} : {Type: 'GetTableField', Field: 'Orders.parentId'}
    const row = {...relation, ...(kind === 'ambiguous' ? {parentTable: 'Orders'} : {}), ...(kind === 'missing-model' ? {parentModId: 'missing'} : {}), filter: JSON.stringify(condition('parentId', value))}
    const {owner, writes} = await setup({relationRows: [row]})
    expect(owner.getState().preview?.problems.length).toBeGreaterThan(0)
    await expect(owner.save()).rejects.toThrow('关系')
    expect(writes()).toHaveLength(0)
  })

  it('rejects a reference whose new source name collides with another retained output alias', async () => {
    const {owner, reader, writes} = await setup({sourceFields: [{...field, rowid: 'F1', dataModelId: 'M1'},
      {...field, rowid: 'F2', dataModelId: 'M1', Name: 'parentId', IsPKey: 0}, {...field, rowid: 'F3', dataModelId: 'M1', Name: 'other', AsName: 'parentCode', IsPKey: 0}],
    relationRows: [{...relation, filter: JSON.stringify(condition('rowid', {Type: 'GetRefData', RefTableName: 'Orders', RefFieldName: 'parentId', FkFieldName: 'rowid'}))}]})
    const prepared = await reader.prepare()
    reader.prepare.mockResolvedValue({...prepared, fields: [...prepared.fields, {...field, Name: 'other', IsPKey: 0}]})
    await owner.preview(source); await owner.mapField({fieldId: 'F2', sourceName: 'parentCode'})
    expect(owner.getState().preview?.problems.join()).toContain('迁移后字段引用不唯一')
    await expect(owner.save()).rejects.toThrow('迁移后字段引用不唯一')
    expect(writes()).toHaveLength(0)
  })

  it('preserves unrelated relation bytes without needing relation write permission', async () => {
    const unchanged = `  ${JSON.stringify(condition('rowid', {Type: 'GetConstValue', Value: 'parentId'}))}  `
    const {owner, f, writes} = await setup({allowRelationEdit: false, relationRows: [{...relation, filter: unchanged}]})
    expect(owner.getState().preview?.relationChanges).toEqual([])
    await owner.save()
    expect(writes()[0]?.data).not.toEqual(expect.arrayContaining([expect.objectContaining({TableName: 'Base_DataModel_Relation'})]))
    const fresh = await f.open('A')
    expect(fresh.metadataDataSet.getView('Base_DataModel_Relation', 'default')!.rows[0]?.['filter']).toBe(unchanged)
  })

  it('retains file-owned relation extensions and all named-view configuration after the DB migration', async () => {
    const {f, owner} = await setup()
    owner.discard()
    f.stored.set('A', JSON.stringify({scenarioId: 'A', tables: {
      OrdersAlias: {modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {default: {}, shared: {pageSize: 12, valueField: 'parentId', treeConfig: {idField: 'rowid', parentIdField: 'parentId'}}}},
      CustomersAlias: {modelBinding: {modelId: 'M2', modelName: 'Customers'}, views: {default: {}}},
    }, resourceRelations: [{sourceRelationId: 'R', parentTable: 'CustomersAlias', childTable: 'OrdersAlias', relationName: 'Owned label', cascadeUpdate: true}]}))
    const edit = (await f.open('A')).getModelSourceEdit('M1')
    await edit.preview(source); await edit.mapField({fieldId: 'F2', sourceName: 'parentCode'})
    const originalFile = f.stored.get('A')
    await edit.save()
    const fresh = await f.open('A')
    expect(fresh.definitionDataSet!.resourceRelations?.[0]).toMatchObject({relationName: 'Owned label', cascadeUpdate: true})
    expect(fresh.definitionDataSet!.getView('OrdersAlias', 'shared')!.valueField).toBe('parentId')
    expect(f.stored.get('A')).toBe(originalFile); expect(f.fileWrites).toHaveLength(0)
  })

  it('does not overwrite a relation draft introduced while staging its model change', async () => {
    const {owner, session, writes} = await setup()
    const models = session.metadataDataSet.getView('Base_DataModel', 'default')!, relations = session.metadataDataSet.getView('Base_DataModel_Relation', 'sourceReplace:M1')!
    const apply = models.applyEditingRows.bind(models)
    vi.spyOn(models, 'applyEditingRows').mockImplementationOnce(async ids => {
      const result = await apply(ids)
      relations.updateEditingValue('R', 'filter', 'other relation draft')
      return result
    })
    await expect(owner.save()).rejects.toThrow('关系存在其他草稿')
    expect(relations.getEditingRow('R')?.['filter']).toBe('other relation draft')
    await expect(owner.verify()).rejects.toThrow('关系迁移编辑已改变')
    expect(writes()).toHaveLength(0)
  })
})
