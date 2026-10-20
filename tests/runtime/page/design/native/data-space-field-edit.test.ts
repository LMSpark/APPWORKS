import {afterEach, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest'
import {DOMWrapper, flushPromises, mount} from '@vue/test-utils'
import {createMemoryHistory, createRouter} from 'vue-router'
import ElementPlus, {ElTree, ElButton} from 'element-plus'
import {FieldValueFunction, FieldNumber, FieldSelect, FieldText, RendererForm, RendererButton, RendererDialog, RendererTabs, FilterValueFunctionDialog, Spark, registerAllRenderers} from '@spark-appworks/spark-component'
import {dataSpacePageFixture, designPageHost} from './data-space-page.fixture'
import {openLowcodeDataSpaceDesignSession} from '@/lowcode/data-space/lowcode-data-space-design'
import DataSpaceDesignPage from '@/views/features/data-platform/data-set-management/design/ui/data-set-design-page.vue'
import {fieldEditReloadBatch, fieldEditSaveBatch, fieldEditStageOutputBatch} from '@/lowcode/data-space/model-source/field-edit/lowcode-data-space-field-edit-session'
import {createDynamicRouter} from '../../../../../packages/spark-app/src/router/dynamic'

vi.mock('@/lowcode/data-space/lowcode-data-space-design', () => ({openLowcodeDataSpaceDesignSession: vi.fn()}))
const fixtures: ReturnType<typeof dataSpacePageFixture>[] = []
const wrappers: ReturnType<typeof mount>[] = []
beforeAll(() => registerAllRenderers())
beforeEach(() => {vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})})
afterEach(() => {wrappers.splice(0).forEach(wrapper => wrapper.unmount()); fixtures.splice(0).forEach(f => f.dispose()); vi.unstubAllGlobals()})
const originalFields = [
  {rowid: 'PK', dataModelId: 'M1', Name: 'rowid', type: 'dataModel', FieldType: 'string', IsPKey: 1, IsOutput: 1},
  {rowid: 'PARENT', dataModelId: 'M1', Name: 'parentId', type: 'dataModel', FieldType: 'string', IsPKey: 0, IsOutput: 1},
  {rowid: 'AMOUNT', dataModelId: 'M1', Name: 'amount', type: 'dataModel', FieldType: 'number', IsPKey: 0, IsOutput: 1,
    description: '原金额', OrderType: '', Order: 0, Group: 0, ValueFun: ' {"Type":"GetConstValue","Value":0} ', Expression: '保留原配置'},
]
function fixture(options: Parameters<typeof dataSpacePageFixture>[0] = {}) {
  const f = dataSpacePageFixture({sourceFields: originalFields, editableFieldProperties: ['description', 'OrderType', 'Order', 'Group'], ...options})
  fixtures.push(f); vi.mocked(openLowcodeDataSpaceDesignSession).mockImplementation(f.open)
  return f
}

