import {afterEach, describe, expect, it, vi} from 'vitest'
import {flushPromises} from '@vue/test-utils'
import {getDataViewFilterFunctionDefinitions, type DataViewFilterValueFunction} from '@spark-appworks/spark-data'
import {LowcodeDataSpaceFieldEdit} from '@/lowcode/data-space/model-source/lowcode-data-space-field-edit'
import {LowcodeDataSpaceFieldValue} from '@/lowcode/data-space/model-source/field-value/lowcode-data-space-field-value'
import {dataSpacePageFixture} from '../data-space-page.fixture'

const fixtures: ReturnType<typeof dataSpacePageFixture>[] = []
afterEach(() => {vi.restoreAllMocks(); fixtures.splice(0).forEach(f => f.dispose())})
const sourceFields = [
  {rowid: 'PK', dataModelId: 'M1', Name: 'rowid', AsName: '', type: 'dataModel', FieldType: 'string', IsPKey: 1, IsOutput: 1, ValueFun: ''},
  {rowid: 'PARENT', dataModelId: 'M1', Name: 'parentId', AsName: '', description: '', type: 'dataModel', FieldType: 'string', IsPKey: 0, IsOutput: 1, ValueFun: ''},
]
async function setup(options: Parameters<typeof dataSpacePageFixture>[0] = {}, configure?: (f: ReturnType<typeof dataSpacePageFixture>) => void) {
  const f = dataSpacePageFixture({allowFieldAdd: true, allowFieldEdit: true, editableFieldProperties: ['description', 'AsName', 'IsOutput'], sourceFields, ...options}); fixtures.push(f)
  configure?.(f)
  const session = await f.open('A'), view = await session.loadModelFields('M1')
  const owner = session.getFieldCreate('M1', 'modelFields')
  const owners = () => view.rows.map(row => session.getFieldEdit(String(row['rowid']), 'modelFields'))
  async function add(name: string) {
    owner.begin()
    for (const [key, value] of Object.entries({Name: name, AsName: `${name}Output`, description: name})) owner.input.updateEditingValue('draft', key, value)
    return owner.stage()
  }
  return {f, session, view, owner, owners, add, writes: () => f.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')}
}

describe('reference computed field confirmation and workspace save', () => {
  it.each([0, 1])('rejects a non-output new alias against a formal column with output %s before staging', async output => {
    const {owner, view, writes} = await setup({sourceFields: sourceFields.map(row => row.rowid === 'PARENT' ? {...row, IsOutput: output} : row)})
    owner.begin()
    for (const [key, value] of Object.entries({Name: 'newColumn', AsName: 'parentId', IsOutput: 0})) owner.input.updateEditingValue('draft', key, value)
    await expect(owner.stage()).rejects.toThrow('冲突')
    expect(view.dirtyTracking.pendingCreateIds.size).toBe(0)
    expect(writes()).toEqual([]); owner.cancel()
  })

  it.each(['formal', 'local'])('rejects a staged non-output alias collision with %s columns before saving', async kind => {
    const {f, session, view, add, owners, writes} = await setup({}, f => f.stored.set('A', JSON.stringify({scenarioId: 'A', tables: {
      OrdersAlias: {modelBinding: {modelId: 'M1', modelName: 'Orders'}, columns: [{name: 'localTotal', type: 'number', computeExpression: '1'}], views: {default: {}}}}})))
    const id = await add('newColumn')
    view.updateEditingValue(id, 'IsOutput', 0)
    view.updateEditingValue(id, 'AsName', kind === 'formal' ? 'parentId' : 'localTotal')
    await expect(session.getModelEdit('M1').save(owners())).rejects.toThrow(kind === 'formal' ? '重复' : '本地计算')
    expect(view.dirtyTracking.isPendingCreate(id)).toBe(true)
    expect(writes()).toEqual([]); expect(f.fileWrites).toEqual([])
    view.discardPendingChanges([id]); expect(view.dirtyTracking.pendingCreateIds.size).toBe(0)
  })

  it.each(['', '{"Type":"GetTableField","Field":"rowid"}'])(
    'creates a computed column with only its owning model loaded: %s', async value => {
      const {f, session, view, owner, owners, writes} = await setup({overviewOnly: true})
      const models = session.metadataDataSet.getView('Base_DataModel')!
      await models.loadFromServer({page: 1, pageSize: 1})
      const reads = f.requests.length
      owner.begin()
      for (const [key, next] of Object.entries({Name: 'scopedColumn', description: '当前模型列', ValueFun: value})) owner.input.updateEditingValue('draft', key, next)
      const id = await owner.stage()
      expect(f.requests).toHaveLength(reads); expect(writes()).toEqual([])
      expect(view.dirtyTracking.isPendingCreate(id)).toBe(true)
      await session.getModelEdit('M1').save(owners())
      expect(writes()).toHaveLength(1)
      expect(models.rows).toHaveLength(1); expect(models.total).toBe(2)
      expect(session.metadataDataSet.getView('Base_DataModel_Field')!.rows).toEqual([])
      const reopened = await f.open('A'), fields = await reopened.loadModelFields('M1')
      expect(fields.rows.find(row => row['rowid'] === id)).toMatchObject({Name: 'scopedColumn', ValueFun: value})
      await reopened.loadDefinition()
      expect(reopened.definitionDataSet!.getTable('OrdersAlias')!.columns.some(column => column.name === 'scopedColumn')).toBe(true)
      expect(f.fileWrites).toEqual([])
    })

  it.each(['new', 'stored'] as const)('confirms %s computed name and description in the original view, then saves and reopens', async mode => {
    const {f, session, view, add, owners, writes} = await setup({overviewOnly: true,
      editableFieldProperties: ['Name', 'description', 'AsName', 'IsOutput'], sourceFields: [...sourceFields,
        {rowid: 'TOTAL', dataModelId: 'M1', Name: 'total', AsName: 'totalOutput', description: '旧说明',
          type: 'dataModel', FieldType: '计算字段', IsPKey: 0, IsOutput: 1, ValueFun: ''}]})
    const id = mode === 'new' ? await add('extra') : 'TOTAL'
    view.updateEditingValue(id, 'Name', '  confirmed  ')
    view.updateEditingValue(id, 'description', '  确认说明  ')
    view.updateEditingValue('PARENT', 'description', '其他字段草稿')
    session.getFieldEdit(id, 'modelFields').confirmContract(view.rows.map(row => String(row['rowid'])))
    expect(view.getEditingRow(id)).toMatchObject({Name: 'confirmed', description: '确认说明',
      AsName: mode === 'new' ? 'extraOutput' : 'totalOutput', FieldType: '计算字段', IsOutput: 1, IsPKey: 0})
    expect(view.getEditingPatch('PARENT')).toEqual({description: '其他字段草稿'})
    expect(writes()).toEqual([])
    await session.getModelEdit('M1').save(owners())
    expect(writes()).toHaveLength(1)
    const reopened = await f.open('A'), fields = await reopened.loadModelFields('M1')
    expect(fields.rows.find(row => row['rowid'] === id)).toMatchObject({Name: 'confirmed', description: '确认说明'})
    expect(f.fileWrites).toEqual([])
  })

  it('keeps the original typed values when computed edit confirmation rejects a candidate', async () => {
    const {session, view, add, writes} = await setup()
    const id = await add('total'), field = session.getFieldEdit(id, 'modelFields')
    view.updateEditingValue(id, 'Name', '  confirmed  ')
    view.updateEditingValue(id, 'description', ' '.repeat(2) + 'x'.repeat(201))
    const before = {...view.getEditingPatch(id)}
    expect(() => field.confirmContract(view.rows.map(row => String(row['rowid'])))).toThrow('描述不能超过200')
    expect(view.getEditingPatch(id)).toEqual(before)
    view.updateEditingValue(id, 'Name', '   ')
    view.updateEditingValue(id, 'description', '  新说明  ')
    expect(() => field.confirmContract(view.rows.map(row => String(row['rowid'])))).toThrow('名称必须是有效非空文本')
    expect(view.getEditingRow(id)).toMatchObject({Name: '   ', description: '  新说明  '})
    expect(writes()).toEqual([])
  })

  it.each(['save', 'cancel', 'unknown'] as const)('accepts reference name and description with an empty alias through %s and independent reopen', async mode => {
    const {f, session, view, owner, owners, writes} = await setup({overviewOnly: true})
    owner.begin()
    owner.input.updateEditingValue('draft', 'Name', '  total  ')
    owner.input.updateEditingValue('draft', 'description', '  合计  ')
    const id = await owner.stage(), batch = owners()
    expect(view.getEditingRow(id)).toMatchObject({Name: 'total', description: '合计', AsName: '', IsOutput: 1, IsPKey: 0, FieldType: '计算字段'})
    expect(owner.input.rows).toEqual([])
    expect(writes()).toEqual([])
    if (mode === 'cancel') session.getFieldEdit(id, 'modelFields').discard()
    else if (mode === 'unknown') {
      f.loseNextResponse()
      await expect(session.getModelEdit('M1').save(batch)).rejects.toThrow()
      await expect(session.getModelEdit('M1').save(batch)).rejects.toThrow()
      expect(writes()).toHaveLength(1)
      await LowcodeDataSpaceFieldEdit.reloadBatch(batch, true)
    } else await session.getModelEdit('M1').save(batch)
    expect(writes()).toHaveLength(mode === 'cancel' ? 0 : 1)
    const reopened = await f.open('A'), fields = await reopened.loadModelFields('M1')
    const stored = fields.rows.find(row => row['rowid'] === id)
    if (mode === 'cancel') expect(stored).toBeUndefined()
    else expect(stored).toMatchObject({Name: 'total', AsName: '', description: '合计'})
    await reopened.loadDefinition()
    expect(reopened.definitionDataSet!.getTable('OrdersAlias')!.columns.some(column => column.name === 'total')).toBe(mode !== 'cancel')
    expect(f.fileWrites).toEqual([])
    expect(reopened.metadataDataSet.getView('Base_DataModel_Field', 'default')!.rows).toEqual([])
  })

  it('allows clearing a staged alias in the detail editor and saves the field-name output', async () => {
    const {f, session, view, add, owners, writes} = await setup({overviewOnly: true})
    const id = await add('total'), field = session.getFieldEdit(id, 'modelFields')
    view.updateEditingValue(id, 'AsName', '')
    expect(() => field.confirmContract(view.rows.map(row => String(row['rowid'])))).not.toThrow()
    await session.getModelEdit('M1').save(owners())
    expect(writes()).toHaveLength(1)
    const reopened = await f.open('A'), fields = await reopened.loadModelFields('M1')
    expect(fields.rows.find(row => row['rowid'] === id)?.['AsName']).toBe('')
    await reopened.loadDefinition()
    expect(reopened.definitionDataSet!.getTable('OrdersAlias')!.columns.map(column => column.name)).toContain('total')
  })

  it('checks the effective output against another staged alias before appending a new field', async () => {
    const {view, owner, add, writes} = await setup()
    const existing = await add('total')
    owner.begin(); owner.input.updateEditingValue('draft', 'Name', 'totalOutput')
    await expect(owner.stage()).rejects.toThrow('模型列名称与已有字段冲突')
    expect(view.dirtyTracking.pendingCreateIds).toEqual(new Set([existing]))
    expect(owner.input.getEditingRow('draft')).toMatchObject({Name: 'totalOutput', AsName: ''})
    expect(writes()).toEqual([])
  })

  it('rejects an empty-alias output collision introduced after staging before any write', async () => {
    const {owner, session, view, owners, writes} = await setup()
    owner.begin(); owner.input.updateEditingValue('draft', 'Name', 'total')
    const id = await owner.stage()
    view.updateEditingValue('PARENT', 'AsName', 'total')
    await expect(session.getModelEdit('M1').save(owners())).rejects.toThrow(/字段重复/)
    expect(view.dirtyTracking.isPendingCreate(id)).toBe(true)
    expect(view.getEditingPatch('PARENT')).toEqual({AsName: 'total'})
    expect(writes()).toEqual([])
  })

  it('edits physical reference candidates and saves their original value through the scoped DataView', async () => {
    const {f, session, view, owners, writes} = await setup({overviewOnly: true, editableFieldProperties: ['ValueFun'], sourceFields: [
      ...sourceFields.map(field => ({...field, AsName: `${field.Name}Output`})),
      {rowid: 'CALC', dataModelId: 'M1', Name: 'calculated', type: 'dataModel', FieldType: '计算字段', IsPKey: 0, IsOutput: 1, ValueFun: '{"Type":"GetConstValue","Value":1}'},
    ]}, f => f.setModelValues({Type: '数据库表', DbId: 'DB', DbName: 'ordersDb'}))
    const owner = session.getFieldEdit('PARENT', 'modelFields'), context = owner.readValueFunction().context
    const definition = getDataViewFilterFunctionDefinitions(context).find(item => item.type === 'GetRefData')!
    const value: DataViewFilterValueFunction = {Type: 'GetRefData', RefTableName: 'OrderSource', RefFieldName: 'parentId', FkFieldName: 'rowid'}
    const options = (key: string) => {const field = definition.fields.find(item => item.key === key)!; return typeof field.options === 'function' ? field.options(value, context) : field.options}
    expect(options('RefTableName')).toEqual([{label: 'Orders（OrderSource）', value: 'OrderSource'}])
    expect(options('RefFieldName')?.map(item => item.value)).toEqual(['rowid', 'parentId'])
    expect(options('FkFieldName')).toEqual(options('RefFieldName'))
    expect(() => owner.stageValueFunction(JSON.stringify({...value, RefTableName: 'Orders'}))).toThrow()
    expect(() => owner.stageValueFunction(JSON.stringify({...value, RefFieldName: 'calculated'}))).toThrow()
    expect(() => owner.stageValueFunction(JSON.stringify({...value, RefFieldName: 'parentIdOutput'}))).toThrow()
    const raw = ` ${JSON.stringify({...value, Extra: false})} `
    owner.stageValueFunction(raw); owner.discard()
    expect(writes()).toEqual([])
    expect(view.getEditingRow('PARENT')?.['ValueFun']).toBe('')
    owner.stageValueFunction(raw)
    await session.getModelEdit('M1').save(owners())
    expect(writes()).toHaveLength(1)
    const reopened = await f.open('A'), loaded = await reopened.loadModelFields('M1')
    expect(loaded.rows.find(row => row['rowid'] === 'PARENT')?.['ValueFun']).toBe(raw)
    expect(() => new LowcodeDataSpaceFieldValue(reopened.metadataDataSet, 'A', 'M1', 'modelFields').validate(raw)).not.toThrow()
    expect(f.fileWrites).toEqual([])
    expect(reopened.metadataDataSet.getView('Base_DataModel_Field', 'default')?.rows).toEqual([])
    expect(reopened.metadataDataSet.getView('Base_DataModel_Relation', 'default')?.rows).toEqual([])
  })

  it.each(['other-db', 'non-database'])('rejects an unresolved physical reference before saving: %s', async kind => {
    const {session, writes} = await setup({sourceFields: [...sourceFields,
      {rowid: 'OTHER_PK', dataModelId: 'M2', Name: 'rowid', type: 'dataModel', FieldType: 'string', IsPKey: 1, IsOutput: 1}]}, f => {
      f.setModelValues({Type: '数据库表', DbId: 'DB', DbName: 'ordersDb', MetaName: 'Orders'})
      f.setModelValues({Type: kind === 'non-database' ? '字典' : '数据库表', DbId: kind === 'other-db' ? 'OTHER_DB' : 'DB',
        DbName: kind === 'other-db' ? 'otherDb' : 'ordersDb', MetaName: 'Customers'}, 'A', 'M2')
    })
    const catalog = new LowcodeDataSpaceFieldValue(session.metadataDataSet, 'A', 'M1', 'modelFields')
    expect(() => catalog.validate(JSON.stringify({Type: 'GetRefData', RefTableName: 'Customers',
      RefFieldName: 'rowid', FkFieldName: 'rowid'}))).toThrow(/数据库|资源.*不唯一/)
    expect(writes()).toEqual([])
  })

  it.each(['same-db', 'other-db'])('resolves shared physical names from the current database without loading another model: %s', async kind => {
    const {session, f} = await setup({overviewOnly: true}, f => {
      f.setModelValues({Type: '数据库表', DbId: 'DB', DbName: 'ordersDb'})
      f.setModelValues({Type: '数据库表', DbId: kind === 'same-db' ? 'DB' : 'OTHER_DB',
        DbName: kind === 'same-db' ? 'ordersDb' : 'otherDb', MetaName: 'OrderSource'}, 'A', 'M2')
    })
    const before = f.requests.length, catalog = new LowcodeDataSpaceFieldValue(session.metadataDataSet, 'A', 'M1', 'modelFields')
    expect(() => catalog.validate('{"Type":"GetRefData","RefTableName":"OrderSource","RefFieldName":"parentId","FkFieldName":"rowid"}')).not.toThrow()
    expect(catalog.read().warning).toBe('')
    expect(f.requests).toHaveLength(before)
  })

  it.each(['MetaName', 'DbName', 'FieldType'])('withholds unreadable reference identities or fields when %s is hidden', async key => {
    const f = dataSpacePageFixture({sourceFields, ...(key === 'FieldType' ? {hiddenFieldProperties: [key]} : {hiddenModelProperties: [key]})})
    fixtures.push(f); f.setModelValues({Type: '数据库表', DbId: 'DB', DbName: 'ordersDb'})
    const session = await f.open('A'), catalog = new LowcodeDataSpaceFieldValue(session.metadataDataSet, 'A', 'M1')
    const {context, warning} = catalog.read()
    expect(warning).toContain('不可读')
    expect(context.relatedFields).toContainEqual({label: 'parentId', value: 'parentId'})
    const definition = getDataViewFilterFunctionDefinitions(context).find(item => item.type === 'GetRefData')!
    const options = (name: string) => {
      const field = definition.fields.find(item => item.key === name)!
      return typeof field.options === 'function' ? field.options({Type: 'GetRefData', RefTableName: 'OrderSource'}, context) : field.options
    }
    expect(options('RefTableName')).toEqual(key === 'FieldType' ? [{label: 'Orders（OrderSource）', value: 'OrderSource'}] : [])
    expect(options('RefFieldName')).toEqual([])
    expect(options('FkFieldName')).toEqual([])
    expect(() => catalog.validate('{"Type":"GetRefData","RefTableName":"OrderSource","RefFieldName":"parentId","FkFieldName":"rowid"}')).toThrow('不可读')
  })

  it('preserves a legacy registered-name reference when saving another field property', async () => {
    const raw = ' {"Type":"GetRefData","RefTableName":"Orders","RefFieldName":"parentId","FkFieldName":"rowid","Extra":0} '
    const {f, session, view, owners, writes} = await setup({overviewOnly: true, editableFieldProperties: ['description', 'ValueFun'],
      sourceFields: sourceFields.map(field => field.rowid === 'PARENT' ? {...field, ValueFun: raw} : field)},
      f => f.setModelValues({Type: '数据库表'}))
    const owner = session.getFieldEdit('PARENT', 'modelFields')
    expect(owner.readValueFunction().value).toBe(raw)
    expect(() => owner.stageValueFunction(raw)).toThrow('引用资源')
    view.updateEditingValue('PARENT', 'description', '仅修改说明')
    await session.getModelEdit('M1').save(owners())
    expect(writes()).toHaveLength(1)
    expect(JSON.stringify(writes()[0]?.data)).not.toContain('ValueFun')
    const reopened = await f.open('A'), fields = await reopened.loadModelFields('M1')
    expect(fields.rows.find(row => row['rowid'] === 'PARENT')?.['ValueFun']).toBe(raw)
  })

  it('resolves a local field from its model workspace without loading space-wide directories', async () => {
    const {session, view, f} = await setup({overviewOnly: true})
    const catalog = new LowcodeDataSpaceFieldValue(session.metadataDataSet, 'A', 'M1', 'modelFields')
    const before = f.requests.length
    expect(catalog.read().context.relatedFields).toContainEqual({label: 'parentId', value: 'parentId'})
    expect(() => catalog.validate('{"Type":"GetTableField","Field":"parentId"}')).not.toThrow()
    expect(() => catalog.validate('{"Type":"GetTableField","Field":"missing"}')).toThrow()
    expect(() => catalog.validate('{"Type":"GetTableField","Field":"Customers.rowid"}')).toThrow()
    expect(f.requests).toHaveLength(before)
    expect(view.rows).toHaveLength(2)
    expect(session.metadataDataSet.getView('Base_DataModel_Field', 'default')?.rows).toEqual([])
    expect(session.metadataDataSet.getView('Base_DataModel_Relation', 'default')?.rows).toEqual([])
  })

  it('checks space input parameters without reading model or field directories', async () => {
    const {session, f} = await setup({overviewOnly: true})
    const catalog = new LowcodeDataSpaceFieldValue(session.metadataDataSet, 'A', 'M1', 'modelFields')
    const getView = vi.spyOn(session.metadataDataSet, 'getView'), before = f.requests.length
    for (const expression of [{Type: 'GetInputParam', ParamName: 'customer'},
      {Type: 'GetObjectArray', arrParamName: 'customer', objectConstruct: '{"id":"item.id"}'}]) {
      expect(() => catalog.validate(JSON.stringify(expression))).not.toThrow()
    }
    expect(getView.mock.calls.every(([name]) => name === 'Base_DataSet')).toBe(true)
    getView.mockClear()
    catalog.validate('{"Type":"GetConstValue","Value":false}')
    catalog.validate('{"Type":"FutureServerValue","Extra":0}')
    expect(getView).not.toHaveBeenCalled()
    expect(f.requests).toHaveLength(before)
  })

  it('checks a physical reference without unrelated malformed field definitions', async () => {
    const {session, f} = await setup({sourceFields: [...sourceFields,
      {rowid: 'BAD', dataModelId: 'M2', type: 'dataModel', Name: '', FieldType: 'string', IsOutput: 1}]}, f => f.setModelValues({Type: '数据库表'}))
    const catalog = new LowcodeDataSpaceFieldValue(session.metadataDataSet, 'A', 'M1', 'modelFields'), before = f.requests.length
    expect(() => catalog.validate('{"Type":"GetRefData","RefTableName":"OrderSource","RefFieldName":"parentId","FkFieldName":"rowid"}')).not.toThrow()
    expect(() => catalog.validate('{"Type":"GetRefData","RefTableName":"OrderSource","RefFieldName":"missing","FkFieldName":"rowid"}')).toThrow()
    expect(() => catalog.validate('{"Type":"GetRefData","RefTableName":"OrdersAlias","RefFieldName":"parentId","FkFieldName":"rowid"}')).toThrow()
    expect(() => catalog.validate('{"Type":"GetGroupData","ValType":"COUNT"}')).not.toThrow()
    expect(() => catalog.validate('{"Type":"GetGroupData","GroupTableName":"Orders","GroupField":"parentId","Field":"rowid","ValType":"COUNT","RefTableName":"unrelated extension"}')).toThrow('旧引用分组')
    expect(f.requests).toHaveLength(before)
  })

  it('uses staged field names for value-function editing and saves references in the same batch', async () => {
    const {f, session, view, owners, add, writes} = await setup()
    const first = await add('subtotal'), second = await add('tax'), batch = owners()
    const source = session.getFieldEdit(first, 'modelFields'), consumer = session.getFieldEdit(second, 'modelFields')
    const ids = view.rows.map(row => String(row['rowid']))
    source.stageValueFunction('{"Type":"GetConstValue","Value":5}', ids)
    expect(consumer.readValueFunction().context.relatedFields).toContainEqual({label: 'subtotal', value: 'subtotal'})
    expect(consumer.readValueFunction().context.relatedFields).not.toContainEqual({label: 'subtotalOutput', value: 'subtotalOutput'})
    const expression = ' {"Type":"GetTableField","Field":"subtotal","Extra":false} '
    consumer.stageValueFunction(expression, ids)
    expect(writes()).toEqual([])
    await session.getModelEdit('M1').save(batch)
    expect(writes()).toHaveLength(1)
    expect(f.fileWrites).toEqual([])
    const reopened = await f.open('A'), loaded = await reopened.loadModelFields('M1')
    expect(loaded.rows.find(row => row['rowid'] === second)?.['ValueFun']).toBe(expression)
    expect(reopened.getFieldEdit(second, 'modelFields').readValueFunction().context.relatedFields).toContainEqual({label: 'subtotal', value: 'subtotal'})
    expect(reopened.definitionDataSet?.getTable('OrdersAlias')?.columns.map(column => column.name)).toEqual(expect.arrayContaining(['subtotalOutput', 'taxOutput']))
  })

  it('reads the current staged name and rejects a reference after its source is canceled', async () => {
    const {session, view, owners, add, writes} = await setup()
    const first = await add('subtotal'), second = await add('tax'); owners()
    view.updateEditingValue(first, 'Name', 'net')
    const consumer = session.getFieldEdit(second, 'modelFields'), ids = view.rows.map(row => String(row['rowid']))
    const fields = consumer.readValueFunction().context.relatedFields
    expect(fields).toContainEqual({label: 'net', value: 'net'})
    expect(fields).not.toContainEqual({label: 'subtotal', value: 'subtotal'})
    consumer.stageValueFunction('{"Type":"GetTableField","Field":"net"}', ids)
    session.getFieldEdit(first, 'modelFields').discard()
    expect(consumer.readValueFunction().context.relatedFields).not.toContainEqual({label: 'net', value: 'net'})
    await expect(session.getModelEdit('M1').save(owners())).rejects.toThrow()
    expect(view.getEditingRow(second)?.['ValueFun']).toContain('net')
    expect(writes()).toEqual([])
  })

  it('keeps the independent field directory separate from workspace additions', async () => {
    const {session, owner, add, writes} = await setup()
    await add('subtotal')
    owner.begin()
    expect(owner.readValueFunction().context.relatedFields).toContainEqual({label: 'subtotal', value: 'subtotal'})
    owner.stageValueFunction('{"Type":"GetTableField","Field":"subtotal"}')
    const independent = session.getFieldEdit('PARENT', 'default').readValueFunction()
    expect(independent.context.relatedFields).not.toContainEqual({label: 'subtotal', value: 'subtotal'})
    owner.cancel()
    expect(writes()).toEqual([])
  })

  it('keeps field references usable while saving the same model request settings', async () => {
    const {f, session, view, owners, add, writes} = await setup()
    const first = await add('subtotal'), second = await add('tax'), batch = owners()
    const model = session.getModelEdit('M1')
    model.stage('description', 'model and fields')
    session.getFieldEdit(first, 'modelFields').stageValueFunction('{"Type":"GetConstValue","Value":5}', view.rows.map(row => String(row['rowid'])))
    const consumer = session.getFieldEdit(second, 'modelFields')
    expect(consumer.readValueFunction().context.relatedFields).toContainEqual({label: 'subtotal', value: 'subtotal'})
    consumer.stageValueFunction('{"Type":"GetTableField","Field":"subtotal"}', view.rows.map(row => String(row['rowid'])))
    await model.save(batch)
    expect(writes()).toHaveLength(1)
    expect(f.modelRow()['description']).toBe('model and fields')
  })

  it.each(['model', 'space', 'identity', 'query'])('rejects %s changes without falling back to the saved field directory', async kind => {
    const {f, session, view, writes} = await setup()
    const catalog = new LowcodeDataSpaceFieldValue(session.metadataDataSet, 'A', 'M1', 'modelFields')
    expect(catalog.read().context.relatedFields).toContainEqual({label: 'parentId', value: 'parentId'})
    if (kind === 'model') view.configure({queryContext: {dataSpaceId: 'A', modelId: 'M2'}})
    if (kind === 'space') view.configure({queryContext: {dataSpaceId: 'B', modelId: 'M1'}})
    if (kind === 'identity') view.updateEditingValue('PARENT', 'dataModelId', 'M2')
    if (kind === 'query') {f.failNextFieldRead(); await expect(view.loadFromServer()).rejects.toThrow('field read unavailable')}
    expect(catalog.read().warning).not.toBe('')
    expect(catalog.read().context.relatedFields).toEqual([])
    expect(() => catalog.validate('{"Type":"GetTableField","Field":"parentId"}')).toThrow()
    expect(writes()).toEqual([])
  })

  it('does not expose unreadable names or use another model draft as reference context', async () => {
    const hidden = await setup({hiddenFieldProperties: ['Name']})
    const hiddenCatalog = new LowcodeDataSpaceFieldValue(hidden.session.metadataDataSet, 'A', 'M1', 'modelFields')
    expect(hiddenCatalog.read().context.relatedFields).toEqual([])
    expect(hiddenCatalog.read().warning).toContain('不可读')
    const {session, writes} = await setup({allowModelRename: true})
    const catalog = new LowcodeDataSpaceFieldValue(session.metadataDataSet, 'A', 'M1', 'modelFields')
    const models = session.metadataDataSet.getView('Base_DataModel', 'default')!
    for (const [id, field, value] of [['M1', 'Name', 'OtherName']]) {
      models.updateEditingValue(id!, field!, value)
      expect(catalog.read().context.relatedFields).toEqual([])
      expect(catalog.read().warning).toContain('未保存修改')
      models.discardEditingRows()
    }
    models.updateEditingValue('M2', 'description', 'other draft')
    expect(() => catalog.validate('{"Type":"GetTableField","Field":"parentId"}')).not.toThrow()
    expect(catalog.read().context.relatedFields).toContainEqual({label: 'parentId', value: 'parentId'})
    expect(writes()).toEqual([])
  })

  it.each([false, true])('stages multiple new rows and existing edits in one view, then saves one batch and independently reopens (overview=%s)', async overviewOnly => {
    const {f, session, view, owner, owners, add, writes} = await setup({overviewOnly})
    owners()
    view.updateEditingValue('PARENT', 'description', 'parent changed')
    const first = await add('total'), second = await add('tax')
    expect(writes()).toHaveLength(0); expect(f.fileWrites).toEqual([])
    expect(owner.input.rows).toEqual([])
    expect(new Set(view.dirtyTracking.pendingCreateIds)).toEqual(new Set([first, second]))
    expect(session.hasPendingFieldEdits()).toBe(true)
    view.updateEditingValue(first, 'description', 'total changed')
    session.getFieldEdit(first, 'modelFields').confirmContract(view.rows.map(row => String(row['rowid'])))
    await session.getModelEdit('M1').save(owners())
    expect(writes()).toHaveLength(1)
    expect(f.created.get('Base_DataModel_Field')).toEqual(expect.arrayContaining([
      expect.objectContaining({rowid: first, description: 'total changed', IsPKey: 0}), expect.objectContaining({rowid: second, Name: 'tax'}),
    ]))
    expect(view.rows.find(row => row['rowid'] === 'PARENT')?.['description']).toBe('parent changed')
    expect(session.hasPendingFieldEdits()).toBe(false)
    if (overviewOnly) expect(session.metadataDataSet.getView('Base_DataModel_Field', 'default')?.rows).toEqual([])
    const reopened = await f.open('A')
    expect(reopened.definitionDataSet?.getTable('OrdersAlias')?.columns.map(column => column.name)).toEqual(expect.arrayContaining(['totalOutput', 'taxOutput']))
  })
  it('uses add permission for a new row without borrowing existing-row edit permission; cancel removes only its draft', async () => {
    const {session, view, owners, add, writes} = await setup({allowFieldEdit: false, readOnly: true})
    expect(view.editActionState(view.rows[0]!)).not.toBe('enabled')
    const id = await add('total'), owner = session.getFieldEdit(id, 'modelFields')
    expect(owner.read().fields.find(field => field.name === 'description')?.writable).toBe(true)
    view.updateEditingValue(id, 'description', 'changed')
    await LowcodeDataSpaceFieldEdit.stageOutputBatch(owners(), 'all')
    owner.discard()
    expect(view.rows.some(row => row['rowid'] === id)).toBe(false)
    expect(session.hasPendingFieldEdits()).toBe(false)
    expect(writes()).toEqual([])
  })
  it('rejects repeated names and final output collisions before writing, retaining input for correction', async () => {
    const {owner, add, owners, writes, view} = await setup()
    await add('total')
    await expect(add('total')).rejects.toThrow('已存在')
    expect(owner.input.getEditingRow('draft')?.['Name']).toBe('total'); owner.cancel()
    const id = await add('tax')
    owners()
    view.updateEditingValue(id, 'AsName', 'totalOutput')
    await expect(LowcodeDataSpaceFieldEdit.saveBatch(owners())).rejects.toThrow(/字段重复/)
    expect(view.getEditingRow(id)?.['AsName']).toBe('totalOutput')
    expect(writes()).toEqual([])
  })
  it('does not replay a lost create receipt and preserves recovery until an explicit reread', async () => {
    const {f, session, view, owners, add, writes} = await setup()
    const id = await add('total'), batch = owners(); f.loseNextResponse()
    await expect(session.getModelEdit('M1').save(batch)).rejects.toThrow()
    expect(session.hasPendingFieldEdits()).toBe(true)
    await expect(session.getModelEdit('M1').save(batch)).rejects.toThrow()
    expect(writes()).toHaveLength(1)
    await LowcodeDataSpaceFieldEdit.reloadBatch(batch, true)
    expect(view.rows.some(row => row['rowid'] === id)).toBe(true)
    expect(session.hasPendingFieldEdits()).toBe(false); expect(writes()).toHaveLength(1)
  })

  it('keeps an omitted creation recoverable after readback, then explicitly accepts its absence without replay', async () => {
    const {session, view, add, owners, writes} = await setup({omitFieldWrite: true})
    const id = await add('total'), batch = owners()
    await expect(LowcodeDataSpaceFieldEdit.saveBatch(batch)).rejects.toThrow()
    expect(view.rows.some(row => row['rowid'] === id)).toBe(false)
    expect(session.getUnresolvedFieldIds('M1', 'modelFields')).toContain(id)
    expect(session.hasPendingFieldEdits()).toBe(true)
    await LowcodeDataSpaceFieldEdit.reloadBatch(batch, true)
    expect(session.getUnresolvedFieldIds('M1', 'modelFields')).toEqual([])
    expect(session.hasPendingFieldEdits()).toBe(false); expect(writes()).toHaveLength(1)
  })

  it('cancels a new input without discarding preceding new rows or edits', async () => {
    const {view, owner, owners, add, writes} = await setup()
    const id = await add('total'); owners(); view.updateEditingValue('PARENT', 'description', 'keep')
    owner.begin(); owner.input.updateEditingValue('draft', 'Name', 'cancel'); owner.cancel()
    expect(view.dirtyTracking.isPendingCreate(id)).toBe(true)
    expect(view.getEditingPatch('PARENT')).toEqual({description: 'keep'})
    expect(writes()).toEqual([])
  })

  it('combines a model edit and new fields without a separate submit path', async () => {
    const {session, owners, add, f, writes} = await setup()
    const model = session.getModelEdit('M1'); model.stage('description', 'model changed')
    await add('total')
    await model.save(owners())
    expect(writes()).toHaveLength(1)
    expect(f.modelRow()['description']).toBe('model changed')
    expect(f.created.get('Base_DataModel_Field')?.[0]?.['Name']).toBe('total')
  })

  it('rejects an immediate view before any creation and rolls back only its failed staged addition', async () => {
    const {view, owner, add, writes} = await setup()
    view.commitMode = 'immediate'
    expect(() => owner.begin()).toThrow('暂存提交模式'); view.commitMode = 'staged'
    const id = await add('total'), original = view.addRow.bind(view)
    vi.spyOn(view, 'addRow').mockImplementationOnce(async values => {await original(values); throw new Error('after staging')})
    await expect(add('tax')).rejects.toThrow('after staging')
    expect([...view.dirtyTracking.pendingCreateIds]).toEqual([id])
    expect(owner.input.getEditingRow('draft')?.['Name']).toBe('tax')
    expect(writes()).toEqual([])
  })

  it('rejects missing add permission, stale model scope and unrelated view edits before staging', async () => {
    const denied = await setup({allowFieldAdd: false})
    expect(() => denied.owner.begin()).toThrow('不允许新增')
    const {session, owner, view, writes} = await setup()
    owner.begin(); view.configure({queryContext: {dataSpaceId: 'A', modelId: 'M2'}})
    await expect(owner.stage()).rejects.toThrow('已变化')
    expect(writes()).toEqual([])
    expect(() => session.hasPendingFieldEdits()).toThrow('已变化')
  })

  it.each(['draft', 'scope', 'file'])('rechecks %s during combined validation without dispatching', async kind => {
    const {f, session, view, owners, add, writes} = await setup()
    const id = await add('total'), batch = owners(), release = f.holdDefinitionRead()
    const saving = LowcodeDataSpaceFieldEdit.saveBatch(batch), failure = expect(saving).rejects.toThrow()
    await flushPromises()
    if (kind === 'draft') view.updateEditingValue(id, 'AsName', 'later')
    if (kind === 'scope') f.invalidate()
    if (kind === 'file') f.stored.set('A', '{}')
    release(); await failure
    expect(writes()).toEqual([])
    if (kind !== 'scope') expect(session.hasPendingFieldEdits()).toBe(true)
  })
})

describe('workspace creation preserves independent model drafts', () => {
  it.each(['editing', 'applied', 'created', 'deleted'] as const)('saves a new field, model settings and source input while retaining another model %s', async mode => {
    const {f, session, view, owners, add, writes} = await setup({allowSourceEdit: true, allowDelete: true, sourceFields: [
      ...sourceFields,
      {rowid: 'I1', dataModelId: 'M1', Name: 'customer', type: 'inputParams', ValueFun: ''},
      {rowid: 'OTHER', dataModelId: 'M2', Name: 'total', type: 'dataModel', FieldType: 'string', IsPKey: 0, IsOutput: 1},
    ]}, f => f.setModelValues({Type: '接口'}))
    const directory = session.metadataDataSet.getView('Base_DataModel_Field', 'default')!
    const inputView = await session.loadSourceInputFields('M1'), inputs = session.getModelSourceInputs('M1')
    if (mode === 'created') await directory.addRow({rowid: 'OTHER_NEW', dataSetId: 'A', dataModelId: 'M2', Name: 'another', type: 'dataModel', FieldType: '计算字段', IsPKey: 0, IsOutput: 1})
    else if (mode === 'deleted') expect(await directory.removeRow('OTHER')).toBe(true)
    else {
      directory.updateEditingValue('OTHER', 'description', '其他模型未提交')
      if (mode === 'applied') expect((await directory.applyEditingRows(['OTHER'])).success).toBe(true)
    }
    const snapshot = () => JSON.stringify({rows: directory.rows, editing: directory.getEditingRow('OTHER'),
      changed: [...directory.dirtyTracking.dirtyRowIds], added: [...directory.dirtyTracking.pendingCreateIds], deleted: [...directory.dirtyTracking.pendingDeleteIds]})
    const original = snapshot()
    inputs[0]!.stage('{"Type":"GetConstValue","Value":0}')
    view.updateEditingValue('PARENT', 'description', '当前模型字段')
    const id = await add('total'), model = session.getModelEdit('M1')
    model.stage('description', '新增字段与模型属性')
    expect(writes()).toHaveLength(0)
    const start = f.requests.length
    await model.save(owners(), inputs)
    expect(writes()).toHaveLength(1)
    expect(JSON.stringify(writes()[0]?.data)).not.toContain('OTHER')
    expect(snapshot()).toBe(original)
    expect(inputView.getEditingRow('I1')?.['ValueFun']).toBe('{"Type":"GetConstValue","Value":0}')
    expect(model.getState().status).toBe('idle')
    const reads = f.requests.slice(start).filter(request => request.url?.endsWith('/GetData'))
    // 新增列仍核验字段结构；普通来源入参直接消费同批的原生回执。
    expect(reads).toHaveLength(1)
    for (const request of reads) expect(request.data).toMatchObject({Table: [{Name: 'Base_DataModel_Field', inputParams: expect.arrayContaining([{Name: 'modelId', Value: 'M1'}])}]})
    const reopened = await f.open('A'), freshFields = await reopened.loadModelFields('M1'), freshInputs = await reopened.loadSourceInputFields('M1')
    expect(freshFields.getEditingRow(id)).toMatchObject({Name: 'total', AsName: 'totalOutput'})
    expect(freshFields.getEditingRow('PARENT')?.['description']).toBe('当前模型字段')
    expect(freshInputs.getEditingRow('I1')?.['ValueFun']).toBe('{"Type":"GetConstValue","Value":0}')
    expect(reopened.getModelEdit('M1').read().fields.find(field => field.name === 'description')?.value).toBe('新增字段与模型属性')
    expect(snapshot()).toBe(original); expect(writes()).toHaveLength(1)
  })

  it.each(['editing', 'deleted'] as const)('still rejects a same-model field %s in another view', async mode => {
    const {session, owner, add, writes} = await setup({allowDelete: true})
    const directory = session.metadataDataSet.getView('Base_DataModel_Field', 'default')!
    if (mode === 'deleted') expect(await directory.removeRow('PARENT')).toBe(true)
    else directory.updateEditingValue('PARENT', 'AsName', 'totalOutput')
    await expect(add('total')).rejects.toThrow('其他字段视图仍有草稿')
    expect(owner.getState().status).toBe('idle')
    expect(writes()).toHaveLength(0)
    expect(mode === 'deleted' ? directory.dirtyTracking.isPendingDelete('PARENT') : directory.hasEditingChanges('PARENT')).toBe(true)
  })

  it('rejects a late same-model draft before dispatch and preserves the staged addition', async () => {
    const {session, view, add, writes} = await setup()
    const id = await add('total'), directory = session.metadataDataSet.getView('Base_DataModel_Field', 'default')!
    directory.updateEditingValue('PARENT', 'AsName', 'totalOutput')
    await expect(session.getModelEdit('M1').save([session.getFieldEdit(id, 'modelFields')])).rejects.toThrow('其他字段视图仍有草稿')
    expect(view.dirtyTracking.isPendingCreate(id)).toBe(true)
    expect(directory.hasEditingChanges('PARENT')).toBe(true)
    expect(writes()).toHaveLength(0)
  })
})
