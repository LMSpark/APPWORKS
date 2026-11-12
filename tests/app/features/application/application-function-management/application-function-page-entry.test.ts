import {computed, defineComponent, h, ref, shallowRef} from 'vue'
import {createMemoryHistory, createRouter, RouterView} from 'vue-router'
import {flushPromises, mount} from '@vue/test-utils'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import ElementPlus from 'element-plus'
import {DataSet, isDataRow, type DataRow, type DataView} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {LOWCODE_APPLICATION_CATALOG_FORM_KEY} from '@spark-appworks/spark-lowcode-api'
import {FieldText} from '@spark-appworks/spark-component'
import {BlueprintWorkspaceDataView} from '@/services/project/blueprint-workspace-dataview'
import {loadLowcodeRuntimeScenario} from '@/lowcode/data-space/lowcode-data-space-runtime'
import {useApplicationFunctionPage} from '@/views/features/application/application-function-management/ui/use-application-function-page'
import ApplicationFunctionPage from '@/views/features/application/application-function-management/ui/application-function-page.vue'

let capturedPage: ReturnType<typeof useApplicationFunctionPage> | undefined
function readPageInstance(): ReturnType<typeof useApplicationFunctionPage> {
  if (!capturedPage) throw new Error('page fixture did not mount')
  return capturedPage
}
vi.mock('@/views/features/application/application-function-management/ui/use-application-function-page', async importOriginal => {
  const actual = await importOriginal<typeof import('@/views/features/application/application-function-management/ui/use-application-function-page')>()
  return {...actual, useApplicationFunctionPage: () => {
    capturedPage = actual.useApplicationFunctionPage()
    return capturedPage
  }}
})
const fixtureState = vi.hoisted(() => ({current: undefined as unknown, execution: 'EXECUTION'}))
vi.mock('@/views/app/dev-system/useDevState', () => ({useDevState: () => fixtureState.current,
  BLUEPRINT_NODE_STATUS_SCENARIO_ID: 'FB291E325272007AEED8921C28B93CFD',
  BLUEPRINT_APPLICATION_MEMBER_SCENARIO_ID: '0C70F74793F9E858B71E0DBDEC784D57'}))
vi.mock('@spark-appworks/spark-app', async importOriginal => {
  const actual = await importOriginal<typeof import('@spark-appworks/spark-app')>()
  return {...actual, useSystemPageDirtySource: vi.fn()}
})
vi.mock('@/lowcode/data-space/lowcode-data-space-runtime', () => ({
  loadLowcodeRuntimeScenario: vi.fn(),
  readLowcodeExecutionProject: () => {
    const projectId = fixtureState.execution
    return {projectId, assertCurrent: () => {
      if (projectId !== fixtureState.execution) throw new Error('执行应用已切换')
    }}
  },
}))

const CATALOG = LOWCODE_APPLICATION_CATALOG_FORM_KEY
const TARGET = 'APP-TARGET'
const NAVIGATION = 'BLUEPRINT-PAGE'
const HOST_FIELDS = ['rowid', 'prowid', 'dataSetId', 'DataName', 'ValParamName', 'TextParamName', 'selectValParam', 'selectTextParam', 'selectPid']
const NODE_FIELDS = ['rowid', 'SysId', 'prowid', 'FunOrderValue', 'name', 'FunName', 'funCode', 'conType', 'NavigationUrl', 'memo', 'status']
const datasets: DataSet[] = []
const disposals: Array<() => void> = []
afterEach(() => {
  disposals.splice(0).forEach(dispose => dispose())
  datasets.splice(0).forEach(dataSet => {if (!dataSet.destroyed) dataSet.destroy()})
})
beforeEach(() => {fixtureState.execution = 'EXECUTION'; vi.mocked(loadLowcodeRuntimeScenario).mockReset()})

function matches(row: DataRow, filter: unknown): boolean {
  if (!isDataRow(filter)) return true
  const conditions = filter['conditions'] ?? filter['filters']
  if (Array.isArray(conditions)) return filter['logic'] === 'or'
    ? conditions.some(condition => matches(row, condition))
    : conditions.every(condition => matches(row, condition))
  if (typeof filter['field'] !== 'string') return true
  const actual = row[filter['field']], expected = filter['value']
  if (filter['operator'] === 'in') return Array.isArray(expected) && expected.includes(actual)
  if (filter['operator'] === 'is-empty') return actual === undefined || actual === null || actual === ''
  return actual === expected
}

