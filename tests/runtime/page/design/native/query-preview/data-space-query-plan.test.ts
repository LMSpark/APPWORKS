import {expect, it, vi} from 'vitest'
import {config, DOMWrapper, flushPromises, mount} from '@vue/test-utils'
import {defineComponent, h, markRaw} from 'vue'
import ElementPlus, {ElSelect} from 'element-plus'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {buildDataViewKey} from '@spark-appworks/spark-data'
import {FieldJson, RendererFilterExpression, PAGE_RUNTIME, registerAllRenderers, Spark, useSparkComponent} from '@spark-appworks/spark-component'
import FilterExpressionEditor from '../../../../../../packages/spark-component/src/components/containers/filter/expression/FilterExpressionEditor/FilterExpressionEditor.vue'
import JsonTreeEditor from '../../../../../../packages/spark-component/src/components/editors/JsonTreeEditor.vue'
import DataSpaceQueryPlan from '@/views/features/data-platform/data-set-management/design/views/query-plan/DataSpaceQueryPlan.vue'
import DataSpaceViewEditor from '@/views/features/data-platform/data-set-management/design/views/DataSpaceViewEditor.vue'
import {dataSpacePageFixture} from '../data-space-page.fixture'

async function fixture(initial: Record<string, unknown> = {outputType: 'Navigation', pagination: 'none'}, formalSql = false, thirdModel = false) {
  const f = dataSpacePageFixture(formalSql ? {formalProjection: true, formalAllModels: true, formalPrimaryKey: 'rowid', sourceFields: ['M1', 'M2'].flatMap(dataModelId => ['rowid', 'parentId'].map(Name => ({rowid: dataModelId + Name, dataModelId, Name, type: 'dataModel', FieldType: 'string', IsOutput: 1, IsPKey: Name === 'rowid' ? 1 : 0})))} : {})
  if (formalSql) {
    f.setModelValues({Type: '数据库表', DbId: 'DB', PrimaryKeyFields: 'rowid', ShortName: 'o'}, 'A', 'M1')
    f.setModelValues({Type: '数据库表', DbId: 'DB', PrimaryKeyFields: 'rowid', ShortName: 'c', PId: 'Orders', JoinType: 'LEFT', JoinFilter: 'c.parentId=o.rowid'}, 'A', 'M2')
  }
  if (thirdModel) {
    f.created.set('Base_DataModel', [{rowid: 'M3', dataSetId: 'A', Name: 'Grand', MetaName: 'GrandSource', Type: '数据库表', DbId: 'DB', PrimaryKeyFields: 'rowid', ShortName: 'g', PId: 'Customers', JoinType: 'LEFT', JoinFilter: 'g.parentId=c.rowid'}])
    f.created.set('Base_DataModel_Field', ['rowid', 'parentId'].map(Name => ({rowid: `M3${Name}`, dataSetId: 'A', dataModelId: 'M3', Name, type: 'dataModel', FieldType: 'string', IsOutput: 1, IsPKey: Name === 'rowid' ? 1 : 0})))
  }
  f.stored.set('A', JSON.stringify({scenarioId: 'A', schemaVersion: 2, resourceRelations: [], tables: {
    OrdersAlias: {modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {default: {}, shared: {}}},
    CustomersAlias: {modelBinding: {modelId: 'M2', modelName: 'Customers'}, views: {default: {}, shared: {}}},
    ...(thirdModel ? {GrandAlias: {modelBinding: {modelId: 'M3', modelName: 'Grand'}, views: {default: {}, shared: {}}}} : {}),
  }}))
  const session = await f.open('A')
  await session.loadDefinition()
  const view = session.metadataDataSet.getView('DataViewDefinition')!
  await view.requestData()
  const row = view.rows.find(item => item['tableName'] === 'OrdersAlias' && item['viewId'] === 'shared')!
  const key = view.getPkKey(row)!
  view.setCurrentRow(row)
  view.updateEditingValue(key, 'queryConfig', initial)
  const dataSet = session.metadataDataSet, scenarioId = dataSet.scenarioId!
  const runtime = new PageRuntime({pageId: 'plan-test', scenarioIds: [scenarioId], loadScenario: async () => dataSet})
  await runtime.load(); registerAllRenderers()
  const originalStubs = config.global.stubs
  const stubs: typeof originalStubs = {...originalStubs, JsonTreeEditor: true}; delete stubs['el-table']; delete stubs['el-table-column']; delete stubs['SparkComponentRenderer']; delete stubs['spark-component-renderer']; config.global.stubs = stubs
  const host = defineComponent({setup() {useSparkComponent({type: 'plan-host'}).sparkProvide(PAGE_RUNTIME, runtime)
    return () => h(DataSpaceViewEditor, {session: markRaw(session), modelId: 'M1', modelName: 'Orders', rowKey: key, revision: 0})}})
  const wrapper = mount(host, {global: {plugins: [ElementPlus, Spark.createPlugin()], stubs}})
  await flushPromises()
  return {f, session, wrapper, view, key, scenarioId, dispose() {wrapper.unmount(); runtime.dispose(); f.dispose(); config.global.stubs = originalStubs}}
}

