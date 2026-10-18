import {afterEach, describe, expect, it, vi} from 'vitest'
import {dataSpacePageFixture} from './data-space-page.fixture'
import {LowcodeDataSpaceFieldMigration} from '@/lowcode/data-space/model-source/lowcode-data-space-field-migration'

const fixtures: ReturnType<typeof dataSpacePageFixture>[] = []
afterEach(() => {vi.restoreAllMocks(); fixtures.splice(0).forEach(f => f.dispose())})
const source = {type: 'table' as const, id: 'NEXT', name: 'NextOrders', description: '', dbid: 'DB2', databaseName: 'new', providerId: ''}
const field = {type: 'dataModel' as const, Name: 'rowid', description: '', FieldType: 'varchar', IsPKey: 1, IsOutput: 1,
  AsName: '', ValueFun: '', Expression: '', allowAIAdd: 0, OrderType: '', Order: 0, Group: 0}
const condition = (Field: string, ValueFun: Record<string, unknown>) => ({Type: 'cond', Field, Operator: 'equal', ValueFun})
const wire = (Field: string, ref: string) => JSON.stringify(condition(Field, {Type: 'GetTableField', Field: ref}))
async function setup(modelValues: Record<string, unknown> = {}, otherValues: Record<string, unknown> = {}, options: Parameters<typeof dataSpacePageFixture>[0] = {}) {
  const reader = {query: async () => ({rows: [source], total: 1}), prepare: vi.fn(async () => ({source,
    model: {Type: '数据库表', MetaName: source.name, description: '', DbId: 'DB2', DbName: 'new', JoinType: '', ForeignKeyFields: '', JoinFilter: '', PId: ''},
    fields: [field, {...field, Name: 'parentCode', IsPKey: 0}]}))}
  const f = dataSpacePageFixture({allowSourceEdit: true, allowFieldEdit: true, modelSources: reader,
    sourceFields: ['M1', 'M2'].flatMap((dataModelId, i) => [{...field, rowid: `F${i * 2 + 1}`, dataModelId}, {...field, rowid: `F${i * 2 + 2}`, dataModelId, Name: 'parentId', IsPKey: 0}]), ...options})
  fixtures.push(f); f.setModelValues(modelValues); f.setModelValues(otherValues, 'A', 'M2')
  const session = await f.open('A'), owner = session.getModelSourceEdit('M1')
  await owner.preview(source); await owner.mapField({fieldId: 'F2', sourceName: 'parentCode'})
  return {f, owner, session, reader, writes: () => f.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')}
}

async function fieldReferenceSetup(options: Parameters<typeof dataSpacePageFixture>[0] = {}) {
  const before = ' { "Type": "GetTableField", "Field": "parentId", "extension": false } '
  const after = '{"Type":"GetTableField","Field":"parentCode","extension":false}'
  const sourceFields = [
    {...field, rowid: 'F1', dataModelId: 'M1'},
    {...field, rowid: 'F2', dataModelId: 'M1', Name: 'parentId', IsPKey: 0},
    {...field, rowid: 'F5', dataModelId: 'M1', Name: 'copied', IsPKey: 0, ValueFun: before},
    {...field, rowid: 'F3', dataModelId: 'M2'},
    {...field, rowid: 'F4', dataModelId: 'M2', Name: 'parentId', IsPKey: 0, ValueFun: ' {"Type":"GetTableField","Field":"rowid"} '},
  ]
  const result = await setup({}, {}, {sourceFields, ...options})
  const prepared = await result.reader.prepare()
  result.reader.prepare.mockResolvedValue({...prepared, fields: [...prepared.fields, {...field, Name: 'copied', IsPKey: 0}]})
  await result.owner.preview(source); await result.owner.mapField({fieldId: 'F2', sourceName: 'parentCode'})
  return {...result, before, after}
}

describe('model filter references without SQL identity inference', () => {
  it.each([false, true])('reads a dependent filter owner by model without migrating its local value definitions (dotted=%s)', async dotted => {
    const otherFilter = wire(dotted ? 'Orders.parentId' : 'parentId', 'Orders.parentId')
    const {owner, session, f, writes} = await setup({}, {Filter: otherFilter}, {overviewOnly: true, deferDefinition: true,
      sourceFields: [{...field, rowid: 'F1', dataModelId: 'M1'},
        {...field, rowid: 'F2', dataModelId: 'M1', Name: 'parentId', IsPKey: 0},
        {...field, rowid: 'F3', dataModelId: 'M2'},
        {...field, rowid: 'F4', dataModelId: 'M2', Name: dotted ? 'Orders.parentId' : 'parentId', IsPKey: 0, ValueFun: 'unrelated legacy value'}]})
    expect(owner.getState().preview?.problems).toEqual([])
    expect(session.metadataDataSet.getView('Base_DataModel_Field', 'sourceReplace:M1')?.queryContext['modelIds']).toEqual(['M1', 'M2'])
    await owner.save()
    expect(writes()).toHaveLength(1)
    expect(f.modelRow('M2')['Filter']).toBe(dotted ? otherFilter : wire('parentId', 'Orders.parentCode'))
    expect(session.metadataDataSet.getView('Base_DataModel_Field')!.rows).toEqual([])
    const reopened = await f.open('A')
    expect((await reopened.loadModelFields('M2')).rows.find(row => row['rowid'] === 'F4')?.['ValueFun']).toBe('unrelated legacy value')
    expect((await reopened.loadModelFields('M1')).rows.find(row => row['rowid'] === 'F2')).toMatchObject({Name: 'parentCode', AsName: 'parentId'})
  })

  it('preserves desensitization rule IDs while migrating a source field and reopening', async () => {
    const rule = '  parentId + 1  '
    const sourceFields = [{...field, rowid: 'F1', dataModelId: 'M1'},
      {...field, rowid: 'F2', dataModelId: 'M1', Name: 'parentId', IsPKey: 0, Expression: rule, ValueFun: '{"Type":"GetConstValue","Value":0}'}]
    const {owner, f, writes} = await setup({}, {}, {sourceFields})
    expect(owner.getState().preview?.problems).toEqual([])
    await owner.save()
    expect((await f.open('A')).metadataDataSet.getView('Base_DataModel_Field')?.rows.find(row => row['rowid'] === 'F2'))
      .toMatchObject({Name: 'parentCode', AsName: 'parentId', Expression: rule, ValueFun: '{"Type":"GetConstValue","Value":0}'})
    expect(writes()[0]?.data).toEqual(expect.arrayContaining([expect.objectContaining({TableName: 'Base_DataModel_Field',
      CrudModel: expect.objectContaining({Changed: [{rowid: 'F2', Name: 'parentCode', AsName: 'parentId', lingma_sys_key: 'token-A-F2'}]})})]))
    expect(f.fileWrites).toHaveLength(0)
  })

  it.each(['数据库表', '数据库视图'])('migrates the locally bound field definition for %s', Type => {
    const before = '{"Type":"GetTableField","Field":"id"}'
    const fields = [{rowid: 'F1', dataModelId: 'M1', type: 'dataModel', Name: 'id'},
      {rowid: 'F2', dataModelId: 'M1', type: 'dataModel', Name: 'copy', ValueFun: before}]
    expect(LowcodeDataSpaceFieldMigration.prepare({modelId: 'M1', models: [{rowid: 'M1', Type}], fields,
      mappings: [{name: 'id', sourceName: 'newId'}]})).toEqual([{id: 'F2', name: 'copy', before, after: '{"Type":"GetTableField","Field":"newId"}'}])
  })

  it.each(['接口', 'JSON', '字典', '视图'])('does not apply database field execution semantics to %s definitions', Type => {
    const fields = [{rowid: 'F1', dataModelId: 'M1', type: 'dataModel', Name: 'id'},
      {rowid: 'F2', dataModelId: 'M1', type: 'dataModel', Name: 'copy', ValueFun: '{"Type":"GetTableField","Field":"id"}'}]
    expect(() => LowcodeDataSpaceFieldMigration.prepare({modelId: 'M1', models: [{rowid: 'M1', Type}], fields,
      mappings: [{name: 'id', sourceName: 'newId'}]})).toThrow('数据库字段执行合同')
    expect(fields[1]?.ValueFun).toBe('{"Type":"GetTableField","Field":"id"}')
  })

  it('previews and persists a local field value reference independently of the field owning it', async () => {
    const {owner, f, writes, before, after} = await fieldReferenceSetup()
    expect(owner.getState().preview?.problems).toEqual([])
    expect(owner.getState().preview?.fieldExpressionChanges).toEqual([{id: 'F5', name: 'copied', before, after}])
    await owner.save()
    const fresh = await f.open('A'), fields = fresh.metadataDataSet.getView('Base_DataModel_Field', 'default')!
    expect(fields.rows.find(row => row['rowid'] === 'F5')).toMatchObject({Name: 'copied', ValueFun: after})
    expect(fields.rows.find(row => row['rowid'] === 'F4')).toHaveProperty('ValueFun', ' {"Type":"GetTableField","Field":"rowid"} ')
    expect(writes()[0]?.data).toEqual(expect.arrayContaining([expect.objectContaining({TableName: 'Base_DataModel_Field', CrudModel: expect.objectContaining({Changed: [
      {rowid: 'F2', Name: 'parentCode', AsName: 'parentId', lingma_sys_key: 'token-A-F2'},
      {rowid: 'F5', ValueFun: after, lingma_sys_key: 'token-A-F5'},
    ]})})]))
    const columns = fresh.definitionDataSet!.getView('OrdersAlias', 'shared')!.columns.map(column => column.name)
    expect(columns).toEqual(expect.arrayContaining(['rowid', 'parentId', 'copied']))
    expect(columns).not.toContain('parentCode')
    expect(f.fileWrites).toHaveLength(0)
  })

  it('rechecks ValueFun write access even when Name and AsName remain writable', async () => {
    const {owner, f, session, writes} = await fieldReferenceSetup()
    f.denyFieldProperty('ValueFun')
    await expect(owner.save()).rejects.toThrow('不允许修改映射字段')
    expect(writes()).toHaveLength(0)
    expect(session.metadataDataSet.getView('Base_DataModel_Field', 'default')!.dirtyTracking.hasPendingChanges()).toBe(false)
  })

  it.each(['unknown', 'partial'])('verifies field value definitions after %s results without replay', async kind => {
    const {owner, f, writes, after} = await fieldReferenceSetup(kind === 'partial' ? {omitFieldProperties: ['ValueFun']} : {})
    if (kind === 'unknown') f.loseNextResponse()
    await expect(owner.save()).rejects.toThrow()
    await expect(owner.save()).rejects.toThrow('先核验')
    expect((await owner.verify()).confirmed).toBe(kind === 'unknown')
    if (kind === 'partial') {
      expect(owner.getState().verification).toContainEqual({table: 'Base_DataModel_Field', id: 'F5.ValueFun', result: 'copied.ValueFun与预览不同，请处理差异'})
      owner.acceptCurrent()
    }
    else expect((await f.open('A')).metadataDataSet.getView('Base_DataModel_Field', 'default')!.rows.find(row => row['rowid'] === 'F5')).toHaveProperty('ValueFun', after)
    expect(writes()).toHaveLength(1)
  })

  it('keeps a value-definition edit made while the source model is being staged', async () => {
    const {owner, session, writes} = await fieldReferenceSetup()
    const fields = session.metadataDataSet.getView('Base_DataModel_Field', 'sourceReplace:M1')!, models = session.metadataDataSet.getView('Base_DataModel', 'default')!
    const apply = models.applyEditingRows.bind(models)
    vi.spyOn(models, 'applyEditingRows').mockImplementationOnce(async ids => {
      const result = await apply(ids)
      fields.updateEditingValue('F5', 'ValueFun', 'later edit')
      return result
    })
    await expect(owner.save()).rejects.toThrow('字段存在其他草稿')
    expect(fields.getEditingRow('F5')?.['ValueFun']).toBe('later edit')
    await expect(owner.verify()).rejects.toThrow('字段映射编辑已改变')
    expect(writes()).toHaveLength(0)
    fields.discardEditingRows(['F5'])
    expect((await owner.verify()).confirmed).toBe(false)
    expect(fields.dirtyTracking.hasPendingChanges()).toBe(false)
  })

  it('keeps the original field value bytes when the referenced source field is unchanged', async () => {
    const {owner, reader, f, before} = await fieldReferenceSetup()
    const prepared = await reader.prepare()
    reader.prepare.mockResolvedValue({...prepared, fields: prepared.fields.map(row => row.Name === 'parentCode' ? {...row, Name: 'parentId'} : row)})
    await owner.preview(source)
    expect(owner.getState().preview?.fieldExpressionChanges).toEqual([])
    await owner.save()
    expect((await f.open('A')).metadataDataSet.getView('Base_DataModel_Field', 'default')!.rows.find(row => row['rowid'] === 'F5')).toHaveProperty('ValueFun', before)
  })

  it('applies exchanged field identities once to both names and value definitions', async () => {
    const sourceFields = [{...field, rowid: 'F1', dataModelId: 'M1'},
      {...field, rowid: 'F2', dataModelId: 'M1', Name: 'parentId', IsPKey: 0, ValueFun: '{"Type":"GetTableField","Field":"other"}'},
      {...field, rowid: 'F5', dataModelId: 'M1', Name: 'other', IsPKey: 0, ValueFun: '{"Type":"GetTableField","Field":"parentId"}'}]
    const {owner, reader, f} = await setup({}, {}, {sourceFields})
    const prepared = await reader.prepare()
    reader.prepare.mockResolvedValue({...prepared, fields: [field, {...field, Name: 'parentId', IsPKey: 0}, {...field, Name: 'other', IsPKey: 0}]})
    await owner.preview(source); await owner.mapField({fieldId: 'F2', sourceName: 'other'}); await owner.mapField({fieldId: 'F5', sourceName: 'parentId'})
    expect(owner.getState().preview?.problems).toEqual([])
    await owner.save()
    const fields = (await f.open('A')).metadataDataSet.getView('Base_DataModel_Field', 'default')!
    expect(fields.rows.find(row => row['rowid'] === 'F2')).toMatchObject({Name: 'other', AsName: 'parentId', ValueFun: '{"Type":"GetTableField","Field":"parentId"}'})
    expect(fields.rows.find(row => row['rowid'] === 'F5')).toMatchObject({Name: 'parentId', AsName: 'other', ValueFun: '{"Type":"GetTableField","Field":"other"}'})
  })

  it.each([
    {Type: 'GetConstValue', Value: {Type: 'GetTableField', Field: 'parentId'}},
    {Type: 'GetInputParam', ParamName: 'parentId'},
    {Type: 'SystemData', ParamName: 'UserID'},
  ])('preserves source-independent $Type field definitions through mapping, save and reopening', async valueFunction => {
    const raw = `  ${JSON.stringify({...valueFunction, extension: false})}  `
    const sourceFields = ['M1', 'M2'].flatMap((dataModelId, i) => [
      {...field, rowid: `F${i * 2 + 1}`, dataModelId},
      {...field, rowid: `F${i * 2 + 2}`, dataModelId, Name: 'parentId', IsPKey: 0, ValueFun: raw},
    ])
    const {owner, f, writes} = await setup({}, {}, {sourceFields,
      businessRows: {Orders: [{rowid: 'O1', parentId: 'C1'}]}})
    expect(owner.getState().preview?.problems).toEqual([])
    const originalFile = f.stored.get('A')
    await owner.save()
    const fresh = await f.open('A'), definitions = fresh.metadataDataSet.getView('Base_DataModel_Field', 'default')!
    expect(definitions.rows.find(row => row['rowid'] === 'F2')).toMatchObject({Name: 'parentCode', AsName: 'parentId', ValueFun: raw})
    expect(definitions.rows.find(row => row['rowid'] === 'F4')).toMatchObject({Name: 'parentId', ValueFun: raw})
    expect(writes()[0]?.data).toEqual(expect.arrayContaining([expect.objectContaining({TableName: 'Base_DataModel_Field',
      CrudModel: expect.objectContaining({Changed: [{rowid: 'F2', Name: 'parentCode', AsName: 'parentId', lingma_sys_key: 'token-A-F2'}]})})]))
    const view = fresh.definitionDataSet!.getView('OrdersAlias', 'shared')!
    expect(view.treeConfig?.parentIdField).toBe('parentId')
    expect((await view.loadFromServer()).success).toBe(true)
    expect(view.rows[0]).toMatchObject({rowid: 'O1', parentId: 'C1'})
    expect(view.fieldAccess(view.rows[0] ?? null, 'parentId').read).toBe('visible')
    expect(f.stored.get('A')).toBe(originalFile); expect(f.fileWrites).toHaveLength(0)
  })

  it.each([
    {ValueFun: JSON.stringify({Type: 'GetTableField', Field: 'OrderSource.parentId'}), Expression: ''},
    {ValueFun: JSON.stringify({Type: 'GetRefData', RefTableName: 'physical', RefFieldName: 'parentId', FkFieldName: 'rowid'}), Expression: ''},
    {ValueFun: '{invalid', Expression: ''},
    {ValueFun: JSON.stringify({Type: 'GetInputParam', ParamName: ''}), Expression: ''},
  ])('retains unresolved or invalid field expressions without dispatching a source replacement: $ValueFun', async expression => {
    const sourceFields = [{...field, rowid: 'F1', dataModelId: 'M1'},
      {...field, rowid: 'F2', dataModelId: 'M1', Name: 'parentId', IsPKey: 0, ...expression}]
    const {owner, f, writes} = await setup({}, {}, {sourceFields})
    expect(owner.getState().preview?.problems.length).toBeGreaterThan(0)
    await expect(owner.save()).rejects.toThrow()
    const fresh = await f.open('A')
    expect(fresh.metadataDataSet.getView('Base_DataModel_Field', 'default')!.rows.find(row => row['rowid'] === 'F2')).toMatchObject(expression)
    expect(writes()).toHaveLength(0)
  })

  it('migrates own and dependent filters in one signed batch, then rereads both models', async () => {
    const own = JSON.stringify({Type: 'or', extension: 7, Filters: [condition('parentId', {Type: 'GetInputParam', ParamName: 'parentId'}),
      condition('Orders.parentId', {Type: 'GetConstValue', Value: {Field: 'parentId'}})]})
    const {owner, f, writes} = await setup({Filter: own}, {Filter: wire('parentId', 'Orders.parentId')})
    expect(owner.getState().preview?.problems).toEqual([])
    await owner.save()
    const fresh = await f.open('A'), models = fresh.metadataDataSet.getView('Base_DataModel', 'default')!
    expect(JSON.parse(String(models.rows.find(row => row['rowid'] === 'M1')?.['Filter']))).toEqual({Type: 'or', extension: 7, Filters: [
      condition('parentCode', {Type: 'GetInputParam', ParamName: 'parentId'}), condition('Orders.parentCode', {Type: 'GetConstValue', Value: {Field: 'parentId'}})]})
    expect(models.rows.find(row => row['rowid'] === 'M2')).toMatchObject({Filter: wire('parentId', 'Orders.parentCode')})
    expect(writes()[0]?.data).toEqual(expect.arrayContaining([expect.objectContaining({TableName: 'Base_DataModel', CrudModel: expect.objectContaining({Changed: [
      expect.objectContaining({rowid: 'M1', lingma_sys_key: 'token-A-M1'}), expect.objectContaining({rowid: 'M2', lingma_sys_key: 'token-A-M2'}),
    ]})})]))
    expect(fresh.definitionDataSet!.getView('OrdersAlias', 'shared')!.treeConfig?.parentIdField).toBe('parentId')
    expect(f.fileWrites).toHaveLength(0)
  })

  it.each(['JoinFilter', 'ForeignKeyFields', 'PId', 'JoinType'] as const)('preserves backend %s instead of treating it as a frontend relation', async property => {
    const original = property === 'JoinFilter' ? wire('parentId', 'parentId') : property === 'ForeignKeyFields' ? ' parentId , rowid ' : property === 'PId' ? 'Customers' : 'LEFT'
    const {owner, f, writes} = await setup({[property]: original})
    expect(owner.getState().preview?.problems.join()).toContain(property)
    await expect(owner.save()).rejects.toThrow(property)
    expect(f.modelRow()[property]).toBe(original); expect(writes()).toHaveLength(0)
  })

  it('preserves constants, system and input values while migrating only registered model field references', async () => {
    const values = [{Type: 'GetConstValue', Value: 'Orders.parentId'}, {Type: 'GetConstValue', Value: {Type: 'GetTableField', Field: 'parentId'}},
      {Type: 'GetInputParam', ParamName: 'parentId'}, {Type: 'SystemData', ParamName: 'parentId'}, {Type: 'GetTableField', Field: 'Orders.parentId', extra: false}]
    const {owner, f} = await setup({ShortName: 'o', Filter: JSON.stringify({Type: 'and', extra: 3, Filters: values.map(value => condition('Orders.parentId', value))})})
    await owner.save()
    expect(JSON.parse(f.modelRow().Filter)).toEqual({Type: 'and', extra: 3, Filters: values.map((value, i) => condition('Orders.parentCode', i === 4 ? {...value, Field: 'Orders.parentCode'} : value))})
    expect(f.modelRow()).toHaveProperty('ShortName', 'o')
  })

  it('retains logical qualifiers when only the physical source changes', async () => {
    const {owner, reader, f, writes} = await setup({MetaName: 'Orders', Filter: wire('Orders.parentId', 'rowid')},
      {MetaName: 'NextOrders', ShortName: 'Orders', Filter: wire('parentId', 'Orders.parentId')})
    const prepared = await reader.prepare()
    reader.prepare.mockResolvedValue({...prepared, fields: [field, {...field, Name: 'parentId', IsPKey: 0}]})
    await owner.preview(source)
    expect(owner.getState().preview?.expressionChanges).toHaveLength(0)
    await owner.save()
    expect(writes()[0]?.data).toHaveLength(1)
    expect(f.modelRow()).toMatchObject({MetaName: 'NextOrders', Filter: wire('Orders.parentId', 'rowid')})
    expect(f.modelRow('M2')).toMatchObject({Filter: wire('parentId', 'Orders.parentId')})
    expect(f.fileWrites).toHaveLength(0)
  })

  it('keeps unchanged filter bytes and requires no permission for the untouched dependent model', async () => {
    const original = `  ${JSON.stringify(condition('parentId', {Type: 'GetConstValue', Value: 'Orders.parentId'}))}  `
    const {owner, f, writes} = await setup({}, {Filter: original})
    f.denyModelField('Filter')
    expect(owner.getState().preview?.expressionChanges).toEqual([])
    await owner.save()
    expect(f.modelRow('M2').Filter).toBe(original)
    expect(writes()[0]?.data).toEqual(expect.arrayContaining([expect.objectContaining({TableName: 'Base_DataModel', CrudModel: expect.objectContaining({Changed: [expect.objectContaining({rowid: 'M1'})]})})]))
  })

  it.each(['OrderSource', 'o'])('does not infer registered model identity from %s', async qualifier => {
    const original = wire('parentId', `${qualifier}.parentId`)
    const {owner, f, writes} = await setup({ShortName: 'o', Filter: original})
    await expect(owner.save()).rejects.toThrow('模型注册名')
    expect(f.modelRow().Filter).toBe(original); expect(writes()).toHaveLength(0)
  })

  it.each(['unknown-model', 'duplicate-model', 'opaque', 'bad-json', 'legacy-join'])('diagnoses %s without changing its original configuration', async kind => {
    const original = kind === 'opaque' ? JSON.stringify(condition('parentId', {Type: 'GetExpData', expression: 'parentId + 1'}))
      : kind === 'bad-json' ? 'old expression' : wire('parentId', kind === 'unknown-model' ? 'missing.parentId' : 'Orders.parentId')
    const property = kind === 'legacy-join' ? 'JoinFilter' : 'Filter'
    const {owner, f, writes} = await setup({}, {...(kind === 'duplicate-model' ? {Name: 'Orders'} : {}), [property]: original})
    expect(owner.getState().preview?.problems.length).toBeGreaterThan(0)
    await expect(owner.save()).rejects.toThrow()
    expect(writes()).toHaveLength(0); expect(f.modelRow('M2')[property]).toBe(original)
  })

  it('checks the dependent property permission again before creating any delta', async () => {
    const {owner, f, session, writes} = await setup({}, {Filter: wire('parentId', 'Orders.parentId')})
    f.denyModelField('Filter')
    await expect(owner.save()).rejects.toThrow('不允许修改依赖模型M2')
    for (const name of ['Base_DataModel', 'Base_DataModel_Field']) expect(session.metadataDataSet.getView(name, 'default')!.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(writes()).toHaveLength(0)
  })

  it('rejects a changed dependent filter after preview instead of submitting an obsolete migration', async () => {
    const {owner, f, writes} = await setup({}, {Filter: wire('parentId', 'Orders.parentId')})
    f.setModelValues({Filter: wire('rowid', 'Orders.rowid')}, 'A', 'M2')
    await expect(owner.save()).rejects.toThrow('元数据已变化')
    expect(writes()).toHaveLength(0)
  })

  it.each(['partial', 'unknown'])('rereads both models after %s results without replaying a write', async kind => {
    const {owner, f, writes} = await setup({}, {Filter: wire('parentId', 'Orders.parentId')}, kind === 'partial' ? {omitModelProperties: ['Filter']} : {})
    if (kind === 'unknown') f.loseNextResponse()
    await expect(owner.save()).rejects.toThrow()
    await expect(owner.save()).rejects.toThrow('先核验')
    expect((await owner.verify()).confirmed).toBe(kind === 'unknown')
    if (kind === 'partial') {
      expect(owner.getState().verification).toContainEqual({table: 'Base_DataModel', id: 'M2.Filter', result: 'Customers.Filter与预览不同，请处理差异'})
      owner.acceptCurrent()
    }
    expect(writes()).toHaveLength(1)
  })

  it('preserves a dependent model draft created while staging the source model', async () => {
    const {owner, session, writes} = await setup({}, {Filter: wire('parentId', 'Orders.parentId')})
    const models = session.metadataDataSet.getView('Base_DataModel', 'default')!, apply = models.applyEditingRows.bind(models)
    vi.spyOn(models, 'applyEditingRows').mockImplementationOnce(async ids => {
      const result = await apply(ids); models.updateEditingValue('M2', 'description', 'another edit'); return result
    })
    await expect(owner.save()).rejects.toThrow('依赖模型存在其他草稿')
    await expect(owner.verify()).rejects.toThrow('依赖模型编辑已改变')
    expect(models.getEditingRow('M2')?.['description']).toBe('another edit')
    models.discardEditingRows(['M2'])
    expect((await owner.verify()).confirmed).toBe(false)
    expect(models.dirtyTracking.hasPendingChanges()).toBe(false); expect(writes()).toHaveLength(0)
  })

  it('recovers an applied dependent delta after a staging exception and preserves later edits', async () => {
    const {owner, session, writes} = await setup({}, {Filter: wire('parentId', 'Orders.parentId')})
    const models = session.metadataDataSet.getView('Base_DataModel', 'default')!, apply = models.applyEditingRows.bind(models)
    vi.spyOn(models, 'applyEditingRows').mockImplementation(async ids => {
      const result = await apply(ids); if (ids?.includes('M2')) throw new Error('dependent apply failed'); return result
    })
    await expect(owner.save()).rejects.toThrow('dependent apply failed')
    models.updateEditingValue('M2', 'Filter', 'later draft')
    await expect(owner.verify()).rejects.toThrow('依赖模型编辑已改变')
    models.discardEditingRows(['M2'])
    expect((await owner.verify()).confirmed).toBe(false)
    expect(models.dirtyTracking.hasPendingChanges()).toBe(false); expect(writes()).toHaveLength(0)
  })

  it('does not let a physical name or SQL alias shadow a registered model reference', async () => {
    const {owner, f} = await setup({Filter: wire('Orders.parentId', 'rowid')}, {MetaName: 'Orders', ShortName: 'Orders'})
    expect(owner.getState().preview?.problems).toEqual([])
    await owner.save()
    expect(f.modelRow().Filter).toBe(wire('Orders.parentCode', 'rowid'))
  })

  it('applies an exchange once against original field identities in both models', async () => {
    const sourceFields = ['M1', 'M2'].flatMap((dataModelId, i) => [{...field, rowid: `F${i * 2 + 1}`, dataModelId}, {...field, rowid: `F${i * 2 + 2}`, dataModelId, Name: 'parentId', IsPKey: 0}])
    const {owner, reader, f} = await setup({Filter: wire('parentId', 'other')}, {Filter: wire('parentId', 'Orders.parentId')},
      {sourceFields: [...sourceFields, {...field, rowid: 'F5', dataModelId: 'M1', Name: 'other', IsPKey: 0}]})
    const prepared = await reader.prepare()
    reader.prepare.mockResolvedValue({...prepared, fields: [field, {...field, Name: 'parentId', IsPKey: 0}, {...field, Name: 'other', IsPKey: 0}]})
    await owner.preview(source); await owner.mapField({fieldId: 'F2', sourceName: 'other'}); await owner.mapField({fieldId: 'F5', sourceName: 'parentId'})
    expect(owner.getState().preview?.problems).toEqual([])
    await owner.save()
    expect(f.modelRow().Filter).toBe(wire('other', 'parentId'))
    expect(f.modelRow('M2').Filter).toBe(wire('parentId', 'Orders.other'))
  })
})
