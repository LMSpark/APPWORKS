import {afterEach, describe, expect, it, vi} from 'vitest'
import {config, flushPromises, mount} from '@vue/test-utils'
import {defineComponent, h, onBeforeUnmount, shallowRef} from 'vue'
import ElementPlus, {ElTable, ElTableColumn} from 'element-plus'
import {DataSet} from '@spark-appworks/spark-data'
import {FieldText, RendererForm, RendererTable, Spark, PAGE_RUNTIME, DATA_ROW, useSparkComponent} from '@spark-appworks/spark-component'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {DataSpaceQueryContext} from '../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'
import {DataSpaceQueryTable} from '../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'

const originalStubs = config.global.stubs
const cleanups: Array<() => void> = []
afterEach(() => {cleanups.splice(0).reverse().forEach(fn => fn()); config.global.stubs = originalStubs; vi.unstubAllGlobals()})

async function fixture(editable = true, header = false) {
  const stubs = {...config.global.stubs}
  for (const name of ['el-table', 'el-table-column', 'SparkComponentRenderer', 'spark-component-renderer']) delete stubs[name]
  config.global.stubs = stubs
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
  const dataSet = DataSet.fromJson({scenarioId: 'SPACE', dataSetName: 'Orders', tables: {Orders: {
    tableName: 'Orders', modelBinding: {modelId: 'MODEL', modelName: 'Orders'}, columns: [
      {name: 'id', type: 'string', isPrimaryKey: true}, {name: 'name', type: 'string'},
      {name: 'secret', type: 'string'}, {name: 'masked', type: 'string'},
    ], views: {default: {selectionDelimiter: ''}, other: {selectionDelimiter: ''}},
  }}})
  cleanups.push(() => dataSet.destroy())
  const source = new DataSpaceQueryTable({scenarioId: 'SPACE', metaName: 'Orders'})
  let requests = 0
  for (const viewId of ['default', 'other']) {
    const view = dataSet.getView('Orders', viewId)!
    view.commitMode = 'staged'
    view.bindQueryExecutor({executeQuery: async () => {
      requests++
      return new DataSpaceQueryContext({identity: source.identity, scope: 'query', readScope: () => 'query',
        snapshot: source.applyResult({Result: {primaryKeyField: 'id', data: {Items: ['O1', 'O2'].map(id => ({id,
          name: `${viewId}-${id}`, secret: '不可泄漏', masked: '不可泄漏',
          lingma_sys_params: {r: [], e: editable ? ['name', 'secret', 'masked'] : [], h: ['secret'], m: ['masked'], d: false},
        })), Count: 2}}})})
    }})
    await view.refresh()
  }
  const runtime = new PageRuntime({pageId: 'cell-test', scenarioIds: ['SPACE'], loadScenario: async () => dataSet})
  await runtime.load()
  const registry = Spark.createRegistry(); registry.register({type: 'r-text', component: FieldText})
  registry.register({type: 'r-form', component: RendererForm})
  const key = shallowRef('SPACE@Orders@default'), readonly = shallowRef(false)
  const Host = defineComponent({setup() {
    const {sparkProvide} = useSparkComponent({type: 'cell-test'})
    sparkProvide(PAGE_RUNTIME, runtime)
    sparkProvide(DATA_ROW, {id: 'PARENT', name: '父容器的模型行'})
    onBeforeUnmount(() => runtime.dispose())
    return () => h(RendererTable, {dataViewKey: key.value, autoColumns: false, showPagination: false, showDataViewMeta: false,
      children: ['name', 'secret', 'masked'].map(field => ({type: 'r-text', props: {field, label: field, emptyText: '—', editOnDblclick: true, readonly: readonly.value,
        ...(header && field === 'name' ? {header: {type: 'r-form', props: {dataViewKey: 'SPACE@Orders@other', contextDataMember: 'currentRow',
          autoColumns: false, showDataViewMeta: false, gridColumns: 1}, children: [{type: 'r-text', props: {field: 'name', placeholder: '筛选', clearable: true}}]}} : {})}}))})
  }})
  const wrapper = mount(Host, {attachTo: document.body, global: {plugins: [ElementPlus, Spark.createPlugin({registry})],
    components: {'el-table': ElTable, 'el-table-column': ElTableColumn}, stubs: {'el-table': ElTable, 'el-table-column': ElTableColumn}}})
  cleanups.push(() => wrapper.unmount()); await flushPromises()
  const edit = async (index: number) => {
    await wrapper.findAll('tbody tr')[index]!.trigger('click'); await flushPromises()
    await wrapper.findAll('tbody tr')[index]!.get('.field-table-value').trigger('dblclick'); await flushPromises()
  }
  return {wrapper, view: dataSet.getView('Orders', 'default')!, other: dataSet.getView('Orders', 'other')!, edit, key, readonly, requests: () => requests}
}