function catalogDataSet() {
  const tables = Object.fromEntries([
    {model: 'Base_Navigation_DataRelation', fields: HOST_FIELDS},
    {model: 'Base_AppSystemList', fields: ['rowid', 'AppName']},
    {model: 'Base_NavigationInfo', fields: NODE_FIELDS},
  ].map(({model, fields}) => {
    return [model, {modelBinding: {modelId: `${model}-ID`, modelName: model},
      columns: fields.map(name => ({name, type: name === 'FunOrderValue' ? 'number' : 'string', isPrimaryKey: name === 'rowid'})),
      views: {default: {autoLoad: false, ...(model === 'Base_NavigationInfo'
        ? {treeConfig: {idField: 'rowid', parentIdField: 'prowid', textField: 'FunName', rootParentValue: '000000'}} : {})}}}]
  }))
  const dataSet = DataSet.fromJson({scenarioId: CATALOG, tables})
  datasets.push(dataSet)
  return dataSet
}

function bindRows(view: DataView, rows: DataRow[], hidden: readonly string[] = []) {
  const result = (selected: DataRow[]) => ({
    rows: selected.map(row => ({...row})), total: selected.length, countReported: true, resultPrimaryKey: 'rowid',
    assertIdentity: () => undefined,
    rowKey: (row: Readonly<DataRow>) => row['rowid'],
    fieldAccess: (_key: unknown, field: string) => ({
      read: hidden.includes(field) ? 'invisible' as const : 'visible' as const,
      write: hidden.includes(field) ? 'denied' as const : 'allowed' as const,
      component: 'editable' as const, required: false, writeMode: 'editable' as const,
    }),
    readFieldAccess: (_row: Readonly<DataRow>, field: string) => hidden.includes(field) ? 'invisible' as const : 'visible' as const,
    addActionState: () => 'disabled' as const, editActionState: () => 'enabled' as const,
    deleteActionState: () => 'disabled' as const, createChildActionState: () => 'disabled' as const,
    viewActionState: () => 'enabled' as const,
  })
  type Save = NonNullable<Parameters<DataView['bindQueryExecutor']>[0]['save']>
  const save = vi.fn(async (command: Parameters<Save>[0]) =>
    command.changes.map(change => {
      const changed = change.changes.changed ?? []
      for (const patch of changed) {
        const row = rows.find(candidate => candidate['rowid'] === patch['rowid'])
        if (!row) throw new Error('test save target missing')
        Object.assign(row, patch)
      }
      return {metaName: change.identity.metaName, changed, added: [], deleted: [],
        changedFields: changed.map(row => Object.keys(row)), context: result(rows)}
    }))
  view.bindQueryExecutor({queryColumns: target => target.columns,
    executeQuery: async (_target, params) => result(rows.filter(row => matches(row, params.filter))), save,
    appendQueryResult: (base, addition) => {
      const keys = new Set(base.rows.map(row => row['rowid']))
      return result([...base.rows, ...addition.rows.filter(row => !keys.has(row['rowid']))].map(row => ({...row})))
    }})
  return save
}

function optionDataSet(scenarioId: string, models: ReadonlyArray<{model: string; fields: readonly string[]; rows: DataRow[]}>) {
  const dataSet = DataSet.fromJson({scenarioId, tables: Object.fromEntries(models.map(({model, fields}) => [model, {
    modelBinding: {modelId: `${model}-ID`, modelName: model},
    columns: fields.map(name => ({name, type: 'string', isPrimaryKey: name === 'rowid'})),
    views: {default: {autoLoad: false}}}]))})
  datasets.push(dataSet)
  for (const {model, rows} of models) bindRows(dataSet.getView(model)!, rows)
  return dataSet
}

