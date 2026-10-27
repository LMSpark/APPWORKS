import {mount, flushPromises} from '@vue/test-utils'
import {defineComponent, h} from 'vue'
import {describe, expect, it, vi} from 'vitest'
import NavHostProjectPicker from '@/views/app/dev-system/nav-host-project-picker/NavHostProjectPicker.vue'

const runtimeState = vi.hoisted(() => ({
  token: Symbol('PAGE_RUNTIME'),
  runtimes: [] as Array<{scenarioIds: string[]; disposed: boolean}>,
  provided: [] as Array<{key: unknown; value: unknown}>,
  hostView: undefined as any,
  projectView: undefined as any,
}))

vi.mock('vue-router', () => ({useRoute: () => ({query: {__sparkNavigationId: 'host-a'}})}))
vi.mock('@spark-appworks/spark-app', () => ({SYSTEM_PAGE_NAVIGATION_ID_QUERY: '__sparkNavigationId'}))
vi.mock('@spark-appworks/spark-lowcode-api', () => ({LOWCODE_APPLICATION_CATALOG_FORM_KEY: 'application-catalog-form'}))
vi.mock('@/lowcode/data-space/lowcode-data-space-runtime', () => ({loadLowcodeRuntimeScenario: vi.fn()}))
vi.mock('@spark-appworks/spark-project-model', () => ({
  PageRuntime: class {
    scenarioIds: string[]
    disposed = false
    constructor(options: {scenarioIds: string[]}) {this.scenarioIds = options.scenarioIds; runtimeState.runtimes.push(this)}
    async load() {}
    resolveView(key: string) {return key.includes('Base_Navigation_DataRelation') ? runtimeState.hostView : runtimeState.projectView}
    dispose() {this.disposed = true}
  },
}))
vi.mock('@spark-appworks/spark-data', () => ({
  buildDataViewKey: (model: string, view: string, scenario: string) => `${scenario}@${model}@${view}`,
  DataViewFilter: {condition: (value: unknown) => ({toJSON: () => value})},
}))
vi.mock('@spark-appworks/spark-component', async () => {
  const vue = await import('vue')
  const stub = (name: string, props: string[]) => vue.defineComponent({name, props, setup: (componentProps, {slots}) => () => {
    const values = componentProps as Record<string, unknown>
    return vue.h('div', {'data-stub': name, 'data-view-key': values['dataViewKey'], 'data-node-key': values['nodeKey']}, slots['default']?.())
  }})
  return {
    PAGE_RUNTIME: runtimeState.token,
    RendererButton: stub('RendererButton', ['dataViewKey', 'label', 'disabled', 'loading']),
    RendererTable: stub('RendererTable', ['dataViewKey', 'children', 'highlightCurrentRow', 'showDataViewMeta']),
    RendererTree: stub('RendererTree', ['dataViewKey', 'nodeKey', 'children', 'treeProps', 'showDataViewMeta', 'onNodeClick']),
    useSparkComponent: () => ({sparkProvide: (key: unknown, value: unknown) => runtimeState.provided.push({key, value}), sparkRemove: vi.fn()}),
  }
})

function dataView(rows: Record<string, unknown>[], fields: Record<string, unknown> = {}) {
  return {
    rows,
    total: rows.length,
    primaryKey: 'rowid',
    dataSet: {scenarioId: fields['scenarioId'] ?? 'projects'},
    dataTable: {modelBinding: {modelName: fields['modelName'] ?? 'Project'}},
    viewId: 'default',
    currentRow: null,
    queryConfig: {},
    fieldAccess: () => ({read: 'visible'}),
    getPkKey: (row: Record<string, unknown>) => row['rowid'] as string,
    resetState: vi.fn(),
    refresh: vi.fn().mockResolvedValue(undefined),
    setTreeConfig: vi.fn(),
  }
}

describe('NavHost project picker hierarchy rendering', () => {
  it('binds RendererTree to the temporary candidate DataView and retains its primary-key node identity', async () => {
    runtimeState.runtimes.length = 0
    runtimeState.provided.length = 0
    runtimeState.hostView = dataView([{
      rowid: 'rel-1', prowid: 'host-a', dataSetId: 'projects', DataName: 'Project',
      ValParamName: 'projectId', TextParamName: 'projectName', selectValParam: 'code', selectTextParam: 'name', selectPid: 'parent',
    }], {scenarioId: 'application-catalog-form', modelName: 'Base_Navigation_DataRelation'})
    runtimeState.projectView = dataView([
      {rowid: 'row-p', code: 'P', name: 'Parent', parent: ''},
      {rowid: 'row-c', code: 'C', name: 'Child', parent: 'P'},
    ])
    const wrapper = mount(NavHostProjectPicker, {
      props: {state: {projectId: 'project-current', tenantId: 'tenant-a', openEditingProject: vi.fn()} as never},
      global: {stubs: {
        'el-dialog': defineComponent({setup: (_props, {slots}) => () => h('div', slots['default']?.())}),
        'el-button': true,
      }},
    })
    await flushPromises()
    const tree = wrapper.find('[data-stub="RendererTree"]')
    expect(tree.exists(), wrapper.html()).toBe(true)
    expect(tree.attributes('data-view-key')).toBe('projects@Project@default')
    expect(tree.attributes('data-node-key')).toBe('rowid')
    expect(runtimeState.projectView.setTreeConfig).toHaveBeenCalledWith({idField: 'code', parentIdField: 'parent', textField: 'name', treeMode: 'flat'})
    const candidateRuntime = runtimeState.runtimes.find(item => item.scenarioIds[0] === 'projects')
    expect(runtimeState.provided).toContainEqual({key: runtimeState.token, value: candidateRuntime})
    wrapper.unmount()
    expect(candidateRuntime?.disposed).toBe(true)
  })
})
