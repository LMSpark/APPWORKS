import {afterEach, beforeAll, beforeEach, expect, it, vi} from 'vitest'
import {flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {defineComponent, h, markRaw, ref} from 'vue'
import ElementPlus, {ElButton, ElInput, ElTable, ElTableColumn} from 'element-plus'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {FieldCheckbox, PAGE_RUNTIME, RendererSection, Spark, registerAllRenderers, useSparkComponent} from '@spark-appworks/spark-component'
import {DataSet, DataView, RequestState} from '@spark-appworks/spark-data'
import {LOWCODE_APPLICATION_CATALOG_FORM_KEY} from '@spark-appworks/spark-lowcode-api'
import type {RouteLocationNormalizedLoaded} from 'vue-router'
import {SystemPageIdentityPool} from '../../../../../packages/spark-app/src/router/system-page-identity/system-page-identity-pool'
import DataSpaceViewEditor from '@/views/features/data-platform/data-set-management/design/views/DataSpaceViewEditor.vue'
import DataSpaceDesignPage from '@/views/features/data-platform/data-set-management/design/ui/data-set-design-page.vue'
import * as lowcodeDataSpaceDesign from '@/lowcode/data-space/lowcode-data-space-design'
import {loadLowcodeRuntimeScenario} from '@/lowcode/data-space/lowcode-data-space-runtime'
import {dataSpacePageFixture} from './data-space-page.fixture'

vi.mock('@/lowcode/data-space/lowcode-data-space-runtime', () => ({loadLowcodeRuntimeScenario: vi.fn()}))
vi.mock('@/lowcode/lowcode-runtime', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lowcode/lowcode-runtime')>()
  return {...actual, lowcodeApi: Object.assign(Object.create(actual.lowcodeApi), {
    readRequestScope: () => ({token: 'PAGE-TEST', headers: {'X-AppId': 'APP'}}),
  })}
})
vi.mock('@/services/project/blueprint-workspace-dataview', () => ({isBlueprintViewAttachedToRuntime: () => true, BlueprintWorkspaceDataView: class {
  view: DataView
  constructor(dataSet: DataSet) {this.view = dataSet.getView('Base_NavigationInfo', 'default')!}
  async loadProjectTree() {return {nodeId: 'ROOT', parentNodeId: '', projectId: 'APP', kind: 'module', capability: {name: 'App'}, source: {}, children: []}}
  treeProjection() {return {nodeId: 'ROOT', parentNodeId: '', projectId: 'APP', kind: 'module', capability: {name: 'App'}, source: {}, children: []}}
  dispose() {}
}}))

const wrappers: VueWrapper[] = [], runtimes: PageRuntime[] = [], fixtures: ReturnType<typeof dataSpacePageFixture>[] = []
beforeAll(() => registerAllRenderers())
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
  vi.mocked(loadLowcodeRuntimeScenario).mockReset().mockImplementation(async () => DataSet.fromJson({
    scenarioId: LOWCODE_APPLICATION_CATALOG_FORM_KEY,
    tables: {Base_NavigationInfo: {columns: [{name: 'rowid', type: 'string', isPrimaryKey: true}], views: {default: {}}}},
  }))
})
afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  runtimes.splice(0).forEach(runtime => runtime.dispose())
  fixtures.splice(0).forEach(fixture => fixture.dispose())
  vi.unstubAllGlobals()
})