async function setup(query: Record<string, string | string[] | undefined> = {}, hidden: readonly string[] = [],
  candidateLoaded?: (dataSet: DataSet) => Promise<void>, memberUserIds = 'USER-1, USER-2') {
  const ownerDataSet = catalogDataSet()
  const rows: DataRow[] = [
    {rowid: 'NODE-1', SysId: TARGET, prowid: '000000', FunOrderValue: 0, name: 'Root', FunName: 'Root', conType: 'Model', funCode: 'ROOT', memo: '', NavigationUrl: ''},
    {rowid: 'NODE-2', SysId: TARGET, prowid: 'NODE-1', FunOrderValue: 0, name: 'Child', FunName: 'Child', conType: 'Model', funCode: 'CHILD', memo: '', NavigationUrl: ''},
    {rowid: 'NODE-3', SysId: TARGET, prowid: 'NODE-2', FunOrderValue: 0, name: 'Grandchild', FunName: 'Grandchild', conType: 'Model', funCode: 'GRAND', memo: '', NavigationUrl: ''},
    {rowid: 'NODE-4', SysId: TARGET, prowid: 'NODE-3', FunOrderValue: 0, name: 'Leaf', FunName: 'Leaf', conType: 'Model', funCode: 'LEAF', memo: '', NavigationUrl: ''},
  ]
  const view = ownerDataSet.getView('Base_NavigationInfo')!
  const save = bindRows(view, rows)
  const owner = new BlueprintWorkspaceDataView(ownerDataSet, TARGET, () => {
    if (fixtureState.execution !== 'EXECUTION') throw new Error('owner执行应用已切换')
  })
  const statusScenario = 'FB291E325272007AEED8921C28B93CFD', memberScenario = '0C70F74793F9E858B71E0DBDEC784D57'
  const runtime = new PageRuntime({pageId: NAVIGATION, scenarioIds: [CATALOG, statusScenario, memberScenario],
    deferredScenarioIds: [statusScenario, memberScenario],
    loadScenario: async scenarioId => {
      if (scenarioId === statusScenario) return optionDataSet(statusScenario, [
        {model: '功能导航状态字典', fields: ['rowid', 'val', 'txt'], rows: [{rowid: 'S0', val: '0', txt: '规划'}, {rowid: 'S1', val: '1', txt: '开发'}]},
        {model: 'Base_UserInfo', fields: ['rowid', 'UserName'], rows: [
          {rowid: 'USER-1', UserName: 'Alice'}, {rowid: 'USER-2', UserName: 'Bob'}, {rowid: 'USER-X', UserName: 'Outsider'}]},
      ])
      if (scenarioId === memberScenario) return optionDataSet(memberScenario, [
        {model: 'Base_MainBody_RoleUser', fields: ['rowid', 'EntityPKValue', 'UserIdField'], rows: [
          {rowid: 'M1', EntityPKValue: TARGET, UserIdField: memberUserIds}, {rowid: 'M2', EntityPKValue: 'OTHER', UserIdField: 'USER-X'}]},
      ])
      return ownerDataSet
    }})
  await runtime.load()
  disposals.push(() => runtime.dispose())
  const selectedNode = ref<{nodeId: string}>()
  const revision = ref(0), editingProject = ref('EXECUTION')
  const state = {
    get projectId() {return editingProject.value},
    blueprintWorkspaceDataView: shallowRef(owner), blueprintPageRuntime: shallowRef(runtime),
    selectedNode, externalDataViewRevision: revision,
    hasAnyDirty: computed(() => {void revision.value; return owner.dirty}),
    hasAnyFileDirty: ref(false), blueprintSaving: ref(false), editor: {dirtyScenarioIds: []}, project: {},
    openEditingProject: vi.fn(async ({projectId}: {projectId: string}) => {editingProject.value = projectId; return true}),
    loadBlueprintWorkspaceDataView: vi.fn(async () => owner),
    loadBlueprintLazyTreeFromDataView: vi.fn(async () => owner.loadProjectTreeLazy()),
    loadBlueprintChildrenFromDataView: vi.fn(async (nodeId: string) => {await owner.loadChildren(nodeId); revision.value++}),
    locateBlueprintNodeFromDataView: vi.fn(async (nodeId: string) => owner.locateNode(nodeId)),
    addBlueprintModuleNode: vi.fn(async (_parent: string | null) => 'NODE-2'),
    removeNodeByIdAndWait: vi.fn(async () => true),
    statusMessages: ref<Array<{text: string}>>([]),
    selectNodeById: vi.fn(async (nodeId: string) => {await owner.load(nodeId); selectedNode.value = {nodeId}}),
    refreshBlueprintTreeProjection: vi.fn(),
    notifyExternalDataViewChanged: () => {revision.value++},
    childCreateActionState: () => 'disabled',
  }
  fixtureState.current = state
  let loadCount = 0
  vi.mocked(loadLowcodeRuntimeScenario).mockImplementation(async () => {
    const dataSet = catalogDataSet()
    bindRows(dataSet.getView('Base_Navigation_DataRelation')!, [{
      rowid: 'HOST-RELATION', prowid: NAVIGATION, dataSetId: CATALOG, DataName: 'Base_AppSystemList',
      ValParamName: 'sysid', TextParamName: 'sysname', selectValParam: 'rowid', selectTextParam: 'AppName', selectPid: '',
    }])
    bindRows(dataSet.getView('Base_AppSystemList')!, [{rowid: TARGET, AppName: 'Designed application'}], hidden)
    if (++loadCount === 2 && candidateLoaded) await candidateLoaded(dataSet)
    return dataSet
  })
  capturedPage = undefined
  const router = createRouter({history: createMemoryHistory(), routes: [{
    path: '/apps/:projectId/:pathMatch(.*)*', component: ApplicationFunctionPage,
    meta: {systemPageIdentityState: 'resolved', nodeId: NAVIGATION},
  }]})
  const path = '/apps/EXECUTION/features/application/application-function-management/ui/application-function-page'
  await router.push({path, query: {__sparkNavigationId: NAVIGATION, sysid: TARGET, ...query}})
  await router.isReady()
  const wrapper = mount(defineComponent({render: () => h(RouterView)}), {global: {
    plugins: [router, ElementPlus],
  }})
  disposals.push(() => wrapper.unmount())
  await flushPromises()
  return {page: readPageInstance(), state, owner, view, rows, save, wrapper, router, path}
}

