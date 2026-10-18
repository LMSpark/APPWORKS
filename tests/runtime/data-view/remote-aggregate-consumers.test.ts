import {afterEach, describe, expect, it} from 'vitest'
import {flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {defineComponent, h} from 'vue'
import ElementPlus, {ElTable, ElTableColumn} from 'element-plus'
import {DataSet} from '@spark-appworks/spark-data'
import {DataSpaceDesignApi, DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {HttpClientBase, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {DisplayText, FieldNumber, FieldText, DATA_ROW, DATA_SOURCE, PAGE_RUNTIME, RendererDetail, RendererSection, RendererTable,
  Spark, registerAllRenderers, useSparkComponent} from '@spark-appworks/spark-component'

const wrappers: VueWrapper[] = [], runtimes: PageRuntime[] = [], sets: DataSet[] = []
afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  runtimes.splice(0).forEach(runtime => runtime.dispose())
  sets.splice(0).forEach(set => set.destroy())
})

async function setup(childFormula = false) {
  const formal = DataSpaceDesignApi.projectModel({rowid: 'MODEL', Name: 'Orders', Type: '数据库表', MetaName: 'OrderSource'}, [
    {rowid: 'KEY', dataModelId: 'MODEL', Name: 'rowid', FieldType: 'string', IsOutput: 1, IsPKey: 1},
    {rowid: 'AMOUNT', dataModelId: 'MODEL', Name: 'amount', AsName: 'revenue', FieldType: 'number', IsOutput: 1},
  ], 'rowid')
  class QueryHttp extends HttpClientBase {
    protected override async executeRequest(_config: RequestConfig): Promise<HttpResponse<unknown>> {
      return {status: 200, statusText: 'OK', headers: {}, data: {Code: 200, Result: {
        primaryKeyField: 'rowid', data: {Items: [{rowid: 'ROW', revenue: 3}], Count: 300},
      }}}
    }
  }
  const dataSet = DataSet.fromJson({scenarioId: 'SCENE', tables: {Orders: {tableName: 'Orders',
    modelBinding: {modelId: 'MODEL', modelName: 'Orders'},
    columns: [{name: 'rowid', type: 'string', isPrimaryKey: true}, {name: 'revenue', type: 'number'},
      {name: 'doubleRevenue', type: 'number', computeExpression: 'revenue * 2'},
      ...(childFormula ? [{name: 'childTotal', type: 'number', computeExpression: "$sum('Items', 'amount')"}] : [])],
    views: {default: {autoLoad: false, pageSize: 1, aggregates: childFormula ? {} : {totalRevenue: {type: 'sum', field: 'revenue'}}}},
  }}})
  sets.push(dataSet)
  const view = dataSet.getView('Orders')!
  new DataSpaceRuntimeApi({http: new QueryHttp(), readScope: () => ({token: 'CURRENT', headers: {}})}).bindModelView(view, formal)
  expect((await view.loadFromServer()).success).toBe(true)
  view.setCurrentRow(view.rows[0]!)
  view.setSelectedRows([view.rows[0]!])
  const runtime = new PageRuntime({pageId: 'aggregate-consumers', scenarioIds: ['SCENE'], loadScenario: async () => dataSet})
  await runtime.load(); runtimes.push(runtime)
  return {view, runtime}
}

describe('formal remote aggregate diagnostics in standard consumers', () => {
  it('does not authorize a copied row merely because its primary key matches the computed source', async () => {
    const {view, runtime} = await setup(true)
    const Host = defineComponent({setup() {
      const {sparkProvide} = useSparkComponent({type: 'copied-computed-row'})
      sparkProvide(PAGE_RUNTIME, runtime); sparkProvide(DATA_SOURCE, view)
      sparkProvide(DATA_ROW, {...view.rows[0], doubleRevenue: 999})
      return () => h(FieldNumber, {field: 'doubleRevenue'})
    }})
    const wrapper = mount(Host, {global: {plugins: [ElementPlus, Spark.createPlugin()]}})
    wrappers.push(wrapper); await flushPromises()
    expect(wrapper.text()).not.toContain('999')
    expect(wrapper.text()).not.toContain('6')
  })

  it.each(['table', 'detail', 'display', 'field', 'layout'] as const)(
    'shows the child formula diagnostic without showing zero in %s', async consumer => {
      const {view, runtime} = await setup(true)
      registerAllRenderers()
      const dataViewKey = 'SCENE@Orders@default'
      const Host = defineComponent({setup() {
        useSparkComponent({type: 'child-aggregate-test'}).sparkProvide(PAGE_RUNTIME, runtime)
        return () => {
          if (consumer === 'table') return h(RendererTable, {dataViewKey, showDataViewMeta: false, autoColumns: false,
            children: [{type: 'r-number', props: {field: 'childTotal'}}]})
          if (consumer === 'detail') return h(RendererDetail, {dataViewKey, showDataViewMeta: false, autoColumns: false},
            {default: () => h(FieldNumber, {field: 'childTotal'})})
          if (consumer === 'layout') return h(RendererSection, {dataViewKey},
            {default: () => h(FieldNumber, {field: 'childTotal'})})
          const props = {dataViewKey, dataMember: 'currentRow' as const, dataField: 'childTotal'}
          return consumer === 'field' ? h(FieldNumber, props) : h(DisplayText, props)
        }
      }})
      const wrapper = mount(Host, {global: {plugins: [ElementPlus, Spark.createPlugin()],
        stubs: {'el-table': ElTable, 'el-table-column': ElTableColumn,
          SparkComponentRenderer: false, 'spark-component-renderer': false}}})
      wrappers.push(wrapper); await flushPromises()
      expect(wrapper.text()).toContain('子表聚合公式尚未迁移到服务端')
      expect(view.rows[0]?.['childTotal']).toBeUndefined()
      expect(view.rows[0]?.['doubleRevenue']).toBe(6)
      expect(view.fieldAccess(view.rows[0]!, 'childTotal').read).toBe('invisible')
      view.dataTable!.updateColumn('childTotal', {computeExpression: 'revenue * 4'})
      await flushPromises()
      expect(wrapper.text()).not.toContain('子表聚合公式尚未迁移到服务端')
      expect(view.rows[0]?.['childTotal']).toBe(12)
      expect(wrapper.text()).toContain('12')
      view.dataTable!.updateColumn('childTotal', {computeExpression: 'revenue * 5'})
      await flushPromises()
      expect(wrapper.text()).toContain('15')
    }, 15000)

  it('preserves an explicitly supplied field value instead of reading the unsupported member', async () => {
    const {runtime} = await setup()
    const Host = defineComponent({setup() {
      useSparkComponent({type: 'aggregate-static-test'}).sparkProvide(PAGE_RUNTIME, runtime)
      return () => h(FieldNumber, {dataViewKey: 'SCENE@Orders@default', dataMember: 'aggregateResult',
        dataField: 'totalRevenue', value: 23})
    }})
    const wrapper = mount(Host, {global: {plugins: [ElementPlus, Spark.createPlugin()]}})
    wrappers.push(wrapper); await flushPromises()
    expect(wrapper.text()).toContain('23')
    expect(wrapper.text()).not.toContain('旧汇总尚未迁移到服务端')
  })

  it.each(['table', 'detail', 'selection-detail', 'display', 'field-text', 'field-number', 'layout'] as const)(
    'shows an explicit diagnostic and retains the ordinary list in %s', async consumer => {
      const {view, runtime} = await setup()
      const dataViewKey = 'SCENE@Orders@default'
      registerAllRenderers()
      const Host = defineComponent({setup() {
        useSparkComponent({type: 'aggregate-test'}).sparkProvide(PAGE_RUNTIME, runtime)
        return () => {
          if (consumer === 'table') return h(RendererTable, {dataViewKey, showDataViewMeta: false, children: []})
          if (consumer === 'detail' || consumer === 'selection-detail') return h(RendererDetail, {dataViewKey,
            contextDataMember: consumer === 'detail' ? 'aggregateResult' : 'selectionAggregateResult', autoColumns: false,
            showDataViewMeta: false}, {default: () => h(DisplayText, {field: 'revenue', placeholder: 'NO_SUMMARY'})})
          if (consumer === 'layout') return h(RendererSection, {dataViewKey, dataMember: 'aggregateResult'},
            {default: () => h(DisplayText, {field: 'revenue', placeholder: 'NO_SUMMARY'})})
          const props = {dataViewKey, dataMember: 'aggregateResult' as const, dataField: 'totalRevenue'}
          if (consumer === 'field-text') return h(FieldText, props)
          if (consumer === 'field-number') return h(FieldNumber, props)
          return h(DisplayText, props)
        }
      }})
      const wrapper = mount(Host, {global: {plugins: [ElementPlus, Spark.createPlugin()],
        stubs: {'el-table': ElTable, 'el-table-column': ElTableColumn, SparkComponentRenderer: false, 'spark-component-renderer': false}}})
      wrappers.push(wrapper); await flushPromises()
      expect(wrapper.text()).toContain('旧汇总尚未迁移到服务端')
      expect(view.total).toBe(300)
      expect(view.rows[0]?.['revenue']).toBe(3)
      expect(view.rows[0]?.['doubleRevenue']).toBe(6)
      if (consumer.includes('detail') || consumer === 'layout') expect(wrapper.getComponent(DisplayText).text()).toBe('NO_SUMMARY')
      view.configure({aggregates: {}}); await flushPromises()
      expect(wrapper.text()).not.toContain('旧汇总尚未迁移到服务端')
      view.configure({aggregates: {totalRevenue: {type: 'sum', field: 'revenue'}}}); await flushPromises()
      expect(wrapper.text()).toContain('旧汇总尚未迁移到服务端')
    }, 15000)
})
