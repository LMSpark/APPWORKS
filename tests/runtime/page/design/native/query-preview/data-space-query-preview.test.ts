import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {config, DOMWrapper, flushPromises, mount} from '@vue/test-utils'
import {markRaw} from 'vue'
import VXETable from 'vxe-table'
import ElementPlus, {ElCheckbox, ElInputNumber, ElOption, ElRadioGroup, ElSelect, ElTabs} from 'element-plus'
import {FieldCheckbox, FieldJson, FieldNumber, FieldRadio, FieldSelect, FieldText, RendererButton, RendererForm, RendererSection, RendererTable, Spark, JsonTreeEditor, SparkJsonEditor} from '@spark-appworks/spark-component'
import RendererFilter from '../../../../../../packages/spark-component/src/components/containers/zones/RendererFilter.vue'
import {isRecord} from '@spark-appworks/spark-utils'
import {RequestState} from '@spark-appworks/spark-data'
import DataSpaceQueryPreview from '@/views/features/data-platform/data-set-management/design/views/preview/DataSpaceQueryPreview.vue'
import FilterExpressionEditor from '../../../../../../packages/spark-component/src/components/containers/filter/expression/FilterExpressionEditor/FilterExpressionEditor.vue'
import FilterValueFunctionDialog from '../../../../../../packages/spark-component/src/components/containers/filter/value/FilterValueFunctionDialog/FilterValueFunctionDialog.vue'
import {dataSpacePageFixture} from '../data-space-page.fixture'

const fixtures: ReturnType<typeof dataSpacePageFixture>[] = []
const wrappers: ReturnType<typeof mount>[] = []
const originalStubs = config.global.stubs
beforeEach(() => vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}}))
afterEach(() => {wrappers.splice(0).forEach(w => w.unmount()); fixtures.splice(0).forEach(f => f.dispose()); config.global.stubs = originalStubs; vi.unstubAllGlobals()})
function fixture() {
  const f = dataSpacePageFixture({businessRows: {Orders: [1, 2, 3].map(n => ({rowid: `R${n}`, parentId: ''}))}})
  fixtures.push(f)
  return f
}
function queries(f: ReturnType<typeof dataSpacePageFixture>) {
  return f.requests.filter(r => isRecord(r.data) && Array.isArray(r.data['Table']) && isRecord(r.data['Table'][0]) && r.data['Table'][0]['Name'] === 'Orders')
}