describe('standard table field editing', () => {
  it('displays configured empty text without writing it into an empty field or replacing masked values', async () => {
    const {wrapper, view, edit} = await fixture()
    view.updateEditingValue('O2', 'name', ''); await flushPromises()
    expect(wrapper.findAll('tbody tr')[1]!.text()).toContain('—')
    expect(wrapper.text()).not.toContain('不可泄漏')
    expect(view.getEditingPatch('O2')).toEqual({name: ''})
    await edit(1)
    expect(wrapper.get<HTMLInputElement>('tbody input').element.value).toBe('')
  })

  it.each([true, false])('renders standard header children bound to their own view and permissions (allowed=%s)', async allowed => {
    const {wrapper, view, other} = await fixture(allowed, true)
    const input = wrapper.get('.el-table__header-wrapper input')
    expect(input.attributes('placeholder')).toBe('筛选')
    expect(input.attributes('disabled') !== undefined).toBe(!allowed)
    if (allowed) {await input.setValue('表头筛选值'); await flushPromises()}
    expect(other.getEditingPatch('O1')).toEqual(allowed ? {name: '表头筛选值'} : undefined)
    expect(view.hasEditingChanges()).toBe(false)
    expect(wrapper.text()).toContain('default-O2')
  })

  it('edits the accepted row through its original DataView, ends on blur and preserves staged changes when switching rows', async () => {
    const {wrapper, view, edit, requests} = await fixture()
    const initialRequests = requests()
    await edit(1)
    const input = wrapper.get('tbody input')
    expect(input.attributes('disabled')).toBeUndefined()
    expect((input.element as HTMLInputElement).value).toBe('default-O2')
    await input.setValue('第二行草稿'); await flushPromises()
    expect(view.getEditingPatch('O2')).toMatchObject({name: '第二行草稿'})
    expect(view.hasEditingChanges('O1')).toBe(false)
    expect(view.rows[1]?.['name']).toBe('default-O2')
    await input.trigger('focusout'); await flushPromises()
    expect(wrapper.find('tbody input').exists()).toBe(false)
    expect(wrapper.text()).toContain('第二行草稿')
    await edit(0)
    await wrapper.get('tbody input').setValue('第一行草稿'); await flushPromises()
    view.setCurrentRowById('O2'); await flushPromises()
    expect(wrapper.find('tbody input').exists()).toBe(false)
    expect(view.getEditingPatch('O1')).toMatchObject({name: '第一行草稿'})
    expect(requests()).toBe(initialRequests)
    view.discardEditingRows(); await flushPromises()
    expect(wrapper.text()).not.toContain('草稿')
  })

  it('closes a cell when binding or readonly changes and never redirects an old editor to another named view', async () => {
    const {wrapper, view, other, edit, key, readonly} = await fixture()
    await edit(0)
    const oldInput = wrapper.get('tbody input')
    readonly.value = true; await flushPromises()
    expect(wrapper.find('tbody input').exists()).toBe(false)
    await oldInput.setValue('过期输入'); await flushPromises()
    expect(view.hasEditingChanges()).toBe(false)
    readonly.value = false; await flushPromises(); await edit(0)
    key.value = 'SPACE@Orders@other'; await flushPromises()
    expect(wrapper.find('tbody input').exists()).toBe(false)
    expect(other.hasEditingChanges()).toBe(false)
    expect(wrapper.text()).toContain('other-O1')
    expect(wrapper.text()).not.toContain('不可泄漏')
  })

  it('keeps denied, hidden and masked fields out of the cell editor', async () => {
    const {wrapper, view, edit} = await fixture(false)
    await edit(0)
    expect(wrapper.find('tbody input').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('不可泄漏')
    expect(view.hasEditingChanges()).toBe(false)
  })
})