it('exposes bound child-plan editing and explicit pagination through the original view editor', async () => {
  const {f, wrapper, view, key, scenarioId, dispose} = await fixture()
  try {
    await flushPromises()
    expect(wrapper.find('[data-query-plan]').exists()).toBe(true)
    const queryFields = wrapper.findAllComponents(FieldJson).filter(field => field.props('field') === 'queryConfig')
    expect(queryFields.some(field => Object.hasOwn(field.props('schema')?.properties ?? {}, 'pagination'))).toBe(true)
    await wrapper.get('[data-action="initialize-query-children"]').trigger('click'); await flushPromises()
    expect(view.getEditingRow(key)?.['queryConfig']).toEqual({outputType: 'Navigation', pagination: 'none', children: []})
    const rows = wrapper.findAllComponents(FieldJson).find(field => field.props('mode') === 'rows' && field.props('field') === 'queryConfig')!
    expect(rows.props('dataViewKey')).toBe(buildDataViewKey('DataViewDefinition', 'default', scenarioId))
    await rows.get('[data-json-add]').trigger('click'); await flushPromises()
    const rootFilter = wrapper.findAllComponents(RendererFilterExpression).find(field => field.props('field') === 'filterExpression')!
    expect(rootFilter.props('disabled')).toBe(true)
    expect(queryFields.every(field => field.props('mode') !== 'form' || field.props('readonly') === true)).toBe(true)
    await rows.get('[data-json-cancel-row]').trigger('click'); await flushPromises()
    expect(view.getEditingRow(key)?.['queryConfig']).toEqual({outputType: 'Navigation', pagination: 'none', children: []})
    expect(f.fileWrites).toEqual([])
  } finally {dispose()}
})


it('preserves a rejected model change until the user explicitly clears the old node configuration', async () => {
  const original = {outputType: 'Navigation', pagination: 'none', children: [{modelName: 'Legacy', fields: ['rowid'],
    filter: {field: 'rowid', operator: 'eq', value: false}, children: []}]}
  const f = await fixture(original)
  try {
    const rows = () => f.wrapper.findAllComponents(FieldJson).find(field => field.props('mode') === 'rows' && field.props('field') === 'queryConfig')!
    await rows().get('.el-table__body-wrapper tbody tr').trigger('click')
    await rows().get('[data-json-edit]').trigger('click'); await flushPromises()
    rows().getComponent(ElSelect).vm.$emit('update:modelValue', 'Customers'); await flushPromises()
    await rows().get('[data-json-save-row]').trigger('click'); await flushPromises()
    expect(rows().text()).toContain('请先显式移除旧字段')
    expect(f.view.getEditingRow(f.key)?.['queryConfig']).toEqual(original)
    await rows().get('[data-json-cancel-row]').trigger('click'); await flushPromises()
    const outline = f.wrapper.findAllComponents(FieldJson).find(field => field.props('mode') === 'outline')!
    await outline.get('.el-table__body-wrapper tbody tr').trigger('click'); await flushPromises()
    await f.wrapper.get('[data-action="clear-query-node"]').trigger('click'); await flushPromises()
    expect(f.view.getEditingRow(f.key)?.['queryConfig']).toEqual({...original, children: [{modelName: 'Legacy'}]})
    await f.wrapper.get('[data-action="query-plan-root"]').trigger('click'); await flushPromises()
    await rows().get('.el-table__body-wrapper tbody tr').trigger('click')
    await rows().get('[data-json-edit]').trigger('click'); await flushPromises()
    rows().getComponent(ElSelect).vm.$emit('update:modelValue', 'Customers'); await flushPromises()
    await rows().get('[data-json-save-row]').trigger('click'); await flushPromises()
    expect(f.view.getEditingRow(f.key)?.['queryConfig']).toEqual({...original, children: [{modelName: 'Customers'}]})
    expect(f.f.fileWrites).toEqual([])
  } finally {f.dispose()}
})

