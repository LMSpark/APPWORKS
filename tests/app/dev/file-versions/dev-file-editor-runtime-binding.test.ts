import {afterEach, describe, expect, it, vi} from 'vitest'
import {flushPromises, mount} from '@vue/test-utils'
import {defineComponent, h, ref, shallowRef} from 'vue'
import ElementPlus from 'element-plus'
import {SparkData, buildDataViewKey, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {DATA_ROW, DATA_SOURCE, useSparkComponent, useSparkConsume} from '@spark-appworks/spark-component'
import type {DevState} from '@/views/app/dev-system/useDevState'
import DevFileEditor from '@/views/app/dev-system/DevFileEditor.vue'

vi.mock('@/services/project-model-artifacts', () => ({createRuleJsonSchema: () => ({}), createRuleTreePolicy: () => ({})}))
vi.mock('@/views/app/dev-system/composables/useDevFileEditor', async () => {
  const {computed, ref} = await import('vue')
  return {useDevFileEditor: () => ({
    isDirty: ref(false), isUnconfirmed: ref(false), isReady: ref(true),
    text: computed(() => 'file text'), isFileDirty: () => false,
    save: vi.fn().mockResolvedValue(undefined), refresh: vi.fn().mockResolvedValue(undefined),
  })}
})

const runtimes: PageRuntime[] = []
afterEach(() => {runtimes.splice(0).forEach(runtime => runtime.dispose())})

async function createRuntime(text: string) {
  const scenarioId = '7AB874097A1E8711A42FD845939A6E05'
  const viewId = 'page-page-A-script.js'
  const dataSet = SparkData.createDataSet({dataSetName: 'Dev files', scenarioId, tables: {
    Base_NavigationInfo: {tableName: 'Base_NavigationInfo', resourceType: 'static-data', columns: [
      {name: 'rowid', type: 'string', isPrimaryKey: true}, {name: 'SysId', type: 'string'}, {name: 'memo', type: 'string'},
    ], views: {default: {rows: [{rowid: 'node-A', SysId: 'app-A', memo: 'node memo'}]}}},
    ProjectToolFile: {tableName: 'ProjectToolFile', resourceType: 'static-data', columns: [
      {name: 'id', type: 'string', isPrimaryKey: true},
      {name: 'pageId', type: 'string'},
      {name: 'fileName', type: 'string'},
      {name: 'text', type: 'string'},
    ], views: {
      default: {rows: []},
      [viewId]: {rows: [{id: 'file-A', pageId: 'page-A', fileName: 'script.js', text}]},
    }},
  }})
  const runtime = new PageRuntime({pageId: 'page-A', scenarioIds: [scenarioId], loadScenario: async () => dataSet})
  await runtime.load()
  runtimes.push(runtime)
  const view=dataSet.getView('ProjectToolFile', viewId)!
  view.setCurrentRow(view.rows[0]!)
  return {runtime, dataSet, nodeView: dataSet.getView('Base_NavigationInfo', 'default')!, view, key: buildDataViewKey('ProjectToolFile', viewId, scenarioId)}
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((done, fail) => {resolve = done; reject = fail})
  return {promise, resolve, reject}
}

describe('DevFileEditor runtime DataView binding', () => {
  it('binds real standard controls after runtime readiness and rebinds the same full key to a new runtime', async () => {
    const firstLoad = deferred<DataView>()
    let currentFileView = firstLoad.promise
    let currentFileViewData:DataView|undefined
    const page = {pageId: 'page-A'}
    const state = {
      activePageId: ref('page-A'), projectId: 'app-A', pageIoBusy: ref(false),
      selectedNode: ref({nodeId: 'node-A', navigation: {target: 'page-A'}}),
      pageFileNames: ['rule.json', 'script.js', 'style.css'],
      project: {getActivePage: () => page, setActivePage: vi.fn()},
      blueprintPageRuntime: shallowRef<PageRuntime | null>(null),
      blueprintWorkspaceDataView: shallowRef<{dataSet:DataSet}|undefined>(undefined),
      loadBlueprintWorkspaceDataView: vi.fn().mockResolvedValue(undefined),
      getPageToolFileDataView: vi.fn(() => {if(!currentFileViewData)throw new Error('file view not ready');return currentFileViewData}),
      loadPageToolFileDataView: vi.fn(async () => currentFileView),
      restorePageToolVersion: vi.fn(), addStatus: vi.fn(),
    } as unknown as DevState
    const wrapper = mount(DevFileEditor, {props: {state, activeFile: 'script.js', showTabs: true}, global: {
      plugins: [ElementPlus], directives: {loading: () => {}},
      stubs: {FieldCodeEditor: true, NavIcon: true},
    }})

    const first = await createRuntime('first runtime text')
    const firstResolve = vi.spyOn(first.runtime, 'resolveView')
    currentFileViewData=first.view
    state.blueprintPageRuntime.value = first.runtime
    state.blueprintWorkspaceDataView.value={dataSet:first.dataSet} as never
    firstLoad.resolve(first.view)
    await flushPromises()
    // A post-bind render must resolve the exact formal key without a missing-runtime error.
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent({name: 'RendererForm'}).props('dataViewKey')).toBe(first.key)
    expect(wrapper.findComponent({name: 'RendererTabs'}).props('dataViewKey')).toBe(first.key)
    expect(wrapper.findAllComponents({name: 'RendererButton'}).slice(0, 3).every(button => button.props('dataViewKey') === first.key)).toBe(true)
    expect(firstResolve).toHaveBeenCalledWith(first.key)

    const second = await createRuntime('second runtime text')
    const secondResolve = vi.spyOn(second.runtime, 'resolveView')
    currentFileView = Promise.resolve(second.view)
    currentFileViewData=second.view
    state.blueprintPageRuntime.value = second.runtime
    state.blueprintWorkspaceDataView.value={dataSet:second.dataSet} as never
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(state.loadPageToolFileDataView).toHaveBeenCalledWith({pageId: 'page-A', fileName: 'script.js'})
    expect(wrapper.findComponent({name: 'RendererForm'}).props('dataViewKey')).toBe(first.key)
    expect(wrapper.findComponent({name: 'RendererTabs'}).props('dataViewKey')).toBe(first.key)
    expect(secondResolve).toHaveBeenCalledWith(first.key)
    expect(wrapper.text()).not.toContain('PAGE_RUNTIME_MISSING')
    wrapper.unmount()
  })

  it.each(['pending', 'failed'] as const)('does not let file controls consume the node DataView while the file view is %s', async stateName => {
    const fileLoad = deferred<DataView>()
    const page = {pageId: 'page-A'}
    const state = {
      activePageId: ref('page-A'), projectId: 'app-A', pageIoBusy: ref(false),
      selectedNode: ref({nodeId: 'node-A', navigation: {target: 'page-A'}}),
      pageFileNames: ['rule.json', 'script.js', 'style.css'],
      project: {getActivePage: () => page, setActivePage: vi.fn()},
      blueprintPageRuntime: shallowRef<PageRuntime | null>(null),
      blueprintWorkspaceDataView: shallowRef<{dataSet:DataSet}|undefined>(undefined),
      loadBlueprintWorkspaceDataView: vi.fn().mockResolvedValue(undefined),
      getPageToolFileDataView: vi.fn(() => first.view),
      loadPageToolFileDataView: vi.fn(() => fileLoad.promise),
      restorePageToolVersion: vi.fn(), addStatus: vi.fn(),
    } as unknown as DevState
    const first = await createRuntime('first runtime text')
    const nodeCurrentRow = vi.spyOn(first.nodeView, 'currentRow', 'get')
    nodeCurrentRow.mockClear()
    const Host = defineComponent({setup() {
      const {sparkProvide} = useSparkComponent({type: 'file-editor-inherited-node-context-test'})
      sparkProvide(DATA_SOURCE, first.nodeView)
      sparkProvide(DATA_ROW, first.nodeView.rows[0]!)
      return () => h(DevFileEditor, {state, activeFile: 'script.js', showTabs: true})
    }})
    const wrapper = mount(Host, {global: {plugins: [ElementPlus], stubs: {FieldCodeEditor: true, NavIcon: true}}})
    try {
      state.blueprintPageRuntime.value = first.runtime
      state.blueprintWorkspaceDataView.value={dataSet:first.dataSet} as never
      await flushPromises()
      if (stateName === 'failed') {
        fileLoad.reject(new Error('file DataView unavailable'))
        await flushPromises()
        expect(wrapper.text()).toContain('文件 DataView 加载失败')
      }
      // Observe real RendererButton's resolved row consumption, not just its props.
      expect(nodeCurrentRow).not.toHaveBeenCalled()
    } finally {wrapper.unmount()}
  })

  it('keeps the exact file-view retry available after failure and exposes fields only after that view loads', async () => {
    const first = await createRuntime('retry target text')
    const page = {pageId: 'page-A'}
    const fieldContexts:Array<{source:unknown;row:unknown}> = []
    const state = {
      activePageId: ref('page-A'), projectId: 'app-A', pageIoBusy: ref(false),
      selectedNode: ref({nodeId: 'node-A', navigation: {target: 'page-A'}}),
      pageFileNames: ['rule.json', 'script.js', 'style.css'],
      project: {getActivePage: () => page, setActivePage: vi.fn()},
      blueprintPageRuntime: shallowRef<PageRuntime | null>(null),
      blueprintWorkspaceDataView: shallowRef<{dataSet:DataSet}|undefined>(undefined),
      loadBlueprintWorkspaceDataView: vi.fn().mockResolvedValue(undefined),
      getPageToolFileDataView: vi.fn(() => first.view),
      loadPageToolFileDataView: vi.fn()
        .mockRejectedValueOnce(new Error('temporary file query failure'))
        .mockResolvedValue(first.view),
      restorePageToolVersion: vi.fn(), addStatus: vi.fn(),
    } as unknown as DevState
    const FieldProbe = defineComponent({name: 'FieldCodeEditor', props: {dataViewKey: String}, setup() {
      const {sparkConsume} = useSparkConsume()
      fieldContexts.push({source: sparkConsume(DATA_SOURCE), row: sparkConsume(DATA_ROW)})
      return () => h('textarea', {class: 'file-field-probe'})
    }})
    const wrapper = mount(DevFileEditor, {props: {state, activeFile: 'script.js', showTabs: true}, global: {
      plugins: [ElementPlus], directives: {loading: () => {}},
      stubs: {FieldCodeEditor: FieldProbe, NavIcon: true},
    }})
    try {
      state.blueprintPageRuntime.value = first.runtime
      state.blueprintWorkspaceDataView.value={dataSet:first.dataSet} as never
      await flushPromises()
      expect(wrapper.text()).toContain('文件 DataView 加载失败')
      const retry = wrapper.findAllComponents({name: 'RendererButton'}).find(button => button.props('label') === '重新加载')
      expect(retry).toBeDefined()
      expect(retry!.props('dataViewKey')).toBe(first.key)
      expect(wrapper.findComponent({name: 'FieldCodeEditor'}).exists()).toBe(false)

      await retry!.trigger('click')
      await flushPromises()
      expect(state.loadPageToolFileDataView).toHaveBeenNthCalledWith(2, {pageId: 'page-A', fileName: 'script.js', discardPending: true})
      expect(wrapper.findComponent({name: 'FieldCodeEditor'}).props('dataViewKey')).toBe(first.key)
      expect(fieldContexts.some(({source,row}) => source === first.view && (row as DataRow | null)?.['id'] === 'file-A')).toBe(true)
    } finally {wrapper.unmount()}
  })

  it('loads a replacement runtime while the first same-key file query is pending and ignores its late row', async () => {
    const first = await createRuntime('runtime A text')
    const second = await createRuntime('runtime B text')
    const oldQuery = deferred<DataView>()
    let currentFileView=first.view
    let queryCount=0
    const page = {pageId: 'page-A'}
    const fieldContexts:Array<{source:unknown;row:unknown}> = []
    const state = {
      activePageId: ref('page-A'), projectId: 'app-A', pageIoBusy: ref(false),
      selectedNode: ref({nodeId: 'node-A', navigation: {target: 'page-A'}}),
      pageFileNames: ['rule.json', 'script.js', 'style.css'],
      project: {getActivePage: () => page, setActivePage: vi.fn()},
      blueprintPageRuntime: shallowRef<PageRuntime | null>(null),
      blueprintWorkspaceDataView: shallowRef<{dataSet:DataSet}|undefined>(undefined),
      loadBlueprintWorkspaceDataView: vi.fn(async () => {
        state.blueprintPageRuntime.value=first.runtime
        state.blueprintWorkspaceDataView.value={dataSet:first.dataSet} as never
        return {dataSet:first.dataSet} as never
      }),
      getPageToolFileDataView: vi.fn(() => currentFileView),
      loadPageToolFileDataView: vi.fn(async () => ++queryCount===1 ? oldQuery.promise : currentFileView),
      restorePageToolVersion: vi.fn(), addStatus: vi.fn(),
    } as unknown as DevState
    const FieldProbe = defineComponent({name: 'FieldCodeEditor', props: {dataViewKey: String}, setup() {
      const {sparkConsume} = useSparkConsume()
      fieldContexts.push({source: sparkConsume(DATA_SOURCE), row: sparkConsume(DATA_ROW)})
      return () => h('textarea', {class: 'file-field-probe'})
    }})
    const wrapper = mount(DevFileEditor, {props: {state, activeFile: 'script.js', showTabs: true}, global: {
      plugins: [ElementPlus], directives: {loading: () => {}},
      stubs: {FieldCodeEditor: FieldProbe, NavIcon: true},
    }})
    try {
      await flushPromises()
      expect(state.loadPageToolFileDataView).toHaveBeenCalledTimes(1)
      currentFileView=second.view
      state.blueprintPageRuntime.value=second.runtime
      state.blueprintWorkspaceDataView.value={dataSet:second.dataSet} as never
      await flushPromises()
      expect(state.loadPageToolFileDataView).toHaveBeenCalledTimes(2)
      expect(fieldContexts.some(({source,row}) => source===second.view&&(row as DataRow|null)?.['id']==='file-A')).toBe(true)
      oldQuery.resolve(first.view)
      await flushPromises()
      expect(fieldContexts.every(({source})=>source!==first.view)).toBe(true)
      expect(wrapper.findComponent({name:'RendererTabs'}).props('dataViewKey')).toBe(first.key)
    } finally {wrapper.unmount()}
  })
})
