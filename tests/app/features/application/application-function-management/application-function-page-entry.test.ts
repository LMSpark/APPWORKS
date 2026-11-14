import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {computed, defineComponent, h, ref, shallowRef} from 'vue'
import {createMemoryHistory, createRouter, RouterView} from 'vue-router'
import {flushPromises, mount} from '@vue/test-utils'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import ElementPlus from 'element-plus'
import {DataSet, isDataRow, type DataRow, type DataView} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {LOWCODE_APPLICATION_CATALOG_FORM_KEY} from '@spark-appworks/spark-lowcode-api'
import {FieldText, sanitizeRichTextHtml} from '@spark-appworks/spark-component'
import {BLUEPRINT_AI_REJECTED} from '@/views/features/application/application-function-management/ui/application-function-page-contract'
import {BlueprintWorkspaceDataView} from '@/services/project/blueprint-workspace-dataview'
import {loadLowcodeRuntimeScenario} from '@/lowcode/data-space/lowcode-data-space-runtime'
import {lowcodeApi} from '@/lowcode/lowcode-runtime'
import * as BlueprintDocument from '@/lowcode/resources/application/project-blueprint-document'
import {LowcodeDictionary} from '@/lowcode/resources/structured-config/dictionary/resource'
import {catalogField, createDimensionRuntime} from '../../../../runtime/application/dimension/dimension.fixture'
import {useApplicationFunctionPage} from '@/views/features/application/application-function-management/ui/use-application-function-page'
import ApplicationFunctionPage from '@/views/features/application/application-function-management/ui/application-function-page.vue'
import {getVuePageOptions} from '@/registries/vue-page-registry'

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
const fixtureState = vi.hoisted(() => ({current: undefined as unknown, execution: 'EXECUTION', createChild: 'disabled' as 'enabled' | 'disabled',
  patchRows: undefined as undefined | ((rows: DataRow[]) => void), dimension: undefined as undefined | (() => Promise<DataSet>),
  catalogModels: [] as DataRow[], catalogFields: [] as DataRow[], ledgerRows: [] as DataRow[], applications: undefined as DataRow[] | undefined}))
const aiRunner = vi.hoisted(() => ({run: vi.fn<(message: string, signal?: AbortSignal) => Promise<string>>()}))
vi.mock('@/lowcode/resources/shared/ai-data-entry-host', () => ({AiDataEntryHost: class {
  createDraftRunner() {return aiRunner}
}}))
vi.mock('@/views/features/application/application-function-management/ui/blueprint-state/useDevState', () => ({useDevState: () => fixtureState.current,
  BLUEPRINT_NODE_STATUS_SCENARIO_ID: 'FB291E325272007AEED8921C28B93CFD',
  BLUEPRINT_APPLICATION_MEMBER_SCENARIO_ID: '0C70F74793F9E858B71E0DBDEC784D57',
  BLUEPRINT_DIMENSION_DESIGN_SCENARIO_ID: '88A4D51B01702C3856F4632E234BF34B',
  BLUEPRINT_DIMENSION_LEDGER_SCENARIO_ID: '07D264520034366B1DA25CEE5358E502'}))