describe('application function page entry', () => {
  it('resolves a configured host target separately from the execution application without requiring a node', async () => {
    const {page, state} = await setup()
    expect(page.error.value).toBe('')
    expect(state.openEditingProject).toHaveBeenCalledWith({projectId: TARGET})
    expect(page.treeContext.value?.projectId).toBe(TARGET)
    expect(page.selectedNodeId.value).toBe('')
    expect(vi.mocked(loadLowcodeRuntimeScenario).mock.calls.every(([command]) => command.projectId === 'EXECUTION')).toBe(true)
  })

  it('uses the resolved formal navigation identity when an unambiguous route has no marker', async () => {
    const {page, state} = await setup({__sparkNavigationId: undefined})
    expect(page.error.value).toBe('')
    expect(state.openEditingProject).toHaveBeenCalledWith({projectId: TARGET})
  })

  it('rejects a query marker that disagrees with the resolved formal navigation identity', async () => {
    const {page, state} = await setup({__sparkNavigationId: 'FORGED-NAVIGATION'})
    expect(page.error.value).toContain('不匹配')
    expect(state.openEditingProject).not.toHaveBeenCalled()
    expect(vi.mocked(loadLowcodeRuntimeScenario)).not.toHaveBeenCalled()
  })

  it('honors deep-link location and tab without changing route identity on local selection', async () => {
    const {page, router} = await setup({nodeId: 'NODE-1', blueprintTab: 'dataSpace'})
    expect(page.error.value).toBe('')
    expect(page.activeTab.value).toBe('dataSpace')
    expect(page.selectedNodeId.value).toBe('NODE-1')
    const original = router.currentRoute.value.fullPath
    page.selectTab('basic')
    page.onNodeClick({rowid: 'NODE-2'})
    await flushPromises()
    expect(page.selectedNodeId.value).toBe('NODE-2')
    expect(router.currentRoute.value.fullPath).toBe(original)
  })

  it('loads the tree lazily by parent and locates a deep nodeId through its parent chain', async () => {
    const {page, owner, view} = await setup()
    expect(page.error.value).toBe('')
    expect(owner.isLazyTree).toBe(true)
    expect(view.rows.map(row => row['rowid']).sort()).toEqual(['NODE-1', 'NODE-2', 'NODE-3'])
    expect(owner.childrenLoaded('NODE-1')).toBe(true)
    expect(owner.childrenLoaded('NODE-2')).toBe(true)
    expect(owner.childrenLoaded('NODE-3')).toBe(false)
    page.onNodeExpand({rowid: 'NODE-2'})
    await flushPromises()
    expect(view.rows.map(row => row['rowid']).sort()).toEqual(['NODE-1', 'NODE-2', 'NODE-3', 'NODE-4'])
    expect(owner.childrenLoaded('NODE-3')).toBe(true)
    expect(page.expandedKeys.value).toContain('NODE-2')
  })

  it('prepares stage and member-scoped person options as deferred spaces of the same PageRuntime', async () => {
    const {page, state, wrapper} = await setup({nodeId: 'NODE-1'})
    expect(page.error.value).toBe('')
    expect(page.optionsReady.value).toBe(true)
    expect(page.peopleAvailable.value).toBe(true)
    expect(page.optionsError.value).toBe('')
    const runtime = state.blueprintPageRuntime.value
    expect(runtime.resolveView(page.statusOptionViewKey)?.rows.map(row => row['val'])).toEqual(['0', '1'])
    expect(runtime.resolveView(page.personOptionViewKey)?.rows.map(row => row['rowid']).sort()).toEqual(['USER-1', 'USER-2'])
    const keys = wrapper.findAllComponents({name: 'FieldSelect'}).map(field => field.props('optionDataViewKey'))
    expect(keys).toEqual(expect.arrayContaining([page.statusOptionViewKey, page.personOptionViewKey]))
  })

  it('reports an application without members instead of offering the unfiltered user directory', async () => {
    const {page, state} = await setup({nodeId: 'NODE-1'}, [], undefined, '')
    expect(page.optionsReady.value).toBe(true)
    expect(page.peopleAvailable.value).toBe(false)
    expect(page.optionsError.value).toContain('尚无成员')
    expect(state.blueprintPageRuntime.value.resolveView(page.personOptionViewKey)?.rows).toEqual([])
  })

  it('locates a node outside the loaded layers and expands its ancestors', async () => {
    const {page, owner, view} = await setup({nodeId: 'NODE-4', blueprintTab: 'dataSpace'})
    expect(page.error.value).toBe('')
    expect(page.activeTab.value).toBe('dataSpace')
    expect(page.selectedNodeId.value).toBe('NODE-4')
    expect(view.rows.map(row => row['rowid']).sort()).toEqual(['NODE-1', 'NODE-2', 'NODE-3', 'NODE-4'])
    expect(page.expandedKeys.value).toEqual(expect.arrayContaining(['NODE-1', 'NODE-2', 'NODE-3']))
    expect(owner.childrenLoaded('NODE-3')).toBe(true)
  })

  it('saves the stage online alone and refuses it while other basic fields are pending', async () => {
    const {page, view, rows, save} = await setup({nodeId: 'NODE-1'})
    expect(page.error.value).toBe('')
    view.updateEditingValue('NODE-1', 'status', '1')
    await page.onStageChange()
    expect(save).toHaveBeenCalledTimes(1)
    expect(rows[0]?.['status']).toBe('1')
    expect(view.hasEditingChanges('NODE-1')).toBe(false)
    view.updateEditingValue('NODE-1', 'memo', 'draft memo')
    view.updateEditingValue('NODE-1', 'status', '2')
    await page.onStageChange()
    expect(save).toHaveBeenCalledTimes(1)
    expect(page.error.value).toContain('阶段只能单独在线保存')
  })

  it('creates root, sibling and child modules at the parent derived from the selected node', async () => {
    const {page, state} = await setup({nodeId: 'NODE-2'})
    expect(page.error.value).toBe('')
    page.addSiblingNode(); await flushPromises()
    page.addChildNode(); await flushPromises()
    page.addRootNode(); await flushPromises()
    expect(state.addBlueprintModuleNode.mock.calls.map(([parent]) => parent)).toEqual(['NODE-1', 'NODE-2', null])
  })

  it('stages a lazy-tree drop from fresh rows and keeps expanded parents loaded after the structural reload', async () => {
    const {page, owner, view} = await setup()
    page.onNodeExpand({rowid: 'NODE-2'})
    await flushPromises()
    await owner.moveNodeRelative({nodeId: 'NODE-3', targetNodeId: 'NODE-1', position: 'after'})
    expect(owner.dirty).toBe(true)
    expect(view.getEditingRow('NODE-3')?.['prowid']).toBe('000000')
    expect(view.rows.map(row => row['rowid']).sort()).toEqual(['NODE-1', 'NODE-2', 'NODE-3', 'NODE-4'])
    expect(owner.childrenLoaded('NODE-2')).toBe(true)
    owner.cancel()
    expect(owner.dirty).toBe(false)
  })

  it.each([
    {sysid: '', projectId: TARGET},
    {sysid: [TARGET, 'ANOTHER']},
    {sysid: 'NOT-A-CANDIDATE'},
  ])('does not substitute route or unconfigured query identities for invalid targets: %j', async query => {
    const {page, state} = await setup(query)
    expect(page.error.value).not.toBe('')
    expect(state.openEditingProject).not.toHaveBeenCalled()
    expect(page.treeContext.value).toBeUndefined()
  })

  it('refuses a host candidate whose application identity cannot be read', async () => {
    const {page, state} = await setup({}, ['rowid'])
    expect(page.error.value).toContain('不可读')
    expect(state.openEditingProject).not.toHaveBeenCalled()
    expect(page.treeContext.value).toBeUndefined()
  })

  it('reports an invalid node without exposing the previous blueprint runtime', async () => {
    const {page} = await setup({nodeId: 'NODE-MISSING'})
    expect(page.error.value).toContain('未找到')
    expect(page.treeContext.value).toBeUndefined()
  })

  it('disposes late candidate runtimes after the execution application changes and never opens their target', async () => {
    let lateDataSet: DataSet | undefined
    const {page, state} = await setup({}, [], async dataSet => {
      lateDataSet = dataSet
      await Promise.resolve()
      fixtureState.execution = 'ANOTHER-EXECUTION'
    })
    expect(page.error.value).toContain('执行应用已切换')
    expect(state.openEditingProject).not.toHaveBeenCalled()
    expect(lateDataSet?.destroyed).toBe(true)
    expect(page.treeContext.value).toBeUndefined()
  })

  it('binds real fields to the owner runtime and only persists an explicit save; cancel restores the query baseline', async () => {
    const {page, state, owner, view, rows, save, wrapper, router, path} = await setup({nodeId: 'NODE-1'})
    expect(page.error.value).toBe('')
    const nameField = wrapper.findAllComponents(FieldText).find(field => field.props('dataField') === 'name')
    if (!nameField) throw new Error('native page name field did not bind')
    await nameField.get('input').setValue('Draft')
    await flushPromises()
    vi.useFakeTimers()
    try {await vi.advanceTimersByTimeAsync(1_600)}
    finally {vi.useRealTimers()}
    expect(view.getEditingRow('NODE-1')?.['name']).toBe('Draft')
    expect(rows[0]?.['name']).toBe('Root')
    expect(save).not.toHaveBeenCalled()
    expect(page.canCancelChanges.value).toBe(true)
    await router.push({path, query: {...router.currentRoute.value.query, nodeId: 'NODE-2'}})
    expect(router.currentRoute.value.query['nodeId']).toBe('NODE-1')
    page.cancelBlueprintChanges()
    await flushPromises()
    expect(nameField.get('input').element.value).toBe('Root')
    expect(state.hasAnyDirty.value).toBe(false)
    await nameField.get('input').setValue('Saved')
    await flushPromises()
    let release!: () => void
    const gate = new Promise<void>(resolve => {release = resolve})
    const originalSave = owner.save.bind(owner)
    const ownerSave = vi.spyOn(owner, 'save').mockImplementationOnce(async () => {await gate; await originalSave()})
    const saving = page.saveBlueprintChanges()
    expect(state.blueprintSaving.value).toBe(true)
    expect(page.canCancelChanges.value).toBe(false)
    await page.saveBlueprintChanges()
    expect(ownerSave).toHaveBeenCalledTimes(1)
    release()
    await saving
    expect(state.blueprintSaving.value).toBe(false)
    expect(save).toHaveBeenCalledTimes(1)
    expect(rows[0]?.['name']).toBe('Saved')
    expect(view.currentRow?.['name']).toBe('Saved')
    expect(state.hasAnyDirty.value).toBe(false)
  })
})
