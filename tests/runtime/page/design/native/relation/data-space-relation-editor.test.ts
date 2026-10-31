import {afterEach, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest'
import {DOMWrapper, flushPromises, mount} from '@vue/test-utils'
import {createMemoryHistory, createRouter} from 'vue-router'
import ElementPlus, {ElButton, ElSelect, ElOption, ElTree, ElCheckbox} from 'element-plus'
import {FieldText, FieldTextarea, FieldJson, FieldSelect, FieldCheckbox, FilterExpressionEditor, RendererFilterExpression, SparkJsonEditor, Spark, registerAllRenderers, RendererButton, RendererForm} from '@spark-appworks/spark-component'
import {resolveDataViewKey, RequestState} from '@spark-appworks/spark-data'
import {isRecord} from '@spark-appworks/spark-utils'
import {getVuePageEntry} from '@/registries/vue-page-registry'
import {createDynamicRouter} from '../../../../../../packages/spark-app/src/router/dynamic'
import {installAuthenticatedLowcodeTestSession, installRepositoryScenarioTestFetch, restoreLowcodeTestSession} from '../../../../../support/helpers/authenticated-lowcode-session'
import {openLowcodeDataSpaceDesignSession} from '@/lowcode/data-space/lowcode-data-space-design'
import {dataSpacePageFixture, designPageHost} from '../data-space-page.fixture'
import {VueFlow} from '@vue-flow/core'

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
const wrappers: ReturnType<typeof mount>[] = []
const fixtures: ReturnType<typeof dataSpacePageFixture>[] = []
beforeAll(async () => {registerAllRenderers(); await getVuePageEntry('/features/data-platform/data-set-management/design/ui/data-set-design-page')!.load()}, 30000)
beforeEach(() => {
  installAuthenticatedLowcodeTestSession({applicationId: 'APP'})
  installRepositoryScenarioTestFetch()
  vi.mocked(openLowcodeDataSpaceDesignSession).mockReset()
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
})
afterEach(() => {wrappers.splice(0).forEach(wrapper => wrapper.unmount()); fixtures.splice(0).forEach(f => f.dispose()); restoreLowcodeTestSession()})
function fixture(options: Parameters<typeof dataSpacePageFixture>[0] = {}) {
  const f = dataSpacePageFixture(options); fixtures.push(f)
  vi.mocked(openLowcodeDataSpaceDesignSession).mockImplementation(f.open)
  return f
}
async function page(target = 'A') {
  const component = (await getVuePageEntry('/features/data-platform/data-set-management/design/ui/data-set-design-page')!.load()).default
  const router = createRouter({history: createMemoryHistory(), routes: []})
  const dynamic = createDynamicRouter({router, pageComponent: designPageHost(component), componentMap: {'/data-space-design': designPageHost(component)},
    loadNavigation: async () => ({id: 'root', title: 'Root', childPlacement: 'header',
      items: [{id: 'design', title: '数据空间设计', path: '/data-space-design', itemKind: 'system-page'}]})})
  await dynamic.registerRoutes(); await router.push(`/data-space-design?scenarioId=${target}`)
  const instance = dynamic.getSystemPageInstance(router.currentRoute.value)!
  const wrapper = mount(instance.view, {attachTo: document.body, global: {plugins: [router, ElementPlus, Spark.createPlugin()],
    stubs: {'el-button': ElButton, SparkJsonEditor: true, JsonTreeEditor: true, SparkComponentRenderer: false, 'spark-component-renderer': false}}})
  wrappers.push(wrapper); await flushPromises()
  return {wrapper, instance}
}
async function select(wrapper: ReturnType<typeof mount>, label: string) {
  const tree = wrapper.getComponent(ElTree)
  function path(items: readonly unknown[]): string[] | undefined {
    for (const item of items) {
      if (!isRecord(item) || typeof item['id'] !== 'string') continue
      if (item['label'] === label) return [item['id']]
      const child = Array.isArray(item['children']) ? path(item['children']) : undefined
      if (child) return [item['id'], ...child]
    }
    return undefined
  }
  for (const id of path(tree.props('data') ?? [])?.slice(0, -1) ?? []) {
    tree.vm.getNode(id)?.expand()
    await flushPromises()
  }
  const node = wrapper.findAll('[data-design-node]').find(item => item.text() === label)
  if (!node) throw new Error(`missing node ${label}`)
  await node.trigger('click'); await flushPromises()
}
function boundInput(wrapper: ReturnType<typeof mount>, label: string) {
  const field = [...wrapper.findAllComponents(FieldText), ...wrapper.findAllComponents(FieldTextarea)].find(item => item.props().label === label)
  if (!field) throw new Error(`missing bound input ${label}`)
  expect(field.props().modelValue).toBeUndefined()
  return field.get('input,textarea')
}
function boundSelect(wrapper: ReturnType<typeof mount>, label: string) {
  const field = wrapper.findAllComponents(FieldSelect).find(item => item.props('label') === label)
  if (!field) throw new Error(`missing bound select ${label}`)
  expect(field.props('modelValue')).toBeUndefined()
  if (label.endsWith('模型绑定')) expect(field.props('options')).toBeUndefined()
  return field.getComponent(ElSelect)
}
async function chooseBound(wrapper: ReturnType<typeof mount>, label: string, value: string) {
  const select = boundSelect(wrapper, label)
  expect(select.props('disabled')).toBe(false)
  await select.get('.el-select__wrapper').trigger('click'); await flushPromises()
  expect(select.findAllComponents(ElOption).map(option => option.props('value'))).toContain(value)
  await select.findAllComponents(ElOption).find(option => String(option.props('value')) === value)!.trigger('click'); await flushPromises()
}
function boundBoolean(wrapper: ReturnType<typeof mount>, field: string) {
  return wrapper.findAllComponents(FieldCheckbox).find(component => component.props('field') === field)!.getComponent(ElCheckbox)
}
async function setBoundBoolean(wrapper: ReturnType<typeof mount>, field: string, value: boolean) {
  const control = boundBoolean(wrapper, field)
  expect(control.props('disabled')).toBe(false)
  control.vm.$emit('update:modelValue', value); await flushPromises()
}
const expression = {logic: 'and', filters: [
  {field: 'parentId', operator: 'eq', value: {Type: 'GetTableField', Field: 'CustomersAlias.rowid'}},
  {logic: 'or', filters: [{field: 'rowid', operator: 'ne', value: 'excluded'}, {field: 'rowid', operator: 'eq', value: 'exception'}]},
]}
const native = {relationId: 'ORDERS', relationName: '客户订单', parentTable: 'CustomersAlias', childTable: 'OrdersAlias', filterExpression: expression}
async function seed(f: ReturnType<typeof dataSpacePageFixture>, relations: unknown[] = [native]) {
  const opened = await f.open('A'); opened.dispose()
  const config = JSON.parse(f.stored.get('A')!)
  config.resourceRelations = relations
  f.stored.set('A', JSON.stringify(config))
}
async function add(wrapper: ReturnType<typeof mount>, id = 'ORDERS') {
  await select(wrapper, '原生关系定义')
  await boundInput(wrapper, '新关系标识').setValue(id)
  await wrapper.get('[data-action="add-relation"]').trigger('click'); await flushPromises()
  await chooseBound(wrapper, '父模型绑定', 'CustomersAlias')
  await chooseBound(wrapper, '子模型绑定', 'OrdersAlias')
}
async function editFilter(wrapper: ReturnType<typeof mount>, tree: unknown) {
  await wrapper.get('[data-relation-filter] [data-action="open"]').trigger('click'); await flushPromises()
  const body = new DOMWrapper(document.body)
  await body.get('[data-action="json"]').trigger('click'); await body.get('[data-action="json-text"]').trigger('click')
  wrapper.getComponent(SparkJsonEditor).vm.$emit('update:modelValue', JSON.stringify(tree)); await flushPromises()
  await body.get('[data-action="apply"]').trigger('click'); await flushPromises()
}
async function connect(wrapper: ReturnType<typeof mount>, source = 'Customers', target = 'Orders') {
  const flow = wrapper.getComponent(VueFlow), nodes = flow.props('nodes')!
  flow.vm.$emit('connect', {source: nodes.find(node => node.data?.title === source)!.id, target: nodes.find(node => node.data?.title === target)!.id})
  await flushPromises()
}

describe('native relation definition editor', () => {
  it('saves, verifies and independently reopens native relation edits while an unrelated view cannot assemble', async () => {
    const f = fixture({overviewOnly: true, deferDefinition: true}); await seed(f)
    const config = JSON.parse(f.stored.get('A')!); config.schemaVersion = 2
    config.tables.Unrelated = {modelBinding: {modelId: 'M2', modelName: 'Customers'}, views: {default: {labelField: 'absent'}}}
    f.stored.set('A', JSON.stringify(config))
    const proof = await f.open('A')
    await expect(proof.loadDefinition()).rejects.toThrow('SCENARIO_VIEW_FIELD'); proof.dispose()
    f.assemblyScopes.splice(0)
    const {wrapper, instance} = await page(); await select(wrapper, 'ORDERS')
    await boundInput(wrapper, '关系名称').setValue('cancelled')
    await wrapper.get('[data-action="discard-relations"]').trigger('click'); await flushPromises()
    await select(wrapper, 'ORDERS')
    expect(boundInput(wrapper, '关系名称').element).toHaveProperty('value', native.relationName)
    await boundInput(wrapper, '关系名称').setValue('scoped and verified')
    f.loseNextFileResponse()
    await wrapper.get('[data-action="save-relations"]').trigger('click'); await flushPromises()
    expect(f.assemblyScopes).toEqual([['OrdersAlias', 'CustomersAlias']])
    expect(f.fileWrites).toHaveLength(1)
    expect(instance.isDirty).toBe(true)
    await wrapper.get('[data-action="verify-relations"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false)
    expect(f.fileWrites).toHaveLength(1)
    expect(JSON.parse(f.stored.get('A')!).tables).toEqual(config.tables)
    await select(wrapper, 'ORDERS')
    expect(wrapper.getComponent(RendererFilterExpression).props('columns')).not.toHaveLength(0)
    const again = await page(); await select(again.wrapper, 'ORDERS')
    expect(boundInput(again.wrapper, '关系名称').element).toHaveProperty('value', 'scoped and verified')
    expect(f.sessions.at(-1)!.definitionStatus).toBe('unloaded')
    f.assemblyScopes.splice(0)
    await again.wrapper.get('[data-action="remove-relation"]').trigger('click'); await flushPromises()
    await again.wrapper.get('[data-action="save-relations"]').trigger('click'); await flushPromises()
    expect(f.assemblyScopes).toEqual([])
    expect(f.fileWrites).toHaveLength(2)
    expect(JSON.parse(f.stored.get('A')!)).toEqual({...config, resourceRelations: []})
  })
  it('edits a native relation with scoped formal fields while the unrelated full target cannot assemble', async () => {
    const f = fixture({overviewOnly: true, deferDefinition: true, broken: true})
    await seed(f)
    const config = JSON.parse(f.stored.get('A')!); config.schemaVersion = 2
    config.tables.LaterAlias = {modelBinding: {modelId: 'M2', modelName: 'Customers'}, views: {default: {}}}
    f.stored.set('A', JSON.stringify(config)); f.modelReads.splice(0); f.assemblyScopes.splice(0)
    const {wrapper} = await page()
    await select(wrapper, 'ORDERS')
    const session = f.sessions.at(-1)!
    expect(session.definitionStatus).toBe('unloaded')
    expect(f.assemblyScopes).toEqual([])
    expect(f.modelReads.map(input => input.modelId).sort()).toEqual(['M1', 'M2'])
    const filter = wrapper.getComponent(RendererFilterExpression)
    expect(filter.props('functionContext')?.tables?.map(table => table.name)).toEqual(['OrdersAlias', 'CustomersAlias', 'LaterAlias'])
    await editFilter(wrapper, {field: 'parentId', operator: 'eq', value: {Type: 'GetRefData', RefTableName: 'LaterAlias', RefFieldName: 'rowid', FkFieldName: 'parentId'}})
    expect(f.modelReads.map(input => input.modelId).sort()).toEqual(['M1', 'M2', 'M2'])
    expect(f.assemblyScopes).toEqual([])
    expect(session.metadataDataSet.getView('DataResourceRelationDefinition')!.getEditingRow(JSON.stringify(['native', 'ORDERS']))?.['filterExpression'])
      .toMatchObject({value: {RefTableName: 'LaterAlias'}})
    await wrapper.get('[data-action="discard-relations"]').trigger('click'); await flushPromises()
    await select(wrapper, 'ORDERS')
    expect(wrapper.getComponent(RendererFilterExpression).props('functionContext')?.tables).toHaveLength(3)
    expect(session.metadataDataSet.getView('Base_DataModel_Field')!.requestState).toBe(RequestState.Idle)
    expect(f.fileWrites).toEqual([])
  })

  it.each([2, undefined])('opens, cancels and saves relationships without the metadata field directory (schema %s)', async schemaVersion => {
    const f = fixture({overviewOnly: true, deferDefinition: true, relationRows: [{rowid: 'R', parentModId: 'M2', childModId: 'M1', parentTable: 'Customers', childTable: 'Orders', depType: '', cascadeDel: 0,
      filter: '{"Type":"cond","Field":"parentId","Operator":"equal","ValueFun":{"Type":"GetTableField","Field":"rowid"}}'}]})
    await seed(f)
    const config = JSON.parse(f.stored.get('A')!)
    config.schemaVersion = schemaVersion
    f.stored.set('A', JSON.stringify(config))
    f.requests.splice(0)
    f.failNextFieldRead()
    const {wrapper, instance} = await page()
    await select(wrapper, 'ORDERS')
    expect(wrapper.getComponent(RendererFilterExpression).props('field')).toBe('filterExpression')
    const session = f.sessions.at(-1)!
    expect(session.metadataDataSet.getView('Base_DataModel_Field')!.requestState).toBe(RequestState.Idle)
    expect(session.metadataDataSet.getView('Base_DataModel_Field')!.rows).toEqual([])
    expect(session.metadataDataSet.getView('Base_DataModel_Relation')!.requestState).toBe(schemaVersion === 2 ? RequestState.Idle : RequestState.Loaded)
    await boundInput(wrapper, '关系名称').setValue('取消的名称')
    await wrapper.get('[data-action="discard-relations"]').trigger('click'); await flushPromises()
    await select(wrapper, 'ORDERS')
    expect(boundInput(wrapper, '关系名称').element).toHaveProperty('value', native.relationName)
    expect(instance.isDirty).toBe(false)
    const next = {logic: 'and', filters: [expression, {field: 'rowid', operator: 'ne', value: 'archived'}]}
    await editFilter(wrapper, next)
    await wrapper.get('[data-action="save-relations"]').trigger('click'); await flushPromises()
    expect(f.fileWrites).toHaveLength(1)
    expect(instance.isDirty).toBe(false)
    expect(f.requests.filter(request => JSON.stringify(request.data).includes('Base_DataModel_Field'))).toHaveLength(0)
    expect(f.requests.filter(request => request.url.includes('BatchTableOperate'))).toHaveLength(0)
    const reopened = await f.open('A', {deferDefinition: false})
    expect(reopened.definitionDataSet!.resourceRelations).toContainEqual({...native, filterExpression: next})
    if (schemaVersion !== 2) {
      expect(reopened.definitionDataSet!.resourceRelations).toContainEqual(expect.objectContaining({sourceRelationId: 'R'}))
      expect(session.metadataDataSet.getView('Base_DataModel_Relation')!.rows).toHaveLength(1)
    }
  })

  it('opens the bound relationship filter directly from its summary and cancels without changing the definition', async () => {
    const f = fixture(); await seed(f)
    const original = f.stored.get('A')!, {wrapper, instance} = await page(); await select(wrapper, 'ORDERS')
    const filter = wrapper.getComponent(RendererFilterExpression)
    expect(filter.props('field')).toBe('filterExpression')
    expect(filter.props('dataMember')).toBe('currentRow')
    expect(filter.props('displayMode')).toBe('box')
    expect(resolveDataViewKey(filter.props('dataViewKey'), f.sessions.at(-1)!.metadataDataSet)).toBe(f.sessions.at(-1)!.metadataDataSet.getView('DataResourceRelationDefinition'))
    expect(wrapper.find('[data-action="edit-relation-filter"]').exists()).toBe(false)
    expect(wrapper.find('[aria-label="模型关系编辑"] pre').exists()).toBe(false)
    expect(wrapper.find('[data-definition-detail]').exists()).toBe(false)
    expect(new DOMWrapper(document.body).get('[role="dialog"]').attributes('aria-label')).toBe('节点关系设置')
    await filter.get('[data-action="open"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(true)
    expect(wrapper.get('[data-action="save-relations"]').attributes('disabled')).toBeDefined()
    expect(boundSelect(wrapper, '父模型绑定').props('disabled')).toBe(true)
    const body = new DOMWrapper(document.body)
    await body.get('[data-action="json"]').trigger('click'); await body.get('[data-action="json-text"]').trigger('click')
    wrapper.getComponent(SparkJsonEditor).vm.$emit('update:modelValue', JSON.stringify({field: 'rowid', operator: 'eq', value: 'cancelled'})); await flushPromises()
    await body.get('[data-action="cancel"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false)
    expect(wrapper.getComponent(FilterExpressionEditor).props('modelValue')).toEqual(expression)
    expect(boundSelect(wrapper, '父模型绑定').props('disabled')).toBe(false)
    expect(f.stored.get('A')).toBe(original); expect(f.fileWrites).toHaveLength(0)
  })

  it('applies an independent relationship filter and saves it without a second finish action', async () => {
    const f = fixture(); await seed(f)
    const {wrapper} = await page(); await select(wrapper, 'ORDERS')
    const next = {logic: 'or', filters: [expression, {field: 'rowid', operator: 'eq', value: 'extra'}]}
    await wrapper.getComponent(RendererFilterExpression).get('[data-action="open"]').trigger('click'); await flushPromises()
    const body = new DOMWrapper(document.body)
    await body.get('[data-action="json"]').trigger('click'); await body.get('[data-action="json-text"]').trigger('click')
    wrapper.getComponent(SparkJsonEditor).vm.$emit('update:modelValue', JSON.stringify(next)); await flushPromises()
    await body.get('[data-action="apply"]').trigger('click'); await flushPromises()
    expect(wrapper.find('[data-action="finish-relation-filter"]').exists()).toBe(false)
    expect(wrapper.getComponent(FilterExpressionEditor).props('modelValue')).toEqual(next)
    expect(wrapper.get('[data-action="save-relations"]').attributes('disabled')).toBeUndefined()
    await wrapper.get('[data-action="save-relations"]').trigger('click'); await flushPromises()
    expect(f.fileWrites).toHaveLength(1)
    expect(f.requests.filter(request => request.url.includes('BatchTableOperate'))).toHaveLength(0)
    expect((await f.open('A')).definitionDataSet!.resourceRelations).toEqual([{...native, filterExpression: next}])
  })

  it('keeps self-relation drafts in their owning page and persists only their explicit filter', async () => {
    const f = fixture()
    const first = await page(), second = await page()
    await connect(first.wrapper, 'Customers', 'Customers')
    expect(first.instance.isDirty).toBe(true); expect(second.instance.isDirty).toBe(false)
    expect(f.sessions.at(-1)!.metadataDataSet.getView('DataResourceRelationDefinition', 'default')!.rows).toHaveLength(0)
    expect(boundSelect(first.wrapper, '父模型绑定').props('modelValue')).toBe('CustomersAlias')
    expect(boundSelect(first.wrapper, '子模型绑定').props('modelValue')).toBe('CustomersAlias')
    await boundInput(first.wrapper, '关系标识').setValue('SELF')
    const filter = {field: 'rowid', operator: 'ne', value: 'excluded'}
    await editFilter(first.wrapper, filter)
    await first.wrapper.get('[data-action="save-relations"]').trigger('click'); await flushPromises()
    expect(f.fileWrites).toHaveLength(1)
    const reopened = await f.open('A')
    expect(reopened.definitionDataSet?.resourceRelations?.find(item => item.relationId === 'SELF')).toMatchObject({parentTable: 'CustomersAlias', childTable: 'CustomersAlias', filterExpression: filter})
  })

  it('opens an existing relationship without a new draft and refuses ambiguous parallel relations', async () => {
    const f = fixture(); await seed(f)
    const {wrapper, instance} = await page()
    await connect(wrapper)
    expect(boundInput(wrapper, '关系标识').element).toHaveProperty('value', 'ORDERS')
    expect(instance.isDirty).toBe(false); expect(f.fileWrites).toHaveLength(0)
    wrapper.unmount()
    const config = JSON.parse(f.stored.get('A')!)
    config.resourceRelations.push({...native, relationId: 'ORDERS2'})
    f.stored.set('A', JSON.stringify(config))
    const other = await page()
    await connect(other.wrapper)
    expect(other.wrapper.text()).toContain('两端已有多条关系')
    expect(other.instance.isDirty).toBe(false)
    expect(f.sessions.at(-1)!.metadataDataSet.getView('DataResourceRelationDefinition', 'default')!.rows).toHaveLength(2)
  })

  it('keeps conversion provenance separate from a newly added native record', async () => {
    const f = fixture({relationRows: [{rowid: 'R', parentModId: 'M2', childModId: 'M1', parentTable: 'Customers', childTable: 'Orders', depType: '', cascadeDel: 0,
      filter: '{"Type":"cond","Field":"parentId","Operator":"equal","ValueFun":{"Type":"GetTableField","Field":"rowid"}}'}]})
    const {wrapper, instance} = await page()
    await connect(wrapper)
    expect(wrapper.text()).toContain('此关系已按本仓结构编辑')
    expect(wrapper.get('[data-relation-filter] [data-action="open"]').attributes('disabled')).toBeUndefined()
    expect(instance.isDirty).toBe(false)
    expect(f.sessions.at(-1)!.metadataDataSet.getView('DataResourceRelationDefinition', 'default')!.rows).toHaveLength(1)
    expect(f.fileWrites).toHaveLength(0)
  })

  it('requires a complete filter and retains a failed new relationship for correction', async () => {
    const f = fixture()
    const {wrapper, instance} = await page()
    await connect(wrapper)
    await wrapper.get('[data-action="save-relations"]').trigger('click'); await flushPromises()
    expect(f.fileWrites).toHaveLength(0)
    expect(instance.isDirty).toBe(true)
    expect(boundSelect(wrapper, '父模型绑定').props('modelValue')).toBe('CustomersAlias')
    await editFilter(wrapper, expression)
    f.loseNextFileResponse()
    await wrapper.get('[data-action="save-relations"]').trigger('click'); await flushPromises()
    expect(f.fileWrites).toHaveLength(1)
    expect(wrapper.text()).toContain('文件提交结果未知')
    await wrapper.get('[data-action="verify-relations"]').trigger('click'); await flushPromises()
    expect(f.fileWrites).toHaveLength(1); expect(instance.isDirty).toBe(false)
    expect((await f.open('A')).definitionDataSet?.resourceRelations?.[0]?.filterExpression).toEqual(expression)
  })

  it('keeps connections in pending layout and blocks native relations while model editing is pending', async () => {
    const f = fixture()
    const {wrapper} = await page(), flow = wrapper.getComponent(VueFlow)
    const initial = flow.props('nodes')![0]!
    flow.vm.$emit('nodeDragStart', {node: initial})
    flow.vm.$emit('nodeDragStop', {node: {...initial, position: {x: 400, y: 500}}}); await flushPromises()
    expect(flow.props('nodes')!.every(node => node.connectable === true)).toBe(true)
    await connect(wrapper)
    expect(f.sessions.at(-1)!.metadataDataSet.getView('DataResourceRelationDefinition', 'default')!.rows).toHaveLength(0)
    expect(flow.props('edges')).toHaveLength(1)
    await wrapper.get('[data-action="cancel-layout"]').trigger('click'); await flushPromises()
    expect(flow.props('edges')).toHaveLength(0)
    const models = f.sessions.at(-1)!.metadataDataSet.getView('Base_DataModel', 'default')!
    models.updateEditingValue('M1', 'description', '模型草稿'); await flushPromises()
    await connect(wrapper)
    expect(f.sessions.at(-1)!.metadataDataSet.getView('DataResourceRelationDefinition', 'default')!.rows).toHaveLength(0)
    expect(models.getEditingRow('M1')?.['description']).toBe('模型草稿')
    expect(f.fileWrites).toHaveLength(0)
  })

  it('retains unresolved binding connections only in layout without creating native relations', async () => {
    const f = fixture(); await seed(f, [])
    const config = JSON.parse(f.stored.get('A')!)
    config.tables.SecondOrders = config.tables.OrdersAlias
    delete config.tables.CustomersAlias
    f.stored.set('A', JSON.stringify(config))
    const {wrapper, instance} = await page()
    const flow = wrapper.getComponent(VueFlow)
    expect(flow.props('nodes')!.every(node => node.connectable === true)).toBe(true)
    await connect(wrapper)
    expect(instance.isDirty).toBe(true); expect(f.fileWrites).toHaveLength(0)
    expect(flow.props('edges')).toHaveLength(1)
    expect(f.sessions.at(-1)!.metadataDataSet.getView('DataResourceRelationDefinition', 'default')!.rows).toHaveLength(0)
    await wrapper.get('[data-action="cancel-layout"]').trigger('click'); await flushPromises()
    expect(flow.props('edges')).toHaveLength(0); expect(instance.isDirty).toBe(false)
  })

  it('starts a relation from graph endpoints, cancels locally, then saves a complete filter', async () => {
    const f = fixture()
    const {wrapper, instance} = await page()
    const flow = wrapper.getComponent(VueFlow)
    const parent = flow.props('nodes')!.find(node => node.data?.title === 'Customers')!
    const child = flow.props('nodes')!.find(node => node.data?.title === 'Orders')!
    expect(parent.connectable).toBe(true)
    flow.vm.$emit('connect', {source: parent.id, target: child.id}); await flushPromises()
    expect(boundSelect(wrapper, '父模型绑定').props('modelValue')).toBe('CustomersAlias')
    expect(boundSelect(wrapper, '子模型绑定').props('modelValue')).toBe('OrdersAlias')
    expect(f.fileWrites).toHaveLength(0); expect(instance.isDirty).toBe(true)
    await wrapper.get('[data-action="discard-relations"]').trigger('click'); await flushPromises()
    expect(flow.props('edges')).toHaveLength(0); expect(instance.isDirty).toBe(false)
    await wrapper.get('[data-action="close-definition"]').trigger('click'); await flushPromises()
    const freshNodes = flow.props('nodes')!
    flow.vm.$emit('connect', {source: freshNodes.find(node => node.data?.title === 'Customers')!.id, target: freshNodes.find(node => node.data?.title === 'Orders')!.id})
    await flushPromises()
    await boundInput(wrapper, '关系标识').setValue('FROM_GRAPH')
    await editFilter(wrapper, expression)
    await wrapper.get('[data-action="save-relations"]').trigger('click'); await flushPromises()
    expect(f.fileWrites).toHaveLength(1); expect(instance.isDirty).toBe(false)
    expect((await f.open('A')).definitionDataSet?.resourceRelations).toContainEqual({relationId: 'FROM_GRAPH', parentTable: 'CustomersAlias', childTable: 'OrdersAlias', filterExpression: expression})
    expect(f.requests.filter(request => request.url.includes('BatchTableOperate'))).toHaveLength(0)
  })

  it('rebinds fields when creating a native relation directly from a database relation', async () => {
    const f = fixture({relationRows: [{rowid: 'R', parentModId: 'M2', childModId: 'M1', parentTable: 'Customers', childTable: 'Orders', depType: '', cascadeDel: 0,
      filter: '{"Type":"cond","Field":"parentId","Operator":"equal","ValueFun":{"Type":"GetTableField","Field":"rowid"}}'}]})
    const {wrapper, instance} = await page(); await select(wrapper, 'R:CustomersAlias:OrdersAlias')
    await boundInput(wrapper, '新关系标识').setValue('NEW_FROM_SOURCE')
    await wrapper.get('[data-action="add-relation"]').trigger('click'); await flushPromises()
    const definitions = f.sessions.at(-1)!.metadataDataSet.getView('DataResourceRelationDefinition', 'default')!
    expect(definitions.currentRow?.['relationId']).toBe('NEW_FROM_SOURCE')
    expect(boundInput(wrapper, '关系标识').element).toHaveProperty('value', 'NEW_FROM_SOURCE')
    await chooseBound(wrapper, '父模型绑定', 'CustomersAlias')
    await chooseBound(wrapper, '子模型绑定', 'OrdersAlias')
    await boundInput(wrapper, '关系名称').setValue('独立草稿')
    const source = definitions.rows.find(row => row['sourceRelationId'] === 'R')!
    expect(definitions.getEditingRow(definitions.getPkKey(source)!)?.['relationName']).toBeUndefined()
    expect(definitions.currentRow?.['relationId']).toBe('NEW_FROM_SOURCE')
    expect(definitions.getEditingRow(definitions.getPkKey(definitions.currentRow!)!)?.['relationName']).toBe('独立草稿')
    await wrapper.get('[data-action="discard-relations"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false); expect(f.fileWrites).toHaveLength(0)
  })

  it('preserves unset flags, filters endpoint options by space and releases local binding state', async () => {
    const f = fixture(); await seed(f)
    const {wrapper, instance} = await page(); await select(wrapper, 'ORDERS')
    const metadata = f.sessions.at(-1)!.metadataDataSet
    const definitions = metadata.getView('DataResourceRelationDefinition', 'default')!
    const row = definitions.rows.find(item => item['relationId'] === 'ORDERS')!, key = definitions.getPkKey(row)!
    expect(definitions.currentRow?.['relationId']).toBe('ORDERS')
    expect(definitions.hasEditingChanges()).toBe(false)
    expect(instance.isDirty).toBe(false)
    expect(wrapper.findAll('form form')).toHaveLength(0)
    for (const field of ['cascadeUpdate', 'cascadeDelete']) {
      const form = wrapper.get(`[data-relation-property="${field}"]`).getComponent(RendererForm)
      expect(resolveDataViewKey(form.props('dataViewKey')!, metadata)).toBe(definitions)
      expect(form.getComponent(FieldCheckbox).props('field')).toBe(field)
      expect(wrapper.get(`[data-relation-property="${field}"]`).text()).toContain('未配置')
    }
    const options = Object.values(metadata.tables).find(table => table.tableName.startsWith('RelationControls_') && table.tableName.endsWith('_tables'))!
    options.rows = [...options.rows, {id: 'other', dataSetId: 'B', tableName: 'OtherSpace', label: 'OtherSpace'}]
    await flushPromises()
    expect(boundSelect(wrapper, '父模型绑定').findAllComponents(ElOption).map(option => option.props('value'))).not.toContain('OtherSpace')
    await setBoundBoolean(wrapper, 'cascadeUpdate', false)
    expect(definitions.getEditingRow(key)?.['cascadeUpdate']).toBe(false)
    await wrapper.get('[data-clear-relation-property="cascadeUpdate"]').trigger('click'); await flushPromises()
    expect(definitions.getEditingRow(key)?.['cascadeUpdate']).toBeUndefined()
    expect(instance.isDirty).toBe(false)
    await setBoundBoolean(wrapper, 'cascadeUpdate', true)
    await wrapper.get('[data-action="save-relations"]').trigger('click'); await flushPromises()
    const fresh = await f.open('A')
    expect(fresh.definitionDataSet?.resourceRelations).toEqual([{...native, cascadeUpdate: true}])
    const reads = f.requests.length
    await setBoundBoolean(wrapper, 'cascadeUpdate', false)
    await wrapper.get('[data-action="discard-relations"]').trigger('click'); await flushPromises()
    expect(definitions.getEditingRow(key)?.['cascadeUpdate']).toBe(true)
    expect(f.requests).toHaveLength(reads)
    expect(f.fileWrites).toHaveLength(1)
    await select(wrapper, 'ORDERS')
    expect(boundBoolean(wrapper, 'cascadeUpdate').props('modelValue')).toBe(true)
    await wrapper.get('[data-clear-relation-property="cascadeUpdate"]').trigger('click'); await flushPromises()
    await wrapper.get('[data-action="save-relations"]').trigger('click'); await flushPromises()
    expect((await f.open('A')).definitionDataSet?.resourceRelations).toEqual([native])
    expect(f.stored.get('A')).not.toContain('RelationControls_')
    await select(wrapper, '输入参数')
    expect(Object.keys(metadata.tables).some(name => name.startsWith('RelationControls_'))).toBe(false)
    expect(metadata.viewCascades?.some(cascade => cascade.cascadeId?.startsWith('RelationControls_'))).toBe(false)
    expect(f.requests.filter(request => request.url.includes('BatchTableOperate'))).toHaveLength(0)
  })

  it('retains an invalid draft endpoint until an explicit bound selection repairs it', async () => {
    const f = fixture(); await seed(f)
    const {wrapper, instance} = await page(); await select(wrapper, 'ORDERS')
    const definitions = f.sessions.at(-1)!.metadataDataSet.getView('DataResourceRelationDefinition', 'default')!
    const row = definitions.rows.find(item => item['relationId'] === 'ORDERS')!, key = definitions.getPkKey(row)!
    definitions.updateEditingValue(key, 'parentTable', 'MissingAlias'); await flushPromises()
    expect(wrapper.text()).toContain('父模型绑定 MissingAlias（引用已失效，原配置保留）')
    expect(definitions.hasEditingChanges()).toBe(true)
    expect(instance.isDirty).toBe(true)
    expect(boundSelect(wrapper, '父模型绑定').props('modelValue')).toBe('MissingAlias')
    await wrapper.get('[data-action="save-relations"]').trigger('click'); await flushPromises()
    expect(f.fileWrites).toHaveLength(0)
    expect(boundSelect(wrapper, '父模型绑定').props('modelValue')).toBe('MissingAlias')
    await chooseBound(wrapper, '父模型绑定', 'CustomersAlias')
    expect(wrapper.getComponent(FilterExpressionEditor).props('modelValue')).toEqual(expression)
    // 失败提交已进入原生待保存状态；再次提交由DataView识别净变化为零，不另写文件。
    await wrapper.get('[data-action="save-relations"]').trigger('click'); await flushPromises()
    expect(f.fileWrites).toHaveLength(0)
    expect(instance.isDirty).toBe(false)
    await boundInput(wrapper, '关系名称').setValue('引用修复后')
    await wrapper.get('[data-action="save-relations"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false)
    expect((await f.open('A')).definitionDataSet?.resourceRelations).toEqual([{...native, relationName: '引用修复后'}])
    expect(f.fileWrites).toHaveLength(1)
  })

  it('saves a complete native filter through the metadata DataSet and reopens the same definition', async () => {
    const f = fixture({businessRows: {
      Orders: [{rowid: 'O1', parentId: 'C1'}, {rowid: 'O2', parentId: 'C1'}, {rowid: 'O3', parentId: 'C2'}, {rowid: 'excluded', parentId: 'C1'}],
      Customers: [{rowid: 'C1'}, {rowid: 'C2'}],
    }}); await seed(f, [])
    const config = JSON.parse(f.stored.get('A')!)
    config.tables.CustomersAlias.columns = [{name: 'orderCount', type: 'number', computeExpression: "$count('OrdersAlias')"}]
    f.stored.set('A', JSON.stringify(config))
    const {wrapper, instance} = await page()
    await add(wrapper)
    const metadata = f.sessions.at(-1)!.metadataDataSet
    const definitions = metadata.getView('DataResourceRelationDefinition', 'default')!
    for (const form of wrapper.findAllComponents(RendererForm)) {
      expect(form.props('dataSource')).toBeUndefined()
      expect(form.props('contextDataMember')).toBe('currentRow')
      expect(resolveDataViewKey(form.props('dataViewKey'), metadata)).toBeDefined()
    }
    expect(wrapper.findAllComponents(RendererForm).some(form => resolveDataViewKey(form.props('dataViewKey'), metadata) === definitions)).toBe(true)
    expect(wrapper.findAllComponents(RendererButton).some(button => button.attributes('data-action') === 'save-relations')).toBe(true)
    await editFilter(wrapper, expression)
    expect(instance.isDirty).toBe(true)
    await wrapper.get('[data-action="save-relations"]').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('关系配置已保存并回读确认')
    expect(instance.isDirty).toBe(false)
    expect(f.fileWrites).toHaveLength(1)
    const fresh = await f.open('A')
    expect(fresh.definitionDataSet?.resourceRelations).toContainEqual({relationId: 'ORDERS', parentTable: 'CustomersAlias', childTable: 'OrdersAlias', filterExpression: expression})
    expect(f.requests.filter(request => request.url.includes('BatchTableOperate'))).toHaveLength(0)
    expect(f.stored.get('A')).not.toMatch(/"rows"|definitionKey|JoinFilter|ForeignKeyFields/)
    const customers = fresh.definitionDataSet!.getView('CustomersAlias', 'default')!
    const orders = fresh.definitionDataSet!.getView('OrdersAlias', 'default')!
    expect((await orders.loadFromServer()).success).toBe(true)
    expect((await customers.loadFromServer()).success).toBe(true)
    customers.recomputeColumns()
    expect(customers.rows.map(row => row['orderCount'])).toEqual([undefined, undefined])
    expect(customers.computedAggregateError?.message).toContain('DATA_VIEW_REMOTE_COMPUTED_AGGREGATE')
    expect(fresh.definitionDataSet!.getTable('CustomersAlias')!.columns.find(column => column.name === 'orderCount')?.computeExpression)
      .toBe("$count('OrdersAlias')")
  })

  it('edits identity and flags, deletes only the selected native relationship, and reopens', async () => {
    const f = fixture(); await seed(f)
    const {wrapper, instance} = await page(); await select(wrapper, 'ORDERS')
    await boundInput(wrapper, '关系标识').setValue('RENAMED')
    await boundInput(wrapper, '关系名称').setValue('修改后的关系')
    await setBoundBoolean(wrapper, 'cascadeUpdate', false)
    await setBoundBoolean(wrapper, 'cascadeDelete', true)
    await wrapper.get('[data-action="save-relations"]').trigger('click'); await flushPromises()
    expect(boundInput(wrapper, '关系标识').element).toHaveProperty('value', 'RENAMED')
    expect((await f.open('A')).definitionDataSet?.resourceRelations?.[0]).toMatchObject({relationId: 'RENAMED', cascadeUpdate: false, cascadeDelete: true})
    await wrapper.get('[data-action="remove-relation"]').trigger('click'); await flushPromises()
    await wrapper.get('[data-action="save-relations"]').trigger('click'); await flushPromises()
    expect((await f.open('A')).definitionDataSet?.resourceRelations).toEqual([])
    expect(instance.isDirty).toBe(false); expect(f.fileWrites).toHaveLength(2)
  })

  it('keeps a failed endpoint change editable and preserves the expression for explicit repair', async () => {
    const f = fixture(); await seed(f)
    const {wrapper} = await page(); await select(wrapper, 'ORDERS')
    await boundInput(wrapper, '关系标识').setValue('REPAIRED')
    await chooseBound(wrapper, '父模型绑定', 'OrdersAlias')
    expect(wrapper.getComponent(FilterExpressionEditor).props('modelValue')).toEqual(expression)
    await wrapper.get('[data-action="save-relations"]').trigger('click'); await flushPromises()
    expect(boundSelect(wrapper, '父模型绑定').props('disabled')).toBe(false)
    expect(boundInput(wrapper, '关系标识').element).toHaveProperty('value', 'REPAIRED')
    expect(f.fileWrites).toHaveLength(0)
    await chooseBound(wrapper, '父模型绑定', 'CustomersAlias')
    await boundInput(wrapper, '关系名称').setValue('修复后')
    await wrapper.get('[data-action="save-relations"]').trigger('click'); await flushPromises()
    expect(f.fileWrites).toHaveLength(1)
  })

  it('cancels new and existing drafts without writing and protects navigation during a filter dialog', async () => {
    const f = fixture(); await seed(f)
    const {wrapper, instance} = await page(); await select(wrapper, 'ORDERS')
    await wrapper.get('[data-relation-filter] [data-action="open"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(true)
    await select(wrapper, 'Orders'); expect(wrapper.text()).toContain('请先保存或明确处理当前关系草稿')
    await new DOMWrapper(document.body).get('[data-action="cancel"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false)
    await boundInput(wrapper, '关系名称').setValue('不要保存')
    await wrapper.get('[data-action="discard-relations"]').trigger('click'); await flushPromises()
    await add(wrapper, 'NEW'); await wrapper.get('[data-action="discard-relations"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false); expect(f.fileWrites).toHaveLength(0)
    expect((await f.open('A')).definitionDataSet?.resourceRelations).toEqual([native])
  })

  it('verifies an unknown file save without replaying writes', async () => {
    const f = fixture(); await seed(f)
    const {wrapper, instance} = await page(); await select(wrapper, 'ORDERS')
    await boundInput(wrapper, '关系名称').setValue('回执丢失')
    f.loseNextFileResponse()
    await wrapper.get('[data-action="save-relations"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(true)
    expect(wrapper.get('[data-action="save-relations"]').attributes('disabled')).toBeDefined()
    expect(boundInput(wrapper, '关系名称').attributes('disabled')).toBeDefined()
    expect(boundBoolean(wrapper, 'cascadeUpdate').props('disabled')).toBe(true)
    await wrapper.get('[data-action="verify-relations"]').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('已核验并确认保存结果')
    expect(instance.isDirty).toBe(false); expect(f.fileWrites).toHaveLength(1)
  })

  it('shows a conflicting remote file before explicitly adopting it', async () => {
    const f = fixture(); await seed(f)
    const {wrapper, instance} = await page(); await select(wrapper, 'ORDERS')
    await boundInput(wrapper, '关系名称').setValue('本地草稿')
    const config = JSON.parse(f.stored.get('A')!); config.resourceRelations = [{...native, relationName: '远端修改'}]
    f.stored.set('A', JSON.stringify(config))
    await wrapper.get('[data-action="save-relations"]').trigger('click'); await flushPromises()
    expect(f.fileWrites).toHaveLength(0); expect(instance.isDirty).toBe(true)
    await wrapper.get('[data-action="preview-remote-relations"]').trigger('click'); await flushPromises()
    expect(wrapper.get('.remote pre').text()).toContain('远端修改')
    await wrapper.get('[data-action="adopt-remote-relations"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false); expect(f.fileWrites).toHaveLength(0)
    await select(wrapper, 'ORDERS')
    expect(boundInput(wrapper, '关系名称').element).toHaveProperty('value', '远端修改')
  })

  it('edits converted native relationships through bound standard fields and preserves database records', async () => {
    const f = fixture({readOnly: true, relationRows: [{rowid: 'R', parentModId: 'M2', childModId: 'M1', parentTable: 'Customers', childTable: 'Orders', depType: '', cascadeDel: 0,
      filter: '{"Type":"cond","Field":"parentId","Operator":"equal","ValueFun":{"Type":"GetTableField","Field":"rowid"}}'}]})
    const {wrapper} = await page(); await select(wrapper, 'R:CustomersAlias:OrdersAlias')
    for (const label of ['父模型绑定', '子模型绑定']) expect(boundSelect(wrapper, label).props('disabled')).toBe(false)
    expect(boundBoolean(wrapper, 'cascadeDelete').props('disabled')).toBe(false)
    expect(boundInput(wrapper, '关系标识').attributes('disabled')).toBeUndefined()
    for (const selector of ['[data-relation-filter] [data-action="open"]', '[data-action="remove-relation"]']) {
      expect(wrapper.get(selector).attributes('disabled')).toBeUndefined()
    }
    await boundInput(wrapper, '关系名称').setValue('来源扩展')
    await setBoundBoolean(wrapper, 'cascadeUpdate', false)
    await setBoundBoolean(wrapper, 'cascadeDelete', true)
    await editFilter(wrapper, expression)
    await wrapper.get('[data-action="save-relations"]').trigger('click'); await flushPromises()
    expect(JSON.parse(f.stored.get('A')!).resourceRelations).toEqual([{relationId: 'R:CustomersAlias:OrdersAlias', sourceRelationId: 'R', parentTable: 'CustomersAlias', childTable: 'OrdersAlias', relationName: '来源扩展', cascadeUpdate: false, cascadeDelete: true, filterExpression: expression}])
    expect(f.requests.filter(request => request.url.includes('BatchTableOperate'))).toHaveLength(0)
    expect((await f.open('A')).definitionDataSet?.resourceRelations?.[0]?.filterExpression).toEqual(expression)
  })

  it('preserves structured functions and parameters without claiming local execution', async () => {
    const f = fixture(), {wrapper} = await page()
    await add(wrapper)
    const tree = {logic: 'or', filters: [
      {field: 'parentId', operator: 'eq', value: {Type: 'GetInputParam', ParamName: 'customer'}},
      {field: 'rowid', operator: 'eq', value: {Type: 'GetRefData', RefTableName: 'CustomersAlias', RefFieldName: 'rowid', FkFieldName: 'parentId'}},
    ]}
    await editFilter(wrapper, tree)
    await wrapper.get('[data-action="save-relations"]').trigger('click'); await flushPromises()
    expect((await f.open('A')).definitionDataSet?.resourceRelations?.[0]?.filterExpression).toEqual(tree)
  })

  it('updates function candidates from the selected parent without rewriting the saved condition', async () => {
    const f = fixture(); await seed(f)
    const {wrapper} = await page(); await select(wrapper, 'ORDERS')
    await chooseBound(wrapper, '父模型绑定', 'OrdersAlias')
    await wrapper.get('[data-relation-filter] [data-action="open"]').trigger('click')
    const context = wrapper.getComponent(FilterExpressionEditor).props('functionContext')
    expect(context?.relatedFields).toContainEqual({label: 'OrdersAlias.rowid', value: 'OrdersAlias.rowid'})
    expect(context?.relatedFields).not.toContainEqual({label: 'CustomersAlias.rowid', value: 'CustomersAlias.rowid'})
    expect(context?.inputParams).toContainEqual({label: 'customer', value: 'customer'})
    expect(wrapper.getComponent(FilterExpressionEditor).props('modelValue')).toEqual(expression)
    expect(f.fileWrites).toHaveLength(0)
  })

  it('saves only relationship changes and leaves another definition view draft intact', async () => {
    const f = fixture(); await seed(f)
    const {wrapper} = await page(); await select(wrapper, 'ORDERS')
    await boundInput(wrapper, '关系名称').setValue('关系草稿')
    const views = f.sessions.at(-1)!.metadataDataSet.getView('DataViewDefinition', 'default')!
    const key = views.getPkKey(views.rows[0]!)!; views.updateEditingValue(key, 'pageSize', 77)
    await wrapper.get('[data-action="save-relations"]').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('关系配置已保存并回读确认'); expect(f.fileWrites).toHaveLength(1)
    expect(views.getEditingRow(key)?.['pageSize']).toBe(77)
    expect(JSON.parse(f.stored.get('A')!).resourceRelations[0].relationName).toBe('关系草稿')
    expect(JSON.stringify(JSON.parse(f.stored.get('A')!).tables)).not.toContain('77')
    await boundInput(wrapper, '关系名称').setValue('取消这一项')
    await wrapper.get('[data-action="discard-relations"]').trigger('click'); await flushPromises()
    expect(views.getEditingRow(key)?.['pageSize']).toBe(77)
  })

  it('keeps missing configuration explicit', async () => {
    const f = fixture({missing: true}), {wrapper} = await page()
    await select(wrapper, '原生关系定义')
    expect(wrapper.text()).toContain('请先在模型下建立数据视图绑定')
    expect(wrapper.get('[data-action="add-relation"]').attributes('disabled')).toBeDefined()
    expect(f.fileWrites).toHaveLength(0)
  })

  it('repairs an invalid expression without losing its original JSON', async () => {
    const f = fixture(); await seed(f, [{...native, filterExpression: {field: 'missing', operator: 'eq', value: 1}}])
    const {wrapper} = await page(); await select(wrapper, 'ORDERS')
    await wrapper.get('[data-action="repair-relation-filter"]').trigger('click')
    const field = wrapper.getComponent(FieldJson), json = field.getComponent(SparkJsonEditor)
    expect(field.props('field')).toBe('filterText')
    expect(field.props('modelValue')).toBeUndefined()
    expect(json.props('mode')).toBe('text')
    expect(json.props('modelValue')).toBe(JSON.stringify({field: 'missing', operator: 'eq', value: 1}, null, 2))
    json.vm.$emit('update:modelValue', '{invalid'); await flushPromises()
    await wrapper.get('[data-action="apply-relation-json"]').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('过滤表达式不是有效 JSON')
    expect(json.props('modelValue')).toBe('{invalid')
    expect(f.fileWrites).toHaveLength(0)
    json.vm.$emit('update:modelValue', JSON.stringify(expression)); await flushPromises()
    await wrapper.get('[data-action="apply-relation-json"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-action="apply-relation-json"]').exists()).toBe(false)
    await wrapper.get('[data-action="save-relations"]').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('关系配置已保存并回读确认')
    expect((await f.open('A')).definitionDataSet?.resourceRelations?.[0]?.filterExpression).toEqual(expression)
  })

  it('cancels a JSON repair and rejects events from its released editor', async () => {
    const invalid = {field: 'missing', operator: 'eq', value: false}
    const f = fixture(); await seed(f, [{...native, filterExpression: invalid}])
    const {wrapper, instance} = await page(); await select(wrapper, 'ORDERS')
    await wrapper.get('[data-action="repair-relation-filter"]').trigger('click'); await flushPromises()
    const old = wrapper.getComponent(FieldJson).getComponent(SparkJsonEditor)
    const late = old.vm.$.vnode.props?.['onUpdate:modelValue']
    expect(typeof late).toBe('function')
    old.vm.$emit('update:modelValue', '{draft'); await flushPromises()
    await wrapper.get('[data-action="cancel-relation-repair"]').trigger('click'); await flushPromises()
    await wrapper.get('[data-action="repair-relation-filter"]').trigger('click'); await flushPromises()
    if (typeof late === 'function') await late(JSON.stringify(expression))
    await flushPromises()
    expect(wrapper.getComponent(FieldJson).getComponent(SparkJsonEditor).props('modelValue')).toBe(JSON.stringify(invalid, null, 2))
    await wrapper.get('[data-action="discard-relations"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false)
    expect(f.fileWrites).toHaveLength(0)
    expect(JSON.parse(f.stored.get('A')!).resourceRelations[0].filterExpression).toEqual(invalid)
  })

  it('isolates two target spaces and rejects saves after the owner scope changes', async () => {
    const f = fixture(), a = await page(), b = await page('B')
    await add(a.wrapper, 'A_ONLY'); await editFilter(a.wrapper, expression)
    expect(a.instance.isDirty).toBe(true); expect(b.instance.isDirty).toBe(false)
    f.invalidate()
    await a.wrapper.get('[data-action="save-relations"]').trigger('click'); await flushPromises()
    expect(f.fileWrites).toHaveLength(0); expect(f.stored.get('B')).not.toContain('A_ONLY')
  })
})
