import {mount, flushPromises} from '@vue/test-utils'
import {describe, expect, it, vi} from 'vitest'
import NavHostProjectPicker from '@/views/app/dev-system/nav-host-project-picker/NavHostProjectPicker.vue'
import {getBuiltinApplicationDescriptor} from '@/registries/builtin-application-registry'

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
  const stub = (name: string, props: string[]) => vue.defineComponent({name, props, emits: ['click'], setup: (componentProps, {slots, emit}) => () => {
    const values = componentProps as Record<string, unknown>
    return vue.h('div', {'data-stub': name, 'data-view-key': values['dataViewKey'], 'data-node-key': values['nodeKey'], onClick: () => {
      if (typeof values['onNodeClick'] === 'function') (values['onNodeClick'] as () => void)()
      if (typeof values['onRowClick'] === 'function') (values['onRowClick'] as () => void)()
      emit('click')
    }}, slots['default']?.())
  }})
  const dialog = vue.defineComponent({
    name: 'RendererDialog',
    props: {modelValue: Boolean, title: String, width: [String, Number], destroyOnClose: Boolean},
    emits: ['update:modelValue'],
    setup: (componentProps, {slots, emit, expose}) => {
      expose({requestClose: () => emit('update:modelValue', false)})
      return () => {
      const values = componentProps as Record<string, unknown>
      const content = values['modelValue'] ? [slots['default']?.(), slots['footer']?.()] : []
      return vue.h('div', {
        'data-stub': 'RendererDialog',
        'data-model-value': String(values['modelValue']),
        'data-title': values['title'],
        'data-width': values['width'],
        'data-destroy-on-close': String(values['destroyOnClose']),
      }, content)
      }
    },
  })
  const alert = vue.defineComponent({
    name: 'DisplayAlert',
    props: ['description', 'alertType', 'closable'],
    setup: (componentProps) => () => {
      const values = componentProps as Record<string, unknown>
      return vue.h('div', {'data-stub': 'DisplayAlert', role: 'alert', 'data-alert-type': values['alertType']}, String(values['description'] ?? ''))
    },
  })
  return {
    PAGE_RUNTIME: runtimeState.token,
    DisplayAlert: alert,
    RendererButton: stub('RendererButton', ['dataViewKey', 'label', 'disabled', 'loading']),
    RendererDialog: dialog,
    RendererTable: stub('RendererTable', ['dataViewKey', 'children', 'highlightCurrentRow', 'showDataViewMeta', 'onRowClick']),
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
    currentRow: fields['currentRow'] ?? null,
    queryOptionRows: vi.fn(async ({fields: requested, filter}: any) => {
      const condition = filter as {field: string; value: unknown} | undefined
      const matches = rows.filter(row => !condition || row[condition.field] === condition.value)
      return matches.map(row => Object.fromEntries(requested.map((field: string) => [field, row[field]])))
    }),
    queryConfig: {},
    fieldAccess: () => ({read: 'visible'}),
    getPkKey: (row: Record<string, unknown>) => row['rowid'] as string,
    resetState: vi.fn(),
    refresh: vi.fn().mockResolvedValue(undefined),
    setTreeConfig: vi.fn(),
  }
}

