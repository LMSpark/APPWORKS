import {afterEach, describe, expect, it, vi} from 'vitest'
import {config, flushPromises, mount} from '@vue/test-utils'
import {defineComponent, h, onBeforeUnmount} from 'vue'
import ElementPlus, {ElTable, ElTableColumn} from 'element-plus'
import {DataSet} from '@spark-appworks/spark-data'
import {FieldText, RendererTable, Spark, PAGE_RUNTIME, useSparkComponent} from '@spark-appworks/spark-component'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {ApiBackend} from '../../../runtime/page/api-provider/api-provider.fixture'

const originalStubs = config.global.stubs, cleanups: Array<() => void> = []
afterEach(() => {cleanups.splice(0).reverse().forEach(fn => fn()); config.global.stubs = originalStubs; vi.unstubAllGlobals()})
async function fixture() {
  const stubs = {...config.global.stubs}
  for (const name of ['el-table', 'el-table-column', 'SparkComponentRenderer', 'spark-component-renderer']) delete stubs[name]
  config.global.stubs = stubs
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
  const http = new ApiBackend(); http.primaryKeys['Params'] = 'parid'
  http.records = {Params: [{parid: 'P1', parname: 'First'}, {parid: 'P2', parname: 'Second'}]}
  const owner = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'scope', headers: {}})})
  const ds = DataSet.fromJson({scenarioId: 'SPACE', tables: {Params: {modelBinding: {modelId: 'PARAMS', modelName: 'Params'},
    columns: [{name: 'parid', type: 'string', isPrimaryKey: true}, {name: 'parname', type: 'string', required: true}],
    views: {default: {autoLoad: false, commitMode: 'staged', selectionDelimiter: ''}}}}})
  const view = ds.getView('Params')!; view.primaryKey = 'parid'; view.bindQueryExecutor(owner); await view.refresh()
  const runtime = new PageRuntime({pageId: 'cell-save', scenarioIds: ['SPACE'], loadScenario: async () => ds}); await runtime.load()
  const registry = Spark.createRegistry(); registry.register({type: 'r-text', component: FieldText})
  const Host = defineComponent({setup() {
    useSparkComponent({type: 'cell-save'}).sparkProvide(PAGE_RUNTIME, runtime)
    onBeforeUnmount(() => runtime.dispose())
    return () => h(RendererTable, {dataViewKey: 'SPACE@Params@default', showPagination: false, showDataViewMeta: false,
      children: [{type: 'r-text', props: {field: 'parname', editOnDblclick: true, saveOnCellExit: true}}]})
  }})
  const wrapper = mount(Host, {attachTo: document.body, global: {plugins: [ElementPlus, Spark.createPlugin({registry})],
    components: {'el-table': ElTable, 'el-table-column': ElTableColumn}, stubs: {'el-table': ElTable, 'el-table-column': ElTableColumn}}})
  cleanups.push(() => wrapper.unmount()); await flushPromises()
  async function edit(index: number) {
    const row = wrapper.findAll('.el-table__body-wrapper tbody tr')[index]!
    await row.trigger('click'); await flushPromises(); await row.get('.field-table-cell').trigger('dblclick'); await flushPromises()
    return wrapper.get('tbody input')
  }
  return {wrapper, view, http, edit, ds}
}
describe('standard cell native row save', () => {
  it('saves only the accepted row once on blur followed by focus loss', async () => {
    const {view, http, edit} = await fixture()
    view.updateEditingValue('P2', 'parname', 'Other pending')
    const input = await edit(0); await input.setValue('Changed'); await flushPromises()
    expect(input.attributes('disabled')).toBeUndefined()
    expect(view.getEditingPatch('P1')).toEqual({parname: 'Changed'})
    await input.trigger('keydown', {key: 'Enter'}); await input.trigger('focusout'); await flushPromises()
    expect(http.saves).toHaveLength(1)
    expect(http.saves[0]?.changed).toEqual([{parid: 'P1', parname: 'Changed'}])
    expect(view.hasEditingChanges('P1')).toBe(false)
    expect(view.getEditingPatch('P2')).toEqual({parname: 'Other pending'})
  })
  it('preserves a rejected row and exposes its validation failure', async () => {
    const {wrapper, view, http, edit} = await fixture()
    const input = await edit(0); await input.setValue(''); await flushPromises(); await input.trigger('focusout'); await flushPromises()
    expect(http.saves).toHaveLength(0)
    expect(view.getEditingPatch('P1')).toEqual({parname: ''})
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
  })
  it('retains the original unknown save and verifies it without replaying the write', async () => {
    const {wrapper, view, http, edit, ds} = await fixture()
    http.failAfterWrite = true
    const input = await edit(0); await input.setValue('Accepted'); await flushPromises(); await input.trigger('focusout'); await flushPromises()
    expect(http.saves).toHaveLength(1)
    expect(view.hasUnconfirmedSave).toBe(true)
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    await input.trigger('focusout'); await flushPromises()
    expect(http.saves).toHaveLength(1)
    const result = await ds.saveChanges({views: [{tableName: 'Params', viewId: 'default', ids: ['P1']}]})
    expect(result.success).toBe(true)
    expect(http.saves).toHaveLength(1)
    expect(view.hasUnconfirmedSave).toBe(false)
  })
  it('does not submit an editor whose current row changed before focus loss', async () => {
    const {view, http, edit} = await fixture()
    const input = await edit(0); await input.setValue('Pending'); await flushPromises()
    view.setCurrentRowById('P2'); await flushPromises(); await input.trigger('focusout'); await flushPromises()
    expect(http.saves).toHaveLength(0)
    expect(view.getEditingPatch('P1')).toEqual({parname: 'Pending'})
  })
})
