import { flushPromises, mount } from '@vue/test-utils'
import { computed, defineComponent, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DevFileEditor from '@/views/app/dev-system/DevFileEditor.vue'
import { LOWCODE_FILE_RESOURCE_REGISTRY } from '@/lowcode/resources/shared/agent-workflow-file-resource'

const fixture = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn(), sparkProvide: vi.fn(), sparkRemove: vi.fn(), buttonMountIds: [] as number[], text: 'saved file contents' }))
vi.mock('@/services/project-model-artifacts', () => ({ createRuleJsonSchema: () => ({}), createRuleTreePolicy: () => ({}) }))
vi.mock('@/views/app/dev-system/composables/useDevFileEditor', () => ({
  useDevFileEditor: (state: { dirty: ReturnType<typeof ref<boolean>> }) => ({
    isDirty: state.dirty, isUnconfirmed: ref(false), isReady: ref(true), text: computed(() => (state as typeof state & {restoredText?: ReturnType<typeof ref<string>>}).restoredText?.value ?? fixture.text),
    isFileDirty: () => state.dirty.value, save: fixture.save, refresh: fixture.refresh,
  }),
}))
vi.mock('@spark-appworks/spark-component', async () => {
  const {defineComponent, getCurrentInstance, h} = await import('vue')
  const passive = (name: string) => defineComponent({name, setup(_, {slots}) {return () => h('div', slots['default']?.())}})
  const button = defineComponent({name: 'RendererButton', props: {label: String, disabled: Boolean, dataViewKey: String}, emits: ['click'],
    setup(props, {emit}) { fixture.buttonMountIds.push(getCurrentInstance()?.uid ?? -1); return () => h('button', {disabled: props.disabled, onClick: () => emit('click')}, props.label)}})
  const form = defineComponent({name: 'RendererForm', props: {dataViewKey: String}, setup(_, {slots}) {return () => h('div', slots['default']?.())}})
  const fieldCodeEditor = defineComponent({name: 'FieldCodeEditor', props: {dataViewKey: String, dataMember: String, dataField: String, label: String, language: String}, template: '<textarea />'})
  return {__v_isRef: false, SparkCodeEditor: passive('SparkCodeEditor'), JsonTreeEditor: passive('JsonTreeEditor'), PAGE_RUNTIME: 'PAGE_RUNTIME',
    useSparkComponent: () => ({sparkProvide: fixture.sparkProvide, sparkRemove: fixture.sparkRemove}),
    RendererButton: button, RendererForm: form,
    RendererTabs: defineComponent({name: 'RendererTabs', props: {dataViewKey: String, dataMember: String}, setup(_, {slots}) {return () => h('div', slots['default']?.())}}),
    RendererTabPane: passive('RendererTabPane'),
    FieldCodeEditor: fieldCodeEditor, FieldJson: passive('FieldJson'), FieldTextarea: passive('FieldTextarea'),
    DisplayAlert: defineComponent({name: 'DisplayAlert', props: {description: String}, setup(props) {return () => h('p', props.description)}}),
    DisplayEmpty: defineComponent({name: 'DisplayEmpty', props: {description: String}, setup(props) {return () => h('p', props.description)}}),
    RendererTable: defineComponent({name: 'RendererTable', props: {dataViewKey: String, actions: Object}, setup(props, {slots}) { return () => h('div', {class: 'bound-table'}, [
      h('button', {onClick: () => (props.actions as {children: {props: {onClick: (row: unknown) => void}}[]})['children'][0]?.props.onClick({
        versionKey:'["page-A","script.js",2]',pageId:'page-A',fileName:'script.js',version:2,snapshotFileName:'2__script.js',
      })}, '恢复'), slots['default']?.(),
    ]) }}),
    FieldText: defineComponent({name: 'FieldText', props: {dataMember: String, dataField: String, label: String, displayFormatter: Function}, template: '<span>{{ label }}</span>'}),
  }
})

const Button = defineComponent({
  props: { disabled: Boolean }, emits: ['click'],
  template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
})
const Slot = defineComponent({ template: '<div><slot /></div>' })

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