it('preserves parameter typing across other view configuration edits, saves through DataSet and reopens the same values', async () => {
  const fixture = dataSpacePageFixture({overviewOnly: true, deferDefinition: true}); fixtures.push(fixture)
  const original = {scenarioId: 'A', schemaVersion: 2, resourceRelations: [], tables: {
    OrdersAlias: {modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {
      default: {}, shared: {queryContext: {customer: 'before', retained: {flag: false}}},
    }},
    CustomersAlias: {modelBinding: {modelId: 'M2', modelName: 'Customers'}, views: {default: {pageSize: 24}}},
  }}
  fixture.stored.set('A', JSON.stringify(original))
  const session = await fixture.open('A'), dataSet = session.metadataDataSet
  const fileModels = dataSet.getView('DataTableBindingDefinition', 'fileModels')!
  const expectFileModelsIdle = () => {
    expect(fileModels.queryContext).toMatchObject({dataSpaceId: 'A', definitionProjection: 'fileModels'})
    expect(fileModels.requestState).toBe(RequestState.Idle)
    expect(fileModels.rows).toHaveLength(0)
    expect(fileModels.hasEditingChanges()).toBe(false)
    expect(fileModels.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(fileModels.mutating).toBe(false)
  }
  expectFileModelsIdle()
  const definitions = dataSet.getView('DataViewDefinition')!
  const row = definitions.rows.find(item => item['tableName'] === 'OrdersAlias' && item['viewId'] === 'shared')!
  const key = definitions.getPkKey(row)!, revision = ref(0), scenarioId = dataSet.scenarioId!
  const runtime = new PageRuntime({pageId: '/data-space-design', scenarioIds: [scenarioId], loadScenario: async () => dataSet})
  runtimes.push(runtime); await runtime.load()
  const wrapper = mount(defineComponent({setup() {
    const {sparkProvide} = useSparkComponent({type: 'data-space-design'})
    sparkProvide(PAGE_RUNTIME, runtime)
    return () => h(DataSpaceViewEditor, {session: markRaw(session), modelId: 'M1', modelName: 'Orders', rowKey: key,
      revision: revision.value, onChanged: () => revision.value++})
  }}), {global: {plugins: [ElementPlus, Spark.createPlugin()], stubs: {
    SparkComponentRenderer: false, 'spark-component-renderer': false, 'el-button': ElButton,
    'el-table': ElTable, 'el-table-column': ElTableColumn,
  }}})
  wrappers.push(wrapper); await flushPromises()
  const input = wrapper.findAllComponents(ElInput).find(field => field.find('[data-json-property="customer"]').exists())!
  expect(input.props('modelValue')).toBe('before')
  input.vm.$emit('update:modelValue', 'after'); await flushPromises()
  expect(definitions.hasEditingChanges()).toBe(false)
  definitions.updateEditingValue(key, 'autoLoad', false); await flushPromises()
  expect(input.props('modelValue')).toBe('after')
  expect(definitions.getEditingRow(key)?.['queryContext']).toEqual(original.tables.OrdersAlias.views.shared.queryContext)
  input.vm.$emit('change', 'after'); await flushPromises()
  expect(definitions.getEditingRow(key)?.['queryContext']).toEqual({customer: 'after', retained: {flag: false}})
  const assemblies = fixture.assemblyScopes.length
  await wrapper.get('[data-action="save-views"]').trigger('click'); await flushPromises()
  expect(definitions.hasEditingChanges(), wrapper.text()).toBe(false)
  expect(wrapper.get('[role="status"]').text()).toBe('视图配置已保存并回读确认')
  expect(fixture.fileWrites).toHaveLength(1)
  expect(fixture.requests.filter(request => request.url.includes('BatchTableOperate'))).toHaveLength(0)
  expectFileModelsIdle()
  // 提交校验只装配修改所属模型，不重装整个目标空间。
  expect(fixture.assemblyScopes.slice(assemblies)).toEqual([['OrdersAlias']])
  const saved = JSON.parse(fixture.stored.get('A')!)
  expect(saved.tables.OrdersAlias.views.default).toEqual(original.tables.OrdersAlias.views.default)
  expect(saved.tables.CustomersAlias).toEqual(original.tables.CustomersAlias)
  const reopened = await fixture.open('A', {deferDefinition: false})
  const restored = reopened.definitionDataSet!.getView('OrdersAlias', 'shared')!
  expect(restored.queryContext).toEqual({customer: 'after', retained: {flag: false}})
  expect(restored.autoLoad).toBe(false)
  expect(reopened.metadataDataSet).not.toBe(dataSet)
})

async function mountPreviewEditor(fixture: ReturnType<typeof dataSpacePageFixture>, session: Awaited<ReturnType<typeof fixture.open>>, key: string) {
  const runtime = new PageRuntime({pageId: '/data-space-design', scenarioIds: [session.metadataDataSet.scenarioId!], loadScenario: async () => session.metadataDataSet})
  runtimes.push(runtime); await runtime.load()
  const revision = ref(0)
  const wrapper = mount(defineComponent({setup() {
    const {sparkProvide} = useSparkComponent({type: 'data-space-design'})
    sparkProvide(PAGE_RUNTIME, runtime)
    return () => h(DataSpaceViewEditor, {session: markRaw(session), modelId: 'M1', modelName: 'Orders', rowKey: key,
      revision: revision.value, onChanged: () => revision.value++})
  }}), {global: {plugins: [ElementPlus, Spark.createPlugin()], stubs: {
    SparkComponentRenderer: false, 'spark-component-renderer': false, 'el-button': ElButton,
    'el-table': ElTable, 'el-table-column': ElTableColumn, DataSpaceQueryPreview: true,
  }}})
  wrappers.push(wrapper); await flushPromises()
  return {wrapper, revision}
}

async function preparePreviewDraft(reason: 'single' | 'another' | 'stale') {
  const fixture = dataSpacePageFixture({overviewOnly: true, deferDefinition: true}); fixtures.push(fixture)
  const original = {scenarioId: 'A', schemaVersion: 2, resourceRelations: [], tables: {
    OrdersAlias: {modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {default: {autoLoad: false}}},
  }}
  fixture.stored.set('A', JSON.stringify(original))
  const session = await fixture.open('A', {deferDefinition: false}), definitions = session.metadataDataSet.getView('DataViewDefinition')!
  const add = (viewId: string) => definitions.addRow({dataSetId: 'A', dataModelId: 'M1', dataModelName: 'Orders', tableName: 'OrdersAlias', viewId, autoLoad: false})
  await add('catalogApps')
  if (reason === 'another') await add('otherDraft')
  const row = definitions.rows.find(item => item['tableName'] === 'OrdersAlias' && item['viewId'] === 'catalogApps')!
  return {fixture, original, session, key: String(definitions.getPkKey(row))}
}

it('enables a sole new named-view draft, opens preview, and does not save pagedata', async () => {
  const prepared = await preparePreviewDraft('single')
  const space = prepared.session.metadataDataSet.getView('Base_DataSet')!, models = prepared.session.metadataDataSet.getView('Base_DataModel')!
  space.requestState = RequestState.Idle; models.requestState = RequestState.Idle
  const loadSpace = vi.spyOn(space, 'loadFromServer'), loadModels = vi.spyOn(models, 'loadFromServer')
  const {wrapper} = await mountPreviewEditor(prepared.fixture, prepared.session, prepared.key)
  await flushPromises()
  const previewButton = wrapper.get('[data-action="open-query-preview"]')
  expect(previewButton.attributes('disabled')).toBeUndefined()
  expect(loadSpace).toHaveBeenCalledOnce(); expect(loadModels).toHaveBeenCalledOnce()
  await previewButton.trigger('click'); await flushPromises()
  expect(wrapper.findComponent({name: 'DataSpaceQueryPreview'}).exists()).toBe(true)
  const preview = await prepared.session.openPreview({modelId: 'M1', modelName: 'Orders', tableName: 'OrdersAlias', viewId: 'catalogApps'})
  expect(preview.dataViewKey).toBe('A@Orders@catalogApps')
  preview.dispose()
  expect(prepared.fixture.fileWrites).toHaveLength(0)
  expect(prepared.fixture.stored.get('A')).toBe(JSON.stringify(prepared.original))
})

it('keeps preview disabled when another view-definition draft is pending', async () => {
  const prepared = await preparePreviewDraft('another'), {wrapper} = await mountPreviewEditor(prepared.fixture, prepared.session, prepared.key)
  expect(wrapper.get('[data-action="open-query-preview"]').attributes('disabled')).toBeDefined()
  expect(wrapper.findComponent({name: 'DataSpaceQueryPreview'}).exists()).toBe(false)
  expect(prepared.fixture.fileWrites).toHaveLength(0)
})

it('refuses preview after the session execution context becomes stale', async () => {
  const prepared = await preparePreviewDraft('stale'), {wrapper, revision} = await mountPreviewEditor(prepared.fixture, prepared.session, prepared.key)
  prepared.fixture.invalidate(); revision.value++; await flushPromises()
  expect(wrapper.find('[data-action="open-query-preview"]').exists()).toBe(false)
  expect(wrapper.findComponent({name: 'DataSpaceQueryPreview'}).exists()).toBe(false)
  expect(prepared.fixture.fileWrites).toHaveLength(0)
})

it('keeps the selected named view identity through a late field-directory response and saves/restores only that property', async () => {
  const fixture = dataSpacePageFixture({overviewOnly: true, deferDefinition: true}); fixtures.push(fixture)
  const targetId = '944DEE5A0E5170F903E0E008172C4CD2'
  const original = {scenarioId: targetId, schemaVersion: 2, tables: {
    SourceScope_20261018: {modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {
      Verification_20261018: {autoLoad: false, autoSelectFirst: true, pageSize: 18}, default: {autoSelectFirst: false},
    }},
    CustomersAlias: {modelBinding: {modelId: 'M2', modelName: 'Customers'}, views: {
      default: {pageSize: 24}, compact: {pageSize: 8},
    }},
  }, resourceRelations: [{relationId: 'R', parentTable: 'SourceScope_20261018', childTable: 'CustomersAlias',
    filterExpression: {field: 'id', operator: 'eq', value: {Type: 'GetTableField', Field: 'id'}}}],
  viewCascades: [{kind: 'query', cascadeId: 'Q', parentTable: 'SourceScope_20261018', parentViewId: 'default',
    childTable: 'CustomersAlias', childViewId: 'default', filterBindings: [{sourceField: 'id', targetField: 'parentId'}]}],
  layout: {modelPositions: {M1: {x: 170, y: 110}, M2: {x: 500, y: 110}}}}
  fixture.stored.set(targetId, JSON.stringify(original))
  const openSpy = vi.spyOn(lowcodeDataSpaceDesign, 'openLowcodeDataSpaceDesignSession')
    .mockImplementation(id => fixture.open(id))

  const findViews = (session: Awaited<ReturnType<typeof fixture.open>>) => {
    const definitions = session.metadataDataSet.getView('DataViewDefinition', 'default')!
    const target = definitions.rows.filter(item => item['tableName'] === 'SourceScope_20261018' && item['viewId'] === 'Verification_20261018')
    const defaultView = definitions.rows.filter(item => item['tableName'] === 'SourceScope_20261018' && item['viewId'] === 'default')
    expect(target).toHaveLength(1); expect(defaultView).toHaveLength(1)
    return {definitions, targetKey: definitions.getPkKey(target[0]!)!, defaultKey: definitions.getPkKey(defaultView[0]!)!}
  }
  const mountPage = async () => {
    const route = {path: '/data-space-design', fullPath: '/data-space-design', query: {}, hash: '', params: {}, meta: {}, matched: []} as unknown as RouteLocationNormalizedLoaded
    const instance = new SystemPageIdentityPool().get(route, {scope: 'public', path: '/data-space-design', nodeId: 'a8-data-space-design',
      title: '数据空间设计', pageId: '/data-space-design', explicitQuery: {}, component: DataSpaceDesignPage})
    const wrapper = mount(instance.view, {props: {targetId}, global: {plugins: [ElementPlus, Spark.createPlugin()], stubs: {
      SparkComponentRenderer: false, 'spark-component-renderer': false, 'el-button': ElButton,
      'el-table': ElTable, 'el-table-column': ElTableColumn,
    }}})
    wrappers.push(wrapper); await flushPromises()
    for (let attempt = 0; attempt < 80 && fixture.sessions.length === 0; attempt++) await flushPromises()
    expect(fixture.sessions.length).toBeGreaterThan(0)
    return wrapper
  }
  const prepareNamedView = async (wrapper: VueWrapper, delayFieldDirectory: boolean) => {
    await wrapper.get('[data-action="toggle-directory"]').trigger('click'); await flushPromises()
    const modelNode = wrapper.findAll('[data-design-node]').find(node => node.text() === 'Orders')
    expect(modelNode).toBeDefined()
    await modelNode!.trigger('click'); await flushPromises()
    const modelTabs = wrapper.get('.node-panel-tabs').getComponent((await import('@spark-appworks/spark-component')).RendererTabs)
    const session = fixture.sessions.at(-1)!
    const gateStartedAt = fixture.modelReads.length
    const releaseFields = delayFieldDirectory ? fixture.holdDefinitionRead() : undefined
    await modelTabs.get('#tab-views').trigger('click'); await flushPromises()
    const editor = wrapper.getComponent(DataSpaceViewEditor)
    const {definitions, targetKey, defaultKey} = findViews(session)
    expect(editor.props('rowKey')).toBe(defaultKey)
    expect(definitions.currentRow && definitions.getPkKey(definitions.currentRow)).toBe(defaultKey)
    const selector = wrapper.get('[data-view-selector]')
    const namedTab = selector.findAll('[role="tab"]').find(tab => tab.text().includes('Verification_20261018'))
    expect(namedTab).toBeDefined()
    await namedTab!.trigger('click'); await flushPromises()
    expect(editor.props('rowKey')).toBe(targetKey)
    expect(selector.findAll('[role="tab"]').find(tab => tab.text().includes('Verification_20261018'))?.attributes('aria-selected')).toBe('true')
    expect(editor.get('[data-view-properties] > p').text()).toContain('SourceScope_20261018 @ Verification_20261018')
    if (releaseFields) {
      expect(fixture.modelReads.length).toBeGreaterThan(gateStartedAt)
      releaseFields(); await flushPromises()
      for (let attempt = 0; attempt < 80 && session.getViewFields({tableName: 'SourceScope_20261018', viewId: 'Verification_20261018', modelId: 'M1', modelName: 'Orders'}) === null; attempt++) await flushPromises()
    }
    return {session, editor, definitions, targetKey, defaultKey}
  }
  const closePage = (wrapper: VueWrapper) => {wrappers.splice(wrappers.indexOf(wrapper), 1); wrapper.unmount()}

  try {
    const firstPage = await mountPage()
    const first = await prepareNamedView(firstPage, true)
    const firstProperties = first.editor.findAllComponents(RendererSection).find(item => item.props('title') === '结果组织与编辑配置')!
    const firstToggle = firstProperties.get('.renderer-section-toggle')
    if (firstToggle.attributes('aria-expanded') === 'false') {await firstToggle.trigger('click'); await flushPromises()}
    const checkbox = () => first.editor.findAllComponents(FieldCheckbox).find(field => field.props('field') === 'autoSelectFirst')!
    expect(first.definitions.currentRow && first.definitions.getPkKey(first.definitions.currentRow)).toBe(first.targetKey)
    expect(checkbox().props('label')).toBe('自动选中首行')
    expect((checkbox().get('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(true)
    await checkbox().get('input[type="checkbox"]').setValue(false); await flushPromises()
    expect(first.definitions.getEditingPatch(first.targetKey)).toEqual({autoSelectFirst: false})
    expect(first.definitions.getEditingPatch(first.defaultKey)).toBeUndefined()
    const firstReads = fixture.modelReads.length
    await first.editor.get('[data-action="save-views"]').trigger('click'); await flushPromises()
    expect(first.definitions.hasEditingChanges()).toBe(false)
    expect(first.definitions.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(fixture.fileWrites).toHaveLength(1)
    expect(fixture.requests.filter(request => request.url.includes('BatchTableOperateRequestByCRUD'))).toHaveLength(0)
    expect(fixture.modelReads.slice(firstReads).every(read => read.scenarioId === targetId && read.modelId === 'M1' && read.modelName === 'Orders')).toBe(true)
    const temporary = {...original, tables: {...original.tables,
      SourceScope_20261018: {...original.tables.SourceScope_20261018,
        views: {...original.tables.SourceScope_20261018.views, Verification_20261018: {...original.tables.SourceScope_20261018.views.Verification_20261018, autoSelectFirst: false}}}}}
    expect(JSON.parse(fixture.stored.get(targetId)!)).toEqual(temporary)
    closePage(firstPage)

    const reopened = await fixture.open(targetId), reopenedViews = findViews(reopened)
    expect(reopened.metadataDataSet).not.toBe(first.session.metadataDataSet)
    expect(reopened.metadataDataSet.getView('DataViewDefinition', 'default')!.rows.find(row => reopenedViews.definitions.getPkKey(row) === reopenedViews.targetKey)?.['autoSelectFirst']).toBe(false)
    reopened.dispose()

    const restorePage = await mountPage()
    const restoredEditor = await prepareNamedView(restorePage, false)
    expect(restoredEditor.definitions.currentRow && restoredEditor.definitions.getPkKey(restoredEditor.definitions.currentRow)).toBe(restoredEditor.targetKey)
    const restoreProperties = restoredEditor.editor.findAllComponents(RendererSection).find(item => item.props('title') === '结果组织与编辑配置')!
    const restoreToggle = restoreProperties.get('.renderer-section-toggle')
    if (restoreToggle.attributes('aria-expanded') === 'false') {await restoreToggle.trigger('click'); await flushPromises()}
    const restoreCheckbox = restoredEditor.editor.findAllComponents(FieldCheckbox).find(field => field.props('field') === 'autoSelectFirst')!
    expect((restoreCheckbox.get('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(false)
    await restoreCheckbox.get('input[type="checkbox"]').setValue(true); await flushPromises()
    expect(restoredEditor.definitions.getEditingPatch(restoredEditor.targetKey)).toEqual({autoSelectFirst: true})
    expect(restoredEditor.definitions.getEditingPatch(restoredEditor.defaultKey)).toBeUndefined()
    const releaseSave = fixture.holdFileResponse()
    await restoredEditor.editor.get('[data-action="save-views"]').trigger('click'); await flushPromises()
    expect(fixture.fileWrites).toHaveLength(2)
    expect(restoredEditor.session.viewState?.saveStatus).toBe('pending')
    restoredEditor.definitions.updateEditingValue(restoredEditor.targetKey, 'pageSize', 19); await flushPromises()
    expect(restoredEditor.definitions.getEditingPatch(restoredEditor.targetKey)).toEqual({pageSize: 19})
    releaseSave(); await flushPromises()
    expect(restoredEditor.editor.text()).toContain('本轮保存已确认，仍有修改待保存')
    expect(restoredEditor.definitions.getEditingPatch(restoredEditor.targetKey)).toEqual({pageSize: 19})
    expect(JSON.parse(fixture.stored.get(targetId)!).tables.SourceScope_20261018.views.Verification_20261018)
      .toEqual({autoLoad: false, autoSelectFirst: true, pageSize: 18})
    expect(restoredEditor.definitions.hasEditingChanges()).toBe(true)
    await restoredEditor.editor.get('[data-action="discard-view-edits"]').trigger('click'); await flushPromises()
    expect(restoredEditor.definitions.hasEditingChanges()).toBe(false)
    expect(restoredEditor.definitions.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(fixture.fileWrites).toHaveLength(2)
    expect(fixture.requests.filter(request => request.url.includes('BatchTableOperateRequestByCRUD'))).toHaveLength(0)
    expect(JSON.parse(fixture.stored.get(targetId)!)).toEqual(original)
    closePage(restorePage)

    const final = await fixture.open(targetId), finalViews = findViews(final)
    const finalTarget = finalViews.definitions.rows.find(row => finalViews.definitions.getPkKey(row) === finalViews.targetKey)!
    expect(finalTarget['autoSelectFirst']).toBe(true)
    expect(JSON.parse(fixture.stored.get(targetId)!)).toEqual(original)
  } finally {openSpy.mockRestore()}
})
