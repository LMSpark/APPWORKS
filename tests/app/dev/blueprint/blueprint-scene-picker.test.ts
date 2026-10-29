import {defineComponent, h, nextTick, ref} from 'vue'
import {flushPromises, mount} from '@vue/test-utils'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {RequestState} from '@spark-appworks/spark-data'
import RendererDialog from '@/../packages/spark-component/src/components/containers/layout/overlay/RendererDialog/RendererDialog.vue'
import NodeBasicInfo from '@/views/app/dev-system/components/NodeBasicInfo.vue'
import DataPlanningPane from '@/views/app/dev-system/blueprint-workspace/DataPlanningPane.vue'

const CATALOG_SCENARIO_ID = '90A82E287930A234FEC3E687C94A93EA'
const BLUEPRINT_SCENARIO_ID = '7AB874097A1E8711A42FD845939A6E05'
const CATALOG_KEY = `${CATALOG_SCENARIO_ID}@Base_DataSet@catalog`
const BLUEPRINT_KEY = `${BLUEPRINT_SCENARIO_ID}@Base_NavigationInfo@default`

const ButtonStub = defineComponent({
  props: {label: String, disabled: Boolean},
  emits: ['click'],
  setup(props, {emit}) { return () => h('button', {disabled: props.disabled, onClick: () => emit('click')}, props.label) },
})
const DialogStub = defineComponent({
  props: {modelValue: Boolean, closeDisabled: Boolean, title: String},
  emits: ['update:modelValue'],
  setup(props, {slots}) { return () => props.modelValue ? h('div', {'data-testid': 'scene-dialog'}, [slots['default']?.(), slots['footer']?.()]) : null },
})
const FullscreenDialogStub = defineComponent({
  setup(_props, {slots}) { return () => h('section', {'data-testid': 'fullscreen-shell'}, [slots['default']?.(), slots['footer']?.()]) },
})
const FilterStub = defineComponent({props: {dataViewKey: String, autoQuery: Boolean, children: Array}, setup: () => () => h('div', {'data-testid': 'filter-stub'})})
const TableStub = defineComponent({
  props: {dataViewKey: String, children: Array, showPagination: {type: Boolean, default: true}, onRowClick: Function},
  setup() { return () => h('button', {'data-testid': 'table-stub', onClick: () => activeView?.setCurrentRow(candidate)}, [h('span', {'data-testid': 'candidate-row'}, 'candidate')]) },
})
const FieldSelectStub = defineComponent({
  props: {dataViewKey: String, dataMember: String, dataField: String, optionDataViewKey: String, optionValueField: String,
    optionLabelField: String, readonly: Boolean},
  setup: props => () => h('output', {'data-testid': 'scene-field', 'data-blueprint-key': props.dataViewKey,
    'data-option-key': props.optionDataViewKey, 'data-field': props.dataField}),
})
const DesignerStub = defineComponent({setup: () => () => h('div', {'data-testid': 'designer'})})
const InputStub = defineComponent({setup: () => () => h('input')})
const AlertStub = defineComponent({props: {title: String}, setup: props => () => h('p', props.title)})
const FormItemStub = defineComponent({props: {label: String}, setup: (props, {slots}) => () => h('div', [props.label, slots['default']?.()])})

let candidate: Record<string, unknown>
let wrapper: ReturnType<typeof mount> | undefined
let activeView: {currentRow: Record<string, unknown> | null; setCurrentRow: (row: Record<string, unknown> | null) => void} | undefined