vi.mock('@spark-appworks/spark-app', async importOriginal => {
  const actual = await importOriginal<typeof import('@spark-appworks/spark-app')>()
  return {...actual, useSystemPageDirtySource: vi.fn()}
})
// 共享的 dev-system 数据空间选择器与内容设计器另有专测；此处以替身复现其合同：暂存 conid 覆盖后发出 sceneChosen。
const sceneChoice = vi.hoisted(() => ({next: ''}))
vi.mock('@/views/features/application/application-function-management/ui/blueprint-data-space/NodeDataSpaceBinding.vue', async () => {
  const {defineComponent: define, h: render} = await import('vue')
  return {default: define({
    name: 'NodeDataSpaceBinding',
    props: {state: {type: Object, required: true}},
    emits: ['sceneChosen'],
    setup(props, {emit}) {
      return () => render('button', {class: 'node-basic-info-stub', onClick: () => {
        const state = props.state
        const owner = state['blueprintWorkspaceDataView'].value
        owner.view.updateEditingValue(owner.nodeId, 'conid', sceneChoice.next)
        emit('sceneChosen', sceneChoice.next)
      }}, 'choose')
    },
  })}
})
vi.mock('@/views/features/application/application-function-management/ui/blueprint-data-space/DataPlanningPane.vue', async () => {
  const {defineComponent: define, h: render} = await import('vue')
  return {default: define({name: 'DataPlanningPane', props: {state: {type: Object, required: true}, fieldAccess: {type: Object, required: true}},
    setup: () => () => render('div', {class: 'data-planning-pane-stub'})})}
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
const DIMENSION = '88A4D51B01702C3856F4632E234BF34B'
const LEDGER = '07D264520034366B1DA25CEE5358E502'
const TARGET = 'EXECUTION'
const NAVIGATION = 'BLUEPRINT-PAGE'
const HOST_FIELDS = ['rowid', 'prowid', 'dataSetId', 'DataName', 'ValParamName', 'TextParamName', 'selectValParam', 'selectTextParam', 'selectPid']
const NODE_FIELDS = ['rowid', 'SysId', 'prowid', 'FunOrderValue', 'name', 'FunName', 'funCode', 'conType', 'NavigationUrl', 'memo', 'status',
  'personCharge', 'NavigationImageWxz', 'MobileUrl', 'NavigationType', 'ChildItemLocation', 'NavigationShowType', 'HorizontalAlignment',
  'IsShowAtNav', 'IsShowChildItem', 'BeginGroup', 'conid', 'htmlDesc']
const VERSION_FIELDS = ['rowid', 'prowid', 'VersionName', 'desc']
const datasets: DataSet[] = []
let createdRows = 0
const disposals: Array<() => void> = []
afterEach(() => {
  disposals.splice(0).forEach(dispose => dispose())
  datasets.splice(0).forEach(dataSet => {if (!dataSet.destroyed) dataSet.destroy()})
})
beforeEach(() => {fixtureState.execution = 'EXECUTION'; fixtureState.createChild = 'disabled'; fixtureState.patchRows = undefined; fixtureState.dimension = undefined; fixtureState.catalogModels = []; fixtureState.catalogFields = []; fixtureState.ledgerRows = []; fixtureState.applications = undefined; vi.mocked(loadLowcodeRuntimeScenario).mockReset(); aiRunner.run.mockReset()})

function matches(row: DataRow, filter: unknown, context: Readonly<Record<string, unknown>> = {}): boolean {
  if (!isDataRow(filter)) return true
  const conditions = filter['conditions'] ?? filter['filters']
  if (Array.isArray(conditions)) return filter['logic'] === 'or'
    ? conditions.some(condition => matches(row, condition, context))
    : conditions.every(condition => matches(row, condition, context))
  if (typeof filter['field'] !== 'string') return true
  const raw = filter['value']
  const actual = row[filter['field']], expected = isDataRow(raw) && raw['Type'] === 'GetInputParam' ? context[String(raw['ParamName'])] : raw
  if (filter['operator'] === 'in') return Array.isArray(expected) && expected.includes(actual)
  if (filter['operator'] === 'is-empty') return actual === undefined || actual === null || actual === ''
  return actual === expected
}

type PagedataColumn = Readonly<{name: string; type?: string; pattern?: string; patternMessage?: string; computeExpression?: string}>
type PagedataView = Readonly<{queryConfig?: {fields?: string[]}; filterExpression?: unknown}>
type PagedataTable = Readonly<{modelBinding: {modelId: string; modelName: string}; columns?: PagedataColumn[]; views: Record<string, PagedataView>}>
const readPagedata = (path: string): {tables: Record<string, PagedataTable>} => JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8'))
const blueprintPagedata = readPagedata('config/pages/application/project-blueprint/pagedata.json')
const ledgerPagedata = readPagedata('config/pages/structured-config/dimension-ledger/pagedata.json')
const NUMBER_FIELDS = ['FunOrderValue', 'IsOutput', 'IsPKey', 'lingma_sys_is_delete']
/** 正式 pagedata 表：视图投影与过滤引用的字段为模型列，pagedata 计算列追加其后。 */
function pagedataTable(table: PagedataTable) {
  const computed = (table.columns ?? []).filter(column => column.computeExpression)
  const fields = new Set(['rowid'])
  for (const view of Object.values(table.views)) {
    view.queryConfig?.fields?.forEach(field => fields.add(field))
    for (const match of JSON.stringify(view.filterExpression ?? {}).matchAll(/"field":"([^"]+)"/g)) if (match[1]) fields.add(match[1])
  }
  return {modelBinding: table.modelBinding, views: table.views, columns: [...[...fields].filter(name => !computed.some(column => column.name === name))
    .map(name => ({name, type: NUMBER_FIELDS.includes(name) ? 'number' : 'string', isPrimaryKey: name === 'rowid'})), ...computed]}
}
function bindAllViews(dataSet: DataSet, source: Record<string, PagedataTable>, table: string, rows: DataRow[]) {
  for (const viewId of Object.keys(source[table]!.views)) bindRows(dataSet.getView(table, viewId)!, rows)
}
const CATALOG_MODEL_TABLES = ['Base_DataModel', 'Base_DataModel_Field'] as const
const NAVIGATION_URL_RULE = blueprintPagedata.tables['Base_NavigationInfo']?.columns?.find(column => column.name === 'NavigationUrl')
const DICTIONARY_VIEWS = ['NavigationType', 'NavigationShowType_Content', 'NavChildrenLocation', 'Navigationposition', 'DataCatalogParamType',
  'Dict_Page_Popup', 'Dict_Desktop_AppType', 'DesktopStyle']

function catalogDataSet() {
  const tables: Record<string, unknown> = Object.fromEntries([
    {model: 'Base_Navigation_DataRelation', fields: HOST_FIELDS},
    {model: 'Base_AppSystemList', fields: ['rowid', 'AppName']},
    {model: 'Base_NavigationInfo', fields: NODE_FIELDS},
    {model: 'Base_Navigation_Desc_Version', fields: VERSION_FIELDS},
  ].map(({model, fields}) => {
    const navigation = model === 'Base_NavigationInfo'
    return [model, {modelBinding: {modelId: `${model}-ID`, modelName: model},
      columns: fields.map(name => ({name, type: name === 'FunOrderValue' ? 'number' : 'string', isPrimaryKey: name === 'rowid',
        ...(navigation && name === 'NavigationUrl' ? NAVIGATION_URL_RULE : {})})),
      views: {default: {autoLoad: false, ...(navigation
        ? {treeConfig: {idField: 'rowid', parentIdField: 'prowid', textField: 'FunName', rootParentValue: '000000'}} : {})},
      ...(navigation ? {savedProjectNodes: {autoLoad: false, queryConfig: {allPages: true, maxRows: 50000},
        filterExpression: {field: 'SysId', operator: 'eq', value: {Type: 'GetInputParam', ParamName: 'projectId'}}}} : {})}}]
  }))
  for (const table of CATALOG_MODEL_TABLES) tables[table] = pagedataTable(blueprintPagedata.tables[table]!)
  const dataSet = DataSet.fromJson({scenarioId: CATALOG, tables})
  datasets.push(dataSet)
  return dataSet
}

function bindRows(view: DataView, rows: DataRow[], options: Readonly<{hidden?: readonly string[]; crud?: boolean}> = {}) {
  const hidden = options.hidden ?? []
  const crud = options.crud ? 'enabled' as const : 'disabled' as const
  const result = (selected: DataRow[]) => ({
    rows: selected.map(row => ({...row})), total: selected.length, countReported: true, resultPrimaryKey: 'rowid',
    assertIdentity: () => undefined,
    prepareNewRow: (data: DataRow) => ({...data, rowid: typeof data['rowid'] === 'string' && data['rowid'] ? data['rowid'] : `NEW-${++createdRows}`}),
    rowKey: (row: Readonly<DataRow>) => row['rowid'],
    fieldAccess: (_key: unknown, field: string) => ({
      read: hidden.includes(field) ? 'invisible' as const : 'visible' as const,
      write: hidden.includes(field) ? 'denied' as const : 'allowed' as const,
      component: 'editable' as const, required: false, writeMode: 'editable' as const,
    }),
    readFieldAccess: (_row: Readonly<DataRow>, field: string) => hidden.includes(field) ? 'invisible' as const : 'visible' as const,
    addActionState: () => crud, editActionState: () => 'enabled' as const,
    deleteActionState: () => crud, createChildActionState: () => fixtureState.createChild,
    viewActionState: () => 'enabled' as const,
  })
  type Save = NonNullable<Parameters<DataView['bindQueryExecutor']>[0]['save']>
  const save = vi.fn(async (command: Parameters<Save>[0]) =>
    command.changes.map(change => {
      const changed = change.changes.changed ?? [], added = change.changes.added ?? [], deleted = change.changes.deleted ?? []
      for (const patch of changed) {
        const row = rows.find(candidate => candidate['rowid'] === patch['rowid'])
        if (!row) throw new Error('test save target missing')
        Object.assign(row, patch)
      }
      for (const row of added) rows.push({...row})
      for (const row of deleted) {
        const index = rows.findIndex(candidate => candidate['rowid'] === row['rowid'])
        if (index >= 0) rows.splice(index, 1)
      }
      return {metaName: change.identity.metaName, changed, added, deleted,
        changedFields: changed.map(row => Object.keys(row)), context: result(rows)}
    }))
  view.bindQueryExecutor({queryColumns: target => target.columns,
    executeQuery: async (_target, params) => result(rows.filter(row => matches(row, params.filter, params.context ?? {}))), save,
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
  const node = (row: DataRow): DataRow => ({...Object.fromEntries(NODE_FIELDS.map(field => [field, ''])), ...row})
  const rows: DataRow[] = [
    node({rowid: 'NODE-1', SysId: TARGET, prowid: '000000', FunOrderValue: 0, name: 'Root', FunName: 'Root', conType: 'Model', funCode: 'ROOT', memo: '', NavigationUrl: ''}),
    node({rowid: 'NODE-2', SysId: TARGET, prowid: 'NODE-1', FunOrderValue: 0, name: 'Child', FunName: 'Child', conType: 'Model', funCode: 'CHILD', memo: '', NavigationUrl: ''}),
    node({rowid: 'NODE-3', SysId: TARGET, prowid: 'NODE-2', FunOrderValue: 0, name: 'Grandchild', FunName: 'Grandchild', conType: 'Model', funCode: 'GRAND', memo: '', NavigationUrl: ''}),
    node({rowid: 'NODE-4', SysId: TARGET, prowid: 'NODE-3', FunOrderValue: 0, name: 'Leaf', FunName: 'Leaf', conType: 'Model', funCode: 'LEAF', memo: '', NavigationUrl: ''}),
  ]
  fixtureState.patchRows?.(rows)
  const view = ownerDataSet.getView('Base_NavigationInfo')!
  const save = bindRows(view, rows)
  bindRows(ownerDataSet.getView('Base_NavigationInfo', 'savedProjectNodes')!, rows)
  bindAllViews(ownerDataSet, blueprintPagedata.tables, 'Base_DataModel', fixtureState.catalogModels)
  bindAllViews(ownerDataSet, blueprintPagedata.tables, 'Base_DataModel_Field', fixtureState.catalogFields)
  const versionRows: DataRow[] = [
    {rowid: 'VER-1', prowid: 'NODE-1', VersionName: 'Tester[2024-01-01 00:00:00] first', desc: '<p>v1<script>x()</script></p>'},
    {rowid: 'VER-OTHER', prowid: 'NODE-2', VersionName: 'other', desc: '<p>other</p>'},
  ]
  const versionSave = bindRows(ownerDataSet.getView('Base_Navigation_Desc_Version')!, versionRows, {crud: true})
  const owner = new BlueprintWorkspaceDataView(ownerDataSet, TARGET, () => {
    if (fixtureState.execution !== 'EXECUTION') throw new Error('owner执行应用已切换')
  })
  const statusScenario = 'FB291E325272007AEED8921C28B93CFD', memberScenario = '0C70F74793F9E858B71E0DBDEC784D57'
  const runtime = new PageRuntime({pageId: NAVIGATION, scenarioIds: [CATALOG, LowcodeDictionary.editorScenarioId, statusScenario, memberScenario, DIMENSION, LEDGER],
    deferredScenarioIds: [statusScenario, memberScenario, DIMENSION, LEDGER],
    loadScenario: async scenarioId => {
      if (scenarioId === LowcodeDictionary.editorScenarioId) {
        const dictionary = DataSet.fromJson({scenarioId, tables: {_Base_DictData: {modelBinding: {modelId: 'DICT-ID', modelName: '_Base_DictData'},
          columns: ['rowid', 'typeid', 'val', 'txt'].map(name => ({name, type: 'string', isPrimaryKey: name === 'rowid'})),
          views: Object.fromEntries([['default', {autoLoad: false}], ...DICTIONARY_VIEWS.map(viewId => [viewId, {autoLoad: false, valueField: 'val', labelField: 'txt',
            filterExpression: {field: 'typeid', operator: 'eq', value: viewId}}])])}}})
        datasets.push(dictionary)
        const dictionaryRows: DataRow[] = [{rowid: 'D1', typeid: 'NavigationType', val: '3', txt: '当前窗体'}]
        for (const viewId of DICTIONARY_VIEWS) bindRows(dictionary.getView('_Base_DictData', viewId)!, dictionaryRows)
        return dictionary
      }
      if (scenarioId === DIMENSION) {
        if (!fixtureState.dimension) throw new Error('fixture dimension scenario missing')
        return fixtureState.dimension()
      }
      if (scenarioId === LEDGER) {
        const ledger = DataSet.fromJson({scenarioId, tables: {Bil_Dimension_Set: pagedataTable(ledgerPagedata.tables['Bil_Dimension_Set']!)}})
        datasets.push(ledger)
        bindAllViews(ledger, ledgerPagedata.tables, 'Bil_Dimension_Set', fixtureState.ledgerRows)
        return ledger
      }
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
  // 与 useDevState 同口径：正式值取 DataView 原始行，覆盖与原始值不同即为待保存绑定。
  const conidOf = (read: (field: string) => unknown): string | undefined => {
    void revision.value
    const node = selectedNode.value
    if (!node || owner.nodeId !== node.nodeId || !owner.row || !owner.canRead('conid')) return undefined
    const value = read('conid')
    return typeof value === 'string' ? value.trim() : ''
  }
  const state = {
    get projectId() {return editingProject.value},
    blueprintWorkspaceDataView: shallowRef(owner), blueprintPageRuntime: shallowRef(runtime),
    selectedNode, externalDataViewRevision: revision,
    persistedDataSpaceId: computed(() => conidOf(field => owner.row?.[field]) ?? ''),
    sceneBindingPending: computed(() => {
      const raw = conidOf(field => owner.row?.[field])
      const current = conidOf(field => owner.value(field) ?? owner.row?.[field])
      return raw !== undefined && raw !== current
    }),
    blueprintNodeFieldAccess: (field: string) => ({read: owner.canRead(field), write: owner.canWrite(field)}),
    hasAnyDirty: computed(() => {void revision.value; return owner.dirty}),
    hasAnyFileDirty: ref(false), blueprintSaving: ref(false), editor: {dirtyScenarioIds: []}, project: {},
    openEditingProject: vi.fn(async ({projectId}: {projectId: string}) => {editingProject.value = projectId; return true}),
    loadBlueprintWorkspaceDataView: vi.fn(async () => owner),
    loadBlueprintLazyTreeFromDataView: vi.fn(async () => owner.loadProjectTreeLazy()),
    loadBlueprintChildrenFromDataView: vi.fn(async (nodeId: string) => {await owner.loadChildren(nodeId); revision.value++}),
    locateBlueprintNodeFromDataView: vi.fn(async (nodeId: string) => owner.locateNode(nodeId)),
    addBlueprintModuleNode: vi.fn(async (_parent: string | null, _fields?: Readonly<Record<string, string>>) => 'NODE-2'),
    removeNodeByIdAndWait: vi.fn(async () => true),
    statusMessages: ref<Array<{text: string}>>([]),
    selectNodeById: vi.fn(async (nodeId: string) => {await owner.load(nodeId); selectedNode.value = {nodeId}}),
    refreshBlueprintTreeProjection: vi.fn(),
    notifyExternalDataViewChanged: () => {revision.value++},
    childCreateActionState: () => 'disabled',
    loadNavigationDictionaryOptions: vi.fn(async () => undefined),
  }
  fixtureState.current = state
  let loadCount = 0
  vi.mocked(loadLowcodeRuntimeScenario).mockImplementation(async () => {
    const dataSet = catalogDataSet()
    bindRows(dataSet.getView('Base_AppSystemList')!, fixtureState.applications ?? [{rowid: TARGET, AppName: 'Designed application'}], {hidden})
    if (++loadCount === 1 && candidateLoaded) await candidateLoaded(dataSet)
    return dataSet
  })
  capturedPage = undefined
  const router = createRouter({history: createMemoryHistory(), routes: [{
    path: '/apps/:projectId/:pathMatch(.*)*', component: ApplicationFunctionPage,
    meta: {systemPageIdentityState: 'resolved', nodeId: NAVIGATION},
  }]})
  const path = '/apps/EXECUTION/features/application/application-function-management/ui/application-function-page'
  await router.push({path, query: {__sparkNavigationId: NAVIGATION, ...query}})
  await router.isReady()
  const wrapper = mount(defineComponent({render: () => h(RouterView)}), {global: {
    plugins: [router, ElementPlus],
  }})
  disposals.push(() => wrapper.unmount())
  await flushPromises()
  return {page: readPageInstance(), state, owner, view, rows, save, wrapper, router, path, versionRows, versionSave}
}

describe('application function page entry', () => {
  it('designs the execution application confirmed by the formal catalog without requiring a node', async () => {
    const {page, state} = await setup()
    expect(page.error.value).toBe('')
    expect(state.openEditingProject).toHaveBeenCalledWith({projectId: TARGET})
    expect(page.treeContext.value?.projectId).toBe(TARGET)
    expect(page.selectedNodeId.value).toBe('')
    expect(vi.mocked(loadLowcodeRuntimeScenario).mock.calls.every(([command]) => command.projectId === TARGET)).toBe(true)
  })

  it('ignores a legacy sysid query instead of designing another application', async () => {
    const {page, state} = await setup({sysid: 'ANOTHER-APP'})
    expect(page.error.value).toBe('')
    expect(state.openEditingProject).toHaveBeenCalledWith({projectId: TARGET})
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

  it('keeps a lazily appended row whose parent is not loaded out of the root layer', async () => {
    const {owner, rows, view} = await setup()
    rows.push({rowid: 'NODE-ORPHAN', SysId: TARGET, prowid: 'NODE-GONE', FunOrderValue: 0, name: 'Orphan', FunName: 'Orphan', conType: 'Model', funCode: 'ORPHAN', memo: '', NavigationUrl: ''})
    await expect(owner.locateNode('NODE-ORPHAN')).rejects.toThrow('未读取到蓝图父节点')
    expect(view.rows.some(row => row['rowid'] === 'NODE-ORPHAN')).toBe(true)
    const tree = owner.treeProjection()
    expect(tree.nodeId).toBe('NODE-1')
    expect(JSON.stringify(tree)).not.toContain('NODE-ORPHAN')
  })

  it('queues a structural refresh behind an in-flight lazy expand so expanded children survive', async () => {
    fixtureState.createChild = 'enabled'
    const {owner, view} = await setup()
    const order: string[] = []
    const append = view.appendQueryRows.bind(view)
    let release!: () => void
    const gate = new Promise<void>(resolve => {release = resolve})
    const appendSpy = vi.spyOn(view, 'appendQueryRows').mockImplementationOnce(async options => {
      order.push('expand-start'); await gate; const result = await append(options); order.push('expand-end'); return result
    })
    const refresh = view.refresh.bind(view)
    const refreshSpy = vi.spyOn(view, 'refresh').mockImplementation(async () => {order.push('refresh'); return refresh()})
    const expanding = owner.loadChildren('NODE-3')
    await flushPromises()
    const adding = owner.addChildNode('NODE-1', {FunName: 'Added', name: 'Added', conType: 'Model', FunOrderValue: 9})
    await flushPromises()
    expect(order).toEqual(['expand-start'])
    release()
    await expanding
    await adding
    expect(order.indexOf('refresh')).toBeGreaterThan(order.indexOf('expand-end'))
    expect(owner.childrenLoaded('NODE-3')).toBe(true)
    appendSpy.mockRestore(); refreshSpy.mockRestore()
  })

  it.each([
    {name: 'missing', rows: []},
    {name: 'another application', rows: [{rowid: 'ANOTHER-APP', AppName: 'Other'}]},
    {name: 'ambiguous', rows: [{rowid: TARGET, AppName: 'A'}, {rowid: TARGET, AppName: 'B'}]},
  ])('refuses to design when the catalog does not confirm exactly the execution application: $name', async ({rows}) => {
    fixtureState.applications = rows
    const {page, state} = await setup()
    expect(page.error.value).toContain('未确认蓝图目标')
    expect(state.openEditingProject).not.toHaveBeenCalled()
    expect(page.treeContext.value).toBeUndefined()
  })

  it('refuses a catalog application whose identity cannot be read', async () => {
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

function aiDraft(name: string, kind = 'page') {
  return {navigationTitle: `Title ${name}`, capabilityName: name, description: `About ${name}`, kind, deliveryStatus: 'plan'}
}

/** 按标准字段路径写入页面输入 DataView（static-data，不参与正式保存）。 */
function typeInput(setupResult: Awaited<ReturnType<typeof setup>>, field: string, value: string): void {
  const {page, state} = setupResult
  const input = state.blueprintPageRuntime.value.resolveView(page.inputViewKey.value)
  expect(input?.dataTable?.resourceType).toBe('static-data')
  input?.updateEditingValue(page.inputRowId, field, value)
  page.touchInput()
}

describe('application function page AI and prototype', () => {
  it('merges only whitelisted AI fields into owner module creation', async () => {
    fixtureState.createChild = 'enabled'
    const {owner, rows} = await setup()
    await expect(owner.addModuleNode('NODE-1', {funCode: 'X'})).rejects.toThrow('不允许覆盖字段 funCode')
    await owner.addModuleNode('NODE-1', {FunName: 'AI Page', name: 'AiPage', memo: 'desc', status: 'plan', conType: 'Navitem'})
    expect(rows.find(row => row['name'] === 'AiPage')).toMatchObject({prowid: 'NODE-1', FunName: 'AI Page', memo: 'desc', status: 'plan', conType: 'Navitem'})
  })

  it('rejects invalid tree output and writes nothing on reject or cancel', async () => {
    const ctx = await setup({nodeId: 'NODE-1'})
    const {page, state} = ctx
    page.ai.openTreeAi()
    await flushPromises()
    typeInput(ctx, 'requirement', 'build pages')
    expect(page.ai.treeAiRequirement.value).toBe('build pages')
    aiRunner.run.mockResolvedValueOnce('```json\n{"rows":[]}\n```')
    await page.ai.generateTreeAi()
    expect(page.error.value).toContain(BLUEPRINT_AI_REJECTED)
    expect(page.ai.treeAiPreview.value).toBeUndefined()
    expect(page.ai.treeAiOpen.value).toBe(true)
    aiRunner.run.mockResolvedValueOnce(JSON.stringify({rows: [{...aiDraft('PageA'), extra: 1}]}))
    await page.ai.generateTreeAi()
    expect(page.ai.treeAiPreview.value).toBeUndefined()
    aiRunner.run.mockResolvedValueOnce(JSON.stringify({rows: [aiDraft('PageA')]}))
    await page.ai.generateTreeAi()
    expect(page.ai.treeAiPreview.value?.rows).toHaveLength(1)
    expect(aiRunner.run.mock.calls[0]?.[0]).toContain('写入位置：Root')
    page.ai.cancelAi()
    expect(page.ai.treeAiPreview.value).toBeUndefined()
    expect(state.addBlueprintModuleNode).not.toHaveBeenCalled()
  })

  it('writes confirmed tree drafts under the selected parent and resumes after a partial failure', async () => {
    const ctx = await setup({nodeId: 'NODE-1'})
    const {page, state} = ctx
    page.ai.openTreeAi()
    await flushPromises()
    typeInput(ctx, 'requirement', 'two pages')
    aiRunner.run.mockResolvedValueOnce(JSON.stringify({rows: [aiDraft('PageA'), aiDraft('ModB', 'module')]}))
    await page.ai.generateTreeAi()
    state.addBlueprintModuleNode.mockResolvedValueOnce('NEW-A').mockRejectedValueOnce(new Error('denied'))
    await page.ai.confirmTreeAi()
    expect(page.error.value).toContain('1/2')
    expect(page.ai.treeAiCreated.value).toBe(1)
    await page.ai.confirmTreeAi()
    expect(state.addBlueprintModuleNode.mock.calls).toEqual([
      ['NODE-1', {FunName: 'Title PageA', name: 'PageA', memo: 'About PageA', status: 'plan', conType: 'Navitem'}],
      ['NODE-1', {FunName: 'Title ModB', name: 'ModB', memo: 'About ModB', status: 'plan', conType: 'Model'}],
      ['NODE-1', {FunName: 'Title ModB', name: 'ModB', memo: 'About ModB', status: 'plan', conType: 'Model'}],
    ])
    expect(page.ai.treeAiPreview.value).toBeUndefined()
    expect(page.notice.value).toContain('2')
    expect(page.expandedKeys.value).toContain('NODE-1')
  })

  it('backfills a confirmed form draft into the editing overlay without saving', async () => {
    const {page, view, save} = await setup({nodeId: 'NODE-1'})
    aiRunner.run.mockResolvedValueOnce(JSON.stringify(aiDraft('Filled', 'module')))
    await page.ai.generateFormAi()
    expect(page.ai.formAiPreviewItems.value.map(item => item.value)).toContain('Filled')
    expect(view.getEditingRow('NODE-1')?.['name']).toBe('Root')
    page.ai.confirmFormAi()
    expect(page.error.value).toBe('')
    expect(view.getEditingRow('NODE-1')).toMatchObject({name: 'Filled', FunName: 'Title Filled', conType: 'Model', status: 'plan'})
    expect(save).not.toHaveBeenCalled()
    expect(page.notice.value).toBe('AI内容已回填到表单')
  })

  it('writes no backfill field when any draft field is not writable', async () => {
    const {page, owner, view} = await setup({nodeId: 'NODE-1'})
    aiRunner.run.mockResolvedValueOnce(JSON.stringify(aiDraft('Denied')))
    await page.ai.generateFormAi()
    vi.spyOn(owner, 'canWrite').mockImplementation(field => field !== 'status')
    page.ai.confirmFormAi()
    expect(page.error.value).toContain('status')
    expect(view.hasEditingChanges('NODE-1')).toBe(false)
  })

  it('drops a late form result after the selected node changes', async () => {
    const {page, view} = await setup({nodeId: 'NODE-1'})
    let resolve!: (text: string) => void
    aiRunner.run.mockImplementationOnce(() => new Promise<string>(done => {resolve = done}))
    const pending = page.ai.generateFormAi()
    await flushPromises()
    page.onNodeClick({rowid: 'NODE-2'})
    await flushPromises()
    expect(page.selectedNodeId.value).toBe('NODE-2')
    resolve(JSON.stringify(aiDraft('Late')))
    await pending
    expect(page.ai.formAiPreview.value).toBeUndefined()
    expect(page.ai.aiGenerating.value).toBe(false)
    expect(view.getEditingRow('NODE-2')?.['name']).toBe('Child')
  })

  it('saves sanitized prototype html and blocks saving or switching while uploads are unsettled', async () => {
    const {page, view, rows, save, state} = await setup({nodeId: 'NODE-1', blueprintTab: 'prototype'})
    expect(page.activeTab.value).toBe('prototype')
    const raw = '<p onclick="x()">hi</p><script>bad()</script>'
    view.updateEditingValue('NODE-1', 'htmlDesc', raw)
    state.notifyExternalDataViewChanged()
    page.prototype.onImageUploadState({pending: 1, error: ''})
    expect(await page.prototype.savePrototype()).toBe(false)
    page.selectTab('basic')
    expect(page.activeTab.value).toBe('prototype')
    expect(page.error.value).toContain('图片正在上传')
    page.prototype.onImageUploadState({pending: 0, error: 'boom'})
    expect(await page.prototype.savePrototype()).toBe(false)
    expect(save).not.toHaveBeenCalled()
    page.prototype.onImageUploadState({pending: 0, error: ''})
    const saved = await page.prototype.savePrototype()
    expect(page.error.value).toBe('')
    expect(saved).toBe(true)
    expect(rows[0]?.['htmlDesc']).toBe(sanitizeRichTextHtml(raw))
    expect(rows[0]?.['htmlDesc']).not.toMatch(/script|onclick/)
    expect(page.notice.value).toBe('需求原型已保存')
  })

  it('lists, previews, applies, creates and deletes versions of the selected node only', async () => {
    const ctx = await setup({nodeId: 'NODE-1', blueprintTab: 'prototype'})
    const {page, state, rows, versionRows} = ctx
    await flushPromises()
    const versions = state.blueprintPageRuntime.value.resolveView(page.prototype.versionViewKey.value)
    expect(versions?.rows.map(row => row['rowid'])).toEqual(['VER-1'])
    page.prototype.selectVersion({rowid: 'VER-1'})
    page.prototype.openPreview()
    expect(page.prototype.previewHtml.value).toContain('v1')
    expect(page.prototype.previewHtml.value).not.toContain('script')
    await page.prototype.applySelectedVersion()
    expect(page.error.value).toBe('')
    expect(rows[0]?.['htmlDesc']).toBe(sanitizeRichTextHtml('<p>v1<script>x()</script></p>'))
    page.prototype.beginCreateVersion()
    await flushPromises()
    expect(page.prototype.versionDialogOpen.value).toBe(true)
    typeInput(ctx, 'versionDescription', 'second')
    await page.prototype.confirmCreateVersion()
    expect(page.error.value).toBe('')
    expect(page.prototype.versionDialogOpen.value).toBe(false)
    const created = versionRows.find(row => String(row['VersionName']).endsWith('] second'))
    expect(created).toMatchObject({prowid: 'NODE-1', desc: rows[0]?.['htmlDesc']})
    page.prototype.selectVersion({rowid: 'VER-1'})
    page.prototype.beginDeleteVersion()
    expect(page.prototype.deletingVersion.value?.versionName).toContain('first')
    await page.prototype.confirmDeleteVersion()
    expect(page.error.value).toBe('')
    expect(versionRows.map(row => row['rowid'])).not.toContain('VER-1')
    expect(versionRows.map(row => row['rowid'])).toContain('VER-OTHER')
    expect(page.notice.value).toBe('删除成功')
  })
})

describe('application function page data space', () => {
  async function bound() {
    fixtureState.patchRows = rows => {
      rows.push({...rows[3], rowid: 'NODE-5', prowid: 'NODE-4', FunName: '', name: 'Deep cap', NavigationUrl: '/s', conid: 'SPACE-A'})
      rows[0]!['conid'] = 'SPACE-OTHER'
      rows[1]!['conid'] = 'SPACE-A'
      rows[1]!['NavigationUrl'] = '/g'
    }
    // 选中 NODE-2 只装载 NODE-1、NODE-2 的子层；NODE-4 及其子 NODE-5 需由影响范围查询按 conid 与父链增量读取。
    const ctx = await setup({nodeId: 'NODE-2', blueprintTab: 'dataSpace'})
    await flushPromises()
    return ctx
  }

  it('saves a chosen data space alone and verifies the formal readback', async () => {
    const {page, wrapper, rows, save, state} = await setup({nodeId: 'NODE-1', blueprintTab: 'dataSpace'})
    expect(page.error.value).toBe('')
    expect(wrapper.find('.node-basic-info-stub').exists()).toBe(true)
    sceneChoice.next = 'SPACE-A'
    await wrapper.get('.node-basic-info-stub').trigger('click')
    await flushPromises()
    expect(page.error.value).toBe('')
    expect(save).toHaveBeenCalledTimes(1)
    expect(rows[0]?.['conid']).toBe('SPACE-A')
    expect(state.persistedDataSpaceId.value).toBe('SPACE-A')
    expect(page.notice.value).toBe('数据空间绑定已保存')
    expect(page.dataSpace.canOpenDesign.value).toBe(true)
    page.dataSpace.openDesign()
    await flushPromises()
    expect(wrapper.find('.data-planning-pane-stub').exists()).toBe(true)
  })

  it('keeps the binding staged while other fields are pending and fences impact and design until saved', async () => {
    const {page, wrapper, view, save, state} = await setup({nodeId: 'NODE-1', blueprintTab: 'dataSpace'})
    view.updateEditingValue('NODE-1', 'memo', 'draft memo')
    sceneChoice.next = 'SPACE-B'
    await wrapper.get('.node-basic-info-stub').trigger('click')
    await flushPromises()
    expect(save).not.toHaveBeenCalled()
    expect(page.notice.value).toContain('已暂存')
    expect(state.sceneBindingPending.value).toBe(true)
    expect(page.dataSpace.canOpenDesign.value).toBe(false)
    expect(page.dataSpace.canQueryImpact.value).toBe(false)
    page.dataSpace.openDesign()
    expect(page.error.value).toContain('尚未保存回读')
  })

  it('reports a readback mismatch instead of claiming the binding was saved', async () => {
    const {page, wrapper, save, rows} = await setup({nodeId: 'NODE-1', blueprintTab: 'dataSpace'})
    const actual = save.getMockImplementation()
    if (!actual) throw new Error('fixture save missing')
    // 服务端规范化为不同的数据空间：正式回读与所选值不一致，不得报告保存成功。
    save.mockImplementationOnce(async command => actual({...command, changes: command.changes.map(change => ({...change,
      changes: {...change.changes, changed: (change.changes.changed ?? []).map(patch => ({...patch, conid: 'SPACE-X'}))}}))}))
    sceneChoice.next = 'SPACE-A'
    await wrapper.get('.node-basic-info-stub').trigger('click')
    await flushPromises()
    expect(rows[0]?.['conid']).toBe('SPACE-X')
    expect(page.notice.value).not.toBe('数据空间绑定已保存')
    expect(page.error.value).toContain('conid 保存后读回不一致')
  })

  it('lists every node bound to the saved space with its full path through the lazy DataView', async () => {
    const {page, state, owner, view} = await bound()
    expect(state.persistedDataSpaceId.value).toBe('SPACE-A')
    expect(view.rows.some(row => row['rowid'] === 'NODE-4' || row['rowid'] === 'NODE-5')).toBe(false)
    await page.dataSpace.openImpact()
    expect(page.error.value).toBe('')
    expect(page.dataSpace.impactError.value).toBe('')
    expect(page.dataSpace.impactTitle.value).toBe(`应用 ${TARGET} · 数据空间 SPACE-A`)
    const impact = state.blueprintPageRuntime.value.resolveView(page.dataSpace.impactViewKey.value)
    expect(impact?.dataTable?.resourceType).toBe('static-data')
    expect(impact?.rows.map(row => ({nodeId: row['nodeId'], path: row['path'], navigationTarget: row['navigationTarget']}))).toEqual([
      {nodeId: 'NODE-2', path: 'Root / Child', navigationTarget: '/g'},
      {nodeId: 'NODE-5', path: 'Root / Child / Grandchild / Leaf / Deep cap', navigationTarget: '/s'},
    ])
    expect(owner.childrenLoaded('NODE-3')).toBe(true)
    expect(owner.childrenLoaded('NODE-4')).toBe(true)
    expect(view.rows.filter(row => row['rowid'] === 'NODE-5')).toHaveLength(1)
  })

  it('fails the impact query when a bound candidate hides conid', async () => {
    const {page, view} = await bound()
    const original = view.fieldAccess.bind(view)
    vi.spyOn(view, 'fieldAccess').mockImplementation((row, field) => row?.['rowid'] === 'NODE-5' && field === 'conid'
      ? {...original(row, field), read: 'invisible'} : original(row, field))
    await page.dataSpace.openImpact()
    expect(page.dataSpace.impactError.value).toContain('conid 不可读')
  })

  it('drops a late impact result after the selected node changes', async () => {
    const {page, owner} = await bound()
    let release!: () => void
    const gate = new Promise<void>(resolve => {release = resolve})
    const original = owner.readDataSpaceImpact.bind(owner)
    vi.spyOn(owner, 'readDataSpaceImpact').mockImplementationOnce(async id => {await gate; return original(id)})
    const pending = page.dataSpace.openImpact()
    expect(page.dataSpace.impactOpen.value).toBe(true)
    page.onNodeClick({rowid: 'NODE-1'})
    await flushPromises()
    expect(page.selectedNodeId.value).toBe('NODE-1')
    expect(page.dataSpace.impactOpen.value).toBe(false)
    release()
    await pending
    expect(page.dataSpace.impactOpen.value).toBe(false)
    expect(page.dataSpace.impactError.value).toBe('')
    expect(page.dataSpace.impactLoading.value).toBe(false)
  })
})

describe('application function page dimension source design', () => {
  async function dimension() {
    const f = await createDimensionRuntime('R1', true, false)
    disposals.push(() => f.runtime.dispose())
    f.http.records['Bil_Dimension_Source_Mapping'] = []
    f.http.records['Bil_Dimension_Definition'] = [{id: 'D1', definition_code: 'cost', definition_name: '成本', status: true}]
    fixtureState.dimension = async () => f.dataSet
    fixtureState.catalogModels = [{rowid: 'MODEL', dataSetId: 'SPACE-A', Name: 'Expense', MetaName: 'expense_table', Type: '数据库表'},
      {rowid: 'OTHER', dataSetId: 'SPACE-B', Name: 'Other', MetaName: 'other_table', Type: '数据库表'}]
    fixtureState.catalogFields = [catalogField('F-ROWID', 'MODEL', 'RowID', {IsPKey: 1}), catalogField('F-AMOUNT', 'MODEL', 'amount')]
    return f
  }
  async function bound() {
    fixtureState.patchRows = rows => {rows[1]!['conid'] = 'SPACE-A'}
    const ctx = await setup({nodeId: 'NODE-2', blueprintTab: 'dataSpace'})
    await flushPromises()
    return ctx
  }
  function button(wrapper: Awaited<ReturnType<typeof setup>>['wrapper']) {
    const found = wrapper.findAll('button').find(candidate => candidate.text() === '维度来源设计')
    if (!found) throw new Error('维度来源设计按钮缺失')
    return found
  }

  it('disables the entry with a visible reason until the node has a saved data space', async () => {
    const {page, wrapper} = await setup({nodeId: 'NODE-1', blueprintTab: 'dataSpace'})
    expect(page.dimensionSource.canOpen.value).toBe(false)
    expect(page.dimensionSource.disabledReason.value).toBe('当前节点未绑定主数据空间，不能进行维度来源设计')
    expect(button(wrapper).attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('当前节点未绑定主数据空间')
    const {page: pending, view, state} = await bound()
    view.updateEditingValue('NODE-2', 'conid', 'SPACE-B')
    state.notifyExternalDataViewChanged()
    expect(pending.dimensionSource.disabledReason.value).toBe('数据空间绑定尚未保存回读，不能进行维度来源设计')
  })

  it('loads the deferred dimension scenario on open and lists the saved space models from the catalog', async () => {
    const f = await dimension()
    const {page, state, wrapper} = await bound()
    const runtime = state.blueprintPageRuntime.value
    expect(runtime.getDataSet(DIMENSION)).toBeUndefined()
    expect(button(wrapper).attributes('disabled')).toBeUndefined()
    await page.dimensionSource.openEditor()
    expect(page.dimensionSource.dialogError.value).toBe('')
    expect(runtime.getDataSet(DIMENSION)).toBe(f.dataSet)
    const models = runtime.resolveView(page.dimensionSource.modelViewKey.value)
    expect(models?.rows.map(row => row['rowid'])).toEqual(['MODEL'])
    expect(models?.dataSet).toBe(runtime.getDataSet(CATALOG))
  })

  it('drops a late model result when the selected node changes', async () => {
    const f = await dimension()
    let release!: () => void
    const gate = new Promise<void>(resolve => {release = resolve})
    fixtureState.dimension = async () => {await gate; return f.dataSet}
    const {page} = await bound()
    const pending = page.dimensionSource.openEditor()
    expect(page.dimensionSource.open.value).toBe(true)
    page.onNodeClick({rowid: 'NODE-1'})
    await flushPromises()
    expect(page.dimensionSource.open.value).toBe(false)
    release()
    await pending
    expect(page.dimensionSource.open.value).toBe(false)
    expect(page.dimensionSource.dialogError.value).toBe('')
    expect(page.dimensionSource.modelViewKey.value).toBe('')
  })

  it('cancels a drafted binding without writing anything', async () => {
    const f = await dimension()
    const {page, state} = await bound()
    await page.dimensionSource.openEditor()
    await page.dimensionSource.selectModel({rowid: 'MODEL'})
    expect(page.dimensionSource.dialogError.value).toBe('')
    const binding = state.blueprintPageRuntime.value.resolveView(page.dimensionSource.bindingViewKey.value)!
    binding.updateEditingValue(page.dimensionSource.bindingId.value!, 'binding_code', 'draft')
    await page.dimensionSource.addMapping()
    page.dimensionSource.close()
    expect(page.dimensionSource.open.value).toBe(false)
    expect(binding.rows.filter(row => row['binding_code'] === 'draft')).toEqual([])
    expect(f.http.saves).toEqual([])
  })

  it('saves the binding and mappings once, fills names from the option views, and refuses protected changes once the ledger uses it', async () => {
    const f = await dimension()
    const {page, state} = await bound()
    await page.dimensionSource.openEditor()
    await page.dimensionSource.selectModel({rowid: 'MODEL'})
    const runtime = state.blueprintPageRuntime.value
    const binding = runtime.resolveView(page.dimensionSource.bindingViewKey.value)!
    const id = page.dimensionSource.bindingId.value!
    for (const [key, value] of Object.entries({binding_code: 'expense-source', event_code: 'expense', status: '1'})) {
      binding.updateEditingValue(id, key, value)
    }
    await page.dimensionSource.addMapping()
    const mapping = runtime.resolveView(page.dimensionSource.mappingViewKey.value)!
    const mappingId = mapping.rows.map(row => mapping.getPkKey(row)).at(-1)!
    mapping.updateEditingValue(mappingId, 'source_field_id', 'F-AMOUNT')
    mapping.updateEditingValue(mappingId, 'target_definition_id', 'D1')
    await vi.waitFor(() => expect(mapping.getEditingRow(mappingId)).toMatchObject({source_field_name: 'amount', target_definition_code: 'cost'}))
    await page.dimensionSource.save()
    expect(page.dimensionSource.dialogError.value).toBe('')
    expect(page.notice.value).toBe('维度来源绑定已保存并回读确认')
    expect(page.dimensionSource.open.value).toBe(true)
    expect(page.dimensionSource.eventEntryReason.value).toBe('')
    expect(page.dimensionSource.commitEntryReason.value).toBe('')
    expect(f.http.records['Bil_Dimension_Source_Binding']).toEqual([expect.objectContaining({id, source_application_id: TARGET,
      source_node_id: 'NODE-2', source_model_id: 'MODEL', binding_code: 'expense-source'})])
    expect(f.http.records['Bil_Dimension_Source_Mapping']).toEqual([expect.objectContaining({binding_id: id, source_field_id: 'F-AMOUNT',
      source_field_name: 'amount', target_definition_id: 'D1', target_definition_code: 'cost'})])

    fixtureState.ledgerRows.push({rowid: 'S1', source_binding_id: String(id), lingma_sys_is_delete: 0})
    binding.updateEditingValue(id, 'binding_version', 2)
    const saves = f.http.saves.length
    await page.dimensionSource.save()
    expect(runtime.getDataSet(LEDGER)).toBeDefined()
    expect(page.dimensionSource.dialogError.value).toBe('已有正式维度结果使用此来源绑定，不能变更角色、模型、关联字段或绑定版本')
    expect(f.http.saves).toHaveLength(saves)
  })

  it('selects a registered platform event contract and forces its event code', async () => {
    await dimension()
    fixtureState.catalogModels = []
    const {page, state} = await bound()
    await page.dimensionSource.openEditor()
    expect(page.dimensionSource.candidateKind.value).toBe('platform-event')
    const contracts = state.blueprintPageRuntime.value.resolveView(page.dimensionSource.contractViewKey.value)!
    await page.dimensionSource.selectContract(contracts.rows[0]!)
    expect(page.dimensionSource.dialogError.value).toBe('')
    expect(page.dimensionSource.sourceKind.value).toBe('platform-event')
    const binding = state.blueprintPageRuntime.value.resolveView(page.dimensionSource.bindingViewKey.value)!
    expect(binding.getEditingRow(page.dimensionSource.bindingId.value!)).toMatchObject({source_kind: 'platform-event',
      event_code: 'enterprise.task.changed'})
    expect(page.dimensionSource.bindingSpecs.value.map(spec => spec.field)).not.toContain('account_field_id')
    expect(page.dimensionSource.bindingSpecs.value.find(spec => spec.field === 'event_code')?.readonly).toBe(true)
    page.dimensionSource.close()
  })
})

describe('application function page navigation and delivery', () => {
  it('opens the navAttr deep link, loads navigation dictionaries and shows why desktop and host are unavailable', async () => {
    const readModel = vi.spyOn(lowcodeApi.dataSpace.design, 'readModel').mockRejectedValue(new Error('模型不存在'))
    const readSpace = vi.spyOn(lowcodeApi.dataSpace.design, 'readSpaceDefinition')
      .mockImplementation(async ({dataSpaceId}) => ({dataSpaceId, name: 'Blueprint', raw: {}}))
    const {page, state} = await setup({nodeId: 'NODE-1', blueprintTab: 'navAttr'})
    await flushPromises()
    expect(page.activeTab.value).toBe('navAttr')
    expect(state.loadNavigationDictionaryOptions).toHaveBeenCalled()
    expect(page.desktop.unavailable.value).toContain('蓝图运行时缺少桌面视图')
    expect(page.navHost.error.value).toContain('导航宿主不可用')
    readModel.mockRestore()
    readSpace.mockRestore()
  })

  it('verifies the saved subtree against every registered Vue page and reports missing targets', async () => {
    const delivered = `vue:${getVuePageOptions().find(option => option.path.endsWith('/application-function-page'))!.path}`
    fixtureState.patchRows = rows => {
      Object.assign(rows[1]!, {conType: 'Navitem', IsShowAtNav: '1', NavigationUrl: delivered})
      Object.assign(rows[3]!, {conType: 'Navitem', IsShowAtNav: '1', NavigationUrl: 'vue:/not-delivered'})
    }
    const {page, owner} = await setup({nodeId: 'NODE-1', blueprintTab: 'navAttr'})
    expect(owner.dirty).toBe(false)
    await page.verifyCurrentNode()
    expect(page.verifyError.value).toBe('')
    expect(page.verifyResult.value?.visitedNodeIds).toEqual(['NODE-1', 'NODE-2', 'NODE-3', 'NODE-4'])
    expect(page.verifyResult.value?.issues.map(issue => [issue.nodeId, issue.code])).toEqual([['NODE-4', 'TARGET_NOT_IN_DELIVERY']])
    page.selectTab('basic')
    await flushPromises()
    expect(page.verifyResult.value).toBeUndefined()
  })

  it('blocks verification while navigation changes are pending', async () => {
    const {page, view, state} = await setup({nodeId: 'NODE-1', blueprintTab: 'navAttr'})
    view.updateEditingValue('NODE-1', 'NavigationUrl', 'vue:/draft')
    state.notifyExternalDataViewChanged()
    expect(page.verifyBlockedReason.value).toContain('请先保存当前导航地址')
    await page.verifyCurrentNode()
    expect(page.verifyResult.value).toBeUndefined()
  })

  it('reports the export receipt without claiming the document was generated', async () => {
    const submit = vi.spyOn(BlueprintDocument, 'submitBlueprintDocument')
      .mockResolvedValue({projectId: TARGET, kind: 'requirements-specification', status: 'submitted', coverage: 'legacy-menu-scope',
        message: '任务提交请求已确认；文档生成状态未知'})
    const {page} = await setup({nodeId: 'NODE-1'})
    await page.exportRequirements()
    expect(submit).toHaveBeenCalledWith(TARGET, 'requirements-specification')
    expect(page.notice.value).toBe('需求说明书请求已收到提交回执；文件生成状态未知。')
    submit.mockRejectedValueOnce(new Error('socket reset'))
    await page.exportRequirements()
    expect(page.error.value).toBe('导出需求说明书失败：socket reset')
    submit.mockRestore()
  })
})