describe('native complete query preview', () => {
  it.each([false, true])('uses query columns in preview controls and rejects invalid inputs before resetting results (named=%s)', async named => {
    const f = dataSpacePageFixture({formalProjection: true, deferDefinition: true, sourceFields: [
      {rowid: 'F1', dataModelId: 'M1', Name: 'rowid', type: 'dataModel', FieldType: 'string', IsOutput: 1, IsPKey: 1},
      {rowid: 'F2', dataModelId: 'M1', Name: 'parentId', type: 'dataModel', FieldType: 'string', IsOutput: 1, IsPKey: 0},
      {rowid: 'F3', dataModelId: 'M1', Name: 'internal', AsName: 'internalAlias', type: 'dataModel', FieldType: 'string', IsOutput: 0, IsPKey: 0},
    ], businessRows: {Orders: [{rowid: 'R1', parentId: ''}]}})
    fixtures.push(f); f.setModelValues({Type: '数据库表'})
    const session = await f.open('A'), opened = vi.spyOn(session, named ? 'openPreview' : 'openModelPreview')
    const w = mount(DataSpaceQueryPreview, {props: {session: markRaw(session), modelId: 'M1', modelName: 'Orders',
      ...(named ? {tableName: 'OrdersAlias', viewId: 'shared'} : {}), filter: {autoQuery: false}},
      global: {plugins: [ElementPlus, VXETable, Spark.createPlugin()]}})
    wrappers.push(w); await flushPromises()
    const preview: Awaited<ReturnType<typeof session.openPreview>> = await opened.mock.results[0]!.value
    const candidates = Object.values(preview.view.dataSet!.tables).find(table => table.tableName.startsWith('PreviewInputs_') && table.tableName.endsWith('_Fields'))!
    expect.soft(candidates.rows.map(row => row['name'])).toEqual(['rowid', 'parentId'])
    expect.soft(w.getComponent(RendererFilter).props('filterFunctionContext')?.tables?.find(table => table.name === 'Orders')?.fields
      ?.map(field => field.name)).toEqual(['rowid', 'parentId'])
    await preview.query({context: {customer: 'original'}})
    const rows = preview.view.rows, configuration = preview.view.queryConfig, context = preview.view.queryContext, count = queries(f).length
    await expect(preview.query({context: {customer: 'changed'}, queryConfig: {fields: ['internalAlias']}})).rejects.toThrow()
    expect(preview.view.rows).toBe(rows); expect(preview.view.queryConfig).toEqual(configuration)
    expect(preview.view.queryContext).toEqual(context); expect(preview.view.requestState).toBe(RequestState.Loaded)
    expect(queries(f)).toHaveLength(count); expect(f.fileWrites).toEqual([])
    expect(preview.view.dataTable!.columns.map(column => column.name)).toContain('internalAlias')
  })

  it.each([false, true])('consumes saved autoSelectFirst in a keyless named preview (%s)', async autoSelectFirst => {
    const f = dataSpacePageFixture({formalProjection: true, formalPrimaryKey: '',
      sourceFields: ['val', 'txt'].map((Name, index) => ({rowid: `F${index}`, dataModelId: 'M1', Name,
        type: 'dataModel', FieldType: 'string', IsPKey: 0, IsOutput: 1})),
      businessRows: {Orders: [{val: 'A', txt: 'same'}, {val: 'B', txt: 'same'}]}})
    fixtures.push(f); f.setModelValues({Type: '字典'})
    f.stored.set('A', JSON.stringify({scenarioId: 'A', schemaVersion: 2, resourceRelations: [], tables: {
      OrdersAlias: {modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {default: {}, first: {autoSelectFirst}}},
    }}))
    const session = await f.open('A'), opened = vi.spyOn(session, 'openPreview')
    const stubs = {...config.global.stubs}
    for (const name of ['el-table', 'el-table-column']) delete stubs[name]
    config.global.stubs = stubs
    const w = mount(DataSpaceQueryPreview, {props: {session: markRaw(session), modelId: 'M1', modelName: 'Orders',
      tableName: 'OrdersAlias', viewId: 'first', filter: {autoQuery: false}},
      global: {plugins: [ElementPlus, VXETable, Spark.createPlugin()]}})
    wrappers.push(w); await flushPromises()
    await w.get('[data-action="run-query-preview"]').trigger('click'); await flushPromises()
    const preview: Awaited<ReturnType<typeof session.openPreview>> = await opened.mock.results[0]!.value
    expect(preview.view.autoSelectFirst).toBe(autoSelectFirst)
    expect(preview.view.primaryKey).toBe('')
    expect(preview.view.rows).toHaveLength(2)
    expect(preview.view.selectedRows).toHaveLength(autoSelectFirst ? 1 : 0)
    const table = w.getComponent(RendererTable)
    expect(table.get('tbody input[type="checkbox"]').element).toHaveProperty('checked', autoSelectFirst)
    expect(table.get('tbody tr').classes().includes('spark-selection-row')).toBe(autoSelectFirst)
    expect(f.fileWrites).toEqual([])
    expect(preview.view.hasEditingChanges()).toBe(false)
  })

  it.each([false, true])('keeps real preview selection aligned with its configured DataView (named=%s)', async named => {
    const f = dataSpacePageFixture({businessRows: {Orders: [1, 2, 3].map(n => ({rowid: `R${n}`, parentId: null}))}})
    fixtures.push(f)
    const session = await f.open('A')
    const opened = vi.spyOn(session, named ? 'openPreview' : 'openModelPreview')
    const stubs = {...config.global.stubs}
    for (const name of ['el-table', 'el-table-column']) delete stubs[name]
    config.global.stubs = stubs
    const w = mount(DataSpaceQueryPreview, {props: {session: markRaw(session), modelId: 'M1', modelName: 'Orders',
      ...(named ? {tableName: 'OrdersAlias', viewId: 'shared'} : {}), filter: {autoQuery: false}},
      global: {plugins: [ElementPlus, VXETable, Spark.createPlugin()]}})
    wrappers.push(w); await flushPromises()
    await w.get('[data-action="run-query-preview"]').trigger('click'); await flushPromises()
    const preview: Awaited<ReturnType<typeof session.openModelPreview>> = await opened.mock.results[0]!.value
    const table = w.getComponent(RendererTable), row = preview.view.rows[0]!
    expect(preview.view.isMultiSelect).toBe(true)
    expect(preview.view.rows).toHaveLength(3)
    expect(table.findAll('tbody tr')).toHaveLength(3)
    await table.get('tbody input[type="checkbox"]').setValue(true); await flushPromises()
    expect(table.get('tbody input[type="checkbox"]').element).toHaveProperty('checked', true)
    expect(preview.view.selectedRows).toEqual([row])
    expect(table.get('tbody tr').classes()).toContain('spark-selection-row')
    expect(table.text()).toContain('已选 1')
    preview.view.clearSelectedRows(); await flushPromises()
    expect(table.get('tbody input[type="checkbox"]').element).toHaveProperty('checked', false)
    expect(table.get('tbody tr').classes()).not.toContain('spark-selection-row')
    expect(f.fileWrites).toEqual([])
    expect(preview.view.hasEditingChanges()).toBe(false)
  })

  it.each([false, true].flatMap(named => [false, true].map(queried => ({named, queried}))))(
    'rejects a directly bound preview query after application scope changes (named=$named, queried=$queried)', async ({named, queried}) => {
    const f = fixture(), session = await f.open('A')
    const preview = named
      ? await session.openPreview({modelId: 'M1', modelName: 'Orders', tableName: 'OrdersAlias', viewId: 'shared'})
      : await session.openModelPreview({modelId: 'M1', modelName: 'Orders'})
    try {
      const bound = preview.view
      if (queried) await bound.refresh()
      const before = queries(f).length
      f.invalidate()
      await bound.refresh()
      expect.soft(bound.requestState).toBe(RequestState.Failed)
      expect.soft(bound.loadingError?.message).toContain('SCOPE_STALE')
      expect.soft(queries(f)).toHaveLength(before)
      expect(f.fileWrites).toEqual([])
    } finally {preview.dispose()}
  })

  it.each([false, true].flatMap(named => ['view-draft', 'session-close'].map(change => ({named, change}))))(
    'removes results and query controls after $change (named=$named)', async ({named, change}) => {
    const f = fixture(), session = await f.open('A')
    const opened = vi.spyOn(session, named ? 'openPreview' : 'openModelPreview')
    const w = mount(DataSpaceQueryPreview, {props: {session: markRaw(session), modelId: 'M1', modelName: 'Orders',
      ...(named ? {tableName: 'OrdersAlias', viewId: 'shared'} : {}), filter: {autoQuery: false}},
    global: {plugins: [ElementPlus, VXETable, Spark.createPlugin()]}})
    wrappers.push(w); await flushPromises()
    await w.get('[data-action="run-query-preview"]').trigger('click'); await flushPromises()
    const preview: Awaited<ReturnType<typeof session.openPreview>> = await opened.mock.results[0]?.value
    expect(w.findComponent(RendererTable).exists()).toBe(true)
    expect(preview.view.rows.map(row => row['rowid'])).toEqual(['R1', 'R2', 'R3'])
    expect(w.text()).toContain('状态 Loaded')
    const before = queries(f).length
    if (change === 'session-close') session.dispose()
    else {
      const definitions = session.metadataDataSet.getView('DataViewDefinition')!
      const row = definitions.rows.find(item => item['tableName'] === 'OrdersAlias' && item['viewId'] === 'shared')!
      definitions.updateEditingValue(definitions.getPkKey(row)!, 'pageSize', 41)
    }
    await flushPromises()
    expect(preview.disposed).toBe(true)
    expect.soft(w.findComponent(RendererTable).exists()).toBe(false)
    expect.soft(w.find('[data-action="run-query-preview"]').exists()).toBe(false)
    expect.soft(w.text()).not.toContain('状态 Loaded')
    expect.soft(w.findAll('[role="alert"]').map(alert => alert.text()).join('')).toMatch(/预览.*关闭|配置.*变化/)
    expect(queries(f)).toHaveLength(before); expect(f.fileWrites).toEqual([])
    await w.get('[data-action="close-query-preview"]').trigger('click')
    expect(w.emitted('close')).toHaveLength(1)
  })

  it('shows expiration while the preview function directory is pending and rejects its late publication', async () => {
    const f = fixture(), session = await f.open('A'), opened = vi.spyOn(session, 'openModelPreview')
    let release = () => {}
    vi.spyOn(session, 'loadPreviewFilterContext').mockReturnValueOnce(new Promise(resolve => {
      release = () => resolve({tables: [{name: 'Orders', fields: []}]})
    }))
    const w = mount(DataSpaceQueryPreview, {props: {session: markRaw(session), modelId: 'M1', modelName: 'Orders'},
      global: {plugins: [ElementPlus, VXETable, Spark.createPlugin()]}})
    wrappers.push(w); await flushPromises()
    const preview: Awaited<ReturnType<typeof session.openModelPreview>> = await opened.mock.results[0]?.value
    expect(w.text()).toContain('正在装配预览')
    session.dispose(); await flushPromises()
    expect(preview.disposed).toBe(true)
    expect(w.text()).not.toContain('正在装配预览')
    expect(w.get('[role="alert"]').text()).toContain('预览已关闭或配置已变化')
    release(); await flushPromises()
    expect(w.find('[data-action="run-query-preview"]').exists()).toBe(false)
    expect(w.findComponent(RendererFilter).exists()).toBe(false)
    expect(queries(f)).toHaveLength(0); expect(f.fileWrites).toEqual([])
  })

  it.each([false, true])('keeps displayed page size aligned after another input created a draft (named=%s)', async named => {
    const f = fixture(), session = await f.open('A')
    const opened = vi.spyOn(session, named ? 'openPreview' : 'openModelPreview')
    const w = mount(DataSpaceQueryPreview, {props: {session: markRaw(session), modelId: 'M1', modelName: 'Orders',
      ...(named ? {tableName: 'OrdersAlias', viewId: 'default'} : {})}, global: {plugins: [ElementPlus, VXETable, Spark.createPlugin()]}})
    wrappers.push(w); await flushPromises()
    const preview = await opened.mock.results[0]?.value
    w.findAllComponents(FieldRadio).find(c => c.props('field') === 'outputType')!.getComponent(ElRadioGroup).vm.$emit('update:modelValue', 'Join')
    await flushPromises()
    for (const size of [1, 2]) {
      const number = w.findAllComponents(FieldNumber).find(c => c.props('field') === 'pageSize')!.getComponent(ElInputNumber)
      await number.get('input').setValue(String(size)); await number.get('input').trigger('blur'); await flushPromises()
      expect(preview!.view.pageSize).toBe(size)
      expect(number.props('modelValue')).toBe(size)
      expect(number.get('input').element).toHaveProperty('value', String(size))
      expect(queries(f).at(-1)?.data).toMatchObject({Table: [{OutputType: 'Join', ChildTables: []}], PageParam: {index: 1, size}})
    }
    expect(f.fileWrites).toEqual([])
  })

  it.each([false, true])('edits preview parameter functions through the standard filter without saving definitions (named=%s)', async named => {
    const f = fixture(), filter = {field: 'rowid', operator: 'eq', value: 'R1'}
    f.setModelValues({Filter: JSON.stringify({Type: 'cond', Field: 'rowid', Operator: 'equal', ValueFun: {Type: 'GetConstValue', Value: 'R1'}})})
    f.stored.set('A', JSON.stringify({scenarioId: 'A', schemaVersion: 2, resourceRelations: [], tables: {
      OrdersAlias: {modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {default: {}, shared: {filterExpression: filter}}},
    }}))
    const session = await f.open('A'), stored = f.stored.get('A')
    const opened = vi.spyOn(session, named ? 'openPreview' : 'openModelPreview')
    const w = mount(DataSpaceQueryPreview, {props: {session: markRaw(session), modelId: 'M1', modelName: 'Orders',
      ...(named ? {tableName: 'OrdersAlias', viewId: 'shared'} : {}), filter: {autoQuery: false}},
    global: {plugins: [ElementPlus, VXETable, Spark.createPlugin()]}})
    wrappers.push(w); await flushPromises()
    expect(w.find('[role="alert"]').exists(), w.text()).toBe(false)
    const renderer = w.getComponent(RendererFilter), editor = renderer.getComponent(FilterExpressionEditor)
    expect(renderer.props('filterFunctionContext')).toMatchObject({
      inputParams: [{label: '客户', value: 'customer'}], tables: [{name: 'Orders', fields: expect.arrayContaining([{name: 'rowid', label: 'rowid'}])}],
    })
    if (!named) editor.vm.$emit('update:modelValue', filter)
    await flushPromises()
    await editor.get('[aria-label="使用服务端值函数"]').trigger('click'); await flushPromises()
    const dialog = editor.getComponent(FilterValueFunctionDialog)
    dialog.getComponent(ElTabs).vm.$emit('update:modelValue', 'GetRefData'); await flushPromises()
    expect(dialog.findAllComponents(ElOption).map(option => option.props('value'))).toContain('Orders')
    dialog.getComponent(ElTabs).vm.$emit('update:modelValue', 'GetInputParam'); await flushPromises()
    expect(dialog.findAllComponents(ElOption).map(option => option.props('value'))).toContain('customer')
    dialog.getComponent(ElSelect).vm.$emit('update:modelValue', 'customer'); await flushPromises()
    await new DOMWrapper(document.body).get('[data-function-confirm]').trigger('click'); await flushPromises()
    await editor.get('[data-action="apply"]').trigger('click'); await flushPromises()
    const preview: Awaited<ReturnType<typeof session.openPreview>> = await opened.mock.results[0]?.value
    const expected = {field: 'rowid', operator: 'eq', value: {Type: 'GetInputParam', ParamName: 'customer'}}
    expect(preview.view.filterExpression).toEqual(expected)
    const input = w.findAllComponents(FieldText).find(field => field.props('field') === 'context')!
    await input.get('input').setValue('{"customer":"R2"}'); await flushPromises()
    await w.get('[data-action="run-query-preview"]').trigger('click'); await flushPromises()
    expect(preview.view.rows.map(row => row['rowid'])).toEqual(['R2'])
    await editor.findAll('button').find(button => button.text() === '改为常量')!.trigger('click'); await flushPromises()
    await editor.get('[data-action="cancel"]').trigger('click'); await flushPromises()
    expect(preview.view.filterExpression).toEqual(expected)
    expect(f.stored.get('A')).toBe(stored); expect(f.fileWrites).toEqual([])
    w.unmount(); expect(preview.disposed).toBe(true)
  })

  it('keeps preview constants and declared parameters available when the function model directory fails', async () => {
    const f = fixture(), session = await f.open('A'), stored = f.stored.get('A')
    vi.spyOn(session, 'loadPreviewFilterContext').mockRejectedValueOnce(new Error('上游字段不可读取'))
    const w = mount(DataSpaceQueryPreview, {props: {session: markRaw(session), modelId: 'M1', modelName: 'Orders', filter: {autoQuery: false}},
      global: {plugins: [ElementPlus, VXETable, Spark.createPlugin()]}})
    wrappers.push(w); await flushPromises()
    expect(w.get('[role="alert"]').text()).toBe('上游字段不可读取')
    expect(w.getComponent(RendererFilter).props('filterFunctionContext')).toMatchObject({inputParams: [{label: '客户', value: 'customer'}]})
    await w.get('[data-action="run-query-preview"]').trigger('click'); await flushPromises()
    expect(queries(f)).toHaveLength(1); expect(f.stored.get('A')).toBe(stored); expect(f.fileWrites).toEqual([])
  })

  it('disposes a preview closed while its function directory is pending without publishing late fields', async () => {
    const f = fixture(), session = await f.open('A'), opened = vi.spyOn(session, 'openModelPreview')
    let release = () => {}
    vi.spyOn(session, 'loadPreviewFilterContext').mockReturnValueOnce(new Promise(resolve => {release = () => resolve({tables: [{name: 'Orders', fields: []}]})}))
    const w = mount(DataSpaceQueryPreview, {props: {session: markRaw(session), modelId: 'M1', modelName: 'Orders'},
      global: {plugins: [ElementPlus, VXETable, Spark.createPlugin()]}})
    wrappers.push(w); await flushPromises()
    const preview: Awaited<ReturnType<typeof session.openModelPreview>> = await opened.mock.results[0]?.value
    expect(w.findComponent(RendererFilter).exists()).toBe(false)
    w.unmount(); release(); await flushPromises()
    expect(preview.disposed).toBe(true); expect(queries(f)).toHaveLength(0); expect(f.fileWrites).toEqual([])
  })

  it('opens named views from saved field outputs without rebuilding the invalidated design projection', async () => {
    const f = dataSpacePageFixture({allowFieldEdit: true, editableFieldProperties: ['IsOutput'], sourceFields: [
      {rowid: 'F1', dataModelId: 'M1', Name: 'rowid', type: 'dataModel', FieldType: 'string', IsPKey: 1, IsOutput: 1},
      {rowid: 'F2', dataModelId: 'M1', Name: 'parentId', type: 'dataModel', FieldType: 'string', IsPKey: 0, IsOutput: 0},
    ], businessRows: {Orders: [{rowid: 'R1', parentId: 'P1'}, {rowid: 'R2', parentId: 'P2'}]}}); fixtures.push(f)
    const views = {default: {filterExpression: {field: 'rowid', operator: 'eq', value: 'R1'}},
      shared: {filterExpression: {field: 'rowid', operator: 'eq', value: 'R2'}}}
    f.stored.set('A', JSON.stringify({scenarioId: 'A', schemaVersion: 2, resourceRelations: [], tables: {
      OrdersAlias: {modelBinding: {modelId: 'M1', modelName: 'Orders'}, views},
    }}))
    const session = await f.open('A'), old = session.definitionDataSet!, fields = await session.loadModelFields('M1')
    const stored = f.stored.get('A'), reload = vi.spyOn(session, 'loadDefinition')
    fields.updateEditingValue('F2', 'IsOutput', 1)
    await session.getFieldEdit('F2', 'modelFields').save()
    expect(fields.rows.find(row => row['rowid'] === 'F2')).toMatchObject({IsOutput: 1})
    expect(old.destroyed).toBe(true)
    expect(() => session.definitionDataSet).toThrow('定义投影已失效')
    const opened = vi.spyOn(session, 'openPreview')
    const w = mount(DataSpaceQueryPreview, {props: {session: markRaw(session), modelId: 'M1', modelName: 'Orders',
      tableName: 'OrdersAlias', viewId: 'shared'}, global: {plugins: [ElementPlus, VXETable, Spark.createPlugin()]}})
    wrappers.push(w); await flushPromises()
    expect(w.find('[role="alert"]').exists(), w.text()).toBe(false)
    await w.get('[data-action="run-query-preview"]').trigger('click'); await flushPromises()
    const preview: Awaited<ReturnType<typeof session.openPreview>> = await opened.mock.results[0]?.value
    expect(preview.view.rows).toMatchObject([{rowid: 'R2', parentId: 'P2'}])
    expect(preview.view.rows).toHaveLength(1)
    expect(preview.view.columns.map(column => column.name)).toContain('parentId')
    const other = await session.openPreview({modelId: 'M1', modelName: 'Orders', tableName: 'OrdersAlias', viewId: 'default'})
    await other.refresh()
    expect(other.view.rows).toMatchObject([{rowid: 'R1', parentId: 'P1'}])
    expect(preview.view.rows).toMatchObject([{rowid: 'R2', parentId: 'P2'}])
    expect(reload).not.toHaveBeenCalled(); expect(f.stored.get('A')).toBe(stored); expect(f.fileWrites).toEqual([])
    const before = queries(f).length
    fields.updateEditingValue('F2', 'IsOutput', 0)
    await expect(preview.refresh()).rejects.toThrow()
    await expect(session.openPreview({modelId: 'M1', modelName: 'Orders', tableName: 'OrdersAlias', viewId: 'default'})).rejects.toThrow()
    expect(queries(f)).toHaveLength(before)
    fields.discardEditingRows(); other.dispose()
    const fresh = await f.open('A')
    expect(fresh.definitionDataSet!.getView('OrdersAlias', 'shared')!.filterExpression).toEqual(views.shared.filterExpression)
    expect(fresh.definitionDataSet!.getView('OrdersAlias', 'default')!.columns.map(column => column.name)).toContain('parentId')
  })

  it.each((['named', 'model'] as const).flatMap(kind => (['view-draft', 'session-close'] as const).map(change => ({kind, change}))))(
    'releases the bound $kind-preview DataView after $change invalidates its owner', async ({kind, change}) => {
    const f = dataSpacePageFixture({overviewOnly: true, deferDefinition: true,
      businessRows: {Orders: [{rowid: 'R1', parentId: ''}]}}); fixtures.push(f)
    const session = await f.open('A')
    if (kind === 'model') await session.loadModelFields('M1')
    const preview = kind === 'named'
      ? await session.openPreview({modelId: 'M1', modelName: 'Orders', tableName: 'OrdersAlias', viewId: 'shared'})
      : await session.openModelPreview({modelId: 'M1', modelName: 'Orders'})
    try {
      await preview.refresh()
      const bound = preview.view, before = queries(f).length
      const expired = vi.fn(), removed = vi.fn()
      preview.onDispose(expired)
      preview.onDispose(removed)()
      if (change === 'session-close') session.dispose()
      else {
        const definitions = session.metadataDataSet.getView('DataViewDefinition')!
        const row = definitions.rows.find(item => item['tableName'] === 'OrdersAlias' && item['viewId'] === 'shared')!
        definitions.updateEditingValue(definitions.getPkKey(row)!, 'pageSize', 41)
      }
      expect.soft(preview.disposed).toBe(true)
      expect.soft(bound.destroyed).toBe(true)
      const result = await bound.refresh().then(() => null, cause => cause)
      expect.soft(result).toBeInstanceOf(Error)
      expect.soft(queries(f)).toHaveLength(before)
      preview.dispose()
      expect(expired).toHaveBeenCalledTimes(1); expect(removed).not.toHaveBeenCalled()
      const late = vi.fn()
      preview.onDispose(late)()
      expect(late).toHaveBeenCalledTimes(1)
      expect(f.fileWrites).toEqual([])
    } finally {preview.dispose()}
  })

  it('opens a deferred named preview without querying unloaded metadata directories and rejects a changed scope', async () => {
    const f = dataSpacePageFixture({overviewOnly: true, deferDefinition: true,
      businessRows: {Orders: [{rowid: 'R1', parentId: ''}]}}); fixtures.push(f)
    const session = await f.open('A'), reload = vi.spyOn(session, 'loadDefinition')
    const directories = ['Base_DataModel_Field', 'Base_DataModel_Relation'].map(name => session.metadataDataSet.getView(name)!)
    expect(directories.map(view => view.requestState)).toEqual([RequestState.Idle, RequestState.Idle])
    const preview = await session.openPreview({modelId: 'M1', modelName: 'Orders', tableName: 'OrdersAlias', viewId: 'shared'})
    await preview.refresh()
    expect(preview.view.rows).toHaveLength(1)
    expect(directories.map(view => view.requestState)).toEqual([RequestState.Idle, RequestState.Idle])
    expect(reload).not.toHaveBeenCalled()
    const before = queries(f).length
    f.invalidate()
    await expect(preview.refresh()).rejects.toThrow('SCOPE_STALE')
    expect(queries(f)).toHaveLength(before); expect(f.fileWrites).toEqual([])
    preview.dispose()
  })

  it('uses a named direct view parameter catalogue and retains saved defaults until a typed override is supplied', async () => {
    const f = dataSpacePageFixture({sourceInput:true,businessRows:{Orders:[{rowid:'R1',parentId:''}]}}); fixtures.push(f)
    f.stored.set('A',JSON.stringify({scenarioId:'A',tables:{OrdersAlias:{modelBinding:{modelId:'M1',modelName:'Orders'},views:{default:{},shared:{queryConfig:{sourceInputMode:'direct',autoQuery:false},queryContext:{customerArg:false,retained:0}}}}}}))
    const session=await f.open('A'), opened=vi.spyOn(session,'openPreview'), before=f.stored.get('A'), mapping=f.sourceValue()
    const stubs={...config.global.stubs}; for(const name of ['el-table','el-table-column']) delete stubs[name]; config.global.stubs=stubs
    const w=mount(DataSpaceQueryPreview,{props:{session:markRaw(session),modelId:'M1',modelName:'Orders',tableName:'OrdersAlias',viewId:'shared',filter:{autoQuery:false}},global:{plugins:[ElementPlus,VXETable,Spark.createPlugin()]}})
    wrappers.push(w);await flushPromises()
    expect(w.find('[role="alert"]').exists(),w.text()).toBe(false)
    const input=w.get('[data-json-property="customerArg"]')
    expect(w.find('[data-json-property="customer"]').exists()).toBe(false)
    expect(w.findComponent(RendererFilter).exists()).toBe(true)
    await w.get('[data-action="run-query-preview"]').trigger('click');await flushPromises()
    const preview:Awaited<ReturnType<typeof session.openPreview>>=await opened.mock.results[0]?.value
    expect(preview.view.queryContext).toMatchObject({customerArg:false,retained:0})
    await input.setValue('[0,false]');await flushPromises()
    await w.get('[data-action="run-query-preview"]').trigger('click');await flushPromises()
    await preview.view.setPage(2)
    expect(queries(f).at(-1)?.data).toMatchObject({Table:[{inputParams:expect.arrayContaining([{Name:'customerArg',Value:[0,false]},{Name:'retained',Value:0}])}]})
    expect(preview.view.queryConfig.sourceInputMode).toBe('direct');expect(f.stored.get('A')).toBe(before);expect(f.sourceValue()).toBe(mapping);expect(f.fileWrites).toHaveLength(0)
  })
  it('edits preview requests through the bound DataView without creating model request drafts',async()=>{
    const f=fixture(),session=await f.open('A'),models=session.metadataDataSet.getView('Base_DataModel')!
    const before=f.stored.get('A'),owner=session.getModelEdit('M1')
    const opened=vi.spyOn(session,'openModelPreview')
    const w=mount(DataSpaceQueryPreview,{props:{session:markRaw(session),modelId:'M1',modelName:'Orders',filter:{autoQuery:false}},global:{plugins:[ElementPlus,VXETable]}})
    wrappers.push(w);await flushPromises()
    expect(w.find('[role="alert"]').exists(),w.text()).toBe(false)
    const preview:Awaited<ReturnType<typeof session.openModelPreview>>=await opened.mock.results[0]?.value
    w.findAllComponents(FieldRadio).find(c => c.props('field') === 'outputType')!.getComponent(ElRadioGroup).vm.$emit('update:modelValue', 'Join')
    await flushPromises()
    await w.get('[data-action="run-query-preview"]').trigger('click');await flushPromises()
    await preview.view.executeFilter({field:'rowid',operator:'eq',value:'R2'})
    expect(preview.view.rows.map(row=>row['rowid'])).toEqual(['R2'])
    expect(queries(f).at(-1)?.data).toMatchObject({Table:[{OutputType:'Join',Filter:{ValueFun:{Value:'R2'}}}]})
    await preview.view.setPage(2)
    expect(queries(f).at(-1)?.data).toMatchObject({PageParam:{index:2},Table:[{OutputType:'Join',Filter:{ValueFun:{Value:'R2'}}}]})
    preview.dispose()
    expect(models.hasEditingChanges('M1')).toBe(false)
    expect(models.rows.find(row=>row['rowid']==='M1')?.['OutputType']).not.toBe('Join')
    expect(f.stored.get('A')).toBe(before);expect(f.fileWrites).toEqual([])
    const again=await session.openModelPreview({modelId:'M1',modelName:'Orders'})
    expect(owner.readPreview(again.view)).toMatchObject({outputType:'Table',filterExpression:undefined})
    again.dispose()
  })
  it('disposes a preview when model definition edits begin so direct DataView queries cannot reuse it',async()=>{
    const f=fixture(),session=await f.open('A'),owner=session.getModelEdit('M1')
    const preview=await session.openModelPreview({modelId:'M1',modelName:'Orders'}),view=preview.view
    owner.stage('description','模型修改')
    expect(preview.disposed).toBe(true);expect(view.destroyed).toBe(true)
    expect(queries(f)).toHaveLength(0)
  })
  it.each([
    ['OutputType', 'Join'],
    ['Filter', JSON.stringify({Type:'cond',Field:'rowid',Operator:'equal',ValueFun:{Type:'GetConstValue',Value:'R2'}})],
  ] as const)('invalidates the readonly saved request snapshot when %s changes', async (field, value) => {
    const f = fixture(), session = await f.open('A')
    const preview = await session.openModelPreview({modelId: 'M1', modelName: 'Orders'})
    const previewView = preview.view
    const models = session.metadataDataSet.getView('Base_DataModel')!
    models.replaceRows(models.rows.map(row => row['rowid'] === 'M1' ? {...row, [field]: value} : row))
    await flushPromises()
    expect(preview.disposed).toBe(true)
    expect(previewView.destroyed).toBe(true)
    await expect(preview.query({context: {}})).rejects.toThrow(/STALE|DISPOSED|destroyed/i)
    expect(queries(f)).toHaveLength(0)
    expect(models.hasEditingChanges()).toBe(false)
    expect(f.fileWrites).toHaveLength(0)
  })
  it('rejects model changes during asynchronous assembly and preserves the newest model input',async()=>{
    const f=fixture(),session=await f.open('A'),owner=session.getModelEdit('M1')
    const pending=session.openModelPreview({modelId:'M1',modelName:'Orders'})
    owner.stage('description','模型修改')
    await expect(pending).rejects.toThrow('未保存修改')
    expect(session.metadataDataSet.getView('Base_DataModel')!.getEditingRow('M1')).toMatchObject({description:'模型修改'})
    expect(session.metadataDataSet.getView('Base_DataModel')!.hasEditingChanges('M1')).toBe(true)
    expect(queries(f)).toHaveLength(0)
  })
  it('initializes saved tree inputs and keeps query permissions separate from definition write permissions',async()=>{
    const f=dataSpacePageFixture({sourceFields:[
      {rowid:'K',dataModelId:'M1',Name:'rowid',type:'dataModel',FieldType:'string',IsPKey:1,IsOutput:1},
      {rowid:'P',dataModelId:'M1',Name:'parentId',type:'dataModel',FieldType:'string',IsOutput:1},
    ],businessRows:{Orders:[{rowid:'R1',parentId:'DRAFT_ROOT'}]}});fixtures.push(f)
    f.setModelValues({OutputType:'SelfRefData',parentField:'parentId',selfType:'child',topValue:'DRAFT_ROOT'})
    const session=await f.open('A')
    const w=mount(DataSpaceQueryPreview,{props:{session:markRaw(session),modelId:'M1',modelName:'Orders',filter:{autoQuery:false}},global:{plugins:[ElementPlus,VXETable]}})
    wrappers.push(w);await flushPromises()
    expect(w.find('[role="alert"]').exists(),w.text()).toBe(false)
    await w.get('[data-action="run-query-preview"]').trigger('click');await flushPromises()
    expect(queries(f).at(-1)?.data).toMatchObject({Table:[{OutputType:'SelfRefData'}],parentField:'parentId',type:'child',nodeid:'DRAFT_ROOT'})
    expect(queries(f).at(-1)?.data).not.toHaveProperty('PageParam');expect(f.fileWrites).toEqual([])
    const denied=fixture();denied.denyModelField('OutputType')
    const other=await denied.open('A')
    expect(()=>other.getModelEdit('M1').stage('OutputType','Join')).toThrow('不能修改')
    const readable = await other.openModelPreview({modelId:'M1',modelName:'Orders'})
    expect(readable.view.queryConfig.outputType).toBe('Table')
    readable.dispose()
    expect(queries(denied)).toHaveLength(0)
  })
  it('previews output narrowing, labels and sort drafts through the DataView and retains them on close', async () => {
    const f=dataSpacePageFixture({allowFieldEdit:true,editableFieldProperties:['description','IsOutput','Order','OrderType'],sourceFields:[
      {rowid:'F1',dataModelId:'M1',Name:'rowid',type:'dataModel',FieldType:'string',IsPKey:1,IsOutput:1,Order:0,OrderType:''},
      {rowid:'F2',dataModelId:'M1',Name:'amount',type:'dataModel',FieldType:'number',IsPKey:0,IsOutput:1,Order:0,OrderType:''},
      {rowid:'F3',dataModelId:'M1',Name:'note',type:'dataModel',FieldType:'string',IsPKey:0,IsOutput:1,Order:0,OrderType:''},
    ],businessRows:{Orders:[{rowid:'R1',amount:1,note:'one'},{rowid:'R2',amount:20,note:'two'}]}});fixtures.push(f)
    const session=await f.open('A'),fields=await session.loadModelFields('M1'),before=f.stored.get('A')
    fields.updateEditingValue('F2','description','草稿金额'); fields.updateEditingValue('F2','Order',1)
    fields.updateEditingValue('F2','OrderType','descending'); fields.updateEditingValue('F3','IsOutput',0)
    const preview=await session.openModelPreview({modelId:'M1',modelName:'Orders'})
    expect(preview.view.columns.map(column=>column.name)).not.toContain('note')
    expect(preview.view.columns.find(column=>column.name==='amount')?.label).toBe('草稿金额')
    await preview.query({context:{},pageSize:1})
    const payload=queries(f).at(-1)?.data
    expect(payload).toMatchObject({OutputFieldMode:'REQUEST',Table:[{Fields:expect.arrayContaining([expect.objectContaining({Name:'amount',IsOutput:true,Order:1,OrderType:'descending'})])}]})
    expect(JSON.stringify(payload)).not.toContain('note')
    expect(preview.view.rows.map(row=>row['rowid'])).toEqual(['R2'])
    await preview.view.setPage(2)
    expect(preview.view.rows.map(row=>row['rowid'])).toEqual(['R1'])
    expect(JSON.stringify(queries(f).at(-1)?.data)).not.toContain('note')
    await preview.view.executeFilter({field:'amount',operator:'gt',value:10})
    expect(preview.view.rows.map(row=>row['rowid'])).toEqual(['R2'])
    expect(JSON.stringify(queries(f).at(-1)?.data)).not.toContain('note')
    preview.dispose()
    expect(fields.getEditingPatch('F3')).toEqual({IsOutput:0})
    expect(f.stored.get('A')).toBe(before);expect(f.fileWrites).toHaveLength(0)
    fields.discardEditingRows()
    const reopened=await session.openModelPreview({modelId:'M1',modelName:'Orders'})
    expect(reopened.view.columns.map(column=>column.name)).toContain('note');reopened.dispose()
  })
  it.each(['change','cancel','scope'])('invalidates the captured field preview on %s without querying stale input', async action => {
    const f=dataSpacePageFixture({allowFieldEdit:true,editableFieldProperties:['description'],sourceFields:[
      {rowid:'F1',dataModelId:'M1',Name:'rowid',type:'dataModel',FieldType:'string',IsPKey:1,IsOutput:1},
    ]});fixtures.push(f)
    const session=await f.open('A'),fields=await session.loadModelFields('M1')
    fields.updateEditingValue('F1','description','草稿')
    const preview=await session.openModelPreview({modelId:'M1',modelName:'Orders'})
    if(action==='change') fields.updateEditingValue('F1','description','新的草稿')
    else if(action==='cancel') fields.discardEditingRows()
    else f.invalidate()
    await expect(preview.query({context:{}})).rejects.toThrow()
    expect(queries(f)).toHaveLength(0);expect(f.fileWrites).toHaveLength(0);preview.dispose()
  })
  it.each([{field:'IsOutput',value:0,primary:true}, {field:'Order',value:-1,primary:false},
    {field:'OrderType',value:'random',primary:false}, {field:'ValueFun',value:'{}',primary:false}])('rejects unsupported or invalid field draft %o',async scenario=>{
    const f=dataSpacePageFixture({allowFieldEdit:true,editableFieldProperties:['IsOutput','Order','OrderType','ValueFun'],sourceFields:[
      {rowid:'F1',dataModelId:'M1',Name:'rowid',type:'dataModel',FieldType:'string',IsPKey:1,IsOutput:1},
      {rowid:'F2',dataModelId:'M1',Name:'amount',type:'dataModel',FieldType:'number',IsPKey:0,IsOutput:1},
    ]});fixtures.push(f)
    const session=await f.open('A'),fields=await session.loadModelFields('M1')
    fields.updateEditingValue(scenario.primary?'F1':'F2',scenario.field,scenario.value)
    await expect(session.openModelPreview({modelId:'M1',modelName:'Orders'})).rejects.toThrow()
    expect(queries(f)).toHaveLength(0);expect(f.fileWrites).toHaveLength(0)
  })
  it('does not promote an unpublished field to output or consume unreadable field settings',async()=>{
    for(const hidden of [false,true]) {
      const f=dataSpacePageFixture({allowFieldEdit:true,editableFieldProperties:['description','IsOutput'],hiddenFieldProperties:hidden?['Order']:[],sourceFields:[
        {rowid:'F1',dataModelId:'M1',Name:'rowid',type:'dataModel',FieldType:'string',IsPKey:1,IsOutput:1},
        {rowid:'F2',dataModelId:'M1',Name:'amount',type:'dataModel',FieldType:'number',IsPKey:0,IsOutput:0},
      ]});fixtures.push(f)
      const session=await f.open('A'),fields=await session.loadModelFields('M1')
      fields.updateEditingValue(hidden?'F1':'F2',hidden?'description':'IsOutput',hidden?'草稿':1)
      await expect(session.openModelPreview({modelId:'M1',modelName:'Orders'})).rejects.toThrow(hidden?'不可读':'新增输出')
      expect(queries(f)).toHaveLength(0)
    }
  })
  it('rejects a modelFields draft instead of querying saved field definitions',async()=>{
    const f=dataSpacePageFixture({sourceFields:[{rowid:'F1',dataModelId:'M1',Name:'rowid',type:'dataModel',FieldType:'string',IsPKey:1,IsOutput:1}]});fixtures.push(f)
    const session=await f.open('A'),fields=await session.loadModelFields('M1')
    const row=fields.rows[0]!,id=fields.getPkKey(row)!
    fields.updateEditingValue(id,'AsName','draftAlias')
    await expect(session.openModelPreview({modelId:'M1',modelName:'Orders'})).rejects.toThrow('字段定义')
    expect(fields.getEditingPatch(id)).toMatchObject({AsName:'draftAlias'});expect(queries(f)).toHaveLength(0)
  })
  it('keeps named-view preview blocked by model drafts and rejects non-query model patches',async()=>{
    const f=fixture(),session=await f.open('A'),owner=session.getModelEdit('M1')
    owner.stage('description','模型修改')
    await expect(session.openPreview({modelId:'M1',modelName:'Orders',tableName:'OrdersAlias',viewId:'default'})).rejects.toThrow(/修改|草稿/)
    const models=session.metadataDataSet.getView('Base_DataModel')!
    models.updateEditingValue('M1','Name','another')
    await expect(session.openModelPreview({modelId:'M1',modelName:'Orders'})).rejects.toThrow(/身份|来源|配置不能|保存/)
    expect(queries(f)).toHaveLength(0)
  })
  it('starts from saved model filter and output mode, then preserves edits through paging without saving definitions', async () => {
    const f = fixture(); f.setModelValues({OutputType:'Join', Filter:JSON.stringify({Type:'cond',Field:'rowid',Operator:'equal',ValueFun:{Type:'GetConstValue',Value:'R2'}})})
    const session=await f.open('A'), opened=vi.spyOn(session,'openModelPreview'), before=f.stored.get('A')
    const w=mount(DataSpaceQueryPreview,{props:{session:markRaw(session),modelId:'M1',modelName:'Orders',filter:{autoQuery:false}},global:{plugins:[ElementPlus,VXETable]}})
    wrappers.push(w);await flushPromises()
    const preview:Awaited<ReturnType<typeof session.openModelPreview>>=await opened.mock.results[0]?.value
    expect(w.find('[role="alert"]').exists(),w.text()).toBe(false)
    expect(w.text()).not.toContain('沿用模型默认')
    expect(queries(f)).toHaveLength(0)
    await w.get('[data-action="run-query-preview"]').trigger('click');await flushPromises()
    expect(queries(f).at(-1)?.data).toMatchObject({Table:[{OutputType:'Join',Filter:{Field:'rowid',ValueFun:{Value:'R2'}}}]})
    expect(preview.view.rows.map(row=>row['rowid'])).toEqual(['R2'])
    expect(w.findAllComponents(FieldCheckbox)).toHaveLength(0)
    await preview.view.executeFilter({field:'rowid',operator:'eq',value:'R3'});await preview.view.setPage(2)
    expect(queries(f).at(-1)?.data).toMatchObject({Table:[{OutputType:'Join',Filter:{ValueFun:{Value:'R3'}}}],PageParam:{index:2}})
    expect(f.stored.get('A')).toBe(before);expect(f.fileWrites).toEqual([])
  })
  it.each(['child','parent'])('initializes saved tree fields with %s node semantics and uses the same config for later queries',async mode=>{
    const f=fixture();f.setModelValues({OutputType:'SelfRefData',parentField:'parentId',selfType:mode,topValue:'ROOT'})
    const session=await f.open('A'),opened=vi.spyOn(session,'openModelPreview')
    const w=mount(DataSpaceQueryPreview,{props:{session:markRaw(session),modelId:'M1',modelName:'Orders',filter:{autoQuery:false}},global:{plugins:[ElementPlus,VXETable]}})
    wrappers.push(w);await flushPromises()
    const preview:Awaited<ReturnType<typeof session.openModelPreview>>=await opened.mock.results[0]?.value
    const node=w.findAllComponents(FieldText).find(field=>field.props('field')==='nodeId')
    expect(node,'tree node input missing').toBeDefined()
    expect((node!.get('input').element as HTMLInputElement).value).toBe(mode==='parent'?'':'ROOT')
    if(mode==='parent'){
      await w.get('[data-action="run-query-preview"]').trigger('click');await flushPromises()
      expect(queries(f)).toHaveLength(0)
      await node!.get('input').setValue('R2');await flushPromises()
    }
    await w.get('[data-action="run-query-preview"]').trigger('click');await flushPromises()
    expect(w.find('[role="alert"]').exists(),w.text()).toBe(false)
    expect(queries(f).at(-1)?.data).toMatchObject({Table:[{OutputType:'SelfRefData'}],keyField:'rowid',parentField:'parentId',type:mode,nodeid:mode==='parent'?'R2':'ROOT'})
    await preview.view.setSort([{field:'rowid',direction:'asc'}])
    expect(queries(f).at(-1)?.data).toMatchObject({type:mode,nodeid:mode==='parent'?'R2':'ROOT'})
    expect(queries(f).at(-1)?.data).not.toHaveProperty('PageParam');expect(f.fileWrites).toEqual([])
  })
  it('renders scalar output fields as bound standard children while retaining structured results in the JSON topic',async()=>{
    const f=dataSpacePageFixture({sourceFields:[
      {rowid:'K',dataModelId:'M1',Name:'rowid',AsName:'id',type:'dataModel',FieldType:'string',IsPKey:1,IsOutput:1,description:'编号'},
      {rowid:'J',dataModelId:'M1',Name:'detail',type:'dataModel',FieldType:'json',IsOutput:1},
      {rowid:'N',dataModelId:'M1',Name:'name',type:'dataModel',FieldType:'string',IsOutput:1,description:'标题'},
    ],businessRows:{Orders:[{id:'R1',name:'one',detail:{enabled:false}}]}});fixtures.push(f)
    const session=await f.open('A'),w=mount(DataSpaceQueryPreview,{props:{session:markRaw(session),modelId:'M1',modelName:'Orders'},global:{plugins:[ElementPlus,VXETable]}})
    wrappers.push(w);await flushPromises();await w.get('[data-action="run-query-preview"]').trigger('click');await flushPromises()
    const table=w.getComponent(RendererTable)
    expect(table.props('autoColumns')).toBe(false)
    expect(table.findAllComponents(FieldText).map(field=>[field.props('field'),field.props('label')])).toEqual([['id','编号'],['name','标题']])
    expect(w.findAllComponents(FieldJson).find(field => field.props('dataMember') === 'rows')!.getComponent(JsonTreeEditor).props('modelValue')).toContain('enabled')
    expect(f.fileWrites).toEqual([])
  })
  it('does not substitute an empty filter when saved model filter permission is hidden',async()=>{
    const f=dataSpacePageFixture({hiddenModelProperties:['Filter']});fixtures.push(f)
    const session=await f.open('A'),w=mount(DataSpaceQueryPreview,{props:{session:markRaw(session),modelId:'M1',modelName:'Orders'},global:{plugins:[ElementPlus,VXETable]}})
    wrappers.push(w);await flushPromises()
    expect(w.get('[role="alert"]').text()).toContain('Filter')
    expect(queries(f)).toHaveLength(0);expect(w.find('[data-action="run-query-preview"]').exists()).toBe(false)
  })
  it('maps saved resource field references to native aliases and emits the original SPARK field after query binding',async()=>{
    const f=dataSpacePageFixture({sourceFields:[
      {rowid:'K',dataModelId:'M1',Name:'rowid',AsName:'id',type:'dataModel',FieldType:'string',IsPKey:1,IsOutput:1},
      {rowid:'P',dataModelId:'M1',Name:'parentId',AsName:'parentKey',type:'dataModel',FieldType:'string',IsOutput:1},
    ],businessRows:{Orders:[{rowid:'R1',id:'R1',parentId:'ROOT',parentKey:'ROOT'}]}});fixtures.push(f)
    f.setModelValues({OutputType:'SelfRefData',parentField:'parentId',selfType:'child',topValue:'ROOT',Filter:JSON.stringify({Type:'cond',Field:'Orders.rowid',Operator:'equal',ValueFun:{Type:'GetConstValue',Value:'R1'}})})
    const session=await f.open('A'),opened=vi.spyOn(session,'openModelPreview')
    const w=mount(DataSpaceQueryPreview,{props:{session:markRaw(session),modelId:'M1',modelName:'Orders',filter:{autoQuery:false}},global:{plugins:[ElementPlus,VXETable]}})
    wrappers.push(w);await flushPromises();await w.get('[data-action="run-query-preview"]').trigger('click');await flushPromises()
    const preview:Awaited<ReturnType<typeof session.openModelPreview>>=await opened.mock.results[0]?.value
    expect(w.find('[role="alert"]').exists(),w.text()).toBe(false)
    expect(preview.view.filterExpression).toMatchObject({field:'id'})
    expect(preview.view.queryConfig.tree).toMatchObject({keyField:'id',parentField:'parentKey'})
    expect(queries(f).at(-1)?.data).toMatchObject({keyField:'rowid',parentField:'parentId',Table:[{Filter:{Field:'rowid'}}]})
    expect(preview.view.rows[0]).toMatchObject({id:'R1',parentKey:'ROOT'})
  })
  it('leaves named-view filtering and output configuration independent of model defaults',async()=>{
    const f=fixture();f.setModelValues({OutputType:'SelfRefData',Filter:'invalid model filter',selfType:'parent',topValue:'ROOT'})
    f.stored.set('A',JSON.stringify({scenarioId:'A',tables:{OrdersAlias:{modelBinding:{modelId:'M1',modelName:'Orders'},views:{default:{},shared:{filterExpression:{field:'rowid',operator:'eq',value:'R3'},queryConfig:{outputType:'Table'},pageSize:2}}}}}))
    const session=await f.open('A'),opened=vi.spyOn(session,'openPreview')
    const w=mount(DataSpaceQueryPreview,{props:{session:markRaw(session),modelId:'M1',modelName:'Orders',tableName:'OrdersAlias',viewId:'shared'},global:{plugins:[ElementPlus,VXETable]}})
    wrappers.push(w);await flushPromises();await w.get('[data-action="run-query-preview"]').trigger('click');await flushPromises()
    const preview:Awaited<ReturnType<typeof session.openPreview>>=await opened.mock.results[0]?.value
    expect(w.find('[role="alert"]').exists(),w.text()).toBe(false)
    expect(preview.view.rows.map(row=>row['rowid'])).toEqual(['R3'])
    expect(queries(f).at(-1)?.data).toMatchObject({PageParam:{size:2},Table:[{OutputType:'Table',Filter:{ValueFun:{Value:'R3'}}}]})
  })
  it.each([true,false])('restores source test properties through a bound object value with autoQuery=%s',async autoQuery=>{
    const f=dataSpacePageFixture({sourceInput:true,businessRows:{Orders:[{rowid:'R1',parentId:''}]}});fixtures.push(f)
    const session=await f.open('A'), opened=vi.spyOn(session,'openModelPreview'), before=f.stored.get('A')
    const originalMapping=f.sourceValue('A')
    const stubs={...config.global.stubs};for(const name of ['el-table','el-table-column']) delete stubs[name];config.global.stubs=stubs
    const w=mount(DataSpaceQueryPreview,{props:{session:markRaw(session),modelId:'M1',modelName:'Orders',filter:{autoQuery}},
      global:{plugins:[ElementPlus,VXETable,Spark.createPlugin()]}})
    wrappers.push(w);await flushPromises()
    const preview:Awaited<ReturnType<typeof session.openModelPreview>>=await opened.mock.results[0]?.value
    expect(w.find('[role="alert"]').exists(),w.text()).toBe(false)
    const input=w.get('[data-json-property="customerArg"]')
    expect((input.element as HTMLInputElement).value).toBe('')
    expect(w.text()).toContain('测试值');expect(w.findComponent(RendererFilter).exists()).toBe(false)
    expect(queries(f)).toHaveLength(0)
    await input.setValue('false');await flushPromises()
    if(!autoQuery){expect(queries(f)).toHaveLength(0);await w.get('[data-action="run-query-preview"]').trigger('click');await flushPromises()}
    expect(preview.view.queryContext['customerArg']).toBe(false)
    expect(preview.view.queryConfig.sourceInputMode).toBe('direct')
    expect(preview.view.requestState).toBe(RequestState.Loaded)
    await preview.view.setPage(2);await flushPromises()
    for(const request of queries(f)) expect((request.data as {Table:{inputParams:unknown[]}[]}).Table[0]?.inputParams).toContainEqual({Name:'customerArg',Value:false})
    expect(f.fileWrites).toEqual([]);expect(f.stored.get('A')).toBe(before);expect(f.sourceValue('A')).toBe(originalMapping)
    for(const table of Object.values(session.metadataDataSet.tables)) for(const view of Object.values(table.views)) expect(view.hasEditingChanges()).toBe(false)
    w.unmount();expect(preview.disposed).toBe(true)
  })
  it('refuses source tests when formal parameter names are not readable',async()=>{
    const f=dataSpacePageFixture({sourceInput:true,hiddenFieldProperties:['Name']});fixtures.push(f)
    const session=await f.open('A')
    const w=mount(DataSpaceQueryPreview,{props:{session:markRaw(session),modelId:'M1',modelName:'Orders'},global:{plugins:[ElementPlus,VXETable]}})
    wrappers.push(w);await flushPromises()
    expect(w.get('[role="alert"]').text()).toContain('来源测试参数名称不可读')
    expect(w.find('[data-json-property]').exists()).toBe(false);expect(queries(f)).toHaveLength(0);expect(f.fileWrites).toEqual([])
  })
  it('keeps a named interface view on its configured mapped-input semantics',async()=>{
    const f=dataSpacePageFixture({sourceInput:true,businessRows:{Orders:[{rowid:'R1',parentId:''}]}});fixtures.push(f)
    const session=await f.open('A'),opened=vi.spyOn(session,'openPreview')
    const w=mount(DataSpaceQueryPreview,{props:{session:markRaw(session),modelId:'M1',modelName:'Orders',tableName:'OrdersAlias',viewId:'shared',filter:{autoQuery:false}},global:{plugins:[ElementPlus,VXETable]}})
    wrappers.push(w);await flushPromises()
    const preview:Awaited<ReturnType<typeof session.openPreview>>=await opened.mock.results[0]?.value
    expect(w.findAllComponents(FieldJson).find(field => field.props('field') === 'context')?.props('schema')).toMatchObject({properties:{customer:{description:'客户'}}})
    expect(w.findAllComponents(FieldText).some(field=>field.props('field')==='context')).toBe(true)
    expect(preview.view.queryConfig.sourceInputMode).toBeUndefined();expect(queries(f)).toHaveLength(0)
  })
  it('runs direct source-input tests through the preview DataView without persisting or rewriting source bindings', async () => {
    const f = dataSpacePageFixture({sourceInput: true, businessRows: {Orders: [{rowid: 'R1', parentId: ''}]}})
    fixtures.push(f)
    const session = await f.open('A'), preview = await session.openModelPreview({modelId: 'M1', modelName: 'Orders'})
    const before = f.stored.get('A')
    try {
      await preview.query({context: {customerArg: false}, queryConfig: {sourceInputMode: 'direct'}, pageSize: 1})
      await preview.view.setPage(2)
      expect(queries(f)).toHaveLength(2)
      for (const request of queries(f)) {
        const data = request.data as {Table: {inputParams: {Name: string; Value: unknown}[]}[]}
        expect(data.Table[0]?.inputParams).toContainEqual({Name: 'customerArg', Value: false})
        expect(JSON.stringify(data)).not.toContain('sourceInputMode')
      }
      expect(preview.view.queryConfig.sourceInputMode).toBe('direct')
      for (const table of Object.values(session.metadataDataSet.tables)) for (const view of Object.values(table.views)) {
        expect(view.hasEditingChanges()).toBe(false)
        expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
      }
      expect(f.fileWrites).toEqual([]); expect(f.stored.get('A')).toBe(before)
    } finally {preview.dispose()}
  })
  it.each([false, true])('uses the JSON collection query without inventing node inputs, retaining explicit tree config: %s', async explicitTree => {
    const nodes = [{id: 'enabled', pid: null, name: 'enabled', type: 'boolean', haschild: false, value: false}]
    const f = dataSpacePageFixture({formalProjection: true, formalPrimaryKey: 'id',
      sourceFields: ['id', 'pid', 'name', 'type', 'haschild', 'value'].map((Name, index) => ({
        rowid: `F${index}`, dataModelId: 'M1', Name, type: 'dataModel', IsPKey: Name === 'id' ? 1 : 0, IsOutput: 1, FieldType: 'string',
      })), businessRows: {Orders: nodes}})
    fixtures.push(f)
    f.setModelValues({Type: 'JSON'})
    const queryConfig = {outputType: 'SelfRefData', ...(explicitTree ? {tree: {keyField: 'id', parentField: 'pid', nodeId: 'enabled'}} : {})}
    f.stored.set('A', JSON.stringify({scenarioId: 'A', tables: {OrdersAlias: {
      modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {default: {}, shared: {queryConfig}},
    }}}))
    const session = await f.open('A'), opened = vi.spyOn(session, 'openPreview')
    const w = mount(DataSpaceQueryPreview, {props: {session: markRaw(session), modelId: 'M1', modelName: 'Orders', tableName: 'OrdersAlias', viewId: 'shared'}, global: {plugins: [ElementPlus, VXETable]}})
    wrappers.push(w); await flushPromises()
    const preview: Awaited<ReturnType<typeof session.openPreview>> = await opened.mock.results[0]?.value
    expect(w.find('[role="alert"]').exists(), w.text()).toBe(false)
    expect(preview.view.dataTable!.resourceType).toBe('json')
    expect(w.findAllComponents(FieldText).some(c => c.props('field') === 'nodeId')).toBe(explicitTree)
    expect(w.findAllComponents(FieldSelect).some(c => c.props('field') === 'keyField')).toBe(explicitTree)
    await w.get('[data-action="run-query-preview"]').trigger('click'); await flushPromises()
    expect(w.find('[role="alert"]').exists(), w.text()).toBe(false)
    expect(preview.view.rows).toMatchObject(nodes)
    expect(w.getComponent(RendererTable).props('dataViewKey')).toBe(preview.dataViewKey)
    expect(w.find('.renderer-table-pagination').exists()).toBe(false)
    expect(preview.view.queryConfig.tree).toEqual(queryConfig.tree)
    expect(queries(f).at(-1)?.data).not.toHaveProperty('PageParam')
    if (!explicitTree) expect(queries(f).at(-1)?.data).not.toHaveProperty('nodeid')
    expect(f.fileWrites).toEqual([])
    w.unmount(); expect(preview.disposed).toBe(true)
  })

  it('uses the standard filter autoQuery property for manual multi-parent inputs before any result exists', async () => {
    const f = fixture(), session = await f.open('A')
    const opened = vi.spyOn(session, 'openModelPreview')
    const w = mount(DataSpaceQueryPreview, {props: {session: markRaw(session), modelId: 'M1', modelName: 'Orders', filter: {autoQuery: false}},
      global: {plugins: [ElementPlus, VXETable]}})
    wrappers.push(w); await flushPromises()
    expect(w.findComponent(RendererFilter).exists()).toBe(true)
    const preview = await opened.mock.results[0]?.value
    const change = async (size: number) => {
      const number = w.findAllComponents(FieldNumber).find(c => c.props('field') === 'pageSize')!.getComponent(ElInputNumber)
      await number.get('input').setValue(String(size))
      await number.get('input').trigger('blur')
      await flushPromises()
      expect(number.get('input').element).toHaveProperty('value', String(size))
      await w.findAllComponents(FieldText).find(c => c.props('field') === 'context')!.get('input').setValue('{"active":false}')
      await flushPromises()
    }
    await change(1)
    expect(queries(f)).toHaveLength(0)
    await w.get('[data-action="run-query-preview"]').trigger('click'); await flushPromises()
    expect(preview!.view.queryContext).toMatchObject({active: false})
    expect(preview!.view.pageSize).toBe(1)
    const count = queries(f).length
    await change(2)
    expect(queries(f)).toHaveLength(count)
    await w.get('[data-action="run-query-preview"]').trigger('click'); await flushPromises()
    expect(preview!.view.pageSize).toBe(2)
    expect(preview!.view.queryConfig.autoQuery).toBe(false)
    expect(JSON.stringify(queries(f))).not.toContain('autoQuery')
    expect(f.fileWrites).toEqual([])
    w.unmount()
    expect(preview!.disposed).toBe(true)
  })

  it('restores the three preview regions and changes result presentation without another query or persistence', async () => {
    const f = fixture(), session = await f.open('A')
    const w = mount(DataSpaceQueryPreview, {props: {session: markRaw(session), modelId: 'M1', modelName: 'Orders'}, global: {plugins: [ElementPlus, VXETable]}})
    wrappers.push(w); await flushPromises()
    const forms = w.findAllComponents(RendererForm)
    expect(forms).toHaveLength(1)
    expect(w.findAllComponents(RendererSection).map(section => section.props('title'))).toEqual([
      '预览条件：', '调用参数与查询设置', '输出结果', '结果数据',
    ])
    expect(w.getComponent(RendererFilter).props('expressionDisplay')).toBe('inline')
    expect(w.findAllComponents(FieldNumber).some(field => field.props('field') === 'maxRows')).toBe(false)
    expect(queries(f)).toHaveLength(0)
    await w.get('[data-action="run-query-preview"]').trigger('click'); await flushPromises()
    const resultJson = w.findAllComponents(FieldJson).find(field => field.props('dataMember') === 'rows')!
    expect(resultJson.props('dataViewKey')).toBe(w.getComponent(RendererTable).props('dataViewKey'))
    expect(w.getComponent(RendererTable).props('maxHeight')).toBe(280)
    const json = () => JSON.parse(resultJson.getComponent(JsonTreeEditor).props('modelValue')!)
    expect(json()).toHaveLength(3)
    const count = queries(f).length
    w.findAllComponents(FieldRadio).find(c => c.props('field') === 'resultMode')!.getComponent(ElRadioGroup).vm.$emit('update:modelValue', 'full')
    await flushPromises()
    expect(json()).toMatchObject({total: 3, page: 1, pageSize: 10, rows: [{rowid: 'R1'}, {rowid: 'R2'}, {rowid: 'R3'}]})
    expect(queries(f)).toHaveLength(count); expect(f.fileWrites).toEqual([])
  })
  it('binds query mode and tree inputs, retains unapplied values and reuses the query config after every interaction', async () => {
    const f = fixture(), session = await f.open('A'), before = f.stored.get('A')
    const opened = vi.spyOn(session, 'openModelPreview')
    const w = mount(DataSpaceQueryPreview, {props: {session: markRaw(session), modelId: 'M1', modelName: 'Orders'}, global: {plugins: [ElementPlus, VXETable]}})
    wrappers.push(w); await flushPromises()
    const preview: Awaited<ReturnType<typeof session.openModelPreview>> = await opened.mock.results[0]?.value
    if (!preview) throw new Error('preview instance missing')
    const choose = async (field: string, value: string) => {
      if (field === 'outputType') {
        w.findAllComponents(FieldRadio).find(c => c.props('field') === field)!.getComponent(ElRadioGroup).vm.$emit('update:modelValue', value)
        await flushPromises(); return
      }
      const select = w.findAllComponents(FieldSelect).find(c => c.props('field') === field)
      expect(select, `standard bound ${field} selector missing`).toBeDefined()
      select!.getComponent(ElSelect).vm.$emit('update:modelValue', value)
      await flushPromises()
    }
    const run = async () => {await w.get('[data-action="run-query-preview"]').trigger('click'); await flushPromises()}
    w.findAllComponents(FieldNumber).find(c => c.props('field') === 'pageSize')!.getComponent(ElInputNumber).vm.$emit('update:modelValue', 1)
    await flushPromises()
    await choose('outputType', 'SelfRefData')
    expect(w.findAllComponents(FieldNumber).some(c => c.props('field') === 'pageSize')).toBe(false)
    expect(w.findAllComponents(FieldCheckbox)).toHaveLength(0)
    await choose('keyField', 'rowid')
    await choose('parentField', 'parentId')
    await choose('treeMode', 'parent')
    const node = w.findAllComponents(FieldText).find(c => c.props('field') === 'nodeId')!
    await node.get('input').setValue('R2')
    await flushPromises()
    expect(queries(f).length).toBeGreaterThan(0)
    await run()
    expect(w.find('[role="alert"]').exists(), w.text()).toBe(false)
    expect(preview.view.rows).toHaveLength(3)
    expect(w.find('.renderer-table-pagination').exists()).toBe(false)
    expect(w.find('[data-testid="data-view-meta"]').text()).not.toContain('第 1 页')
    expect(preview.view.queryConfig).toEqual({outputType: 'SelfRefData',
      tree: {keyField: 'rowid', parentField: 'parentId', nodeId: 'R2', mode: 'parent'}})
    await preview.view.setSort([{field: 'rowid', direction: 'asc'}])
    await preview.view.setPage(2)
    await preview.view.executeFilter({field: 'rowid', operator: 'eq', value: 'R2'})
    for (const request of queries(f).filter(r => isRecord(r.data) && r.data['nodeid'] === 'R2')) {
      expect(request.data).toMatchObject({Table: [{OutputType: 'SelfRefData'}],
        keyField: 'rowid', parentField: 'parentId', nodeid: 'R2', type: 'parent'})
      expect(request.data).not.toHaveProperty('PageParam')
    }
    expect(preview.view.rows.map(row => row['rowid'])).toEqual(['R2'])
    await choose('outputType', 'Table')
    expect(w.findAllComponents(FieldText).some(c => c.props('field') === 'nodeId')).toBe(false)
    expect(preview.view.queryConfig.outputType).toBe('Table')
    expect(w.findAllComponents(FieldNumber).find(c => c.props('field') === 'pageSize')!.getComponent(ElInputNumber).props('modelValue')).toBe(1)
    await run()
    expect(preview.view.queryConfig).toEqual({outputType: 'Table', allPages: false})
    expect(queries(f).at(-1)?.data).not.toHaveProperty('nodeid')
    await choose('outputType', 'SelfRefData')
    expect(w.findAllComponents(FieldText).find(c => c.props('field') === 'nodeId')!.get('input').element.value).toBe('R2')
    for (const mode of ['Join', 'HierarchyData', 'Navigation', '']) {
      await choose('outputType', mode); await run()
      expect(preview.view.queryConfig.outputType).toBe(mode || undefined)
      expect(queries(f).at(-1)?.data).not.toHaveProperty('nodeid')
      if (mode) expect(queries(f).at(-1)?.data).toMatchObject({Table: [{OutputType: mode}]})
    }
    expect(f.fileWrites).toEqual([]); expect(f.stored.get('A')).toBe(before)
    expect(f.requests.some(r => /save|delete|update|insert/i.test(r.url ?? ''))).toBe(false)
    w.unmount()
    expect(preview.disposed).toBe(true)
  })

  it.each([true, false])('initializes a named-view tree configuration (explicit mode: %s) and rejects incomplete input without changing the active query', async explicitMode => {
    const f = fixture()
    const queryConfig = {fields: ['rowid', 'parentId'], ...(explicitMode ? {outputType: 'SelfRefData'} : {}), tree: {keyField: 'rowid', parentField: 'parentId', nodeId: 'root', mode: 'child'}}
    f.stored.set('A', JSON.stringify({scenarioId: 'A', tables: {OrdersAlias: {
      modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {default: {}, shared: {queryConfig}},
    }}}))
    const session = await f.open('A'), opened = vi.spyOn(session, 'openPreview')
    const w = mount(DataSpaceQueryPreview, {props: {session: markRaw(session), modelId: 'M1', modelName: 'Orders', tableName: 'OrdersAlias', viewId: 'shared'}, global: {plugins: [ElementPlus, VXETable]}})
    wrappers.push(w); await flushPromises()
    const preview: Awaited<ReturnType<typeof session.openPreview>> = await opened.mock.results[0]?.value
    const node = w.findAllComponents(FieldText).find(c => c.props('field') === 'nodeId')
    expect(node, 'bound tree node input missing').toBeDefined()
    expect(node!.get('input').element.value).toBe('root')
    await node!.get('input').setValue('')
    await w.get('[data-action="run-query-preview"]').trigger('click'); await flushPromises()
    expect(w.get('[role="alert"]').text()).toContain('nodeId')
    expect(queries(f)).toHaveLength(0)
    expect(preview.view.queryConfig).toEqual(queryConfig)
    expect(node!.get('input').element.value).toBe('')
    await node!.get('input').setValue('root')
    await w.get('[data-action="run-query-preview"]').trigger('click'); await flushPromises()
    expect(preview.view.queryConfig.fields).toEqual(['rowid', 'parentId'])
    expect(f.fileWrites).toEqual([])
  })

  it.each([false, true])('assembles a persisted named-view query mode and keeps it through standard interactions (native: %s)', async native => {
    const f = fixture()
    const queryConfig = {outputType: 'SelfRefData', tree: {keyField: 'rowid', parentField: 'parentId', nodeId: 'root', mode: 'child'}}
    f.stored.set('A', JSON.stringify({scenarioId: 'A', ...(native ? {schemaVersion: 2, resourceRelations: []} : {}), tables: {OrdersAlias: {
      modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {default: {}, shared: {queryConfig}},
    }, ...(native ? {CustomersAlias: {modelBinding: {modelId: 'M2', modelName: 'Customers'}, views: {default: {}}}} : {})}}))
    const session = await f.open('A')
    const preview = await session.openPreview({modelId: 'M1', modelName: 'Orders', tableName: 'OrdersAlias', viewId: 'shared'})
    expect(preview.view.queryConfig).toEqual(queryConfig)
    const start = queries(f).length
    await preview.query({context: {}, pageSize: 1})
    await preview.view.setSort([{field: 'rowid', direction: 'asc'}])
    await preview.view.setPage(2)
    await preview.view.executeFilter({field: 'rowid', operator: 'eq', value: 'R2'})
    expect(preview.view.rows.map(row => row['rowid'])).toEqual(['R2'])
    expect(preview.view.deleteActionState(preview.view.rows[0]!)).not.toBe('enabled')
    expect(preview.view.rows[0]).not.toHaveProperty('lingma_sys_params')
    for (const request of queries(f).slice(start)) {
      expect(request.data).toMatchObject({Table: [{OutputType: 'SelfRefData'}], keyField: 'rowid', parentField: 'parentId', nodeid: 'root', type: 'child'})
    }
    expect(f.fileWrites).toEqual([])
    preview.dispose()
  })

  it('applies and clears the shared filter through the bound preview view and formal query owner', async () => {
    const stubs = {...config.global.stubs}
    delete stubs['SparkComponentRenderer']; delete stubs['spark-component-renderer']
    config.global.stubs = stubs
    const registry = Spark.createRegistry()
    registry.register({type: 'r-filter', component: RendererFilter})
    const f = fixture(), session = await f.open('A'), before = f.stored.get('A')
    const w = mount(DataSpaceQueryPreview, {attachTo: document.body, props: {session: markRaw(session), modelId: 'M1', modelName: 'Orders'},
      global: {plugins: [ElementPlus, VXETable, Spark.createPlugin({registry})], stubs: {SparkJsonEditor: true}}})
    wrappers.push(w); await flushPromises()
    await w.get('[data-action="run-query-preview"]').trigger('click'); await flushPromises()
    expect(w.find('[data-action="open"]').exists()).toBe(false)
    const body = new DOMWrapper(document.body), start = queries(f).length
    await body.get('[data-action="json"]').trigger('click'); await body.get('[data-action="json-text"]').trigger('click')
    w.getComponent(SparkJsonEditor).vm.$emit('update:modelValue', JSON.stringify({field: 'rowid', operator: 'eq', value: 'R2'})); await flushPromises()
    await body.get('[data-action="apply"]').trigger('click'); await flushPromises()
    expect(queries(f)).toHaveLength(start + 1)
    expect(JSON.stringify(queries(f).at(-1)?.data)).toContain('R2')
    expect(w.find('.renderer-table-pagination').exists()).toBe(true)
    await body.get('[data-action="clear"]').trigger('click'); await flushPromises()
    expect(queries(f)).toHaveLength(start + 2)
    expect(JSON.stringify(queries(f).at(-1)?.data)).not.toContain('R2')
    expect(f.fileWrites).toEqual([]); expect(f.stored.get('A')).toBe(before)
    expect(f.requests.some(r => /save|delete|update|insert/i.test(r.url ?? ''))).toBe(false)
  })

  it('switches paged/complete/paged reads through the same formal view without saving metadata', async () => {
    const f = fixture(), session = await f.open('A')
    const before = f.stored.get('A')
    const preview = await session.openPreview({modelId: 'M1', modelName: 'Orders', tableName: 'OrdersAlias', viewId: 'shared'})
    preview.view.filterExpression = {field: 'rowid', operator: 'ne', value: 'EXCLUDED'}
    await preview.query({context: {enabled: false, ids: [0, 'A']}, pageSize: 1})
    expect(preview.view.rows).toHaveLength(1)
    expect(preview.view.total).toBe(3)
    const start = queries(f).length
    await preview.query({context: {enabled: false, ids: [0, 'A']}, pageSize: 1, queryConfig: {allPages: true, maxRows: 3}})
    expect(preview.view.rows.map(row => row['rowid'])).toEqual(['R1', 'R2', 'R3'])
    const complete = queries(f).slice(start)
    expect(complete.map(r => isRecord(r.data) ? r.data['PageParam'] : undefined)).toEqual([1, 2, 3].map(index => ({index, size: 1})))
    const tables = complete.map(r => isRecord(r.data) ? r.data['Table'] : undefined)
    expect(tables[1]).toEqual(tables[0]); expect(tables[2]).toEqual(tables[0])
    expect(JSON.stringify(tables[0])).toContain('EXCLUDED')
    expect(preview.view.queryContext).toEqual({enabled: false, ids: [0, 'A']})
    expect(preview.view.fieldAccess(preview.view.rows[0]!, 'rowid').write).toBe('denied')
    await preview.view.setSort([{field: 'rowid', direction: 'asc'}])
    expect(preview.view.rows).toHaveLength(3)
    await preview.view.executeFilter({field: 'rowid', operator: 'eq', value: 'R2'})
    expect(preview.view.rows).toHaveLength(1)
    await preview.view.executeFilter(undefined)
    expect(preview.view.rows).toHaveLength(3)
    await preview.query({context: {}, pageSize: 1, queryConfig: {}})
    expect(preview.view.rows).toHaveLength(1)
    expect(f.fileWrites).toEqual([]); expect(f.stored.get('A')).toBe(before)
    preview.dispose()
  })

  it('rejects a complete collection exceeding the limit and can retry with a larger explicit limit', async () => {
    const f = fixture(), session = await f.open('A')
    const preview = await session.openModelPreview({modelId: 'M1', modelName: 'Orders'})
    await expect(preview.query({context: {}, pageSize: 1, queryConfig: {allPages: true, maxRows: 2}})).rejects.toThrow()
    expect(preview.view.rows).toEqual([])
    expect(() => preview.snapshot()).toThrow('尚未取得有效查询结果')
    expect(queries(f)).toHaveLength(1)
    await preview.query({context: {}, pageSize: 2, queryConfig: {allPages: true, maxRows: 3}})
    expect(preview.view.rows).toHaveLength(3)
    expect(f.fileWrites).toEqual([])
    preview.dispose()
  })

  it.each([{pageSize: 1001}, {queryConfig: {allPages: 'true'}}, {queryConfig: {maxRows: 0}},
    {queryConfig: {outputType: 'SelfRefData', tree: {keyField: 'missing', parentField: 'parentId', nodeId: 'root'}}},
  ])('preserves the prior result and parameters when input is invalid: %j', async options => {
    const f = fixture(), session = await f.open('A')
    const preview = await session.openModelPreview({modelId: 'M1', modelName: 'Orders'})
    await preview.query({context: {retained: 'A'}, pageSize: 1})
    const rows = preview.view.rows, count = queries(f).length
    await expect(Reflect.apply(preview.query, preview, [{context: {retained: 'B'}, ...options}])).rejects.toThrow()
    expect(preview.view.rows).toBe(rows)
    expect(preview.view.queryContext).toEqual({retained: 'A'})
    expect(queries(f)).toHaveLength(count)
    preview.dispose()
  })

  it('binds the complete-read switch to standard input DataView and hides paging only for its completed result', async () => {
    const f = fixture(), session = await f.open('A')
    const w = mount(DataSpaceQueryPreview, {props: {session: markRaw(session), modelId: 'M1', modelName: 'Orders'}, global: {plugins: [ElementPlus, VXETable]}})
    wrappers.push(w); await flushPromises()
    expect(w.find('[role="alert"]').exists(), w.text()).toBe(false)
    const control = w.findAllComponents(FieldCheckbox).find(c => c.props('field') === 'allPages')
    expect(control).toBeDefined()
    const pageSize = w.findAllComponents(FieldNumber).find(c => c.props('field') === 'pageSize')!.getComponent(ElInputNumber)
    await pageSize.get('input').setValue('100')
    await pageSize.get('input').trigger('blur')
    await flushPromises()
    await control!.getComponent(ElCheckbox).get('input').setValue(true)
    await flushPromises()
    await w.findAllComponents(RendererButton).find(c => c.attributes('data-action') === 'run-query-preview')!.get('button').trigger('click')
    await flushPromises()
    expect(w.find('.renderer-table-pagination').exists()).toBe(false)
    await new Promise(resolve => setTimeout(resolve, 40))
    await flushPromises()
    expect(pageSize.get('input').element).toHaveProperty('value', '100')
    w.getComponent(RendererTable).getComponent({name: 'GlobalElTableStub'}).vm.$emit('sort-change', {prop: 'rowid', order: 'ascending'})
    await flushPromises()
    expect(w.find('.renderer-table-pagination').exists()).toBe(false)
    await w.findAllComponents(RendererButton).find(c => c.attributes('data-action') === 'run-query-preview')!.get('button').trigger('click')
    await flushPromises()
    expect(w.find('.renderer-table-pagination').exists()).toBe(false)
    await control!.getComponent(ElCheckbox).get('input').setValue(false)
    await flushPromises()
    expect(w.find('.renderer-table-pagination').exists()).toBe(true)
    await w.findAllComponents(RendererButton).find(c => c.attributes('data-action') === 'run-query-preview')!.get('button').trigger('click')
    await flushPromises()
    expect(w.find('.renderer-table-pagination').exists()).toBe(true)
    expect(f.fileWrites).toEqual([])
  })
})
