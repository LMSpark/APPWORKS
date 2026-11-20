import {afterEach, expect, it, vi} from 'vitest'
import {flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {defineComponent, effectScope, h, shallowRef} from 'vue'
import ElementPlus, {ElTable, ElTableColumn} from 'element-plus'
import {DataSet, type DataColumn} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {FieldText, PAGE_RUNTIME, RendererTable, Spark, useSparkComponent} from '@spark-appworks/spark-component'
import {DataSpaceQueryContext} from '../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'
import {DataSpaceQueryTable} from '../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {useDataViewState} from '../../../../packages/spark-component/src/components/containers/data-views/view-runtime-state'

const wrappers: VueWrapper[] = [], runtimes: PageRuntime[] = [], sets: DataSet[] = []
afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  runtimes.splice(0).forEach(runtime => runtime.dispose())
  sets.splice(0).forEach(set => set.destroy())
  vi.unstubAllGlobals()
})

it('binds duplicate-root joined rows and switches accepted projection columns through the standard table', async () => {
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
  const identity = {scenarioId: 'SPACE', metaName: 'Orders'}
  const ds = DataSet.fromJson({scenarioId: 'SPACE', tables: {Orders: {
    tableName: 'Orders', resourceType: 'database-table', modelBinding: {modelId: 'MODEL', modelName: 'Orders'},
    columns: [{name: 'rowid', type: 'string', label: '父标识', isPrimaryKey: true}, {name: 'rootLabel', type: 'string', label: '原列'}],
    views: {default: {autoCurrentFirst: false, autoSelectFirst: false}, sibling: {}},
  }}})
  sets.push(ds)
  const view = ds.getView('Orders')!, baseline = JSON.stringify(ds.toJson())
  let mode: 'first' | 'alternate' | 'entity' = 'first'
  view.bindQueryExecutor({executeQuery: async () => {
    const joined = mode !== 'entity', field = mode === 'first' ? 'childCaption' : 'alternateCaption'
    const rows = joined ? ['甲', '乙'].map(label => ({rowid: 'ROOT', [field]: (mode === 'first' ? '子记录' : '替换子列') + label}))
      : [{rowid: 'ROOT', rootLabel: '实体记录'}]
    const columns: DataColumn[] = [{name: 'rowid', type: 'string', label: '父标识'},
      {name: field, type: 'string', label: mode === 'first' ? '子标题' : '备用子标题'}]
    return new DataSpaceQueryContext({identity, scope: 'SCOPE', readScope: () => 'SCOPE',
      ...joined ? {resultKind: 'join' as const, columns} : {},
      snapshot: new DataSpaceQueryTable(identity).applyResult({Result: {
        data: {Items: rows, Count: rows.length}, primaryKeyField: 'rowid', allowAdd: true,
      }})})
  }})
  await view.loadFromServer()
  const runtime = new PageRuntime({pageId: 'join-projection', scenarioIds: ['SPACE'], loadScenario: async () => ds})
  runtimes.push(runtime); await runtime.load()
  const registry = Spark.createRegistry(); registry.register({type: 'r-text', component: FieldText})
  const Host = defineComponent({setup() {
    useSparkComponent({type: 'join-projection-host'}).sparkProvide(PAGE_RUNTIME, runtime)
    return () => h(RendererTable, {dataViewKey: 'SPACE@Orders@default', autoColumns: true,
      highlightCurrentRow: true, showDataViewMeta: false, showPagination: false})
  }})
  const wrapper = mount(Host, {global: {plugins: [ElementPlus, Spark.createPlugin({registry})],
    stubs: {'el-table': ElTable, 'el-table-column': ElTableColumn,
      SparkComponentRenderer: false, 'spark-component-renderer': false}}})
  wrappers.push(wrapper); await flushPromises()
  expect(wrapper.text()).toContain('子记录甲')
  expect(wrapper.text()).toContain('子记录乙')
  expect(wrapper.get('thead').text()).toContain('子标题')
  expect(wrapper.findAll('tbody tr')).toHaveLength(2)
  const second = view.rows[1]!
  await wrapper.findAll('tbody tr')[1]!.trigger('click'); await flushPromises()
  expect(view.currentRow).toBe(second)
  view.setSelectedRows([second]); await flushPromises()
  expect(view.selectedRows).toEqual([second])
  expect(view.fieldAccess(second, 'childCaption').write).toBe('denied')
  expect(view.getPkKey(second)).toBeUndefined()
  mode = 'alternate'; await view.loadFromServer(); await flushPromises()
  expect(wrapper.text()).toContain('替换子列甲')
  expect(wrapper.text()).toContain('替换子列乙')
  expect(wrapper.get('thead').text()).toContain('备用子标题')
  expect(wrapper.get('thead').text()).not.toContain('原列')
  expect(view.currentRow).toBeNull()
  expect(view.selectedRows).toEqual([])
  mode = 'entity'; await view.loadFromServer(); await flushPromises()
  expect(wrapper.text()).toContain('实体记录')
  expect(wrapper.get('thead').text()).toContain('原列')
  expect(wrapper.get('thead').text()).not.toContain('备用子标题')
  expect(ds.getView('Orders', 'sibling')!.getColumn('childCaption')).toBeUndefined()
  expect(JSON.stringify(ds.toJson())).toBe(baseline)
}, 15000)

it('refreshes accepted result column labels in container state without changing view configuration', async () => {
  const ds = DataSet.fromJson({scenarioId: 'SPACE', tables: {Orders: {
    tableName: 'Orders', modelBinding: {modelId: 'MODEL', modelName: 'Orders'},
    columns: [{name: 'rowid', type: 'string', isPrimaryKey: true}], views: {default: {}},
  }}})
  sets.push(ds)
  const view = ds.getView('Orders')!, identity = {scenarioId: 'SPACE', metaName: 'Orders'}
  let label = '原查询标题'
  view.bindQueryExecutor({executeQuery: async () => new DataSpaceQueryContext({identity, resultKind: 'join', scope: 'SCOPE', readScope: () => 'SCOPE',
    columns: [{name: 'childCaption', type: 'string', label}], snapshot: new DataSpaceQueryTable(identity).applyResult({Result: {
      data: {Items: [{rowid: 'ROOT', childCaption: 'caption'}], Count: 1}, primaryKeyField: 'rowid',
    }})})})
  await view.loadFromServer()
  const scope = effectScope(), state = scope.run(() => useDataViewState(shallowRef(view)))!
  try {
    expect(state.columns.value[0]?.label).toBe('原查询标题')
    label = '新查询标题'; await view.loadFromServer()
    expect(view.getColumn('childCaption')?.label).toBe('新查询标题')
    expect(state.columns.value[0]?.label).toBe('新查询标题')
  } finally {scope.stop()}
})
