import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {flushPromises, mount} from '@vue/test-utils'
import {markRaw} from 'vue'
import ElementPlus from 'element-plus'
import VXETable from 'vxe-table'
import {RendererTable, Spark} from '@spark-appworks/spark-component'
import {DataViewFilter, DataViewFilterCodec, RequestState} from '@spark-appworks/spark-data'
import DataSpaceQueryPreview from '@/views/features/data-platform/data-set-management/design/views/preview/DataSpaceQueryPreview.vue'
import {dataSpacePageFixture} from '../data-space-page.fixture'
import definitionConfig from '../../../../../../config/pages/data-platform/data-space-design/pagedata.json'
import {LowcodeDataSpaceViewFields} from '../../../../../../src/lowcode/data-space/view-design/lowcode-data-space-view-fields'

const fixtures: ReturnType<typeof dataSpacePageFixture>[] = []
const wrappers: ReturnType<typeof mount>[] = []
beforeEach(() => vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}}))
afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  fixtures.splice(0).forEach(fixture => fixture.dispose())
  vi.unstubAllGlobals()
})

function fixture() {
  const current = dataSpacePageFixture({overviewOnly: true, deferDefinition: true,
    allowFieldEdit: true, editableFieldProperties: ['description', 'IsOutput'],
    sourceFields: [
      {rowid: 'F1', dataModelId: 'M1', Name: 'rowid', type: 'dataModel', FieldType: 'string', IsPKey: 1, IsOutput: 1},
      {rowid: 'F2', dataModelId: 'M1', Name: 'note', type: 'dataModel', FieldType: 'string', IsPKey: 0, IsOutput: 1},
      {rowid: 'F3', dataModelId: 'M2', Name: 'rowid', type: 'dataModel', FieldType: 'string', IsPKey: 1, IsOutput: 1},
    ], businessRows: {Orders: [{rowid: 'O1', note: 'saved'}]},
    relationRows: [{rowid: 'OLD', parentModId: 'M2', childModId: 'M1', parentTable: 'CustomerSource', childTable: 'OrderSource', filter: 'broken unrelated relation'}],
  })
  fixtures.push(current)
  return current
}