it('can explicitly remove malformed root children without overwriting the rest of the query', async () => {
  const f = await fixture({outputType: 'Navigation', pagination: 'none', children: 'broken', maxRows: 11})
  try {
    await f.wrapper.get('[data-action="remove-query-children"]').trigger('click'); await flushPromises()
    expect(f.view.getEditingRow(f.key)?.['queryConfig']).toEqual({outputType: 'Navigation', pagination: 'none', maxRows: 11})
    expect(f.f.fileWrites).toEqual([])
  } finally {f.dispose()}
})

it('makes source-mode conflicts explicit, hides independent controls and preserves full cancellation', async () => {
  const initial = {outputType: 'Navigation', pagination: 'none', fields: ['rowid'], children: [], maxRows: 11, cacheType: 'page'}
  const f = await fixture(initial)
  try {
    await f.wrapper.get('[data-action="switch-query-source"]').trigger('click'); await flushPromises()
    const dialog = f.wrapper.findAll('[role="dialog"]').at(-1)!
    expect(dialog.text()).toContain('children')
    await dialog.get('[data-action="confirm-query-source"]').trigger('click'); await flushPromises()
    expect(f.view.getEditingRow(f.key)?.['queryConfig']).toEqual({pagination: 'none', parentResult: {dataViewKey: '', childModelName: 'Orders'}})
    expect(f.wrapper.find('[data-query-output]').exists()).toBe(false)
    const parent = f.wrapper.findAllComponents(FieldJson).find(field => JSON.stringify(field.props('valuePath')) === '["parentResult"]')!
    parent.getComponent(ElSelect).vm.$emit('update:modelValue', 'A@Customers@default'); await flushPromises()
    expect(f.view.getEditingRow(f.key)?.['queryConfig']).toEqual({pagination: 'none', parentResult: {dataViewKey: 'A@Customers@default', childModelName: 'Orders'}})
    await f.wrapper.get('[data-action="discard-view-edits"]').trigger('click'); await flushPromises()
    expect(f.view.getEditingRow(f.key)?.['queryConfig']).toBeUndefined()
    expect(f.f.fileWrites).toEqual([])
  } finally {f.dispose()}
})


it('does not expose structural commands when the original queryConfig field is unreadable', async () => {
  const f = await fixture({outputType: 'Navigation', children: [{modelName: 'private-model', fields: ['private-field']}]})
  try {
    const original = f.view.fieldAccess.bind(f.view)
    vi.spyOn(f.view, 'fieldAccess').mockImplementation((row, field) => {
      const access = original(row, field)
      return field === 'queryConfig' ? {...access, read: 'invisible'} : access
    })
    f.view.events.emit('editingChanged'); await flushPromises()
    const plan = f.wrapper.getComponent(DataSpaceQueryPlan)
    expect(plan.find('[data-action="remove-query-children"]').exists()).toBe(false)
    expect(plan.find('[data-action="switch-query-source"]').exists()).toBe(false)
    expect(plan.text()).not.toContain('private-model')
    expect(f.f.fileWrites).toEqual([])
  } finally {f.dispose()}
})