function setup(hasFormalVersionBinding = true, activeFile: 'script.js' | 'style.css' = 'script.js', showTabs = false) {
  const rows = [{versionKey: '["page-A","script.js",2]', pageId: 'page-A', fileName: 'script.js', version: 2, snapshotFileName: '2__script.js', lastModified: null}]
  const view = {queryContext: {}, rows, loadingError: null, refresh: vi.fn().mockResolvedValue(undefined), deleteActionState: () => 'disabled'}
  const versionResource = LOWCODE_FILE_RESOURCE_REGISTRY.find(item => item.tableName === 'ProjectToolVersion')
  const dataSet = {scenarioId: '7AB874097A1E8711A42FD845939A6E05', getView: vi.fn((tableName: string) =>
    hasFormalVersionBinding && versionResource?.tableName === tableName ? view : undefined)}
  const fileDataSet = dataSet
  const fileView={tableName:'ProjectToolFile',viewId:`page-page-A-${activeFile}`,dataSet:fileDataSet,rows:[],hasUnconfirmedSave:false,dirtyTracking:{hasPendingChanges:()=>false},getPkKey:()=>undefined,createSourceVersion:vi.fn().mockResolvedValue({state:'confirmed',version:1,fileName:'1__script.js',message:null}),acknowledgeSourceHistoryAttempt:vi.fn()}
  let currentFileView = fileView
  const runtime = {instanceId: 'runtime-A', isLoaded: true, getDataSet: vi.fn((_scenarioId: string) => fileDataSet),
    resolveView: vi.fn((key: string) => key === `${fileDataSet.scenarioId}@ProjectToolFile@${currentFileView.viewId}` ? currentFileView : undefined)}
  const state = {
    activePageId: ref('page-A'), projectId: 'project-A', dirty: ref(false), pageDataError: ref(null), pageIoBusy: ref(false),
    restoredText: ref(fixture.text),
    selectedNode: ref({nodeId: 'node-A', projectId: 'project-A', navigation: {target: 'cfg:legacy/route'}}),
    pageFileNames: ['rule.json', 'script.js', 'style.css'], addStatus: vi.fn(),
    project: { getActivePage: () => ({ pageId: state.activePageId.value }), setActivePage: vi.fn() },
    blueprintPageRuntime: ref(runtime), loadBlueprintWorkspaceDataView: vi.fn().mockResolvedValue(undefined),
    loadPageToolFileDataView: vi.fn(async ({pageId, fileName}: {pageId: string; fileName: string}) => {
      currentFileView = pageId === 'page-A' ? fileView : {...fileView, viewId: `page-${pageId}-${fileName}`}
      return currentFileView
    }),
    restorePageToolVersion: vi.fn().mockResolvedValue('restored text'),
    editor: {},
  }
  state.restorePageToolVersion.mockImplementation(async()=>{state.restoredText.value='restored text';return 'restored text'})
  const wrapper = mount({ ...DevFileEditor, props: ['state', 'activeFile', 'showTabs'] }, {
    props: { state, activeFile, showTabs },
    global: { directives: { loading: () => {} }, stubs: {
      ElButton: Button, ElTooltip: Slot, ElButtonGroup: Slot, ElInput: true, ElEmpty: true,
      ElTag: true, NavIcon: true, SparkCodeEditor: true, JsonTreeEditor: true, DevDataSetDesigner: true,
    } },
  })
  const click = async (label: string) => {
    const button = wrapper.findAll('button').find(item => item.text().includes(label))
    if (!button) throw new Error(`按钮缺失：${label}`)
    await button.trigger('click')
  }
  return { state, wrapper, click, view, fileView }
}

