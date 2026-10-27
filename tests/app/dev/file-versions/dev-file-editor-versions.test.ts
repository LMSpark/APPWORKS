import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DevFileEditor from '@/views/app/dev-system/DevFileEditor.vue'
import { LOWCODE_FILE_RESOURCE_REGISTRY } from '@/lowcode/resources/shared/agent-workflow-file-resource'

const fixture = vi.hoisted(() => ({ save: vi.fn(), sparkProvide: vi.fn(), sparkRemove: vi.fn() }))
vi.mock('@/services/project-model-artifacts', () => ({ createRuleJsonSchema: () => ({}), createRuleTreePolicy: () => ({}) }))
vi.mock('@/views/app/dev-system/composables/useDevFileEditor', () => ({
  useDevFileEditor: (state: { dirty: ReturnType<typeof ref<boolean>> }) => ({
    isDirty: state.dirty, isUnconfirmed: ref(false), isReady: ref(true), text: ref(''),
    isFileDirty: () => state.dirty.value, save: fixture.save, refresh: vi.fn(),
  }),
}))
vi.mock('@spark-appworks/spark-component', async () => {
  const {defineComponent} = await import('vue')
  return {SparkCodeEditor: {}, JsonTreeEditor: {}, PAGE_RUNTIME: 'PAGE_RUNTIME',
    useSparkComponent: () => ({sparkProvide: fixture.sparkProvide, sparkRemove: fixture.sparkRemove}),
    RendererTable: defineComponent({name: 'RendererTable', props: {dataViewKey: String}, template: '<div class="bound-table"><slot /></div>'}),
    FieldText: defineComponent({name: 'FieldText', props: {field: String, label: String, displayFormatter: Function}, template: '<span>{{ label }}</span>'}),
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

function setup(hasFormalVersionBinding = true) {
  const rows = [{versionKey: '["page-A","script.js",2]', pageId: 'page-A', fileName: 'script.js', version: 2, snapshotFileName: '2__script.js', lastModified: null}]
  const view = {queryContext: {}, rows, loadingError: null, refresh: vi.fn().mockResolvedValue(undefined), deleteActionState: () => 'disabled'}
  const versionResource = LOWCODE_FILE_RESOURCE_REGISTRY.find(item => item.tableName === 'ProjectToolVersion')
  const dataSet = {scenarioId: '7AB874097A1E8711A42FD845939A6E05', getView: vi.fn((tableName: string) =>
    hasFormalVersionBinding && versionResource?.tableName === tableName ? view : undefined)}
  const runtime = {isLoaded: true, getDataSet: vi.fn(() => dataSet)}
  const state = {
    activePageId: ref('page-A'), dirty: ref(false), pageDataError: ref(null), pageIoBusy: ref(false),
    pageFileNames: ['rule.json', 'script.js', 'style.css'], addStatus: vi.fn(),
    project: { getActivePage: () => ({ pageId: state.activePageId.value }), setActivePage: vi.fn() },
    blueprintPageRuntime: ref(runtime), loadBlueprintWorkspaceDataView: vi.fn().mockResolvedValue(undefined),
    editor: {
      createRemotePageVersion: vi.fn().mockResolvedValue(undefined),
      restoreRemotePageVersion: vi.fn().mockResolvedValue(undefined),
    },
  }
  const wrapper = mount({ ...DevFileEditor, props: ['state', 'activeFile', 'showTabs'] }, {
    props: { state, activeFile: 'script.js', showTabs: false },
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
  return { state, wrapper, click, view }
}

describe('DevFileEditor snapshot identity', () => {
  beforeEach(() => { fixture.save.mockReset().mockResolvedValue(undefined); fixture.sparkProvide.mockReset(); fixture.sparkRemove.mockReset() })

  it('queries the formal ProjectToolVersion DataView and binds the standard table to it', async () => {
    const { state, wrapper, click, view } = setup()
    await click('版本'); await flushPromises()
    expect(state.loadBlueprintWorkspaceDataView).toHaveBeenCalledOnce()
    expect(view.queryContext).toEqual({pageId: 'page-A', fileName: 'script.js'})
    expect(view.refresh).toHaveBeenCalledOnce()
    expect(wrapper.findComponent({name: 'RendererTable'}).props('dataViewKey')).toBe('7AB874097A1E8711A42FD845939A6E05@ProjectToolVersion@default')
    const timeField = wrapper.findAllComponents({name: 'FieldText'}).find(field => field.props('field') === 'lastModified')!
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
    const { state, wrapper, click } = setup()
    const saved = deferred<void>(); fixture.save.mockReturnValueOnce(saved.promise)
    await click('版本'); await flushPromises(); await click('存档')
    await wrapper.setProps({ activeFile: 'style.css' })
    saved.resolve(); await flushPromises()
    expect(state.editor.createRemotePageVersion).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('does not create a snapshot when edits occur during working save', async () => {
    const { state, wrapper, click } = setup()
    const saved = deferred<void>(); fixture.save.mockReturnValueOnce(saved.promise)
    await click('版本'); await flushPromises(); await click('存档')
    state.dirty.value = true; saved.resolve(); await flushPromises()
    expect(state.editor.createRemotePageVersion).not.toHaveBeenCalled()
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