it('builds a named Navigation child through standard row and field controls and persists through the original DataSet', async () => {
  const f = await fixture({outputType: 'Navigation', pagination: 'none'}, true)
  try {
    await f.wrapper.get('[data-action="initialize-query-children"]').trigger('click'); await flushPromises()
    const rows = f.wrapper.findAllComponents(FieldJson).find(field => field.props('mode') === 'rows' && field.props('field') === 'queryConfig')!
    await rows.get('[data-json-add]').trigger('click'); await flushPromises()
    rows.getComponent(ElSelect).vm.$emit('update:modelValue', 'Customers'); await flushPromises()
    await rows.get('[data-json-save-row]').trigger('click'); await flushPromises()
    const outline = f.wrapper.findAllComponents(FieldJson).find(field => field.props('mode') === 'outline')!
    await outline.get('.el-table__body-wrapper tbody tr').trigger('click'); await flushPromises()
    const fields = f.wrapper.findAllComponents(FieldJson).find(field => field.props('mode') === 'form' && JSON.stringify(field.props('valuePath')) === '["children",0]')!
    fields.getComponent(ElSelect).vm.$emit('update:modelValue', ['rowid']); await flushPromises()
    expect(f.view.getEditingRow(f.key)?.['queryConfig']).toEqual({outputType: 'Navigation', pagination: 'none', children: [{modelName: 'Customers', fields: ['rowid']}]})
    await f.wrapper.get('[data-action="save-views"]').trigger('click'); await flushPromises()
    expect(f.f.fileWrites, f.wrapper.text()).toHaveLength(1)
    const reopened = await f.f.open('A')
    expect(reopened.definitionDataSet!.getView('OrdersAlias', 'shared')!.queryConfig.children).toEqual([{modelName: 'Customers', fields: ['rowid']}])
  } finally {f.dispose()}
})

it.each(['Orders', 'Customers'])('rejects ancestor model %s in a nested level and retains the unfinished row for cancellation', async name => {
  const initial = {outputType: 'Navigation', pagination: 'none', children: [{modelName: 'Customers', fields: ['rowid']}]}
  const f = await fixture(initial)
  try {
    const outline = f.wrapper.findAllComponents(FieldJson).find(field => field.props('mode') === 'outline')!
    await outline.get('.el-table__body-wrapper tbody tr').trigger('click'); await flushPromises()
    await f.wrapper.get('[data-action="initialize-nested-children"]').trigger('click'); await flushPromises()
    const rows = f.wrapper.findAllComponents(FieldJson).find(field => field.props('mode') === 'rows' && field.props('field') === 'queryConfig')!
      await rows.get('[data-json-add]').trigger('click'); await flushPromises()
      rows.getComponent(ElSelect).vm.$emit('update:modelValue', name); await flushPromises()
      await rows.get('[data-json-save-row]').trigger('click'); await flushPromises()
      expect(rows.text()).toContain('当前层不能重复或循环引用模型')
      expect(f.view.getEditingRow(f.key)?.['queryConfig']).toEqual({...initial, children: [{...initial.children[0], children: []}]})
      await rows.get('[data-json-cancel-row]').trigger('click'); await flushPromises()
    expect(f.f.fileWrites).toEqual([])
  } finally {f.dispose()}
})

it('refuses structural writes after original field permission is revoked without changing the staged definition', async () => {
  const initial = {outputType: 'Navigation', pagination: 'none', children: [{modelName: 'Customers'}]}
  const f = await fixture(initial)
  try {
    const original = f.view.fieldAccess.bind(f.view)
    vi.spyOn(f.view, 'fieldAccess').mockImplementation((row, field) => {
      const access = original(row, field)
      return field === 'queryConfig' ? {...access, write: 'denied'} : access
    })
    await f.wrapper.get('[data-action="remove-query-children"]').trigger('click'); await flushPromises()
    expect(f.wrapper.getComponent(DataSpaceQueryPlan).text()).toContain('查询配置字段不可写')
    expect(f.view.getEditingRow(f.key)?.['queryConfig']).toEqual(initial)
    expect(f.f.fileWrites).toEqual([])
  } finally {f.dispose()}
})

it('reorders and deletes whole child subtrees without changing their unknown members and cancels all staged changes', async () => {
  const first = {modelName: 'Customers', fields: ['rowid'], custom: {keep: false}, children: [{modelName: 'Grand', fields: ['rowid']}]}
  const second = {modelName: 'Other', custom: {keep: 0}}
  const f = await fixture({outputType: 'Navigation', pagination: 'none', children: [first, second]})
  try {
    const rows = () => f.wrapper.findAllComponents(FieldJson).find(field => field.props('mode') === 'rows' && field.props('field') === 'queryConfig')!
    await rows().get('.el-table__body-wrapper tbody tr').trigger('click'); await flushPromises()
    await rows().get('[data-json-move-down]').trigger('click'); await flushPromises()
    expect(f.view.getEditingRow(f.key)?.['queryConfig']).toEqual({outputType: 'Navigation', pagination: 'none', children: [second, first]})
    await rows().findAll('.el-table__body-wrapper tbody tr')[1]!.trigger('click'); await flushPromises()
    await rows().get('[data-json-delete]').trigger('click'); await flushPromises()
    expect(f.view.getEditingRow(f.key)?.['queryConfig']).toEqual({outputType: 'Navigation', pagination: 'none', children: [second]})
    await f.wrapper.get('[data-action="discard-view-edits"]').trigger('click'); await flushPromises()
    expect(f.view.getEditingRow(f.key)?.['queryConfig']).toBeUndefined()
    expect(f.f.fileWrites).toEqual([])
  } finally {f.dispose()}
})