describe('DevFileEditor snapshot identity', () => {
  beforeEach(() => { fixture.save.mockReset().mockResolvedValue(undefined); fixture.refresh.mockReset().mockResolvedValue(undefined); fixture.sparkProvide.mockReset(); fixture.sparkRemove.mockReset(); fixture.buttonMountIds.length = 0; fixture.text = 'saved file contents' })

  it('loads script.js into a DataView and renders the standard bound code field', async () => {
    const {state, wrapper, fileView} = setup()
    await flushPromises()
    expect(state.loadPageToolFileDataView).toHaveBeenCalledWith({pageId: 'page-A', fileName: 'script.js'})
    expect(wrapper.findComponent({name: 'RendererForm'}).props('dataViewKey')).toBe('7AB874097A1E8711A42FD845939A6E05@ProjectToolFile@page-page-A-script.js')
    expect(wrapper.findComponent({name: 'FieldCodeEditor'}).props()).toMatchObject({
      dataViewKey: '7AB874097A1E8711A42FD845939A6E05@ProjectToolFile@page-page-A-script.js',
      dataMember: 'currentRow', dataField: 'text', label: 'script.js', language: 'javascript',
    })
    wrapper.unmount()
  })

  it('binds header actions and file tabs to the active ProjectToolFile DataView', async () => {
    const { wrapper } = setup(true, 'script.js', true)
    const initialButtonMountCount = fixture.buttonMountIds.length
    await flushPromises()
    const fileKey = '7AB874097A1E8711A42FD845939A6E05@ProjectToolFile@page-page-A-script.js'
    const buttons = wrapper.findAllComponents({name: 'RendererButton'})
    expect(buttons.map(button => button.props('dataViewKey'))).toEqual([
      fileKey, fileKey, fileKey,
    ])
    expect(wrapper.findComponent({name: 'RendererTabs'}).props()).toMatchObject({
      dataViewKey: fileKey, dataMember: 'currentRow',
    })
    expect(fixture.buttonMountIds.length).toBeGreaterThan(initialButtonMountCount)
    wrapper.unmount()
  })

  it('switches the same standard field binding to style.css and its CSS mode', async () => {
    const {state, wrapper} = setup(true, 'style.css')
    await flushPromises()
    expect(state.loadPageToolFileDataView).toHaveBeenCalledWith({pageId: 'page-A', fileName: 'style.css'})
    expect(wrapper.findComponent({name: 'FieldCodeEditor'}).props()).toMatchObject({
      dataViewKey: '7AB874097A1E8711A42FD845939A6E05@ProjectToolFile@page-page-A-style.css',
      dataMember: 'currentRow', dataField: 'text', label: 'style.css', language: 'css',
    })
    wrapper.unmount()
  })

  it('omits the stale file binding when loading a different page DataView fails', async () => {
    const { state, wrapper } = setup(true, 'script.js', true)
    await flushPromises()
    state.loadPageToolFileDataView.mockRejectedValueOnce(new Error('file DataView unavailable'))
    state.activePageId.value = 'page-B'
    await flushPromises()
    expect(state.loadPageToolFileDataView).toHaveBeenLastCalledWith({pageId: 'page-B', fileName: 'script.js'})
    expect(wrapper.findAllComponents({name: 'RendererButton'}).every(button => button.props('dataViewKey') === undefined)).toBe(true)
    expect(wrapper.findComponent({name: 'RendererTabs'}).props('dataViewKey')).toBeUndefined()
    wrapper.unmount()
  })

  it('recreates standard controls when the same file DataView moves to a new runtime identity', async () => {
    const { state, wrapper } = setup(true, 'script.js', true)
    await flushPromises()
    const beforeRuntimeChange = fixture.buttonMountIds.length
    state.blueprintPageRuntime.value = {...state.blueprintPageRuntime.value, instanceId: 'runtime-B'}
    await flushPromises()
    expect(wrapper.findAllComponents({name: 'RendererButton'}).map(button => button.props('dataViewKey')))
      .toEqual(Array(3).fill('7AB874097A1E8711A42FD845939A6E05@ProjectToolFile@page-page-A-script.js'))
    expect(fixture.buttonMountIds.length).toBeGreaterThan(beforeRuntimeChange)
    wrapper.unmount()
  })

  it('blocks a retained file DataView when its DataSet is not owned by the current PAGE_RUNTIME', async () => {
    const { state, wrapper } = setup(true, 'script.js')
    await flushPromises()
    const otherDataSet = {...state.blueprintPageRuntime.value.getDataSet('7AB874097A1E8711A42FD845939A6E05')!}
    state.blueprintPageRuntime.value = {...state.blueprintPageRuntime.value, instanceId: 'runtime-C', getDataSet: vi.fn((_scenarioId: string) => otherDataSet)}
    await flushPromises()
    expect(wrapper.findAllComponents({name: 'RendererButton'}).every(button => button.props('dataViewKey') === undefined)).toBe(true)
    expect(wrapper.text()).toContain('文件 DataView 不属于当前 PAGE_RUNTIME')
    wrapper.unmount()
  })

  it('does not let an old file refresh replace the active page DataView after a page switch', async () => {
    const {state, wrapper, click} = setup()
    await flushPromises()
    const refresh = deferred<void>()
    fixture.refresh.mockReturnValueOnce(refresh.promise)

    await click('重新加载')
    state.activePageId.value = 'page-B'
    await flushPromises()
    expect(wrapper.findComponent({name: 'FieldCodeEditor'}).props('dataViewKey'))
      .toBe('7AB874097A1E8711A42FD845939A6E05@ProjectToolFile@page-page-B-script.js')

    refresh.resolve()
    await flushPromises()
    expect(wrapper.findComponent({name: 'FieldCodeEditor'}).props('dataViewKey'))
      .toBe('7AB874097A1E8711A42FD845939A6E05@ProjectToolFile@page-page-B-script.js')
    wrapper.unmount()
  })

  it('ignores a file DataView response that arrives after the active page changes', async () => {
    const {state, wrapper, click, fileView} = setup()
    await flushPromises()
    const staleView = deferred<typeof fileView>()
    state.loadPageToolFileDataView.mockImplementationOnce(async () => staleView.promise)

    await click('重新加载')
    state.activePageId.value = 'page-B'
    await flushPromises()
    expect(wrapper.findComponent({name: 'FieldCodeEditor'}).props('dataViewKey'))
      .toBe('7AB874097A1E8711A42FD845939A6E05@ProjectToolFile@page-page-B-script.js')

    staleView.resolve(fileView)
    await flushPromises()
    expect(wrapper.findComponent({name: 'FieldCodeEditor'}).props('dataViewKey'))
      .toBe('7AB874097A1E8711A42FD845939A6E05@ProjectToolFile@page-page-B-script.js')
    wrapper.unmount()
  })

  it('queries the formal ProjectToolVersion DataView and binds the standard table to it', async () => {
    const { state, wrapper, click, view } = setup()
    await click('版本'); await flushPromises()
    expect(state.loadBlueprintWorkspaceDataView).toHaveBeenCalledOnce()
    expect(view.queryContext).toEqual({pageId: 'page-A', fileName: 'script.js'})
    expect(view.refresh).toHaveBeenCalledOnce()
    expect(wrapper.findComponent({name: 'RendererTable'}).props('dataViewKey')).toBe('7AB874097A1E8711A42FD845939A6E05@ProjectToolVersion@default')
    expect(wrapper.findAllComponents({name: 'RendererButton'}).find(button => button.props('label') === '存档')?.props('dataViewKey'))
      .toBe('7AB874097A1E8711A42FD845939A6E05@ProjectToolFile@page-page-A-script.js')
    const timeField = wrapper.findAllComponents({name: 'FieldText'}).find(field => field.props('dataField') === 'lastModified')!
    expect(timeField.props('displayFormatter')(null)).toBe('-')
    expect(timeField.props('displayFormatter')(0)).toMatch(/^\d{4}-\d{2}-\d{2} /)
    wrapper.unmount()
  })

  it('fails closed when the 7AB PageRuntime lacks the registered version binding', async () => {
    const { wrapper, click, view } = setup(false)
    await click('版本'); await flushPromises()
    expect(view.refresh).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('正式工具版本 DataView 未装载')
    wrapper.unmount()
  })

  it('shows the empty state only after a successful empty DataView query', async () => {
    const { wrapper, click, view } = setup()
    view.rows.splice(0)
    await click('版本'); await flushPromises()
    expect(wrapper.text()).toContain('暂无版本')
    expect(wrapper.text()).not.toContain('读取版本失败')
    wrapper.unmount()
  })

  it('keeps loading and query-error states distinct from an empty version list', async () => {
    const { wrapper, click, view } = setup()
    let finish!: () => void
    view.refresh.mockReturnValueOnce(new Promise<void>(resolve => {finish = resolve}))
    await click('版本')
    expect(wrapper.text()).toContain('正在读取版本')
    expect(wrapper.text()).not.toContain('暂无版本')
    finish(); await flushPromises()
    view.refresh.mockRejectedValueOnce(new Error('version query failed'))
    const versionButton = wrapper.findAll('button').find(button => button.text().includes('版本'))!
    await versionButton.trigger('click'); await versionButton.trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('读取版本失败：version query failed')
    expect(wrapper.text()).not.toContain('暂无版本')
    wrapper.unmount()
  })

  it('does not create a snapshot for a different file after working save', async () => {
    const { wrapper, click, fileView } = setup()
    const saved = deferred<void>(); fixture.save.mockReturnValueOnce(saved.promise)
    await click('版本'); await flushPromises(); await click('存档')
    await wrapper.setProps({ activeFile: 'style.css' })
    saved.resolve(); await flushPromises()
    expect(fileView.createSourceVersion).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('does not create a snapshot when edits occur during working save', async () => {
    const { state, wrapper, click, fileView } = setup()
    const saved = deferred<void>(); fixture.save.mockReturnValueOnce(saved.promise)
    await click('版本'); await flushPromises(); await click('存档')
    state.dirty.value = true; saved.resolve(); await flushPromises()
    expect(fileView.createSourceVersion).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('creates the saved file snapshot through the file DataView source history API', async () => {
    const { state, wrapper, click, fileView } = setup()
    await click('版本'); await flushPromises(); await click('存档'); await flushPromises()
    expect(fixture.save).toHaveBeenCalledOnce()
    expect(state.loadPageToolFileDataView).toHaveBeenCalledWith({pageId:'page-A',fileName:'script.js'})
    expect(fileView.createSourceVersion).toHaveBeenCalledOnce()
    expect(state.addStatus).toHaveBeenCalledWith('script.js 已创建新版本快照', 'success')
    wrapper.unmount()
  })

  it('restores the selected version through the SPARK data command owner', async () => {
    const {state, wrapper, click}=setup()
    await click('版本');await flushPromises();await click('恢复');await flushPromises()
    expect(state.restorePageToolVersion).toHaveBeenCalledOnce()
    const input=state.restorePageToolVersion.mock.calls[0]![0] as {projectId:string;pageId:string;customPath:string;fileName:string;version:number;assertCurrent:()=>void}
    expect(input).toMatchObject({projectId:'project-A',pageId:'page-A',customPath:'project-A/page-A',fileName:'script.js',version:2})
    expect(input.assertCurrent).toBeTypeOf('function');input.assertCurrent()
    expect('restoreRemotePageVersion' in state.editor).toBe(false)
    expect(state.addStatus).toHaveBeenCalledWith('页面 page-A 已将 script.js 快照 v2 恢复为工作文件','success')
    wrapper.unmount()
  })

  it('rejects a stale version row whose page or file does not match the active query', async () => {
    const {state,wrapper,click}=setup()
    await click('版本');await flushPromises()
    const actions=wrapper.findComponent({name:'RendererTable'}).props('actions') as {children:{props:{onClick:(row:Record<string,unknown>)=>void}}[]}
    actions.children[0]!.props.onClick({versionKey:'["page-A","style.css",2]',pageId:'page-A',fileName:'style.css',version:2,snapshotFileName:'2__style.css'})
    await flushPromises()
    expect(state.restorePageToolVersion).not.toHaveBeenCalled()
    expect(state.addStatus).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('does not accept a late restore result after switching tools', async () => {
    const {state, wrapper, click}=setup(), restored=deferred<string>()
    state.restorePageToolVersion.mockReturnValueOnce(restored.promise)
    await click('版本');await flushPromises();await click('恢复')
    const input=state.restorePageToolVersion.mock.calls[0]![0] as {assertCurrent:()=>void}
    state.activePageId.value='page-B';restored.resolve('restored text');await flushPromises()
    expect(() => input.assertCurrent()).toThrow('恢复期间编辑目标已切换')
    expect('restoreRemotePageVersion' in state.editor).toBe(false)
    expect(state.addStatus).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('keeps the version view read-only and exposes no delete action', async () => {
    const { wrapper, click, view } = setup()
    await click('版本'); await flushPromises()
    expect(view.deleteActionState()).toBe('disabled')
    expect(wrapper.findAll('button').some(button => button.attributes('aria-label') === '删除')).toBe(false)
    wrapper.unmount()
  })
})