function makeState(options: {refreshError?: Error; deferred?: boolean; hiddenName?: boolean; targetWritable?: boolean; catalogMissing?: boolean} = {}) {
  const selectedNode = ref({nodeId: 'PAGE-A', dataSpace: {scenarioId: 'SCENE-OLD', models: []}})
  const changes: Array<unknown> = []
  const dataSpace = {
    scenarioId: 'SCENE-OLD', models: [],
  }
  const draft = {
    nodeId: 'PAGE-A',
    capability: {},
    dataSpace,
  }
  const selectedCatalogRow = ref<Record<string, unknown> | null>(null)
  const view = {
    tableName: 'Base_DataSet', viewId: 'catalog',
    dataSet: {scenarioId: CATALOG_SCENARIO_ID},
    rows: [candidate],
    get currentRow() {return selectedCatalogRow.value},
    setCurrentRow(row: Record<string, unknown> | null) {selectedCatalogRow.value = row},
    requestState: RequestState.Idle,
    loadingError: null as Error | null,
    refresh: vi.fn(async () => {
      if (options.deferred) await new Promise<void>(resolve => {completeRefresh = resolve})
      if (options.refreshError) {
      view.requestState = RequestState.Failed
        view.loadingError = options.refreshError
        return {success: false, message: options.refreshError.message}
      }
      view.requestState = RequestState.Loaded
      view.rows = [candidate]
      return {success: true, message: 'loaded'}
    }),
    fieldAccess: vi.fn((_row: unknown, field: string) => ({
      read: field === 'Name' && options.hiddenName ? 'invisible' : 'visible',
      write: 'denied',
    })),
  }
  let completeRefresh: (() => void) | undefined
  const runtime = {instanceId: 'runtime-A', isLoaded: true, resolveView: vi.fn((key: string) =>
    !options.catalogMissing && key === CATALOG_KEY ? view : undefined)}
  const state = {
    selectedNode,
    projectId: 'APP-A',
    pageDataDirty: ref(false),
    sceneBindingPending: ref(true),
    blueprintPageRuntime: ref(runtime),
    blueprintWorkspaceDataView: ref({view: {tableName: 'Base_NavigationInfo', viewId: 'default', dataSet: {scenarioId: BLUEPRINT_SCENARIO_ID}}}),
    blueprintNodeFieldAccess: vi.fn((field: string) => ({read: true, write: field !== 'conid' || options.targetWritable !== false})),
    blueprintNodeSectionWritable: vi.fn(() => true),
    blueprintDraft: draft,
    markBlueprintDirty: vi.fn(),
    persistedDataSpaceId: ref('SCENE-OLD'),
    recordChange(value: unknown) { changes.push(value) },
  }
  activeView = view
  wrapper = mount(NodeBasicInfo, {
    props: {state: state as never, sections: ['data-space']},
    global: {stubs: {RendererButton: ButtonStub, RendererDialog: DialogStub, RendererFilter: FilterStub,
      RendererTable: TableStub, FieldSelect: FieldSelectStub, IconPicker: true, ElInput: InputStub,
      ElAlert: AlertStub, ElDivider: true, ElFormItem: FormItemStub}},
  })
  return {state, view, runtime, selectedNode, changes, completeRefresh: () => completeRefresh?.()}
}

afterEach(() => {wrapper?.unmount(); wrapper = undefined; activeView = undefined})

async function openPicker(): Promise<void> {
  const open = wrapper!.findAll('button').find(button => button.text().includes('场景'))
  expect(open, 'the data-space picker button is present').toBeDefined()
  await open!.trigger('click')
  await flushPromises()
}
async function clickCandidate(row: Record<string, unknown>): Promise<void> {
  candidate = row
  await wrapper!.get('[data-testid="candidate-row"]').trigger('click')
  await nextTick()
  await wrapper!.findAll('button').find(button=>button.text()==='确定')!.trigger('click')
  await nextTick()
}