describe('NavHost project picker hierarchy rendering', () => {
  it('does not issue the legacy navigation-host relation query for the repository-owned builtin app', async () => {
    runtimeState.runtimes.length = 0
    runtimeState.provided.length = 0
    runtimeState.hostView = dataView([{
      rowid: 'legacy-host-relation', prowid: 'host-a', dataSetId: 'projects', DataName: 'Project',
      ValParamName: 'projectId', TextParamName: 'projectName', selectValParam: 'code', selectTextParam: 'name', selectPid: 'parent',
    }], {scenarioId: 'application-catalog-form', modelName: 'Base_Navigation_DataRelation'})
    runtimeState.projectView = dataView([{rowid: 'candidate', code: 'PROJECT-X', name: 'Candidate', parent: ''}])
    const hostView = runtimeState.hostView
    const state = {projectId: getBuiltinApplicationDescriptor().id, openEditingProject: vi.fn()}
    const wrapper = mount(NavHostProjectPicker, {props: {state: state as never}})
    try {
      await flushPromises()
      expect(hostView.refresh).not.toHaveBeenCalled()
      expect(runtimeState.runtimes).toHaveLength(0)
      expect(runtimeState.provided).toHaveLength(0)
      expect(wrapper.text()).toContain('仓内蓝图尚未接入该资源')
      expect(wrapper.find('[data-stub="RendererTree"]').exists()).toBe(false)
    } finally {wrapper.unmount()}
  })

  it('renders relation read errors through the standard alert with alert semantics', async () => {
    runtimeState.runtimes.length = 0
    runtimeState.provided.length = 0
    runtimeState.hostView = dataView([{rowid: 'rel-1', prowid: 'host-a', dataSetId: 'projects', DataName: 'Project', ValParamName: 'projectId', TextParamName: 'projectName', selectValParam: 'code', selectTextParam: 'name', selectPid: ''}], {scenarioId: 'application-catalog-form', modelName: 'Base_Navigation_DataRelation'})
    runtimeState.hostView.refresh.mockRejectedValue(new Error('relation query failed'))
    runtimeState.projectView = dataView([{rowid: 'row-p', code: 'P', name: 'Parent'}])
    const state = {projectId: 'project-current', openEditingProject: vi.fn()}
    const wrapper = mount(NavHostProjectPicker, {props: {state: state as never}})
    try {
      await flushPromises()
      const alert = wrapper.findComponent({name: 'DisplayAlert'})
      expect(alert.props()).toMatchObject({description: 'relation query failed', alertType: 'error', closable: false})
      expect(wrapper.get('[role="alert"]').text()).toBe('relation query failed')
      expect(wrapper.findAllComponents({name: 'RendererButton'})).toHaveLength(0)
    } finally {wrapper.unmount()}
  })

  it('keeps tree candidates complete and validates selected identity through the same view', async () => {
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
    const state = {projectId: 'project-current', openEditingProject: vi.fn().mockResolvedValue(true)}
    const wrapper = mount(NavHostProjectPicker, {props: {state: state as never}})
    await flushPromises()
    const entry = wrapper.findAllComponents({name: 'RendererButton'}).find(button => button.props('label') === '切换项目')
    expect(entry).toBeTruthy()
    await entry!.trigger('click')
    await flushPromises()
    const dialog = wrapper.findComponent({name: 'RendererDialog'})
    expect(dialog.props()).toMatchObject({modelValue: true, title: '切换开发项目', width: '620px', destroyOnClose: true})
    const tree = wrapper.find('[data-stub="RendererTree"]')
    expect(tree.exists(), wrapper.html()).toBe(true)
    expect(tree.attributes('data-view-key')).toBe('projects@Project@default')
    expect(tree.attributes('data-node-key')).toBe('rowid')
    const treeFields = wrapper.findComponent({name: 'RendererTree'}).props('children') as Array<{props?: Record<string, unknown>}>
    expect(treeFields).toEqual([
      {type: 'r-text', props: {dataMember: 'currentRow', dataField: 'name', label: '项目名称'}},
      {type: 'r-text', props: {dataMember: 'currentRow', dataField: 'code', label: '项目 ID'}},
    ])
    expect(runtimeState.projectView.setTreeConfig).toHaveBeenCalledWith({idField: 'code', parentIdField: 'parent', textField: 'name', treeMode: 'flat'})
    expect(runtimeState.projectView.queryConfig.allPages).toBe(true)
    const candidateRuntime = runtimeState.runtimes.find(item => item.scenarioIds[0] === 'projects')
    expect(runtimeState.provided).toContainEqual({key: runtimeState.token, value: candidateRuntime})
    expect(tree.attributes('data-candidates')).toBeUndefined()
    runtimeState.projectView.currentRow = runtimeState.projectView.rows[1]
    await tree.trigger('click')
    const openButton = wrapper.findAllComponents({name: 'RendererButton'}).find(button => button.props('label') === '打开所选项目')
    expect(openButton, wrapper.html()).toBeTruthy()
    await openButton!.trigger('click')
    await flushPromises()
    expect(state.openEditingProject).toHaveBeenCalledWith({projectId: 'C'})
    const cancel = wrapper.findAllComponents({name: 'RendererButton'}).find(button => button.props('label') === '取消')
    expect(cancel).toBeTruthy()
    await cancel!.trigger('click')
    await flushPromises()
    expect(wrapper.findComponent({name: 'RendererDialog'}).props('modelValue')).toBe(false)
    await entry!.trigger('click')
    await flushPromises()
    ;(dialog.vm as unknown as {requestClose(): void}).requestClose()
    await flushPromises()
    expect(dialog.props('modelValue')).toBe(false)
    wrapper.unmount()
    expect(candidateRuntime?.disposed).toBe(true)
  })

  it.each([
    ['zero matches', async (view: any) => {view.queryOptionRows.mockResolvedValue([])}],
    ['duplicate matches', async (view: any) => {view.queryOptionRows.mockResolvedValue([{rowid: 'row-p', code: 'P', name: 'Parent'}, {rowid: 'row-p', code: 'P', name: 'Parent'}])}],
    ['query rejected', async (view: any) => {view.queryOptionRows.mockRejectedValue(new Error('query denied'))}],
    ['selection changed during query', async (view: any) => {view.queryOptionRows.mockImplementationOnce(async () => {view.currentRow = {rowid: 'row-other', code: 'Q', name: 'Other'}; return [{rowid: 'row-p', code: 'P', name: 'Parent'}]})}],
    ['old page row expired', async (view: any) => {view.rows = [{rowid: 'row-other', code: 'Q', name: 'Other'}]}],
  ])('fails closed when exact selection verification has %s', async (_case, arrange) => {
    runtimeState.runtimes.length = 0
    runtimeState.provided.length = 0
    runtimeState.hostView = dataView([{rowid: 'rel-1', prowid: 'host-a', dataSetId: 'projects', DataName: 'Project', ValParamName: 'projectId', TextParamName: 'projectName', selectValParam: 'code', selectTextParam: 'name', selectPid: ''}], {scenarioId: 'application-catalog-form', modelName: 'Base_Navigation_DataRelation'})
    runtimeState.projectView = dataView([{rowid: 'row-p', code: 'P', name: 'Parent'}])
    runtimeState.projectView.queryConfig = {pageSize: 20}
    const state = {projectId: 'project-current', openEditingProject: vi.fn().mockResolvedValue(true)}
    const wrapper = mount(NavHostProjectPicker, {props: {state: state as never}})
    await flushPromises()
    await wrapper.findAllComponents({name: 'RendererButton'}).find(button => button.props('label') === '切换项目')!.trigger('click')
    await flushPromises()
    const view = runtimeState.projectView
    view.currentRow = view.rows[0]
    await wrapper.find('[data-stub="RendererTable"]').trigger('click')
    await arrange(view)
    const button = wrapper.findAllComponents({name: 'RendererButton'}).find(item => item.props('label') === '打开所选项目')!
    await button.trigger('click')
    await flushPromises()
    expect(state.openEditingProject).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('allows native paging for flat candidates and verifies exact selection before opening', async () => {
    runtimeState.runtimes.length = 0
    runtimeState.provided.length = 0
    runtimeState.hostView = dataView([{rowid: 'rel-1', prowid: 'host-a', dataSetId: 'projects', DataName: 'Project', ValParamName: 'projectId', TextParamName: 'projectName', selectValParam: 'code', selectTextParam: 'name', selectPid: ''}], {scenarioId: 'application-catalog-form', modelName: 'Base_Navigation_DataRelation'})
    runtimeState.projectView = dataView([{rowid: 'row-p', code: 'P', name: 'Parent'}])
    runtimeState.projectView.total = 1335
    runtimeState.projectView.queryConfig = {pageSize: 20}
    const state = {projectId: 'project-current', openEditingProject: vi.fn().mockResolvedValue(true)}
    const wrapper = mount(NavHostProjectPicker, {props: {state: state as never}})
    await flushPromises()
    await wrapper.findAllComponents({name: 'RendererButton'}).find(button => button.props('label') === '切换项目')!.trigger('click')
    await flushPromises()
    expect(runtimeState.projectView.queryConfig).toEqual({pageSize: 20})
    runtimeState.projectView.currentRow = runtimeState.projectView.rows[0]
    await wrapper.find('[data-stub="RendererTable"]').trigger('click')
    const button = wrapper.findAllComponents({name: 'RendererButton'}).find(item => item.props('label') === '打开所选项目')!
    await button.trigger('click')
    await flushPromises()
    expect(runtimeState.projectView.queryOptionRows).toHaveBeenCalledWith(expect.objectContaining({fields: ['rowid', 'code', 'name']}))
    expect(state.openEditingProject).toHaveBeenCalledWith({projectId: 'P'})
    wrapper.unmount()
  })

  it('locks the whole command while exact selection verification is pending', async () => {
    runtimeState.runtimes.length = 0
    runtimeState.provided.length = 0
    runtimeState.hostView = dataView([{rowid: 'rel-1', prowid: 'host-a', dataSetId: 'projects', DataName: 'Project', ValParamName: 'projectId', TextParamName: 'projectName', selectValParam: 'code', selectTextParam: 'name', selectPid: ''}], {scenarioId: 'application-catalog-form', modelName: 'Base_Navigation_DataRelation'})
    runtimeState.projectView = dataView([{rowid: 'row-p', code: 'P', name: 'Parent'}])
    const view = runtimeState.projectView
    let finish!: (rows: any[]) => void
    view.queryOptionRows.mockImplementationOnce(() => new Promise(resolve => {finish = resolve}))
    const state = {projectId: 'project-current', openEditingProject: vi.fn().mockResolvedValue(true)}
    const wrapper = mount(NavHostProjectPicker, {props: {state: state as never}})
    await flushPromises()
    await wrapper.findAllComponents({name: 'RendererButton'}).find(button => button.props('label') === '切换项目')!.trigger('click')
    await flushPromises()
    view.currentRow = view.rows[0]
    await wrapper.find('[data-stub="RendererTable"]').trigger('click')
    const button = wrapper.findAllComponents({name: 'RendererButton'}).find(item => item.props('label') === '打开所选项目')!
    const first = button.trigger('click')
    await flushPromises()
    expect(button.props('disabled')).toBe(true)
    await button.trigger('click')
    expect(view.queryOptionRows).toHaveBeenCalledTimes(1)
    finish([{rowid: 'row-p', code: 'P', name: 'Parent'}])
    await first
    await flushPromises()
    expect(state.openEditingProject).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
})
