import {afterEach, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest'
import {DOMWrapper, flushPromises, mount} from '@vue/test-utils'
import {createMemoryHistory, createRouter} from 'vue-router'
import ElementPlus, {ElTree} from 'element-plus'
import {RendererTable, registerAllRenderers, Spark} from '@spark-appworks/spark-component'
import {resolveDataViewKey} from '@spark-appworks/spark-data'
import {dataSpacePageFixture, designPageHost} from '../data-space-page.fixture'
import {openLowcodeDataSpaceDesignSession} from '@/lowcode/data-space/lowcode-data-space-design'
import {fieldEditReloadBatch, fieldEditSaveBatch} from '@/lowcode/data-space/model-source/field/lowcode-data-space-field-edit-session'
import {LowcodeDataSpaceSourceInputEdit} from '@/lowcode/data-space/model-source/source/lowcode-data-space-source-input-session'
import {verifyAndDiscardDataSpaceDefinitionCapture} from '@/lowcode/data-space/model-source/data-space-definition-save'
import DataSpaceDesignPage from '@/views/features/data-platform/data-set-management/design/ui/data-set-design-page.vue'
import {installAuthenticatedLowcodeTestSession, installRepositoryScenarioTestFetch, restoreLowcodeTestSession} from '../../../../../support/helpers/authenticated-lowcode-session'
import {createDynamicRouter} from '../../../../../../packages/spark-app/src/router/dynamic'

vi.mock('@/lowcode/data-space/lowcode-data-space-design', () => ({openLowcodeDataSpaceDesignSession: vi.fn()}))
vi.mock('@/lowcode/data-space/lowcode-data-space-runtime', async () => {
  const {DataSet} = await import('@spark-appworks/spark-data')
  return {readLowcodeExecutionProject: () => ({projectId: 'APP', assertCurrent() {}}), loadLowcodeRuntimeScenario: vi.fn(async ({scenarioId}: {scenarioId: string}) => DataSet.fromJson({
    scenarioId, tables: {Base_NavigationInfo: {columns: [{name: 'rowid', type: 'string', isPrimaryKey: true}], views: {default: {}}}},
  }))}
})
vi.mock('@/services/project/blueprint-workspace-dataview', () => ({BlueprintWorkspaceDataView: class {
  view: unknown
  constructor(dataSet: {getView: (table: string, view: string) => unknown}) {this.view = dataSet.getView('Base_NavigationInfo', 'default')}
  async loadProjectTree() {return {nodeId: 'ROOT', parentNodeId: '', projectId: 'APP', kind: 'module', capability: {name: 'App'}, source: {}, children: []}}
  treeProjection() {return {nodeId: 'ROOT', parentNodeId: '', projectId: 'APP', kind: 'module', capability: {name: 'App'}, source: {}, children: []}}
  dispose() {}
}, isBlueprintViewAttachedToRuntime: () => true}))
const fixtures: ReturnType<typeof dataSpacePageFixture>[] = []
const wrappers: ReturnType<typeof mount>[] = []
beforeAll(() => registerAllRenderers())
beforeEach(() => {installAuthenticatedLowcodeTestSession({applicationId: 'APP'}); installRepositoryScenarioTestFetch(); vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})})
afterEach(() => {wrappers.splice(0).forEach(wrapper => wrapper.unmount()); fixtures.splice(0).forEach(f => f.dispose()); restoreLowcodeTestSession()})
const fields = [
  {rowid: 'PK', dataModelId: 'M1', Name: 'rowid', AsName: '', type: 'dataModel', FieldType: 'string', IsPKey: 1, IsOutput: 1, ValueFun: ''},
  {rowid: 'PARENT', dataModelId: 'M1', Name: 'parentId', AsName: '', type: 'dataModel', FieldType: 'string', IsPKey: 0, IsOutput: 1, ValueFun: ''},
  {rowid: 'CALC', dataModelId: 'M1', Name: 'total', AsName: 'totalOutput', type: 'dataModel', FieldType: '计算字段', IsPKey: 0, IsOutput: 1, ValueFun: '{"Type":"GetConstValue","Value":0}'},
]
function fixture(options: Parameters<typeof dataSpacePageFixture>[0] = {}) {
  const f = dataSpacePageFixture({allowDelete: true, sourceFields: fields, ...options})
  fixtures.push(f); vi.mocked(openLowcodeDataSpaceDesignSession).mockImplementation(f.open)
  return f
}
async function page(selectField = false) {
  const router = createRouter({history: createMemoryHistory(), routes: []})
  const dynamic = createDynamicRouter({router, pageComponent: designPageHost(DataSpaceDesignPage), componentMap: {'/data-space-design': designPageHost(DataSpaceDesignPage)},
    loadNavigation: async () => ({id: 'root', title: 'Root', childPlacement: 'header',
      items: [{id: 'design', title: '数据空间设计', path: '/data-space-design', itemKind: 'system-page'}]})})
  await dynamic.registerRoutes(); await router.push('/data-space-design?scenarioId=A')
  const instance = dynamic.getSystemPageInstance(router.currentRoute.value)!
  const wrapper = mount(instance.view, {attachTo: document.body, global: {plugins: [router, ElementPlus, Spark.createPlugin()],
    stubs: {SparkComponentRenderer: false, 'spark-component-renderer': false}}})
  wrappers.push(wrapper); await flushPromises()
  if (selectField) {
    const target = wrapper.getComponent(ElTree).vm.store._getAllNodes().find(node => node.key === JSON.stringify(['Base_DataModel_Field', 'CALC']))
    expect(target).toBeDefined()
    const parents = []
    for (let parent = target?.parent; parent?.level; parent = parent.parent) parents.unshift(parent)
    for (const parent of parents) if (!parent.expanded) {
      const button = wrapper.findAll('[data-design-node]').find(item => item.attributes('data-design-node') === parent.key)
      const arrow = button?.element.closest('.el-tree-node__content')?.querySelector('.el-tree-node__expand-icon')
      if (!arrow) throw new Error(`missing parent ${parent.label}`)
      await new DOMWrapper(arrow).trigger('click'); await flushPromises()
    }
    await wrapper.findAll('[data-design-node]').find(item => item.attributes('data-design-node') === target!.key)!.trigger('click'); await flushPromises()
    return wrapper
  }
  await wrapper.findAll('[data-design-node]').find(item => item.text() === 'Orders')!.trigger('click'); await flushPromises()
  const fieldsTab = wrapper.findAll('[role="tab"]').find(tab => tab.text().includes('字段呈现'))
  if (fieldsTab) {await fieldsTab.trigger('click'); await flushPromises()}
  await vi.waitFor(() => expect(wrapper.findAllComponents(RendererTable).some(item => item.props('dataViewKey')?.endsWith('@modelFields'))).toBe(true))
  const table = wrapper.findAllComponents(RendererTable).find(item => item.props('dataViewKey')?.endsWith('@modelFields'))!
  const fieldsView = resolveDataViewKey(table.props('dataViewKey'), fixtures.at(-1)!.sessions.at(-1)!.metadataDataSet)!
  expect(fieldsView.viewId).toBe('modelFields')
  table.getComponent({name: 'GlobalElTableStub'}).vm.$emit('current-change', fieldsView.rows.find(row => row['rowid'] === 'CALC'))
  await flushPromises()
  expect(fieldsView.currentRow?.['rowid']).toBe('CALC')
  return wrapper
}
const writes = (f: ReturnType<typeof fixture>) => f.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')

