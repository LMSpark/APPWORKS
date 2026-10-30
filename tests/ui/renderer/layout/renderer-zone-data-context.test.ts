import {afterEach, describe, expect, it, vi} from 'vitest'
import {config, flushPromises, mount} from '@vue/test-utils'
import {defineComponent, h, reactive, type Component} from 'vue'
import ElementPlus, {ElInput} from 'element-plus'
import {SparkData, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {DATA_ROW, DATA_SOURCE, PAGE_RUNTIME, FieldText, RendererButton,
  RendererSection, RendererDialog, RendererDrawer, RendererToolbar, RendererForm, Spark,
  useSparkComponent, useSparkConsume} from '@spark-appworks/spark-component'
import RendererHeader from '../../../../packages/spark-component/src/components/containers/zones/RendererHeader.vue'
import RendererFooter from '../../../../packages/spark-component/src/components/containers/zones/RendererFooter.vue'
import RendererTail from '../../../../packages/spark-component/src/components/containers/zones/RendererTail.vue'
import {DataSpaceQueryTable} from '../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'
import type {BeforeRenderContext} from '../../../../packages/spark-component/src/components/support/beforeRender'

const cleanup: Array<() => void> = []
const originalStubs = config.global.stubs
afterEach(() => {cleanup.splice(0).reverse().forEach(dispose => dispose()); config.global.stubs = originalStubs})

type Placement = 'direct' | 'header' | 'footer' | 'tail'
const zones: Array<[string, Component]> = [['header', RendererHeader], ['footer', RendererFooter], ['tail', RendererTail]]
const consumers: Array<[string, Component, Placement, boolean?]> = [
  ['section', RendererSection, 'header'], ['card section', RendererSection, 'header', true],
  ['dialog header', RendererDialog, 'header'], ['dialog footer', RendererDialog, 'footer'],
  ['drawer header', RendererDrawer, 'header'], ['drawer footer', RendererDrawer, 'footer'],
  ['toolbar tail', RendererToolbar, 'tail'],
]

async function applyPermissions(view: DataView) {
  const table = new DataSpaceQueryTable({scenarioId: view.dataSet!.scenarioId!, metaName: 'Items'})
  const context = new DataSpaceQueryContext({identity: table.identity, scope: 'form', readScope: () => 'form',
    snapshot: table.applyResult({Result: {primaryKeyField: 'id', data: {Items: view.rows, Count: view.rows.length}}}),
  })
  view.bindQueryExecutor({executeQuery: async () => context})
  await view.loadFromServer()
}

async function fixture(component: Component, options: {placement?: Placement; inherit?: boolean; useCard?: boolean; permission?: boolean; nativeZone?: boolean} = {}) {
  const stubs = {...config.global.stubs}
  delete stubs['SparkComponentRenderer']; delete stubs['spark-component-renderer']
  config.global.stubs = stubs
  const datasets = ['S', 'T'].map(scenarioId => SparkData.createDataSet({scenarioId, dataSetName: scenarioId, tables: {Internal: {
    tableName: 'Internal', modelBinding: {modelId: `${scenarioId}-MODEL`, modelName: 'Items'},
    columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'name', type: 'string'}],
    views: {default: {rows: [
      {id: 'A', name: `${scenarioId}-Alpha`, lingma_sys_params: {r: [], e: ['name'], h: [], m: [], d: false}},
      {id: 'B', name: `${scenarioId}-Beta`, lingma_sys_params: {r: [], e: options.permission ? [] : ['name'], h: [], m: [], d: false}},
    ]}},
  }}}))
  const runtime = new PageRuntime({pageId: 'zones', scenarioIds: ['S', 'T'],
    loadScenario: async id => datasets.find(ds => ds.scenarioId === id)!})
  await runtime.load(); cleanup.push(() => {runtime.dispose(); datasets.forEach(ds => ds.destroy())})
  const [source, target] = datasets.map(ds => ds.getView('Internal', 'default')!) as [DataView, DataView]
  for (const view of [source, target]) {
    await applyPermissions(view)
    view.commitMode = 'staged'; view.setCurrentRowById('A')
  }
  const requests = [vi.spyOn(source, 'requestData'), vi.spyOn(target, 'requestData')]
  const state = reactive({key: options.inherit ? undefined : 'T@Items@default', parentKey: 'S@Items@default', member: undefined as 'rows' | undefined})
  const before = vi.fn((context: BeforeRenderContext) => ({label: `${context.dataSource?.dataSet?.scenarioId}:${String(context.row?.['id'])}`}))
  const Probe = defineComponent({inheritAttrs: false, setup() {
    const {sparkConsume} = useSparkConsume(), view = sparkConsume(DATA_SOURCE), row = sparkConsume(DATA_ROW)
    return () => h('output', `${view?.dataSet?.scenarioId ?? 'none'}:${String(row?.['id'] ?? 'none')}`)
  }})
  const children: SparkNode[] = [{type: 'zone-probe'}, {type: 'r-form', props: {autoColumns: false, showDataViewMeta: false,
    showAggregateSummary: false, showSelectionSummary: false}, children: [{type: 'r-text', props: {dataField: 'name', label: '名称'}}]},
    {type: 'r-button', props: {onBeforeRender: before}}]
  const registry = Spark.createRegistry()
  for (const [type, control] of [['zone-probe', Probe], ['r-form', RendererForm], ['r-text', FieldText], ['r-button', RendererButton],
    ['r-header', RendererHeader], ['r-footer', RendererFooter], ['r-tail', RendererTail]] as Array<[string, Component]>) {
    registry.register({type, component: control})
  }
  const Host = defineComponent({setup() {
    const {sparkProvide} = useSparkComponent({type: 'r-form'})
    sparkProvide(PAGE_RUNTIME, runtime); sparkProvide(DATA_SOURCE, source); sparkProvide(DATA_ROW, source.rows[1]!)
    return () => {
      const binding = {...(state.key === undefined ? {} : {dataViewKey: state.key}), ...(state.member ? {dataMember: state.member} : {})}
      if (!options.placement || options.placement === 'direct') return h(component, {...binding, children})
      if (options.nativeZone) return h(component, {dataViewKey: state.parentKey, title: '编辑', modelValue: true}, {
        [options.placement === 'header' ? 'header-actions' : 'footer']: () => [h(Probe), h(RendererForm,
          {autoColumns: false, showDataViewMeta: false}, {default: () => h(FieldText, {dataField: 'name'})})],
      })
      return h(component, {dataViewKey: state.parentKey, title: '编辑', modelValue: true, useCard: options.useCard,
        ...(options.placement === 'tail' ? {gap: 19, wrap: false} : {}),
        [options.placement]: {...binding, children}}, {default: () => h('span', '正文')})
    }
  }})
  const wrapper = mount(Host, {global: {plugins: [ElementPlus, Spark.createPlugin({registry})], stubs: {teleport: true}}})
  cleanup.push(() => wrapper.unmount()); await flushPromises()
  return {wrapper, source, target, state, requests, before}
}

