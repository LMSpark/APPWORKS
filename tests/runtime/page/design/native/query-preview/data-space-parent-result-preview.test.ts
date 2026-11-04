import {describe, expect, it, vi} from 'vitest'
import {config, flushPromises, mount} from '@vue/test-utils'
import {markRaw} from 'vue'
import ElementPlus from 'element-plus'
import VXETable from 'vxe-table'
import {FieldNumber, RendererFilter, RendererTable, Spark} from '@spark-appworks/spark-component'
import DataSpaceQueryPreview from '@/views/features/data-platform/data-set-management/design/views/preview/DataSpaceQueryPreview.vue'
import {dataSpacePageFixture} from '../data-space-page.fixture'
import {DataSet} from '@spark-appworks/spark-data'
import {DataSpaceDesignApi, DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {HttpClientBase, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {LowcodeDataSpaceQueryPreview} from '@/lowcode/data-space/view-design/preview/lowcode-data-space-query-preview'

describe('parent-result preview input ownership', () => {
  it.each(['RootModel', 'ChildModel', 'GrandModel'])('keeps derived views free of independent input cascades when previewing %s', async modelName => {
    const dataSet = DataSet.fromJson({scenarioId: 'SPACE', tables: {
      Root: {tableName: 'Root', modelBinding: {modelId: 'ROOT', modelName: 'RootModel'}, columns: [{name: 'id', type: 'string'}],
        views: {default: {queryConfig: {pagination: 'none', autoQuery: false}}}},
      Child: {tableName: 'Child', modelBinding: {modelId: 'CHILD', modelName: 'ChildModel'}, columns: [{name: 'id', type: 'string'}],
        views: {default: {queryConfig: {pagination: 'none', autoQuery: false, parentResult: {dataViewKey: 'SPACE@RootModel@default', childModelName: 'ChildModel'}}}}},
      Grand: {tableName: 'Grand', modelBinding: {modelId: 'GRAND', modelName: 'GrandModel'}, columns: [{name: 'id', type: 'string'}],
        views: {default: {queryConfig: {pagination: 'none', autoQuery: false, parentResult: {dataViewKey: 'SPACE@ChildModel@default', childModelName: 'GrandModel'}}}}},
    }})
    const preview = new LowcodeDataSpaceQueryPreview(dataSet, modelName, 'default', {assertCurrent() {}, subscribe: () => () => {}})
    try {
      await preview.runtime.load()
      expect(preview.queryView).toBe(dataSet.getView('Root'))
      expect(preview.resultViews.map(view => view.tableName)).toEqual(['Root', 'Child', 'Grand'])
      const table = dataSet.addTable('PreviewInputs', [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'context', type: 'string'}])
      table.resourceType = 'static-data'
      const inputs = table.getOrCreateView('default')
      inputs.replaceRows([{id: 'input', context: '{}'}]); inputs.setCurrentRowById('input')
      preview.bindInputs(inputs, [{sourceField: 'context', target: 'queryContext', format: 'json'}])
      expect(dataSet.getParentCascades('Child', 'default')).toEqual([])
      expect(dataSet.getParentCascades('Grand', 'default')).toEqual([])
      expect(dataSet.getParentCascades('Root', 'default')).toHaveLength(1)
    } finally {preview.dispose()}
  })
})


async function formalPreview() {
  const columns = [{name: 'id', type: 'string'}, {name: 'name', type: 'string'}]
  const ds = DataSet.fromJson({scenarioId: 'SPACE', tables: Object.fromEntries(['Root', 'Child', 'Grand'].map((tableName, index) => [tableName, {
    tableName, modelBinding: {modelId: tableName, modelName: `${tableName  }Model`}, columns,
    views: {default: {autoCurrentFirst: true, queryConfig: index === 0 ? {pagination: 'none', autoQuery: false, outputType: 'Navigation',
      children: [{modelName: 'ChildModel', fields: ['id', 'name'], children: [{modelName: 'GrandModel', fields: ['id', 'name']}]}]}
      : {pagination: 'none', autoQuery: false, parentResult: {dataViewKey: `SPACE@${  index === 1 ? 'Root' : 'Child'  }Model@default`, childModelName: `${tableName  }Model`}}}},
  }]))})
  let calls = 0, fail = false, scope = 'SCOPE'
  class PreviewHttp extends HttpClientBase {
    protected override async executeRequest(_request: RequestConfig): Promise<HttpResponse<unknown>> {
      calls++
      if (fail) throw new Error('root unavailable')
      return {status: 200, statusText: 'OK', headers: {}, data: {Code: 200, Result: {primaryKeyField: 'rowid', allowAdd: false,
        data: {Count: 2, Items: ['first', 'second'].map(name => ({id: 'duplicate', name, ChildModel: [{id: 'duplicate', name: `child-${  name}`,
          GrandModel: [{id: 'duplicate', name: `grand-${  name}`}]}]}))}}}}
    }
  }
  const runtime = new DataSpaceRuntimeApi({http: new PreviewHttp(), readScope: () => ({token: scope, headers: {}})})
  for (const [index, name] of ['Root', 'Child', 'Grand'].entries()) {
    const formal = DataSpaceDesignApi.projectModel({rowid: name, Name: `${name  }Model`, MetaName: `${name  }Table`, Type: '数据库表',
      DbId: 'DB', ShortName: name, PrimaryKeyFields: 'rowid', ...(index ? {PId: `${index === 1 ? 'Root' : 'Child'  }Model`, JoinType: 'LEFT', JoinFilter: 'explicit'} : {})}, [
      {rowid: `${name  }Id`, dataModelId: name, Name: 'rowid', AsName: 'id', FieldType: 'string', IsOutput: 1},
      {rowid: `${name  }Name`, dataModelId: name, Name: 'Name', AsName: 'name', FieldType: 'string', IsOutput: 1},
    ], 'rowid')
    runtime.bindModelView(ds.getView(name)!, formal)
  }
  const preview = new LowcodeDataSpaceQueryPreview(ds, 'GrandModel', 'default', {assertCurrent() {}, subscribe: () => () => {}})
  await preview.runtime.load()
  return {ds, preview, calls: () => calls, fail: () => {fail = true}, changeScope: () => {scope = 'OTHER'}}
}

it('queries the actual root with typed inputs and consumes both derived levels through the original owner', async () => {
  const f = await formalPreview()
  try {
    await f.preview.query({context: {number: 0, enabled: false}})
    const root = f.ds.getView('Root')!, child = f.ds.getView('Child')!, grand = f.ds.getView('Grand')!
    expect(root.queryContext).toEqual({number: 0, enabled: false})
    expect(child.queryContext).toEqual({}); expect(grand.queryContext).toEqual({})
    expect(grand.rows[0]?.['name']).toBe('grand-first'); expect(f.calls()).toBe(1)
    expect(f.preview.snapshot().countReported).toBe(false)
    root.setCurrentRow(root.rows[1]!)
    await child.refresh(); await grand.refresh()
    expect(grand.rows[0]?.['name']).toBe('grand-second'); expect(f.calls()).toBe(1)
    f.fail()
    await expect(f.preview.refresh()).rejects.toThrow('root unavailable')
    expect(child.rows).toEqual([]); expect(grand.rows).toEqual([])
  } finally {f.preview.dispose()}
})

it('keeps queryConfig overrides on the selected target when clearing its parent-result binding', async () => {
  const f = await formalPreview()
  try {
    const root = f.ds.getView('Root')!, before = root.queryConfig
    // Clearing the target makes Grand an independent source; the old root plan must remain untouched.
    await f.preview.query({context: {}, queryConfig: {}})
    expect(root.queryConfig).toEqual(before)
    expect(f.preview.view.queryConfig).toEqual({})
    expect(f.preview.queryView).toBe(f.preview.view)
    expect(f.calls()).toBe(1)
  } finally {f.preview.dispose()}
})


it('uses the root query controls and bound standard tables for an original derived-view preview', async () => {
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
  const f = await formalPreview(), fixture = dataSpacePageFixture(), originalStubs = config.global.stubs
  const session = await fixture.open('SPACE')
  vi.spyOn(session, 'openPreview').mockResolvedValue(f.preview)
  vi.spyOn(session, 'loadPreviewFilterContext').mockResolvedValue({})
  const stubs = {...originalStubs}; delete stubs['el-table']; delete stubs['el-table-column']; config.global.stubs = stubs
  const wrapper = mount(DataSpaceQueryPreview, {props: {session: markRaw(session), modelId: 'Grand', modelName: 'GrandModel',
    tableName: 'Grand', viewId: 'default', filter: {autoQuery: false}}, global: {plugins: [ElementPlus, VXETable, Spark.createPlugin()]}})
  try {
    await flushPromises()
    expect(wrapper.getComponent(RendererFilter).props('dataViewKey')).toBe('SPACE@RootModel@default')
    expect(wrapper.find('[data-action="run-query-preview"]').exists()).toBe(true)
    await wrapper.get('[data-action="run-query-preview"]').trigger('click'); await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    const tables = wrapper.findAllComponents(RendererTable)
    expect(tables.map(table => table.props('dataViewKey'))).toEqual(['SPACE@RootModel@default', 'SPACE@ChildModel@default', 'SPACE@GrandModel@default'])
    expect(wrapper.text()).toContain('未报告总数')
    expect(tables[0]!.get('[data-testid="data-view-meta"]').text()).toContain('总数 2')
    for (const table of tables.slice(1)) {
      expect(table.get('[data-testid="data-view-meta"]').text()).toContain('未报告总数')
      expect(table.get('[data-testid="data-view-meta"]').text()).not.toMatch(/总数 \d/)
    }
    expect(wrapper.findAllComponents(FieldNumber).map(field => field.props('field'))).toEqual(['maxRows'])
    expect(f.preview.view.queryConfig.parentResult?.childModelName).toBe('GrandModel')
    expect(f.calls()).toBe(1)
  } finally {wrapper.unmount(); fixture.dispose(); f.preview.dispose(); config.global.stubs = originalStubs; vi.unstubAllGlobals()}
})