describe('computed field removal', () => {
  it('uses the shared field save batch for a standalone staged deletion with no remaining edit owners', async () => {
    const f = fixture(), session = await f.open('A'), removal = session.getFieldRemove('CALC')
    await removal.preview(); await removal.stage()
    expect(writes(f)).toEqual([])
    await fieldEditSaveBatch([], [removal])
    expect(writes(f)).toHaveLength(1)
    expect(removal.getState().pending).toBe(false)
    expect((await f.open('A')).metadataDataSet.getView('Base_DataModel_Field')!.rows.some(row => row['rowid'] === 'CALC')).toBe(false)
  })

  it('saves a surviving computed field rename together with a staged deletion', async () => {
    const f = fixture({overviewOnly: true, allowFieldEdit: true, editableFieldProperties: ['Name'], sourceFields: [...fields,
      {...fields[2]!, rowid: 'CALC2', Name: 'other', AsName: 'otherOutput'}]}), session = await f.open('A')
    const view = await session.loadModelFields('M1'), removal = session.getFieldRemove('CALC', 'modelFields')
    await removal.preview(); await removal.stage()
    view.updateEditingValue('CALC2', 'Name', 'renamed')
    await session.getModelEdit('M1').save(view.rows.map(row => session.getFieldEdit(String(row['rowid']), 'modelFields')), [], [removal])
    expect(writes(f)).toHaveLength(1)
    const loaded = await (await f.open('A')).loadModelFields('M1')
    expect(loaded.rows.find(row => row['rowid'] === 'CALC2')?.['Name']).toBe('renamed')
    expect(loaded.rows.some(row => row['rowid'] === 'CALC')).toBe(false)
  })

  it('checks references between new fields in the same batch without mistaking them for deletion dependencies', async () => {
    const f = fixture({overviewOnly: true, allowFieldAdd: true, allowFieldEdit: true, editableFieldProperties: ['description']}), session = await f.open('A')
    const view = await session.loadModelFields('M1'), create = session.getFieldCreate('M1', 'modelFields')
    create.begin(); create.input.updateEditingValue('draft', 'Name', 'first')
    await create.stage()
    create.begin(); create.input.updateEditingValue('draft', 'Name', 'second')
    create.input.updateEditingValue('draft', 'ValueFun', '{"Type":"GetTableField","Field":"first"}')
    await create.stage()
    const removal = session.getFieldRemove('CALC', 'modelFields')
    await removal.preview(); await removal.stage()
    view.updateEditingValue('PARENT', 'description', '一起保存')
    await session.getModelEdit('M1').save(view.rows.map(row => session.getFieldEdit(String(row['rowid']), 'modelFields')), [], [removal])
    expect(writes(f)).toHaveLength(1)
    expect((await (await f.open('A')).loadModelFields('M1')).rows.map(row => row['Name'])).toEqual(expect.arrayContaining(['first', 'second']))
  })

  it('stages an existing deletion in the original view, cancels it and preserves other drafts', async () => {
    const f = fixture({overviewOnly: true, editableFieldProperties: ['description']}), session = await f.open('A')
    const view = await session.loadModelFields('M1'), owner = session.getFieldRemove('CALC', 'modelFields')
    view.updateEditingValue('PARENT', 'description', '保留草稿')
    await owner.preview(); await owner.stage()
    expect(writes(f)).toEqual([])
    expect(view.dirtyTracking.pendingDeleteIds).toEqual(new Set(['CALC']))
    expect(view.rows.some(row => row['rowid'] === 'CALC')).toBe(false)
    owner.cancel()
    expect(view.rows.map(row => row['rowid'])).toEqual(['PK', 'PARENT', 'CALC'])
    expect(view.getEditingPatch('PARENT')).toEqual({description: '保留草稿'})
    expect(view.dirtyTracking.pendingDeleteIds.size).toBe(0)
    expect(writes(f)).toEqual([])
  })

  it.each(['before', 'after'] as const)('saves mixed field creation %s deletion and editing in one original DataView batch', async order => {
    const f = fixture({overviewOnly: true, allowFieldAdd: true, allowFieldEdit: true, editableFieldProperties: ['description']}), session = await f.open('A')
    const view = await session.loadModelFields('M1'), owner = session.getFieldRemove('CALC', 'modelFields')
    if (order === 'after') {await owner.preview(); await owner.stage()}
    const create = session.getFieldCreate('M1', 'modelFields')
    create.begin(); create.input.updateEditingValue('draft', 'Name', 'extra')
    const createdId = await create.stage()
    view.updateEditingValue('PARENT', 'description', '新说明')
    if (order === 'before') {await owner.preview(); await owner.stage()}
    expect(writes(f)).toEqual([])
    await session.getModelEdit('M1').save(view.rows.map(row => session.getFieldEdit(String(row['rowid']), 'modelFields')), [], [owner])
    expect(writes(f)).toHaveLength(1)
    expect(owner.getState().pending).toBe(false)
    expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
    const reopened = await f.open('A'), loaded = await reopened.loadModelFields('M1')
    expect(loaded.rows.some(row => row['rowid'] === 'CALC')).toBe(false)
    expect(loaded.rows.find(row => row['rowid'] === 'PARENT')?.['description']).toBe('新说明')
    expect(loaded.rows.find(row => row['rowid'] === createdId)?.['Name']).toBe('extra')
    expect(f.fileWrites).toEqual([])
  })

  it.each(['before', 'after'].flatMap(order => ['success', 'lost', 'readback'].map(outcome => ({order, outcome}))))('saves source parameters changed $order deletion with model and field changes ($outcome)', async ({order, outcome}) => {
    const f = fixture({overviewOnly: true, allowFieldAdd: true, allowFieldEdit: true, allowSourceEdit: true,
      editableFieldProperties: ['description'], sourceFields: [...fields,
        {rowid: 'I1', dataModelId: 'M1', Name: 'customer', type: 'inputParams', ValueFun: ''}]})
    f.setModelValues({Type: '接口'})
    const session = await f.open('A'), view = await session.loadModelFields('M1')
    const inputView = await session.loadSourceInputFields('M1'), inputs = session.getModelSourceInputs('M1')
    const removal = session.getFieldRemove('CALC', 'modelFields'), model = session.getModelEdit('M1')
    const value = '{"Type":"GetInputParam","ParamName":"customer"}'
    if (order === 'before') inputs[0]!.stage(value)
    await removal.preview(); await removal.stage()
    if (order === 'after') inputs[0]!.stage(value)
    const create = session.getFieldCreate('M1', 'modelFields')
    create.begin(); create.input.updateEditingValue('draft', 'Name', 'extra')
    const createdId = await create.stage()
    view.updateEditingValue('PARENT', 'description', '组合保存字段')
    model.stage('description', '组合保存模型')
    const owners = view.rows.map(row => session.getFieldEdit(String(row['rowid']), 'modelFields'))
    if (outcome === 'lost') f.loseNextResponse()
    if (outcome === 'readback') {
      const save = session.metadataDataSet.saveChanges.bind(session.metadataDataSet)
      vi.spyOn(session.metadataDataSet, 'saveChanges').mockImplementationOnce(async options => {
        const result = await save(options); f.failNextFieldRead(); return result
      })
    }
    if (outcome === 'success') await model.save(owners, inputs, [removal])
    else {
      await expect(model.save(owners, inputs, [removal])).rejects.toThrow()
      await expect(model.save(owners, inputs, [removal])).rejects.toThrow()
      expect(writes(f)).toHaveLength(1)
      const capture = removal.getRecoveryCapture()
      expect(capture).toBeDefined(); expect(model.getRecoveryCapture()).toBe(capture)
      if (outcome !== 'readback') await expect(model.reload(true)).rejects.toThrow('3 字段呈现')
      expect(await verifyAndDiscardDataSpaceDefinitionCapture(session.metadataDataSet, capture!)).toMatch(/confirmed|already-confirmed/)
      await model.reload(true)
      await fieldEditReloadBatch(owners, true)
      await LowcodeDataSpaceSourceInputEdit.reloadBatch(inputs, true)
      expect(await removal.verify()).toBe(outcome === 'readback')
      if (outcome === 'lost') removal.acceptCurrent()
    }
    expect(writes(f)).toHaveLength(1)
    expect(inputView.getEditingRow('I1')?.['ValueFun']).toBe(value)
    expect(inputs[0]!.getState()).toEqual({status: 'idle', pending: false})
    expect(removal.getState().pending).toBe(false)
    expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
    const reopened = await f.open('A'), loaded = await reopened.loadModelFields('M1'), freshInputs = await reopened.loadSourceInputFields('M1')
    expect(loaded.rows.some(row => row['rowid'] === 'CALC')).toBe(false)
    expect(loaded.getEditingRow(createdId)?.['Name']).toBe('extra')
    expect(loaded.getEditingRow('PARENT')?.['description']).toBe('组合保存字段')
    expect(freshInputs.getEditingRow('I1')?.['ValueFun']).toBe(value)
    expect(reopened.getModelEdit('M1').read().fields.find(field => field.name === 'description')?.value).toBe('组合保存模型')
    expect(session.metadataDataSet.getView('Base_DataModel_Field')?.rows).toEqual([])
    expect(session.metadataDataSet.getView('Base_DataModel_Relation')?.rows).toEqual([])
    expect(f.fileWrites).toEqual([])
  })

  it.each(['foreign-draft', 'query', 'field-reference', 'identity', 'late-reference'] as const)('retains source input boundaries during workspace deletion: %s', async mode => {
    const f = fixture({allowSourceEdit: true, sourceFields: [...fields,
      {rowid: 'I1', dataModelId: 'M1', Name: 'customer', type: 'inputParams', ValueFun: ''},
      {rowid: 'I2', dataModelId: 'M2', Name: 'customer', type: 'inputParams', ValueFun: ''}]})
    f.setModelValues({Type: '接口'})
    const session = await f.open('A'), fieldsView = await session.loadModelFields('M1')
    const inputView = await session.loadSourceInputFields('M1'), inputs = session.getModelSourceInputs('M1')
    const removal = session.getFieldRemove('CALC', 'modelFields')
    inputs[0]!.stage('{"Type":"GetConstValue","Value":0}')
    if (mode === 'late-reference') {
      await removal.preview(); await removal.stage()
      inputView.updateEditingValue('I1', 'ValueFun', '{"Type":"GetTableField","Field":"total"}')
      await expect(session.getModelEdit('M1').save(fieldsView.rows.map(row => session.getFieldEdit(String(row['rowid']), 'modelFields')), inputs, [removal])).rejects.toThrow()
      expect(fieldsView.dirtyTracking.pendingDeleteIds.has('CALC')).toBe(true)
    } else {
      if (mode === 'foreign-draft') session.metadataDataSet.getView('Base_DataModel_Field')!.updateEditingValue('I2', 'ValueFun', '{"Type":"GetConstValue","Value":2}')
      if (mode === 'query') inputView.queryContext = {...inputView.queryContext, modelId: 'M2'}
      if (mode === 'field-reference') inputView.updateEditingValue('I1', 'ValueFun', '{"Type":"GetTableField","Field":"total"}')
      if (mode === 'identity') inputView.updateEditingValue('I1', 'Name', 'changedIdentity')
      await expect(removal.preview()).rejects.toThrow()
      expect(fieldsView.rows.some(row => row['rowid'] === 'CALC')).toBe(true)
    }
    expect(inputView.hasEditingChanges('I1')).toBe(true)
    expect(writes(f)).toEqual([])
  })

  it('cancels field deletion while retaining the same-model source parameter draft', async () => {
    const f = fixture({overviewOnly: true, allowSourceEdit: true, sourceFields: [...fields,
      {rowid: 'I1', dataModelId: 'M1', Name: 'customer', type: 'inputParams', ValueFun: ''}]})
    f.setModelValues({Type: '接口'})
    const session = await f.open('A'), view = await session.loadModelFields('M1'), inputView = await session.loadSourceInputFields('M1')
    const input = session.getModelSourceInputs('M1')[0]!, removal = session.getFieldRemove('CALC', 'modelFields')
    input.stage('{"Type":"GetConstValue","Value":false}')
    await removal.preview(); await removal.stage(); removal.cancel()
    expect(view.rows.some(row => row['rowid'] === 'CALC')).toBe(true)
    expect(inputView.getEditingRow('I1')?.['ValueFun']).toBe('{"Type":"GetConstValue","Value":false}')
    expect(input.getState().pending).toBe(true)
    expect(writes(f)).toEqual([])
  })

  it.each([false, true])('removes from the bound model view without loading default directories (lost=%s)', async lost => {
    const f = fixture({overviewOnly: true, deferDefinition: true}), session = await f.open('A')
    const source = await session.loadModelFields('M1'), owner = session.getFieldRemove('CALC', 'modelFields')
    const defaults = ['Base_DataModel_Field', 'Base_DataModel_Relation'].map(name => session.metadataDataSet.getView(name)!)
    await owner.preview(); owner.cancel()
    expect(source.rows.some(row => row['rowid'] === 'CALC')).toBe(true); expect(writes(f)).toHaveLength(0)
    await owner.preview()
    if (lost) {
      f.loseNextResponse(); await expect(owner.save()).rejects.toThrow()
      expect(await owner.verify()).toBe(false)
      expect(owner.getState().verification).toContain('缺少完整删除回执')
      owner.acceptCurrent()
    } else expect(await owner.save()).toBe(true)
    expect(writes(f)).toHaveLength(1)
    expect(defaults.every(view => view.rows.length === 0)).toBe(true)
    const reopened = await f.open('A'), rows = (await reopened.loadModelFields('M1')).rows
    expect(rows.map(row => row['rowid']).sort()).toEqual(['PARENT', 'PK'])
    expect(f.fileWrites).toHaveLength(0)
  })

  it('rejects a new local value-function dependency after staging without losing either draft', async () => {
    const f = fixture({overviewOnly: true, allowFieldEdit: true, editableFieldProperties: ['ValueFun']}), session = await f.open('A')
    const view = await session.loadModelFields('M1'), removal = session.getFieldRemove('CALC', 'modelFields')
    await removal.preview(); await removal.stage()
    const reference = '{"Type":"GetTableField","Field":"total"}'
    view.updateEditingValue('PARENT', 'ValueFun', reference)
    await expect(session.getModelEdit('M1').save(view.rows.map(row => session.getFieldEdit(String(row['rowid']), 'modelFields')), [], [removal])).rejects.toThrow()
    expect(writes(f)).toEqual([])
    expect(view.getEditingPatch('PARENT')).toEqual({ValueFun: reference})
    expect(view.dirtyTracking.pendingDeleteIds.has('CALC')).toBe(true)
  })

  it('keeps staged deletion when remote configuration changes before top save', async () => {
    const f = fixture({overviewOnly: true}), session = await f.open('A')
    const view = await session.loadModelFields('M1'), removal = session.getFieldRemove('CALC', 'modelFields')
    await removal.preview(); await removal.stage()
    const config = JSON.parse(f.stored.get('A')!)
    config.tables.OrdersAlias.views.shared.labelField = 'totalOutput'
    f.stored.set('A', JSON.stringify(config))
    await expect(session.getModelEdit('M1').save(view.rows.map(row => session.getFieldEdit(String(row['rowid']), 'modelFields')), [], [removal])).rejects.toThrow(/配置|变化/)
    expect(removal.getState().status).toBe('staged')
    removal.cancel()
    expect(view.rows.some(row => row['rowid'] === 'CALC')).toBe(true)
    expect(writes(f)).toEqual([])
  })

  it('merges two staged deletions into one view receipt and rejects duplicate identities', async () => {
    const f = fixture({overviewOnly: true, sourceFields: [...fields, {...fields[2]!, rowid: 'CALC2', Name: 'other', AsName: 'otherOutput'}]}), session = await f.open('A')
    const view = await session.loadModelFields('M1'), first = session.getFieldRemove('CALC', 'modelFields'), second = session.getFieldRemove('CALC2', 'modelFields')
    await first.preview(); await first.stage(); await second.preview(); await second.stage()
    const owners = view.rows.map(row => session.getFieldEdit(String(row['rowid']), 'modelFields'))
    await expect(session.getModelEdit('M1').save(owners, [], [first, first, second])).rejects.toThrow(/重复/)
    expect(writes(f)).toEqual([])
    await session.getModelEdit('M1').save(owners, [], [first, second])
    expect(writes(f)).toHaveLength(1)
    expect(first.getState().pending || second.getState().pending).toBe(false)
    expect((await (await f.open('A')).loadModelFields('M1')).rows.map(row => row['rowid'])).toEqual(['PK', 'PARENT'])
  })

  it('rechecks references added after a scoped field deletion preview before dispatch', async () => {
    const f = fixture({overviewOnly: true, deferDefinition: true}), session = await f.open('A')
    await session.loadModelFields('M1')
    const owner = session.getFieldRemove('CALC', 'modelFields'); await owner.preview()
    f.created.set('Base_DataModel_Field', [{rowid: 'LATE', dataSetId: 'A', dataModelId: 'M2', Name: 'input', type: 'inputParams',
      ValueFun: '{"Type":"GetRefData","RefTableName":"Orders","RefFieldName":"total","FkFieldName":"rowid"}'}])
    await expect(owner.save()).rejects.toThrow(/依赖|变化/)
    expect(writes(f)).toHaveLength(0)
    expect(owner.getState().status).toBe('ready'); owner.cancel()
    expect(session.metadataDataSet.getView('Base_DataModel_Field')!.rows).toEqual([])
  })

  async function setup(options: Parameters<typeof dataSpacePageFixture>[0] = {}) {
    const f = fixture(options), session = await f.open('A')
    return {f, session, owner: session.getFieldRemove('CALC'), view: session.metadataDataSet.getView('Base_DataModel_Field', 'default')!}
  }
  it.each(['Orders', 'PhysicalOrders'])('keeps physical field references to %s when removing a computed definition', async source => {
    const raw = ` {"Type":"GetRefData","RefTableName":"${source}","RefFieldName":"total","FkFieldName":"rowid","Extra":false} `
    const {f, owner} = await setup({sourceFields: [...fields,
      {rowid: 'LOOKUP', dataModelId: 'M2', Name: 'reference', type: 'dataModel', FieldType: 'string', ValueFun: raw},
    ]})
    await owner.preview(); owner.cancel()
    expect(writes(f)).toHaveLength(0)
    await owner.preview(); expect(await owner.save()).toBe(true)
    const saved = (await f.open('A')).metadataDataSet.getView('Base_DataModel_Field')!
    expect(saved.rows.some(row => row['rowid'] === 'CALC')).toBe(false)
    expect(saved.rows.find(row => row['rowid'] === 'LOOKUP')?.['ValueFun']).toBe(raw)
    expect(writes(f)).toHaveLength(1)
    expect(writes(f)[0]?.data).toEqual([expect.objectContaining({TableName: 'Base_DataModel_Field',
      CrudModel: {Added: [], Changed: [], Deleted: [expect.objectContaining({rowid: 'CALC'})]}})])
    expect(f.fileWrites).toHaveLength(0)
  })

  it('keeps a computed field that is still referenced by an input mapping', async () => {
    const {f, owner} = await setup({sourceFields: [...fields,
      {rowid: 'INPUT', dataModelId: 'M2', Name: 'argument', type: 'inputParams',
        ValueFun: '{"Type":"GetRefData","RefTableName":"Orders","RefFieldName":"total","FkFieldName":"rowid"}'},
    ]})
    await expect(owner.preview()).rejects.toThrow(/依赖/)
    expect(writes(f)).toHaveLength(0)
  })
  it('preserves another field desensitization rule ID matching the removed field name', async () => {
    const {f, owner} = await setup({sourceFields: fields.map(row => row.rowid === 'PARENT' ? {...row, Expression: 'totalOutput'} : row)})
    await owner.preview(); expect(await owner.save()).toBe(true)
    const reopened = (await f.open('A')).metadataDataSet.getView('Base_DataModel_Field')!
    expect(reopened.rows.some(row => row['rowid'] === 'CALC')).toBe(false)
    expect(reopened.rows.find(row => row['rowid'] === 'PARENT')).toHaveProperty('Expression', 'totalOutput')
    expect(writes(f)).toHaveLength(1); expect(f.fileWrites).toHaveLength(0)
  })

  it('offers a bound standard deletion dialog and cancels without writing', async () => {
    const f = fixture({overviewOnly: true, deferDefinition: true}), wrapper = await page(), session = f.sessions[0]!
    expect(wrapper.find('[data-action="preview-remove-field"]').exists()).toBe(true)
    await wrapper.get('[data-action="preview-remove-field"]').trigger('click'); await flushPromises()
    const body = new DOMWrapper(document.body)
    expect(body.text()).toContain('totalOutput')
    await body.get('[data-action="cancel-remove-field"]').trigger('click'); await flushPromises()
    expect(writes(f)).toEqual([]); expect(f.fileWrites).toEqual([])
    expect(f.sessions[0]!.hasPendingFieldEdits()).toBe(false)
    expect(f.sessions).toHaveLength(1)
    expect(session.metadataDataSet.getView('Base_DataModel_Field')!.rows).toEqual([])
    expect(session.metadataDataSet.getView('Base_DataModel_Field', 'modelFields')!.currentRow?.['rowid']).toBe('CALC')
  })

  it('deletes only the calculated definition in one batch, rereads and reopens the target', async () => {
    const {f, session, owner} = await setup()
    await owner.preview()
    expect(session.hasPendingFieldEdits()).toBe(true)
    expect(writes(f)).toEqual([])
    expect(await owner.save()).toBe(true)
    expect(writes(f)).toHaveLength(1)
    expect(resolveDataViewKey(owner.getState().dataViewKey, session.metadataDataSet)?.rows.map(row => row['rowid'])).toEqual(['PK', 'PARENT'])
    expect(session.metadataDataSet.getView('Base_DataModel_Field')?.rows.map(row => row['rowid'])).toEqual(['PK', 'PARENT'])
    expect(f.fileWrites).toEqual([])
    expect(session.hasPendingFieldEdits()).toBe(false)
    const reopened = await f.open('A')
    expect(reopened.definitionDataSet?.getTable('OrdersAlias')?.columns.map(column => column.name)).not.toContain('totalOutput')
  })
  it('returns the actual page to an available field after confirmed deletion', async () => {
    const f = fixture({overviewOnly: true, deferDefinition: true}), wrapper = await page(), body = new DOMWrapper(document.body)
    await wrapper.get('[data-action="preview-remove-field"]').trigger('click'); await flushPromises()
    await body.get('[data-action="confirm-remove-field"]').trigger('click'); await flushPromises()
    expect(body.find('[data-action="confirm-remove-field"]').exists()).toBe(false)
    await vi.waitFor(() => expect(wrapper.findAllComponents(RendererTable).some(item => item.props('dataViewKey')?.endsWith('@modelFields')), wrapper.text()).toBe(true))
    const table = wrapper.findAllComponents(RendererTable).find(item => item.props('dataViewKey')?.endsWith('@modelFields'))!
    const fieldsView = resolveDataViewKey(table.props('dataViewKey'), f.sessions.at(-1)!.metadataDataSet)!
    expect(fieldsView.rows.map(row => row['rowid'])).toEqual(['PK', 'PARENT'])
    expect(fieldsView.currentRow?.['rowid']).toBe('PK')
    expect(wrapper.findAll('[role="alert"]').map(item => item.text()).join('\n')).not.toContain('不存在')
    expect(wrapper.text()).not.toContain('DATA_SPACE_DESIGN_SESSION_STALE')
    expect(writes(f)).toHaveLength(0)
    expect(fieldsView.dirtyTracking.pendingDeleteIds.has('CALC')).toBe(true)
    expect(wrapper.get('[data-action="save-model-workspace"]').attributes('disabled')).toBeUndefined()
    await wrapper.get('[data-action="save-model-workspace"]').trigger('click'); await flushPromises()
    expect(writes(f)).toHaveLength(1)
    const reopened = await f.open('A')
    expect((await reopened.loadModelFields('M1')).rows.map(row => row['rowid'])).toEqual(['PK', 'PARENT'])
  })
  it.each(['save', 'cancel'] as const)('retains the field-directory deletion workspace for %s after staging', async action => {
    const f = fixture(), wrapper = await page(true), body = new DOMWrapper(document.body), session = f.sessions[0]!
    await wrapper.get('[data-action="preview-remove-field"]').trigger('click'); await flushPromises()
    await body.get('[data-action="confirm-remove-field"]').trigger('click'); await flushPromises()
    expect(session.hasPendingFieldEdits()).toBe(true)
    expect(writes(f)).toHaveLength(0)
    expect(wrapper.text()).toContain('计算字段删除已暂存')
    await wrapper.findAll('[data-design-node]').find(item => item.text() === 'Orders')!.trigger('click'); await flushPromises()
    const control = action === 'save'
      ? wrapper.find('[data-action="save-model-workspace"], [data-action="save-field"]') : wrapper.find('[data-action="cancel-field"]')
    expect(control.exists(), wrapper.text()).toBe(true)
    expect(control.attributes('disabled')).toBeUndefined()
    await control.trigger('click'); await flushPromises()
    expect(session.hasPendingFieldEdits()).toBe(false)
    expect(wrapper.text()).not.toContain('计算字段删除已暂存')
    expect(f.sessions).toHaveLength(1); expect(session.metadataDataSet.destroyed).toBe(false)
    expect(writes(f)).toHaveLength(action === 'save' ? 1 : 0)
    const reopened = await f.open('A'), restored = await reopened.loadModelFields('M1')
    expect(restored.rows.some(row => row['rowid'] === 'CALC')).toBe(action === 'cancel')
  })
  it.each(['lost', 'readback', 'surviving'] as const)('recovers a field-directory deletion through its original workspace (%s)', async outcome => {
    const f = fixture(outcome === 'surviving' ? {omitDeleteWrite: 'Base_DataModel_Field'} : {})
    const wrapper = await page(true), body = new DOMWrapper(document.body), session = f.sessions[0]!
    const original = session.metadataDataSet.getView('Base_DataModel_Field')!
    await wrapper.get('[data-action="preview-remove-field"]').trigger('click'); await flushPromises()
    await body.get('[data-action="confirm-remove-field"]').trigger('click'); await flushPromises()
    if (outcome === 'lost') f.loseNextResponse()
    if (outcome === 'readback') {
      const load = original.loadFromServer.bind(original)
      vi.spyOn(original, 'loadFromServer').mockImplementationOnce(async params => {f.failNextFieldRead(); return load(params)})
    }
    await wrapper.get('[data-action="save-field"]').trigger('click'); await flushPromises()
    expect(session.hasPendingFieldEdits()).toBe(true); expect(writes(f)).toHaveLength(1)
    await wrapper.get('[data-action="verify-field"]').trigger('click'); await flushPromises()
    if (outcome !== 'readback') {
      expect(session.hasPendingFieldEdits()).toBe(true)
      expect(wrapper.find('[data-action="accept-field-removals"]').exists()).toBe(true)
      await wrapper.get('[data-action="accept-field-removals"]').trigger('click'); await flushPromises()
    }
    expect(session.hasPendingFieldEdits()).toBe(false)
    expect(f.sessions).toHaveLength(1); expect(session.metadataDataSet.destroyed).toBe(false)
    expect(writes(f)).toHaveLength(1)
    if (outcome === 'surviving') {
      expect(wrapper.find('[data-action="save-field"]').exists()).toBe(true)
      expect(original.rows.some(row => row['rowid'] === 'CALC')).toBe(true)
    } else {
      expect(wrapper.find('[data-action="save-model-workspace"]').exists()).toBe(true)
      await wrapper.get('[data-model-field="description"] input').setValue('删除恢复后继续编辑')
      await wrapper.get('[data-action="save-model-workspace"]').trigger('click'); await flushPromises()
      expect(writes(f)).toHaveLength(2)
    }
    const reopened = await f.open('A'), restored = await reopened.loadModelFields('M1')
    expect(restored.rows.some(row => row['rowid'] === 'CALC')).toBe(outcome === 'surviving')
    if (outcome !== 'surviving') expect(reopened.getModelEdit('M1').read().fields.find(field => field.name === 'description')?.value).toBe('删除恢复后继续编辑')
  })

  it('keeps a delete-only capture and pending-delete intent until the native result is known', async () => {
    const f = fixture({omitDeleteWrite: 'Base_DataModel_Field'}), wrapper = await page(true), body = new DOMWrapper(document.body)
    const session = f.sessions[0]!, view = session.metadataDataSet.getView('Base_DataModel_Field')!, removal = session.getFieldRemove('CALC')
    await wrapper.get('[data-action="preview-remove-field"]').trigger('click'); await flushPromises()
    await body.get('[data-action="confirm-remove-field"]').trigger('click'); await flushPromises()
    f.loseNextResponse()
    await wrapper.get('[data-action="save-field"]').trigger('click'); await flushPromises()
    const capture = removal.getRecoveryCapture()
    expect(capture).toBeDefined(); expect(session.getModelEdit('M1').getRecoveryCapture()).toBeUndefined()
    expect(view.hasUnconfirmedSave).toBe(true); expect(view.dirtyTracking.isPendingDelete('CALC')).toBe(true)
    expect(writes(f)).toHaveLength(1)

    f.failNextQuery()
    await wrapper.get('[data-action="verify-field"]').trigger('click'); await flushPromises()
    expect(removal.getRecoveryCapture()).toBe(capture)
    expect(view.hasUnconfirmedSave).toBe(true); expect(view.dirtyTracking.isPendingDelete('CALC')).toBe(true)
    expect(writes(f)).toHaveLength(1)

    await wrapper.get('[data-action="verify-field"]').trigger('click'); await flushPromises()
    expect(view.hasUnconfirmedSave).toBe(false)
    expect(view.dirtyTracking.isPendingDelete('CALC')).toBe(false)
    expect(view.rows.some(row => row['rowid'] === 'CALC')).toBe(true)
    expect(wrapper.find('[data-action="accept-field-removals"]').exists()).toBe(true)
    await wrapper.get('[data-action="accept-field-removals"]').trigger('click'); await flushPromises()
    expect(writes(f)).toHaveLength(1); expect(removal.getState().status).toBe('idle')
  })

  it('preserves a later field patch when delete-only native verification is delayed', async () => {
    const f = fixture(), wrapper = await page(true), body = new DOMWrapper(document.body)
    const session = f.sessions[0]!, view = session.metadataDataSet.getView('Base_DataModel_Field')!, removal = session.getFieldRemove('CALC')
    await wrapper.get('[data-action="preview-remove-field"]').trigger('click'); await flushPromises()
    await body.get('[data-action="confirm-remove-field"]').trigger('click'); await flushPromises()
    f.loseNextResponse()
    await wrapper.get('[data-action="save-field"]').trigger('click'); await flushPromises()
    expect(writes(f)).toHaveLength(1)
    const release = f.holdNextQuery(true)
    await wrapper.get('[data-action="verify-field"]').trigger('click')
    await vi.waitFor(() => expect(view.requestState).toBe(3))
    const lateEdit = await view.editRowById('PARENT', {description: '核验期间新草稿'})
    expect(lateEdit).toBe(true)
    release(); await flushPromises()
    expect(removal.getRecoveryCapture()).toBeDefined()
    expect(view.hasUnconfirmedSave).toBe(true)
    expect(view.dirtyTracking.isPendingDelete('CALC')).toBe(true)
    expect(view.getEditingRow('PARENT')?.['description']).toBe('核验期间新草稿')
    expect(writes(f)).toHaveLength(1)
  })

  it('preserves an applied late native diff on an original target during full-batch verification', async () => {
    const f = fixture({overviewOnly: true, allowFieldEdit: true, editableFieldProperties: ['ValueFun']})
    const session = await f.open('A'); await session.loadModelFields('M1')
    const view = session.metadataDataSet.getView('Base_DataModel_Field', 'modelFields')!
    const field = session.getFieldEdit('CALC', 'modelFields')
    view.updateEditingValue('CALC', 'ValueFun', '{"Type":"GetConstValue","Value":7}')
    f.loseNextResponse(); await expect(session.getModelEdit('M1').save([field])).rejects.toThrow()
    const batch = field.getRecoveryCapture()!
    expect(batch).toBeDefined()
    const release = f.holdNextQuery()
    const verification = verifyAndDiscardDataSpaceDefinitionCapture(session.metadataDataSet, batch)
    await vi.waitFor(() => expect(view.requestState).toBe(3))
    expect(await view.editRowById('CALC', {ValueFun: '{"Type":"GetConstValue","Value":8}'})).toBe(true)
    release()
    await expect(verification).rejects.toThrow('原目标出现新草稿')
    expect(view.hasUnconfirmedSave).toBe(false)
    expect(view.getDirtyChanges('CALC')).toMatchObject({ValueFun: {from: '{"Type":"GetConstValue","Value":7}', to: '{"Type":"GetConstValue","Value":8}'}})
    expect(view.rows.find(row => row['rowid'] === 'CALC')?.['ValueFun']).toBe('{"Type":"GetConstValue","Value":8}')
    expect(writes(f)).toHaveLength(1)
  })

  it('keeps the page recovery dialog after the field disappears and does not replay', async () => {
    const f = fixture({overviewOnly: true, deferDefinition: true}), wrapper = await page(), body = new DOMWrapper(document.body)
    await wrapper.get('[data-action="preview-remove-field"]').trigger('click'); await flushPromises()
    await body.get('[data-action="confirm-remove-field"]').trigger('click'); await flushPromises()
    f.loseNextResponse()
    await wrapper.get('[data-action="save-model-workspace"]').trigger('click'); await flushPromises()
    await wrapper.get('[data-action="verify-field"]').trigger('click'); await flushPromises()
    expect(wrapper.find('[data-action="accept-field-removals"]').exists(), wrapper.text()).toBe(true)
    expect(f.sessions[0]!.hasPendingFieldEdits()).toBe(true)
    await wrapper.get('[data-action="accept-field-removals"]').trigger('click'); await flushPromises()
    expect(f.sessions.at(-1)!.hasPendingFieldEdits()).toBe(false)
    expect(writes(f)).toHaveLength(1)
    expect(f.sessions).toHaveLength(1)
  })
  it('submits source parameter edits and a staged deletion through the actual page toolbar', async () => {
    const f = fixture({overviewOnly: true, allowSourceEdit: true, sourceFields: [...fields,
      {rowid: 'I1', dataModelId: 'M1', Name: 'customer', type: 'inputParams', ValueFun: ''}]})
    f.setModelValues({Type: '接口'})
    const wrapper = await page(), body = new DOMWrapper(document.body), session = f.sessions.at(-1)!
    await vi.waitFor(() => expect(session.metadataDataSet.getView('Base_DataModel_Field', 'sourceInputFields')?.rows[0]?.['rowid']).toBe('I1'))
    const structureTab = wrapper.findAll('[role="tab"]').find(tab => tab.text().includes('模型结构'))
    if (structureTab) {await structureTab.trigger('click'); await flushPromises()}
    await vi.waitFor(() => expect(wrapper.findAllComponents(RendererTable).some(item => item.props('dataViewKey')?.endsWith('@sourceInputFields'))).toBe(true))
    const table = wrapper.findAllComponents(RendererTable).find(item => item.props('dataViewKey')?.endsWith('@sourceInputFields'))!
    expect(resolveDataViewKey(table.props('dataViewKey'), session.metadataDataSet)?.viewId).toBe('sourceInputFields')
    session.getModelSourceInputs('M1')[0]!.stage('{"Type":"GetConstValue","Value":false}')
    await flushPromises()
    const fieldsTabAgain = wrapper.findAll('[role="tab"]').find(tab => tab.text().includes('字段呈现'))
    if (fieldsTabAgain) {await fieldsTabAgain.trigger('click'); await flushPromises()}
    expect(wrapper.get('[data-action="preview-remove-field"]').attributes('disabled')).toBeUndefined()
    await wrapper.get('[data-action="preview-remove-field"]').trigger('click'); await flushPromises()
    await body.get('[data-action="confirm-remove-field"]').trigger('click'); await flushPromises()
    expect(wrapper.get('[data-action="save-model-workspace"]').attributes('disabled')).toBeUndefined()
    await wrapper.get('[data-action="save-model-workspace"]').trigger('click'); await flushPromises()
    expect(writes(f)).toHaveLength(1)
    expect(session.hasPendingSourceInputs()).toBe(false)
    expect(session.hasPendingFieldEdits()).toBe(false)
    const reopened = await f.open('A'), restored = await reopened.loadSourceInputFields('M1')
    expect(restored.getEditingRow('I1')?.['ValueFun']).toBe('{"Type":"GetConstValue","Value":false}')
    expect((await reopened.loadModelFields('M1')).rows.some(row => row['rowid'] === 'CALC')).toBe(false)
  })
  it.each(['PK', 'PARENT'])('rejects non-computed field %s', async id => {
    const {f, session} = await setup()
    await expect(session.getFieldRemove(id).preview()).rejects.toThrow('计算字段')
    expect(writes(f)).toEqual([])
  })
  it('rejects a computed field that the formal model resolves as primary key', async () => {
    const {owner, f} = await setup({formalPrimaryKey: 'total'})
    await expect(owner.preview()).rejects.toThrow('主键')
    expect(writes(f)).toEqual([])
  })
  it.each([{allowDelete: false}, {hiddenFieldProperties: ['FieldType']}])('respects current query permission and readable identity: %j', async options => {
    const {owner, f} = await setup(options)
    await expect(owner.preview()).rejects.toThrow()
    expect(writes(f)).toEqual([])
  })
  it.each(['labelField', 'queryConfig'])('blocks named-view %s references and leaves the original configuration untouched', async property => {
    const {f} = await setup(), config = JSON.parse(f.stored.get('A')!)
    if (property === 'labelField') config.tables.OrdersAlias.views.shared.labelField = 'totalOutput'
    else config.tables.OrdersAlias.views.shared.queryConfig = {tree: {keyField: 'rowid', parentField: 'totalOutput', nodeId: 'root'}}
    const text = JSON.stringify(config); f.stored.set('A', text)
    const session = await f.open('A')
    await expect(session.getFieldRemove('CALC').preview()).rejects.toThrow(property)
    expect(f.stored.get('A')).toBe(text); expect(writes(f)).toEqual([])
  })
  it.each([0, 1])('blocks a surviving field value-function reference even when IsOutput=%s', async output => {
    const {f, owner} = await setup({sourceFields: fields.map(row => row.rowid === 'CALC' ? {...row, IsOutput: output}
      : row.rowid === 'PARENT' ? {...row, ValueFun: '{"Type":"GetTableField","Field":"total"}'} : row)})
    await expect(owner.preview()).rejects.toThrow('ValueFun')
    expect(writes(f)).toEqual([])
  })
  it('diagnoses an unresolved field reference before deleting', async () => {
    const {f, owner} = await setup({sourceFields: fields.map(row => row.rowid === 'PARENT'
      ? {...row, ValueFun: '{"Type":"GetTableField","Field":"missing"}'} : row)})
    await expect(owner.preview()).rejects.toThrow('无法核验')
    expect(writes(f)).toEqual([])
  })
  it('does not interpret constant objects as field references', async () => {
    const {owner} = await setup({sourceFields: fields.map(row => row.rowid === 'PARENT'
      ? {...row, ValueFun: '{"Type":"GetConstValue","Value":{"Field":"total","Type":"GetTableField"}}'} : row)})
    await expect(owner.preview()).resolves.toBeUndefined()
    owner.cancel()
  })
  it.each(['metadata', 'scope', 'file'])('refuses stale %s during async validation', async kind => {
    const {owner, f, view} = await setup(), release = f.holdDefinitionRead()
    const preview = owner.preview(), rejected = expect(preview).rejects.toThrow()
    await flushPromises()
    if (kind === 'metadata') view.total = 999
    if (kind === 'scope') f.invalidate()
    if (kind === 'file') f.stored.set('A', '{"scenarioId":"A","tables":{}}')
    release(); await rejected
    expect(writes(f)).toEqual([])
  })
  it('does not discard unrelated editing when deletion is requested', async () => {
    const {owner, view, f} = await setup({editableFieldProperties: ['description']})
    view.updateEditingValue('PARENT', 'description', 'keep draft')
    await expect(owner.preview()).rejects.toThrow('草稿')
    expect(view.getEditingPatch('PARENT')).toEqual({description: 'keep draft'})
    expect(writes(f)).toEqual([])
  })
  it.each([{}, {omitDeleteReceipt: 'Base_DataModel_Field'}])('retains unknown deletion and never replays: %j', async options => {
    const {owner, f} = await setup(options)
    await owner.preview()
    if (!options.omitDeleteReceipt) f.loseNextResponse()
    await expect(owner.save()).rejects.toThrow()
    expect(owner.getState().status).toBe('unknown')
    await expect(owner.save()).rejects.toThrow('重复提交')
    expect(await owner.verify()).toBe(false)
    expect(owner.getState().verification).toContain('缺少')
    owner.acceptCurrent()
    expect(writes(f)).toHaveLength(1)
  })
  it('keeps a confirmed but failed readback pending, then retries only reading', async () => {
    const {owner, f} = await setup(), release = f.holdModelResponse()
    await owner.preview()
    const saving = owner.save(), rejected = expect(saving).rejects.toThrow()
    await flushPromises(); f.failNextFieldRead(); release(); await rejected
    expect(owner.getState().status).toBe('readback')
    expect(await owner.verify()).toBe(true)
    expect(writes(f)).toHaveLength(1)
  })
  it('retries a failed original-view readback after a confirmed receipt without another write', async () => {
    const {owner, view, f} = await setup()
    await owner.preview()
    const load = view.loadFromServer.bind(view)
    vi.spyOn(view, 'loadFromServer').mockImplementationOnce(async params => {f.failNextFieldRead(); return load(params)})
    await expect(owner.save()).rejects.toThrow()
    expect(owner.getState().status).toBe('readback')
    expect(await owner.verify()).toBe(true)
    expect(writes(f)).toHaveLength(1)
  })
  it('does not claim success when the record survives a positive receipt', async () => {
    const {owner, f} = await setup({omitDeleteWrite: 'Base_DataModel_Field'})
    await owner.preview(); await expect(owner.save()).rejects.toThrow()
    expect(await owner.verify()).toBe(false)
    expect(owner.getState().verification).toContain('仍存在')
    owner.acceptCurrent(); expect(writes(f)).toHaveLength(1)
  })
})