describe('model preview from the real overview loading state', () => {
  it('uses file-model cascade fields without formal reads and excludes compound keys and computed targets', async () => {
    const f = dataSpacePageFixture({overviewOnly: true, deferDefinition: true}); fixtures.push(f)
    const table = definitionConfig.tables.DataViewDefinition
    const original = JSON.stringify({scenarioId: 'A', schemaVersion: 2, resourceRelations: [], tables: {
      DataViewDefinition: {...table, columns: [...table.columns, {name: 'displayName', type: 'string', computeExpression: "viewId + '!'"}],
        views: {default: {}, compact: {pageSize: 7}}},
    }})
    f.stored.set('A', original)
    const session = await f.open('A')
    await session.loadCascadeFields('DataViewDefinition', 'compact')
    const options = session.metadataDataSet.getTable('DataViewFieldOption')!.rows
    for (const name of ['dataSetId', 'tableName', 'viewId', 'displayName']) {
      expect(options.find(row => row['name'] === name)).toMatchObject({tableName: 'DataViewDefinition', viewId: 'compact', writableTarget: false})
    }
    expect(options.find(row => row['name'] === 'pageSize')).toMatchObject({writableTarget: true})
    expect(f.modelReads).toEqual([]); expect(f.assemblyScopes).toEqual([])
    expect(session.definitionStatus).toBe('unloaded')
    expect(f.stored.get('A')).toBe(original); expect(f.fileWrites).toEqual([])
  })
  it('loads concurrent cascade field catalogues independently while sharing formal model reads', async () => {
    const f = dataSpacePageFixture({overviewOnly: true, deferDefinition: true}); fixtures.push(f)
    const session = await f.open('A')
    await Promise.all([session.loadCascadeFields('OrdersAlias', 'default'), session.loadCascadeFields('OrdersAlias', 'shared'),
      session.loadCascadeFields('CustomersAlias', 'default')])
    expect(f.modelReads.map(read => read.modelId).sort()).toEqual(['M1', 'M2'])
    expect(f.assemblyScopes).toEqual([])
    expect(session.definitionStatus).toBe('unloaded')
    const rows = session.metadataDataSet.getTable('DataViewFieldOption')!.rows
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({tableName: 'OrdersAlias', viewId: 'default', name: 'rowid', writableTarget: false}),
      expect.objectContaining({tableName: 'OrdersAlias', viewId: 'shared', name: 'parentId', writableTarget: true}),
      expect.objectContaining({tableName: 'CustomersAlias', viewId: 'default', name: 'parentId', writableTarget: true}),
    ]))
    expect(session.metadataDataSet.getView('Base_DataModel_Field')!.requestState).not.toBe(RequestState.Loaded)
    expect(f.fileWrites).toEqual([])
  })

  it('rejects a projection changed between catalogue resolution and cascade publication without exposing old choices', async () => {
    const f = dataSpacePageFixture({overviewOnly: true, deferDefinition: true}); fixtures.push(f)
    const session = await f.open('A')
    await session.loadCascadeFields('CustomersAlias', 'default')
    const definitions = session.metadataDataSet.getView('DataViewDefinition')!
    const row = definitions.rows.find(item => item['tableName'] === 'OrdersAlias' && item['viewId'] === 'default')!
    const key = definitions.getPkKey(row)!, options = session.metadataDataSet.getTable('DataViewFieldOption')!
    const unrelated = options.rows.filter(item => item['tableName'] === 'CustomersAlias')
    const project = LowcodeDataSpaceViewFields.project.bind(LowcodeDataSpaceViewFields)
    const projection = vi.spyOn(LowcodeDataSpaceViewFields, 'project').mockImplementationOnce(input => {
      const result = project(input)
      // 用户编辑排在目录返回之后、调用方恢复执行之前；不替换查询或发布实现。
      queueMicrotask(() => definitions.updateEditingValue(key, 'fieldProjection', result.outputProjection!.filter(field => field.resourceField === 'rowid')))
      return result
    })
    try {
      await expect(session.loadCascadeFields('OrdersAlias', 'default')).rejects.toThrow('字段目录读取已过期')
      expect.soft(options.rows.filter(item => item['tableName'] === 'OrdersAlias')).toEqual([])
      expect(options.rows.filter(item => item['tableName'] === 'CustomersAlias')).toEqual(unrelated)
      await session.loadCascadeFields('OrdersAlias', 'default')
      expect(options.rows.filter(item => item['tableName'] === 'OrdersAlias').map(item => item['name'])).toEqual(['rowid'])
      expect(definitions.hasEditingChanges()).toBe(true)
      expect(f.fileWrites).toEqual([])
    } finally {projection.mockRestore()}
  })

  it.each(['scope', 'dispose'] as const)('does not publish late cascade fields after %s invalidates the session', async change => {
    const f = dataSpacePageFixture({overviewOnly: true, deferDefinition: true}); fixtures.push(f)
    const session = await f.open('A'), release = f.holdDefinitionRead()
    const pending = session.loadCascadeFields('OrdersAlias', 'default')
    const result = expect(pending).rejects.toThrow(/STALE|失效|销毁|过期|destroyed|disposed/i)
    if (change === 'scope') f.invalidate(); else session.dispose()
    release(); await result
    if (change === 'scope') expect(session.metadataDataSet.getTable('DataViewFieldOption')!.rows).toEqual([])
    expect(f.fileWrites).toEqual([])
  })
  it('binds a legacy named preview from overview without loading unrelated models or editing the file', async () => {
    const f = dataSpacePageFixture({overviewOnly: true, deferDefinition: true, businessRows: {Orders: [{rowid: 'O1', parentId: ''}]}})
    fixtures.push(f)
    const original = JSON.stringify({scenarioId: 'A', tables: {
      OrdersAlias: {modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {default: {}, shared: {pageSize: 12}}},
      Unavailable: {modelBinding: {modelId: 'DOES_NOT_EXIST', modelName: 'Missing'}, views: {default: {}}},
    }})
    f.stored.set('A', original)
    const session = await f.open('A'), opened = vi.spyOn(session, 'openPreview')
    const wrapper = mount(DataSpaceQueryPreview, {props: {session: markRaw(session), modelId: 'M1', modelName: 'Orders', tableName: 'OrdersAlias', viewId: 'shared'},
      global: {plugins: [ElementPlus, VXETable, Spark.createPlugin()]}})
    wrappers.push(wrapper)
    await flushPromises()
    const preview = await opened.mock.results[0]!.value
    await wrapper.get('[data-action="run-query-preview"]').trigger('click')
    await flushPromises()
    expect(wrapper.getComponent(RendererTable).props('dataViewKey')).toBe('A@Orders@shared')
    expect(preview.view.rows).toMatchObject([{rowid: 'O1'}])
    expect(f.assemblyScopes).toEqual([['OrdersAlias']])
    expect(session.definitionStatus).toBe('unloaded')
    expect(session.metadataDataSet.getView('Base_DataModel_Field')!.requestState).not.toBe(RequestState.Loaded)
    expect(f.stored.get('A')).toBe(original)
    expect(f.fileWrites).toEqual([])
    wrapper.unmount()
    expect(preview.disposed).toBe(true)
  })

  it('rejects a related legacy translation diagnostic before querying business rows', async () => {
    const f = dataSpacePageFixture({overviewOnly: true, deferDefinition: true, relationRows: [{rowid: 'BROKEN',
      parentModId: 'M2', childModId: 'M1', parentTable: 'CustomerSource', childTable: 'OrderSource',
      filter: DataViewFilterCodec.serializeStored(DataViewFilter.condition({field: 'missing', operator: 'eq', value: {Type: 'GetTableField', Field: 'rowid'}}))}]})
    fixtures.push(f)
    const session = await f.open('A'), before = f.requests.length
    await expect(session.openPreview({modelId: 'M1', modelName: 'Orders', tableName: 'OrdersAlias', viewId: 'shared'})).rejects.toThrow(/INCOMPLETE|字段未解析/)
    expect(f.requests.slice(before)).toHaveLength(1)
    expect(f.requests[before]?.data).toMatchObject({Table: [{Name: 'Base_DataModel_Relation'}]})
    expect(f.fileWrites).toEqual([])
    expect(session.definitionStatus).toBe('unloaded')
  })
  it('renders and queries the standard bound preview while an unrelated legacy relation prevents only the function catalogue', async () => {
    const f = fixture(), session = await f.open('A')
    const opened = vi.spyOn(session, 'openModelPreview')
    const wrapper = mount(DataSpaceQueryPreview, {props: {session: markRaw(session), modelId: 'M1', modelName: 'Orders', filter: {autoQuery: false}},
      global: {plugins: [ElementPlus, VXETable, Spark.createPlugin()]}})
    wrappers.push(wrapper)
    await flushPromises()
    const preview = await opened.mock.results[0]!.value
    await wrapper.get('[data-action="run-query-preview"]').trigger('click')
    await flushPromises()
    expect(wrapper.getComponent(RendererTable).props('dataViewKey')).toBe('A@Orders@default')
    expect(preview.view.rows).toMatchObject([{rowid: 'O1', note: 'saved'}])
    expect(session.metadataDataSet.getView('Base_DataModel_Field', 'default')!.requestState).toBe(RequestState.Loaded)
    expect(f.fileWrites).toEqual([])
    wrapper.unmount()
    expect(preview.disposed).toBe(true)
  })

  it.each(['switch', 'clear'])('invalidates a clean preview when its selected field query is %s', async change => {
    const f = fixture(), session = await f.open('A'), fields = await session.loadModelFields('M1')
    const preview = await session.openModelPreview({modelId: 'M1', modelName: 'Orders'})
    try {
      if (change === 'switch') fields.configure({queryContext: {dataSpaceId: 'A', modelId: 'M2'}})
      else fields.clearAll()
      expect(preview.disposed).toBe(true)
      await expect(preview.query({context: {}})).rejects.toThrow(/STALE|DISPOSED|destroyed/i)
      expect(f.fileWrites).toEqual([])
    } finally {preview.dispose()}
  })

  it('queries only the selected formal model without reading complete field or legacy relation directories', async () => {
    const f = fixture(), session = await f.open('A')
    const fields = await session.loadModelFields('M1'), stored = f.stored.get('A')
    const before = f.requests.length
    const preview = await session.openModelPreview({modelId: 'M1', modelName: 'Orders'})
    try {
      await preview.query({context: {}})
      expect(preview.dataViewKey).toBe('A@Orders@default')
      expect(preview.view.rows).toMatchObject([{rowid: 'O1', note: 'saved'}])
      expect(preview.view.fieldAccess(preview.view.rows[0]!, 'rowid').write).toBe('denied')
      expect(f.assemblyScopes).toEqual([['PreviewModel']])
      expect(f.requests.slice(before)).toHaveLength(2)
      expect(fields.rows.map(row => row['dataModelId'])).toEqual(['M1', 'M1'])
      expect(session.metadataDataSet.getView('Base_DataModel_Field', 'default')!.requestState).toBe(RequestState.Loaded)
      expect(session.metadataDataSet.getView('Base_DataModel_Relation')!.requestState).not.toBe(RequestState.Loaded)
      expect(session.definitionStatus).toBe('unloaded')
      expect(f.stored.get('A')).toBe(stored)
      expect(f.fileWrites).toEqual([])
    } finally {preview.dispose()}
  })

  it('keeps selected field drafts and saved request defaults and invalidates the preview when fields change', async () => {
    const f = fixture(); f.setModelValues({OutputType: 'Join'})
    const session = await f.open('A'), fields = await session.loadModelFields('M1')
    fields.updateEditingValue('F1', 'description', '预览编号')
    fields.updateEditingValue('F2', 'IsOutput', 0)
    const preview = await session.openModelPreview({modelId: 'M1', modelName: 'Orders'})
    try {
      expect(preview.view.queryConfig.outputType).toBe('Join')
      expect(preview.view.columns.find(column => column.name === 'rowid')?.label).toBe('预览编号')
      expect(preview.view.columns.some(column => column.name === 'note')).toBe(false)
      fields.updateEditingValue('F1', 'description', '后续修改')
      expect(preview.disposed).toBe(true)
      await expect(preview.query({context: {}})).rejects.toThrow(/STALE|DISPOSED|destroyed/i)
      expect(fields.getEditingPatch('F1')).toEqual({description: '后续修改'})
      expect(fields.getEditingPatch('F2')).toEqual({IsOutput: 0})
      expect(session.metadataDataSet.getView('Base_DataModel')!.hasEditingChanges('M1')).toBe(false)
      expect(f.fileWrites).toEqual([])
    } finally {preview.dispose()}
  })
})