describe('standard zones retain their original DataView', () => {
  it.each(zones)('%s resolves a full cross-space model key and edits only that view', async (_name, component) => {
    const {wrapper, source, target, state, requests} = await fixture(component)
    expect(wrapper.get('output').text()).toBe('T:A')
    expect(wrapper.get<HTMLInputElement>('input').element.value).toBe('T-Alpha')
    await wrapper.get('input').setValue('target draft'); await flushPromises()
    expect(target.getEditingPatch('A')).toEqual({name: 'target draft'})
    expect(source.hasEditingChanges()).toBe(false)
    state.key = 'S@Items@default'; await flushPromises()
    expect(wrapper.get<HTMLInputElement>('input').element.value).toBe('S-Alpha')
    await wrapper.get('input').setValue('source draft'); await flushPromises()
    expect(source.getEditingPatch('A')).toEqual({name: 'source draft'})
    source.discardEditingRows(); await flushPromises()
    expect(wrapper.get<HTMLInputElement>('input').element.value).toBe('S-Alpha')
    expect(target.getEditingPatch('A')).toEqual({name: 'target draft'})
    expect(wrapper.getComponent(component).attributes('dataviewkey')).toBeUndefined()
    requests.forEach(request => expect(request).not.toHaveBeenCalled())
  })

  it.each(zones)('%s inherits the repeated row when the binding is omitted', async (_name, component) => {
    const {wrapper, before} = await fixture(component, {inherit: true})
    expect(wrapper.get('output').text()).toBe('S:B')
    expect(before.mock.calls.some(([context]) => context.row?.['id'] === 'B')).toBe(true)
  })

  it.each(zones)('%s does not turn a collection member into the parent current row', async (_name, component) => {
    const {wrapper, state} = await fixture(component)
    state.member = 'rows'; await flushPromises()
    expect(wrapper.get('output').text()).toBe('T:none')
  })

  it.each(consumers)('%s retains a structured zone binding across edits, cancellation and switching', async (_name, component, placement, useCard) => {
    const {wrapper, source, target, state, requests, before} = await fixture(component, {placement, useCard: useCard === true})
    expect(wrapper.get('output').text()).toBe('T:A')
    expect(wrapper.get<HTMLInputElement>('input').element.value).toBe('T-Alpha')
    expect(before.mock.calls.some(([context]) => context.dataSource === target && context.row?.['id'] === 'A')).toBe(true)
    await wrapper.get('input').setValue('target draft'); await flushPromises()
    expect(target.getEditingPatch('A')).toEqual({name: 'target draft'})
    expect(source.hasEditingChanges()).toBe(false)
    target.discardEditingRows(); await flushPromises()
    expect(wrapper.get<HTMLInputElement>('input').element.value).toBe('T-Alpha')
    state.key = 'S@Items@default'; await flushPromises()
    expect(wrapper.get('output').text()).toBe('S:A')
    const count = before.mock.calls.length
    target.setCurrentRowById('B'); await flushPromises()
    expect(wrapper.get('output').text()).toBe('S:A')
    expect(before.mock.calls.length).toBe(count)
    source.setCurrentRowById('B'); await flushPromises()
    expect(wrapper.get('output').text()).toBe('S:B')
    wrapper.unmount(); const unmountedCount = before.mock.calls.length
    source.setCurrentRowById('A'); await flushPromises()
    expect(before.mock.calls.length).toBe(unmountedCount)
    requests.forEach(request => expect(request).not.toHaveBeenCalled())
  })

  it('uses the bound view field permissions and rejects a forbidden field event', async () => {
    const {wrapper, source, target} = await fixture(RendererHeader, {permission: true})
    expect(wrapper.get<HTMLInputElement>('input').element.disabled).toBe(false)
    await wrapper.get('input').setValue('allowed'); await flushPromises()
    expect(target.getEditingPatch('A')).toEqual({name: 'allowed'})
    target.setCurrentRowById('B'); await flushPromises()
    expect(wrapper.get<HTMLInputElement>('input').element.disabled).toBe(true)
    wrapper.getComponent(ElInput).vm.$emit('update:modelValue', 'forbidden'); await flushPromises()
    expect(target.getEditingPatch('B')).toBeUndefined()
    expect(source.hasEditingChanges()).toBe(false)
  })

  it.each(consumers)('%s inherits the parent binding and releases it when the parent changes space', async (_name, component, placement, useCard) => {
    const {wrapper, source, target, state} = await fixture(component, {placement, useCard: useCard === true, inherit: true})
    expect(wrapper.get('output').text()).toBe('S:A')
    state.parentKey = 'T@Items@default'; await flushPromises()
    expect(wrapper.get('output').text()).toBe('T:A')
    expect(wrapper.get<HTMLInputElement>('input').element.value).toBe('T-Alpha')
    await wrapper.get('input').setValue('new parent'); await flushPromises()
    expect(target.getEditingPatch('A')).toEqual({name: 'new parent'})
    expect(source.hasEditingChanges()).toBe(false)
    source.setCurrentRowById('B'); await flushPromises()
    expect(wrapper.get('output').text()).toBe('T:A')
  })

  it.each(consumers.slice(2, 6))('%s native slot follows its parent when the space changes', async (_name, component, placement) => {
    const {wrapper, source, target, state} = await fixture(component, {placement, nativeZone: true})
    expect(wrapper.get('output').text()).toBe('S:A')
    state.parentKey = 'T@Items@default'; await flushPromises()
    expect(wrapper.get('output').text()).toBe('T:A')
    await wrapper.get('input').setValue('native target'); await flushPromises()
    expect(target.getEditingPatch('A')).toEqual({name: 'native target'})
    expect(source.hasEditingChanges()).toBe(false)
  })

  it('applies toolbar spacing and single-line layout to the actual tail action parent', async () => {
    const {wrapper} = await fixture(RendererToolbar, {placement: 'tail'})
    const actionParent = wrapper.getComponent(RendererButton).element.parentElement!
    expect(actionParent.classList.contains('renderer-toolbar-lane--end')).toBe(true)
    expect(actionParent.style.gap).toBe('19px')
    expect(actionParent.style.display).toBe('grid')
  })
})