describe('development blueprint scene picker', () => {
  beforeEach(() => {candidate = {rowid: 'SCENE-NEW', Name: 'Order data'}})

  it('forwards the default slot into the actual RendererDialog body and the footer separately', () => {
    const dialog = mount(RendererDialog, {props: {modelValue: true, title: '选择数据空间'},
      slots: {default: () => h('p', {'data-testid': 'dialog-content'}, 'catalog body'),
        footer: () => h('button', {'data-testid': 'dialog-footer'}, '确定')},
      global: {stubs: {FullscreenDialog: FullscreenDialogStub}}})
    expect(dialog.find('.renderer-dialog-body [data-testid="dialog-content"]').text()).toBe('catalog body')
    expect(dialog.find('[data-testid="dialog-footer"]').exists()).toBe(true)
    dialog.unmount()
  })

  it('replaces manual ID entry with the standard field binding and a paged, filtered catalog dialog', async () => {
    const {view, runtime} = makeState()
    expect(wrapper!.find('input').exists()).toBe(false)
    const field = wrapper!.get('[data-testid="scene-field"]')
    expect(field.attributes('data-blueprint-key')).toBe(BLUEPRINT_KEY)
    expect(field.attributes('data-field')).toBe('conid')
    expect(field.attributes('data-option-key')).toBe(CATALOG_KEY)
    expect(runtime.resolveView).not.toHaveBeenCalled()
    expect(view.refresh).not.toHaveBeenCalled()

    await openPicker()
    expect(runtime.resolveView).toHaveBeenCalledWith(CATALOG_KEY)
    const filter = wrapper!.findComponent(FilterStub)
    const table = wrapper!.findComponent(TableStub)
    expect(filter.props('dataViewKey')).toBe(CATALOG_KEY)
    expect(filter.props('autoQuery')).toBe(false)
    expect(filter.props('children')).toEqual(expect.arrayContaining([
      expect.objectContaining({type: 'r-text', props: expect.objectContaining({field: 'Name',
        filterAlternatives: [{field: 'Name', operator: 'contains'}, {field: 'rowid', operator: 'eq'}]})}),
    ]))
    expect(table.props('dataViewKey')).toBe(CATALOG_KEY)
    expect(table.props('onRowClick')).toBeUndefined()
    expect(table.props('showPagination')).not.toBe(false)
    expect(view.refresh).toHaveBeenCalledOnce()
  })

  it('keeps the catalog body visible when its non-reactive DataView request state changes from loading to loaded', async () => {
    const {completeRefresh} = makeState({deferred: true})
    await openPicker()
    expect(wrapper!.text()).toContain('正在读取数据空间目录')
    completeRefresh()
    await flushPromises()
    expect(wrapper!.findComponent(FilterStub).exists()).toBe(true)
    expect(wrapper!.findComponent(TableStub).exists()).toBe(true)
  })

  it('writes the clicked catalog row ID through the blueprinted conid current row only after access checks', async () => {
    const {state, view} = makeState()
    await openPicker()
    await wrapper!.get('[data-testid="candidate-row"]').trigger('click')
    expect(state.blueprintDraft.dataSpace.scenarioId).toBe('SCENE-OLD')
    await wrapper!.findAll('button').find(button=>button.text()==='确定')!.trigger('click')
    expect(state.blueprintDraft.dataSpace.scenarioId, wrapper!.text()).toBe('SCENE-NEW')
    expect(state.markBlueprintDirty).not.toHaveBeenCalled()
    expect(wrapper!.findAll('button').some(button => /解除绑定|清空/.test(button.text()))).toBe(false)
    expect(view.fieldAccess).toHaveBeenCalledWith(candidate, 'rowid')
    expect(view.fieldAccess).toHaveBeenCalledWith(candidate, 'Name')
    expect(wrapper!.find('[data-testid="scene-dialog"]').exists()).toBe(false)
  })

  it.each([
    ['empty catalog identity', {rowid: '', Name: 'Missing ID'}],
    ['empty catalog row', {}],
    ['empty catalog label', {rowid: 'SCENE-X', Name: ''}],
  ])('rejects an %s without changing the blueprint field', async (_label, row) => {
    const {state} = makeState()
    await openPicker()
    await clickCandidate(row)
    expect(state.blueprintDraft.dataSpace.scenarioId).toBe('SCENE-OLD')
  })

  it('rejects unreadable candidates, missing views, and failed catalog reads', async () => {
    const hidden = makeState({hiddenName: true})
    await openPicker()
    await clickCandidate(candidate)
    expect(hidden.state.blueprintDraft.dataSpace.scenarioId).toBe('SCENE-OLD')
    wrapper!.unmount(); wrapper = undefined

    const missing = makeState({catalogMissing: true})
    await openPicker()
    expect(wrapper!.text()).toMatch(/目录视图|DATA_VIEW_MISSING/)
    expect(wrapper!.findComponent(TableStub).exists()).toBe(false)
    wrapper!.unmount(); wrapper = undefined

    makeState({refreshError: new Error('catalog unavailable')})
    await openPicker()
    await flushPromises()
    expect(wrapper!.text()).toContain('catalog unavailable')
    expect(wrapper!.findComponent(TableStub).exists()).toBe(false)
  })

  it('discards an in-flight catalog result after selected node or project scope changes', async () => {
    const {state, view, completeRefresh} = makeState({deferred: true})
    await openPicker()
    await nextTick()
    state.selectedNode.value = {nodeId: 'PAGE-B', dataSpace: {scenarioId: 'OTHER', models: []}}
    state.projectId = 'APP-B'
    completeRefresh()
    await flushPromises()
    if (wrapper!.find('[data-testid="candidate-row"]').exists()) await clickCandidate(candidate)
    expect(state.blueprintDraft.dataSpace.scenarioId).toBe('SCENE-OLD')
    expect(view.refresh).toHaveBeenCalledOnce()
  })

  it('blocks the single binding control when conid is not writable or the scene designer has pending changes', async () => {
    makeState({targetWritable: false})
    expect(wrapper!.findAll('button').some(button => button.attributes('disabled') !== undefined)).toBe(true)
    wrapper!.unmount(); wrapper = undefined

    const {state} = makeState()
    state.pageDataDirty.value = true
    await nextTick()
    expect(wrapper!.findAll('button').some(button => button.attributes('disabled') !== undefined)).toBe(true)
  })
})

describe('blueprint scene designer target', () => {
  it('blocks designer loading until the staged conid is formally saved and read back', async () => {
    const persistedDataSpaceId = ref('SCENE-SAVED')
    const selectedNode = ref({nodeId: 'PAGE-A', dataSpace: {scenarioId: 'SCENE-DRAFT', models: []}})
    const sceneBindingPending = ref(true)
    wrapper = mount(DataPlanningPane, {
      props: {state: {persistedDataSpaceId, selectedNode, sceneBindingPending,
        pageDataDirty: ref(false), pageDataError: ref(null)} as never, fieldAccess: {read: true, write: true}},
      global: {stubs: {DevDataSetDesigner: DesignerStub, ElFormItem: FormItemStub, ElAlert: AlertStub}},
    })
    expect(wrapper!.text()).toContain('SCENE-SAVED')
    expect(wrapper!.text()).toMatch(/尚未通过顶栏保存并正式回读/)
    expect(wrapper!.findComponent(DesignerStub).exists()).toBe(false)
    expect(wrapper!.find('input').exists()).toBe(false)
    expect(wrapper!.findAll('button')).toHaveLength(0)

    sceneBindingPending.value = false
    persistedDataSpaceId.value = 'SCENE-DRAFT'
    await nextTick()
    expect(wrapper!.text()).toContain('SCENE-DRAFT')
    expect(wrapper!.findComponent(DesignerStub).exists()).toBe(true)
  })
})
