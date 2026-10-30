import {afterEach, describe, expect, it, vi} from 'vitest'
import {flushPromises, mount} from '@vue/test-utils'
import {ref, shallowRef} from 'vue'
import ElementPlus from 'element-plus'
import {SparkData, buildDataViewKey, type DataView} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
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
  const scenarioId = 'DEV_FILE_RUNTIME'
  const viewId = 'page-page-A-script.js'
  const dataSet = SparkData.createDataSet({dataSetName: 'Dev files', scenarioId, tables: {
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
  return {runtime, dataSet, view: dataSet.getView('ProjectToolFile', viewId)!, key: buildDataViewKey('ProjectToolFile', viewId, scenarioId)}
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {resolve = done})
  return {promise, resolve}
}

describe('DevFileEditor runtime DataView binding', () => {
  it('binds real standard controls after runtime readiness and rebinds the same full key to a new runtime', async () => {
    const firstLoad = deferred<DataView>()
    let currentFileView = firstLoad.promise
    const page = {pageId: 'page-A'}
    const state = {
      activePageId: ref('page-A'), projectId: 'app-A', pageIoBusy: ref(false),
      selectedNode: ref({nodeId: 'node-A', navigation: {target: 'page-A'}}),
      pageFileNames: ['rule.json', 'script.js', 'style.css'],
      project: {getActivePage: () => page, setActivePage: vi.fn()},
      blueprintPageRuntime: shallowRef<PageRuntime | null>(null),
      loadBlueprintWorkspaceDataView: vi.fn().mockResolvedValue(undefined),
      loadPageToolFileDataView: vi.fn(async () => currentFileView),
      restorePageToolVersion: vi.fn(), addStatus: vi.fn(),
    } as unknown as DevState
    const wrapper = mount(DevFileEditor, {props: {state, activeFile: 'script.js', showTabs: true}, global: {
      plugins: [ElementPlus], directives: {loading: () => {}},
      stubs: {FieldCodeEditor: true, NavIcon: true},
    }})

    const first = await createRuntime('first runtime text')
    const firstResolve = vi.spyOn(first.runtime, 'resolveView')
    state.blueprintPageRuntime.value = first.runtime
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
    state.blueprintPageRuntime.value = second.runtime
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(state.loadPageToolFileDataView).toHaveBeenCalledWith({pageId: 'page-A', fileName: 'script.js'})
    expect(wrapper.findComponent({name: 'RendererForm'}).props('dataViewKey')).toBe(first.key)
    expect(wrapper.findComponent({name: 'RendererTabs'}).props('dataViewKey')).toBe(first.key)
    expect(secondResolve).toHaveBeenCalledWith(first.key)
    expect(wrapper.text()).not.toContain('PAGE_RUNTIME_MISSING')
    wrapper.unmount()
  })
})