describe('complete model column save validation', () => {
  it.each(['default', 'modelFields'] as const)('rejects non-output alias collisions through %s and allows cancellation', async viewId => {
    const f = fixture({overviewOnly: viewId === 'modelFields', editableFieldProperties: ['AsName'],
      sourceFields: originalFields.map(row => row.rowid === 'PK' ? row : {...row, IsOutput: 0})})
    f.stored.set('A', JSON.stringify({scenarioId: 'A', tables: {OrdersAlias: {modelBinding: {modelId: 'M1', modelName: 'Orders'},
      columns: [{name: 'localTotal', type: 'number', computeExpression: '1'}], views: {default: {}}}}}))
    const session = await f.open('A'), fields = viewId === 'modelFields' ? await session.loadModelFields('M1') : session.metadataDataSet.getView('Base_DataModel_Field')!
    const owner = session.getFieldEdit('AMOUNT', viewId), originalFile = f.stored.get('A')
    for (const [alias, message] of [['parentId', '重复'], ['localTotal', '本地计算'], ['_pk', '保留字段']]) {
      fields.updateEditingValue('AMOUNT', 'AsName', alias)
      await expect(owner.save()).rejects.toThrow(message)
      expect(fields.getEditingPatch('AMOUNT')?.['AsName']).toBe(alias)
      owner.discard()
      expect(fields.hasEditingChanges()).toBe(false)
    }
    expect(f.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toEqual([])
    expect(f.fileWrites).toEqual([]); expect(f.stored.get('A')).toBe(originalFile)
  })

  it.each((['default', 'modelFields'] as const).flatMap(viewId => [false, true].map(clearAlias => ({viewId, clearAlias}))))('protects a non-output native relation column rename through $viewId; clearAlias=$clearAlias', async ({viewId, clearAlias}) => {
    const f = fixture({overviewOnly: viewId === 'modelFields', editableFieldProperties: ['AsName'],
      sourceFields: originalFields.map(row => row.rowid === 'AMOUNT' ? {...row, IsOutput: 0, AsName: clearAlias ? 'amountAlias' : ''} : row)})
    const configuration = {schemaVersion: 2, scenarioId: 'A', tables: {OrdersAlias: {modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {default: {}}}},
      resourceRelations: [{relationId: 'R', parentTable: 'OrdersAlias', childTable: 'OrdersAlias',
        filterExpression: {field: 'parentId', operator: 'eq', value: {Type: 'GetTableField', Field: clearAlias ? 'amountAlias' : 'amount'}}}]}
    f.stored.set('A', JSON.stringify(configuration))
    const session = await f.open('A'), fields = viewId === 'modelFields' ? await session.loadModelFields('M1') : session.metadataDataSet.getView('Base_DataModel_Field')!
    const owner = session.getFieldEdit('AMOUNT', viewId)
    fields.updateEditingValue('AMOUNT', 'AsName', clearAlias ? '' : 'renamed')
    await expect(owner.save()).rejects.toThrow('resourceRelations[0]')
    owner.discard()
    expect(f.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toEqual([])
    expect(f.stored.get('A')).toBe(JSON.stringify(configuration)); expect(f.fileWrites).toEqual([])
  })

  it('keeps a native model relation when only output is disabled and reopens the full column', async () => {
    const f = fixture({editableFieldProperties: ['IsOutput']})
    const configuration = {schemaVersion: 2, scenarioId: 'A', tables: {OrdersAlias: {modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {default: {}}}},
      resourceRelations: [{relationId: 'R', parentTable: 'OrdersAlias', childTable: 'OrdersAlias',
        filterExpression: {field: 'parentId', operator: 'eq', value: {Type: 'GetTableField', Field: 'amount'}}}]}
    f.stored.set('A', JSON.stringify(configuration))
    const session = await f.open('A'), fields = session.metadataDataSet.getView('Base_DataModel_Field')!
    fields.updateEditingValue('AMOUNT', 'IsOutput', 0)
    await session.getFieldEdit('AMOUNT').save()
    const reopened = await f.open('A'); await reopened.loadDefinition()
    const table = reopened.definitionDataSet!.getTable('OrdersAlias')!
    expect(table.columns.some(column => column.name === 'amount')).toBe(true)
    expect(table.getOrCreateView('default').fieldProjection.find(column => column.fieldId === 'AMOUNT')?.output).toBe(false)
    expect(reopened.definitionDataSet!.resourceRelations?.[0]?.filterExpression).toEqual(configuration.resourceRelations[0]!.filterExpression)
    expect(f.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toHaveLength(1)
    expect(f.fileWrites).toEqual([]); expect(f.stored.get('A')).toBe(JSON.stringify(configuration))
  })

  it('saves an unused non-output alias and reopens it without widening output', async () => {
    const {f, owner, fields, writes} = await setup({editableFieldProperties: ['AsName'],
      sourceFields: originalFields.map(row => row.rowid === 'AMOUNT' ? {...row, IsOutput: 0} : row)})
    fields.updateEditingValue('AMOUNT', 'AsName', 'renamed')
    await owner.save()
    const reopened = await f.open('A'); await reopened.loadDefinition()
    const table = reopened.definitionDataSet!.getTable('OrdersAlias')!
    expect(table.columns.some(column => column.name === 'renamed')).toBe(true)
    expect(table.columns.some(column => column.name === 'amount')).toBe(false)
    expect(table.getOrCreateView('default').fieldProjection.find(column => column.fieldId === 'AMOUNT')?.output).toBe(false)
    expect(writes()).toHaveLength(1); expect(f.fileWrites).toEqual([])
  })
})
async function setup(options: Parameters<typeof dataSpacePageFixture>[0] = {}) {
  const f = fixture(options), session = await f.open('A')
  return {f, session, fields: session.metadataDataSet.getView('Base_DataModel_Field', 'default')!,
    owner: session.getFieldEdit('AMOUNT'), writes: () => f.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')}
}
async function page() {
  const router = createRouter({history: createMemoryHistory(), routes: []})
  const dynamic = createDynamicRouter({router, pageComponent: designPageHost(DataSpaceDesignPage), componentMap: {'/data-space-design': designPageHost(DataSpaceDesignPage)},
    loadNavigation: async () => ({id: 'root', title: 'Root', childPlacement: 'header',
      items: [{id: 'design', title: '数据空间设计', path: '/data-space-design', itemKind: 'system-page'}]})})
  await dynamic.registerRoutes()
  await router.push('/data-space-design?scenarioId=A')
  const instance = dynamic.getSystemPageInstance(router.currentRoute.value)!
  const wrapper = mount(instance.view, {attachTo: document.body, global: {plugins: [router, ElementPlus, Spark.createPlugin()], stubs: {SparkComponentRenderer: false, 'spark-component-renderer': false, 'el-button': ElButton, JsonTreeEditor: true}}})
  wrappers.push(wrapper); await flushPromises()
  return wrapper
}
async function select(wrapper: ReturnType<typeof mount>, label: string) {
  const tree = wrapper.getComponent(ElTree)
  const target = tree.vm.store._getAllNodes().find(node => node.label === label)
  const parents = []
  for (let parent = target?.parent; parent?.level; parent = parent.parent) parents.unshift(parent)
  for (const parent of parents) if (!parent.expanded) {
    const button = wrapper.findAll('[data-design-node]').find(item => item.attributes('data-design-node') === parent.key)
    const arrow = button?.element.closest('.el-tree-node__content')?.querySelector('.el-tree-node__expand-icon')
    if (!arrow) throw new Error(`missing parent ${parent.label}`)
    await new DOMWrapper(arrow).trigger('click'); await flushPromises()
  }
  const node = wrapper.findAll('[data-design-node]').find(item => item.text() === label)
  if (!node) throw new Error(`missing node ${label}`)
  await node.trigger('click'); await flushPromises()
}

describe('formal field configuration maintenance', () => {
  it.each((['ValueFun', 'OrderType', 'AsName'] as const).flatMap(field => (['default', 'modelFields'] as const).map(viewId => ({field, viewId}))))('confirms a cleared $field returned as null through $viewId and reopens without resubmission', async ({field, viewId}) => {
    const sourceFields: Record<string, unknown>[] = originalFields.map(row => ({...row}))
    if (field === 'OrderType') sourceFields[2]![field] = 'descending'
    if (field === 'AsName') sourceFields[2]![field] = 'previousAlias'
    // Keep the real batch receipt/query chain; the server's stored clear differs from the submitted empty text.
    const f = fixture({sourceFields, overviewOnly: viewId === 'modelFields', editableFieldProperties: [field], omitFieldProperties: [field]})
    const session = await f.open('A')
    const fields = viewId === 'modelFields' ? await session.loadModelFields('M1') : session.metadataDataSet.getView('Base_DataModel_Field', viewId)!
    const owner = session.getFieldEdit('AMOUNT', viewId), initial = fields.rows.find(row => row['rowid'] === 'AMOUNT')?.[field]
    const stage = () => field === 'ValueFun' ? owner.stageValueFunction('') : fields.updateEditingValue('AMOUNT', field, '')
    stage(); owner.discard()
    expect(fields.rows.find(row => row['rowid'] === 'AMOUNT')?.[field]).toBe(initial)
    expect(f.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toHaveLength(0)
    const release = f.holdModelResponse()
    stage()
    const saving = owner.save().catch((cause: unknown) => cause)
    await vi.waitFor(() => expect(f.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toHaveLength(1))
    sourceFields[2]![field] = null
    release()
    expect(await saving).toBeUndefined()
    expect(owner.getState()).toEqual({status: 'idle', pending: false})
    expect(fields.rows.find(row => row['rowid'] === 'AMOUNT')?.[field]).toBeNull()
    const reopened = await f.open('A')
    const reloaded = viewId === 'modelFields' ? await reopened.loadModelFields('M1') : reopened.metadataDataSet.getView('Base_DataModel_Field', viewId)!
    expect(reloaded.rows.find(row => row['rowid'] === 'AMOUNT')?.[field]).toBeNull()
    expect(reopened.getFieldEdit('AMOUNT', viewId).getState()).toEqual({status: 'idle', pending: false})
    expect(f.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toHaveLength(1)
    expect(f.fileWrites).toEqual([])
    if (viewId === 'modelFields') {
      expect(session.metadataDataSet.getView('Base_DataModel_Field', 'default')?.rows).toEqual([])
      expect(session.metadataDataSet.getView('Base_DataModel_Relation', 'default')?.rows).toEqual([])
    }
  })

  it.each(['ValueFun', 'OrderType', 'AsName'].flatMap(field => ['missing', 'hidden', 'number', 'boolean', 'whitespace', 'nonempty', 'other-field'].map(mismatch => ({field, mismatch}))))('does not accept $mismatch as confirmation of a cleared $field', async ({field, mismatch}) => {
    const sourceFields: Record<string, unknown>[] = originalFields.map(row => ({...row})), hidden: string[] = []
    if (field === 'OrderType') sourceFields[2]![field] = 'descending'
    if (field === 'AsName') sourceFields[2]![field] = 'previousAlias'
    const f = fixture({sourceFields, hiddenFieldProperties: hidden, editableFieldProperties: [field, 'Group'], omitFieldProperties: [field, 'Group']})
    const session = await f.open('A'), owner = session.getFieldEdit('AMOUNT')
    if (field === 'ValueFun') owner.stageValueFunction('')
    else session.metadataDataSet.getView('Base_DataModel_Field')!.updateEditingValue('AMOUNT', field, '')
    if (mismatch === 'other-field') session.metadataDataSet.getView('Base_DataModel_Field')!.updateEditingValue('AMOUNT', 'Group', 1)
    const release = f.holdModelResponse(), saving = owner.save().catch((cause: unknown) => cause)
    await vi.waitFor(() => expect(f.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toHaveLength(1))
    sourceFields[2]![field] = mismatch === 'number' ? 0 : mismatch === 'boolean' ? false : mismatch === 'whitespace' ? ' ' : mismatch === 'nonempty' ? field === 'ValueFun' ? initialValueFunction : 'descending' : null
    if (mismatch === 'missing') delete sourceFields[2]![field]
    if (mismatch === 'hidden') hidden.push(field)
    release()
    expect(await saving).toBeInstanceOf(Error)
    expect(owner.getState().status).toBe('readback')
    await expect(owner.save()).rejects.toThrow('先核验')
    expect(f.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toHaveLength(1)
  })

  const initialValueFunction = '{"Type":"GetConstValue","Value":0}'

  it.each(['ValueFun', 'OrderType', 'AsName'])('verifies a lost cleared %s receipt without replaying the write', async field => {
    const sourceFields: Record<string, unknown>[] = originalFields.map(row => ({...row}))
    if (field === 'OrderType') sourceFields[2]![field] = 'descending'
    if (field === 'AsName') sourceFields[2]![field] = 'previousAlias'
    const f = fixture({sourceFields, editableFieldProperties: [field], omitFieldProperties: [field]})
    const session = await f.open('A'), owner = session.getFieldEdit('AMOUNT')
    const release = f.holdModelResponse()
    if (field === 'ValueFun') owner.stageValueFunction('')
    else session.metadataDataSet.getView('Base_DataModel_Field')!.updateEditingValue('AMOUNT', field, '')
    f.loseNextResponse()
    const saving = owner.save().catch((cause: unknown) => cause)
    await vi.waitFor(() => expect(f.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toHaveLength(1))
    sourceFields[2]![field] = null; release()
    expect(await saving).toBeInstanceOf(Error)
    expect(owner.getState().status).toBe('unknown')
    await expect(owner.save()).rejects.toThrow('先核验')
    await owner.reload(owner.getState().pending)
    expect(owner.getState()).toEqual({status: 'idle', pending: false})
    expect(session.metadataDataSet.getView('Base_DataModel_Field')?.rows.find(row => row['rowid'] === 'AMOUNT')?.[field]).toBeNull()
    expect(f.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toHaveLength(1)
  })

  it.each(['api', 'crudConfig', 'both'])('saves field aliases and output flags with static %s settings, preserving the request configuration', async kind => {
    const api = {list: {url: '/api/DataOperation/GetData', method: 'POST',
      headers: {'X-View-Note': 'amount'}, params: {note: 'amount', nested: {field: 'amount'}}}}
    const crudConfig = {timeout: 12000, retryCount: 0, validateData: true}
    const f = fixture({overviewOnly: true, editableFieldProperties: ['AsName', 'IsOutput'],
      businessRows: {Orders: [{rowid: 'R1', parentId: '', amountOutput: 12}]}})
    const configuration = JSON.stringify({scenarioId: 'A', tables: {
      OrdersAlias: {modelBinding: {modelId: 'M1', modelName: 'Orders'},
        ...(kind === 'crudConfig' ? {} : {api}), ...(kind === 'api' ? {} : {crudConfig}), views: {default: {}}},
    }})
    f.stored.set('A', configuration)
    const session = await f.open('A'), fields = await session.loadModelFields('M1'), owner = session.getFieldEdit('AMOUNT', 'modelFields')
    fields.updateEditingValue('AMOUNT', 'AsName', 'discardedAlias'); owner.discard()
    expect(fields.getEditingPatch('AMOUNT')).toBeUndefined()
    fields.updateEditingValue('AMOUNT', 'AsName', 'amountOutput')
    await owner.save()
    expect(fields.rows.find(row => row['rowid'] === 'AMOUNT')).toMatchObject({Name: 'amount', AsName: 'amountOutput', IsOutput: 1})
    const reopened = await f.open('A'), reloaded = await reopened.loadModelFields('M1')
    const preview = await reopened.openPreview({modelId: 'M1', modelName: 'Orders', tableName: 'OrdersAlias', viewId: 'default'})
    await preview.refresh()
    expect(preview.view.columns.map(column => column.name)).toContain('amountOutput')
    expect(preview.view.rows).toEqual([expect.objectContaining({rowid: 'R1', amountOutput: 12})])
    preview.dispose()
    reloaded.updateEditingValue('AMOUNT', 'IsOutput', 0)
    await reopened.getFieldEdit('AMOUNT', 'modelFields').save()
    const final = await f.open('A'), finalFields = await final.loadModelFields('M1')
    expect(finalFields.rows.find(row => row['rowid'] === 'AMOUNT')).toMatchObject({Name: 'amount', AsName: 'amountOutput', IsOutput: 0})
    const hidden = await final.openPreview({modelId: 'M1', modelName: 'Orders', tableName: 'OrdersAlias', viewId: 'default'})
    expect(hidden.view.columns.map(column => column.name)).not.toContain('amountOutput')
    hidden.dispose()
    expect(f.stored.get('A')).toBe(configuration); expect(f.fileWrites).toEqual([])
    expect(f.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toHaveLength(2)
  })

  it('keeps actual view field dependencies when static request configuration is present', async () => {
    const f = fixture({overviewOnly: true, editableFieldProperties: ['AsName']})
    f.stored.set('A', JSON.stringify({scenarioId: 'A', tables: {
      OrdersAlias: {modelBinding: {modelId: 'M1', modelName: 'Orders'}, api: {list: {url: '/api/DataOperation/GetData'}},
        crudConfig: {timeout: 12000}, views: {default: {labelField: 'amount'}}},
    }}))
    const session = await f.open('A'), fields = await session.loadModelFields('M1')
    fields.updateEditingValue('AMOUNT', 'AsName', 'amountOutput')
    await expect(session.getFieldEdit('AMOUNT', 'modelFields').save()).rejects.toThrow('views.default.labelField')
    expect(fields.getEditingPatch('AMOUNT')?.['AsName']).toBe('amountOutput')
    expect(f.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toHaveLength(0)
    expect(f.fileWrites).toEqual([])
  })

  it('saves an output alias despite unrelated computed columns and preserves the file on reopen', async () => {
    const f = fixture({overviewOnly: true, editableFieldProperties: ['AsName'], sourceFields: [
      ...originalFields,
      {rowid: 'C_PK', dataModelId: 'M2', Name: 'rowid', type: 'dataModel', FieldType: 'string', IsPKey: 1, IsOutput: 1},
      {rowid: 'C_AMOUNT', dataModelId: 'M2', Name: 'amount', type: 'dataModel', FieldType: 'number', IsPKey: 0, IsOutput: 1},
    ], businessRows: {Orders: [{rowid: 'R1', parentId: '', amountOutput: 12}]}})
    const text = JSON.stringify({scenarioId: 'A', tables: {
      OrdersAlias: {modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {default: {}}},
      CustomerAlias: {modelBinding: {modelId: 'M2', modelName: 'Customers'},
        columns: [{name: 'display', type: 'string', computeExpression: "amount || '-'"}], views: {default: {}}},
    }})
    f.stored.set('A', text)
    const session = await f.open('A'), fields = await session.loadModelFields('M1')
    fields.updateEditingValue('AMOUNT', 'AsName', 'amountOutput')
    await session.getFieldEdit('AMOUNT', 'modelFields').save()
    expect(fields.rows.find(row => row['rowid'] === 'AMOUNT')?.['AsName']).toBe('amountOutput')
    expect(session.metadataDataSet.getView('Base_DataModel_Field', 'default')?.rows).toEqual([])
    expect(session.metadataDataSet.getView('Base_DataModel_Relation', 'default')?.rows).toEqual([])
    expect(f.stored.get('A')).toBe(text); expect(f.fileWrites).toEqual([])
    const reopened = await f.open('A'), reloadedFields = await reopened.loadModelFields('M1')
    expect(reloadedFields.rows.find(row => row['rowid'] === 'AMOUNT')?.['AsName']).toBe('amountOutput')
    const preview = await reopened.openPreview({modelId: 'M1', modelName: 'Orders', tableName: 'OrdersAlias', viewId: 'default'})
    await preview.refresh()
    expect(preview.view.columns.map(column => column.name)).toContain('amountOutput')
    expect(preview.view.rows).toEqual([expect.objectContaining({rowid: 'R1', amountOutput: 12})])
    preview.dispose()
    expect(f.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toHaveLength(1)
  })

  it.each(['same-model', 'second-binding', 'direct-parent', 'legacy-aggregate'])('keeps %s computed-column dependencies before saving an output alias', async scope => {
    const f = fixture({overviewOnly: true, editableFieldProperties: ['AsName'], sourceFields: [
      ...originalFields,
      {rowid: 'C_PK', dataModelId: 'M2', Name: 'rowid', type: 'dataModel', FieldType: 'string', IsPKey: 1, IsOutput: 1},
    ]})
    const local = [{name: 'display', type: 'number', computeExpression: scope === 'direct-parent' || scope === 'legacy-aggregate'
      ? "$sum('OrdersAlias', ctx.field || 'amount')" : 'amount * 2'}]
    f.stored.set('A', JSON.stringify({scenarioId: 'A', ...(scope === 'legacy-aggregate' ? {} : {schemaVersion: 2}), tables: {
      OrdersAlias: {modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {default: {}}, ...(scope === 'same-model' ? {columns: local} : {})},
      OtherAlias: {modelBinding: scope === 'second-binding' ? {modelId: 'M1', modelName: 'Orders'} : {modelId: 'M2', modelName: 'Customers'},
        views: {default: {}}, ...(scope !== 'same-model' ? {columns: local} : {})},
    }, ...(scope === 'direct-parent' ? {resourceRelations: [{relationId: 'orders', parentTable: 'OtherAlias', childTable: 'OrdersAlias',
      filterExpression: {field: 'parentId', operator: 'eq', value: {Type: 'GetTableField', Field: 'rowid'}}}]} : {})}))
    const session = await f.open('A'), fields = await session.loadModelFields('M1')
    fields.updateEditingValue('AMOUNT', 'AsName', 'amountOutput')
    await expect(session.getFieldEdit('AMOUNT', 'modelFields').save()).rejects.toThrow('computeExpression')
    expect(fields.getEditingPatch('AMOUNT')?.['AsName']).toBe('amountOutput')
    expect(f.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toHaveLength(0)
    expect(f.fileWrites).toEqual([])
  })

  it.each(['ValueFun', 'AsName'])('saves model-scoped %s and reopens without reading all field or relation records', async property => {
    const f = fixture({overviewOnly: true, editableFieldProperties: [property], allowFieldEdit: true})
    const session = await f.open('A'), view = await session.loadModelFields('M1')
    const owner = session.getFieldEdit('AMOUNT', 'modelFields')
    const value = property === 'ValueFun' ? '{"Type":"GetTableField","Field":"parentId"}' : 'amountOutput'
    if (property === 'ValueFun') owner.stageValueFunction(value)
    else view.updateEditingValue('AMOUNT', property, value)
    await owner.save()
    expect(view.rows.find(row => row['rowid'] === 'AMOUNT')?.[property]).toBe(value)
    expect(session.metadataDataSet.getView('Base_DataModel_Field', 'default')?.rows).toEqual([])
    expect(session.metadataDataSet.getView('Base_DataModel_Relation', 'default')?.rows).toEqual([])
    const reopened = await f.open('A'), fields = await reopened.loadModelFields('M1')
    expect(fields.rows.find(row => row['rowid'] === 'AMOUNT')?.[property]).toBe(value)
    expect(f.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toHaveLength(1)
    expect(f.fileWrites).toEqual([])
  })

  const computedFields = (alias = '') => originalFields.map(row => row.rowid === 'AMOUNT'
    ? {...row, FieldType: '计算字段', AsName: alias, Expression: '', ValueFun: '{"Type":"GetConstValue","Value":"amount"}'} : {...row})

  it.each(['hide', 'rename'] as const)('saves %s from an overview workspace without loading default catalogs and reopens the result', async action => {
    const f = fixture({overviewOnly: true, editableFieldProperties: ['Name', 'IsOutput'], sourceFields: computedFields()})
    const session = await f.open('A'), fields = await session.loadModelFields('M1')
    const owner = session.getFieldEdit('AMOUNT', 'modelFields'), property = action === 'hide' ? 'IsOutput' : 'Name'
    const value = action === 'hide' ? 0 : 'subtotal'
    fields.updateEditingValue('AMOUNT', property, value)
    owner.discard()
    expect(fields.getEditingRow('AMOUNT')?.[property]).toBe(action === 'hide' ? 1 : 'amount')
    fields.updateEditingValue('AMOUNT', property, value)
    await owner.save()
    expect(fields.rows.find(row => row['rowid'] === 'AMOUNT')?.[property]).toBe(value)
    expect(session.metadataDataSet.getView('Base_DataModel_Field', 'default')?.rows).toEqual([])
    expect(session.metadataDataSet.getView('Base_DataModel_Relation', 'default')?.rows).toEqual([])
    const reopened = await f.open('A'), reloaded = await reopened.loadModelFields('M1')
    expect(reloaded.rows.find(row => row['rowid'] === 'AMOUNT')?.[property]).toBe(value)
    expect(f.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toHaveLength(1)
    expect(f.fileWrites).toEqual([])
  })

  it('checks a remote relation before hiding output from an overview workspace and preserves the draft', async () => {
    const relationRows: Record<string, unknown>[] = []
    const f = fixture({overviewOnly: true, editableFieldProperties: ['IsOutput'], relationRows})
    const session = await f.open('A'), fields = await session.loadModelFields('M1')
    fields.updateEditingValue('AMOUNT', 'IsOutput', 0)
    relationRows.push({rowid: 'R', dataSetId: 'A', parentModId: 'M1', childModId: 'M2',
      filter: '{"Type":"cond","Field":"parentId","Operator":"equal","ValueFun":{"Type":"GetTableField","Field":"amount"}}'})
    await expect(session.getFieldEdit('AMOUNT', 'modelFields').save()).rejects.toThrow('Base_DataModel_Relation(R).filter')
    expect(fields.getEditingRow('AMOUNT')?.['IsOutput']).toBe(0)
    expect(fields.hasEditingChanges()).toBe(true)
    expect(f.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toEqual([])
    expect(session.metadataDataSet.getView('Base_DataModel_Relation', 'default')?.rows).toEqual([])
  })

  it('renames a computed field through the original bound control and reopens the same field ID', async () => {
    const f = fixture({editableFieldProperties: ['Name'], sourceFields: computedFields().map(row => ({...row, Expression: 'amount'}))}), wrapper = await page()
    await select(wrapper, 'amount')
    const control = wrapper.findAllComponents(FieldText).find(item => item.props('field') === 'Name')
    expect(control).toBeDefined(); expect(control!.props('modelValue')).toBeUndefined()
    const fields = f.sessions[0]!.metadataDataSet.getView('Base_DataModel_Field', 'default')!
    await control!.get('input').setValue('subtotal'); await flushPromises()
    expect(fields.getEditingRow('AMOUNT')?.['Name']).toBe('subtotal')
    await wrapper.get('[data-action="cancel-field"]').trigger('click'); await flushPromises()
    expect(control!.get('input').element.value).toBe('amount')
    await control!.get('input').setValue('subtotal'); await flushPromises()
    await wrapper.get('[data-action="save-field"]').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('本次字段配置已保存')
    const reopened = await f.open('A')
    expect(reopened.metadataDataSet.getView('Base_DataModel_Field')?.rows.find(row => row['rowid'] === 'AMOUNT'))
      .toMatchObject({Name: 'subtotal', AsName: '', FieldType: '计算字段', ValueFun: '{"Type":"GetConstValue","Value":"amount"}', Expression: 'amount'})
    expect(reopened.metadataDataSet.getView('Base_DataModel_Field')?.rows.every(row => row['Expression'] === 'amount')).toBe(true)
    expect(reopened.definitionDataSet?.getTable('OrdersAlias')?.columns.map(column => column.name)).toContain('subtotal')
    expect(f.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toHaveLength(1)
    expect(f.fileWrites).toHaveLength(0)
  })

  it.each(['stable', ''])('checks computed name changes against the actual output alias %j', async alias => {
    const f = fixture({editableFieldProperties: ['Name'], sourceFields: computedFields(alias)})
    f.stored.set('A', JSON.stringify({scenarioId: 'A', tables: {OrdersAlias: {
      modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {default: {labelField: alias || 'amount'}},
    }}}))
    const session = await f.open('A'), fields = session.metadataDataSet.getView('Base_DataModel_Field')!
    fields.updateEditingValue('AMOUNT', 'Name', 'subtotal')
    if (alias) {
      await session.getFieldEdit('AMOUNT').save()
      expect((await f.open('A')).definitionDataSet?.getTable('OrdersAlias')?.columns.map(column => column.name)).toContain('stable')
    } else {
      await expect(session.getFieldEdit('AMOUNT').save()).rejects.toThrow('labelField')
      expect(f.requests.some(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(false)
    }
    expect(f.fileWrites).toHaveLength(0)
  })

  it.each(['', '_pk', ' new ', 'parentId'])('rejects an invalid or duplicate computed field name: %j', async name => {
    const {owner, fields, writes} = await setup({editableFieldProperties: ['Name'], sourceFields: computedFields('stable')})
    fields.updateEditingValue('AMOUNT', 'Name', name)
    await expect(owner.save()).rejects.toThrow('名称')
    expect(writes()).toHaveLength(0)
  })

  it.each(['self', 'other', 'relation'])('diagnoses the %s reference before renaming a computed field', async usage => {
    const sourceFields = computedFields('stable')
    if (usage === 'self') sourceFields[2]!.ValueFun = '{"Type":"GetTableField","Field":"amount"}'
    if (usage === 'other') sourceFields[1]!.ValueFun = '{"Type":"GetTableField","Field":"amount"}'
    if (usage === 'relation') sourceFields.push({...originalFields[1]!, rowid: 'CHILD_PARENT', dataModelId: 'M2'})
    const relationRows = usage === 'relation' ? [{rowid: 'R', dataSetId: 'A', parentModId: 'M1', childModId: 'M2',
      filter: '{"Type":"cond","Field":"parentId","Operator":"equal","ValueFun":{"Type":"GetTableField","Field":"amount"}}'}] : []
    const {owner, fields, writes} = await setup({editableFieldProperties: ['Name'], sourceFields, relationRows})
    fields.updateEditingValue('AMOUNT', 'Name', 'subtotal')
    await expect(owner.save()).rejects.toThrow(usage === 'relation' ? 'Base_DataModel_Relation(R).filter.ValueFun' : 'ValueFun')
    expect(fields.hasEditingChanges('AMOUNT')).toBe(true); expect(writes()).toHaveLength(0)
  })

  it('recovers a lost computed rename response without repeating the write', async () => {
    const {f, owner, fields, writes} = await setup({editableFieldProperties: ['Name'], sourceFields: computedFields('stable')})
    fields.updateEditingValue('AMOUNT', 'Name', 'subtotal'); f.loseNextResponse()
    await expect(owner.save()).rejects.toThrow()
    expect(owner.getState().status).toBe('unknown')
    await owner.reload(owner.getState().pending)
    expect(owner.getState()).toEqual({status: 'idle', pending: false})
    expect(fields.rows.find(row => row['rowid'] === 'AMOUNT')?.['Name']).toBe('subtotal')
    fields.updateEditingValue('AMOUNT', 'Name', 'total'); await owner.save()
    expect(writes()).toHaveLength(2)
  })

  it('keeps parameter names separate from formal field references while changing a computed name and alias', async () => {
    const sourceFields = computedFields('stable')
    sourceFields[2]!.ValueFun = '{"Type":"GetTableField","Field":"parentId"}'
    sourceFields.push({...originalFields[1]!, rowid: 'INPUT_PARENT', type: 'inputParams'})
    const {f, owner, fields, writes} = await setup({editableFieldProperties: ['Name', 'AsName'], sourceFields})
    fields.updateEditingValue('AMOUNT', 'Name', 'subtotal'); fields.updateEditingValue('AMOUNT', 'AsName', '')
    await owner.save()
    const reopened = await f.open('A')
    expect(reopened.definitionDataSet?.getTable('OrdersAlias')?.columns.map(column => column.name)).toContain('subtotal')
    expect(fields.rows.find(row => row['rowid'] === 'INPUT_PARENT')?.['Name']).toBe('parentId')
    expect(writes()).toHaveLength(1)
  })

  it.each(['draft', 'permission', 'formal', 'file'])('rejects %s changes before dispatching a computed rename', async change => {
    const sourceFields = computedFields('stable')
    const {f, owner, fields, writes} = await setup({editableFieldProperties: ['Name'], sourceFields})
    const release = f.holdDefinitionRead()
    fields.updateEditingValue('AMOUNT', 'Name', 'subtotal')
    const pending = owner.save().catch((cause: unknown) => cause)
    try {
      if (change === 'draft') fields.updateEditingValue('AMOUNT', 'Name', 'newer')
      if (change === 'permission') {
        f.denyFieldProperty('Name'); fields.discardEditingRows(['AMOUNT']); await fields.loadFromServer({allPages: true})
        fields.updateEditingValue('AMOUNT', 'Name', 'subtotal')
      }
      if (change === 'formal') sourceFields[2]!.Name = 'otherName'
      if (change === 'file') f.stored.set('A', `${f.stored.get('A')!} `)
    } finally {release()}
    expect(await pending).toBeInstanceOf(Error); expect(writes()).toHaveLength(0)
  })

  it.each(['self', 'other', 'new'])('refuses a computed rename after a new %s source reference appeared remotely', async kind => {
    const sourceFields = computedFields('stable')
    const {owner, fields, writes} = await setup({editableFieldProperties: ['Name'], sourceFields})
    if (kind === 'self') sourceFields[2]!.ValueFun = '{"Type":"GetTableField","Field":"amount"}'
    if (kind === 'other') sourceFields[1]!.ValueFun = '{"Type":"GetTableField","Field":"amount"}'
    if (kind === 'new') sourceFields.push({...sourceFields[2]!, rowid: 'NEW_CALC', Name: 'newCalculation', AsName: 'newOutput',
      ValueFun: '{"Type":"GetTableField","Field":"amount"}'})
    fields.updateEditingValue('AMOUNT', 'Name', 'subtotal')
    await expect(owner.save()).rejects.toThrow('正式字段定义已变化')
    expect(writes()).toHaveLength(0)
  })

  it('edits the formal type through a standard bound field, cancels, saves and rebuilds native columns', async () => {
    const f = fixture({editableFieldProperties: ['FieldType']}), wrapper = await page()
    await select(wrapper, 'amount')
    const fields = f.sessions[0]!.metadataDataSet.getView('Base_DataModel_Field', 'default')!
    const control = wrapper.findAllComponents(FieldText).find(item => item.props('field') === 'FieldType')
    expect(control).toBeDefined()
    expect(control!.props('modelValue')).toBeUndefined()
    await control!.get('input').setValue('decimal'); await flushPromises()
    expect(fields.getEditingRow('AMOUNT')?.['FieldType']).toBe('decimal')
    await wrapper.get('[data-action="cancel-field"]').trigger('click'); await flushPromises()
    expect(control!.get('input').element.value).toBe('number')
    await control!.get('input').setValue('decimal'); await flushPromises()
    await wrapper.get('[data-action="save-field"]').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('本次字段配置已保存')
    expect(fields.rows.find(row => row['rowid'] === 'AMOUNT')).toMatchObject({Name: 'amount', FieldType: 'decimal', IsPKey: 0})
    const reopened = await f.open('A')
    expect(reopened.definitionDataSet?.getTable('OrdersAlias')?.columns.find(column => column.name === 'amount')?.type).toBe('decimal')
    expect(f.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toHaveLength(1)
    expect(f.fileWrites).toHaveLength(0)
  })

  it.each(['', ' number ', 'number\n', '计算字段', '引用'])('rejects an invalid type or a derived-kind conversion: %j', async value => {
    const {owner, fields, writes} = await setup({editableFieldProperties: ['FieldType']})
    fields.updateEditingValue('AMOUNT', 'FieldType', value)
    await expect(owner.save()).rejects.toThrow('字段类型')
    expect(fields.hasEditingChanges('AMOUNT')).toBe(true); expect(writes()).toHaveLength(0)
  })

  it.each(['计算字段', '引用'])('keeps %s classification read-only even with metadata write permission', async type => {
    const {owner, fields, writes} = await setup({editableFieldProperties: ['FieldType'],
      sourceFields: originalFields.map(row => row.rowid === 'AMOUNT' ? {...row, FieldType: type} : row)})
    expect(owner.read().fields.find(field => field.name === 'FieldType')?.writable).toBe(false)
    fields.updateEditingValue('AMOUNT', 'FieldType', 'string')
    await expect(owner.save()).rejects.toThrow('字段类型')
    expect(writes()).toHaveLength(0)
  })

  it('keeps the actual source primary key type stable despite an editable IsPKey flag', async () => {
    const {owner, fields, writes} = await setup({editableFieldProperties: ['FieldType'], formalPrimaryKey: 'amount'})
    fields.updateEditingValue('AMOUNT', 'FieldType', 'string')
    await expect(owner.save()).rejects.toThrow('主键')
    expect(writes()).toHaveLength(0)
  })

  it('rejects a type change conflicting with an explicit projection definition', async () => {
    const f = fixture({editableFieldProperties: ['FieldType']})
    f.stored.set('A', JSON.stringify({scenarioId: 'A', tables: {OrdersAlias: {
      modelBinding: {modelId: 'M1', modelName: 'Orders'},
      views: {default: {fieldProjection: [{fieldId: 'AMOUNT', resourceField: 'amount', viewField: 'amount',
        source: 'resource', resourceFieldId: 'AMOUNT', type: 'number', primaryKey: false,
        label: '金额', output: true, sortOrder: 0, sortDirection: null,
        expression: '', valueFunction: '', value: '', group: 0, distinct: false}]}},
    }}}))
    const session = await f.open('A'), fields = session.metadataDataSet.getView('Base_DataModel_Field', 'default')!
    fields.updateEditingValue('AMOUNT', 'FieldType', 'decimal')
    await expect(session.getFieldEdit('AMOUNT').save()).rejects.toThrow('fieldProjection')
    expect(f.requests.some(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(false)
    expect(f.fileWrites).toHaveLength(0)
  })

  it('verifies a lost type-save reply without resubmission and allows a subsequent edit', async () => {
    const {f, owner, fields, writes} = await setup({editableFieldProperties: ['FieldType']})
    fields.updateEditingValue('AMOUNT', 'FieldType', 'decimal'); f.loseNextResponse()
    await expect(owner.save()).rejects.toThrow()
    expect(owner.getState().status).toBe('unknown')
    await owner.reload(owner.getState().pending)
    expect(fields.rows.find(row => row['rowid'] === 'AMOUNT')?.['FieldType']).toBe('decimal')
    fields.updateEditingValue('AMOUNT', 'FieldType', 'number'); await owner.save()
    expect(owner.getState()).toEqual({status: 'idle', pending: false})
    expect(writes()).toHaveLength(2)
  })

  it.each(['draft', 'permission', 'formal', 'file'])('rejects a concurrent %s change before dispatching the field type', async change => {
    const sourceFields = originalFields.map(row => ({...row}))
    const {f, fields, owner, writes} = await setup({sourceFields, editableFieldProperties: ['FieldType']})
    const release = f.holdDefinitionRead()
    fields.updateEditingValue('AMOUNT', 'FieldType', 'decimal')
    const pending = owner.save().catch((cause: unknown) => cause)
    try {
      await expect(owner.save()).rejects.toThrow('先核验')
      if (change === 'draft') fields.updateEditingValue('AMOUNT', 'FieldType', 'text')
      if (change === 'permission') {
        f.denyFieldProperty('FieldType'); fields.discardEditingRows(['AMOUNT'])
        await fields.loadFromServer({allPages: true}); fields.updateEditingValue('AMOUNT', 'FieldType', 'decimal')
      }
      if (change === 'formal') sourceFields[2]!.FieldType = 'int'
      if (change === 'file') f.stored.set('A', `${f.stored.get('A')!} `)
    } finally {release()}
    expect(await pending).toBeInstanceOf(Error); expect(writes()).toHaveLength(0)
    expect(owner.getState().status).toBe('idle')
  })

  it('retains an unconfirmed type readback and explicitly reloads without replay', async () => {
    const {owner, fields, writes} = await setup({editableFieldProperties: ['FieldType'], omitFieldProperties: ['FieldType']})
    fields.updateEditingValue('AMOUNT', 'FieldType', 'decimal')
    await expect(owner.save()).rejects.toThrow('回读与提交值不一致')
    expect(owner.getState().status).toBe('readback')
    await owner.reload(owner.getState().pending)
    expect(fields.rows.find(row => row['rowid'] === 'AMOUNT')?.['FieldType']).toBe('number')
    expect(writes()).toHaveLength(1)
  })

  it('inverts model output drafts with a standard bound button, preserves the formal key and cancels without a write', async () => {
    const f = fixture({editableFieldProperties: ['IsOutput'], sourceFields: originalFields.map(row => row.rowid === 'AMOUNT' ? {...row, IsOutput: 0} : row)})
    const wrapper = await page(); await select(wrapper, 'Orders')
    await wrapper.find('.node-panel-tabs').getComponent(RendererTabs).get('#tab-fields').trigger('click'); await flushPromises()
    const control = wrapper.find('[data-action="invert-field-output"]')
    expect(control.exists()).toBe(true)
    const button = wrapper.findAllComponents(RendererButton).find(item => item.attributes('data-action') === 'invert-field-output')!
    expect(button.props('dataViewKey')).toBe('META@Base_DataModel_Field@modelFields')
    await control.trigger('click'); await flushPromises()
    const fields = f.sessions[0]!.metadataDataSet.getView('Base_DataModel_Field', 'modelFields')!
    expect(fields.getEditingRow('PK')?.['IsOutput']).toBe(1)
    expect(fields.getEditingRow('PARENT')?.['IsOutput']).toBe(0)
    expect(fields.getEditingRow('AMOUNT')?.['IsOutput']).toBe(1)
    expect(wrapper.text()).toContain('保留 1 个主键字段输出')
    await control.trigger('click'); await flushPromises()
    expect(fields.hasEditingChanges()).toBe(false)
    expect(wrapper.text()).toContain('当前输出与已保存配置一致，无需保存')
    await control.trigger('click'); await flushPromises()
    await wrapper.get('[data-action="cancel-field"]').trigger('click'); await flushPromises()
    expect(fields.hasEditingChanges()).toBe(false)
    expect(f.requests.some(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(false)
    expect(f.fileWrites).toHaveLength(0)
  })

  it('enables all model outputs then saves once and reopens the native field metadata', async () => {
    const f = fixture({editableFieldProperties: ['IsOutput'], sourceFields: originalFields.map(row => row.rowid === 'PK' ? row : {...row, IsOutput: 0})})
    const wrapper = await page(); await select(wrapper, 'Orders')
    await wrapper.find('.node-panel-tabs').getComponent(RendererTabs).get('#tab-fields').trigger('click'); await flushPromises()
    const control = wrapper.find('[data-action="enable-field-output"]')
    expect(control.exists()).toBe(true)
    await control.trigger('click'); await flushPromises()
    await wrapper.get('[data-action="save-model-workspace"]').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('批量保存')
    expect(f.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toHaveLength(1)
    expect((await f.open('A')).definitionDataSet?.getTable('OrdersAlias')?.columns.map(column => column.name)).toEqual(['rowid', 'parentId', 'amount', '_pk'])
    expect(f.fileWrites).toHaveLength(0)
  })

  it('uses the formal source key instead of the editable IsPKey flag when inverting', async () => {
    const {session, fields, writes} = await setup({editableFieldProperties: ['IsOutput'], formalPrimaryKey: 'amount'})
    const owners = originalFields.map(row => session.getFieldEdit(row.rowid))
    expect(await fieldEditStageOutputBatch(owners, 'invert')).toEqual({changedCount: 2, primaryCount: 1})
    expect(fields.getEditingRow('AMOUNT')?.['IsOutput']).toBe(1)
    expect(fields.getEditingRow('PK')?.['IsOutput']).toBe(0)
    expect(writes()).toHaveLength(0)
  })

  it('preflights every changed field permission before modifying any draft', async () => {
    const {session, fields, writes} = await setup({editableFieldProperties: ['IsOutput'], deniedFieldOutputIds: ['AMOUNT']})
    await expect(fieldEditStageOutputBatch(originalFields.map(row => session.getFieldEdit(row.rowid)), 'invert')).rejects.toThrow('不可写')
    expect(fields.hasEditingChanges()).toBe(false); expect(writes()).toHaveLength(0)
  })

  it('does not need write permission for an already output primary key', async () => {
    const {session, fields} = await setup({editableFieldProperties: ['IsOutput'], deniedFieldOutputIds: ['PK']})
    await fieldEditStageOutputBatch(originalFields.map(row => session.getFieldEdit(row.rowid)), 'invert')
    expect(fields.getEditingPatch('PK')).toBeUndefined()
    expect(fields.getEditingRow('PARENT')?.['IsOutput']).toBe(0)
  })

  it.each([null, false, '1'])('preserves an ambiguous old output value %j and every other field', async value => {
    const {session, fields} = await setup({editableFieldProperties: ['IsOutput'], sourceFields: originalFields.map(row => row.rowid === 'AMOUNT' ? {...row, IsOutput: value} : row)})
    await expect(fieldEditStageOutputBatch(originalFields.map(row => session.getFieldEdit(row.rowid)), 'invert')).rejects.toThrow('只接受0或1')
    expect(fields.hasEditingChanges()).toBe(false)
    expect(fields.getEditingRow('AMOUNT')?.['IsOutput']).toBe(value)
  })

  it('inverts the editing overlay while retaining unrelated property drafts', async () => {
    const {session, fields, writes} = await setup({editableFieldProperties: ['IsOutput', 'description']})
    fields.updateEditingValue('AMOUNT', 'IsOutput', 0)
    fields.updateEditingValue('AMOUNT', 'description', '保留说明草稿')
    await fieldEditStageOutputBatch(originalFields.map(row => session.getFieldEdit(row.rowid)), 'invert')
    expect(fields.getEditingPatch('AMOUNT')).toEqual({description: '保留说明草稿'})
    expect(fields.getEditingRow('PARENT')?.['IsOutput']).toBe(0)
    expect(writes()).toHaveLength(0)
  })

  it.each(['draft', 'permission', 'scope'])('does not apply a stale batch after %s changes while reading the formal model', async change => {
    const {f, session, fields, writes} = await setup({editableFieldProperties: ['IsOutput', 'description']})
    const owners = originalFields.map(row => session.getFieldEdit(row.rowid)), release = f.holdDefinitionRead()
    const outcome = fieldEditStageOutputBatch(owners, 'invert').catch((cause: unknown) => cause)
    await expect(fieldEditStageOutputBatch(owners, 'all')).rejects.toThrow('未决')
    if (change === 'draft') fields.updateEditingValue('AMOUNT', 'description', 'later draft')
    else if (change === 'permission') {f.denyFieldProperty('IsOutput'); await fields.loadFromServer({allPages: true})}
    else f.invalidate()
    release(); expect(await outcome).toBeInstanceOf(Error)
    if (change === 'scope') expect(fields.destroyed).toBe(true)
    else expect(fields.getEditingRow('PARENT')?.['IsOutput']).toBe(1)
    if (change === 'draft') expect(fields.getEditingPatch('AMOUNT')).toEqual({description: 'later draft'})
    expect(writes()).toHaveLength(0)
  })

  it('checks existing view dependencies before saving a staged bulk output change', async () => {
    const f = fixture({editableFieldProperties: ['IsOutput']})
    f.stored.set('A', JSON.stringify({scenarioId: 'A', tables: {OrdersAlias: {modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {default: {labelField: 'amount'}}}}}))
    const session = await f.open('A'), owners = originalFields.map(row => session.getFieldEdit(row.rowid))
    await fieldEditStageOutputBatch(owners, 'invert')
    await expect(fieldEditSaveBatch(owners)).rejects.toThrow('labelField')
    expect(session.metadataDataSet.getView('Base_DataModel_Field', 'default')?.getEditingRow('AMOUNT')?.['IsOutput']).toBe(0)
    expect(f.requests.some(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(false)
  })

  it('recovers an unknown bulk output save without repeating its batch', async () => {
    const {f, session, fields, writes} = await setup({missing: true, editableFieldProperties: ['IsOutput']})
    const owners = originalFields.map(row => session.getFieldEdit(row.rowid))
    await fieldEditStageOutputBatch(owners, 'invert')
    f.loseNextResponse()
    await expect(fieldEditSaveBatch(owners)).rejects.toThrow(/response lost/)
    await expect(fieldEditStageOutputBatch(owners, 'all')).rejects.toThrow('未决')
    await fieldEditReloadBatch(owners, true)
    expect(writes()).toHaveLength(1); expect(fields.getEditingRow('PK')?.['IsOutput']).toBe(1)
    expect(fields.getEditingRow('AMOUNT')?.['IsOutput']).toBe(0)
    expect(owners.every(owner => owner.getState().status === 'idle')).toBe(true)
  })

  it.each([false, 0, [], {}])('does not save a non-text constant into the database field expression path: %j', async value => {
    const {owner, fields, writes} = await setup({editableFieldProperties: ['ValueFun']})
    const text = JSON.stringify({Type: 'GetConstValue', Value: value})
    owner.stageValueFunction(text)
    await expect(owner.save()).rejects.toThrow('数据库字段表达式')
    expect(writes()).toHaveLength(0); expect(fields.getEditingPatch('AMOUNT')?.['ValueFun']).toBe(text)
  })
  it('reads retained lowercase parameter declarations without inventing an undefined name', async () => {
    const {owner} = await setup({editableFieldProperties: ['ValueFun'], inputParameters: '[{"rowid":"P","name":"customer","description":"旧客户"}]'})
    expect(owner.readValueFunction().context.inputParams).toEqual([{value: 'customer', label: '旧客户'}])
    owner.stageValueFunction('{"Type":"GetInputParam","ParamName":"customer"}'); await owner.save()
  })

  it('refuses ambiguous parameter names while retaining a repairable constant path', async () => {
    const {owner} = await setup({editableFieldProperties: ['ValueFun'], inputParameters: '[{"rowid":"P1","Name":"customer"},{"rowid":"P2","name":"customer"}]'})
    expect(() => owner.stageValueFunction('{"Type":"GetInputParam","ParamName":"customer"}')).toThrow()
    expect(owner.readValueFunction().warning).toContain('参数')
    owner.stageValueFunction('{"Type":"GetConstValue","Value":null}'); await owner.save()
  })

  it.each(['scope', 'draft', 'permission', 'declarations'])('rejects %s changes during field function preflight', async change => {
    const {f, owner, fields, session, writes} = await setup({editableFieldProperties: ['ValueFun']})
    owner.stageValueFunction('{"Type":"GetInputParam","ParamName":"customer"}')
    const release = f.holdDefinitionRead(), pending = owner.save().catch((cause: unknown) => cause)
    try {
      if (change === 'scope') f.invalidate()
      if (change === 'draft') fields.updateEditingValue('AMOUNT', 'ValueFun', '{"Type":"GetConstValue","Value":false}')
      if (change === 'permission') {f.denyFieldProperty('ValueFun'); fields.discardEditingRows(['AMOUNT']); await fields.loadFromServer({allPages: true}); fields.updateEditingValue('AMOUNT', 'ValueFun', '{"Type":"GetInputParam","ParamName":"customer"}')}
      if (change === 'declarations') session.metadataDataSet.getView('Base_DataSet', 'default')!.updateEditingValue('A', 'inputParams', '[]')
    } finally {release()}
    expect(await pending).toBeInstanceOf(Error); expect(writes()).toHaveLength(0)
  })

  it('repairs invalid raw text using the structured editor without discarding other field edits', async () => {
    const {owner, fields} = await setup({editableFieldProperties: ['ValueFun', 'description']})
    fields.updateEditingValue('AMOUNT', 'ValueFun', '{broken')
    fields.updateEditingValue('AMOUNT', 'description', '修复草稿')
    owner.stageValueFunction('{"Type":"GetConstValue","Value":null}')
    expect(fields.getEditingPatch('AMOUNT')).toEqual({ValueFun: '{"Type":"GetConstValue","Value":null}', description: '修复草稿'})
    await owner.save()
  })

  it.each(['', '{"Type":"FutureServerValue","Extra":[false,0,null]}'])('explicitly clears or preserves an extensible server function: %s', async value => {
    const {f, owner, fields} = await setup({editableFieldProperties: ['ValueFun']})
    owner.stageValueFunction(value); await owner.save()
    expect(fields.rows.find(row => row['rowid'] === 'AMOUNT')?.['ValueFun']).toBe(value)
    expect((await f.open('A')).metadataDataSet.getView('Base_DataModel_Field', 'default')?.rows.find(row => row['rowid'] === 'AMOUNT')?.['ValueFun']).toBe(value)
  })

  it.each(['{broken', '[]', '   ', '{"Type":"GetConstValue"}', '{"Type":"GetInputParam","ParamName":"missing"}',
    '{"Type":"GetRefData","RefTableName":"OrdersAlias","RefFieldName":"amount","FkFieldName":"rowid"}',
    '{"Type":"GetUserMasterId","refType":"role","roleClassId":"r"}'])('rejects invalid syntax or unresolved formal references without dispatch: %s', async value => {
    const {owner, fields, writes} = await setup({editableFieldProperties: ['ValueFun']})
    fields.updateEditingValue('AMOUNT', 'ValueFun', value)
    await expect(owner.save()).rejects.toThrow()
    expect(writes()).toHaveLength(0); expect(owner.getState()).toEqual({status: 'idle', pending: true})
    expect(fields.getEditingPatch('AMOUNT')?.['ValueFun']).toBe(value)
  })

  it('separates physical output references from formal model names and declared input parameters', async () => {
    const relation = {rowid: 'R', parentModId: 'M2', childModId: 'M1', parentTable: 'Customers', childTable: 'Orders',
      filter: JSON.stringify({Type: 'cond', Field: 'parentId', Operator: 'equal', ValueFun: {Type: 'GetTableField', Field: 'rowid'}}), depType: '', cascadeDel: 0}
    const f = fixture({editableFieldProperties: ['ValueFun'], relationRows: [relation], sourceFields: [
      ...originalFields.map(field => field.rowid === 'AMOUNT' ? {...field, AsName: 'totalAmount'} : field),
      {rowid: 'C_PK', dataModelId: 'M2', Name: 'rowid', type: 'dataModel', FieldType: 'string', IsPKey: 1, IsOutput: 1},
      {rowid: 'C_PARENT', dataModelId: 'M2', Name: 'parentId', type: 'dataModel', FieldType: 'string', IsPKey: 0, IsOutput: 1}]})
    f.setModelValues({Type: '数据库表'}); f.setModelValues({Type: '数据库表'}, 'A', 'M2')
    const session = await f.open('A'), owner = session.getFieldEdit('AMOUNT'), fields = session.metadataDataSet.getView('Base_DataModel_Field', 'default')!
    expect(owner.readValueFunction().context).toMatchObject({tables: [{name: 'Orders', fields: [{name: 'rowid'}, {name: 'parentId'}, {name: 'amount'}]},
      {name: 'Customers', fields: [{name: 'rowid'}, {name: 'parentId'}]}], relatedFields: [{label: 'rowid', value: 'rowid'}, {label: 'parentId', value: 'parentId'}, {label: 'amount', value: 'amount'}], inputParams: [{value: 'customer', label: '客户'}]})
    expect(() => owner.stageValueFunction('{"Type":"GetTableField","Field":"Customers.rowid"}')).toThrow()
    for (const value of [ {Type: 'GetTableField', Field: 'amount'}, {Type: 'GetInputParam', ParamName: 'customer'},
      {Type: 'GetRefData', RefTableName: 'CustomerSource', RefFieldName: 'parentId', FkFieldName: 'rowid'},
      {Type: 'GetExpData', refTableName: 'Orders', Exp: 'amount + 1'}, {Type: 'SystemData', ParamName: 'UserID'}]) {
      owner.stageValueFunction(JSON.stringify(value)); await owner.save()
      expect(fields.rows.find(row => row['rowid'] === 'AMOUNT')?.['ValueFun']).toBe(JSON.stringify(value))
    }
  })

  it.each([{readOnly: true}, {hiddenFieldProperties: ['ValueFun']}])('uses field permissions for function text and structured edits: %j', async options => {
    const {owner, fields, writes} = await setup({editableFieldProperties: ['ValueFun'], ...options})
    expect(owner.read().fields.find(field => field.name === 'ValueFun')?.writable).toBe(false)
    expect(() => owner.stageValueFunction('{"Type":"GetConstValue","Value":1}')).toThrow('不可写')
    fields.updateEditingValue('AMOUNT', 'ValueFun', '{"Type":"GetConstValue","Value":1}')
    await expect(owner.save()).rejects.toThrow('不可写'); expect(writes()).toHaveLength(0)
    if ('hiddenFieldProperties' in options) expect(owner.readValueFunction().value).toBe(null)
  })

  it('preserves a source-derived key even when the editable record does not mark it as a key', async () => {
    const {owner, writes} = await setup({editableFieldProperties: ['ValueFun'], formalPrimaryKey: 'amount'})
    owner.stageValueFunction('{"Type":"GetConstValue","Value":1}')
    await expect(owner.save()).rejects.toThrow('主键'); expect(writes()).toHaveLength(0)
  })

  it.each(['lost', 'mismatch'])('verifies a %s value-function result without replaying writes', async kind => {
    const {f, owner, fields, writes} = await setup({editableFieldProperties: ['ValueFun'], ...(kind === 'mismatch' ? {omitFieldProperties: ['ValueFun']} : {})})
    owner.stageValueFunction('{"Type":"GetConstValue","Value":"false"}')
    if (kind === 'lost') f.loseNextResponse()
    await expect(owner.save()).rejects.toThrow()
    await expect(owner.save()).rejects.toThrow('先核验')
    await owner.reload(owner.getState().pending)
    expect(writes()).toHaveLength(1); expect(owner.getState()).toEqual({status: 'idle', pending: false})
    expect(fields.rows.find(row => row['rowid'] === 'AMOUNT')?.['ValueFun']).toBe(kind === 'lost' ? '{"Type":"GetConstValue","Value":"false"}' : originalFields[2]!.ValueFun)
  })

  it('keeps an open function dialog in page dirty protection and rejects its stale callback', async () => {
    fixture({editableFieldProperties: ['ValueFun']}); const wrapper = await page(); await select(wrapper, 'amount')
    const editor = wrapper.findComponent(FieldValueFunction)
    await editor.get('[data-function-open]').trigger('click'); await flushPromises()
    const listener = editor.findComponent(FilterValueFunctionDialog).vm.$.vnode.props?.['onConfirm'] as (value: unknown) => void
    await select(wrapper, '输入参数')
    expect(wrapper.find('[data-action="save-field"]').exists()).toBe(true)
    expect(wrapper.get('[data-action="save-field"]').attributes('disabled')).toBeDefined()
    editor.findComponent(FilterValueFunctionDialog).vm.$emit('update:modelValue', false); await flushPromises()
    await select(wrapper, '输入参数')
    listener({Type: 'GetConstValue', Value: 'stale'})
    expect(wrapper.findAllComponents(RendererDialog).some(dialog => dialog.props('title') === '输入参数设置' && dialog.props('modelValue'))).toBe(true)
    expect(wrapper.find('[data-action="save-field"]').exists()).toBe(false)
  })

  it('persists a field value function verbatim and reopens the same formal definition', async () => {
    const {f, owner, fields, writes} = await setup({editableFieldProperties: ['ValueFun']})
    const value = ' {"Type":"GetTableField","Field":"parentId","Extra":{"keep":[false,0,null,""]}} '
    fields.updateEditingValue('AMOUNT', 'ValueFun', value)
    await owner.save()
    const reopened = await f.open('A')
    expect(reopened.metadataDataSet.getView('Base_DataModel_Field', 'default')?.rows.find(row => row['rowid'] === 'AMOUNT')?.['ValueFun']).toBe(value)
    const business = reopened.definitionDataSet!.getView('OrdersAlias', 'default')!
    await business.loadFromServer()
    expect(f.requests.at(-1)?.data).toMatchObject({Table: [{Name: 'Orders'}]})
    expect(writes()).toHaveLength(1); expect(f.fileWrites).toHaveLength(0)
    expect(owner.getState()).toEqual({status: 'idle', pending: false})
  })

  it('binds value-function text to the original field view and cancels the complex editor draft', async () => {
    const f = fixture({editableFieldProperties: ['ValueFun']}), wrapper = await page()
    await select(wrapper, 'amount')
    const control = wrapper.findAllComponents(FieldText).find(item => item.props('field') === 'ValueFun')
    expect(control).toBeDefined(); expect(control!.props('modelValue')).toBeUndefined()
    const editor = wrapper.findComponent(FieldValueFunction)
    expect(editor.exists()).toBe(true)
    expect(editor.props('modelValue')).toBeUndefined()
    expect(editor.props('dataViewKey')).toBe('META@Base_DataModel_Field@default'); expect(editor.props('field')).toBe('ValueFun')
    const view = f.sessions[0]!.metadataDataSet.getView('Base_DataModel_Field', 'default')!
    expect(view.hasEditingChanges()).toBe(false)
    await editor.get('[data-function-open]').trigger('click'); await flushPromises()
    editor.getComponent(FilterValueFunctionDialog).vm.$emit('confirm', {Type: 'GetConstValue', Value: false})
    await flushPromises()
    expect(view.getEditingPatch('AMOUNT')).toEqual({ValueFun: '{"Type":"GetConstValue","Value":false}'})
    await wrapper.get('[data-action="cancel-field"]').trigger('click'); await flushPromises()
    expect(view.hasEditingChanges()).toBe(false)
    expect(editor.props('modelValue')).toBeUndefined()
    expect(view.getEditingRow('AMOUNT')?.['ValueFun']).toBe(originalFields[2]!.ValueFun)
  })

  it('persists an output alias and flag through the original field owner and reconstructs native columns', async () => {
    const {f, owner, fields, writes} = await setup({editableFieldProperties: ['AsName', 'IsOutput']})
    const originalFile = f.stored.get('A')
    fields.updateEditingValue('AMOUNT', 'AsName', 'totalAmount')
    await owner.save()
    expect(owner.getState()).toEqual({status: 'idle', pending: false})
    const reopened = await f.open('A')
    expect(reopened.definitionDataSet?.getTable('OrdersAlias')?.columns.map(column => column.name)).toEqual(['rowid', 'parentId', 'totalAmount', '_pk'])
    const next = reopened.metadataDataSet.getView('Base_DataModel_Field', 'default')!
    next.updateEditingValue('AMOUNT', 'IsOutput', 0)
    await reopened.getFieldEdit('AMOUNT').save()
    const final = await f.open('A'), table = final.definitionDataSet?.getTable('OrdersAlias')
    expect(table?.columns.map(column => column.name)).toEqual(['rowid', 'parentId', 'totalAmount', '_pk'])
    expect(table?.getOrCreateView('default').fieldProjection.find(column => column.fieldId === 'AMOUNT')?.output).toBe(false)
    expect(fields.rows.find(row => row['rowid'] === 'AMOUNT')).toMatchObject({Name: 'amount', AsName: 'totalAmount', ValueFun: originalFields[2]!.ValueFun})
    expect(writes()).toHaveLength(2)
    expect(f.stored.get('A')).toBe(originalFile); expect(f.fileWrites).toHaveLength(0)
  })

  it('binds output controls to the formal DataView without implicit edits and cancels the alias draft', async () => {
    const f = fixture({editableFieldProperties: ['AsName', 'IsOutput']}), wrapper = await page()
    await select(wrapper, 'amount')
    const fields = f.sessions[0]!.metadataDataSet.getView('Base_DataModel_Field', 'default')!
    const alias = wrapper.findAllComponents(FieldText).find(item => item.props('field') === 'AsName')
    const output = wrapper.findAllComponents(FieldSelect).find(item => item.props('field') === 'IsOutput')
    expect(alias).toBeDefined(); expect(output).toBeDefined()
    expect(alias!.props('modelValue')).toBeUndefined(); expect(output!.props('modelValue')).toBeUndefined()
    expect(fields.hasEditingChanges()).toBe(false)
    await alias!.get('input').setValue('draftAlias'); await flushPromises()
    expect(fields.getEditingRow('AMOUNT')?.['AsName']).toBe('draftAlias')
    await wrapper.get('[data-action="cancel-field"]').trigger('click'); await flushPromises()
    expect(fields.hasEditingChanges()).toBe(false)
    expect(f.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toHaveLength(0)
  })

  it('saves only configured properties then rebuilds the column label from persisted definitions', async () => {
    const {f, session, fields, owner, writes} = await setup()
    const beforeFile = f.stored.get('A')
    fields.updateEditingValue('AMOUNT', 'description', '订单金额')
    fields.updateEditingValue('AMOUNT', 'OrderType', 'descending')
    fields.updateEditingValue('AMOUNT', 'Order', 2)
    fields.updateEditingValue('AMOUNT', 'Group', 1)
    await owner.save()
    expect(owner.getState()).toEqual({status: 'idle', pending: false})
    expect(fields.rows.find(row => row['rowid'] === 'AMOUNT')).toMatchObject({description: '订单金额', OrderType: 'descending', Order: 2, Group: 1,
      ValueFun: originalFields[2]!.ValueFun, Expression: '保留原配置'})
    expect(() => session.definitionDataSet).toThrow('定义投影已失效')
    const reopened = await f.open('A')
    expect(reopened.definitionDataSet?.getTable('OrdersAlias')?.columns.find(column => column.name === 'amount')?.label).toBe('订单金额')
    expect(reopened.metadataDataSet.getView('Base_DataModel_Field', 'default')?.rows.find(row => row['rowid'] === 'AMOUNT')?.['OrderType']).toBe('descending')
    expect(writes()).toHaveLength(1)
    expect(JSON.stringify(writes()[0]?.data)).not.toContain('Expression')
    expect(f.stored.get('A')).toBe(beforeFile); expect(f.fileWrites).toHaveLength(0)
  })

  it('binds page controls to the original field view and protects edits until cancellation', async () => {
    const f = fixture(), wrapper = await page()
    await select(wrapper, 'amount')
    const form = wrapper.findAllComponents(RendererForm).find(item => item.props('dataSource') === undefined
      && item.props('dataViewKey') === `${f.sessions[0]?.metadataDataSet.scenarioId}@Base_DataModel_Field@default`)
    expect(form).toBeDefined()
    const control = wrapper.findAllComponents(FieldText).find(item => item.props('field') === 'description')
    expect(control).toBeDefined(); expect(control?.props('modelValue')).toBeUndefined()
    await control!.get('input').setValue('草稿金额'); await flushPromises()
    const order = wrapper.findAllComponents(FieldNumber).find(item => item.props('field') === 'Order')!
    expect(order.props('modelValue')).toBeUndefined()
    await order.get('input').setValue(2); await flushPromises()
    expect(f.sessions[0]?.metadataDataSet.getView('Base_DataModel_Field', 'default')?.getEditingRow('AMOUNT')?.['Order']).toBe(2)
    await select(wrapper, '输入参数')
    expect(wrapper.text()).toContain('当前字段配置')
    expect(wrapper.find('[data-action="cancel-field"]').exists()).toBe(true)
    await wrapper.get('[data-action="cancel-field"]').trigger('click'); await flushPromises()
    expect(control!.get('input').element.value).toBe('原金额')
    expect(f.sessions[0]?.metadataDataSet.getView('Base_DataModel_Field', 'default')?.hasEditingChanges()).toBe(false)
    await select(wrapper, '输入参数')
    expect(wrapper.findAllComponents(RendererDialog).some(dialog => dialog.props('title') === '输入参数设置' && dialog.props('modelValue'))).toBe(true)
    expect(wrapper.find('[data-action="save-field"]').exists()).toBe(false)
    expect(f.requests.some(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(false)
  })

  it.each([{readOnly: true}, {hiddenFieldProperties: ['description']}])('refuses protected fields through the same query permission contract: %j', async options => {
    const {owner, fields, writes} = await setup(options)
    expect(owner.read().fields.find(field => field.name === 'description')?.writable).toBe(false)
    fields.updateEditingValue('AMOUNT', 'description', 'must-not-save')
    await expect(owner.save()).rejects.toThrow('不可写')
    expect(writes()).toHaveLength(0)
  })

  it.each([['Name', 'renamed'], ['AsName', 'alias'], ['OrderType', 'asc'], ['Order', -1], ['Group', 1.5], ['Order', '2']])('rejects invalid or out-of-scope edits: %s=%s', async (field, value) => {
    const {owner, fields, writes} = await setup()
    fields.updateEditingValue('AMOUNT', String(field), value)
    await expect(owner.save()).rejects.toThrow()
    expect(writes()).toHaveLength(0)
  })

  it('rechecks permission and context after staging without overwriting another field draft', async () => {
    const {f, owner, fields, writes} = await setup()
    f.denyFieldProperty('description')
    expect((await fields.loadFromServer({allPages: true})).success).toBe(true)
    fields.updateEditingValue('AMOUNT', 'description', 'denied')
    await expect(owner.save()).rejects.toThrow('不可写')
    owner.discard()
    fields.updateEditingValue('AMOUNT', 'Order', 3)
    fields.updateEditingValue('PARENT', 'description', 'another draft')
    await expect(owner.save()).rejects.toThrow('其他字段草稿')
    expect(fields.getEditingRow('PARENT')?.['description']).toBe('another draft')
    fields.discardEditingRows(['PARENT'])
    fields.queryContext = {dataSpaceId: 'B'}
    await expect(owner.save()).rejects.toThrow('查询或目标已变化')
    expect(writes()).toHaveLength(0)
  })

  it.each(['lost', 'receipt', 'mismatch', 'readback'])('recovers a structural %s by readback only, with no automatic resubmission', async mode => {
    const {f, owner, fields, session, writes} = await setup(mode === 'receipt' ? {omitFieldReceipt: true} : mode === 'mismatch' ? {omitFieldProperties: ['Order']} : {})
    fields.updateEditingValue('AMOUNT', 'Order', 3)
    if (mode === 'lost') f.loseNextResponse()
    if (mode === 'readback') f.failNextFieldRead()
    await expect(owner.save()).rejects.toThrow()
    expect(session.hasPendingFieldEdits()).toBe(true)
    await expect(owner.save()).rejects.toThrow('先核验')
    await owner.reload(owner.getState().pending)
    expect(owner.getState()).toEqual({status: 'idle', pending: false})
    expect(fields.rows.find(row => row['rowid'] === 'AMOUNT')?.['Order']).toBe(mode === 'mismatch' ? 0 : 3)
    expect(writes()).toHaveLength(1)
  })

  it('rejects concurrent submission and preserves a late draft during field readback', async () => {
    const {f, owner, fields, writes} = await setup()
    const release = f.holdModelResponse()
    fields.updateEditingValue('AMOUNT', 'Order', 3)
    const outcome = owner.save().catch((cause: unknown) => cause)
    await vi.waitFor(() => expect(writes()).toHaveLength(1))
    await expect(owner.save()).rejects.toThrow('先核验')
    await expect(owner.reload(true)).rejects.toThrow('仍在进行')
    fields.updateEditingValue('PARENT', 'description', 'late draft')
    release(); expect(await outcome).toBeInstanceOf(Error)
    expect(owner.getState().status).toBe('readback')
    expect(fields.getEditingRow('PARENT')?.['description']).toBe('late draft')
    fields.discardEditingRows(['PARENT']); await owner.reload(false)
    expect(writes()).toHaveLength(1)
  })

  it('isolates identical field IDs across spaces and refuses an owner after its session is released', async () => {
    const {f, owner, fields} = await setup()
    const second = await f.open('B'), secondFields = second.metadataDataSet.getView('Base_DataModel_Field', 'default')!
    fields.updateEditingValue('AMOUNT', 'description', 'A draft')
    secondFields.updateEditingValue('AMOUNT', 'description', 'B saved')
    await second.getFieldEdit('AMOUNT').save()
    expect(fields.getEditingRow('AMOUNT')?.['description']).toBe('A draft')
    expect((await f.open('A')).metadataDataSet.getView('Base_DataModel_Field', 'default')?.rows.find(row => row['rowid'] === 'AMOUNT')?.['description']).toBe('原金额')
    f.invalidate(); await expect(owner.save()).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
    expect(() => owner.read()).toThrow('会话已释放')
  })

  it('rejects changed model identity and unplaced or source-input records', async () => {
    const {session, owner, fields, writes} = await setup()
    session.metadataDataSet.getView('Base_DataModel', 'default')!.queryContext = {dataSpaceId: 'B'}
    fields.updateEditingValue('AMOUNT', 'Order', 1)
    await expect(owner.save()).rejects.toThrow('所属模型')
    const invalid = fixture({sourceFields: [...originalFields, {rowid: 'ORPHAN', dataModelId: 'MISSING', type: 'dataModel', Name: 'x'},
      {rowid: 'INPUT', dataModelId: 'M1', type: 'inputParams', Name: 'arg'}]})
    const other = await invalid.open('A')
    expect(() => other.getFieldEdit('ORPHAN')).toThrow('所属模型')
    expect(() => other.getFieldEdit('INPUT')).toThrow('字段身份')
    expect(writes()).toHaveLength(0)
  })

  it('does not normalize old values on mount, and saves the page field then reopens independently', async () => {
    const f = fixture({sourceFields: originalFields.map(row => row.rowid === 'AMOUNT' ? {...row, OrderType: 'legacy-sort', Group: undefined} : row)})
    const wrapper = await page(); await select(wrapper, 'amount')
    const fields = f.sessions[0]!.metadataDataSet.getView('Base_DataModel_Field', 'default')!
    expect(fields.hasEditingChanges()).toBe(false)
    const control = wrapper.findAllComponents(FieldText).find(item => item.props('field') === 'description')!
    await control.get('input').setValue('页面保存金额'); await flushPromises()
    await wrapper.get('[data-action="save-field"]').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('本次字段配置已保存')
    expect(fields.rows.find(row => row['rowid'] === 'AMOUNT')).toMatchObject({description: '页面保存金额', OrderType: 'legacy-sort', Group: undefined})
    expect((await f.open('A')).definitionDataSet?.getTable('OrdersAlias')?.columns.find(column => column.name === 'amount')?.label).toBe('页面保存金额')
    expect(f.fileWrites).toHaveLength(0)
  })

  it('does not expose a hidden field through the page controls or definition details', async () => {
    fixture({hiddenFieldProperties: ['description']})
    const wrapper = await page(); await select(wrapper, 'amount')
    expect(wrapper.findAllComponents(FieldText).some(item => item.props('field') === 'description')).toBe(false)
    expect(wrapper.html()).not.toContain('原金额')
    expect(wrapper.text()).toContain('字段说明：不可读')
  })

  it('shows the accepted save separately from a later bound draft and cancels only that draft', async () => {
    const f = fixture(), wrapper = await page(); await select(wrapper, 'amount')
    const fields = f.sessions[0]!.metadataDataSet.getView('Base_DataModel_Field')!
    const control = wrapper.findAllComponents(FieldText).find(item => item.props('field') === 'description')!
    await control.get('input').setValue('本次已保存标题'); await flushPromises()
    const release = f.holdModelResponse(), start = f.requests.length
    await wrapper.get('[data-action="save-field"]').trigger('click')
    await vi.waitFor(() => expect(f.requests.slice(start).filter(request => request.url?.endsWith('/BatchTableOperateRequestByCRUD'))).toHaveLength(1))
    fields.updateEditingValue('AMOUNT', 'description', '后续标题草稿')
    release(); await flushPromises()
    expect(wrapper.text()).toContain('本次字段配置已保存；仍有后续修改待保存')
    expect(fields.getEditingRow('AMOUNT')?.['description']).toBe('后续标题草稿')
    const savedControl = () => wrapper.findAllComponents(FieldText).find(item => item.props('field') === 'description')!.get('input')
    expect(savedControl().element.value).toBe('后续标题草稿')
    expect(f.requests.slice(start).filter(request => request.url?.endsWith('/GetData'))).toHaveLength(0)
    const cancel = wrapper.findAllComponents(RendererButton).find(item => item.props('label') === '放弃本地修改')!
    await cancel.trigger('click'); await flushPromises()
    expect(savedControl().element.value).toBe('本次已保存标题')
    expect(fields.hasEditingChanges()).toBe(false)
    expect((await f.open('A')).definitionDataSet?.getTable('OrdersAlias')?.columns.find(column => column.name === 'amount')?.label).toBe('本次已保存标题')
  })

  it('saves an ordinary column attribute without submitting or discarding an unrelated draft', async () => {
    const {owner, fields, writes, f} = await setup()
    fields.updateEditingValue('PARENT', 'description', '保留其他列草稿')
    fields.updateEditingValue('AMOUNT', 'description', '已确认金额标题')
    f.failNextFieldRead()
    await owner.save()
    expect(owner.getState()).toEqual({status: 'idle', pending: false})
    expect(fields.getEditingRow('PARENT')?.['description']).toBe('保留其他列草稿')
    expect(fields.rows.find(row => row['rowid'] === 'AMOUNT')?.['description']).toBe('已确认金额标题')
    expect(writes()).toHaveLength(1)
    expect(writes()[0]?.data).toMatchObject([{CrudModel: {Changed: [{rowid: 'AMOUNT', description: '已确认金额标题'}]}}])
    fields.discardEditingRows(['PARENT'])
    await expect(owner.reload(false)).rejects.toThrow('field read unavailable')
    await owner.reload(false)
    expect(owner.getState()).toEqual({status: 'idle', pending: false})
    expect(fields.rows.find(row => row['rowid'] === 'AMOUNT')?.['description']).toBe('已确认金额标题')
    expect(writes()).toHaveLength(1)
  })

  it('locks the bound fields while an unknown write awaits verification', async () => {
    const f = fixture(), wrapper = await page(); await select(wrapper, 'amount')
    const control = wrapper.findAllComponents(FieldText).find(item => item.props('field') === 'description')!
    await control.get('input').setValue('保存后核验'); await flushPromises()
    f.loseNextResponse()
    await wrapper.get('[data-action="save-field"]').trigger('click'); await flushPromises()
    expect(control.get('input').element.disabled).toBe(true)
    expect(f.sessions[0]?.hasPendingFieldEdits()).toBe(true)
    await wrapper.get('[data-action="verify-field"]').trigger('click'); await flushPromises()
    expect(f.sessions[0]?.hasPendingFieldEdits()).toBe(false)
    const restored = wrapper.findAllComponents(FieldText).find(item => item.props('field') === 'description')!
    expect(restored.get('input').element.disabled).toBe(false)
    expect(restored.get('input').element.value).toBe('保存后核验')
    expect(f.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toHaveLength(1)
  })

  it('rejects context changes during apply and never publishes a late result after disposal', async () => {
    const {f, fields, owner, writes} = await setup()
    fields.updateEditingValue('AMOUNT', 'Order', 3)
    const first = owner.save().catch((cause: unknown) => cause)
    fields.queryContext = {dataSpaceId: 'B'}
    expect(await first).toBeInstanceOf(Error); expect(writes()).toHaveLength(0)
    const session = await f.open('A'), current = session.getFieldEdit('AMOUNT')
    session.metadataDataSet.getView('Base_DataModel_Field', 'default')!.updateEditingValue('AMOUNT', 'Order', 4)
    const release = f.holdModelResponse(), late = current.save().catch((cause: unknown) => cause)
    await vi.waitFor(() => expect(writes()).toHaveLength(1))
    session.dispose(); release()
    expect(await late).toBeInstanceOf(Error)
    expect(() => current.read()).toThrow('会话已释放')
    expect(writes()).toHaveLength(1)
  })

  it('rejects an array-shaped sort value before applying the draft', async () => {
    const {owner, fields, writes} = await setup()
    fields.updateEditingValue('AMOUNT', 'OrderType', ['ascending'])
    await expect(owner.save()).rejects.toThrow('排序方向')
    expect(owner.getState().status).toBe('idle')
    expect(fields.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(writes()).toHaveLength(0)
  })

  it.each([
    ['valueField', {valueField: ['amount']}], ['labelField', {labelField: 'amount'}],
    ['treeConfig', {treeConfig: {idField: 'rowid', parentIdField: 'parentId', textField: 'amount'}}],
    ['sortExpression', {sortExpression: [{field: 'amount', direction: 'desc'}]}],
    ['aggregates', {aggregates: {sum: {type: 'sum', field: 'amount'}}}],
    ['aggregates', {aggregates: {amount: {type: 'sum'}}}],
    ['filterExpression', {filterExpression: {field: 'parentId', operator: 'eq', value: {Type: 'GetTableField', Field: 'amount'}}}],
  ])('blocks removing an output used by %s and retains the editable draft', async (path, view) => {
    const f = fixture({editableFieldProperties: ['IsOutput']})
    f.stored.set('A', JSON.stringify({scenarioId: 'A', tables: {OrdersAlias: {modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {default: view}}}}))
    const session = await f.open('A'), fields = session.metadataDataSet.getView('Base_DataModel_Field', 'default')!, owner = session.getFieldEdit('AMOUNT')
    fields.updateEditingValue('AMOUNT', 'IsOutput', 0)
    await expect(owner.save()).rejects.toThrow(String(path))
    expect(owner.getState()).toEqual({status: 'idle', pending: true})
    expect(fields.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(f.requests.some(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(false)
  })

  it.each([['PK', 'IsOutput', 0, '主键'], ['AMOUNT', 'AsName', 'parentId', '重复'],
    ['AMOUNT', 'AsName', ' spaced ', '输出名称'], ['AMOUNT', 'IsOutput', '1', '输出开关']])(
    'rejects invalid output changes %s.%s', async (id, property, value, message) => {
      const {session, fields, writes} = await setup({editableFieldProperties: ['AsName', 'IsOutput']})
      fields.updateEditingValue(String(id), String(property), value)
      await expect(session.getFieldEdit(String(id)).save()).rejects.toThrow(String(message))
      expect(fields.dirtyTracking.hasPendingChanges()).toBe(false); expect(writes()).toHaveLength(0)
    })

  it('enables an unused field without a view file and clears its alias without creating a second source', async () => {
    const {f, owner, fields, writes} = await setup({missing: true, editableFieldProperties: ['AsName', 'IsOutput'],
      sourceFields: originalFields.map(row => row.rowid === 'AMOUNT' ? {...row, IsOutput: 0, AsName: 'oldAlias'} : row)})
    fields.updateEditingValue('AMOUNT', 'IsOutput', 1); fields.updateEditingValue('AMOUNT', 'AsName', '')
    await owner.save()
    expect(fields.rows.find(row => row['rowid'] === 'AMOUNT')).toMatchObject({Name: 'amount', AsName: '', IsOutput: 1})
    expect(f.stored.has('A')).toBe(false); expect(f.fileWrites).toHaveLength(0); expect(writes()).toHaveLength(1)
  })

  it.each(['lost', 'mismatch'])('reconciles %s output save by readback without resubmission', async mode => {
    const {f, fields, owner, writes} = await setup({editableFieldProperties: ['AsName'], ...(mode === 'mismatch' ? {omitFieldProperties: ['AsName']} : {})})
    fields.updateEditingValue('AMOUNT', 'AsName', 'renamed')
    if (mode === 'lost') f.loseNextResponse()
    await expect(owner.save()).rejects.toThrow()
    await expect(owner.save()).rejects.toThrow('先核验')
    await owner.reload(owner.getState().pending)
    expect(owner.getState()).toEqual({status: 'idle', pending: false})
    expect(fields.rows.find(row => row['rowid'] === 'AMOUNT')?.['AsName']).toBe(mode === 'lost' ? 'renamed' : undefined)
    expect(writes()).toHaveLength(1)
  })

  it('refuses an output write when the stored view file changed since opening', async () => {
    const {f, fields, owner, writes} = await setup({editableFieldProperties: ['AsName']})
    f.stored.set('A', `${f.stored.get('A')!} `)
    fields.updateEditingValue('AMOUNT', 'AsName', 'renamed')
    await expect(owner.save()).rejects.toThrow('远端视图配置已变化')
    expect(owner.getState().status).toBe('idle'); expect(writes()).toHaveLength(0)
  })

  it.each([false, true])('checks native relationship and query cascade references without modifying either definition; imported=%s', async imported => {
    const f = fixture({editableFieldProperties: ['AsName']})
    const configuration = {scenarioId: 'A', ...(imported ? {schemaVersion: 2} : {}), tables: {
      OrdersAlias: {modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {default: {}}},
      CustomersAlias: {modelBinding: {modelId: 'M2', modelName: 'Customers'}, views: {default: {}}}},
      resourceRelations: [{relationId: 'R', ...(imported ? {sourceRelationId: 'LEGACY'} : {}), parentTable: 'OrdersAlias', childTable: 'CustomersAlias',
        filterExpression: {field: 'parentId', operator: 'eq', value: {Type: 'GetTableField', Field: 'amount'}}}],
      viewCascades: [{parentTable: 'OrdersAlias', parentViewId: 'default', childTable: 'CustomersAlias', childViewId: 'default', filterBindings: [{sourceField: 'amount', targetField: 'parentId'}]}]}
    f.stored.set('A', JSON.stringify(configuration))
    const session = await f.open('A'), fields = session.metadataDataSet.getView('Base_DataModel_Field', 'default')!, owner = session.getFieldEdit('AMOUNT')
    fields.updateEditingValue('AMOUNT', 'AsName', 'renamed')
    await expect(owner.save()).rejects.toThrow('resourceRelations[0]')
    await expect(owner.save()).rejects.toThrow('viewCascades[0]')
    expect(f.stored.get('A')).toBe(JSON.stringify(configuration))
    expect(f.requests.some(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toBe(false)
  })

  it('does not treat constant filter strings as output references', async () => {
    const f = fixture({editableFieldProperties: ['AsName']})
    f.stored.set('A', JSON.stringify({scenarioId: 'A', tables: {OrdersAlias: {modelBinding: {modelId: 'M1', modelName: 'Orders'},
      views: {default: {filterExpression: {field: 'parentId', operator: 'eq', value: {Type: 'GetConstValue', Value: 'amount'}}}}}}}))
    const session = await f.open('A'), fields = session.metadataDataSet.getView('Base_DataModel_Field', 'default')!
    fields.updateEditingValue('AMOUNT', 'AsName', 'renamed'); await session.getFieldEdit('AMOUNT').save()
    expect((await f.open('A')).definitionDataSet?.getView('OrdersAlias', 'default')?.filterExpression).toEqual({field: 'parentId', operator: 'eq', value: {Type: 'GetConstValue', Value: 'amount'}})
  })

  it('preserves formal relationship field names while projecting a changed output alias', async () => {
    const relation = {rowid: 'R', parentModId: 'M1', childModId: 'M2', parentTable: 'Orders', childTable: 'Customers',
      filter: JSON.stringify({Type: 'cond', Field: 'parentId', Operator: 'equal', ValueFun: {Type: 'GetTableField', Field: 'amount'}}), depType: '', cascadeDel: 0}
    const {f, session, fields, owner, writes} = await setup({editableFieldProperties: ['AsName', 'IsOutput'], relationRows: [relation]})
    fields.updateEditingValue('AMOUNT', 'IsOutput', 0)
    await expect(owner.save()).rejects.toThrow('Base_DataModel_Relation')
    owner.discard(); fields.updateEditingValue('AMOUNT', 'AsName', 'renamed'); await owner.save()
    const reopened = await f.open('A')
    expect(reopened.definitionDataSet?.resourceRelations?.[0]?.filterExpression).toEqual({field: 'parentId', operator: 'eq', value: {Type: 'GetTableField', Field: 'renamed'}})
    expect(session.metadataDataSet.getView('Base_DataModel_Relation', 'default')?.rows[0]?.['filter']).toBe(relation.filter)
    expect(writes()).toHaveLength(1)
  })

  it.each(['target', 'parent'])('protects field cascade %s references', async endpoint => {
    const f = fixture({editableFieldProperties: ['AsName']})
    f.stored.set('A', JSON.stringify({scenarioId: 'A', tables: {OrdersAlias: {modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {default: {}, options: {valueField: 'rowid'}}}},
      viewCascades: [{kind: 'field', valueFormat: 'native', cascadeId: 'choice', tableName: 'OrdersAlias', viewId: 'default',
        targetField: endpoint === 'target' ? 'amount' : 'parentId', parents: [{tableName: 'OrdersAlias', viewId: 'default', field: endpoint === 'parent' ? 'amount' : 'parentId', parameter: 'p'}],
        optionsView: {tableName: 'OrdersAlias', viewId: 'options'}, valuePolicy: {mode: 'retain-valid', clearValue: null}}]}))
    const session = await f.open('A'), fields = session.metadataDataSet.getView('Base_DataModel_Field', 'default')!
    fields.updateEditingValue('AMOUNT', 'AsName', 'renamed')
    await expect(session.getFieldEdit('AMOUNT').save()).rejects.toThrow('viewCascades[0]')
    expect(fields.dirtyTracking.hasPendingChanges()).toBe(false)
  })

  it('checks source-derived primary key even when the editable record does not mark it as a key', async () => {
    const {owner, fields, writes} = await setup({formalPrimaryKey: 'amount', editableFieldProperties: ['IsOutput']})
    fields.updateEditingValue('AMOUNT', 'IsOutput', 0)
    await expect(owner.save()).rejects.toThrow('主键'); expect(writes()).toHaveLength(0)
  })

  it.each(['draft', 'permission', 'scope', 'file'])('rejects %s changes during asynchronous output validation', async change => {
    const {f, fields, owner, writes} = await setup({editableFieldProperties: ['AsName']})
    const release = f.holdDefinitionRead()
    fields.updateEditingValue('AMOUNT', 'AsName', 'renamed')
    const pending = owner.save().catch((cause: unknown) => cause)
    try {
      await expect(owner.save()).rejects.toThrow('先核验')
      if (change === 'draft') fields.updateEditingValue('AMOUNT', 'AsName', 'newer')
      if (change === 'permission') {f.denyFieldProperty('AsName'); fields.discardEditingRows(['AMOUNT']); await fields.loadFromServer({allPages: true}); fields.updateEditingValue('AMOUNT', 'AsName', 'renamed')}
      if (change === 'scope') f.invalidate()
      if (change === 'file') f.stored.set('A', `${f.stored.get('A')!} `)
    } finally {release()}
    expect(await pending).toBeInstanceOf(Error); expect(writes()).toHaveLength(0)
  })

  it.each([{hiddenFieldProperties: ['AsName']}, {readOnly: true}])('rejects output changes without original query permission: %j', async options => {
    const {owner, fields, writes} = await setup({editableFieldProperties: ['AsName', 'IsOutput'], ...options})
    fields.updateEditingValue('AMOUNT', 'AsName', 'renamed')
    await expect(owner.save()).rejects.toThrow('不可写'); expect(writes()).toHaveLength(0)
  })

  it.each(['_pk', 'hasChildField', 'primary-alias'])('preserves native identity and model output dependencies: %s', async kind => {
    const {f, owner, fields, writes, session} = await setup({missing: true, editableFieldProperties: ['AsName'], sourceFields: [
      ...originalFields, {rowid: 'HIDDEN', dataModelId: 'M1', type: 'dataModel', Name: 'hidden', AsName: 'hiddenAlias', FieldType: 'string', IsPKey: 0, IsOutput: 0}]})
    if (kind === 'hasChildField') f.setModelValues({hasChildField: 'amount'})
    const id = kind === 'primary-alias' ? 'PK' : 'AMOUNT'
    fields.updateEditingValue(id, 'AsName', kind === 'primary-alias' ? 'hiddenAlias' : kind === '_pk' ? '_pk' : 'renamed')
    await expect((id === 'PK' ? session.getFieldEdit(id) : owner).save()).rejects.toThrow()
    expect(writes()).toHaveLength(0)
  })

  it('does not interpret an incomplete formal relation as proof that an output is unused', async () => {
    const {owner, fields, writes} = await setup({missing: true, editableFieldProperties: ['IsOutput'], relationRows: [
      {rowid: 'R', filter: '{"Type":"cond","Field":"amount","Operator":"equal","ValueFun":{"Type":"GetConstValue","Value":0}}'}]})
    fields.updateEditingValue('AMOUNT', 'IsOutput', 0)
    await expect(owner.save()).rejects.toThrow('模型关系不可核验')
    expect(writes()).toHaveLength(0)
  })

  it.each([
    {Type: 'GetRefData', RefTableName: 'OrdersAlias', RefFieldName: 'amount', FkFieldName: 'rowid'},
    {Type: 'GetGroupData', GroupTableName: 'OrdersAlias', GroupField: 'parentId', Field: 'amount', ValType: 'sum'},
    {Type: 'GetExpData', refTableName: 'OrdersAlias', Exp: 'amount + 1'},
  ])('checks structured and opaque cross-table value sources: $Type', async value => {
    const f = fixture({editableFieldProperties: ['AsName']})
    f.stored.set('A', JSON.stringify({scenarioId: 'A', tables: {
      OrdersAlias: {modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {default: {}}},
      CustomersAlias: {modelBinding: {modelId: 'M2', modelName: 'Customers'}, views: {default: {
        filterExpression: {field: 'parentId', operator: 'eq', value}}}}}}))
    const session = await f.open('A'), fields = session.metadataDataSet.getView('Base_DataModel_Field', 'default')!
    fields.updateEditingValue('AMOUNT', 'AsName', 'renamed')
    await expect(session.getFieldEdit('AMOUNT').save()).rejects.toThrow('CustomersAlias.views.default.filterExpression')
    expect(fields.dirtyTracking.hasPendingChanges()).toBe(false)
  })
})