it('locks root request fields while preserving the original uncommitted filter editor and JSON draft', async () => {
  const f = await fixture()
  try {
    const filter = f.wrapper.findAllComponents(RendererFilterExpression).find(field => field.props('field') === 'filterExpression')!
    const editor = filter.getComponent(FilterExpressionEditor), instance = editor.vm.$.uid, body = new DOMWrapper(document.body)
    await editor.get('[data-action="open"]').trigger('click'); await flushPromises()
    await body.get('[data-action="json"]').trigger('click'); await flushPromises()
    await flushPromises()
    const draft = '{"field":"rowid","operator":"eq","value":"pending-filter"}'
    editor.getComponent(JsonTreeEditor).vm.$emit('update:modelValue', draft); await flushPromises()
    const request = f.wrapper.findAllComponents(FieldJson).filter(field => field.props('field') === 'queryConfig' && field.props('mode') === 'form' && !field.props('valuePath'))
    expect(request.length).toBeGreaterThan(0)
    expect(request.every(field => field.props('readonly') === true)).toBe(true)
    expect(filter.getComponent(FilterExpressionEditor).vm.$.uid).toBe(instance)
    expect(editor.getComponent(JsonTreeEditor).props('modelValue')).toBe(draft)
    expect(f.view.getEditingRow(f.key)?.['filterExpression']).toBeUndefined()
    await body.get('[data-action="cancel"]').trigger('click'); await flushPromises()
    expect(request.every(field => !field.props('readonly'))).toBe(true)
    expect(f.f.fileWrites).toEqual([])
  } finally {f.dispose()}
})


it.each(['Navigation', 'HierarchyData'])('creates and reopens a three-level %s plan through original standard controls', async outputType => {
  const f = await fixture({outputType, pagination: 'none'}, true, true)
  try {
    await f.wrapper.get('[data-action="initialize-query-children"]').trigger('click'); await flushPromises()
    const rows = () => f.wrapper.findAllComponents(FieldJson).find(field => field.props('mode') === 'rows' && field.props('field') === 'queryConfig')!
    const outline = () => f.wrapper.findAllComponents(FieldJson).find(field => field.props('mode') === 'outline')!
    for (const [index, modelName] of ['Customers', 'Grand'].entries()) {
      await rows().get('[data-json-add]').trigger('click'); await flushPromises()
      rows().getComponent(ElSelect).vm.$emit('update:modelValue', modelName); await flushPromises()
      await rows().get('[data-json-save-row]').trigger('click'); await flushPromises()
      const items = outline().findAll('.el-table__body-wrapper tbody tr')
      await items[index]!.trigger('click'); await flushPromises()
      const path = index === 0 ? '["children",0]' : '["children",0,"children",0]'
      const fields = f.wrapper.findAllComponents(FieldJson).find(field => field.props('mode') === 'form' && JSON.stringify(field.props('valuePath')) === path)!
      fields.getComponent(ElSelect).vm.$emit('update:modelValue', ['rowid']); await flushPromises()
      if (index === 0) {await f.wrapper.get('[data-action="initialize-nested-children"]').trigger('click'); await flushPromises()}
    }
    const expected = [{modelName: 'Customers', fields: ['rowid'], children: [{modelName: 'Grand', fields: ['rowid']}]}]
    expect(f.view.getEditingRow(f.key)?.['queryConfig']).toEqual({outputType, pagination: 'none', children: expected})
    await f.wrapper.get('[data-action="save-views"]').trigger('click'); await flushPromises()
    expect(f.f.fileWrites, f.wrapper.text()).toHaveLength(1)
    const reopened = await f.f.open('A')
    expect(reopened.definitionDataSet!.getView('OrdersAlias', 'shared')!.queryConfig.children).toEqual(expected)
  } finally {f.dispose()}
})
