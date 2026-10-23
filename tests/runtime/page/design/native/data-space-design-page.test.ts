import {afterEach, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest'
import {DOMWrapper, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {computed, defineComponent, h, inject, markRaw, onBeforeUnmount, provide, type PropType} from 'vue'
import {createMemoryHistory, createRouter} from 'vue-router'
import ElementPlus, {ElButton, ElInputNumber, ElSelect, ElOption, ElTabs, ElTabPane, ElRadioGroup, ElRadio, ElCheckbox, ElTree, ElPagination, ElTable, ElTableColumn} from 'element-plus'
import {getVuePageEntry} from '@/registries/vue-page-registry'
import {createDynamicRouter} from '../../../../../packages/spark-app/src/router/dynamic'
import {dataSpacePageFixture, designPageHost} from './data-space-page.fixture'
import {openLowcodeDataSpaceDesignSession} from '@/lowcode/data-space/lowcode-data-space-design'
import {Spark, registerAllRenderers, FilterValueFunctionDialog, JsonTreeEditor, FieldJson, FieldValueFunction, FieldCheckbox, FieldRadio, FieldSelect, FieldText, FieldTextarea, FieldNumber, RendererButton, RendererForm, RendererTable, RendererTree, RendererTabs, RendererDialog, RendererSection, PAGE_RUNTIME, useSparkComponent} from '@spark-appworks/spark-component'
import {RequestState, resolveDataViewKey} from '@spark-appworks/spark-data'
import {FilterExpressionEditor, RendererFilterExpression, SparkJsonEditor} from '@spark-appworks/spark-component'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import DataSpaceViewEditor from '@/views/features/data-platform/data-set-management/design/views/DataSpaceViewEditor.vue'
import DataSpaceQueryPreview from '@/views/features/data-platform/data-set-management/design/views/preview/DataSpaceQueryPreview.vue'
import DataSpaceModelEditor from '@/views/features/data-platform/data-set-management/design/ui/node-panel/data-set-design-node-panel.vue'
import DataSpaceModelRequest from '@/views/features/data-platform/data-set-management/design/ui/node-panel/DataSpaceModelRequest.vue'
import DataSpaceModelRename from '@/views/features/data-platform/data-set-management/design/model/rename/DataSpaceModelRename.vue'
import DataSpaceModelSource from '@/views/features/data-platform/data-set-management/design/model/source/DataSpaceModelSource.vue'
import DataSpaceTableConfiguration from '@/views/features/data-platform/data-set-management/design/ui/node-panel/configuration/DataSpaceTableConfiguration.vue'
import {DataSpaceSourceControls} from '@/views/features/data-platform/data-set-management/design/model/source/data-space-source-controls'
import DataSpaceBindingEditor from '@/views/features/data-platform/data-set-management/design/ui/cascades/binding/DataSpaceBindingEditor.vue'
import DataSpaceCascadeEditor from '@/views/features/data-platform/data-set-management/design/ui/cascades/DataSpaceCascadeEditor.vue'
import {isRecord} from '@spark-appworks/spark-utils'
import {VueFlow, useVueFlow} from '@vue-flow/core'
import {RendererGraph} from '@spark-appworks/spark-component'
import {DataSpaceLayoutEdit} from '@/views/features/data-platform/data-set-management/design/graph/data-space-layout-edit'
import definitionConfig from '../../../../../config/pages/data-platform/data-space-design/pagedata.json'

vi.mock('@/lowcode/data-space/lowcode-data-space-design', () => ({openLowcodeDataSpaceDesignSession: vi.fn()}))
const wrappers: ReturnType<typeof mount>[] = []

describe('native DataTable data processing', () => {
  it('keeps legacy local aggregates read-only through cancellation and an unrelated view save', async () => {
    const f = fixture({overviewOnly: true})
    const original = {oldCount: {type: 'count', field: 'rowid'}}
    f.stored.set('A', JSON.stringify({scenarioId: 'A', schemaVersion: 2, resourceRelations: [], tables: {
      OrdersAlias: {modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {default: {}, shared: {aggregates: original}}},
    }}))
    const {wrapper} = await page('?scenarioId=A', true); await select(wrapper, 'shared')
    const editor = wrapper.getComponent(DataSpaceViewEditor)
    expect(editor.find('[data-edit-property="aggregates"]').exists()).toBe(false)
    expect(editor.get('[data-legacy-aggregates]').text()).toContain('旧本地汇总')
    expect(editor.get('[data-legacy-aggregates]').text()).toContain('已停止旧配置的本地汇总')
    expect(editor.find('[data-action="initialize-query-output"]').exists()).toBe(true)
    const definitions = f.sessions[0]!.metadataDataSet.getView('DataViewDefinition', 'default')!
    const row = definitions.rows.find(row => row['viewId'] === 'shared')!, key = definitions.getPkKey(row)!
    await editor.get('[data-clear-property="aggregates"]').trigger('click'); await flushPromises()
    expect(definitions.getEditingRow(key)?.['aggregates']).toBeUndefined()
    await editor.get('[data-action="discard-view-edits"]').trigger('click'); await flushPromises()
    expect(definitions.getEditingRow(key)?.['aggregates']).toEqual(original)
    expect(f.fileWrites).toEqual([])
    await (await boundNumber(wrapper, 'pageSize')).setValue('19'); await flushPromises()
    await editor.get('[data-action="save-views"]').trigger('click'); await flushPromises()
    expect(f.fileWrites, editor.text()).toHaveLength(1)
    const retained = await f.open('A')
    const retainedView = retained.definitionDataSet!.getView('OrdersAlias', 'shared')!
    expect(retainedView.pageSize).toBe(19)
    expect(retainedView.aggregates).toEqual(original)
    expect(retainedView.aggregateError?.message).toContain('DATA_VIEW_REMOTE_AGGREGATE')
    expect(() => retainedView.aggregateResult).toThrow('DATA_VIEW_REMOTE_AGGREGATE')
    expect(writes(f)).toEqual([])
  }, 15_000)
  it('saves explicit legacy aggregate removal and reopens without changing other view settings', async () => {
    const f = fixture({overviewOnly: true})
    const original = {oldCount: {type: 'count', field: 'rowid'}}
    f.stored.set('A', JSON.stringify({scenarioId: 'A', schemaVersion: 2, resourceRelations: [], tables: {
      OrdersAlias: {modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {default: {}, shared: {pageSize: 19, aggregates: original}}},
    }}))
    const {wrapper} = await page('?scenarioId=A', true); await select(wrapper, 'shared')
    const editor = wrapper.getComponent(DataSpaceViewEditor)
    expect(editor.get('[data-legacy-aggregates]').text()).toContain('旧本地汇总')
    await editor.get('[data-clear-property="aggregates"]').trigger('click'); await flushPromises()
    await editor.get('[data-action="save-views"]').trigger('click'); await flushPromises()
    expect(f.fileWrites).toHaveLength(1)
    const reopened = await f.open('A')
    expect(reopened.definitionDataSet!.getView('OrdersAlias', 'shared')!.aggregates).toEqual({})
    expect(reopened.definitionDataSet!.getView('OrdersAlias', 'shared')!.aggregateError).toBeNull()
    expect(reopened.definitionDataSet!.getView('OrdersAlias', 'shared')!.pageSize).toBe(19)
    expect(writes(f)).toEqual([])
  })
  it('edits completion through the bound definition view, cancels and saves for independent runtime assembly', async () => {
    const f = fixture({overviewOnly: true}), {wrapper, instance} = await page('?scenarioId=A', true)
    await select(wrapper, 'shared')
    const editor = wrapper.getComponent(DataSpaceViewEditor)
    const input = () => editor.get('[data-completion-config]').getComponent(FieldText).get('input')
    await input().setValue('ordersLoaded'); await input().trigger('change'); await flushPromises()
    expect(instance.isDirty).toBe(true)
    await editor.get('[data-action="discard-view-edits"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false); expect(f.fileWrites).toHaveLength(0)
    expect(input().element.value).toBe('')
    await input().setValue('ordersLoaded'); await input().trigger('change'); await flushPromises()
    await editor.get('[data-action="save-views"]').trigger('click'); await flushPromises()
    expect(instance.isDirty, editor.text()).toBe(false)
    expect(f.fileWrites).toHaveLength(1); expect(writes(f)).toEqual([])
    const fresh = await f.open('A')
    try {
      expect(fresh.definitionDataSet!.getView('OrdersAlias', 'shared')!.onRequestComplete).toBe('ordersLoaded')
      expect(fresh.definitionDataSet!.getView('OrdersAlias', 'default')!.onRequestComplete).toBe('')
    } finally {fresh.dispose()}
  })
  it.each(['legacy', 'native'])('edits %s computed fields in the model workspace and uses its top save without writing DB fields', async format => {
    const f = fixture({overviewOnly: true})
    if (format === 'native') {
      f.stored.set('A', JSON.stringify({scenarioId: 'A', schemaVersion: 2, resourceRelations: [], tables: {
        OrdersAlias: {modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {default: {}, shared: {pageSize: 12}}},
        CustomersAlias: {modelBinding: {modelId: 'M2', modelName: 'Customers'}, views: {default: {}, shared: {pageSize: 24}}},
        Unavailable: {modelBinding: {modelId: 'UNAVAILABLE', modelName: 'Unavailable'}, views: {default: {}}},
      }}))
    }
    const {wrapper, instance} = await page('?scenarioId=A', true)
    await select(wrapper, 'Orders')
    expect(wrapper.findComponent(DataSpaceTableConfiguration).exists()).toBe(false)
    await wrapper.get('[data-local-computed] .renderer-section-toggle').trigger('click'); await flushPromises()
    const editor = wrapper.getComponent(DataSpaceTableConfiguration)
    expect(editor.props('section')).toBe('columns')
    await editor.get('[data-action="initialize-table-columns"]').trigger('click'); await flushPromises()
    const json = editor.getComponent(FieldJson)
    await json.get('[data-json-add]').trigger('click'); await flushPromises()
    expect(wrapper.get('[data-action="save-model-workspace"]').attributes('disabled')).toBeDefined()
    const text = json.findAllComponents(FieldText)
    for (const [index, value] of ['displayName', '显示名', 'string'].entries()) {
      await text[index]!.get('input').setValue(value); await text[index]!.get('input').trigger('change')
    }
    const expression = json.getComponent(FieldTextarea).get('textarea')
    await expression.setValue("name + '!'"); await expression.trigger('change')
    await json.get('[data-json-save-row]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(true)
    await select(wrapper, 'Customers'); expect(wrapper.get('.design-detail h2').text()).toBe('Orders')
    await wrapper.get('[data-action="save-model-workspace"]').trigger('click'); await flushPromises()
    expect(editor.text()).toContain('字段配置已保存并回读确认')
    expect(instance.isDirty).toBe(false)
    expect(f.fileWrites).toHaveLength(1); expect(writes(f)).toEqual([])
    expect(JSON.parse(f.stored.get('A')!).tables.OrdersAlias.columns).toEqual([
      {name: 'displayName', label: '显示名', type: 'string', computeExpression: "name + '!'"},
    ])
    if (format === 'native') {
      expect(f.assemblyScopes).toEqual([['OrdersAlias']])
      expect(JSON.parse(f.stored.get('A')!).tables.Unavailable.modelBinding.modelId).toBe('UNAVAILABLE')
      const reopened = await f.open('A', {deferDefinition: true})
      expect(reopened.metadataDataSet.getView('DataTableBindingDefinition')!.rows
        .find(row => row['tableName'] === 'OrdersAlias')?.['configuration']).toMatchObject({columns: [
        {name: 'displayName', computeExpression: "name + '!'"},
      ]})
    }
  })

  async function openProcess() {
    const mounted = await page('?scenarioId=A', true)
    await select(mounted.wrapper, 'Orders')
    await mounted.wrapper.getComponent(RendererTabs).get('#tab-dataProcess').trigger('click'); await flushPromises()
    return {...mounted, editor: mounted.wrapper.getComponent(DataSpaceTableConfiguration)}
  }
  async function member(editor: Pick<VueWrapper, 'get'>, name: string, value: string) {
    const input = editor.get(`[data-json-member="${name}"] input, [data-json-member="${name}"] textarea`)
    await input.setValue(value); await input.trigger('change'); await flushPromises()
  }
  function processView(editor: Pick<VueWrapper, 'findAllComponents'>, session: ReturnType<typeof fixture>['sessions'][number]) {
    const form = editor.findAllComponents(RendererForm).find(form => form.findComponent(FieldJson).exists())!
    return resolveDataViewKey(form.props('dataViewKey')!, session.metadataDataSet)!
  }
  it('edits native API and strategies through standard bindings and reopens the actual configured query', async () => {
    const f = fixture({overviewOnly: true, queryEndpoint: '/api/Orders/query'})
    f.setModelValues({addApi: 'LegacyWriteOrders'})
    const {wrapper, editor, instance} = await openProcess()
    const original = JSON.parse(f.stored.get('A')!)
    expect(editor.findComponent(DataSpaceModelSource).exists()).toBe(false)
    await editor.get('.renderer-section-toggle').trigger('click'); await flushPromises()
    expect(editor.findAllComponents(FieldText).find(field => field.props('field') === 'addApi')!.get('input').element.value).toBe('LegacyWriteOrders')
    const assembliesBefore = f.assemblyScopes.length
    await member(editor, 'url', '/api/Orders/query')
    await member(editor, 'params', '{"purpose":"designer"}')
    await member(editor, 'headers', '{"x-query-purpose":"designer"}')
    await member(editor, 'timeout', '4500')
    expect(instance.isDirty).toBe(true)
    const view = processView(editor, f.sessions[0]!)
    expect(view.tableName).toBe('DataTableBindingDefinition')
    expect(view.rows.map(row => row['tableName'])).toEqual(['OrdersAlias'])
    expect(view.currentRow?.['tableName']).toBe('OrdersAlias')
    await wrapper.get('[data-action="save-model-workspace"]').trigger('click'); await flushPromises()
    expect(instance.isDirty, editor.text()).toBe(false)
    expect(f.fileWrites).toHaveLength(1); expect(writes(f)).toEqual([])
    expect(f.assemblyScopes).toHaveLength(assembliesBefore)
    const stored = JSON.parse(f.stored.get('A')!)
    expect(stored.tables.OrdersAlias.views).toEqual(original.tables.OrdersAlias.views)
    expect(stored.tables.CustomersAlias).toEqual(original.tables.CustomersAlias)
    const reopened = await f.open('A'), table = reopened.definitionDataSet!.getTable('OrdersAlias')!
    expect(table.api?.list).toMatchObject({url: '/api/Orders/query', params: {purpose: 'designer'}, headers: {'x-query-purpose': 'designer'}})
    expect(table.crudConfig).toEqual({timeout: 4500})
    expect(reopened.metadataDataSet.getView('Base_DataModel')!.getEditingRow('M1')?.['addApi']).toBe('LegacyWriteOrders')
    for (const id of ['default', 'shared']) {
      expect((await table.getView(id)!.loadFromServer()).success).toBe(true)
      const request = f.requests.at(-1)!
      expect(request).toMatchObject({url: '/api/Orders/query', timeout: 4500, headers: {'x-query-purpose': 'designer'}})
      expect(Object.entries(request.headers ?? {}).find(([key]) => key.toLowerCase() === 'x-formkey')?.[1]).toBe('A')
      expect(request.params).toMatchObject({purpose: 'designer'})
    }
  })
  it('protects API drafts across model and URL changes and cancels only its native view', async () => {
    const f = fixture({overviewOnly: true}), {wrapper, editor, instance} = await openProcess()
    await member(editor, 'url', '/api/Orders/cancelled')
    expect(instance.isDirty).toBe(true)
    await select(wrapper, 'Customers'); expect(wrapper.get('.design-detail h2').text()).toBe('Orders')
    await wrapper.vm.$router.push('?scenarioId=B'); await flushPromises()
    expect(f.sessions).toHaveLength(1)
    await editor.get('[data-action="discard-table-api"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false); expect(writes(f)).toEqual([]); expect(f.fileWrites).toEqual([])
    expect(processView(editor, f.sessions[0]!).getEditingRow(processView(editor, f.sessions[0]!).getPkKey(processView(editor, f.sessions[0]!).currentRow!)!)?.['configuration']).not.toHaveProperty('api')
  })
  it.each(['correct', 'cancel'] as const)('protects unfinished process JSON until explicit %s and saves only accepted configuration', async finish => {
    const f = fixture({overviewOnly: true}), {wrapper, editor, instance} = await openProcess()
    const input = editor.get<HTMLTextAreaElement>('[data-json-member="params"] textarea')
    input.element.value = '{"probe":'; await input.trigger('input'); await flushPromises()
    await input.trigger('change'); await flushPromises()
    expect(instance.isDirty).toBe(true)
    expect(editor.getComponent(ElRadioGroup).props('disabled')).toBe(true)
    expect(wrapper.get('[data-action="save-model-workspace"]').attributes('disabled')).toBeDefined()
    await select(wrapper, 'Customers'); expect(wrapper.get('.design-detail h2').text()).toBe('Orders')
    await wrapper.vm.$router.push('?scenarioId=B'); await flushPromises(); expect(f.sessions).toHaveLength(1)
    await wrapper.getComponent(RendererTabs).get('#tab-source').trigger('click'); await flushPromises()
    expect(wrapper.findComponent(DataSpaceTableConfiguration).exists()).toBe(true)
    expect(wrapper.getComponent(RendererTabs).get('#tab-dataProcess').attributes('aria-selected')).toBe('true')
    expect(input.element.value).toBe('{"probe":')
    expect(f.fileWrites).toEqual([]); expect(writes(f)).toEqual([])
    if (finish === 'correct') {
      await input.setValue('{"probe":false}'); await flushPromises()
      expect(processView(editor, f.sessions[0]!).getEditingRow(processView(editor, f.sessions[0]!).getPkKey(processView(editor, f.sessions[0]!).currentRow!)!)?.['configuration']).toMatchObject({api:{list:{params:{probe:false}}}})
      await member(editor, 'url', '/api/Orders/query')
      expect(editor.getComponent(ElRadioGroup).props('disabled')).toBe(false)
      expect(wrapper.get('[data-action="save-model-workspace"]').attributes('disabled'), editor.text()).toBeUndefined()
      await wrapper.get('[data-action="save-model-workspace"]').trigger('click'); await flushPromises()
      const reopened = await f.open('A')
      expect(reopened.definitionDataSet!.getTable('OrdersAlias')!.api?.list?.params).toEqual({probe:false})
      expect(f.fileWrites).toHaveLength(1)
    } else {
      await editor.get('[data-json-member="params"] [data-json-cancel-input]').trigger('click'); await flushPromises()
      expect(editor.getComponent(ElRadioGroup).props('disabled')).toBe(false)
      expect(input.element.value).toBe('')
      expect(f.fileWrites).toEqual([])
    }
    expect(instance.isDirty, editor.text()).toBe(false)
    expect(writes(f)).toEqual([])
  })
  it('rejects invalid API configuration before writing and preserves the draft for correction', async () => {
    const f = fixture({overviewOnly: true}), {wrapper, editor, instance} = await openProcess()
    await member(editor, 'url', 'https://wrong.example/query')
    await wrapper.get('[data-action="save-model-workspace"]').trigger('click'); await flushPromises()
    expect(editor.text()).toContain('api.list 请求端点必须是')
    expect(instance.isDirty).toBe(true); expect(f.fileWrites).toEqual([])
    await member(editor, 'url', '/api/Orders/query')
    await editor.get('[data-action="discard-table-api"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false)
  })
  it.each([false, true])('creates a missing native binding with a default view and preserves CRUD mappings with unavailable unrelated=%s', async unrelated => {
    const f = fixture({overviewOnly: true})
    f.stored.set('A', JSON.stringify({scenarioId: 'A', schemaVersion: 2, resourceRelations: [], tables: unrelated ? {
      Unavailable: {modelBinding: {modelId: 'UNAVAILABLE', modelName: 'Unavailable'}, views: {default: {}}},
    } : {}}))
    const {wrapper, editor, instance} = await openProcess()
    await editor.get('[data-action="create-table-api-binding"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(true); expect(f.fileWrites).toEqual([])
    await editor.get('[data-action="discard-table-api"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false)
    await editor.get('[data-action="create-table-api-binding"]').trigger('click'); await flushPromises()
    for (const operation of ['create', 'update', 'delete']) {
      editor.getComponent(ElRadioGroup).vm.$emit('update:modelValue', operation); await flushPromises()
      await member(editor, 'url', '/api/Orders/write')
    }
    await wrapper.get('[data-action="save-model-workspace"]').trigger('click'); await flushPromises()
    expect(instance.isDirty, editor.text()).toBe(false)
    expect(f.assemblyScopes).toEqual([['Orders']])
    const reopened = await f.open('A', {deferDefinition: true})
    const preview = await reopened.openPreview({tableName: 'Orders', viewId: 'default', modelId: 'M1', modelName: 'Orders'})
    try {
      const table = preview.view.dataTable!
      expect(table.modelBinding).toEqual({modelId: 'M1', modelName: 'Orders'})
      expect(table.getView('default')).toBeDefined()
      expect(table.api).toEqual(Object.fromEntries(['create', 'update', 'delete'].map(operation => [operation, {url: '/api/Orders/write'}])))
    } finally {preview.dispose()}
    if (unrelated) expect(JSON.parse(f.stored.get('A')!).tables.Unavailable.modelBinding.modelId).toBe('UNAVAILABLE')
    expect(f.fileWrites).toHaveLength(1); expect(writes(f)).toEqual([])
  })
  it.each([false, true])('retains a shared view directory refresh after a model configuration save (failed read=%s)', async failedRead => {
    const f = fixture({overviewOnly: true})
    f.stored.set('A', JSON.stringify({scenarioId: 'A', schemaVersion: 2, resourceRelations: [], tables: {
      CustomersAlias: {modelBinding: {modelId: 'M2', modelName: 'Customers'}, views: {default: {}, shared: {pageSize: 24}}},
    }}))
    const {wrapper, editor} = await openProcess()
    await editor.get('[data-action="create-table-api-binding"]').trigger('click'); await flushPromises()
    await member(editor, 'url', '/api/Orders/query')
    const dataSet = f.sessions[0]!.metadataDataSet, views = dataSet.getView('DataViewDefinition')!
    const save = dataSet.saveChanges.bind(dataSet)
    vi.spyOn(dataSet, 'saveChanges').mockImplementationOnce(async options => {
      const result = await save(options)
      const customer = views.rows.find(row => row['tableName'] === 'CustomersAlias' && row['viewId'] === 'shared')!
      views.updateEditingValue(views.getPkKey(customer)!, 'pageSize', 39)
      return result
    })
    await wrapper.get('[data-action="save-model-workspace"]').trigger('click'); await flushPromises()
    expect(views.hasEditingChanges()).toBe(true)
    expect(views.refreshPending).toBe(true)
    expect(views.rows.some(row => row['tableName'] === 'Orders')).toBe(false)
    expect(editor.text()).toContain('目录将在当前修改或操作结束后更新')
    if (failedRead) vi.spyOn(views, 'loadFromServer').mockRejectedValueOnce(new Error('共享目录查询失败'))
    views.discardPendingChanges()
    if (failedRead) {
      await vi.waitFor(() => expect(views.requestState).toBe(RequestState.Failed))
      await flushPromises()
      expect(editor.text()).toContain('共享目录查询失败')
      await editor.get('[data-action="reload-table-directory"]').trigger('click'); await flushPromises()
    }
    await vi.waitFor(() => expect(views.rows.some(row => row['tableName'] === 'Orders' && row['viewId'] === 'default')).toBe(true))
    expect(views.refreshPending).toBe(false)
    expect(views.rows.find(row => row['tableName'] === 'CustomersAlias' && row['viewId'] === 'shared')?.['pageSize']).toBe(24)
    const reopened = await f.open('A')
    expect(reopened.definitionDataSet?.getTable('Orders')?.api?.list?.url).toBe('/api/Orders/query')
    expect(reopened.definitionDataSet?.getView('Orders', 'default')).toBeDefined()
    expect(f.fileWrites).toHaveLength(1)
  })
  it('verifies an unknown file receipt through the original DataSet save without replaying the write', async () => {
    const f = fixture({overviewOnly: true}), {wrapper, editor, instance} = await openProcess()
    await member(editor, 'url', '/api/Orders/query')
    f.loseNextFileResponse()
    await wrapper.get('[data-action="save-model-workspace"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(true); expect(f.fileWrites).toHaveLength(1)
    expect(editor.get('[data-action="discard-table-api"]').attributes('disabled')).toBeDefined()
    await editor.findAll('button').find(button => button.text() === '核验数据处理提交')!.trigger('click'); await flushPromises()
    expect(instance.isDirty, editor.text()).toBe(false); expect(f.fileWrites).toHaveLength(1)
    expect((await f.open('A')).definitionDataSet!.getTable('OrdersAlias')!.api?.list?.url).toBe('/api/Orders/query')
  })
})

describe('cached target reopening', () => {
  it.each(['changed', 'deleted'] as const)('reopens the same workspace and renders the %s remote definition without uploading', async change => {
    const f = fixture({overviewOnly: true, sharedWorkspace: true, missing: true})
    const config = {scenarioId: 'A', schemaVersion: 2, resourceRelations: [], tables: {
      OrdersAlias: {modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {default: {}, shared: {pageSize: 12}}},
    }}
    f.stored.set('A', JSON.stringify(config))
    const {wrapper, instance} = await page('?scenarioId=A', true)
    if (change === 'deleted') f.stored.delete('A')
    else f.stored.set('A', JSON.stringify({...config, tables: {OrdersAlias: {...config.tables.OrdersAlias,
      views: {default: {}, fromRemote: {pageSize: 47}}}}}))
    const writesBefore = f.fileWrites.length
    await wrapper.findAll('button').find(button => button.text() === '重新打开')!.trigger('click'); await flushPromises()
    expect(f.workspaces).toHaveLength(2); expect(f.workspaces[0]).toBe(f.workspaces[1])
    expect(f.sessions[0]!.metadataDataSet.destroyed).toBe(true)
    const reopened = f.sessions[1]!, definitions = reopened.metadataDataSet.getView('DataViewDefinition')!
    if (change === 'deleted') {
      expect(reopened.viewState).toBeNull(); expect(definitions.rows).toEqual([])
      expect(wrapper.text()).toContain('尚无视图配置；正式模型、字段和输入参数仍可维护。')
    } else {
      await select(wrapper, 'fromRemote')
      expect(wrapper.getComponent(DataSpaceViewEditor).text()).toContain('fromRemote')
      expect(definitions.rows.find(row => row['viewId'] === 'fromRemote')?.['pageSize']).toBe(47)
      expect(definitions.rows.some(row => row['viewId'] === 'shared')).toBe(false)
    }
    expect(instance.isDirty).toBe(false); expect(f.fileWrites).toHaveLength(writesBefore); expect(writes(f)).toEqual([])
  })
})

describe('file model workspace', () => {
  it('binds tool file request parameters to the native view and previews a published snapshot without saving it', async () => {
    const f = fixture({overviewOnly: true, pageFiles: {readPageFile: async input => {
      expect(input.pageId).toBe('ONE'); expect(input.fileName).toBe('rule.json')
      return JSON.stringify({type: 'r-text', props: {label: input.versionId === 'v1' ? 'Published text' : 'Working text'}})
    }}})
    f.stored.set('A', JSON.stringify({scenarioId: 'A', schemaVersion: 2, resourceRelations: [], tables: {
      ProjectToolFile: {...definitionConfig.tables.ProjectToolFile, views: {default: {}, toolRequests: {
        queryContext: {pageId: 'ONE', fileName: 'rule.json', versionId: 'v1'}, commitMode: 'staged',
      }}},
    }}))
    const {wrapper, instance} = await page('?scenarioId=A', true)
    await select(wrapper, 'toolRequests')
    const editor = wrapper.getComponent(DataSpaceViewEditor)
    for (const field of ['pageId', 'fileName', 'versionId']) expect(editor.find(`[data-json-property="${field}"]`).exists()).toBe(true)
    expect(editor.find('[data-json-property="dataSpaceId"]').exists()).toBe(false)
    await editor.get('[data-action="open-query-preview"]').trigger('click'); await flushPromises()
    const preview = wrapper.getComponent(DataSpaceQueryPreview)
    for (const field of ['pageId', 'fileName', 'versionId']) expect(preview.find(`[data-json-property="${field}"]`).exists()).toBe(true)
    await preview.get('[data-action="run-query-preview"]').trigger('click'); await flushPromises()
    const result = preview.findAllComponents(FieldJson).find(field => field.props('dataMember') === 'rows')!
    expect(result.getComponent(JsonTreeEditor).props('modelValue')).toContain('Published text')
    expect(instance.isDirty).toBe(false); expect(f.fileWrites).toEqual([]); expect(writes(f)).toEqual([])
  })
  function fileConfig() {
    return {scenarioId: 'A', schemaVersion: 2, resourceRelations: [], tables: {
      DataViewDefinition: {...definitionConfig.tables.DataViewDefinition, views: {default: {autoLoad: false, queryContext: {dataSpaceId: 'A'}}, compact: {autoLoad: false, pageSize: 7, queryContext: {dataSpaceId: 'A'}}}},
    }}
  }
  it('retains native view and binding edits when the remote file changes after preview', async () => {
    const f=fixture({overviewOnly:true}), original=fileConfig()
    f.stored.set('A',JSON.stringify(original))
    const {wrapper,instance}=await page(),session=f.sessions[0]!
    await select(wrapper,'compact')
    await (await boundNumber(wrapper, 'pageSize')).setValue('33'); await flushPromises()
    const views=session.metadataDataSet.getView('DataViewDefinition')!, row=views.rows.find(row=>row['viewId']==='compact')!,key=views.getPkKey(row)!
    const bindings=session.metadataDataSet.getView('DataTableBindingDefinition')!, binding=bindings.rows.find(row=>row['tableName']==='DataViewDefinition')!, bindingKey=bindings.getPkKey(binding)!
    const config=structuredClone(binding['configuration'])
    expect(isRecord(config)).toBe(true)
    if(!isRecord(config)) throw new Error('file configuration missing')
    config['primaryKey']='viewId';bindings.updateEditingValue(bindingKey,'configuration',config)
    await flushPromises()
    const editor=wrapper.getComponent(DataSpaceViewEditor)
    await editor.get('[data-action="preview-remote-views"]').trigger('click');await flushPromises()
    f.stored.set('A',JSON.stringify({...original,version:2}))
    await editor.get('[data-action="adopt-remote-views"]').trigger('click');await flushPromises()
    expect(editor.text()).toContain('SCENARIO_VIEW_PREVIEW_CHANGED')
    expect(views.getEditingRow(key)?.['pageSize']).toBe(33)
    expect(bindings.getEditingRow(bindingKey)?.['configuration']).toEqual(config)
    expect(instance.isDirty).toBe(true);expect(f.fileWrites).toEqual([]);expect(writes(f)).toEqual([])
  })
  it('configures file query inputs and modes through native views and retains them across preview interactions',async()=>{
    const f=fixture({overviewOnly:true}),original=fileConfig()
    f.stored.set('A',JSON.stringify(original))
    f.stored.set('B',JSON.stringify({...original,scenarioId:'B'}))
    const {wrapper,instance}=await page('?scenarioId=A',true)
    await select(wrapper,'compact')
    const editor=wrapper.getComponent(DataSpaceViewEditor)
    expect(editor.get('[data-request-workspace]').text()).not.toContain('关联表查询')
    expect(editor.get('[data-request-workspace]').text()).not.toContain('自引用参数')
    const parameter=()=>editor.get('[data-json-property="dataSpaceId"]')
    expect(parameter().element).toBeDefined()
    await parameter().setValue('B');await flushPromises()
    expect(instance.isDirty).toBe(true)
    await editor.get('[data-action="discard-view-edits"]').trigger('click');await flushPromises()
    expect(instance.isDirty).toBe(false);expect(f.fileWrites).toEqual([])
    await parameter().setValue('B');await flushPromises()
    await editor.get('[data-action="save-views"]').trigger('click');await flushPromises()
    expect(instance.isDirty,wrapper.text()).toBe(false)
    expect(JSON.parse(f.stored.get('A')!).tables.DataViewDefinition.views.compact.queryContext).toEqual({dataSpaceId:'B'})
    const reopened=await f.open('A',{deferDefinition:true})
    const saved=reopened.metadataDataSet.getView('DataViewDefinition')!.rows.find(row=>row['viewId']==='compact')!
    expect(saved['queryContext']).toEqual({dataSpaceId:'B'})
    await editor.get('[data-action="open-query-preview"]').trigger('click');await flushPromises()
    const preview=wrapper.getComponent(DataSpaceQueryPreview)
    const output=preview.findAllComponents(FieldRadio).find(field=>field.props('field')==='outputType')!
    expect(output.props('options')).toEqual([{label: '沿用视图默认', value: ''}, {label: '列表查询', value: 'Table'}, {label: '完整集合（不分页）', value: 'SelfRefData'}])
    expect(preview.find('[data-json-property="dataSpaceId"]').exists()).toBe(true)
    await preview.get('[data-action="run-query-preview"]').trigger('click');await flushPromises()
    const result=preview.findAllComponents(FieldJson).find(field=>field.props('dataMember')==='rows')!
    expect(result.getComponent(JsonTreeEditor).props('modelValue')).toContain('B')
    await preview.get('[data-json-property="dataSpaceId"]').setValue('A');await flushPromises()
    expect(result.getComponent(JsonTreeEditor).props('modelValue')).toContain('compact')
    expect(preview.findAllComponents(FieldSelect).some(field=>field.props('field')==='keyField')).toBe(false)
    await preview.get('[data-action="close-query-preview"]').trigger('click');await flushPromises()
    expect(JSON.parse(f.stored.get('A')!).tables.DataViewDefinition.views.compact.queryContext).toEqual({dataSpaceId:'B'})
    expect(f.fileWrites).toHaveLength(1);expect(writes(f)).toEqual([]);expect(f.modelReads).toEqual([])
  })
  it('edits file columns with standard bound rows, guards unfinished edits, cancels and independently reopens saved fields', async () => {
    const f=fixture({overviewOnly:true}), original=fileConfig()
    f.stored.set('A',JSON.stringify(original))
    const {wrapper,instance}=await page('?scenarioId=A',true),session=f.sessions[0]!
    await select(wrapper,'DataViewDefinition')
    const tab=wrapper.findAll('[role="tab"]').find(item=>item.text()==='字段')
    expect(tab,'file field workspace').toBeDefined();await tab!.trigger('click');await flushPromises()
    const editor=wrapper.findAllComponents(FieldJson).find(field=>field.props('mode')==='rows' && field.props('field')==='configuration')!
    expect(editor.props('dataViewKey')).toBe('META@DataTableBindingDefinition@default')
    expect(editor.props('valuePath')).toEqual(['columns'])
    const bindings=session.metadataDataSet.getView('DataTableBindingDefinition')!, key=bindings.getPkKey(bindings.currentRow!)!
    const change=async()=>{
      expect(editor.text()).toContain('viewId')
      await editor.findAll('.el-table__body tr').find(row=>row.text().includes('viewId'))!.trigger('click')
      await editor.get('[data-json-edit]').trigger('click');await flushPromises()
      await editor.findAll('.el-table__body input[type="text"]')[1]!.setValue('字段列表新标题');await flushPromises()
    }
    await change()
    expect(instance.isDirty).toBe(true);expect(bindings.hasEditingChanges()).toBe(false)
    expect(wrapper.get('[data-action="close-definition"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-action="save-file-model"]').attributes('disabled')).toBeDefined()
    for (const name of ['1 模型','数据视图']) {
      await wrapper.findAll('[role="tab"]').find(item=>item.text()===name)!.trigger('click');await flushPromises()
      expect(tab!.attributes('aria-selected')).toBe('true')
    }
    await editor.get('[data-json-cancel-row]').trigger('click');await flushPromises()
    expect(instance.isDirty).toBe(false)
    await change();await editor.get('[data-json-save-row]').trigger('click');await flushPromises()
    const columns=()=>{const value=bindings.getEditingRow(key)!['configuration'];return isRecord(value)?value['columns']:undefined}
    expect(columns()).toEqual(original.tables.DataViewDefinition.columns.map(column=>column.name==='viewId'?{...column,label:'字段列表新标题'}:column))
    await wrapper.get('[data-action="discard-file-model"]').trigger('click');await flushPromises()
    expect(columns()).toEqual(original.tables.DataViewDefinition.columns);expect(f.fileWrites).toEqual([])
    await change();await editor.get('[data-json-save-row]').trigger('click');await flushPromises()
    await wrapper.get('[data-action="save-file-model"]').trigger('click');await flushPromises()
    expect(instance.isDirty,wrapper.text()).toBe(false);expect(f.fileWrites).toHaveLength(1);expect(writes(f)).toEqual([])
    const saved=JSON.parse(f.stored.get('A')!)
    expect(saved.tables.DataViewDefinition).toEqual({...original.tables.DataViewDefinition,columns:original.tables.DataViewDefinition.columns.map(column=>column.name==='viewId'?{...column,label:'字段列表新标题'}:column)})
    const reopened=await f.open('A',{deferDefinition:true})
    const binding=reopened.metadataDataSet.getView('DataTableBindingDefinition')!.rows.find(row=>row['tableName']==='DataViewDefinition')!
    expect(binding['configuration']).toEqual(bindings.currentRow!['configuration']);expect(f.modelReads).toEqual([])
  })
  it('previews, cancels and saves a file model removal through its native binding without loading database fields', async () => {
    const f = fixture({overviewOnly: true}), original = {...fileConfig(), layout: {tablePositions: {DataViewDefinition: {x: 30, y: 40}}},
      tables: {...fileConfig().tables, OrdersAlias: {modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {default: {}}}}}
    f.stored.set('A', JSON.stringify(original))
    const {wrapper, instance} = await page(), session = f.sessions[0]!
    await select(wrapper, 'DataViewDefinition'); await select(wrapper, 'compact')
    const editor = wrapper.getComponent(DataSpaceViewEditor), bindings = session.metadataDataSet.getView('DataTableBindingDefinition')!
    const row = bindings.rows.find(item => item['tableName'] === 'DataViewDefinition')!, key = bindings.getPkKey(row)!
    f.modelReads.length = 0; f.assemblyScopes.length = 0
    const preview = async () => {await editor.get('[data-action="preview-remove-binding"]').trigger('click'); await flushPromises()}
    const confirm = async () => {await editor.get('[data-action="confirm-remove-binding"]').trigger('click'); await flushPromises()}
    await preview()
    expect(editor.get('[data-binding-removal]').text()).toContain('文件模型')
    expect(editor.get('[data-binding-removal]').text()).toContain('default、compact')
    await editor.get('[data-action="cancel-remove-binding"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false)
    await preview(); await confirm()
    expect(bindings.dirtyTracking.isPendingDelete(key), wrapper.text()).toBe(true)
    expect(instance.isDirty).toBe(true); expect(f.fileWrites).toEqual([])
    await editor.get('[data-action="discard-view-edits"]').trigger('click'); await flushPromises()
    expect(bindings.rows.some(item => bindings.getPkKey(item) === key)).toBe(true)
    expect(instance.isDirty).toBe(false)
    await chooseBound(editor, '已有模型绑定', 'DataViewDefinition')
    await preview(); await confirm()
    await editor.get('[data-action="save-views"]').trigger('click'); await flushPromises()
    expect(f.fileWrites, wrapper.text()).toHaveLength(1)
    expect(writes(f)).toEqual([]); expect(f.modelReads).toEqual([]); expect(f.assemblyScopes).toEqual([])
    expect(instance.isDirty).toBe(false)
    const saved = JSON.parse(f.stored.get('A')!)
    expect(saved.tables.DataViewDefinition).toBeUndefined(); expect(saved.tables.OrdersAlias).toEqual(original.tables.OrdersAlias)
    expect(saved.layout.tablePositions).toEqual({})
    expect(wrapper.getComponent(RendererGraph).getComponent(VueFlow).props('nodes')!.map(node => node.data.title)).not.toContain('DataViewDefinition')
    const reopened = await f.open('A', {deferDefinition: true})
    expect(reopened.metadataDataSet.getView('DataTableBindingDefinition')!.rows.map(item => item['tableName'])).toEqual(['OrdersAlias'])
  })
  it('keeps the file removal workspace available for an unknown receipt and verifies without replaying the write', async () => {
    const f = fixture({overviewOnly: true})
    f.stored.set('A', JSON.stringify(fileConfig()))
    const {wrapper, instance} = await page()
    await select(wrapper, 'DataViewDefinition'); await select(wrapper, 'compact')
    const editor = wrapper.getComponent(DataSpaceViewEditor)
    await editor.get('[data-action="preview-remove-binding"]').trigger('click'); await flushPromises()
    await editor.get('[data-action="confirm-remove-binding"]').trigger('click'); await flushPromises()
    f.loseNextFileResponse()
    await editor.get('[data-action="save-views"]').trigger('click'); await flushPromises()
    expect(wrapper.findComponent(DataSpaceViewEditor).exists()).toBe(true)
    expect(editor.text()).toContain('文件提交结果未知')
    expect(instance.isDirty).toBe(true); expect(f.fileWrites).toHaveLength(1)
    await editor.get('[data-action="verify-views"]').trigger('click'); await flushPromises()
    expect(instance.isDirty, wrapper.text()).toBe(false); expect(f.fileWrites).toHaveLength(1)
    expect(JSON.parse(f.stored.get('A')!).tables).toEqual({})
    expect(writes(f)).toEqual([])
  })
  it('shows file models in the graph and summary, opens their bound workspace and saves native table positions', async () => {
    const f = fixture({overviewOnly: true}), original = fileConfig()
    f.stored.set('A', JSON.stringify(original))
    const {wrapper, instance} = await page(), session = f.sessions[0]!
    const files = session.metadataDataSet.getView('DataTableBindingDefinition', 'fileModels')!
    expect(files.rows.map(row => row['tableName'])).toEqual(['DataViewDefinition'])
    const key = files.getPkKey(files.rows[0]!)!
    const graph = wrapper.getComponent(RendererGraph), flow = graph.getComponent(VueFlow)
    expect(flow.props('nodes')!.map(node => node.data.title)).toContain('DataViewDefinition')
    expect(wrapper.text()).toContain('文件资源1')
    expect(flow.props('nodes')).toHaveLength(3)
    graph.props('onNodeMove')!({id: key, x: 600, y: 350, edges: []}); await flushPromises()
    expect(instance.isDirty).toBe(true)
    expect(key).toBe('A+DataViewDefinition')
    expect(files.requestState).toBe(RequestState.Loaded)
    expect(files.queryContext['dataSpaceId']).toBe('A')
    for (const field of ['dataSetId', 'tableName', 'resourceType']) expect(files.fieldAccess(files.rows[0]!, field).read).toBe('visible')
    await wrapper.get('[data-action="save-layout"]').trigger('click'); await flushPromises()
    const saved = JSON.parse(f.stored.get('A')!)
    expect(saved.layout, wrapper.text()).toBeDefined()
    expect(saved.layout.tablePositions.DataViewDefinition).toEqual({x: 600, y: 350})
    expect(saved.layout.modelPositions).toBeUndefined()
    expect(saved.tables).toEqual(original.tables); expect(writes(f)).toEqual([])
    expect(f.assemblyScopes).toEqual([]); expect(f.modelReads).toEqual([])
    const fileNode = flow.props('nodes')!.find(node => node.data.title === 'DataViewDefinition')!
    flow.vm.$emit('nodeDoubleClick', {node: fileNode}); await flushPromises()
    const editor = wrapper.findAllComponents(FieldJson).find(field => field.props('field') === 'configuration')!
    expect(editor.props('dataViewKey')).toBe('META@DataTableBindingDefinition@default')
    expect(session.metadataDataSet.getView('DataTableBindingDefinition')!.currentRow?.['tableName']).toBe('DataViewDefinition')
    const reopened = await f.open('A', {deferDefinition: true}), layout = new DataSpaceLayoutEdit(reopened)
    try {await layout.initialize(); expect(layout.state().positions[String(key)]).toEqual({x: 600, y: 350})}
    finally {layout.dispose()}
  })
  it('connects file models by their view identities and saves a native relation without loading database fields', async () => {
    const f = fixture({overviewOnly: true}), original = fileConfig()
    f.stored.set('A', JSON.stringify({...original, tables: {...original.tables, DataSpaceLayoutDefinition: definitionConfig.tables.DataSpaceLayoutDefinition}}))
    const {wrapper, instance} = await page(), session = f.sessions[0]!
    const files = session.metadataDataSet.getView('DataTableBindingDefinition', 'fileModels')!
    const [source, target] = files.rows.map(row => files.getPkKey(row)!)
    await wrapper.getComponent(RendererGraph).props('onConnect')!({source: source!, target: target!}); await flushPromises()
    const relations = session.metadataDataSet.getView('DataResourceRelationDefinition')!, row = relations.rows[0]!
    expect(row, wrapper.text()).toMatchObject({parentTable: 'DataViewDefinition', childTable: 'DataSpaceLayoutDefinition'})
    expect(instance.isDirty).toBe(true)
    relations.updateEditingValue(relations.getPkKey(row)!, 'filterExpression', {field: 'dataSetId', operator: 'eq', value: 'A'})
    await flushPromises(); await sourceButton(wrapper, 'save-relations').trigger('click'); await flushPromises()
    expect(instance.isDirty, wrapper.text()).toBe(false)
    expect(JSON.parse(f.stored.get('A')!).resourceRelations).toMatchObject([{parentTable: 'DataViewDefinition', childTable: 'DataSpaceLayoutDefinition'}])
    expect(f.fileWrites).toHaveLength(1); expect(writes(f)).toEqual([]); expect(f.modelReads).toEqual([])
    expect(f.assemblyScopes).toEqual([['DataViewDefinition', 'DataSpaceLayoutDefinition']])
  })
  it('edits and cancels resource field configuration in the bound native view and preserves named views on save', async () => {
    const f = fixture({overviewOnly: true}), original = {...fileConfig(), tables: {...fileConfig().tables,
      OrdersAlias: {modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {default: {}, other: {pageSize: 19}}}}}
    f.stored.set('A', JSON.stringify(original))
    const {wrapper, instance} = await page(), session = f.sessions[0]!
    await select(wrapper, 'DataViewDefinition')
    const editor = wrapper.findAllComponents(FieldJson).find(field => field.props('field') === 'configuration')!
    const bindings = session.metadataDataSet.getView('DataTableBindingDefinition')!, key = bindings.getPkKey(bindings.currentRow!)!
    const configuration = structuredClone(bindings.currentRow!['configuration']) as {columns: {name: string; label?: string}[]}
    configuration.columns.find(column => column.name === 'viewId')!.label = '视图名称修订'
    const edit = async () => {editor.getComponent(JsonTreeEditor).vm.$emit('update:modelValue', JSON.stringify({value: configuration})); await flushPromises()}
    await edit(); expect(instance.isDirty).toBe(true)
    expect((bindings.getEditingRow(key)!['configuration'] as typeof configuration).columns.find(column => column.name === 'viewId')?.label).toBe('视图名称修订')
    await wrapper.get('[data-action="discard-file-model"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false); expect(f.fileWrites).toEqual([])
    await edit(); await wrapper.get('[data-action="save-file-model"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false); expect(f.fileWrites).toHaveLength(1); expect(writes(f)).toEqual([])
    const saved = JSON.parse(f.stored.get('A')!)
    expect(saved.tables.DataViewDefinition.views).toEqual(original.tables.DataViewDefinition.views)
    expect(saved.tables.OrdersAlias).toEqual(original.tables.OrdersAlias)
    expect(f.assemblyScopes).toEqual([['DataViewDefinition']])
    expect(saved.tables.DataViewDefinition.columns.find((column: {name: string}) => column.name === 'viewId').label).toBe('视图名称修订')
    const reopened = await f.open('A', {deferDefinition: true})
    await reopened.loadViewFields({tableName: 'DataViewDefinition', viewId: 'compact', fileResourceId: 'pagedata:views'})
    expect(reopened.getViewFields({tableName: 'DataViewDefinition', viewId: 'compact', fileResourceId: 'pagedata:views'})?.find(column => column.name === 'viewId')?.label).toBe('视图名称修订')
    expect(f.modelReads).toEqual([])
  })
  it('rejects removing a field still consumed by a file model view and retains the edit for cancellation', async () => {
    const f = fixture({overviewOnly: true}), original = fileConfig()
    const config = {...original, tables: {DataViewDefinition: {...original.tables.DataViewDefinition, views: {
      ...original.tables.DataViewDefinition.views, compact: {...original.tables.DataViewDefinition.views.compact, valueField: 'viewId'},
    }}}}
    f.stored.set('A', JSON.stringify(config))
    const {wrapper, instance} = await page(), session = f.sessions[0]!
    await select(wrapper, 'DataViewDefinition')
    const editor = wrapper.findAllComponents(FieldJson).find(field => field.props('field') === 'configuration')!
    const bindings = session.metadataDataSet.getView('DataTableBindingDefinition')!
    const configuration = structuredClone(bindings.currentRow!['configuration']) as {columns: {name: string}[]}
    configuration.columns = configuration.columns.filter(column => column.name !== 'viewId')
    editor.getComponent(JsonTreeEditor).vm.$emit('update:modelValue', JSON.stringify({value: configuration})); await flushPromises()
    await wrapper.get('[data-action="save-file-model"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(true); expect(f.fileWrites).toEqual([]); expect(writes(f)).toEqual([])
    expect(wrapper.text()).toContain('SCENARIO_VIEW_FIELD: valueField')
    expect(JSON.parse(f.stored.get('A')!)).toEqual(config)
    await wrapper.get('[data-action="discard-file-model"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false)
  })
  it('adds, cancels and deletes a file model named view through the shared editor', async () => {
    const f = fixture({overviewOnly: true})
    f.stored.set('A', JSON.stringify(fileConfig()))
    const {wrapper} = await page()
    await select(wrapper, 'compact')
    await writeBound(wrapper, 'newName', 'details')
    await wrapper.get('[data-action="add-view"]').trigger('click'); await flushPromises()
    expect(wrapper.getComponent(DataSpaceViewEditor).text()).toContain('DataViewDefinition @ details')
    await wrapper.get('[data-action="discard-view-edits"]').trigger('click'); await flushPromises()
    expect(f.fileWrites).toEqual([])
    await writeBound(wrapper, 'newName', 'details')
    await wrapper.get('[data-action="add-view"]').trigger('click'); await flushPromises()
    await wrapper.get('[data-action="save-views"]').trigger('click'); await flushPromises()
    expect(JSON.parse(f.stored.get('A')!).tables.DataViewDefinition.views.details).toEqual({})
    await wrapper.get('[data-action="remove-view"]').trigger('click'); await flushPromises()
    await wrapper.get('[data-action="save-views"]').trigger('click'); await flushPromises()
    expect(JSON.parse(f.stored.get('A')!).tables.DataViewDefinition.views).toEqual(fileConfig().tables.DataViewDefinition.views)
    expect(writes(f)).toEqual([])
  })
  it('previews the file resource through the native runtime and rejects mismatched resource or model identities', async () => {
    const f = fixture({overviewOnly: true})
    f.stored.set('A', JSON.stringify(fileConfig()))
    const {wrapper} = await page(), session = f.sessions[0]!
    await expect(session.openPreview({tableName: 'DataViewDefinition', viewId: 'compact', modelId: 'M1', modelName: 'Orders'})).rejects.toThrow('预览选择')
    await expect(session.openPreview({tableName: 'DataViewDefinition', viewId: 'compact', fileResourceId: 'pagedata:tables'})).rejects.toThrow('预览选择')
    await select(wrapper, 'compact')
    await wrapper.get('[data-action="open-query-preview"]').trigger('click'); await flushPromises()
    const preview = wrapper.getComponent(DataSpaceQueryPreview)
    expect(preview.text()).not.toContain('身份不一致')
    expect(preview.text()).not.toContain('SCENARIO_')
    await preview.get('[data-action="run-query-preview"]').trigger('click'); await flushPromises()
    const result = preview.findAllComponents(FieldJson).find(field => field.props('dataMember') === 'rows')!
    expect(result.props('dataViewKey')).toBe('A@DataViewDefinition@compact')
    expect(result.getComponent(JsonTreeEditor).props('modelValue')).toContain('compact')
    expect(f.modelReads).toEqual([]); expect(writes(f)).toEqual([]); expect(f.fileWrites).toEqual([])
    await preview.get('[data-action="close-query-preview"]').trigger('click'); await flushPromises()
  })
  it('places declared file models and multiple views without database identities and saves a named view', async () => {
    const f = fixture({overviewOnly: true})
    f.stored.set('A', JSON.stringify({scenarioId: 'A', schemaVersion: 2, tables: {
      DataViewDefinition: {...definitionConfig.tables.DataViewDefinition, views: {default: {autoLoad: false, queryContext: {dataSpaceId: 'A'}}, compact: {autoLoad: false, pageSize: 7, queryContext: {dataSpaceId: 'A'}}}},
    }}))
    const {wrapper, instance} = await page(), session = f.sessions[0]!
    expect(wrapper.text()).not.toContain('未归类定义')
    await select(wrapper, 'DataViewDefinition')
    const configuration = wrapper.findAllComponents(FieldJson).find(field => field.props('field') === 'configuration')!
    expect(configuration.exists()).toBe(true)
    expect(resolveDataViewKey(configuration.props('dataViewKey'), session.metadataDataSet)).toBe(session.metadataDataSet.getView('DataTableBindingDefinition'))
    await select(wrapper, 'compact')
    expect(wrapper.getComponent(DataSpaceViewEditor).text()).toContain('DataViewDefinition @ compact')
    expect(wrapper.getComponent(DataSpaceViewEditor).text()).not.toContain('字段目录模型身份不可确认')
    expect(f.modelReads).toEqual([])
    await (await boundNumber(wrapper, 'pageSize')).setValue('23')
    await wrapper.get('[data-action="save-views"]').trigger('click'); await flushPromises()
    expect(wrapper.getComponent(DataSpaceViewEditor).text()).toContain('已保存并回读确认')
    expect(instance.isDirty).toBe(false); expect(writes(f)).toEqual([]); expect(f.fileWrites).toHaveLength(1)
    const reopened = await f.open('A', {deferDefinition: true})
    const records = reopened.metadataDataSet.getView('DataViewDefinition')!.rows
    expect(records.find(row => row['viewId'] === 'compact')).toMatchObject({pageSize: 23, tableName: 'DataViewDefinition'})
    expect(records.every(row => row['dataModelId'] === undefined && row['dataModelName'] === undefined)).toBe(true)
  })
})
describe('layout rebuild entry', () => {
  it.each(['legacy', 'native'] as const)('adopts a %s remote file while a target resource is unavailable and restores its graph and view editor', async format => {
    const f = fixture({overviewOnly: true, broken: true, relationRows: [{rowid: 'OLD', parentModId: 'M2', childModId: 'M1',
      parentTable: 'CustomerSource', childTable: 'OrderSource', filter: JSON.stringify({Type: 'cond', Field: 'rowid', Operator: 'equal', ValueFun: {Type: 'GetConstValue', Value: 'x'}})}]})
    const {wrapper, instance} = await page(), session = f.sessions[0]!
    await select(wrapper, 'shared')
    const owner = f.workspaces[0]!.getScenarioViews('A')!, original = owner.getText()
    const remote = JSON.parse(original)
    remote.tables.OrdersAlias.views.shared.pageSize = 44
    if (format === 'native') {
      remote.schemaVersion = 2
      remote.resourceRelations = [{relationId: 'native-edge', parentTable: 'CustomersAlias', childTable: 'OrdersAlias', filterExpression: {field: 'rowid', operator: 'eq', value: 'x'}}]
    }
    const remoteText = JSON.stringify(remote)
    f.stored.set('A', remoteText)
    owner.setText(original.replace('"pageSize":12', '"pageSize":33'))
    await flushPromises()
    await wrapper.get('[data-action="preview-remote-views"]').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('"pageSize":44')
    await wrapper.get('[data-action="adopt-remote-views"]').trigger('click'); await flushPromises()
    expect(wrapper.text()).not.toContain('SCENARIO_ASSEMBLY')
    expect(instance.isDirty).toBe(false); expect(session.definitionStatus).toBe('unloaded')
    expect(wrapper.getComponent(VueFlow).props('edges')).toHaveLength(1)
    await select(wrapper, 'shared')
    expect((await boundNumber(wrapper, 'pageSize')).element).toHaveProperty('value', '44')
    expect(session.metadataDataSet.getView('Base_DataModel_Field')!.requestState).toBe(RequestState.Idle)
    expect(f.fileWrites).toHaveLength(0); expect(writes(f)).toHaveLength(0)
  })

  it('creates an unbound model view from the lazy directory and reopens it without loading the complete target first', async () => {
    const f = fixture({overviewOnly: true})
    f.stored.set('A', JSON.stringify({scenarioId: 'A', tables: {
      CustomersAlias: {modelBinding: {modelId: 'M2', modelName: 'Customers'}, views: {default: {}, shared: {pageSize: 24}}},
    }}))
    const {wrapper, instance} = await page(), session = f.sessions[0]!
    await select(wrapper, 'Orders')
    await writeBound(wrapper, 'newTable', 'OrderBinding'); await writeBound(wrapper, 'newName', 'detail')
    await wrapper.get('[data-action="add-view"]').trigger('click'); await flushPromises()
    expect(wrapper.getComponent(DataSpaceViewEditor).text()).not.toContain('定义投影已失效')
    expect(session.definitionStatus).toBe('unloaded')
    expect(session.metadataDataSet.getView('DataViewDefinition')!.rows.some(row => row['tableName'] === 'OrderBinding' && row['viewId'] === 'detail')).toBe(true)
    await wrapper.get('[data-action="save-views"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false); expect(f.fileWrites).toHaveLength(1); expect(writes(f)).toHaveLength(0)
    const reopened = await f.open('A')
    expect(reopened.definitionDataSet!.getView('OrderBinding', 'detail')).toBeDefined()
    expect(reopened.definitionDataSet!.getView('CustomersAlias', 'shared')!.pageSize).toBe(24)
  })
  it('saves only the selected view without losing the unchanged legacy graph or assembling the whole target', async () => {
    const f = fixture({overviewOnly: true, relationRows: [{rowid: 'OLD', parentModId: 'M2', childModId: 'M1',
      parentTable: 'CustomerSource', childTable: 'OrderSource', filter: JSON.stringify({Type: 'cond', Field: 'rowid', Operator: 'equal', ValueFun: {Type: 'GetConstValue', Value: 'x'}})}]})
    const {wrapper, instance} = await page(), session = f.sessions[0]!
    expect(wrapper.getComponent(VueFlow).props('edges')).toHaveLength(1)
    await select(wrapper, 'shared')
    await (await boundNumber(wrapper, 'pageSize')).setValue('31')
    const releaseFields = f.holdDefinitionRead()
    await wrapper.get('[data-action="save-views"]').trigger('click'); await flushPromises()
    releaseFields(); await flushPromises()
    const editor = wrapper.getComponent(DataSpaceViewEditor)
    expect(editor.text()).not.toContain('字段目录读取已过期')
    expect(editor.getComponent(RendererFilterExpression).props('columns').map(column => column.name)).toContain('rowid')
    expect(instance.isDirty, wrapper.text()).toBe(false)
    expect(f.fileWrites).toHaveLength(1); expect(writes(f)).toHaveLength(0)
    expect(session.definitionStatus).toBe('unloaded')
    expect(wrapper.getComponent(VueFlow).props('edges')).toHaveLength(1)
    expect(session.metadataDataSet.getView('Base_DataModel_Field')!.requestState).toBe(RequestState.Idle)
    const reopened = await f.open('A')
    expect(reopened.definitionDataSet!.getView('OrdersAlias', 'shared')!.pageSize).toBe(31)
    expect(reopened.definitionDataSet!.resourceRelations).toHaveLength(1)
  })
  it('opens a named-view filter independently of an unavailable unrelated target model', async () => {
    const f = fixture({overviewOnly: true, broken: true})
    const {wrapper, instance} = await page(), session = f.sessions[0]!, load = vi.spyOn(session, 'loadDefinition')
    await select(wrapper, 'shared')
    const editor = wrapper.getComponent(DataSpaceViewEditor), filter = editor.getComponent(RendererFilterExpression)
    expect(filter.props('columns').map(column => column.name)).toContain('rowid')
    expect(filter.props('dataViewKey')).toBe('META@DataViewDefinition@default')
    expect(load).not.toHaveBeenCalled(); expect(session.definitionStatus).toBe('unloaded')
    await filter.get('[data-action="open"]').trigger('click'); await flushPromises()
    await new DOMWrapper(document.body).get('[data-action="cancel"]').trigger('click'); await flushPromises()
    await sourceButton(wrapper, 'close-definition').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false); expect(writes(f)).toEqual([]); expect(f.fileWrites).toEqual([])
  })
  it('opens legacy graph relations through source conversion without assembling target business views', async () => {
    const f = fixture({overviewOnly: true, relationRows: [{rowid: 'OLD', parentModId: 'M2', childModId: 'M1',
      parentTable: 'CustomerSource', childTable: 'OrderSource', filter: JSON.stringify({Type: 'cond', Field: 'rowid', Operator: 'equal', ValueFun: {Type: 'GetConstValue', Value: 'x'}})}]})
    const {wrapper, instance} = await page(), session = f.sessions[0]!
    const graph = wrapper.getComponent(RendererGraph)
    expect(graph.props('edgeDataViewKey')).toBe('META@DataResourceRelationDefinition@graph')
    expect(session.definitionStatus).toBe('unloaded')
    expect(session.metadataDataSet.getView('DataResourceRelationDefinition', 'graph')!.rows).toHaveLength(1)
    expect(session.metadataDataSet.getView('Base_DataModel_Field')?.requestState).toBe(RequestState.Idle)
    const load = vi.spyOn(session, 'loadDefinition')
    const flow = graph.getComponent(VueFlow), edge = flow.props('edges')![0]!
    flow.vm.$emit('edgeDoubleClick', {edge}); await flushPromises()
    expect(load).not.toHaveBeenCalled()
    expect(session.definitionStatus).toBe('unloaded')
    expect(f.assemblyScopes).toEqual([])
    expect(session.metadataDataSet.getView('Base_DataModel_Field')?.requestState).toBe(RequestState.Idle)
    const full = session.metadataDataSet.getView('DataResourceRelationDefinition')!.currentRow!
    expect(full['definitionKey']).toBe(session.metadataDataSet.getView('DataResourceRelationDefinition', 'graph')!.rows[0]!['definitionKey'])
    expect(full['filterExpression']).toEqual({field: 'rowid', operator: 'eq', value: 'x'})
    expect(wrapper.text()).not.toContain('定义投影已失效')
    const nameField = () => wrapper.findAllComponents(FieldText).find(field => field.props('field') === 'relationName')!
    expect(nameField().props('modelValue')).toBeUndefined()
    await nameField().get('input').setValue('原生关系'); await flushPromises()
    await sourceButton(wrapper, 'discard-relations').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false); expect(f.fileWrites).toEqual([])
    await sourceButton(wrapper, 'close-definition').trigger('click'); await flushPromises()
    flow.vm.$emit('edgeDoubleClick', {edge: flow.props('edges')![0]!}); await flushPromises()
    await nameField().get('input').setValue('原生关系'); await flushPromises()
    await sourceButton(wrapper, 'save-relations').trigger('click'); await flushPromises()
    expect(instance.isDirty, wrapper.text()).toBe(false)
    expect(JSON.parse(f.stored.get('A')!)).toMatchObject({schemaVersion: 2, resourceRelations: [{sourceRelationId: 'OLD', relationName: '原生关系'}]})
    const reopened = await f.open('A', {deferDefinition: true})
    await reopened.loadRelationDefinitions()
    expect(reopened.metadataDataSet.getView('DataResourceRelationDefinition')!.rows).toMatchObject([{relationName: '原生关系'}])
    await sourceButton(wrapper, 'close-definition').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false); expect(writes(f)).toEqual([]); expect(f.fileWrites).toHaveLength(1)
  })
  it('keeps the first canvas usable when an unrelated target resource cannot assemble', async () => {
    const f = fixture({overviewOnly: true, broken: true})
    const {wrapper} = await page()
    expect(f.sessions[0]!.definitionStatus).toBe('unloaded')
    expect(wrapper.findComponent(RendererGraph).exists()).toBe(true)
    expect(wrapper.text()).not.toContain('SCENARIO_ASSEMBLY')
    expect(sourceButton(wrapper, 'add-model-node').isVisible()).toBe(true)
    expect(f.fileWrites).toEqual([]); expect(writes(f)).toEqual([])
  })
  it('loads named-view fields on entering their workspace after a metadata save without reporting an assembly failure', async () => {
    const f = fixture({overviewOnly: true, allowFieldEdit: true, editableFieldProperties: ['description'], sourceFields: [
      {rowid: 'F1', dataModelId: 'M1', Name: 'rowid', type: 'dataModel', FieldType: 'string', IsPKey: 1, IsOutput: 1, description: ''},
    ]})
    const {wrapper} = await page(), session = f.sessions[0]!
    const fields = await session.loadModelFields('M1'), owner = session.getFieldEdit('F1', 'modelFields')
    fields.updateEditingValue('F1', 'description', '已保存'); await owner.save()
    const load = vi.spyOn(session, 'loadDefinition')
    await select(wrapper, 'shared')
    const editor = wrapper.getComponent(DataSpaceViewEditor)
    expect(editor.text()).not.toContain('DATA_SPACE_DESIGN_SESSION_STALE')
    expect(editor.text()).not.toContain('当前模型字段尚未读取')
    expect(load).not.toHaveBeenCalled()
    expect(session.definitionStatus).toBe('unloaded')
    expect(editor.findComponent(RendererFilterExpression).exists()).toBe(true)
    expect(writes(f)).toHaveLength(1); expect(f.fileWrites).toHaveLength(0)
  })

  it('keeps saved graph bindings while the invalidated definition waits for an explicit workspace read', async () => {
    const f = fixture({overviewOnly: true, allowFieldEdit: true, editableFieldProperties: ['description'], sourceFields: [
      {rowid: 'F1', dataModelId: 'M1', Name: 'rowid', type: 'dataModel', FieldType: 'string', IsPKey: 1, IsOutput: 1, description: ''},
      {rowid: 'PARENT', dataModelId: 'M2', Name: 'customer', type: 'dataModel', FieldType: 'string', IsOutput: 1},
    ]})
    f.stored.set('A', JSON.stringify({schemaVersion: 2, scenarioId: 'A', tables: {
      Child: {modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {default: {}}},
      Parent: {modelBinding: {modelId: 'M2', modelName: 'Customers'}, views: {default: {}}},
    }, layout: {modelPositions: {M1: {x: 10, y: 20}, M2: {x: 50, y: 20}}},
    resourceRelations: [{relationId: 'native', parentTable: 'Parent', childTable: 'Child', filterExpression: {field: 'rowid', operator: 'ne', value: ''}}]}))
    const {wrapper, instance} = await page('?scenarioId=A', true), session = f.sessions[0]!
    await session.loadDefinition()
    await select(wrapper, 'Orders')
    const old = session.definitionDataSet!, load = vi.spyOn(session, 'loadDefinition')
    await openModelFieldsTab(wrapper)
    const fields = session.metadataDataSet.getView('Base_DataModel_Field', 'modelFields')!
    fields.updateEditingValue('F1', 'description', '已保存字段')
    await flushPromises()
    await wrapper.get('[data-action="save-model-workspace"]').trigger('click'); await flushPromises()
    expect(writes(f)).toHaveLength(1); expect(f.fileWrites).toHaveLength(0)
    expect(old.destroyed).toBe(true); expect(() => session.definitionDataSet).toThrow('定义投影已失效')
    expect(load).not.toHaveBeenCalled()
    expect(instance.isDirty).toBe(false)
    expect(wrapper.text()).not.toContain('DATA_SPACE_DESIGN_SESSION_STALE')
    expect(wrapper.text()).not.toContain('存在端点未唯一绑定')
    expect(wrapper.text()).toContain('模型关系配置尚未读取')
    expect(wrapper.getComponent(RendererGraph).props('edgeNodeKeys')).toEqual({Child: 'M1', Parent: 'M2'})
    const panel = wrapper.getComponent(DataSpaceModelEditor)
    expect(panel.find('.request-input-fields').exists()).toBe(false)
    await panel.get('[data-action="load-input-definition"]').trigger('click'); await flushPromises()
    expect(load).not.toHaveBeenCalled()
    expect(() => session.definitionDataSet).toThrow('定义投影已失效')
    expect(panel.get('.request-input-fields').text()).toContain('customer')
    expect(writes(f)).toHaveLength(1); expect(f.fileWrites).toHaveLength(0)
    expect(session.metadataDataSet.getView('Base_DataModel_Field')?.requestState).toBe(RequestState.Idle)
    expect(session.metadataDataSet.getView('Base_DataModel_Relation')?.requestState).toBe(RequestState.Idle)
  })

  it('fills native ancestor options in the open independent field dialog without loading full directories', async () => {
    const f = fixture({overviewOnly: true, allowFieldEdit: true, editableFieldProperties: ['ValueFun'], sourceFields: [
      {rowid: 'PK', dataModelId: 'M1', Name: 'rowid', type: 'dataModel', FieldType: 'string', IsPKey: 1, IsOutput: 1},
      {rowid: 'TARGET', dataModelId: 'M1', Name: 'parentId', type: 'dataModel', FieldType: 'string', IsPKey: 0, IsOutput: 1, ValueFun: ''},
      {rowid: 'UPSTREAM', dataModelId: 'M2', Name: 'customer', type: 'dataModel', FieldType: 'string', IsOutput: 1},
    ]})
    f.setModelValues({Type: '数据库表'}, 'A', 'M1'); f.setModelValues({Type: '数据库表'}, 'A', 'M2')
    f.stored.set('A', JSON.stringify({schemaVersion: 2, scenarioId: 'A', tables: {
      Child: {modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {default: {}}},
      Parent: {modelBinding: {modelId: 'M2', modelName: 'Customers'}, views: {default: {}}},
    }, resourceRelations: [{relationId: 'native', parentTable: 'Parent', childTable: 'Child', filterExpression: {field: 'rowid', operator: 'ne', value: ''}}]}))
    const {wrapper, instance} = await page('?scenarioId=A', true), session = f.sessions[0]!
    const upstream = session.metadataDataSet.getView('Base_DataModel_Field', 'modelInputFields')!, load = upstream.loadFromServer.bind(upstream)
    let release!: () => void
    const pending = new Promise<void>(resolve => {release = resolve})
    vi.spyOn(upstream, 'loadFromServer').mockImplementation(async (...args) => {await pending; return load(...args)})
    await select(wrapper, 'Orders')
    await openModelFieldsTab(wrapper)
    const table = wrapper.findComponent({name: 'DataSpaceFieldEditor'})
    await table.get('tbody tr:nth-child(2) [data-function-open]').trigger('click'); await flushPromises()
    const dialog = wrapper.getComponent(FilterValueFunctionDialog), identity = dialog.vm.$
    expect(dialog.props('context')?.tables).toContainEqual({name: 'Customers', fields: []})
    dialog.getComponent(ElTabs).vm.$emit('update:modelValue', 'GetRefData'); await flushPromises()
    const choice = (label: string) => dialog.findAllComponents(ElSelect).find(item => item.props('ariaLabel') === label)!
    choice('引用表').vm.$emit('update:modelValue', 'CustomerSource'); await flushPromises()
    expect(choice('引用字段').findAllComponents(ElOption)).toHaveLength(0)
    await new DOMWrapper(document.body).get('[data-function-confirm]').trigger('click'); await flushPromises()
    expect(dialog.emitted('confirm')).toBeUndefined()
    release(); await flushPromises()
    expect(wrapper.getComponent(FilterValueFunctionDialog).vm.$).toBe(identity)
    expect(dialog.props('context')?.tables?.map(item => item.name)).toEqual(['Orders', 'Customers'])
    expect(choice('引用表').props('modelValue')).toBe('CustomerSource')
    expect(choice('引用字段').findAllComponents(ElOption).map(option => option.props('value'))).toEqual(['customer'])
    expect(upstream.loadFromServer).toHaveBeenCalledTimes(1)
    expect(session.metadataDataSet.getView('Base_DataModel_Field')?.requestState).toBe(RequestState.Idle)
    expect(session.metadataDataSet.getView('Base_DataModel_Relation')?.requestState).toBe(RequestState.Idle)
    dialog.vm.$emit('update:modelValue', false); await flushPromises()
    expect(instance.isDirty).toBe(false)
    expect(writes(f)).toHaveLength(0); expect(f.fileWrites).toHaveLength(0)
  })

  it('consumes the standalone reference filter component from the selected view and cancels its dialog', async () => {
    const f = fixture()
    const {wrapper, instance} = await page(); await select(wrapper, 'shared')
    const editor = wrapper.getComponent(DataSpaceViewEditor)
    const filter = editor.get('[data-request-workspace]').getComponent(RendererFilterExpression)
    expect(filter.props('display')).toBe('dialog')
    expect(filter.props('displayMode')).toBe('inline')
    expect(filter.get('[data-action="open"]').text()).toBe('空')
    await filter.get('[data-action="open"]').trigger('click'); await flushPromises()
    const body = new DOMWrapper(document.body)
    const dialog = body.findAll('[role="dialog"]').find(item => item.attributes('aria-label') === '过滤设置')!
    expect(dialog.exists()).toBe(true)
    await dialog.findAll('button').find(button => button.text() === '添加条件')!.trigger('click')
    expect(editor.get('[data-action="save-views"]').attributes('disabled')).toBeDefined()
    await dialog.get('[data-action="cancel"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false)
    expect(f.fileWrites).toHaveLength(0); expect(writes(f)).toHaveLength(0)
  })

  it('selects a direct source parameter in the view filter and executes it after save and reopen', async () => {
    const f = fixture({sourceInput: true, businessRows: {Orders: [{rowid: 'C1'}, {rowid: 'C2'}]}})
    f.stored.set('A', JSON.stringify({scenarioId: 'A', tables: {OrdersAlias: {modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {
      default: {}, shared: {queryConfig: {sourceInputMode: 'direct'}, queryContext: {customerArg: 'C1'}, filterExpression: {field: 'rowid', operator: 'eq', value: 'old'}},
    }}}}))
    const mapping = f.sourceValue(), {wrapper} = await page(); await select(wrapper, 'shared')
    const editor = wrapper.getComponent(DataSpaceViewEditor)
    await editor.get('[data-action="load-query-parameters"]').trigger('click'); await flushPromises()
    const filter = editor.get('[data-request-workspace]').getComponent(RendererFilterExpression)
    expect(filter.props('functionContext')?.inputParams).toEqual([{label: 'customerArg', value: 'customerArg'}])
    await filter.get('[data-action="open"]').trigger('click'); await flushPromises()
    await new DOMWrapper(document.body).get('[aria-label="使用服务端值函数"]').trigger('click'); await flushPromises()
    const dialog = filter.getComponent(FilterValueFunctionDialog)
    dialog.getComponent(ElTabs).vm.$emit('update:modelValue', 'GetInputParam'); await flushPromises()
    const choice = dialog.getComponent(ElSelect)
    expect(choice.findAllComponents(ElOption).map(option => option.props('value'))).toEqual(['customerArg'])
    choice.vm.$emit('update:modelValue', 'customerArg'); await flushPromises()
    await new DOMWrapper(document.body).get('[data-function-confirm]').trigger('click'); await flushPromises()
    await new DOMWrapper(document.body).get('[data-action="apply"]').trigger('click'); await flushPromises()
    await editor.get('[data-action="save-views"]').trigger('click'); await flushPromises()
    expect(f.fileWrites).toHaveLength(1); expect(writes(f)).toHaveLength(0); expect(f.sourceValue()).toBe(mapping)
    const fresh = await f.open('A'), preview = await fresh.openPreview({tableName: 'OrdersAlias', viewId: 'shared', modelId: 'M1', modelName: 'Orders'})
    try {
      expect(preview.view.filterExpression).toEqual({field: 'rowid', operator: 'eq', value: {Type: 'GetInputParam', ParamName: 'customerArg'}})
      expect(fresh.definitionDataSet!.getView('OrdersAlias', 'default')!.filterExpression).toBeUndefined()
      await preview.query({context: {}})
      expect(preview.view.rows.map(row => row['rowid'])).toEqual(['C1'])
      expect(f.requests.filter(request => request.url === '/api/DataOperation/GetData').at(-1)?.data).toMatchObject({Table: [{
        Filter: {Field: 'rowid', ValueFun: {Type: 'GetConstValue', Value: 'C1'}}, inputParams: [{Name: 'customerArg', Value: 'C1'}],
      }]})
    } finally {preview.dispose()}
  })
  it('changes the filter parameter catalogue with the input mode without rewriting an existing filter', async () => {
    const f = fixture({sourceInput: true})
    const existing = {field: 'rowid', operator: 'eq', value: {Type: 'GetInputParam', ParamName: 'customer'}}
    f.stored.set('A', JSON.stringify({scenarioId: 'A', tables: {OrdersAlias: {modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {
      default: {}, shared: {filterExpression: existing},
    }}}}))
    const {wrapper} = await page(); await select(wrapper, 'shared')
    const editor = wrapper.getComponent(DataSpaceViewEditor), filter = editor.get('[data-request-workspace]').getComponent(RendererFilterExpression)
    const mode = editor.get('[data-request-parameters] [data-json-member="sourceInputMode"]').getComponent(ElRadioGroup)
    expect(filter.props('functionContext')?.inputParams).toEqual([{label: '客户', value: 'customer'}])
    mode.vm.$emit('update:modelValue', 'direct'); await flushPromises()
    expect(filter.props('functionContext')?.inputParams).toEqual([])
    expect(editor.text()).toContain('来源参数未完整读取或范围已变化')
    const definitions = f.sessions[0]!.metadataDataSet.getView('DataViewDefinition')!
    expect(definitions.getEditingRow(editor.props('rowKey')!)?.['filterExpression']).toEqual(existing)
    await editor.get('[data-action="load-query-parameters"]').trigger('click'); await flushPromises()
    expect(filter.props('functionContext')?.inputParams).toEqual([{label: 'customerArg', value: 'customerArg'}])
    expect(definitions.getEditingRow(editor.props('rowKey')!)?.['filterExpression']).toEqual(existing)
    await editor.get('[data-action="discard-view-edits"]').trigger('click'); await flushPromises()
    expect(editor.get('[data-request-workspace]').getComponent(RendererFilterExpression).props('functionContext')?.inputParams).toEqual([{label: '客户', value: 'customer'}])
    expect(definitions.hasEditingChanges()).toBe(false)
    expect(f.fileWrites).toHaveLength(0); expect(writes(f)).toHaveLength(0)
  })
  it('keeps filter parameter catalogues independent when switching between views of one model', async () => {
    const f = fixture({sourceInput: true})
    const views = {
      default: {queryContext: {customer: 'space-value'}, filterExpression: {field: 'rowid', operator: 'eq', value: {Type: 'GetInputParam', ParamName: 'customer'}}},
      shared: {queryConfig: {sourceInputMode: 'direct'}, queryContext: {customerArg: 'source-value'}, filterExpression: {field: 'rowid', operator: 'eq', value: {Type: 'GetInputParam', ParamName: 'customerArg'}}},
    }
    f.stored.set('A', JSON.stringify({scenarioId: 'A', tables: {OrdersAlias: {modelBinding: {modelId: 'M1', modelName: 'Orders'}, views}}}))
    const {wrapper, instance} = await page(); await select(wrapper, 'shared')
    await wrapper.getComponent(DataSpaceViewEditor).get('[data-action="load-query-parameters"]').trigger('click'); await flushPromises()
    for (const [viewId, parameter] of [['default', 'customer'], ['shared', 'customerArg']]) {
      await select(wrapper, viewId!)
      const editor = wrapper.getComponent(DataSpaceViewEditor)
      const filter = editor.get('[data-request-workspace]').getComponent(RendererFilterExpression)
      expect(filter.props('functionContext')?.inputParams?.map(option => option.value)).toEqual([parameter])
      const definitions = f.sessions[0]!.metadataDataSet.getView('DataViewDefinition')!
      expect(definitions.getEditingRow(editor.props('rowKey')!)).toMatchObject({dataModelId: 'M1', viewId,
        queryContext: viewId === 'default' ? views.default.queryContext : views.shared.queryContext,
        filterExpression: {value: {Type: 'GetInputParam', ParamName: parameter}}})
    }
    expect(instance.isDirty).toBe(false)
    expect(JSON.parse(f.stored.get('A')!).tables.OrdersAlias.views).toEqual(views)
    expect(f.fileWrites).toHaveLength(0); expect(writes(f)).toHaveLength(0)
  })
  it('edits inline call parameters and cancels without changing the parameter declaration', async () => {
    const f = fixture(), {wrapper, instance} = await page(); await select(wrapper, 'shared')
    const editor = wrapper.getComponent(DataSpaceViewEditor)
    const parameters = editor.get('[data-request-parameters]')
    expect(instance.isDirty).toBe(false)
    expect(parameters.get('[data-json-property="customer"]').element).toHaveProperty('value', '')
    await parameters.get('[data-json-property="customer"]').setValue('false'); await flushPromises()
    expect(instance.isDirty).toBe(true)
    expect(f.sessions[0]!.metadataDataSet.getView('DataViewDefinition')!.getEditingRow(editor.props('rowKey')!)?.['queryContext']).toEqual({customer: false})
    await editor.get('[data-action="discard-view-edits"]').trigger('click'); await flushPromises()
    expect(parameters.get('[data-json-property="customer"]').element).toHaveProperty('value', '')
    expect(instance.isDirty).toBe(false); expect(f.fileWrites).toHaveLength(0); expect(writes(f)).toHaveLength(0)
  })
  it('switches inline call parameters to a lazy source catalogue and persists only the selected view', async () => {
    const f = fixture({sourceInput: true, businessRows: {Orders: [{rowid: 'O1'}]}})
    f.stored.set('A', JSON.stringify({scenarioId:'A',tables:{OrdersAlias:{modelBinding:{modelId:'M1',modelName:'Orders'},views:{default:{},shared:{queryContext:{customer:'keep',retained:{flag:false}}}}}}}))
    const mapping = f.sourceValue(), {wrapper} = await page(); await select(wrapper, 'shared')
    const editor = wrapper.getComponent(DataSpaceViewEditor), parameters = editor.get('[data-request-parameters]')
    parameters.get('[data-json-member="sourceInputMode"]').getComponent(ElRadioGroup).vm.$emit('update:modelValue','direct'); await flushPromises()
    expect(parameters.find('[data-json-property="customer"]').exists()).toBe(false)
    await parameters.get('[data-action="load-query-parameters"]').trigger('click'); await flushPromises()
    await parameters.get('[data-json-property="customerArg"]').setValue('0'); await flushPromises()
    await editor.get('[data-action="save-views"]').trigger('click'); await flushPromises()
    expect(f.fileWrites).toHaveLength(1); expect(writes(f)).toHaveLength(0); expect(f.sourceValue()).toBe(mapping)
    const fresh = await f.open('A'), preview = await fresh.openPreview({tableName:'OrdersAlias',viewId:'shared',modelId:'M1',modelName:'Orders'})
    try {
      expect(preview.view.queryContext).toEqual({customer:'keep',retained:{flag:false},customerArg:0})
      expect(preview.view.queryConfig.sourceInputMode).toBe('direct')
      expect(fresh.definitionDataSet!.getView('OrdersAlias','default')!.queryContext).toEqual({})
      await preview.query({context:{}})
      expect(f.requests.filter(request => request.url === '/api/DataOperation/GetData').at(-1)?.data)
        .toMatchObject({Table:[{inputParams:expect.arrayContaining([{Name:'customerArg',Value:0}])}]})
    } finally {preview.dispose()}
  })
  it('keeps inline call parameters intact when a direct catalogue cannot be loaded', async () => {
    const f = fixture()
    f.stored.set('A', JSON.stringify({scenarioId:'A',tables:{OrdersAlias:{modelBinding:{modelId:'M1',modelName:'Orders'},views:{default:{},shared:{queryContext:{customer:'preserve',extra:false}}}}}}))
    const {wrapper} = await page(); await select(wrapper, 'shared')
    const editor = wrapper.getComponent(DataSpaceViewEditor), parameters = editor.get('[data-request-parameters]')
    parameters.get('[data-json-member="sourceInputMode"]').getComponent(ElRadioGroup).vm.$emit('update:modelValue','direct'); await flushPromises()
    await parameters.get('[data-action="load-query-parameters"]').trigger('click'); await flushPromises()
    expect(editor.find('[role="alert"]').exists()).toBe(true)
    expect(parameters.find('[data-json-property="customer"]').exists()).toBe(false)
    expect(f.sessions[0]!.metadataDataSet.getView('DataViewDefinition')!.getEditingRow(editor.props('rowKey')!)?.['queryContext']).toEqual({customer:'preserve',extra:false})
    await parameters.get('[data-action="toggle-inline-context-json"]').trigger('click'); await flushPromises()
    expect(parameters.findComponent(JsonTreeEditor).exists()).toBe(true)
    await editor.get('[data-action="discard-view-edits"]').trigger('click'); await flushPromises()
    expect(f.sessions[0]!.metadataDataSet.getView('DataViewDefinition')!.hasEditingChanges()).toBe(false)
    expect(f.fileWrites).toHaveLength(0); expect(writes(f)).toHaveLength(0)
  })
  it('removes only inline call defaults while preserving the other request draft', async () => {
    const f = fixture(), {wrapper} = await page(); await select(wrapper, 'shared')
    const editor = wrapper.getComponent(DataSpaceViewEditor), parameters = editor.get('[data-request-parameters]')
    editor.get('[data-request-workspace] [data-json-member="outputType"]').getComponent(ElRadioGroup).vm.$emit('update:modelValue','Table'); await flushPromises()
    await parameters.get('[data-json-property="customer"]').setValue('temporary'); await flushPromises()
    await parameters.get('[data-action="clear-query-parameters"]').trigger('click'); await flushPromises()
    const row = f.sessions[0]!.metadataDataSet.getView('DataViewDefinition')!.getEditingRow(editor.props('rowKey')!)!
    expect(row['queryContext']).toBeUndefined(); expect(row['queryConfig']).toEqual({outputType:'Table'})
    expect(parameters.get('[data-json-property="customer"]').element).toHaveProperty('value', '')
    expect(f.fileWrites).toHaveLength(0); expect(writes(f)).toHaveLength(0)
  })
  it('edits the request workspace directly in its selected view and preserves other query members after reopen', async () => {
    const f=fixture()
    f.stored.set('A',JSON.stringify({scenarioId:'A',tables:{OrdersAlias:{modelBinding:{modelId:'M1',modelName:'Orders'},views:{default:{},shared:{queryConfig:{sourceInputMode:'mapped',fields:['rowid']}}}}}}))
    const {wrapper,instance}=await page();await select(wrapper,'shared')
    const editor=wrapper.getComponent(DataSpaceViewEditor)
    const request=editor.get('[data-request-workspace]')
    expect(request.text()).toContain('视图查询参数');expect(request.text()).toContain('自引用参数');expect(request.text()).toContain('结果读取')
    expect(instance.isDirty).toBe(false)
    request.get('[data-json-member="outputType"]').getComponent(ElRadioGroup).vm.$emit('update:modelValue','Table');await flushPromises()
    request.get('[data-json-member="allPages"]').getComponent(ElRadioGroup).vm.$emit('update:modelValue',false);await flushPromises()
    request.get('[data-json-member="maxRows"]').getComponent(ElInputNumber).vm.$emit('update:modelValue',50);await flushPromises()
    request.get('[data-json-member="cacheType"]').getComponent(ElRadioGroup).vm.$emit('update:modelValue','browser');await flushPromises()
    expect(instance.isDirty).toBe(true)
    await editor.get('[data-action="save-views"]').trigger('click');await flushPromises()
    expect(f.fileWrites).toHaveLength(1);expect(writes(f)).toHaveLength(0)
    const fresh=await f.open('A')
    expect(fresh.definitionDataSet!.getView('OrdersAlias','shared')!.queryConfig).toEqual({sourceInputMode:'mapped',fields:['rowid'],outputType:'Table',allPages:false,maxRows:50,cacheType:'browser'})
    expect(fresh.definitionDataSet!.getView('OrdersAlias','default')!.queryConfig).toEqual({})
  })
  it('protects request filter dialog drafts from save or switching and discards through the original view', async () => {
    const f=fixture(),{wrapper,instance}=await page();await select(wrapper,'shared')
    const editor=wrapper.getComponent(DataSpaceViewEditor),request=editor.get('[data-request-workspace]')
    const filter=request.getComponent(FilterExpressionEditor)
    await filter.get('[data-action="open"]').trigger('click'); await flushPromises()
    const body = new DOMWrapper(document.body)
    await body.get('[data-action="json"]').trigger('click'); await body.get('[data-action="json-text"]').trigger('click');await flushPromises()
    filter.getComponent(SparkJsonEditor).vm.$emit('update:modelValue','{"logic":"and","conditions":[]} ');await flushPromises()
    expect(instance.isDirty).toBe(true)
    expect(editor.get('[data-action="save-views"]').attributes('disabled')).toBeDefined()
    request.get('[data-json-member="outputType"]').getComponent(ElRadioGroup).vm.$emit('update:modelValue','Join');await flushPromises()
    expect(editor.get('[data-action="save-views"]').attributes('disabled')).toBeDefined()
    expect(editor.text()).toContain('请先应用或取消过滤编辑')
    await openViewProperties(editor)
    await editor.get('[data-edit-property="queryConfig"]').trigger('click');await flushPromises()
    expect(editor.find('[data-complex-property]').exists()).toBe(false)
    await editor.get('[data-action="discard-view-edits"]').trigger('click');await flushPromises()
    expect(instance.isDirty).toBe(false)
    expect(f.sessions[0]!.metadataDataSet.getView('DataViewDefinition')!.hasEditingChanges()).toBe(false)
    expect(writes(f)).toHaveLength(0);expect(f.fileWrites).toHaveLength(0)
  })
  it.each([
    {field:'queryConfig',finish:'correct'}, {field:'queryConfig',finish:'cancel'},
    {field:'queryContext',finish:'correct'}, {field:'queryContext',finish:'cancel'},
  ])('protects rejected $field input through $finish and the original save/reopen chain',async({field,finish})=>{
    const f=fixture(),{wrapper,instance}=await page();await select(wrapper,'shared')
    const editor=wrapper.getComponent(DataSpaceViewEditor)
    await openViewProperties(editor)
    await editor.get(`[data-edit-property="${field}"]`).trigger('click');await flushPromises()
    const input=field==='queryConfig'?editor.get<HTMLTextAreaElement>('[data-json-member="filterLookups"] textarea'):editor.get<HTMLInputElement>('[data-json-property="customer"]')
    await input.setValue(field==='queryConfig'?'[{':'1e999');await flushPromises()
    expect(editor.get('[data-action="finish-view-property"]').attributes('disabled')).toBeDefined()
    const toggle=editor.get(`[data-action="${field==='queryConfig'?'toggle-query-json':'toggle-context-json'}"]`)
    expect(toggle.attributes('disabled')).toBeDefined()
    await toggle.trigger('click');await editor.get('[data-action="finish-view-property"]').trigger('click');await flushPromises()
    expect(editor.find(`[data-complex-property="${field}"]`).exists()).toBe(true)
    expect(input.element.value).toBe(field==='queryConfig'?'[{':'1e999')
    expect(f.fileWrites).toEqual([]);expect(writes(f)).toEqual([])
    if(finish==='correct') {
      await input.setValue(field==='queryConfig'?'[]':'false');await flushPromises()
      await editor.get('[data-action="finish-view-property"]').trigger('click');await flushPromises()
      await editor.get('[data-action="save-views"]').trigger('click');await flushPromises()
      expect(instance.isDirty,editor.text()).toBe(false)
      const fresh=await f.open('A'),target=fresh.definitionDataSet!.getView('OrdersAlias','shared')!
      if(field==='queryConfig')expect(target.queryConfig.filterLookups).toEqual([])
      else expect(target.queryContext['customer']).toBe(false)
      expect(fresh.definitionDataSet!.getView('OrdersAlias','default')!.queryConfig).toEqual({})
      expect((await target.loadFromServer()).success).toBe(true)
      expect(f.fileWrites).toHaveLength(1)
    } else {
      const cancel=field==='queryConfig'?'[data-json-member="filterLookups"] [data-json-cancel-input]':'[data-json-cancel-property="customer"]'
      await editor.get(cancel).trigger('click');await flushPromises()
      await editor.get('[data-action="finish-view-property"]').trigger('click');await flushPromises()
      expect(instance.isDirty).toBe(false);expect(f.fileWrites).toEqual([])
    }
    expect(writes(f)).toEqual([])
  })
  it('aggregates unfinished inline request editors and explicitly cancels unaccepted input without writes',async()=>{
    const f=fixture(),{wrapper,instance}=await page();await select(wrapper,'shared')
    const editor=wrapper.getComponent(DataSpaceViewEditor),request=editor.get('[data-request-workspace]')
    const node=request.get<HTMLInputElement>('[data-json-member="nodeId"] input')
    node.element.value='ROOT';await node.trigger('input');await flushPromises()
    expect(instance.isDirty).toBe(true)
    await request.get('[data-json-property="customer"]').setValue('1e999');await flushPromises()
    for(const action of ['preview-remote-views','remove-view']) {
      expect(editor.get(`[data-action="${action}"]`).attributes('disabled')).toBeDefined()
      await editor.get(`[data-action="${action}"]`).trigger('click');await flushPromises()
    }
    expect(request.get<HTMLInputElement>('[data-json-property="customer"]').element.value).toBe('1e999')
    expect(editor.get('[data-action="save-views"]').attributes('disabled')).toBeDefined()
    expect(request.get('[data-action="toggle-inline-context-json"]').attributes('disabled')).toBeDefined()
    await request.get('[data-json-cancel-property="customer"]').trigger('click');await flushPromises()
    expect(instance.isDirty).toBe(true)
    expect(node.element.value).toBe('ROOT')
    expect(editor.get('[data-action="save-views"]').attributes('disabled')).toBeDefined()
    await openViewProperties(editor)
    await editor.get('[data-edit-property="queryConfig"]').trigger('click');await flushPromises()
    expect(editor.find('[data-complex-property]').exists()).toBe(false)
    await editor.get('[data-action="discard-view-edits"]').trigger('click');await flushPromises()
    expect(instance.isDirty).toBe(false)
    expect(editor.get<HTMLInputElement>('[data-json-member="nodeId"] input').element.value).toBe('')
    expect(editor.get<HTMLInputElement>('[data-json-property="customer"]').element.value).toBe('')
    expect(f.sessions[0]!.metadataDataSet.getView('DataViewDefinition')!.hasEditingChanges()).toBe(false)
    expect(writes(f)).toEqual([]);expect(f.fileWrites).toEqual([])
  })
  it.each(['correct','cancel'] as const)('guards rejected complete JSON until %s before named-view persistence',async finish=>{
    const f=fixture(),{wrapper,instance}=await page();await select(wrapper,'shared')
    const editor=wrapper.getComponent(DataSpaceViewEditor)
    await openViewProperties(editor)
    await editor.get('[data-edit-property="queryContext"]').trigger('click');await flushPromises()
    await editor.get('[data-action="toggle-context-json"]').trigger('click');await flushPromises()
    editor.getComponent(JsonTreeEditor).vm.$emit('update:modelValue','{}');await flushPromises()
    expect(editor.get('[data-action="finish-view-property"]').attributes('disabled')).toBeDefined()
    expect(editor.get('[data-action="toggle-context-json"]').attributes('disabled')).toBeDefined()
    expect(f.fileWrites).toHaveLength(0);expect(writes(f)).toHaveLength(0)
    if(finish==='cancel') {
      await editor.get('[data-json-cancel-editor-input]').trigger('click');await flushPromises()
      await editor.get('[data-action="finish-view-property"]').trigger('click');await flushPromises()
      expect(instance.isDirty).toBe(false);expect(f.fileWrites).toHaveLength(0)
    } else {
      editor.getComponent(JsonTreeEditor).vm.$emit('update:modelValue','{"value":{"customer":false}}');await flushPromises()
      await editor.get('[data-action="finish-view-property"]').trigger('click');await flushPromises()
      await editor.get('[data-action="save-views"]').trigger('click');await flushPromises()
      expect(instance.isDirty).toBe(false)
      const fresh=await f.open('A'),target=fresh.definitionDataSet!.getView('OrdersAlias','shared')!
      expect(target.queryContext['customer']).toBe(false)
      expect((await target.loadFromServer()).success).toBe(true)
      expect(f.fileWrites).toHaveLength(1);expect(writes(f)).toHaveLength(0)
    }
  })
  it('cancels native query output selection and rejects saving an empty list', async () => {
    const f=fixture(), {wrapper}=await page();await select(wrapper,'shared')
    const editor=wrapper.getComponent(DataSpaceViewEditor)
    const loadFields = vi.spyOn(f.sessions[0]!, 'loadViewFields')
    await openViewProperties(editor)
    await editor.get('[data-edit-property="queryConfig"]').trigger('click');await flushPromises()
    expect(loadFields).not.toHaveBeenCalled()
    editor.get('[data-json-member="fields"]').getComponent(ElSelect).vm.$emit('update:modelValue',['rowid']);await flushPromises()
    await editor.get('[data-action="finish-view-property"]').trigger('click');await flushPromises()
    await editor.get('[data-action="discard-view-edits"]').trigger('click');await flushPromises()
    expect(f.sessions[0]!.metadataDataSet.getView('DataViewDefinition')!.hasEditingChanges()).toBe(false)
    await openViewProperties(editor)
    expect(editor.get('[data-property="queryConfig"]').text()).toContain('未配置')
    await openViewProperties(editor)
    await editor.get('[data-edit-property="queryConfig"]').trigger('click');await flushPromises()
    editor.get('[data-json-member="fields"]').getComponent(ElSelect).vm.$emit('update:modelValue',[]);await flushPromises()
    await editor.get('[data-action="finish-view-property"]').trigger('click');await flushPromises()
    await editor.get('[data-action="save-views"]').trigger('click');await flushPromises()
    expect(editor.text()).toContain('非空且不重复的字段列表');expect(f.fileWrites).toHaveLength(0);expect(writes(f)).toHaveLength(0)
  })
  it('selects native query output fields and preserves aliases after save and fresh paged queries', async () => {
    const f = fixture({formalProjection:true,sourceFields:[
      {rowid:'F1',dataModelId:'M1',Name:'rowid',type:'dataModel',FieldType:'string',IsPKey:1,IsOutput:1},
      {rowid:'F2',dataModelId:'M1',Name:'Source_Name',AsName:'title',description:'订单标题',type:'dataModel',FieldType:'string',IsOutput:1},
      {rowid:'F3',dataModelId:'M1',Name:'unused',type:'dataModel',FieldType:'string',IsOutput:1},
    ],businessRows:{Orders:[{rowid:'R1',title:'one',unused:'keep'}]}})
    f.setModelValues({Type:'数据库表'})
    f.stored.set('A',JSON.stringify({scenarioId:'A',tables:{OrdersAlias:{modelBinding:{modelId:'M1',modelName:'Orders'},views:{default:{},shared:{pageSize:1}}}}}))
    const {wrapper} = await page(); await select(wrapper,'shared')
    const editor = wrapper.getComponent(DataSpaceViewEditor)
    await openViewProperties(editor)
    await editor.get('[data-edit-property="queryConfig"]').trigger('click');await flushPromises()
    const selector = () => editor.get('[data-json-member="fields"]').getComponent(ElSelect)
    expect(selector().props('multiple')).toBe(true)
    await selector().get('.el-select__wrapper').trigger('click');await flushPromises()
    expect(selector().findAllComponents(ElOption).map(option=>option.props('value'))).toEqual(['rowid','title','unused'])
    selector().vm.$emit('update:modelValue',['title']);await flushPromises()
    await editor.get('[data-action="finish-view-property"]').trigger('click');await flushPromises()
    await editor.get('[data-action="save-views"]').trigger('click');await flushPromises()
    expect(f.fileWrites).toHaveLength(1);expect(writes(f)).toHaveLength(0)
    const fresh = await f.open('A'), target=fresh.definitionDataSet!.getView('OrdersAlias','shared')!
    expect(target.queryConfig.fields).toEqual(['title'])
    expect(fresh.definitionDataSet!.getView('OrdersAlias','default')!.queryConfig.fields).toBeUndefined()
    const preview=await fresh.openPreview({modelId:'M1',modelName:'Orders',tableName:'OrdersAlias',viewId:'shared'})
    try {
      expect((await preview.view.loadFromServer()).success).toBe(true)
      expect(preview.view.rows[0]).toMatchObject({rowid:'R1',title:'one'})
      expect(preview.view.rows[0]).not.toHaveProperty('unused')
      await preview.view.setSort([{field:'title',direction:'desc'}]);await preview.view.setPage(2)
      const requests=f.requests.filter(request=>isRecord(request.data)&&Array.isArray(request.data['Table'])&&isRecord(request.data['Table'][0])&&request.data['Table'][0]['Name']==='Orders')
      expect(requests.at(-1)?.data).toMatchObject({OutputFieldMode:'REQUEST',PageParam:{index:2},Table:[{Fields:expect.arrayContaining([expect.objectContaining({Name:'Source_Name',OrderType:'descending'}),expect.objectContaining({Name:'rowid'})])}]})
      expect(JSON.stringify(requests.at(-1)?.data)).not.toContain('AsName')
      expect(JSON.stringify(requests.at(-1)?.data)).not.toContain('unused')
    } finally {preview.dispose()}
  })
  it('creates a view query context from an unset native field without losing its first parameter', async () => {
    const f = fixture(), {wrapper} = await page(); await select(wrapper, 'shared')
    const editor = wrapper.getComponent(DataSpaceViewEditor)
    await openViewProperties(editor)
    await editor.get('[data-edit-property="queryContext"]').trigger('click'); await flushPromises()
    await editor.get('[data-json-property="customer"]').setValue('FIRST'); await flushPromises()
    expect(f.sessions[0]!.metadataDataSet.getView('DataViewDefinition')!.hasEditingChanges()).toBe(true)
    await editor.get('[data-action="finish-view-property"]').trigger('click'); await flushPromises()
    await openViewProperties(editor)
    expect(editor.get('[data-property="queryContext"]').text()).toContain('FIRST')
  })
  it.each(['mapped', 'direct'] as const)('edits %s query defaults by the proper parameter catalogue and preserves source mappings after reopen', async mode => {
    const f = fixture({sourceInput: true, businessRows: {Orders: [{rowid: 'O1', parentId: ''}]}})
    if (mode === 'mapped') {
      const setup = await f.open('A'), owner = setup.getSourceInput('F2')
      owner.stage('{"Type":"GetInputParam","ParamName":"customer"}'); await owner.save(); setup.dispose()
    }
    const mapping = f.sourceValue(), dbWrites = writes(f).length
    f.stored.set('A', JSON.stringify({scenarioId:'A',tables:{OrdersAlias:{modelBinding:{modelId:'M1',modelName:'Orders'},views:{default:{},shared:{queryConfig:{sourceInputMode:mode},queryContext:{retained:{flag:false}}}}}}}))
    const {wrapper, instance} = await page(); await select(wrapper, 'shared')
    const editor = wrapper.getComponent(DataSpaceViewEditor), name = mode === 'direct' ? 'customerArg' : 'customer'
    const loadInputs = vi.spyOn(f.sessions[0]!, 'loadSourceInputFields')
    await openViewProperties(editor)
    await editor.get('[data-edit-property="queryContext"]').trigger('click'); await flushPromises()
    expect(loadInputs).toHaveBeenCalledTimes(mode === 'direct' ? 1 : 0)
    expect(editor.find(`[data-json-property="${mode === 'direct' ? 'customer' : 'customerArg'}"]`).exists()).toBe(false)
    await editor.get(`[data-json-property="${name}"]`).setValue('false'); await flushPromises()
    await editor.get('[data-action="discard-view-edits"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false); expect(f.fileWrites).toHaveLength(0)
    await openViewProperties(editor)
    await editor.get('[data-edit-property="queryContext"]').trigger('click'); await flushPromises()
    expect(loadInputs).toHaveBeenCalledTimes(mode === 'direct' ? 1 : 0)
    expect(editor.get(`[data-json-property="${name}"]`).element).toHaveProperty('value', '')
    await editor.get(`[data-json-property="${name}"]`).setValue('false'); await flushPromises()
    await editor.get('[data-action="finish-view-property"]').trigger('click'); await flushPromises()
    await editor.get('[data-action="save-views"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false); expect(f.fileWrites).toHaveLength(1); expect(writes(f)).toHaveLength(dbWrites)
    const fresh = await f.open('A'), preview = await fresh.openPreview({tableName:'OrdersAlias',viewId:'shared',modelId:'M1',modelName:'Orders'})
    try {
      expect(preview.view.queryContext).toEqual({retained:{flag:false},[name]:false})
      await preview.query({context:{}})
      expect(f.requests.filter(request => request.url === '/api/DataOperation/GetData').at(-1)?.data)
        .toMatchObject({Table:[{inputParams:expect.arrayContaining([{Name:'customerArg',Value:false},{Name:'retained',Value:{flag:false}}])}]})
    } finally {preview.dispose()}
    expect(f.sourceValue()).toBe(mapping)
  })
  it('places request settings under a selected native data view and keeps model attributes in the model workspace', async () => {
    const f = fixture(); f.setModelValues({OutputType: 'Join', cacheType: '页面', RequestComplete: 'legacy-handler'})
    const {wrapper, instance} = await page(); await select(wrapper, 'Orders')
    const tabs = wrapper.getComponent(RendererTabs)
    expect(tabs.findAll('[role="tab"]').filter(tab => tab.element.closest('.el-tabs') === tabs.get('.el-tabs').element).map(tab => tab.text()))
      .toEqual(['1 模型结构', '2 请求方案', '3 字段呈现', '4 数据处理', '5 数据视图'])
    const model = wrapper.getComponent(DataSpaceModelEditor)
    expect(model.isVisible()).toBe(true)
    expect(model.find('[data-model-field="IsBusinessMain"]').exists()).toBe(true)
    expect(model.find('[data-model-field="OutputType"]').exists()).toBe(false)
    await tabs.get('#tab-views').trigger('click'); await flushPromises()
    const editor = wrapper.getComponent(DataSpaceViewEditor)
    expect(editor.get('[data-view-request-settings]').text()).toContain('请求设置')
    expect(editor.props('rowKey')).toBeDefined()
    await openViewProperties(editor)
    expect(editor.find('[data-view-request-settings] [data-property="queryConfig"]').exists()).toBe(true)
    await openViewProperties(editor)
    expect(editor.find('[data-view-request-settings] [data-property="filterExpression"]').exists()).toBe(true)
    expect(editor.get('[data-legacy-request]').text()).toContain('旧模型请求配置')
    expect(instance.isDirty).toBe(false); expect(writes(f)).toHaveLength(0); expect(f.fileWrites).toHaveLength(0)
  })

  it('cancels view request settings without changing legacy model data or the saved file', async () => {
    const f = fixture({businessRows: {Orders: [{rowid: 'O1', parentId: null}]}})
    f.setModelValues({OutputType: 'Join', cacheType: '页面', RequestComplete: 'legacy-handler'})
    const {wrapper, instance} = await page(); await select(wrapper, 'shared')
    const editor = wrapper.getComponent(DataSpaceViewEditor)
    await openViewProperties(editor)
    expect(editor.find('[data-view-request-settings] [data-property="queryConfig"]').exists()).toBe(true)
    await openViewProperties(editor)
    await editor.get('[data-edit-property="queryConfig"]').trigger('click'); await flushPromises()
    await writeJsonBound(editor, 'queryConfig', {outputType: 'Table', allPages: true, maxRows: 50})
    await editor.get('[data-action="finish-view-property"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(true)
    await editor.get('[data-action="discard-view-edits"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false); expect(f.fileWrites).toHaveLength(0)
    expect(writes(f)).toHaveLength(0)
    expect(f.modelRow()).toMatchObject({OutputType:'Join',cacheType:'页面',RequestComplete:'legacy-handler'})
  })
  it('saves request settings to only the selected data view and reopens its own query without changing legacy model data', async () => {
    const f = fixture({businessRows: {Orders: [{rowid: 'O1', parentId: null}]}})
    f.setModelValues({OutputType: 'Join', cacheType: '页面', RequestComplete: 'legacy-handler'})
    const {wrapper, instance} = await page(); await select(wrapper, 'shared')
    const editor = wrapper.getComponent(DataSpaceViewEditor)
    await openViewProperties(editor)
    await editor.get('[data-edit-property="queryConfig"]').trigger('click'); await flushPromises()
    await writeJsonBound(editor, 'queryConfig', {outputType: 'Table', allPages: true, maxRows: 50})
    await editor.get('[data-action="finish-view-property"]').trigger('click'); await flushPromises()
    await editor.get('[data-action="save-views"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false); expect(writes(f)).toHaveLength(0); expect(f.fileWrites).toHaveLength(1)
    const fresh = await f.open('A')
    expect(fresh.metadataDataSet.getView('Base_DataModel')!.getEditingRow('M1')).toMatchObject({OutputType: 'Join', cacheType: '页面', RequestComplete: 'legacy-handler'})
    expect(fresh.definitionDataSet!.getView('OrdersAlias', 'default')!.queryConfig).toEqual({})
    expect(fresh.definitionDataSet!.getView('CustomersAlias', 'shared')!.pageSize).toBe(24)
    const preview = await fresh.openPreview({tableName: 'OrdersAlias', viewId: 'shared', modelId: 'M1', modelName: 'Orders'})
    try {
      expect(preview.view.queryConfig).toEqual({outputType: 'Table', allPages: true, maxRows: 50})
      expect((await preview.view.loadFromServer()).success).toBe(true)
      await preview.view.setSort([{field: 'rowid', direction: 'desc'}])
      expect(f.requests.filter(request => request.url === '/api/DataOperation/GetData').at(-1)!.data).toMatchObject({Table: [{Name: 'Orders', OutputType: 'Table'}]})
    } finally {preview.dispose()}
  })

  it('edits native query settings with typed controls, preserves other members and reopens the same tree request', async () => {
    const f = fixture({businessRows: {Orders: [{rowid: 'O1', parentId: 'ROOT'}]}})
    const {wrapper, instance} = await page(); await select(wrapper, 'shared')
    const editor = wrapper.getComponent(DataSpaceViewEditor)
    await openViewProperties(editor)
    await editor.get('[data-edit-property="queryConfig"]').trigger('click'); await flushPromises()
    expect(f.sessions[0]!.metadataDataSet.getView('DataViewDefinition')!.hasEditingChanges()).toBe(false)
    const query = editor.get('[data-complex-property="queryConfig"]')
    query.get('[data-json-member="outputType"]').getComponent(ElSelect).vm.$emit('update:modelValue', 'SelfRefData'); await flushPromises()
    for (const [name, value] of [['keyField', 'rowid'], ['parentField', 'parentId'], ['mode', 'child']]) {
      query.get(`[data-json-member="tree"] [data-json-member="${name}"]`).getComponent(ElSelect).vm.$emit('update:modelValue', value); await flushPromises()
    }
    await query.get('[data-json-member="nodeId"] input').setValue('ROOT'); await flushPromises()
    query.get('[data-json-member="maxRows"]').getComponent(ElInputNumber).vm.$emit('update:modelValue', 50); await flushPromises()
    query.get('[data-json-member="allPages"]').getComponent(ElSelect).vm.$emit('update:modelValue', false); await flushPromises()
    await editor.get('[data-action="finish-view-property"]').trigger('click'); await flushPromises()
    await editor.get('[data-action="save-views"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false); expect(f.fileWrites).toHaveLength(1); expect(writes(f)).toHaveLength(0)
    const fresh = await f.open('A')
    const saved = fresh.definitionDataSet!.getView('OrdersAlias', 'shared')!
    expect(saved.queryConfig).toEqual({outputType: 'SelfRefData', tree: {keyField: 'rowid', parentField: 'parentId', nodeId: 'ROOT', mode: 'child'}, maxRows: 50, allPages: false})
    expect(saved.treeConfig).toMatchObject({idField: 'rowid', parentIdField: 'parentId'})
    expect(fresh.definitionDataSet!.getView('OrdersAlias', 'default')!.queryConfig).toEqual({})
    const preview = await fresh.openPreview({tableName: 'OrdersAlias', viewId: 'shared', modelId: 'M1', modelName: 'Orders'})
    try {expect(preview.view.queryConfig).toEqual(saved.queryConfig); expect((await preview.view.loadFromServer()).success).toBe(true)}
    finally {preview.dispose()}
  })

  it.each([
    {DbName: 'warehouse', MetaName: 'OrderSource', Type: '数据库表', label: 'warehouse.OrderSource (数据库表)'},
    {DbName: 'OrderSource', MetaName: 'OrderSource', Type: '', label: 'OrderSource'},
    {DbName: '', MetaName: 'OrderSource', Type: '接口', label: 'OrderSource (接口)'},
  ])('binds the reference source label without mixing deletion or raw definition into the model workspace: $label', async ({label, ...source}) => {
    const f = fixture(); f.setModelValues(source)
    const {wrapper} = await page()
    await select(wrapper, 'Orders')
    expect(wrapper.get('.meta-source').text()).toBe(`绑定源: ${label}`)
    expect(wrapper.find('[data-action="preview-remove-model"]').exists()).toBe(false)
    expect(wrapper.find('.design-detail details').exists()).toBe(false)
    const displays = wrapper.get('.meta-source').findAllComponents({name: 'DisplayText'})
    expect(displays.length).toBeGreaterThan(0)
    for (const display of displays) {
      expect(display.props('dataViewKey')).toBe(`${f.sessions[0]!.metadataDataSet.scenarioId}@Base_DataModel@default`)
      expect(display.props('dataMember')).toBe('currentRow')
    }
    expect(writes(f)).toHaveLength(0)
  })

  it('keeps unreadable source fields out of the reference source label', async () => {
    const f = fixture({hiddenModelProperties: ['DbName']})
    f.setModelValues({DbName: 'private-db', MetaName: 'OrderSource', Type: '数据库表'})
    const {wrapper} = await page(); await select(wrapper, 'Orders')
    expect(wrapper.find('.meta-source').exists()).toBe(true)
    expect(wrapper.get('.meta-source').text()).toContain('OrderSource')
    expect(wrapper.get('.meta-source').text()).not.toContain('private-db')
    expect(writes(f)).toHaveLength(0)
  })

  it('shows the overview and canvas without waiting for target assembly', async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => {release = resolve})
    const f = fixture({deferDefinition: true, assemblyGate: gate})
    const {wrapper} = await page()
    try {
      expect(wrapper.get('[aria-label="空间工作台概览"]').text()).toContain('空间 A')
      expect(wrapper.text()).not.toContain('正在装配画布定义')
      expect(wrapper.findComponent(RendererGraph).exists()).toBe(true)
      expect(f.sessions[0]!.definitionStatus).toBe('unloaded')
      expect(f.sessions).toHaveLength(1)
      expect(f.fileWrites).toEqual([])
    } finally {release(); await flushPromises()}
    expect(wrapper.findComponent(RendererGraph).exists()).toBe(true)
    expect(wrapper.text()).not.toContain('正在装配画布定义')
    expect(f.fileWrites).toEqual([])
  })

  it('opens the selected model through its bound field view without loading whole-space directories', async () => {
    const f = fixture({overviewOnly: true, sourceFields: [
      {rowid: 'F1', dataModelId: 'M1', Name: 'title', type: 'dataModel', FieldType: 'string', IsOutput: 1},
      {rowid: 'F2', dataModelId: 'M2', Name: 'note', type: 'dataModel', FieldType: 'string', IsOutput: 1},
    ]})
    const {wrapper} = await page('?scenarioId=A', true)
    const session = f.sessions[0]!
    const fields = session.metadataDataSet.getView('Base_DataModel_Field')!
    const relations = session.metadataDataSet.getView('Base_DataModel_Relation')!
    expect(fields.rows).toEqual([])
    expect(relations.rows).toEqual([])
    const navigation = resolveDataViewKey(wrapper.getComponent(RendererTree).props('dataViewKey'), session.metadataDataSet)!
    expect(navigation.rows.some(row => row['label'] === '字段（未加载）')).toBe(true)
    await wrapper.get('[data-design-node="models"]').trigger('click')
    await flushPromises()
    expect(fields.requestState).toBe(RequestState.Idle)
    expect(relations.requestState).toBe(RequestState.Loaded)
    await select(wrapper, 'Orders')
    const workspace = await session.loadModelFields('M1')
    expect(workspace.rows.map(row => row['rowid'])).toEqual(['F1'])
    expect(workspace.queryContext).toMatchObject({dataSpaceId: 'A', modelId: 'M1'})
    await openModelFieldsTab(wrapper)
    const table = wrapper.findComponent({name: 'DataSpaceFieldEditor'}).getComponent(RendererTable)
    expect(table.props('dataViewKey')).toBe(`${session.metadataDataSet.scenarioId}@Base_DataModel_Field@modelFields`)
    expect(resolveDataViewKey(table.props('dataViewKey'), session.metadataDataSet)).toBe(workspace)
    expect(table.getComponent(ElTable).props()).toMatchObject({maxHeight:520})
    expect(session.getModelEdit('M1').read().columns).toEqual([{name: 'title', type: 'string'}])
    expect(session.getModelEdit('M1').read().warning).toBe('')
    expect(fields.requestState).toBe(RequestState.Idle)
    expect(relations.requestState).toBe(RequestState.Loaded)
    expect(f.fileWrites).toEqual([])
  })

  it('keeps the overview usable after a deferred field failure and retries the selected workspace', async () => {
    const f = fixture({overviewOnly: true, sourceFields: [
      {rowid: 'F1', dataModelId: 'M1', Name: 'title', type: 'dataModel', FieldType: 'string', IsOutput: 1},
    ]})
    const {wrapper} = await page()
    f.failNextFieldRead()
    await select(wrapper, 'Orders')
    await openModelFieldsTab(wrapper)
    expect(wrapper.findComponent({name: 'DataSpaceModelFields'}).text()).toContain('field read unavailable')
    expect(wrapper.findComponent({name: 'DataSpaceFieldEditor'}).exists()).toBe(false)
    expect(wrapper.text()).toContain('空间 A')
    expect(f.sessions[0]!.metadataDataSet.destroyed).toBe(false)
    const retry = wrapper.findAllComponents(RendererButton).find(button => button.props('label') === '重新读取模型字段')!
    await retry.get('button').trigger('click'); await flushPromises()
    expect(wrapper.text()).not.toContain('field read unavailable')
    expect(f.sessions[0]!.metadataDataSet.getView('Base_DataModel_Field', 'modelFields')!.rows.map(row => row['rowid'])).toEqual(['F1'])
    expect(f.sessions[0]!.metadataDataSet.getView('Base_DataModel_Field')!.requestState).toBe(RequestState.Idle)
    expect(f.fileWrites).toEqual([])
  })

  it('rebuilds from lazy graph endpoints despite an unavailable target resource', async () => {
    const f = fixture({overviewOnly: true, deferDefinition: true, broken: true})
    const {wrapper} = await page()
    const session = f.sessions.at(-1)!, fields = session.metadataDataSet.getView('Base_DataModel_Field')!
    const readFields = vi.spyOn(fields, 'loadFromServer'), save = vi.spyOn(session.metadataDataSet, 'saveChanges')
    await sourceButton(wrapper, 'prepare-layout-rebuild').trigger('click'); await flushPromises()
    expect(wrapper.find('[data-layout-rebuild]').exists()).toBe(true)
    expect(wrapper.text()).toContain('模型 2 个，关系 0 条')
    expect(readFields).not.toHaveBeenCalled()
    await sourceButton(wrapper, 'confirm-layout-rebuild').trigger('click'); await flushPromises()
    expect(save).toHaveBeenCalledWith({views: [{tableName: 'DataSpaceLayoutDefinition', viewId: 'default'}]})
    expect(f.fileWrites).toHaveLength(1)
    expect(f.assemblyScopes).toEqual([])
    expect(readFields).not.toHaveBeenCalled()
    expect(fields.requestState).toBe(RequestState.Idle)
    expect(wrapper.find('[data-layout-rebuild]').exists()).toBe(false)
    const reopened = await f.open('A', {deferDefinition: true})
    expect(reopened.viewState!.config['layout']).toEqual({modelPositions: {M1: {x: 250, y: 150}, M2: {x: 250, y: 356}}})
  })

  it('renders saved reference coordinates through the standard graph without writes or a missing-layout prompt', async () => {
    const f = fixture({readLegacyLayout: async () => JSON.stringify({graphVersion: 1,
      nodes: [{id: 'M1', x: 170, y: 110}, {id: 'M2', x: 998, y: 406}], edges: []})})
    const {wrapper} = await page()
    expect(wrapper.findComponent(RendererGraph).props('nodePositions')).toEqual({M1: {x: 170, y: 110}, M2: {x: 998, y: 406}})
    expect(wrapper.text()).not.toContain('尚未保存布局')
    expect(f.fileWrites).toHaveLength(0)
    expect(f.sessions[0]?.viewState?.dirty).toBe(false)
  })

  it('keeps all formal models in the canvas and layout preview, cancels without writes, and confirms through the original file owner', async () => {
    const f = fixture({allowDataProcess: true})
    f.setModelValues({addApi: 'Customers'})
    const {wrapper} = await page()
    const before = structuredClone(f.sessions.at(-1)!.viewState!.config)
    expect(wrapper.findAllComponents(RendererSection).find(section => section.props('title') === '布局重建')?.props('gridColumns')).toBe(1)
    expect(wrapper.getComponent(VueFlow).props('nodes')!.map(node => node.data.title)).toEqual(['Orders', 'Customers'])
    await sourceButton(wrapper, 'prepare-layout-rebuild').trigger('click'); await flushPromises()
    const preview = wrapper.findAllComponents(RendererGraph).find(graph => graph.attributes('data-layout-rebuild') !== undefined)!
    expect(preview.props('disabled')).toBe(true)
    expect(preview.props('hiddenNodeKeys')).toBeUndefined()
    expect(preview.getComponent(VueFlow).props('nodes')).toHaveLength(2)
    expect(f.fileWrites).toHaveLength(0)
    await sourceButton(wrapper, 'cancel-layout-rebuild').trigger('click'); await flushPromises()
    expect(wrapper.find('[data-layout-rebuild]').exists()).toBe(false)
    expect(f.fileWrites).toHaveLength(0)
    await sourceButton(wrapper, 'prepare-layout-rebuild').trigger('click'); await flushPromises()
    await sourceButton(wrapper, 'confirm-layout-rebuild').trigger('click'); await flushPromises()
    expect(f.fileWrites).toHaveLength(1)
    expect(wrapper.find('[data-layout-rebuild]').exists()).toBe(false)
    const reopened = await f.open('A'), config = reopened.viewState!.config
    expect(config['tables']).toEqual(before['tables'])
    expect(reopened.definitionDataSet?.layout?.modelPositions).toEqual({M1: {x: 250, y: 150}, M2: {x: 250, y: 356}})
    expect(sourceButton(wrapper, 'save-layout').attributes('disabled')).toBeDefined()
  })
})
const fixtures: ReturnType<typeof dataSpacePageFixture>[] = []
const sourceRuntimes: PageRuntime[] = []
beforeAll(async () => {registerAllRenderers(); await getVuePageEntry('/features/data-platform/data-set-management/design/ui/data-set-design-page')?.load()}, 30000)
beforeEach(() => {
  vi.mocked(openLowcodeDataSpaceDesignSession).mockReset()
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
})
afterEach(() => {wrappers.splice(0).forEach(wrapper => wrapper.unmount()); sourceRuntimes.splice(0).forEach(runtime => runtime.dispose()); fixtures.splice(0).forEach(f => f.dispose()); vi.unstubAllGlobals()})
const SourceTable = defineComponent({props: {data: {type: Array as PropType<Record<string, unknown>[]>, default: () => []}},
  setup(props, {slots}) {provide('source-test-rows', computed(() => props.data)); return () => h('div', slots['default']?.())}})
const SourceColumn = defineComponent({props: {prop: String}, setup(props, {slots}) {
  const rows = inject<Readonly<{value: Record<string, unknown>[]}>>('source-test-rows')
  return () => h('div', [slots['header']?.(), ...(rows?.value ?? []).map(row => h('div', slots['default']?.({row}) ?? String(row[props.prop ?? ''] ?? '')))])
}})
function fixture(options: Parameters<typeof dataSpacePageFixture>[0] = {}) {
  const f = dataSpacePageFixture(options); fixtures.push(f)
  vi.mocked(openLowcodeDataSpaceDesignSession).mockImplementation(id => f.open(id, {deferDefinition: true}))
  return f
}
async function modelEditor(session: Awaited<ReturnType<ReturnType<typeof dataSpacePageFixture>['open']>>) {
  const scenarioId = session.metadataDataSet.scenarioId
  if (!scenarioId) throw new Error('元数据空间缺少正式身份')
  const runtime = new PageRuntime({pageId: '/data-space-design', scenarioIds: [scenarioId],
    loadScenario: async () => session.metadataDataSet})
  await runtime.load()
  const Host = defineComponent({props: {modelId: {type: String, default: 'M1'}, revision: {type: Number, default: 0}, disabled: Boolean},
    setup(props) {
      const {sparkProvide} = useSparkComponent({type: 'data-space-design'})
      sparkProvide(PAGE_RUNTIME, runtime)
      onBeforeUnmount(() => runtime.dispose())
      return () => h(DataSpaceModelEditor, {...props, session: markRaw(session)})
    }})
  return mount(Host, {global: {plugins: [ElementPlus]}})
}
async function sourceEditor(session: Awaited<ReturnType<ReturnType<typeof dataSpacePageFixture>['open']>>, realTable = false) {
  const scenarioId = session.metadataDataSet.scenarioId!
  const runtime = new PageRuntime({pageId: '/data-space-design', scenarioIds: [scenarioId], loadScenario: async () => session.metadataDataSet})
  await runtime.load(); sourceRuntimes.push(runtime)
  const Host = defineComponent({props: {revision: {type: Number, default: 0}, disabled: Boolean}, setup(props) {
    const {sparkProvide} = useSparkComponent({type: 'source-test-host'})
    sparkProvide(PAGE_RUNTIME, runtime)
    return () => h(DataSpaceModelSource, {...props, session: markRaw(session)})
  }})
  const wrapper = mount(Host, {attachTo: document.body, global: {plugins: [ElementPlus, Spark.createPlugin()],
    stubs: {SparkComponentRenderer: false, 'spark-component-renderer': false,
      'el-table': realTable ? ElTable : SourceTable, 'el-table-column': realTable ? ElTableColumn : SourceColumn}}})
  await sourceButton(wrapper, 'open-sources').trigger('click'); await flushPromises()
  return wrapper
}
async function openSourcePicker(editor: Pick<VueWrapper, 'findAllComponents'>) {
  await sourceButton(editor, 'open-sources').trigger('click'); await flushPromises()
}
function sourceButton(editor: Pick<VueWrapper, 'findAllComponents'>, action: string) {
  return editor.findAllComponents(RendererButton).find(button => button.attributes('data-action') === action)!.get('button')
}
async function previewGraphModelRemoval(wrapper: ReturnType<typeof mount>) {
  await sourceButton(wrapper, 'close-definition').trigger('click'); await flushPromises()
  await sourceButton(wrapper, 'remove-graph-selection').trigger('click'); await flushPromises()
}
async function editParameter(wrapper: VueWrapper, label: string, value: string) {
  const [name, ordinal] = label.split(' ')
  await parameterCell(wrapper, Number(ordinal) - 1, name === '名称' ? 0 : 1).get('input').setValue(value)
  await flushPromises()
}
function parameterCell(wrapper: VueWrapper, index: number, field: number) {
  return parameterEditor(wrapper).findAll('.el-table__body tbody tr')[index]!.findAll('td')[field]!
}
function parameterEditor(wrapper: VueWrapper) {return wrapper.findAllComponents(FieldJson).find(field => field.props('field') === 'inputParams')!}
function parameterField(wrapper: Pick<VueWrapper, 'findAllComponents'>, label: string) {
  return wrapper.findAllComponents(FieldText).find(component => component.props('label') === label)
}
function parameterInput(wrapper: Pick<VueWrapper, 'findAllComponents'>, label: string) {
  const field = parameterField(wrapper, label)
  if (!field) throw new Error(`Missing parameter input ${label}`)
  return field.get('input')
}
async function previewSource(editor: Pick<VueWrapper, 'findAllComponents' | 'getComponent' | 'find'>, dataSet: Parameters<typeof resolveDataViewKey>[1]) {
  const table = editor.getComponent(RendererTable)
  const view = resolveDataViewKey(table.props('dataViewKey'), dataSet)!
  expect(sourceButton(editor, 'preview-source').attributes('disabled')).toBeDefined()
  table.getComponent(SourceTable).vm.$emit('current-change', view.rows[0]); await flushPromises()
  expect(view.currentRow).toEqual(view.rows[0])
  expect(sourceButton(editor, 'preview-source').attributes('disabled'), `state=${view.requestState}, row=${JSON.stringify(view.currentRow)}`).toBeUndefined()
  await sourceButton(editor, 'preview-source').trigger('click'); await flushPromises()
  expect(editor.getComponent(RendererDialog).props('modelValue'), editor.getComponent(DataSpaceModelSource).text()).toBe(false)
  editor.getComponent(RendererDialog).vm.$emit('update:modelValue', false); await flushPromises()
  expect(sourcePreviewDom().text()).toContain('预览')
}
function sourcePreviewDom() {return new DOMWrapper(document.body).get('[data-source-preview]')}
async function page(query = '?scenarioId=A', realTable = false) {
  const path = '/features/data-platform/data-set-management/design/ui/data-set-design-page'
  const entry = getVuePageEntry(path)
  expect(entry).toBeDefined()
  const component = (await entry!.load()).default
  const router = createRouter({history: createMemoryHistory(), routes: []})
  const dynamic = createDynamicRouter({router, pageComponent: designPageHost(component), componentMap: {[path]: designPageHost(component)},
    loadNavigation: async () => ({id: 'root', title: 'Root', childPlacement: 'header',
      items: [{id: 'design', title: '数据空间设计', path, itemKind: 'system-page'}]})})
  await dynamic.registerRoutes()
  await router.push(`${path}${query}`)
  const instance = dynamic.getSystemPageInstance(router.currentRoute.value)!
  const wrapper = mount(instance.view, {attachTo: document.body, global: {plugins: [router, ElementPlus, Spark.createPlugin()],
    stubs: {SparkComponentRenderer: false, 'spark-component-renderer': false, JsonTreeEditor: true, SparkJsonEditor: true, 'el-button': ElButton,
      'el-table': realTable ? ElTable : SourceTable, 'el-table-column': realTable ? ElTableColumn : SourceColumn}}})
  wrappers.push(wrapper)
  await flushPromises()
  return {wrapper, instance, dynamic}
}
function treePath(items: readonly unknown[], label: string): string[] | undefined {
  for (const item of items) {
    if (!isRecord(item) || typeof item['id'] !== 'string') continue
    if (item['label'] === label) return [item['id']]
    const child = Array.isArray(item['children']) ? treePath(item['children'], label) : undefined
    if (child) return [item['id'], ...child]
  }
  return undefined
}
async function select(wrapper: ReturnType<typeof mount>, label: string) {
  await flushPromises()
  const tree = wrapper.getComponent(ElTree)
  const path = treePath(tree.props('data') ?? [], label)
  for (const id of path?.slice(0, -1) ?? []) {
    const parent = tree.vm.getNode(id)
    if (parent.expanded) continue
    const button = wrapper.findAll('[data-design-node]').find(item => item.attributes('data-design-node') === id)
    const arrow = button?.element.closest('.el-tree-node__content')?.querySelector('.el-tree-node__expand-icon')
    if (!arrow) throw new Error(`missing tree expansion ${parent.label}`)
    await new DOMWrapper(arrow).trigger('click'); await flushPromises()
  }
  const node = wrapper.findAll('[data-design-node]').find(item => item.text() === label)
  if (!node) throw new Error(`missing tree node ${label}`)
  await node.trigger('click'); await flushPromises()
}
async function openModelFieldsTab(wrapper: ReturnType<typeof mount>) {
  const tabs = wrapper.find('.node-panel-tabs').getComponent(RendererTabs)
  await tabs.get('#tab-fields').trigger('click')
  for (let attempt = 0; attempt < 80; attempt++) {
    await flushPromises()
    const workspace = wrapper.find('[aria-label="模型字段工作区"]')
    if (!workspace.exists()) continue
    const loading = workspace.find('[role="status"]')
    if (loading.exists() && loading.text().includes('正在读取')) continue
    if (workspace.find('[aria-label="字段配置编辑"]').exists()) return
    if (workspace.text().includes('此模型尚无字段定义')) return
    if (workspace.find('[role="alert"]').exists()) return
  }
  throw new Error(`model fields tab did not finish loading: ${wrapper.find('[aria-label="模型字段工作区"]').text()}`)
}
function writes(f: ReturnType<typeof dataSpacePageFixture>) {
  return f.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')
}
async function createDirectoryNode(wrapper: VueWrapper) {
  await select(wrapper, '模型（2）')
  await sourceButton(wrapper, 'add-directory-model').trigger('click'); await flushPromises()
}
async function cancelDirectoryNode(wrapper: VueWrapper) {
  await sourceButton(wrapper, 'close-definition').trigger('click'); await flushPromises()
  await sourceButton(wrapper, 'cancel-layout').trigger('click'); await flushPromises()
}
async function dragLayout(wrapper: VueWrapper, title = 'Orders', position = {x: 280, y: 180}) {
  const flow = wrapper.getComponent(VueFlow)
  const node = flow.props('nodes')!.find(item => item.data?.title === title)!
  expect(node.draggable).toBe(true)
  flow.vm.$emit('nodeDragStart', {node})
  flow.vm.$emit('nodeDragStop', {node: {...node, position}})
  await flushPromises()
}

describe('native graph layout persistence', () => {
  it('aligns visible model coordinates as one draft, cancels, saves and independently reopens', async () => {
    const f = fixture({overviewOnly: true})
    const {wrapper, instance} = await page()
    const before = JSON.parse(f.stored.get('A')!)
    const initial = wrapper.getComponent(VueFlow).props('nodes')!.map(node => node.position)
    vi.spyOn(wrapper.get('.graph-canvas').element, 'getBoundingClientRect').mockReturnValue({width: 700, height: 500} as DOMRect)
    await sourceButton(wrapper, 'arrange-graph').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(true)
    expect(f.fileWrites).toHaveLength(0); expect(writes(f)).toHaveLength(0)
    expect(wrapper.getComponent(VueFlow).props('nodes')!.map(node => node.position)).toEqual([{x: 54, y: 50}, {x: 330, y: 50}])
    await sourceButton(wrapper, 'cancel-layout').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false)
    expect(wrapper.getComponent(VueFlow).props('nodes')!.map(node => node.position)).toEqual(initial)
    await sourceButton(wrapper, 'arrange-graph').trigger('click'); await flushPromises()
    await sourceButton(wrapper, 'save-layout').trigger('click'); await flushPromises()
    const layout = {modelPositions: {M1: {x: 170, y: 110}, M2: {x: 446, y: 110}}}
    expect(f.fileWrites).toHaveLength(1); expect(writes(f)).toHaveLength(0)
    expect(JSON.parse(f.stored.get('A')!)).toEqual({...before, layout})
    expect(instance.isDirty).toBe(false)
    expect(f.sessions[0]!.metadataDataSet.getView('Base_DataModel_Field')!.requestState).toBe(RequestState.Idle)
    const reopened = await f.open('A')
    expect(reopened.definitionDataSet?.layout).toEqual(layout)
  })

  it.each([false, true])('creates a database source through bound standard components from overview-only loading and reopens its named view (browse=%s)', async browse => {
    const source = {type: 'table' as const, id: 'PURCHASE_SOURCE', name: 'PurchaseOrders', description: '采购单', dbid: 'DB', databaseName: 'database', providerId: ''}
    const f = fixture({overviewOnly: true, allowModelAdd: true, allowFieldAdd: true,
      businessRows: {PurchaseOrders: [{rowid: 'PO1', id: 'PO1'}]}, modelSources: {
        query: async () => ({rows: [source], total: 1}), prepare: async () => ({source, model: {
          Type: '数据库', MetaName: source.name, description: source.description, DbId: source.dbid, DbName: source.databaseName,
          JoinType: '', ForeignKeyFields: '', JoinFilter: '', PId: ''}, fields: [
          {type: 'dataModel', Name: 'id', description: '采购单ID', FieldType: 'varchar', IsPKey: 1, IsOutput: 1,
            AsName: '', ValueFun: '', Expression: '', allowAIAdd: 0, OrderType: '', Order: 0, Group: 0},
        ]}),
      }})
    const {wrapper, instance} = await page()
    const directory = f.sessions[0]!.metadataDataSet.getView('Base_DataModel_Field', 'default')!
    expect(directory.requestState).toBe(RequestState.Idle)
    if (browse) {
      await select(wrapper, '模型（2）')
      await sourceButton(wrapper, 'add-directory-model').trigger('click'); await flushPromises()
      await sourceButton(wrapper, 'close-definition').trigger('click'); await flushPromises()
      await sourceButton(wrapper, 'cancel-layout').trigger('click'); await flushPromises()
      await select(wrapper, 'Orders')
      await sourceButton(wrapper, 'close-definition').trigger('click'); await flushPromises()
      expect(directory.requestState).toBe(RequestState.Idle)
    }
    await select(wrapper, '模型（2）')
    await sourceButton(wrapper, 'add-directory-model').trigger('click'); await flushPromises()
    const editor = wrapper.getComponent(DataSpaceModelSource)
    await openSourcePicker(editor)
    const candidates = editor.getComponent(RendererTable)
    const view = resolveDataViewKey(candidates.props('dataViewKey'), f.sessions[0]!.metadataDataSet)!
    candidates.getComponent(SourceTable).vm.$emit('current-change', view.rows[0]); await flushPromises()
    await sourceButton(editor, 'preview-source').trigger('click'); await flushPromises()
    expect(writes(f), wrapper.text()).toHaveLength(1)
    const modelId = String(f.created.get('Base_DataModel')?.[0]?.['rowid'])
    expect(f.created.get('Base_DataModel_Field')).toMatchObject([{dataSetId: 'A', dataModelId: modelId, Name: 'id'}])
    expect(directory.requestState).toBe(RequestState.Idle)
    expect(directory.rows).toHaveLength(0)
    await select(wrapper, 'PurchaseOrders')
    expect(wrapper.findComponent(DataSpaceViewEditor).exists(), wrapper.findAll('[role="alert"]').map(item => item.text()).join('\n')).toBe(true)
    await writeBound(wrapper, 'newTable', 'PurchaseBinding')
    await writeBound(wrapper, 'newName', 'detail')
    await wrapper.get('[data-action="add-view"]').trigger('click'); await flushPromises()
    await wrapper.get('[data-action="save-views"]').trigger('click'); await flushPromises()
    expect(instance.isDirty, wrapper.text()).toBe(false)
    await (await boundNumber(wrapper, 'pageSize')).setValue('31')
    await wrapper.get('[data-action="discard-view-edits"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false)
    const reopened = await f.open('A'), bound = reopened.definitionDataSet?.getView('PurchaseBinding', 'detail')
    expect(bound?.dataTable?.modelBinding).toMatchObject({modelId, modelName: 'PurchaseOrders'})
    expect(bound?.columns.some(column => column.name === 'id')).toBe(true)
    expect(bound?.pageSize).not.toBe(31)
    expect((await bound!.loadFromServer()).success).toBe(true)
    expect(bound?.rows).toMatchObject([{id: 'PO1'}])
  }, 15_000)

  it('creates a pending node from the model directory through the same canvas workflow without a direct source-create branch', async () => {
    const f = fixture(), {wrapper, instance} = await page()
    await select(wrapper, '模型（2）')
    expect(wrapper.findComponent(DataSpaceModelSource).exists()).toBe(false)
    expect(wrapper.findComponent({name: 'DataSpaceArrayCreate'}).exists()).toBe(false)
    expect(instance.isDirty).toBe(false)
    await sourceButton(wrapper, 'add-directory-model').trigger('click'); await flushPromises()
    const source = wrapper.getComponent(DataSpaceModelSource)
    expect(source.props('workspaceActions')).toBe(true)
    expect(source.props('confirmOnSelection')).toBe(true)
    expect(wrapper.get('.design-detail h2').text()).toBe('待配置模型')
    expect(wrapper.getComponent(VueFlow).props('nodes')!.filter(node => node.data?.title === '待配置模型')).toHaveLength(1)
    expect(instance.isDirty).toBe(true)
    await sourceButton(wrapper, 'close-definition').trigger('click'); await flushPromises()
    await sourceButton(wrapper, 'cancel-layout').trigger('click'); await flushPromises()
    expect(wrapper.getComponent(VueFlow).props('nodes')).toHaveLength(2)
    expect(instance.isDirty).toBe(false)
    expect(writes(f)).toHaveLength(0); expect(f.fileWrites).toHaveLength(0)
  })

  it.each([{saved: false, lost: false, lostModel: false}, {saved: true, lost: false, lostModel: false}, {saved: true, lost: true, lostModel: false},
    {saved: false, lost: false, lostModel: true}])('replaces the pending node only after model readback and recovers a lost layout receipt: %j', async ({saved, lost, lostModel}) => {
    const source = {type: 'dict' as const, id: 'DICT', name: 'Choices', description: '候选', dbid: '', databaseName: '', providerId: ''}
    const f = fixture({allowModelAdd: true, allowFieldAdd: true, modelSources: {
      query: async () => ({rows: [source], total: 1}), prepare: async () => ({source, model: {
        Type: '字典', MetaName: source.name, description: source.description, DbId: 'DICT', DbName: '', JoinType: '', ForeignKeyFields: '', JoinFilter: '', PId: ''}, fields: []}),
    }})
    const {wrapper, instance} = await page()
    await sourceButton(wrapper, 'add-model-node').trigger('click'); await flushPromises()
    await dragLayout(wrapper, '待配置模型')
    const pendingFlow = wrapper.getComponent(VueFlow)
    pendingFlow.vm.$emit('connect', {source: pendingFlow.props('nodes')!.find(item => item.data?.title === 'Orders')!.id,
      target: pendingFlow.props('nodes')!.find(item => item.data?.title === '待配置模型')!.id}); await flushPromises()
    expect(pendingFlow.props('edges')).toHaveLength(1)
    if (saved) {await sourceButton(wrapper, 'save-layout').trigger('click'); await flushPromises()}
    const flow = wrapper.getComponent(VueFlow), node = flow.props('nodes')!.find(item => item.data?.title === '待配置模型')!
    flow.vm.$emit('nodeDoubleClick', {node}); await flushPromises()
    const editor = wrapper.getComponent(DataSpaceModelSource)
    await openSourcePicker(editor)
    await flushPromises()
    const candidates = editor.getComponent(RendererTable)
    const view = resolveDataViewKey(candidates.props('dataViewKey'), f.sessions[0]!.metadataDataSet)!
    candidates.getComponent(SourceTable).vm.$emit('current-change', view.rows[0]); await flushPromises()
    if (lost) f.loseNextFileResponse()
    if (lostModel) f.loseNextResponse()
    await sourceButton(editor, 'preview-source').trigger('click'); await flushPromises()
    if (lostModel) {
      expect(writes(f)).toHaveLength(1)
      expect(flow.props('nodes')!.some(item => item.data?.title === '待配置模型')).toBe(true)
      expect(sourceButton(editor, 'create-model').attributes('disabled')).toBeDefined()
      await sourceButton(editor, 'verify-create').trigger('click'); await flushPromises()
    }
    expect(writes(f), wrapper.text()).toHaveLength(1)
    expect(f.fileWrites, wrapper.text()).toHaveLength(saved ? 2 : 1)
    expect(flow.props('nodes')!.some(item => item.data?.title === '待配置模型')).toBe(false)
    expect(flow.props('nodes')!.find(item => item.data?.title === 'Choices')?.position).toEqual({x: 280, y: 180})
    if (lost) {
      expect(instance.isDirty).toBe(true)
      expect(wrapper.find('.design-detail').exists()).toBe(false)
      await sourceButton(wrapper, 'verify-layout').trigger('click'); await flushPromises()
    }
    expect(instance.isDirty, wrapper.text()).toBe(false)
    expect(writes(f)).toHaveLength(1); expect(f.fileWrites).toHaveLength(saved ? 2 : 1)
    const reopened = await f.open('A'), id = f.created.get('Base_DataModel')?.[0]?.['rowid'] as string
    expect(reopened.definitionDataSet?.layout?.modelPositions?.[id]).toEqual({x: 396, y: 240})
    expect(Object.keys(reopened.definitionDataSet?.layout?.unboundNodes ?? {})).toEqual([])
    expect(Object.values(reopened.definitionDataSet?.layout?.unboundEdges ?? {})).toEqual([{source: 'M1', target: id}])
  })

  it('connects pending nodes through the standard graph, opens endpoint configuration, removes and cancels without writes', async () => {
    const f = fixture(), {wrapper, instance} = await page()
    await sourceButton(wrapper, 'add-model-node').trigger('click'); await flushPromises()
    expect(wrapper.getComponent(RendererTree).props('currentKey')).toBeNull()
    const flow = wrapper.getComponent(VueFlow)
    const source = flow.props('nodes')!.find(item => item.data?.title === 'Orders')!, target = flow.props('nodes')!.find(item => item.data?.title === '待配置模型')!
    expect(target.connectable).toBe(true)
    flow.vm.$emit('connect', {source: source.id, target: target.id}); await flushPromises()
    expect(flow.props('edges')).toHaveLength(1)
    expect(wrapper.getComponent(RendererTree).props('currentKey')).toBeNull()
    flow.vm.$emit('edgeDoubleClick', {edge: flow.props('edges')![0]}); await flushPromises()
    expect(wrapper.get('.design-detail').text()).toContain('当前连线仅保存设计意图')
    await sourceButton(wrapper, 'configure-edge-target').trigger('click'); await flushPromises()
    expect(wrapper.findComponent(DataSpaceModelSource).exists()).toBe(true)
    await sourceButton(wrapper, 'close-definition').trigger('click'); await flushPromises()
    flow.vm.$emit('edgeClick', {edge: flow.props('edges')![0]}); await flushPromises()
    await sourceButton(wrapper, 'remove-graph-selection').trigger('click'); await flushPromises()
    expect(flow.props('edges')).toHaveLength(0)
    await sourceButton(wrapper, 'cancel-layout').trigger('click'); await flushPromises()
    expect(flow.props('nodes')).toHaveLength(2)
    expect(instance.isDirty).toBe(false)
    expect(writes(f)).toHaveLength(0); expect(f.fileWrites).toHaveLength(0)
  })

  it.each([false, true])('opens a saved pending connection in the native relation editor: save=%s', async save => {
    const f = fixture(), session = await f.open('A'), layout = new DataSpaceLayoutEdit(session)
    await layout.initialize()
    const id = layout.connect('M1', 'M2'); await layout.save(); layout.dispose()
    const {wrapper, instance} = await page()
    const flow = wrapper.getComponent(VueFlow)
    flow.vm.$emit('edgeDoubleClick', {edge: flow.props('edges')![0]}); await flushPromises()
    expect(wrapper.findComponent(RendererFilterExpression).exists(), wrapper.text()).toBe(true)
    expect(wrapper.findAllComponents(FieldText).find(field => field.props('field') === 'relationId')!.props('readonly')).toBe(true)
    expect(instance.isDirty).toBe(true)
    if (save) {
      const relations = f.sessions.at(-1)!.metadataDataSet.getView('DataResourceRelationDefinition', 'default')!
      relations.updateEditingValue(relations.getPkKey(relations.rows[0]!)!, 'filterExpression', {field: 'rowid', operator: 'eq', value: 'x'})
      await flushPromises()
      await sourceButton(wrapper, 'save-relations').trigger('click'); await flushPromises()
    } else {await sourceButton(wrapper, 'discard-relations').trigger('click'); await flushPromises()}
    expect(instance.isDirty).toBe(false)
    expect(f.sessions.at(-1)!.viewState?.config['layout']).toMatchObject({unboundEdges: save ? {} : {[id]: {source: 'M1', target: 'M2'}}})
    const layoutView = f.sessions.at(-1)!.metadataDataSet.getView('DataSpaceLayoutDefinition')!
    await vi.waitFor(() => expect(layoutView.rows[0]?.['unboundEdges'], `${layoutView.requestState}: ${String(layoutView.loadingError)}`).toEqual(save ? {} : {[id]: {source: 'M1', target: 'M2'}}))
    await vi.waitFor(() => expect(flow.props('edges')).toHaveLength(1))
    expect(f.fileWrites).toHaveLength(save ? 2 : 1); expect(writes(f)).toHaveLength(0)
  })

  it('adds a pending canvas node before opening its source controls and cancels without writes', async () => {
    const f = fixture(), {wrapper, instance} = await page()
    await sourceButton(wrapper, 'add-model-node').trigger('click'); await flushPromises()
    expect(wrapper.findComponent(DataSpaceModelSource).exists()).toBe(false)
    expect(instance.isDirty).toBe(true)
    await dragLayout(wrapper, '待配置模型')
    const flow = wrapper.getComponent(VueFlow), node = flow.props('nodes')!.find(item => item.data?.title === '待配置模型')!
    flow.vm.$emit('nodeDoubleClick', {node}); await flushPromises()
    expect(wrapper.findComponent(DataSpaceModelSource).exists()).toBe(true)
    expect(sourceButton(wrapper.getComponent(DataSpaceModelSource), 'open-sources').isVisible()).toBe(true)
    expect(sourceButton(wrapper, 'close-definition').attributes('disabled')).toBeUndefined()
    await sourceButton(wrapper, 'close-definition').trigger('click'); await flushPromises()
    expect(sourceButton(wrapper, 'remove-graph-selection').attributes('disabled'), wrapper.text()).toBeUndefined()
    await sourceButton(wrapper, 'remove-graph-selection').trigger('click'); await flushPromises()
    const pendingView = Object.values(f.sessions[0]!.metadataDataSet.tables).find(table => table.tableName.startsWith('UnboundNodes_'))!.getView('default')!
    expect(pendingView.rows, wrapper.text()).toHaveLength(0)
    expect(flow.props('nodes')!.some(item => item.data?.title === '待配置模型')).toBe(false)
    expect(instance.isDirty).toBe(false)
    expect(writes(f)).toHaveLength(0); expect(f.fileWrites).toHaveLength(0)
  })

  it('saves, reopens and deletes unbound canvas nodes without creating formal models', async () => {
    const f = fixture(), session = await f.open('A'), editor = new DataSpaceLayoutEdit(session)
    await editor.initialize()
    const first = editor.addNode(), second = editor.addNode()
    expect(first).not.toBe(second)
    expect(editor.nodes.rows.map(row => row['Name'])).toEqual(['待配置模型', '待配置模型（1）'])
    editor.move({id: first, x: 90, y: 70})
    expect(editor.pending).toBe(true); expect(writes(f)).toHaveLength(0)
    await editor.save()
    const reopened = new DataSpaceLayoutEdit(await f.open('A'))
    await reopened.initialize()
    expect(reopened.state().positions[first]).toEqual({x: 90, y: 70})
    expect(reopened.nodes.rows.map(row => row['rowid'])).toEqual([first, second])
    reopened.removeNode(first); reopened.cancel(); reopened.state()
    expect(reopened.nodes.rows).toHaveLength(2)
    reopened.removeNode(first); await reopened.save()
    expect((await f.open('A')).definitionDataSet?.layout?.unboundNodes?.[first]).toBeUndefined()
    expect(writes(f)).toHaveLength(0)
    editor.dispose(); reopened.dispose()
  })

  it('restores output and sorting groups with editable value-function cells in the original field view', async () => {
    const f = fixture({overviewOnly: true, allowFieldEdit: true, editableFieldProperties: ['ValueFun'], sourceFields: [
      {rowid: 'F1', dataModelId: 'M1', Name: 'title', type: 'dataModel', FieldType: 'string', IsPKey: 0, IsOutput: 1, ValueFun: ''},
      {rowid: 'F2', dataModelId: 'M1', Name: 'note', type: 'dataModel', FieldType: 'string', IsPKey: 0, IsOutput: 1, ValueFun: ''},
    ]})
    const {wrapper, instance} = await page('?scenarioId=A', true); await select(wrapper, 'Orders')
    await openModelFieldsTab(wrapper)
    const table = wrapper.findComponent({name: 'DataSpaceFieldEditor'})
    expect(parameterField(table, '输出信息')).toBeDefined()
    expect(parameterField(table, '排序')).toBeUndefined()
    const showSort = wrapper.findAllComponents(FieldCheckbox).find(field => field.props('field') === 'showSortGroup')
    if (!showSort) throw new Error('missing sorting display control')
    await showSort.get('input').setValue(true); await flushPromises()
    expect(parameterField(table, '排序')).toBeDefined()
    const cell = table.get('tbody tr:nth-child(2) input[data-function-text]')
    const view = f.sessions[0]?.metadataDataSet.getView('Base_DataModel_Field', 'modelFields')
    if (!view) throw new Error('missing field view')
    const value = JSON.stringify({Type: 'GetConstValue', Value: '标题'})
    await cell.setValue(value); await flushPromises()
    expect(view.getEditingPatch('F2')).toMatchObject({ValueFun: value})
    expect(view.hasEditingChanges('F1')).toBe(false)
    expect(view.currentRow?.['rowid']).toBe('F1')
    expect(instance.isDirty).toBe(true)
    await table.get('[data-action="cancel-field"]').trigger('click'); await flushPromises()
    expect(view.hasEditingChanges()).toBe(false)
    expect(instance.isDirty).toBe(false)
    await table.get('tbody tr:nth-child(2) [data-function-open]').trigger('click'); await flushPromises()
    expect(wrapper.get('[data-action="close-definition"]').attributes('disabled')).toBeDefined()
    const dialog = wrapper.getComponent(FilterValueFunctionDialog)
    dialog.vm.$emit('update:modelValue', false); await flushPromises()
    expect(view.hasEditingChanges()).toBe(false)
    expect(instance.isDirty).toBe(false)
    await cell.setValue(value); await flushPromises()
    await wrapper.get('[data-action="save-model-workspace"]').trigger('click'); await flushPromises()
    expect(writes(f)).toHaveLength(1)
    const reopened = await f.open('A'); await reopened.loadModelFields('M1')
    expect(reopened.metadataDataSet.getView('Base_DataModel_Field', 'modelFields')?.rows.find(row => row['rowid'] === 'F2')?.['ValueFun']).toBe(value)
    expect(f.sessions[0]!.metadataDataSet.getView('Base_DataModel_Field')?.requestState).toBe(RequestState.Idle)
    expect(f.sessions[0]!.metadataDataSet.getView('Base_DataModel_Relation')?.requestState).toBe(RequestState.Loaded)
  })

  it.each([false, true])('restores the compact meta header and keeps field creation alive (empty=%s)', async empty => {
    const f = fixture({allowModelRename: true, allowFieldAdd: true, sourceFields: empty ? [] : [
      {rowid: 'PK', dataModelId: 'M1', Name: 'rowid', type: 'dataModel', FieldType: 'string', IsPKey: 1, IsOutput: 1},
    ]})
    const {wrapper, instance} = await page(); await select(wrapper, 'Orders')
    expect(wrapper.get('.meta-source').text()).toContain('绑定源')
    expect(wrapper.get('.meta-source').text()).toContain('OrderSource')
    const name = parameterInput(wrapper.getComponent(DataSpaceModelRename), '节点名称:')
    await openModelFieldsTab(wrapper)
    const header = wrapper.get('[aria-label="模型信息"]')
    expect((name.element as HTMLInputElement).value).toBe('Orders')
    expect(instance.isDirty).toBe(false)
    const toolbar = wrapper.get('[aria-label="字段操作"]')
    expect(toolbar.get('[data-action="create-field"]').text()).toBe('添加计算字段')
    expect(toolbar.get('[data-action="edit-field"]').text()).toBe('编辑')
    expect(toolbar.get('[data-action="preview-remove-field"]').text()).toBe('删除')
    const owner = f.sessions[0]!.getFieldCreate('M1', 'modelFields')
    await toolbar.get('[data-action="create-field"]').trigger('click'); await flushPromises()
    expect(owner.getState().pending).toBe(true)
    expect(instance.isDirty).toBe(true)
    expect(new DOMWrapper(document.body).find('[data-action="cancel-field-create"]').exists()).toBe(true)
    await new DOMWrapper(document.body).get('[data-action="cancel-field-create"]').trigger('click'); await flushPromises()
    expect(f.sessions[0]!.getFieldCreate('M1', 'modelFields')).toBe(owner)
    expect(owner.getState().pending).toBe(false)
    expect(instance.isDirty).toBe(false)
    expect(writes(f)).toHaveLength(0); expect(f.fileWrites).toHaveLength(0)
  })

  it.each([false, true])('renames a model through standard DataView-bound controls, protects switching and retains the original session (overview=%s)', async overviewOnly => {
    const source = {type: 'table' as const, id: 'CURRENT', name: 'OrderSource', description: '当前来源', dbid: 'DB', databaseName: 'old-database', providerId: ''}
    const f = fixture({overviewOnly, allowModelRename: true, allowSourceEdit: true, allowFieldEdit: true, editableFieldProperties: ['description'],
      businessRows: {SalesOrders: [{rowid: 'O1'}]}, sourceFields: [
      {rowid: 'PK', dataModelId: 'M1', Name: 'rowid', type: 'dataModel', FieldType: 'string', IsPKey: 1, IsOutput: 1},
    ], modelSources: {query: async () => ({rows: [source], total: 1}), prepare: async () => ({source, model: {
      Type: '数据库表', MetaName: source.name, description: source.description, DbId: 'DB', DbName: source.databaseName,
      JoinType: '', ForeignKeyFields: '', JoinFilter: '', PId: ''}, fields: [{type: 'dataModel', Name: 'rowid', description: 'ID',
      FieldType: 'string', IsPKey: 1, IsOutput: 1, AsName: '', ValueFun: '', Expression: '', allowAIAdd: 0, OrderType: '', Order: 0, Group: 0}]})}})
    const {wrapper, instance} = await page()
    const firstSession = f.sessions.at(-1)!
    await select(wrapper, 'Orders')
    const editor = wrapper.getComponent(DataSpaceModelRename)
    await parameterInput(editor, '节点名称:').setValue('SalesOrders'); await flushPromises()
    expect(instance.isDirty).toBe(true)
    await select(wrapper, 'Customers')
    expect(wrapper.get('.design-detail h2').text()).toBe('Orders')
    await sourceButton(editor, 'preview-rename-model').trigger('click'); await flushPromises()
    expect(new DOMWrapper(document.body).findAll('[role="dialog"]').some(dialog => dialog.text().includes('修改模型注册名') && dialog.text().includes('SalesOrders'))).toBe(true)
    expect(writes(f)).toHaveLength(0)
    await sourceButton(editor, 'save-rename-model').trigger('click'); await flushPromises()
    expect(f.sessions).toHaveLength(1)
    expect(f.sessions.at(-1)).toBe(firstSession)
    expect(firstSession.metadataDataSet.destroyed).toBe(false)
    expect(instance.isDirty).toBe(false)
    expect(wrapper.get('.design-detail h2').text()).toBe('SalesOrders')
    await sourceButton(wrapper, 'open-model-preview').trigger('click'); await flushPromises()
    const preview = wrapper.getComponent(DataSpaceQueryPreview)
    expect(preview.find('[role="alert"]').exists(), preview.text()).toBe(false)
    await sourceButton(preview, 'run-query-preview').trigger('click'); await flushPromises()
    expect(preview.find('[role="alert"]').exists(), preview.text()).toBe(false)
    await sourceButton(preview, 'close-query-preview').trigger('click'); await flushPromises()
    const reopened = await f.open('A')
    expect(resolveDataViewKey('A@SalesOrders@shared', reopened.definitionDataSet!)?.pageSize).toBe(12)
    expect(writes(f)).toHaveLength(1); expect(f.fileWrites).toHaveLength(1)
    await openModelFieldsTab(wrapper)
    expect(wrapper.get('[aria-label="字段配置编辑"]').text()).not.toContain('字段或所属模型身份已变化')
    await wrapper.get('[data-action="edit-field"]').trigger('click'); await flushPromises()
    expect(fieldContractDom().find('[data-field-property="description"]').exists()).toBe(true)
    await fieldContractDom().get('[data-action="close-field-editor"]').trigger('click'); await flushPromises()
    await writeBound(wrapper.getComponent(DataSpaceModelEditor), 'description', '改名后的连续编辑')
    await wrapper.get('[data-action="save-model-workspace"]').trigger('click'); await flushPromises()
    expect(instance.isDirty, wrapper.text()).toBe(false)
    expect(f.modelRow()).toMatchObject({Name: 'SalesOrders', description: '改名后的连续编辑'})
    expect(writes(f)).toHaveLength(2)
    expect(firstSession.metadataDataSet.destroyed).toBe(false)
    const sourceEditor = wrapper.getComponent(DataSpaceModelSource)
    await sourceButton(sourceEditor, 'sync-source').trigger('click'); await flushPromises()
    expect(sourcePreviewDom().text()).toContain('来源字段同步预览')
    expect(firstSession.hasPendingModelSourceEdits()).toBe(true)
    expect(instance.isDirty).toBe(true)
    await sourceButton(sourceEditor, 'cancel-create').trigger('click'); await flushPromises()
    expect(firstSession.hasPendingModelSourceEdits()).toBe(false)
    expect(instance.isDirty).toBe(false)
    expect(writes(f)).toHaveLength(2)
    await select(wrapper, 'shared')
    expect(wrapper.getComponent(DataSpaceViewEditor).props('modelName')).toBe('SalesOrders')
    expect(firstSession.metadataDataSet.destroyed).toBe(false)
  }, 15_000)

  it.each(['database', 'definition'] as const)('recovers model rename at the real %s failure boundary without replaying confirmed sources', async failure => {
    const f = fixture({overviewOnly: true, allowModelRename: true, sourceFields: [
      {rowid: 'PK', dataModelId: 'M1', Name: 'rowid', type: 'dataModel', FieldType: 'string', IsPKey: 1, IsOutput: 1},
    ]})
    const {wrapper, instance} = await page()
    await select(wrapper, 'Orders')
    const editor = wrapper.getComponent(DataSpaceModelRename)
    const firstSession = f.sessions[0]!
    await parameterInput(editor, '节点名称:').setValue('SalesOrders'); await flushPromises()
    await sourceButton(editor, 'preview-rename-model').trigger('click'); await flushPromises()
    if (failure === 'database') f.loseNextResponse(); else f.loseNextFileResponse()
    await sourceButton(editor, 'save-rename-model').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(true)
    const dialog = new DOMWrapper(document.body).findAll('[role="dialog"]').find(item=>item.text().includes('修改模型注册名'))!
    expect(dialog.text()).toContain(failure === 'database' ? '模型记录提交待核验；场景定义和工具文件尚未提交' : '模型记录已确认；场景定义提交待核验；工具文件尚未提交')
    expect(editor.findAllComponents(RendererButton).some(button=>button.attributes('data-action')==='save-rename-model')).toBe(false)
    expect(wrapper.get('[data-action="close-definition"]').attributes('disabled')).toBeDefined()
    const selectedTitle = wrapper.get('.design-detail h2').text()
    await select(wrapper, 'Customers'); expect(wrapper.get('.design-detail h2').text()).toBe(selectedTitle)
    await sourceButton(editor, 'verify-rename-model').trigger('click'); await flushPromises()
    expect(f.sessions).toHaveLength(1)
    expect(firstSession.metadataDataSet.destroyed).toBe(false)
    expect(instance.isDirty).toBe(false)
    expect(wrapper.get('.design-detail h2').text()).toBe('SalesOrders')
    expect(writes(f)).toHaveLength(1); expect(f.fileWrites).toHaveLength(1)
    const reopened = await f.open('A')
    expect(resolveDataViewKey('A@SalesOrders@shared', reopened.definitionDataSet!)?.pageSize).toBe(12)
  })

  it('adopts a different model rename readback in the original session without replaying or claiming success', async () => {
    const f = fixture({overviewOnly: true, allowModelRename: true, omitModelProperties: ['Name']})
    const {wrapper, instance} = await page()
    await select(wrapper, 'Orders')
    const original = f.sessions[0]!, editor = wrapper.getComponent(DataSpaceModelRename)
    await parameterInput(editor, '节点名称:').setValue('SalesOrders'); await flushPromises()
    await sourceButton(editor, 'preview-rename-model').trigger('click'); await flushPromises()
    await sourceButton(editor, 'save-rename-model').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(true)
    await sourceButton(editor, 'verify-rename-model').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(true)
    await sourceButton(editor, 'accept-rename-model').trigger('click'); await flushPromises()
    expect(f.sessions).toHaveLength(1)
    expect(original.metadataDataSet.destroyed).toBe(false)
    expect(instance.isDirty).toBe(false)
    expect(wrapper.get('.design-detail h2').text()).toBe('Orders')
    expect(editor.text()).toContain('已采用当前正式结果；未补写引用')
    expect(editor.text()).not.toContain('已保存并回读确认')
    expect(writes(f)).toHaveLength(1); expect(f.fileWrites).toHaveLength(0)
    await writeBound(wrapper.getComponent(DataSpaceModelEditor), 'description', '采用结果后的编辑')
    await wrapper.get('[data-action="save-model-workspace"]').trigger('click'); await flushPromises()
    expect(instance.isDirty, wrapper.text()).toBe(false)
    expect(f.modelRow()).toMatchObject({Name: 'Orders', description: '采用结果后的编辑'})
    expect(writes(f)).toHaveLength(2)
  })

  it('keeps drag local, cancels it, then saves native model coordinates and reopens', async () => {
    const f = fixture()
    const {wrapper, instance} = await page()
    const before = JSON.parse(f.stored.get('A')!)
    const initial = wrapper.getComponent(VueFlow).props('nodes')![0]!.position
    await dragLayout(wrapper)
    expect(f.fileWrites).toHaveLength(0); expect(writes(f)).toHaveLength(0)
    expect(instance.isDirty).toBe(true)
    await select(wrapper, 'Customers')
    expect(wrapper.text()).toContain('请先保存、取消或核验当前布局')
    await sourceButton(wrapper, 'cancel-layout').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false)
    expect(wrapper.text()).not.toContain('请先保存、取消或核验当前布局')
    expect(wrapper.getComponent(VueFlow).props('nodes')![0]!.position).toEqual(initial)
    await dragLayout(wrapper)
    await sourceButton(wrapper, 'save-layout').trigger('click'); await flushPromises()
    expect(f.fileWrites).toHaveLength(1); expect(writes(f)).toHaveLength(0)
    expect(JSON.parse(f.stored.get('A')!)).toEqual({...before, layout: {modelPositions: {M1: {x: 396, y: 240}}}})
    expect(instance.isDirty).toBe(false)
    const reopened = await f.open('A')
    expect(reopened.definitionDataSet?.layout?.modelPositions?.['M1']).toEqual({x: 396, y: 240})
  })

  it('preserves other coordinates, named view settings and relation definitions', async () => {
    const f = fixture(), session = await f.open('A')
    const config = JSON.parse(f.stored.get('A')!)
    config.layout = {tablePositions: {CustomersAlias: {x: -90, y: 70}}}
    config.resourceRelations = [{relationId: 'R', parentTable: 'CustomersAlias', childTable: 'OrdersAlias', filterExpression: {field: 'parentId', operator: 'eq', value: 'C'}}]
    f.stored.set('A', JSON.stringify(config))
    session.dispose()
    const {wrapper} = await page()
    await dragLayout(wrapper)
    await sourceButton(wrapper, 'save-layout').trigger('click'); await flushPromises()
    expect(JSON.parse(f.stored.get('A')!)).toEqual({...config, layout: {tablePositions: {
      CustomersAlias: {x: -90, y: 70},
    }, modelPositions: {M1: {x: 396, y: 240}}}})
    expect(writes(f)).toHaveLength(0)
  })

  it('verifies a lost receipt without replaying the layout write', async () => {
    const f = fixture()
    const {wrapper, instance} = await page()
    await dragLayout(wrapper); f.loseNextFileResponse()
    await sourceButton(wrapper, 'save-layout').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(true); expect(f.fileWrites).toHaveLength(1)
    expect(sourceButton(wrapper, 'save-layout').attributes('disabled')).toBeDefined()
    expect(sourceButton(wrapper, 'cancel-layout').attributes('disabled')).toBeDefined()
    await sourceButton(wrapper, 'verify-layout').trigger('click'); await flushPromises()
    expect(f.fileWrites).toHaveLength(1); expect(instance.isDirty).toBe(false)
    expect(wrapper.text()).toContain('未重复提交')
  })

  it.each([{unknown: false, rebuild: false}, {unknown: true, rebuild: false}, {unknown: false, rebuild: true}, {unknown: true, rebuild: true}])('keeps later layout edits visible and saveable after the original receipt %o', async ({unknown, rebuild}) => {
    const f = fixture(), {wrapper, instance} = await page()
    if (rebuild) {await sourceButton(wrapper, 'prepare-layout-rebuild').trigger('click'); await flushPromises()}
    else await dragLayout(wrapper)
    const layout = f.sessions[0]!.metadataDataSet.getView('DataSpaceLayoutDefinition')!
    const key = layout.getPkKey(layout.rows[0]!)!, release = f.holdFileResponse()
    if (unknown) f.loseNextFileResponse()
    try {
      await sourceButton(wrapper, rebuild ? 'confirm-layout-rebuild' : 'save-layout').trigger('click'); await flushPromises()
      expect(f.fileWrites).toHaveLength(1)
      const captured = JSON.parse(f.stored.get('A')!).layout.modelPositions.M1
      layout.updateEditingValue(key, 'modelPositions', {M1: {x: 500, y: 600}})
      release(); await flushPromises()
      if (unknown) {await sourceButton(wrapper, 'verify-layout').trigger('click'); await flushPromises()}
      expect(f.fileWrites).toHaveLength(1)
      expect(layout.getEditingRow(key)?.['modelPositions']).toEqual({M1: {x: 500, y: 600}})
      expect(instance.isDirty).toBe(true)
      expect(wrapper.text()).toContain('仍有修改待保存')
      expect(sourceButton(wrapper, 'save-layout').attributes('disabled')).toBeUndefined()
      expect(sourceButton(wrapper, 'cancel-layout').attributes('disabled')).toBeUndefined()
      expect(wrapper.getComponent(VueFlow).props('nodes')!.find(node => node.data?.title === 'Orders')!.position).toEqual({x: 384, y: 540})
      expect((await f.open('A')).definitionDataSet!.layout?.modelPositions?.['M1']).toEqual(captured)
      await sourceButton(wrapper, 'save-layout').trigger('click'); await flushPromises()
      expect(instance.isDirty).toBe(false); expect(f.fileWrites).toHaveLength(2)
      expect((await f.open('A')).definitionDataSet!.layout?.modelPositions?.['M1']).toEqual({x: 500, y: 600})
      expect(writes(f)).toHaveLength(0)
    } finally {release()}
  }, 15000)

  it('retains local layout on file conflict and explicitly adopts the previewed remote file', async () => {
    const f = fixture()
    const {wrapper, instance} = await page()
    await dragLayout(wrapper)
    const remote = JSON.parse(f.stored.get('A')!)
    remote.tables.OrdersAlias.views.shared.pageSize = 33
    remote.layout = {tablePositions: {OrdersAlias: {x: 44, y: 55}}}
    f.stored.set('A', JSON.stringify(remote))
    await sourceButton(wrapper, 'save-layout').trigger('click'); await flushPromises()
    expect(f.fileWrites).toHaveLength(0); expect(instance.isDirty).toBe(true)
    expect(wrapper.getComponent(VueFlow).props('nodes')![0]!.position).toEqual({x: 280, y: 180})
    await sourceButton(wrapper, 'preview-layout').trigger('click'); await flushPromises()
    expect(wrapper.get('pre').text()).toContain('33')
    f.stored.set('A', JSON.stringify({...remote, version: 2}))
    await sourceButton(wrapper, 'adopt-layout').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(true); expect(f.fileWrites).toHaveLength(0)
    await sourceButton(wrapper, 'preview-layout').trigger('click'); await flushPromises()
    await sourceButton(wrapper, 'adopt-layout').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false)
    expect(wrapper.getComponent(VueFlow).props('nodes')![0]!.position).toEqual({x: -72, y: -5})
    const session = f.sessions.at(-1)!
    expect(session.definitionStatus).toBe('unloaded')
    expect(session.metadataDataSet.getView('DataViewDefinition')!.rows.find(row => row['tableName'] === 'OrdersAlias' && row['viewId'] === 'shared')?.['pageSize']).toBe(33)
  })

  it('saves model positions without inventing bindings for missing files, unbound models or multiple aliases', async () => {
    const missing = fixture({missing: true, readOnly: true})
    const first = await page()
    expect(first.wrapper.getComponent(VueFlow).props('nodes')!.every(node => node.draggable === true)).toBe(true)
    await dragLayout(first.wrapper)
    expect(missing.fileWrites).toHaveLength(0)
    await sourceButton(first.wrapper, 'save-layout').trigger('click'); await flushPromises()
    expect(JSON.parse(missing.stored.get('A')!)).toEqual({scenarioId: 'A', schemaVersion: 2, tables: {}, layout: {modelPositions: {M1: {x: 396, y: 240}}}})
    const reopened = await missing.open('A')
    expect(reopened.definitionDataSet?.layout?.modelPositions?.['M1']).toEqual({x: 396, y: 240})
    expect(Object.keys(reopened.definitionDataSet!.tables)).toEqual([])
    first.wrapper.unmount()
    const f = fixture(); await f.open('A')
    const config = JSON.parse(f.stored.get('A')!)
    config.tables.AlsoOrders = config.tables.OrdersAlias
    delete config.tables.CustomersAlias
    f.stored.set('A', JSON.stringify(config))
    const {wrapper} = await page()
    expect(wrapper.getComponent(VueFlow).props('nodes')!.every(node => node.draggable === true)).toBe(true)
    expect(f.fileWrites).toHaveLength(0)
    await dragLayout(wrapper, 'Customers')
    await sourceButton(wrapper, 'save-layout').trigger('click'); await flushPromises()
    const saved = JSON.parse(f.stored.get('A')!)
    expect(saved.tables).toEqual(config.tables)
    expect(saved.layout.modelPositions.M2).toEqual({x: 396, y: 240})
    expect(writes(f)).toHaveLength(0)
  })

  it('keeps concurrent parameter/model edits and scope changes out of layout commits', async () => {
    const f = fixture(), session = await f.open('A'), editor = new DataSpaceLayoutEdit(session)
    await editor.initialize()
    editor.state(); editor.move({id: 'M1', x: 40, y: 60})
    const parameters = session.metadataDataSet.getView('Base_DataSet', 'default')!
    parameters.updateEditingValue('A', 'inputParams', '[]')
    await expect(editor.save()).rejects.toThrow('其他定义草稿')
    expect(parameters.getEditingRow('A')?.['inputParams']).toBe('[]')
    expect(f.fileWrites).toHaveLength(0)
    parameters.discardEditingRows(); f.invalidate()
    await expect(editor.save()).rejects.toThrow('SCOPE_STALE')
    expect(f.fileWrites).toHaveLength(0)
    editor.dispose()
  })

  it('keeps model positions when a binding is removed and migrates only the explicitly moved legacy position', async () => {
    const f = fixture()
    const session = await f.open('A')
    const config = JSON.parse(f.stored.get('A')!)
    config.layout = {tablePositions: {OrdersAlias: {x: 10, y: 20}, CustomersAlias: {x: 30, y: 40}}}
    f.stored.set('A', JSON.stringify(config)); session.dispose()
    const current = await f.open('A'), editor = new DataSpaceLayoutEdit(current)
    await editor.initialize()
    expect(editor.state().positions).toEqual({M1: {x: 10, y: 20}, M2: {x: 30, y: 40}})
    editor.move({id: 'M1', x: 15, y: 25}); await editor.save()
    const saved = JSON.parse(f.stored.get('A')!)
    expect(saved.layout).toEqual({modelPositions: {M1: {x: 15, y: 25}}, tablePositions: {CustomersAlias: {x: 30, y: 40}}})
    await current.removeModelBinding({expectedText: current.viewState!.text, tableName: 'OrdersAlias', modelId: 'M1', modelName: 'Orders'})
    expect((await current.metadataDataSet.saveChanges({views: [{tableName: 'DataTableBindingDefinition', viewId: 'default'}]})).success).toBe(true)
    expect(editor.state().positions).toEqual({M1: {x: 15, y: 25}, M2: {x: 30, y: 40}})
    expect(editor.state().draggableKeys).toContain('M1')
    editor.dispose()
  })

  it('rejects unknown model positions and non-layout changes without creating a file', async () => {
    const f = fixture({missing: true}), session = await f.open('A')
    const layout = session.metadataDataSet.getView('DataSpaceLayoutDefinition')!
    await layout.refresh()
    const key = layout.getPkKey(layout.rows[0]!)!
    layout.updateEditingValue(key, 'modelPositions', {OTHER: {x: 1, y: 2}})
    await expect(session.metadataDataSet.saveChanges({views: [{tableName: layout.tableName, viewId: layout.viewId}]})).rejects.toThrow('DATA_SPACE_LAYOUT_MODEL')
    layout.discardPendingChanges()
    layout.updateEditingValue(key, 'tables', {})
    await expect(session.metadataDataSet.saveChanges({views: [{tableName: layout.tableName, viewId: layout.viewId}]})).rejects.toThrow()
    layout.discardPendingChanges()
    expect(session.viewState).toBeNull(); expect(f.fileWrites).toHaveLength(0); expect(writes(f)).toHaveLength(0)
  })

  it('preserves an initial layout draft if another writer creates the file and verifies an unknown first save', async () => {
    const conflict = fixture({missing: true}), a = new DataSpaceLayoutEdit(await conflict.open('A'))
    await a.initialize()
    a.state(); a.move({id: 'M1', x: 15, y: 25})
    const remote = '{"scenarioId":"A","tables":{},"version":7}'
    conflict.stored.set('A', remote)
    await expect(a.save()).rejects.toThrow('EXISTS')
    expect(a.pending).toBe(true); expect(conflict.stored.get('A')).toBe(remote); expect(conflict.fileWrites).toHaveLength(0)
    a.cancel(); a.dispose()
    const lost = fixture({missing: true}), b = new DataSpaceLayoutEdit(await lost.open('A'))
    await b.initialize()
    b.state(); b.move({id: 'M2', x: 50, y: 60}); lost.loseNextFileResponse()
    await expect(b.save()).rejects.toThrow()
    expect(b.staged).toBe(true); expect(lost.fileWrites).toHaveLength(1)
    expect(await b.verify()).toBe('confirmed')
    expect(lost.fileWrites).toHaveLength(1); expect(b.pending).toBe(false)
    expect(JSON.parse(lost.stored.get('A')!).tables).toEqual({})
    b.dispose()
  })

  it('isolates page instances and releases the local layout table', async () => {
    const f = fixture(), first = await f.open('A'), second = await f.open('B')
    const before = Object.keys(first.metadataDataSet.tables)
    const a = new DataSpaceLayoutEdit(first), b = new DataSpaceLayoutEdit(second)
    await a.initialize(); await b.initialize()
    a.state(); b.state(); a.move({id: 'M1', x: 1, y: 2})
    expect(b.pending).toBe(false); expect(b.state().positions).toEqual({})
    await a.save()
    expect(f.fileWrites.map(write => write.targetId)).toEqual(['A'])
    expect(JSON.parse(f.stored.get('B')!).layout).toBeUndefined()
    a.dispose(); b.dispose()
    expect(Object.keys(first.metadataDataSet.tables)).toEqual(before)
  })

  it('keeps an unapplied submission staged until an explicit retry', async () => {
    const f = fixture(), session = await f.open('A'), editor = new DataSpaceLayoutEdit(session)
    await editor.initialize()
    const original = f.stored.get('A')!
    editor.state(); editor.move({id: 'M1', x: 40, y: 60}); f.loseNextFileResponse()
    await expect(editor.save()).rejects.toThrow()
    f.stored.set('A', original)
    expect(await editor.verify()).toBe('not-applied')
    expect(editor.pending).toBe(true); expect(f.fileWrites).toHaveLength(1)
    expect(() => editor.cancel()).toThrow('已暂存')
    await editor.save()
    expect(f.fileWrites).toHaveLength(2); expect(editor.pending).toBe(false)
    editor.dispose()
  })

  it('does not dispatch if a model edit appears during asynchronous staging', async () => {
    const f = fixture(), session = await f.open('A'), editor = new DataSpaceLayoutEdit(session)
    await editor.initialize()
    editor.state(); editor.move({id: 'M1', x: 40, y: 60})
    const save = editor.save()
    const models = session.metadataDataSet.getView('Base_DataModel', 'default')!
    models.updateEditingValue('M1', 'description', '并发模型编辑')
    await expect(save).rejects.toThrow('其他定义草稿')
    expect(models.getEditingRow('M1')?.['description']).toBe('并发模型编辑')
    expect(f.fileWrites).toHaveLength(0); expect(writes(f)).toHaveLength(0)
    editor.dispose()
  })
})
async function chooseSourceParameter(wrapper: ReturnType<typeof mount>) {
  await wrapper.getComponent(FieldValueFunction).get('[data-function-open]').trigger('click'); await flushPromises()
  const dialog = wrapper.getComponent(FilterValueFunctionDialog)
  dialog.getComponent(ElTabs).vm.$emit('update:modelValue', 'GetInputParam')
  await flushPromises()
  dialog.findAllComponents(ElSelect)[0]!.vm.$emit('update:modelValue', 'customer')
  await new DOMWrapper(document.body).get('[data-function-confirm]').trigger('click'); await flushPromises()
}

function bindingPicker(wrapper: ReturnType<typeof mount>, label: string) {
  const picker = wrapper.findAllComponents(DataSpaceBindingEditor).find(component => component.props('label') === label)
  if (!picker) throw new Error(`missing bound picker ${label}`)
  return picker
}
function boundChoiceProps(wrapper: Pick<VueWrapper, 'findAllComponents'>, label: string) {
  const radio = wrapper.findAllComponents(FieldRadio).find(component => component.props('label') === label)
  if (radio) return radio.getComponent(ElRadioGroup).props()
  const checkbox = wrapper.findAllComponents(FieldCheckbox).find(component => component.props('label') === label)
  if (checkbox) return checkbox.getComponent(ElCheckbox).props()
  return boundSelect(wrapper, label).props()
}
function boundSelect(wrapper: Pick<VueWrapper, 'findAllComponents'>, label: string) {
  const field = wrapper.findAllComponents(FieldSelect).find(component => component.props('label') === label)
  if (!field) throw new Error(`missing bound field ${label}`)
  expect(field.props('modelValue')).toBeUndefined()
  return field.getComponent(ElSelect)
}
async function openBoundSelect(wrapper: Pick<VueWrapper, 'findAllComponents'>, label: string) {
  const control = boundSelect(wrapper, label)
  if (control.get('input').attributes('aria-expanded') !== 'true') {
    await control.get('.el-select__wrapper').trigger('click'); await flushPromises()
  }
  return control
}
function sourceTypeDisabled(wrapper: Pick<VueWrapper, 'findAllComponents'>): boolean {
  const field = wrapper.findAllComponents(FieldSelect).find(component => component.props('label') === '来源类型')
  if (!field) throw new Error('missing source type binding')
  const panes = field.findAllComponents(ElTabPane)
  expect(panes).toHaveLength(6)
  return panes.every(pane => pane.props('disabled'))
}
async function chooseBound(wrapper: Pick<VueWrapper, 'findAllComponents'>, label: string, value: string | number) {
  if (['自动加载', '自动选中首行', '自动定位首行', '取值字段候选', '显示字段', '提交方式'].includes(label)) await openViewProperties(wrapper)
  const tabs = wrapper.findAllComponents(FieldSelect).find(field => field.props('label') === label && field.props('presentation') === 'tabs')
  if (tabs) {
    expect(tabs.props('modelValue')).toBeUndefined()
    const pane = tabs.findAllComponents(ElTabPane).find(item => item.props('name') === value)
    expect(pane?.props('disabled')).toBe(false)
    tabs.getComponent(ElTabs).vm.$emit('update:modelValue', value); await flushPromises(); return
  }
  const radio = wrapper.findAllComponents(FieldRadio).find(field => field.props('label') === label)
  if (radio) {
    expect(radio.props('modelValue')).toBeUndefined()
    const control = radio.getComponent(ElRadioGroup)
    expect(control.props('disabled')).toBe(false)
    expect(control.findAllComponents(ElRadio).map(option => option.props('value'))).toContain(value)
    control.vm.$emit('update:modelValue', value); await flushPromises(); return
  }
  const checkbox = wrapper.findAllComponents(FieldCheckbox).find(field => field.props('label') === label)
  if (checkbox) {
    expect(checkbox.props('field')).toBeTruthy()
    const control = checkbox.getComponent(ElCheckbox)
    expect(control.props('disabled')).toBe(false)
    control.vm.$emit('update:modelValue', value === 1); await flushPromises(); return
  }
  const select = await openBoundSelect(wrapper, label)
  expect(select.props('disabled')).toBe(false)
  expect(select.findAllComponents(ElOption).map(option => option.props('value'))).toContain(value)
  const selectedOption = select.findAllComponents(ElOption).find(option => {
    const optionValue: unknown = option.props('value')
    return optionValue === value
  })
  await selectedOption!.trigger('click'); await flushPromises()
}
async function writeBound(wrapper: Pick<VueWrapper, 'findAllComponents'>, field: string, value: string) {
  const component = [...wrapper.findAllComponents(FieldText), ...wrapper.findAllComponents(FieldTextarea)].find(component => (component.props().dataField ?? component.props().field) === field && component.find('input, textarea').exists())
  if (!component) throw new Error(`missing bound field ${field}`)
  expect(component.props().modelValue).toBeUndefined()
  await component.get('input, textarea').setValue(value); await flushPromises()
}
async function writeJsonBound(wrapper: Pick<VueWrapper, 'findAllComponents'>, field: string, value: unknown) {
  const component=wrapper.findAllComponents(FieldJson).find(item=>(item.props('dataField')??item.props('field'))===field)
  if(!component)throw new Error(`missing bound JSON field ${field}`)
  expect(component.props('modelValue')).toBeUndefined();expect(component.props('valueFormat')).toBe('native')
  expect(component.props('dataViewKey')).toContain('@')
  if (component.props('mode') === 'form') {
    const toggle = wrapper.findAllComponents(RendererButton).find(button => button.attributes('data-action') === 'toggle-query-json')!
    await toggle.get('button').trigger('click'); await flushPromises()
  }
  if (component.props('mode') === 'properties' && field === 'queryContext') {
    const toggle = wrapper.findAllComponents(RendererButton).find(button => button.attributes('data-action') === 'toggle-context-json')!
    await toggle.get('button').trigger('click'); await flushPromises()
  }
  component.getComponent(JsonTreeEditor).vm.$emit('update:modelValue',JSON.stringify({value}));await flushPromises()
  expect(JSON.parse(component.getComponent(JsonTreeEditor).props('modelValue')!)).toEqual({value})
}
function fieldContractDom() {
  const dialog = document.body.querySelector('.data-space-field-contract')?.closest('.el-dialog')
  if (!dialog) throw new Error('missing field contract dialog')
  return new DOMWrapper(dialog)
}
async function openViewProperties(wrapper: Pick<VueWrapper, 'findAllComponents'>, title?: string) {
  const groups = wrapper.findAllComponents(RendererSection).filter(section =>
    (title ? [title] : ['其他请求配置与完整编辑', '结果组织与编辑配置']).includes(section.props('title') ?? ''))
  for (const group of groups) {
    const toggle = group.get('.renderer-section-toggle')
    if (toggle.attributes('aria-expanded') === 'false') {await toggle.trigger('click'); await flushPromises()}
  }
}
async function boundNumber(wrapper: Pick<VueWrapper, 'findAllComponents'>, field: string) {
  await openViewProperties(wrapper)
  const component = wrapper.findAllComponents(FieldNumber).find(component => (component.props('dataField') ?? component.props('field')) === field)
  if (!component) throw new Error(`missing bound number ${field}`)
  expect(component.props('modelValue')).toBeUndefined()
  return component.get('input')
}

describe('native data-space design entry', () => {
  it('edits selected view sorting with standard child fields and priority, saves and reopens without changing sibling views', async () => {
    const f=fixture({overviewOnly:true})
    const {wrapper,instance}=await page('?scenarioId=A',true);await select(wrapper,'shared')
    const original=JSON.parse(f.stored.get('A')!)
    const editor=wrapper.getComponent(DataSpaceViewEditor)
    await openViewProperties(editor)
    await editor.get('[data-edit-property="sortExpression"]').trigger('click');await flushPromises()
    const sort=editor.getComponent(FieldJson)
    expect(sort.props('field')).toBe('sortExpression');expect(sort.props('mode')).toBe('rows')
    expect(sort.props('dataViewKey')).toContain('@DataViewDefinition@default')
    expect(instance.isDirty).toBe(true)
    await sort.get('[data-json-add]').trigger('click');await flushPromises()
    expect(editor.get('[data-action="finish-view-property"]').attributes('disabled')).toBeDefined()
    await sort.get('[data-json-cancel-row]').trigger('click');await flushPromises()
    for(const [field,direction] of [['rowid','asc'],['parentId','desc']]) {
      await sort.get('[data-json-add]').trigger('click');await flushPromises()
      await chooseBound(sort,'字段',field!);await chooseBound(sort,'方向',direction!)
      await sort.get('[data-json-save-row]').trigger('click');await flushPromises()
    }
    await sort.findAll('.el-table__body tr')[1]!.trigger('click')
    await sort.get('[data-json-move-up]').trigger('click');await flushPromises()
    const expected=[{field:'parentId',direction:'desc'},{field:'rowid',direction:'asc'}]
    const definitions=f.sessions[0]!.metadataDataSet.getView('DataViewDefinition')!
    expect(definitions.getEditingRow(definitions.getPkKey(definitions.currentRow!)!)?.['sortExpression']).toEqual(expected)
    await editor.get('[data-action="finish-view-property"]').trigger('click');await flushPromises()
    await editor.get('[data-action="save-views"]').trigger('click');await flushPromises()
    expect(editor.text()).toContain('视图配置已保存并回读确认');expect(instance.isDirty).toBe(false)
    const reopened=await f.open('A')
    expect(reopened.definitionDataSet?.getView('OrdersAlias','shared')?.sortExpression).toEqual(expected)
    const saved=JSON.parse(f.stored.get('A')!)
    expect(saved.tables.OrdersAlias.views.default).toEqual(original.tables.OrdersAlias.views.default)
    expect(saved.tables.CustomersAlias).toEqual(original.tables.CustomersAlias)
    expect(f.fileWrites).toHaveLength(1);expect(writes(f)).toHaveLength(0)
    for(const name of ['Base_DataModel_Field','Base_DataModel_Relation'])
      expect(f.sessions[0]!.metadataDataSet.getView(name)?.requestState).toBe(name === 'Base_DataModel_Relation' ? RequestState.Loaded : RequestState.Idle)
  }, 15_000)

  it('discards reordered view sorting and cancels unfinished rows without changing persisted configuration',async()=>{
    const f=fixture({overviewOnly:true});(await f.open('A')).dispose()
    const config=JSON.parse(f.stored.get('A')!)
    const original=[{field:'rowid',direction:'asc'},{field:'parentId',direction:'desc'}]
    config.tables.OrdersAlias.views.shared.sortExpression=original;f.stored.set('A',JSON.stringify(config))
    const {wrapper,instance}=await page('?scenarioId=A',true);await select(wrapper,'shared')
    const editor=wrapper.getComponent(DataSpaceViewEditor)
    await openViewProperties(editor)
    await editor.get('[data-edit-property="sortExpression"]').trigger('click');await flushPromises()
    const sort=editor.getComponent(FieldJson)
    await sort.findAll('.el-table__body tr')[0]!.trigger('click')
    await sort.get('[data-json-move-down]').trigger('click');await flushPromises()
    await sort.get('[data-json-add]').trigger('click');await flushPromises()
    await editor.get('[data-action="discard-view-edits"]').trigger('click');await flushPromises()
    expect(instance.isDirty).toBe(false)
    expect(f.sessions.at(-1)!.metadataDataSet.getView('DataViewDefinition')?.hasEditingChanges()).toBe(false)
    expect(f.fileWrites).toHaveLength(0)
    await openViewProperties(editor)
    await editor.get('[data-edit-property="sortExpression"]').trigger('click');await flushPromises()
    expect(editor.getComponent(FieldJson).findAll('.el-table__body tr')).toHaveLength(2)
    await editor.get('[data-action="finish-view-property"]').trigger('click');await flushPromises()
    expect(instance.isDirty).toBe(false)
    expect((await f.open('A')).definitionDataSet?.getView('OrdersAlias','shared')?.sortExpression).toEqual(original)
  }, 15_000)

  it('creates a new array through bound inputs and the header dialog, cancels cleanly and reopens the saved definition', async () => {
    const f=fixture({overviewOnly:true,allowModelAdd:true,allowFieldAdd:true})
    const {wrapper,instance}=await page('?scenarioId=A',true);await select(wrapper,'Orders')
    await wrapper.get('[data-action="add-array"]').trigger('click');await flushPromises()
    let editor=wrapper.findComponent({name:'DataSpaceArrayCreate'})
    expect(instance.isDirty).toBe(true)
    expect(parameterInput(editor,'名称').element.closest('.el-form-item')?.classList.contains('is-required')).toBe(true)
    await new DOMWrapper(document.body).get('[data-action="save-new-array"]').trigger('click');await flushPromises()
    expect(writes(f)).toHaveLength(0)
    expect(new DOMWrapper(document.body).text()).toContain('模型注册名不能为空')
    expect(parameterInput(editor,'名称').attributes('maxlength')).toBe('100')
    expect(parameterInput(editor,'描述').attributes('maxlength')).toBe('200')
    expect(editor.getComponent({name:'JsonArrayRows'}).getComponent(ElTable).props()).toMatchObject({height:460})
    expect(editor.getComponent(FieldJson).props('children')).toEqual([{type:'r-text',props:{field:'rowid',label:'主键',maxlength:200}}])
    await parameterInput(editor,'名称').setValue('InlineRows');await flushPromises()
    const form=editor.getComponent(RendererForm),key=form.props('dataViewKey')
    expect(key).toContain(`${f.sessions[0]!.metadataDataSet.scenarioId}@ArrayCreate_`)
    const view=resolveDataViewKey(key,f.sessions[0]!.metadataDataSet)!
    expect(view.getEditingRow('array')?.['name']).toBe('InlineRows')
    const body=new DOMWrapper(document.body)
    await body.get('[data-action="array-headers"]').trigger('click');await flushPromises()
    expect(body.text()).toContain('数据字段编辑')
    expect(body.get('[data-action="save-new-array"]').attributes('disabled')).toBeDefined()
    view.updateEditingValue('array','headerDraft',JSON.stringify([{id:'key',name:'code',label:'编码',order:0,primary:true}]))
    await body.get('[data-action="save-array-headers"]').trigger('click');await flushPromises()
    expect(String(view.getEditingRow('array')?.['headers'])).toContain('code')
    await body.get('[data-action="cancel-new-array"]').trigger('click');await flushPromises()
    expect(instance.isDirty).toBe(false);expect(writes(f)).toHaveLength(0)
    expect(f.sessions[0]!.metadataDataSet.getTable(view.tableName)).toBeUndefined()
    await wrapper.get('[data-action="add-array"]').trigger('click');await flushPromises()
    editor=wrapper.findComponent({name:'DataSpaceArrayCreate'})
    await parameterInput(editor,'名称').setValue('InlineRows');await flushPromises()
    await body.get('[data-action="save-new-array"]').trigger('click');await flushPromises()
    expect(writes(f)).toHaveLength(1);expect(instance.isDirty).toBe(false)
    const fresh=await f.open('A')
    expect(fresh.metadataDataSet.getView('Base_DataModel')!.rows.some(row=>row['Name']==='InlineRows' && row['Type']==='数组')).toBe(true)
    expect(f.sessions[0]!.metadataDataSet.getView('Base_DataModel_Field')!.requestState).toBe(RequestState.Idle)
    expect(fresh.metadataDataSet.getView('Base_DataModel')!.rows.find(row=>row['rowid']==='M1')).toMatchObject({Name:'Orders',Type:'数据库'})
    expect(wrapper.findAllComponents(RendererDialog).some(dialog=>dialog.props('title')==='编辑前端数组' && dialog.props('modelValue'))).toBe(false)
  })
  it('opens the reference array entry through the model DataView and protects its row edit lifecycle', async () => {
    const f = fixture({overviewOnly:true,allowArrayEdit:true,sourceFields:[{rowid:'F1',dataModelId:'M1',Name:'name',description:'名称',type:'dataModel',FieldType:'string',IsOutput:1,IsPKey:0}]})
    f.setModelValues({Type:'数组',items:'[{"name":"before","count":2}]'})
    const {wrapper,instance}=await page('?scenarioId=A',true);await select(wrapper,'Orders')
    await wrapper.get('[data-action="edit-array"]').trigger('click');await flushPromises()
    const editor=wrapper.findComponent({name:'DataSpaceArrayEditor'})
    expect(editor.exists()).toBe(true);expect(instance.isDirty).toBe(true)
    expect(parameterInput(editor,'名称').element.closest('.el-form-item')?.classList.contains('is-required')).toBe(true)
    const json=editor.findComponent({name:'FieldJson'}); expect(json.exists(),new DOMWrapper(document.body).text()).toBe(true)
    expect(json.props('field')).toBe('items');expect(json.props('mode')).toBe('rows')
    expect(json.props('children')).toEqual([{type:'r-text',props:{field:'name',label:'名称',maxlength:200}}])
    expect(parameterInput(editor,'名称').attributes('maxlength')).toBe('100')
    expect(parameterInput(editor,'描述').attributes('maxlength')).toBe('200')
    expect(json.getComponent(ElTable).props()).toMatchObject({height:460})
    expect(editor.findComponent(RendererForm).props('dataViewKey')).toBe(`${f.sessions[0]!.metadataDataSet.scenarioId}@Base_DataModel@default`)
    await new DOMWrapper(document.body).get('[data-action="cancel-array"]').trigger('click');await flushPromises()
    expect(instance.isDirty).toBe(false);expect(writes(f)).toHaveLength(0)
    await wrapper.get('[data-action="edit-array"]').trigger('click');await flushPromises()
    const rows=wrapper.getComponent({name:'DataSpaceArrayEditor'}).getComponent({name:'JsonArrayRows'})
    await rows.get('tbody tr').trigger('click');await flushPromises()
    await rows.get('[data-json-edit]').trigger('click');await flushPromises()
    const input=rows.getComponent(FieldText).get('input')
    expect(input.attributes('maxlength')).toBe('200')
    await input.setValue('after');await input.trigger('change');await flushPromises()
    await rows.get('[data-json-save-row]').trigger('click');await flushPromises()
    expect(f.sessions[0]!.metadataDataSet.getView('Base_DataModel')!.getEditingRow('M1')?.['items']).toBe('[{"name":"after","count":2}]')
    const beforeSave=f.requests.length
    await new DOMWrapper(document.body).get('[data-action="save-array"]').trigger('click');await flushPromises()
    expect(writes(f)).toHaveLength(1);expect(instance.isDirty,new DOMWrapper(document.body).text()).toBe(false)
    expect(f.requests).toHaveLength(beforeSave+1)
    expect(f.sessions).toHaveLength(1);expect(f.sessions[0]!.metadataDataSet.destroyed).toBe(false)
    expect(f.sessions.at(-1)!.metadataDataSet.getView('Base_DataModel_Field')!.requestState).toBe(RequestState.Idle)
    expect(f.sessions.at(-1)!.metadataDataSet.getView('Base_DataModel_Relation')!.requestState).toBe(RequestState.Loaded)
    await writeBound(wrapper.getComponent(DataSpaceModelEditor),'description','数组保存后的模型编辑')
    await wrapper.get('[data-action="save-model-workspace"]').trigger('click');await flushPromises()
    expect(writes(f)).toHaveLength(2);expect(instance.isDirty,new DOMWrapper(document.body).text()).toBe(false)
    expect(f.requests).toHaveLength(beforeSave+2);expect(f.sessions).toHaveLength(1)
    const fresh=await f.open('A');expect(fresh.metadataDataSet.getView('Base_DataModel')!.rows.find(r=>r['rowid']==='M1')?.['items']).toBe('[{"name":"after","count":2}]')
    expect(fresh.metadataDataSet.getView('Base_DataModel')!.rows.find(r=>r['rowid']==='M1')?.['description']).toBe('数组保存后的模型编辑')
  }, 15_000)
  it('labels unknown array recovery with its not-applied discard consequence and completes through the same UI action', async () => {
    const f=fixture({overviewOnly:true,allowArrayEdit:true,sourceFields:[
      {rowid:'F1',dataModelId:'M1',Name:'code',description:'编码',type:'dataModel',FieldType:'string',IsOutput:1,IsPKey:1},
      {rowid:'F2',dataModelId:'M1',Name:'name',description:'名称',type:'dataModel',FieldType:'string',IsOutput:1,IsPKey:0},
    ]})
    f.setModelValues({Type:'数组',PrimaryKeyFields:'code',items:'[ {"code":"before","name":"one"} ]'})
    const {wrapper}=await page('?scenarioId=A',true);await select(wrapper,'Orders')
    await wrapper.get('[data-action="edit-array"]').trigger('click');await flushPromises()
    const editor=wrapper.getComponent({name:'DataSpaceArrayEditor'}),rows=editor.getComponent({name:'JsonArrayRows'}),body=new DOMWrapper(document.body)
    await rows.get('tbody tr').trigger('click');await flushPromises()
    await rows.get('[data-json-edit]').trigger('click');await flushPromises()
    const input=rows.getComponent(FieldText).get('input')
    await input.setValue('after');await input.trigger('change');await flushPromises()
    await rows.get('[data-json-save-row]').trigger('click');await flushPromises();f.loseNextResponse()
    await body.get('[data-action="save-array"]').trigger('click');await flushPromises()
    expect(writes(f)).toHaveLength(1)
    expect(body.get('[data-action="verify-array"]').text()).toContain('未生效时放弃本次草稿')
    await body.get('[data-action="verify-array"]').trigger('click');await flushPromises()
    expect(writes(f)).toHaveLength(1)
    expect(wrapper.findAllComponents(RendererDialog).some(dialog=>dialog.props('title')==='编辑前端数组'&&dialog.props('modelValue'))).toBe(false)
    expect((f.modelRow() as Record<string,unknown>)['items']).toBe('[{"code":"after","name":"one"}]')
  }, 15_000)
  it('requires a separate explicit UI action to discard drafts after confirmed array recovery', async () => {
    const f=fixture({overviewOnly:true,allowArrayEdit:true,sourceFields:[
      {rowid:'F1',dataModelId:'M1',Name:'code',description:'编码',type:'dataModel',FieldType:'string',IsOutput:1,IsPKey:1},
      {rowid:'F2',dataModelId:'M1',Name:'name',description:'名称',type:'dataModel',FieldType:'string',IsOutput:1,IsPKey:0},
    ]})
    f.setModelValues({Type:'数组',PrimaryKeyFields:'code',items:'[{"code":"before","name":"one"}]'})
    const {wrapper}=await page('?scenarioId=A',true);await select(wrapper,'Orders')
    await wrapper.get('[data-action="edit-array"]').trigger('click');await flushPromises()
    const body=new DOMWrapper(document.body),models=f.sessions[0]!.metadataDataSet.getView('Base_DataModel')!
    vi.spyOn(models,'loadFromServer').mockImplementationOnce(async()=>{throw new Error('array readback unavailable')})
    const rows=wrapper.getComponent({name:'DataSpaceArrayEditor'}).getComponent({name:'JsonArrayRows'})
    await rows.get('tbody tr').trigger('click');await flushPromises();await rows.get('[data-json-edit]').trigger('click');await flushPromises()
    const input=rows.getComponent(FieldText).get('input')
    await input.setValue('after');await input.trigger('change');await flushPromises()
    await rows.get('[data-json-save-row]').trigger('click');await flushPromises();f.loseNextResponse()
    await body.get('[data-action="save-array"]').trigger('click');await flushPromises()
    expect(writes(f)).toHaveLength(1)
    await body.get('[data-action="verify-array"]').trigger('click');await flushPromises()
    expect(body.text()).toContain('array readback unavailable')
    models.updateEditingValue('M1','description','点击前的本地新修改');await flushPromises()
    expect(body.get('[data-action="discard-local-array-changes"]').text()).toBe('放弃本地新修改并核验')
    await body.get('[data-action="verify-array"]').trigger('click');await flushPromises()
    expect(models.getEditingPatch('M1')).toEqual({description:'点击前的本地新修改'})
    await body.get('[data-action="discard-local-array-changes"]').trigger('click');await flushPromises()
    expect(writes(f)).toHaveLength(1)
    expect(wrapper.findAllComponents(RendererDialog).some(dialog=>dialog.props('title')==='编辑前端数组'&&dialog.props('modelValue'))).toBe(false)
    const fresh=await f.open('A')
    expect(fresh.metadataDataSet.getView('Base_DataModel')!.rows.find(row=>row['rowid']==='M1')?.['description']).not.toBe('点击前的本地新修改')
    expect(fresh.metadataDataSet.getView('Base_DataModel')!.rows.find(row=>row['rowid']==='M1')?.['items']).toBe('[{"code":"after","name":"one"}]')
  }, 15_000)
  it('keeps a later bound array draft available after the earlier save completes',async()=>{
    const f=fixture({overviewOnly:true,allowArrayEdit:true,sourceFields:[{rowid:'F1',dataModelId:'M1',Name:'name',description:'名称',type:'dataModel',FieldType:'string',IsOutput:1,IsPKey:0}]})
    f.setModelValues({Type:'数组',items:'[{"name":"before"}]'})
    const {wrapper,instance}=await page();await select(wrapper,'Orders')
    await wrapper.get('[data-action="edit-array"]').trigger('click');await flushPromises()
    const models=f.sessions[0]!.metadataDataSet.getView('Base_DataModel')!,body=new DOMWrapper(document.body)
    models.updateEditingValue('M1','items','[]');await flushPromises()
    const release=f.holdModelResponse()
    await body.get('[data-action="save-array"]').trigger('click');await flushPromises()
    expect(writes(f)).toHaveLength(1)
    models.updateEditingValue('M1','description','后续数组说明');release();await flushPromises()
    expect(wrapper.findAllComponents(RendererDialog).some(dialog=>dialog.props('title')==='编辑前端数组'&&dialog.props('modelValue'))).toBe(true)
    expect(instance.isDirty).toBe(true);expect(models.getEditingPatch('M1')).toEqual({description:'后续数组说明'})
    await body.get('[data-action="cancel-array"]').trigger('click');await flushPromises()
    expect(instance.isDirty).toBe(false);expect(f.sessions).toHaveLength(1)
    expect(models.rows.find(row=>row['rowid']==='M1')?.['items']).toBe('[]');expect(writes(f)).toHaveLength(1)
  })
  it.each([false,true])('opens an array draft only with model permission and checks fresh field permission before dispatch: %s',async allowModelAdd=>{
    const f=fixture({overviewOnly:true,allowModelAdd,allowFieldAdd:false})
    const {wrapper,instance}=await page();await select(wrapper,'Orders')
    const button=wrapper.get('[data-action="add-array"]')
    expect(button.attributes('disabled')!==undefined).toBe(!allowModelAdd)
    if(allowModelAdd){
      await button.trigger('click');await flushPromises()
      const editor=wrapper.findComponent({name:'DataSpaceArrayCreate'}),body=new DOMWrapper(document.body)
      await parameterInput(editor,'名称').setValue('ForbiddenArray');await flushPromises()
      await body.get('[data-action="save-new-array"]').trigger('click');await flushPromises()
      expect(body.text()).toContain('当前查询不允许新增模型或字段')
      expect(instance.isDirty).toBe(true)
      await body.get('[data-action="cancel-new-array"]').trigger('click');await flushPromises()
    }
    expect(instance.isDirty).toBe(false);expect(writes(f)).toHaveLength(0)
    expect(f.sessions[0]!.metadataDataSet.getView('Base_DataModel_Field')!.requestState).toBe(RequestState.Idle)
    expect(f.sessions[0]!.metadataDataSet.getView('Base_DataModel')!.rows.some(r=>r['Name']==='ForbiddenArray')).toBe(false)
  })
  it('replaces only the pending canvas node with a new array after save, keeping cancellation local',async()=>{
    const f=fixture({overviewOnly:true,allowModelAdd:true,allowFieldAdd:true}),{wrapper,instance}=await page()
    await sourceButton(wrapper,'add-model-node').trigger('click');await flushPromises()
    await dragLayout(wrapper,'待配置模型')
    const graph=wrapper.getComponent(VueFlow),node=graph.props('nodes')!.find(n=>n.data?.title==='待配置模型')!
    graph.vm.$emit('nodeDoubleClick',{node});await flushPromises()
    await wrapper.get('[data-action="add-array"]').trigger('click');await flushPromises()
    const body=new DOMWrapper(document.body)
    await body.get('[data-action="cancel-new-array"]').trigger('click');await flushPromises()
    expect(graph.props('nodes')!.some(n=>n.data?.title==='待配置模型')).toBe(true)
    expect(writes(f)).toHaveLength(0);expect(f.fileWrites).toHaveLength(0)
    await wrapper.get('[data-action="add-array"]').trigger('click');await flushPromises()
    await parameterInput(wrapper.findComponent({name:'DataSpaceArrayCreate'}),'名称').setValue('CanvasArray');await flushPromises()
    await body.get('[data-action="save-new-array"]').trigger('click');await flushPromises()
    expect(writes(f),body.text()).toHaveLength(1);expect(instance.isDirty,body.text()).toBe(false)
    expect(graph.props('nodes')!.some(n=>n.data?.title==='待配置模型')).toBe(false)
    const id=String(f.created.get('Base_DataModel')?.[0]?.['rowid']),fresh=await f.open('A')
    expect(fresh.metadataDataSet.getView('Base_DataModel')!.rows.find(r=>r['rowid']===id)).toMatchObject({Name:'CanvasArray',Type:'数组'})
    expect(fresh.definitionDataSet?.layout?.modelPositions?.[id]).toEqual({x:396,y:240})
    expect(Object.keys(fresh.definitionDataSet?.layout?.unboundNodes??{})).toEqual([])
    expect(f.sessions[0]!.metadataDataSet.getView('Base_DataModel_Field')!.requestState).toBe(RequestState.Idle)
  })
  it.each([false,true])('awaits formal header confirmation and retains input on failure, rejected=%s',async rejected=>{
    const f=fixture({overviewOnly:true,formalProjection:true,allowArrayEdit:true,allowFieldEdit:true,editableFieldProperties:['description'],sourceFields:[
      {rowid:'F1',dataModelId:'M1',Name:'name',description:'名称',type:'dataModel',FieldType:'string',IsOutput:1,IsPKey:1,Order:0},
    ]})
    f.setModelValues({Type:'数组',PrimaryKeyFields:'name',items:'[{"name":"before"}]'})
    const {wrapper}=await page();await select(wrapper,'Orders')
    await wrapper.get('[data-action="edit-array"]').trigger('click');await flushPromises()
    const session=f.sessions[0]!,owner=session.getArrayEdit('M1','modelFields'),fields=session.metadataDataSet.getView('Base_DataModel_Field','modelFields')!
    let complete=()=>{}
    const gate=new Promise<void>(resolve=>{complete=resolve}),apply=owner.applyHeaders.bind(owner)
    const confirm=vi.spyOn(owner,'applyHeaders').mockImplementationOnce(async value=>{await gate;if(rejected)throw new Error('确认写回失败');await apply(value)})
    const body=new DOMWrapper(document.body)
    await body.get('[data-action="array-headers"]').trigger('click');await flushPromises()
    const headers=wrapper.getComponent({name:'DataSpaceArrayHeaders'}),key=headers.getComponent(RendererForm).props('dataViewKey')
    const draft=resolveDataViewKey(key,session.metadataDataSet)!
    draft.updateEditingValue('array','headerDraft',JSON.stringify([{id:'F1',name:'name',label:'确认标题',order:0,primary:true}]))
    await body.get('[data-action="save-array-headers"]').trigger('click');await flushPromises()
    expect(wrapper.findComponent({name:'DataSpaceArrayHeaders'}).exists()).toBe(true)
    expect(headers.getComponent(FieldJson).props('readonly')).toBe(true)
    expect(body.get('[data-action="save-array-headers"]').attributes('disabled')).toBeDefined()
    expect(body.get('[data-action="cancel-array-headers"]').attributes('disabled')).toBeDefined()
    expect(confirm).toHaveBeenCalledTimes(1);expect(fields.hasEditingChanges()).toBe(false)
    complete();await flushPromises()
    if(rejected){
      expect(body.text()).toContain('确认写回失败');expect(fields.hasEditingChanges()).toBe(false)
      expect(JSON.parse(String(draft.getEditingRow('array')?.['headerDraft']))[0].label).toBe('确认标题')
      await body.get('[data-action="save-array-headers"]').trigger('click');await flushPromises()
    }
    expect(wrapper.findComponent({name:'DataSpaceArrayHeaders'}).exists()).toBe(false)
    expect(fields.getEditingRow('F1')?.['description']).toBe('确认标题')
    expect(body.get('[data-action="save-array"]').attributes('disabled')).toBeUndefined()
    fields.discardPendingChanges(['F1']);await flushPromises()
    expect(body.get('[data-action="save-array"]').attributes('disabled')).toBeDefined()
    await body.get('[data-action="cancel-array"]').trigger('click');await flushPromises()
    expect(writes(f)).toHaveLength(0)
  })
  it.each([false,true])('adds an array header through the standard dialog without loading the full field catalog, new primary=%s',async primary=>{
    const f=fixture({overviewOnly:true,formalProjection:true,allowArrayEdit:true,allowFieldEdit:true,allowFieldAdd:true,editableFieldProperties:['IsPKey'],sourceFields:[
      {rowid:'F1',dataModelId:'M1',Name:'name',description:'名称',type:'dataModel',FieldType:'string',IsOutput:1,IsPKey:1,Order:0,allowAIAdd:1},
    ]})
    f.setModelValues({Type:'数组',PrimaryKeyFields:'name',items:'[{"name":"before","memo":"原有值"}]'})
    f.stored.set('A',JSON.stringify({scenarioId:'A',tables:{OrdersAlias:{modelBinding:{modelId:'M1',modelName:'Orders'},views:{default:{},shared:{valueField:'name'}}}}}))
    const {wrapper,instance}=await page();await select(wrapper,'Orders')
    await wrapper.get('[data-action="edit-array"]').trigger('click');await flushPromises()
    const body=new DOMWrapper(document.body)
    await body.get('[data-action="array-headers"]').trigger('click');await flushPromises()
    const key=wrapper.getComponent({name:'DataSpaceArrayHeaders'}).getComponent(RendererForm).props('dataViewKey')
    const view=resolveDataViewKey(key,f.sessions[0]!.metadataDataSet)!
    view.updateEditingValue('array','headerDraft',JSON.stringify([{id:'F1',name:'name',label:'名称',order:0,primary:!primary},{name:'memo',label:'备注',order:1,primary}]))
    await body.get('[data-action="save-array-headers"]').trigger('click');await flushPromises()
    expect(wrapper.getComponent({name:'DataSpaceArrayEditor'}).getComponent({name:'FieldJson'}).props('children')).toContainEqual({type:'r-text',props:{field:'memo',label:'备注',maxlength:200}})
    await body.get('[data-action="save-array"]').trigger('click');await flushPromises()
    expect(writes(f),body.text()).toHaveLength(1);expect(instance.isDirty,body.text()).toBe(false);expect(f.fileWrites).toHaveLength(0)
    expect(f.sessions).toHaveLength(1);expect(f.sessions[0]!.metadataDataSet.destroyed).toBe(false)
    for(const name of ['Base_DataModel_Field','Base_DataModel_Relation'])expect(f.sessions.at(-1)!.metadataDataSet.getView(name)!.requestState).toBe(name === 'Base_DataModel_Relation' ? RequestState.Loaded : RequestState.Idle)
    const fresh=await f.open('A');await fresh.loadModelFields('M1')
    expect(fresh.getArrayEdit('M1','modelFields').headers()).toContainEqual({id:expect.any(String),name:'memo',label:'备注',order:1,primary,type:'varchar'})
    const output=fresh.definitionDataSet!.getView('OrdersAlias','shared')!
    expect(output.primaryKey).toBe(primary?'memo':'name')
    expect((await output.loadFromServer()).success).toBe(true);expect(output.rows).toMatchObject([{name:'before',memo:'原有值'}])
    output.setSelectedRows(output.rows);expect(output.getSelectedValues()).toEqual([primary?'原有值':'before']);expect(output.value).toBe('before')
  })
  it('edits existing array headers with the shared standard dialog and saves stable field identities', async () => {
    const f=fixture({overviewOnly:true,deferDefinition:true,missing:false,formalProjection:true,allowArrayEdit:true,allowFieldEdit:true,editableFieldProperties:['description','Order'],sourceFields:[
      {rowid:'F1',dataModelId:'M1',Name:'name',description:'名称',type:'dataModel',FieldType:'string',IsOutput:1,IsPKey:1,Order:0,allowAIAdd:1},
    ]})
    f.setModelValues({Type:'数组',PrimaryKeyFields:'name',parentField:'name',items:'[{"name":"before"}]'})
    f.stored.set('A',JSON.stringify({scenarioId:'A',tables:{OrdersAlias:{modelBinding:{modelId:'M1',modelName:'Orders'},views:{default:{},shared:{valueField:'name'}}}}}))
    const {wrapper,instance}=await page('?scenarioId=A', true);await select(wrapper,'Orders')
    await wrapper.get('[data-action="edit-array"]').trigger('click');await flushPromises()
    const body=new DOMWrapper(document.body)
    await body.get('[data-action="array-headers"]').trigger('click');await flushPromises()
    const headers=wrapper.findComponent({name:'DataSpaceArrayHeaders'}),key=headers.getComponent(RendererForm).props('dataViewKey')
    const view=resolveDataViewKey(key,f.sessions[0]!.metadataDataSet)!
    expect(key).toContain('@ArrayCreate_');expect(body.get('[data-action="save-array"]').attributes('disabled')).toBeDefined()
    const rows = headers.getComponent({name:'JsonArrayRows'})
    expect(rows.getComponent(ElTable).props()).toMatchObject({height:400})
    const columns = rows.findAllComponents(ElTableColumn)
    expect(columns.map(column => column.props())).toMatchObject([
      {label:'列头',minWidth:180},{label:'描述',minWidth:180},{label:'排序',width:120},{label:'主键',width:90,align:'center'},
    ])
    expect(rows.get('input[type="checkbox"]').attributes('disabled')).toBeDefined()
    await rows.get('.el-table__body tbody tr').trigger('click'); await rows.get('[data-json-edit]').trigger('click'); await flushPromises()
    const inputs = rows.findAllComponents(FieldText)
    expect(inputs[0]!.get('input').attributes('maxlength')).toBe('100')
    expect(inputs[1]!.get('input').attributes('maxlength')).toBe('200')
    await inputs[0]!.get('input').setValue('label'); await inputs[1]!.get('input').setValue('标题')
    await inputs[0]!.get('input').trigger('change'); await inputs[1]!.get('input').trigger('change')
    const order = rows.getComponent(ElInputNumber)
    expect(order.props()).toMatchObject({min:0,step:1,controlsPosition:'right'})
    await order.get('.el-input-number__increase').trigger('mousedown', {button: 0}); document.dispatchEvent(new MouseEvent('mouseup')); await flushPromises()
    await rows.get('[data-json-save-row]').trigger('click'); await flushPromises()
    expect(JSON.parse(String(view.getEditingRow('array')?.['headerDraft']))).toMatchObject([{id:'F1',name:'label',label:'标题',order:1,primary:true}])
    await body.get('[data-action="save-array-headers"]').trigger('click');await flushPromises()
    expect(f.sessions[0]!.metadataDataSet.getTable(view.tableName)).toBeUndefined();expect(instance.isDirty).toBe(true)
    await body.get('[data-action="save-array"]').trigger('click');await flushPromises()
    expect(writes(f)).toHaveLength(1);expect(instance.isDirty,body.text()).toBe(false)
    expect(f.sessions).toHaveLength(1);expect(f.sessions[0]!.metadataDataSet.destroyed).toBe(false)
    const fresh=await f.open('A')
    expect((await fresh.loadModelFields('M1')).rows.find(r=>r['rowid']==='F1')).toMatchObject({Name:'label',description:'标题',Order:1,allowAIAdd:1})
    expect(fresh.metadataDataSet.getView('Base_DataModel')!.rows.find(r=>r['rowid']==='M1')).toMatchObject({parentField:'label',items:'[{"label":"before"}]'})
    expect(f.fileWrites).toHaveLength(1)
    expect(JSON.parse(f.stored.get('A')!).tables.OrdersAlias.views.shared.valueField).toBe('label')
  }, 15_000)
  it('renames an array through the bound standard name field and retains the outer model editor after saving',async()=>{
    const f=fixture({overviewOnly:true,deferDefinition:true,allowArrayEdit:true,allowModelRename:true,sourceFields:[{rowid:'F1',dataModelId:'M1',Name:'name',type:'dataModel',FieldType:'string',IsOutput:1,IsPKey:0}]})
    f.setModelValues({Type:'数组',items:'[{"name":"before"}]'})
    const {wrapper,instance}=await page();await select(wrapper,'Orders')
    await wrapper.get('[data-action="edit-array"]').trigger('click');await flushPromises()
    const editor=wrapper.getComponent({name:'DataSpaceArrayEditor'}),name=editor.findAllComponents(FieldText).find(field=>field.props('field')==='Name')!
    expect(name.props('readonly')).toBe(false);await name.get('input').setValue('LocalOrders');await flushPromises()
    expect(f.sessions[0]!.metadataDataSet.getView('Base_DataModel')!.getEditingRow('M1')?.['Name']).toBe('LocalOrders')
    await new DOMWrapper(document.body).get('[data-action="save-array"]').trigger('click');await flushPromises()
    expect(writes(f)).toHaveLength(1);expect(instance.isDirty).toBe(false);expect(f.fileWrites).toHaveLength(1)
    expect(f.sessions).toHaveLength(1);expect(f.sessions[0]!.metadataDataSet.destroyed).toBe(false)
    expect(f.sessions.at(-1)!.getModelRename('M1').input.getEditingRow('rename')?.['name']).toBe('LocalOrders')
    expect(wrapper.findAllComponents(RendererDialog).some(dialog=>dialog.props('title')==='编辑前端数组'&&dialog.props('modelValue'))).toBe(false)
    expect((await f.open('A')).metadataDataSet.getView('Base_DataModel')!.rows.find(row=>row['rowid']==='M1')?.['Name']).toBe('LocalOrders')
  })
  it.each([false, true])('previews the selected named view from lazy overview (via group: %s) with typed inputs and no persistence', async viaGroup => {
    const f = fixture({overviewOnly: true, businessRows: {Orders: [{rowid: 'O1', parentId: null}]}})
    const {wrapper} = await page()
    await select(wrapper, 'Orders')
    if (viaGroup) {
      await select(wrapper, '数据视图（2）')
      expect(wrapper.getComponent(DataSpaceViewEditor).props('modelId')).toBe('M1')
      expect(wrapper.getComponent(RendererTabs).props('modelValue')).toBe('views')
    }
    await select(wrapper, 'shared')
    const editor = wrapper.getComponent(DataSpaceViewEditor)
    const opened = vi.spyOn(f.sessions[0]!, 'openPreview')
    await sourceButton(editor, 'open-query-preview').trigger('click'); await flushPromises()
    const preview: Awaited<ReturnType<(typeof f.sessions)[number]['openPreview']>> = await opened.mock.results[0]?.value
    const dialog = editor.findAllComponents(RendererDialog).find(item => item.props('title') === '数据预览')!
    expect(dialog.props('width')).toBe('92%'); expect(dialog.props('top')).toBe('4vh')
    expect(dialog.props('destroyOnClose')).toBe(true)
    const field = dialog.findAllComponents(FieldText).find(item => item.props('field') === 'context')!
    await field.get('input').setValue('{"customer":["C1","C2"],"enabled":false}')
    await sourceButton(dialog, 'run-query-preview').trigger('click'); await flushPromises()
    const table = dialog.getComponent(RendererTable)
    expect(table.props('dataViewKey')).toBe('A@Orders@shared')
    expect(table.getComponent(SourceTable).props('data')).toMatchObject([{rowid: 'O1'}])
    const request = f.requests.find(item => JSON.stringify(item.data).includes('"Name":"Orders"'))!
    expect(request).toBeDefined()
    expect(JSON.stringify(request.data)).toContain('C1')
    expect(JSON.stringify(request.data)).toContain('false')
    expect(preview.view.rows[0]).not.toHaveProperty('lingma_sys_params')
    expect(preview.view.rows[0]).not.toHaveProperty('lingma_sys_key')
    expect(preview.view.fieldAccess(preview.view.rows[0]!, 'rowid').write).toBe('denied')
    await preview.view.setPage(2)
    const repeated = f.requests.filter(item => JSON.stringify(item.data).includes('"Name":"Orders"')).at(-1)!
    expect(JSON.stringify(repeated.data)).toContain('C1')
    expect(JSON.stringify(repeated.data)).toContain('false')
    expect(writes(f)).toHaveLength(0); expect(f.fileWrites).toHaveLength(0)
    expect(f.sessions[0]!.definitionStatus).toBe('unloaded')
    expect(() => f.sessions[0]!.definitionDataSet).toThrow('定义投影已失效')
    const previewView = preview.view
    await sourceButton(dialog, 'close-query-preview').trigger('click'); await flushPromises()
    expect(dialog.props('modelValue')).toBe(false)
    expect(preview.disposed).toBe(true)
    expect(previewView.destroyed).toBe(true)
    expect(() => preview.view).toThrow('SCENARIO_VIEW_PREVIEW_STALE')
    expect(f.sessions[0]!.metadataDataSet.destroyed).toBe(false)
    for (const name of ['Base_DataModel_Field', 'Base_DataModel_Relation']) {
      expect(f.sessions[0]!.metadataDataSet.getView(name)!.requestState).toBe(name === 'Base_DataModel_Relation' ? RequestState.Loaded : RequestState.Idle)
    }
  })

  it('opens preview without querying and rejects invalid inputs without dispatching', async () => {
    const f = fixture()
    const {wrapper} = await page()
    await select(wrapper, 'Orders'); await select(wrapper, 'shared')
    const editor = wrapper.getComponent(DataSpaceViewEditor)
    await sourceButton(editor, 'open-query-preview').trigger('click'); await flushPromises()
    const dialog = editor.findAllComponents(RendererDialog).find(item => item.props('title') === '数据预览')!
    const field = dialog.findAllComponents(FieldText).find(item => item.props('field') === 'context')!
    await field.get('input').setValue('[]')
    await sourceButton(dialog, 'run-query-preview').trigger('click'); await flushPromises()
    expect(dialog.getComponent(DataSpaceQueryPreview).text()).toContain('queryContext必须是JSON对象')
    expect(f.requests.filter(item => JSON.stringify(item.data).includes('"Name":"Orders"'))).toHaveLength(0)
    expect(dialog.findComponent(RendererTable).exists()).toBe(false)
  })

  it('preserves a formally empty primary key and quotes special registration names without identifier collisions', async () => {
    const f = fixture({missing: true, sourceInput: true, formalPrimaryKey: '', sourceFields: []})
    const modelName = '订单-"明细"\n中文'
    f.setModelValues({Name: modelName})
    const session = await f.open('A')
    const content = await session.readApiInfo()
    const models = JSON.parse(content.split('const DataModels = ')[1]!.slice(0, -1))
    expect(models[0]).toEqual({modelId: 'M1', modelName, type: '接口', primaryKey: '', dataViewKeys: []})
    expect(f.fileWrites).toHaveLength(0)
  })

  it('refuses to copy a named view bound to an outdated model registration', async () => {
    const f = fixture()
    f.stored.set('A', JSON.stringify({scenarioId: 'A', tables: {OrdersAlias: {
      modelBinding: {modelId: 'M1', modelName: 'OldOrders'}, views: {default: {}},
    }}}))
    const session = await f.open('A')
    await expect(session.readApiInfo()).rejects.toThrow('模型绑定已失效')
    expect(f.fileWrites).toHaveLength(0)
  })

  it('refuses copied bindings when a formal model resolves to multiple internal tables', async () => {
    const f = fixture()
    const table = {modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {default: {}}}
    f.stored.set('A', JSON.stringify({scenarioId: 'A', tables: {First: table, Second: table}}))
    const session = await f.open('A')
    await expect(session.readApiInfo()).rejects.toThrow('模型绑定不唯一')
    expect(f.fileWrites).toHaveLength(0)
  })

  it('copies unbound models when the scenario file is missing and never guesses primary keys', async () => {
    const f = fixture({missing: true, formalPrimaryKey: 'orderId', sourceFields: [{rowid: 'FK', dataModelId: 'M1', Name: 'orderId', AsName: 'externalId', type: 'dataModel', IsPKey: 1, IsOutput: 1, FieldType: 'string'}]})
    const session = await f.open('A')
    const content = await session.readApiInfo()
    const models = JSON.parse(content.split('const DataModels = ')[1]!.slice(0, -1))
    expect(models).toEqual([
      {modelId: 'M1', modelName: 'Orders', type: '数据库', primaryKey: 'externalId', dataViewKeys: []},
      {modelId: 'M2', modelName: 'Customers', type: '数据库', primaryKey: 'rowid', dataViewKeys: []},
    ])
    expect(f.fileWrites).toHaveLength(0); expect(f.stored.has('A')).toBe(false)
  })

  it('refuses API copies from incomplete model metadata and keeps drafts intact', async () => {
    const clean = fixture(), other = await clean.open('A')
    const models = other.metadataDataSet.getView('Base_DataModel', 'default')!
    models.queryContext = {dataSpaceId: 'OTHER'}
    await expect(other.readApiInfo()).rejects.toThrow('未完整确认')
    models.queryContext = {dataSpaceId: 'A'}
    models.updateEditingValue('M1', 'description', 'unsaved')
    await expect(other.readApiInfo()).rejects.toThrow(/未提交|未完整确认/)
    expect(models.getEditingRow('M1')?.['description']).toBe('unsaved')
    expect(clean.fileWrites).toHaveLength(0)
  })

  it('does not copy an API result after metadata changes or application scope expires', async () => {
    const f = fixture(), writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', {clipboard: {writeText}})
    const {wrapper} = await page()
    const release = f.holdDefinitionRead()
    await wrapper.get('[data-action="copy-api"]').trigger('click'); await flushPromises()
    f.setModelValues({description: 'changed remotely'})
    await f.sessions[0]!.metadataDataSet.getView('Base_DataModel', 'default')!.loadFromServer()
    release(); await flushPromises()
    expect(writeText).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('定义已变化')
    const releaseScope = f.holdDefinitionRead()
    await wrapper.get('[data-action="copy-api"]').trigger('click'); await flushPromises()
    f.invalidate(); releaseScope(); await flushPromises()
    expect(writeText).not.toHaveBeenCalled()
    expect(wrapper.text()).not.toContain('API 信息已复制')
  })

  it('reports clipboard denial without a false success and allows explicit retry', async () => {
    fixture()
    const writeText = vi.fn().mockRejectedValueOnce(new Error('clipboard denied')).mockResolvedValue(undefined)
    vi.stubGlobal('navigator', {clipboard: {writeText}})
    const {wrapper, instance} = await page()
    await wrapper.get('[data-action="copy-api"]').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('clipboard denied')
    expect(wrapper.text()).not.toContain('API 信息已复制')
    expect(instance.isDirty).toBe(false)
    await wrapper.get('[data-action="copy-api"]').trigger('click'); await flushPromises()
    expect(writeText).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('API 信息已复制')
  })

  it('keeps API copy results scoped to each open page and ignores a disposed page', async () => {
    const f = fixture(), writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', {clipboard: {writeText}})
    const a = await page(), b = await page('?scenarioId=B')
    await b.wrapper.get('[data-action="copy-api"]').trigger('click'); await flushPromises()
    expect(writeText.mock.calls[0]![0]).toContain('const DataSetId = "B"')
    expect(a.wrapper.text()).not.toContain('API 信息已复制')
    const release = f.holdDefinitionRead()
    await a.wrapper.get('[data-action="copy-api"]').trigger('click'); await flushPromises()
    a.wrapper.unmount(); release(); await flushPromises()
    expect(writeText).toHaveBeenCalledTimes(1)
  })

  it('copies formal model identities, primary keys and all named view bindings without writing definitions', async () => {
    const f = fixture(), writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', {clipboard: {writeText}})
    const {wrapper, instance} = await page()
    await wrapper.get('[data-action="copy-api"]').trigger('click'); await flushPromises()
    expect(writeText).toHaveBeenCalledTimes(1)
    const copied = String(writeText.mock.calls[0]![0])
    expect(copied).toContain('const DataSetId = "A";')
    const models = JSON.parse(copied.split('const DataModels = ')[1]!.slice(0, -1))
    expect(models).toEqual([
      {modelId: 'M1', modelName: 'Orders', type: '数据库', primaryKey: 'rowid', dataViewKeys: ['A@Orders@default', 'A@Orders@shared']},
      {modelId: 'M2', modelName: 'Customers', type: '数据库', primaryKey: 'rowid', dataViewKeys: ['A@Customers@default', 'A@Customers@shared']},
    ])
    expect(f.sessions[0]!.definitionStatus).toBe('unloaded')
    await f.sessions[0]!.loadDefinition()
    for (const model of models) for (const key of model.dataViewKeys) {
      expect(resolveDataViewKey(key, f.sessions[0]?.definitionDataSet)?.dataTable?.modelBinding?.modelName).toBe(model.modelName)
    }
    expect(copied).not.toMatch(/token-|lingma_sys|OrderSource|CustomerSource/)
    expect(wrapper.text()).toContain('API 信息已复制')
    expect(f.fileWrites).toHaveLength(0)
    expect(f.requests.every(request => !request.url?.includes('BatchTableOperate'))).toBe(true)
    expect(instance.isDirty).toBe(false)
  })

  it('restores reference computed creation: confirm stages, multiple additions stay editable, top save submits one batch', async () => {
    const f = fixture({allowFieldAdd: true, allowFieldEdit: true, editableFieldProperties: ['description', 'AsName'], sourceFields: [
      {rowid: 'PK', dataModelId: 'M1', Name: 'rowid', AsName: 'rowid', type: 'dataModel', FieldType: 'string', IsPKey: 1, IsOutput: 1, ValueFun: ''},
      {rowid: 'F1', dataModelId: 'M1', Name: 'amount', AsName: 'amount', type: 'dataModel', FieldType: 'number', IsPKey: 0, IsOutput: 1, description: '金额', ValueFun: ''},
    ]})
    const {wrapper, instance} = await page(); await select(wrapper, 'Orders')
    await openModelFieldsTab(wrapper)
    const editor = wrapper.get('[aria-label="字段配置编辑"]'), view = f.sessions[0]!.metadataDataSet.getView('Base_DataModel_Field', 'modelFields')!
    const createDom = () => new DOMWrapper(document.body.querySelector('.data-space-field-create')!.closest('.el-dialog')!)
    view.updateEditingValue('F1', 'description', '旧字段修改'); await flushPromises()
    for (const name of ['total', 'tax']) {
      expect(editor.get('[data-action="create-field"]').attributes('disabled')).toBeUndefined()
      await editor.get('[data-action="create-field"]').trigger('click'); await flushPromises()
      const dialog = editor.findAllComponents(RendererDialog).find((dialog: VueWrapper<InstanceType<typeof RendererDialog>>) => dialog.props('title') === '添加计算字段')!
      expect(dialog.props()).toMatchObject({width: '420px', appendToBody: true, destroyOnClose: true})
      const form = createDom().getComponent(RendererForm)
      expect(form.props('dataViewKey')).toMatch(/^META@FieldCreate_.*@default$/)
      expect(form.props('labelWidth')).toBe('68px')
      expect(createDom().getComponent(FieldTextarea).get('textarea').attributes()).toMatchObject({rows: '4', maxlength: '200'})
      expect(form.findAllComponents(FieldText).map(item => item.props('field'))).toEqual(['Name'])
      expect(form.findAllComponents(FieldCheckbox)).toHaveLength(0)
      await writeBound(createDom(), 'Name', name)
      await createDom().get('[data-action="save-field-create"]').trigger('click'); await flushPromises()
      expect(writes(f)).toHaveLength(0); expect(instance.isDirty).toBe(true)
    }
    const row = view.rows.find(row => row['Name'] === 'total')!
    editor.getComponent(RendererTable).getComponent(SourceTable).vm.$emit('current-change', row); await flushPromises()
    await editor.get('[data-action="edit-field"]').trigger('click'); await flushPromises()
    await writeBound(fieldContractDom(), 'description', '撤销弹窗修改')
    await fieldContractDom().get('[data-action="cancel-field-editor"]').trigger('click'); await flushPromises()
    expect(view.getEditingRow(String(row['rowid']))?.['description']).toBe('')
    expect(view.dirtyTracking.pendingCreateIds.size).toBe(2)
    await wrapper.get('[data-action="save-model-workspace"]').trigger('click'); await flushPromises()
    expect(writes(f)).toHaveLength(1); expect(instance.isDirty).toBe(false)
    expect(f.fileWrites).toEqual([])
    const reopened = await f.open('A')
    expect(reopened.definitionDataSet!.getTable('OrdersAlias')!.columns.map(column => column.name)).toEqual(expect.arrayContaining(['total', 'tax']))
    expect(f.created.get('Base_DataModel_Field')?.map(field => field['AsName'])).toEqual(['', ''])
    expect(reopened.metadataDataSet.getView('Base_DataModel_Field')!.rows.find(row => row['rowid'] === 'F1')?.['description']).toBe('旧字段修改')
  })

  it('restores the two-input computed editor and preserves other drafts through cancel, confirmation and top save', async () => {
    const f = fixture({allowFieldEdit: true, editableFieldProperties: ['Name', 'description'], sourceFields: [
      {rowid: 'PK', dataModelId: 'M1', Name: 'rowid', AsName: 'rowid', type: 'dataModel', FieldType: 'string', IsPKey: 1, IsOutput: 1},
      {rowid: 'TOTAL', dataModelId: 'M1', Name: 'total', AsName: 'totalOutput', type: 'dataModel', FieldType: '计算字段',
        IsPKey: 0, IsOutput: 1, description: '合计', ValueFun: ''},
    ]})
    const {wrapper, instance} = await page(); await select(wrapper, 'Orders')
    await openModelFieldsTab(wrapper)
    const editor = wrapper.get('[aria-label="字段配置编辑"]'), view = f.sessions[0]!.metadataDataSet.getView('Base_DataModel_Field', 'modelFields')!
    editor.getComponent(RendererTable).getComponent(SourceTable).vm.$emit('current-change', view.rows.find(row => row['rowid'] === 'TOTAL')); await flushPromises()
    view.updateEditingValue('TOTAL', 'description', '打开前草稿'); view.updateEditingValue('PK', 'description', '其他字段草稿'); await flushPromises()
    const open = async () => {await editor.get('[data-action="edit-field"]').trigger('click'); await flushPromises()}
    await open()
    const dialog = editor.findAllComponents(RendererDialog).find((item: VueWrapper<InstanceType<typeof RendererDialog>>) => item.props('title') === '编辑计算字段')
    expect(dialog?.props()).toMatchObject({width: '420px', appendToBody: true, destroyOnClose: true})
    expect(fieldContractDom().findAll('[data-field-property]').map(item => item.attributes('data-field-property'))).toEqual(['Name', 'description'])
    expect(fieldContractDom().getComponent(RendererForm).props()).toMatchObject({dataViewKey: 'META@Base_DataModel_Field@modelFields', labelWidth: '68px'})
    expect(fieldContractDom().get('[data-field-property="Name"] input').attributes('maxlength')).toBe('100')
    expect(fieldContractDom().getComponent(FieldTextarea).get('textarea').attributes()).toMatchObject({rows: '4', maxlength: '200'})
    await writeBound(fieldContractDom(), 'Name', 'cancelled')
    await writeBound(fieldContractDom(), 'description', '弹窗草稿')
    await fieldContractDom().get('[data-action="cancel-field-editor"]').trigger('click'); await flushPromises()
    expect(view.getEditingPatch('TOTAL')).toEqual({description: '打开前草稿'})
    expect(view.getEditingPatch('PK')).toEqual({description: '其他字段草稿'})
    await open()
    await writeBound(fieldContractDom(), 'Name', '   ')
    await writeBound(fieldContractDom(), 'description', '  新说明  ')
    await fieldContractDom().get('[data-action="close-field-editor"]').trigger('click'); await flushPromises()
    expect(fieldContractDom().text()).toContain('名称必须是有效非空文本')
    await writeBound(fieldContractDom(), 'Name', '  adjustedTotal  ')
    await fieldContractDom().get('[data-action="close-field-editor"]').trigger('click'); await flushPromises()
    expect(document.body.querySelector('.data-space-field-contract')).toBeNull()
    expect(view.getEditingPatch('TOTAL')).toEqual({Name: 'adjustedTotal', description: '新说明'})
    expect(writes(f)).toHaveLength(0); expect(instance.isDirty).toBe(true)
    await wrapper.get('[data-action="save-model-workspace"]').trigger('click'); await flushPromises()
    expect(writes(f)).toHaveLength(1); expect(instance.isDirty).toBe(false)
    const reopened = await f.open('A'), fields = await reopened.loadModelFields('M1')
    expect(fields.rows.find(row => row['rowid'] === 'TOTAL')).toMatchObject({Name: 'adjustedTotal', description: '新说明',
      AsName: 'totalOutput', FieldType: '计算字段', IsOutput: 1, IsPKey: 0, ValueFun: ''})
    expect(fields.rows.find(row => row['rowid'] === 'PK')?.['description']).toBe('其他字段草稿')
  })

  it('keeps source-field settings and cancels only changes made since opening', async () => {
    const f = fixture({allowFieldEdit: true, editableFieldProperties: ['description', 'AsName'], sourceFields: [
      {rowid: 'PK', dataModelId: 'M1', Name: 'rowid', AsName: 'rowid', type: 'dataModel', FieldType: 'string', IsPKey: 1, IsOutput: 1},
      {rowid: 'F1', dataModelId: 'M1', Name: 'amount', AsName: 'amount', type: 'dataModel', FieldType: 'number', IsPKey: 0, IsOutput: 1, description: '金额'},
    ]})
    const {wrapper, instance} = await page(); await select(wrapper, 'Orders')
    await openModelFieldsTab(wrapper)
    const editor = wrapper.get('[aria-label="字段配置编辑"]'), view = f.sessions[0]!.metadataDataSet.getView('Base_DataModel_Field', 'modelFields')!
    editor.getComponent(RendererTable).getComponent(SourceTable).vm.$emit('current-change', view.rows.find(row => row['rowid'] === 'F1')); await flushPromises()
    view.updateEditingValue('F1', 'description', '打开前草稿'); view.updateEditingValue('PK', 'description', '另一行草稿'); await flushPromises()
    await editor.get('[data-action="edit-field"]').trigger('click'); await flushPromises()
    const contract = (): VueWrapper<InstanceType<typeof RendererDialog>> | undefined => editor.findAllComponents(RendererDialog).find((dialog: VueWrapper<InstanceType<typeof RendererDialog>>) => dialog.props('title') === '编辑字段合同')
    expect(contract(), editor.text()).toBeDefined()
    let dialog = contract()!
    expect(dialog.props('title')).toBe('编辑字段合同'); expect(dialog.props('width')).toBe('420px')
    expect(dialog.props('appendToBody')).toBe(true); expect(dialog.props('destroyOnClose')).toBe(true)
    expect(fieldContractDom().findAll('[data-field-property]').map(item => item.attributes('data-field-property'))).toEqual(['Name', 'description', 'FieldType', 'AsName', 'IsOutput', 'IsPKey'])
    expect(dialog.findComponent(FieldValueFunction).exists()).toBe(false)
    expect(fieldContractDom().getComponent(FieldTextarea).get('textarea').attributes()).toMatchObject({rows: '4', maxlength: '200'})
    expect(fieldContractDom().get('[data-field-property="Name"] input').attributes('disabled')).toBeDefined()
    expect(fieldContractDom().get('[data-field-property="AsName"] input').attributes('maxlength')).toBe('100')
    await writeBound(fieldContractDom(), 'description', '本次弹窗草稿')
    await fieldContractDom().get('[data-action="cancel-field-editor"]').trigger('click'); await flushPromises()
    expect(contract()).toBeUndefined()
    expect(view.getEditingPatch('F1')).toEqual({description: '打开前草稿'})
    expect(view.getEditingPatch('PK')).toEqual({description: '另一行草稿'})
    await editor.get('[data-action="edit-field"]').trigger('click'); await flushPromises()
    dialog = contract()!
    await writeBound(fieldContractDom(), 'description', '确认字段修改')
    await writeBound(fieldContractDom(), 'AsName', ' amount ')
    await fieldContractDom().get('[data-action="close-field-editor"]').trigger('click'); await flushPromises()
    expect(contract()).toBeDefined()
    expect(fieldContractDom().text()).toContain('无首尾空白')
    await writeBound(fieldContractDom(), 'AsName', 'amount')
    await fieldContractDom().get('[data-action="close-field-editor"]').trigger('click'); await flushPromises()
    expect(view.getEditingPatch('F1')).toEqual({description: '确认字段修改'})
    expect(writes(f)).toHaveLength(0); expect(instance.isDirty).toBe(true)
    await wrapper.get('[data-action="save-model-workspace"]').trigger('click'); await flushPromises()
    expect(writes(f)).toHaveLength(1); expect(instance.isDirty).toBe(false)
    const reopened = await f.open('A')
    expect(reopened.metadataDataSet.getView('Base_DataModel_Field')!.rows.find(row => row['rowid'] === 'F1')?.['description']).toBe('确认字段修改')
    expect(reopened.metadataDataSet.getView('Base_DataModel_Field')!.rows.find(row => row['rowid'] === 'PK')?.['description']).toBe('另一行草稿')
  })

  it('binds the reference primary checkbox to original drafts, cancels both flags and saves the confirmed key with field changes', async () => {
    const f = fixture({allowSourceEdit: true, allowFieldEdit: true, editableFieldProperties: ['IsPKey', 'IsOutput', 'description'], sourceFields: [
      {rowid: 'PK', dataModelId: 'M1', Name: 'rowid', AsName: 'rowid', type: 'dataModel', FieldType: 'string', IsPKey: 1, IsOutput: 1},
      {rowid: 'F1', dataModelId: 'M1', Name: 'code', AsName: 'businessCode', type: 'dataModel', FieldType: 'string', IsPKey: 0, IsOutput: 0},
    ]})
    f.setModelValues({Type: 'JSON', PrimaryKeyFields: 'rowid'})
    const {wrapper, instance} = await page(); await select(wrapper, 'Orders')
    await openModelFieldsTab(wrapper)
    const editor = wrapper.get('[aria-label="字段配置编辑"]'), session = f.sessions[0]!, view = session.metadataDataSet.getView('Base_DataModel_Field', 'modelFields')!
    const open = async (id: string) => {
      editor.getComponent(RendererTable).getComponent(SourceTable).vm.$emit('current-change', view.rows.find(row => row['rowid'] === id)); await flushPromises()
      await editor.get('[data-action="edit-field"]').trigger('click'); await flushPromises()
    }
    await open('F1')
    await fieldContractDom().get('[data-field-property="IsPKey"] input').setValue(true); await flushPromises()
    expect(view.getEditingRow('F1')).toMatchObject({IsPKey: 1, IsOutput: 1})
    expect(fieldContractDom().get('[data-field-property="IsOutput"] input').attributes('disabled')).toBeDefined()
    await fieldContractDom().get('[data-action="close-field-editor"]').trigger('click'); await flushPromises()
    expect(fieldContractDom().text()).toContain('另一个正式主键')
    await fieldContractDom().get('[data-action="cancel-field-editor"]').trigger('click'); await flushPromises()
    expect(view.getEditingPatch('F1')).toBeUndefined(); expect(instance.isDirty).toBe(false)
    await open('PK'); await fieldContractDom().get('[data-field-property="IsPKey"] input').setValue(false); await flushPromises()
    await fieldContractDom().get('[data-action="close-field-editor"]').trigger('click'); await flushPromises()
    await open('F1'); await fieldContractDom().get('[data-field-property="IsPKey"] input').setValue(true); await flushPromises()
    await writeBound(fieldContractDom(), 'description', '新主键')
    await fieldContractDom().get('[data-action="close-field-editor"]').trigger('click'); await flushPromises()
    expect(writes(f)).toHaveLength(0); expect(instance.isDirty).toBe(true)
    expect(wrapper.get('[data-action="save-model-workspace"]').attributes('disabled')).toBeUndefined()
    await wrapper.get('[data-action="save-model-workspace"]').trigger('click'); await flushPromises()
    expect(writes(f), wrapper.findAll('[role="alert"]').map(item => item.text()).join('\n')).toHaveLength(1); expect(instance.isDirty).toBe(false)
    expect(f.modelRow()).toMatchObject({PrimaryKeyFields: 'code'})
    expect(view.rows.find(row => row['rowid'] === 'F1')).toMatchObject({IsPKey: 1, IsOutput: 1, description: '新主键'})
  })

  it('keeps a mixed native primary workspace capture unknown through the field recovery button', async () => {
    const f = fixture({partialFieldWriteId: 'F1', allowSourceEdit: true, allowFieldEdit: true,
      editableFieldProperties: ['IsPKey', 'IsOutput'], sourceFields: [
        {rowid: 'PK', dataModelId: 'M1', Name: 'rowid', AsName: 'rowid', type: 'dataModel', FieldType: 'string', IsPKey: 1, IsOutput: 1},
        {rowid: 'F1', dataModelId: 'M1', Name: 'code', AsName: 'businessCode', type: 'dataModel', FieldType: 'string', IsPKey: 0, IsOutput: 0},
      ]})
    f.setModelValues({Type: 'JSON', PrimaryKeyFields: 'rowid'})
    const {wrapper, instance} = await page('?scenarioId=A', true); await select(wrapper, 'Orders'); await openModelFieldsTab(wrapper)
    const editor = wrapper.get('[aria-label="字段配置编辑"]'), view = f.sessions[0]!.metadataDataSet.getView('Base_DataModel_Field', 'modelFields')!
    editor.getComponent(RendererTable).getComponent(ElTable).vm.$emit('current-change', view.rows.find(row => row['rowid'] === 'PK')); await flushPromises()
    await editor.get('[data-action="edit-field"]').trigger('click'); await flushPromises()
    await fieldContractDom().get('[data-field-property="IsPKey"] input').setValue(false); await flushPromises()
    await fieldContractDom().get('[data-action="close-field-editor"]').trigger('click'); await flushPromises()
    editor.getComponent(RendererTable).getComponent(ElTable).vm.$emit('current-change', view.rows.find(row => row['rowid'] === 'F1')); await flushPromises()
    await editor.get('[data-action="edit-field"]').trigger('click'); await flushPromises()
    await fieldContractDom().get('[data-field-property="IsPKey"] input').setValue(true); await flushPromises()
    await fieldContractDom().get('[data-action="close-field-editor"]').trigger('click'); await flushPromises()
    f.loseNextResponse()
    await wrapper.get('[data-action="save-model-workspace"]').trigger('click'); await flushPromises()
    expect(writes(f), wrapper.findAll('[role="alert"]').map(item => item.text()).join('\n')).toHaveLength(1)
    expect(view.hasUnconfirmedSave).toBe(true)
    const modelView = f.sessions[0]!.metadataDataSet.getView('Base_DataModel')!
    expect(modelView.hasUnconfirmedSave).toBe(true)
    await wrapper.get('[data-action="verify-field"]').trigger('click'); await flushPromises()
    expect(view.hasUnconfirmedSave).toBe(true)
    expect(modelView.hasUnconfirmedSave).toBe(true)
    expect(instance.isDirty).toBe(true)
    expect(writes(f)).toHaveLength(1)
    expect(wrapper.findAll('[role="alert"]').map(item => item.text()).join('\n')).toMatch(/SPARK_SAVE_UNVERIFIABLE|未能确认|无法确认/)
  }, 30_000)

  it('offers explicit discard only after the original primary workspace batch is not applied', async () => {
    const f = fixture({omitModelWrite: true, omitAllFieldChanges: true, allowSourceEdit: true, allowFieldEdit: true,
      editableFieldProperties: ['IsPKey', 'IsOutput'], sourceFields: [
        {rowid: 'PK', dataModelId: 'M1', Name: 'rowid', AsName: 'rowid', type: 'dataModel', FieldType: 'string', IsPKey: 1, IsOutput: 1},
        {rowid: 'F1', dataModelId: 'M1', Name: 'code', AsName: 'businessCode', type: 'dataModel', FieldType: 'string', IsPKey: 0, IsOutput: 0},
      ]})
    f.setModelValues({Type: 'JSON', PrimaryKeyFields: 'rowid'})
    const {wrapper, instance} = await page(); await select(wrapper, 'Orders'); await openModelFieldsTab(wrapper)
    const editor = wrapper.get('[aria-label="字段配置编辑"]'), dataSet = f.sessions[0]!.metadataDataSet
    const view = dataSet.getView('Base_DataModel_Field', 'modelFields')!, modelView = dataSet.getView('Base_DataModel')!
    editor.getComponent(RendererTable).getComponent(SourceTable).vm.$emit('current-change', view.rows.find(row => row['rowid'] === 'PK')); await flushPromises()
    await editor.get('[data-action="edit-field"]').trigger('click'); await flushPromises()
    await fieldContractDom().get('[data-field-property="IsPKey"] input').setValue(false); await flushPromises()
    await fieldContractDom().get('[data-action="close-field-editor"]').trigger('click'); await flushPromises()
    editor.getComponent(RendererTable).getComponent(SourceTable).vm.$emit('current-change', view.rows.find(row => row['rowid'] === 'F1')); await flushPromises()
    await editor.get('[data-action="edit-field"]').trigger('click'); await flushPromises()
    await fieldContractDom().get('[data-field-property="IsPKey"] input').setValue(true); await flushPromises()
    await fieldContractDom().get('[data-action="close-field-editor"]').trigger('click'); await flushPromises()
    f.loseNextResponse(); await wrapper.get('[data-action="save-model-workspace"]').trigger('click'); await flushPromises()
    expect(writes(f)).toHaveLength(1)
    expect(view.hasUnconfirmedSave).toBe(true); expect(modelView.hasUnconfirmedSave).toBe(true)
    await wrapper.get('[data-action="verify-model"]').trigger('click'); await flushPromises()
    expect(wrapper.findAll('[role="alert"]').map(alert => alert.text()).join(';')).toContain('3 字段呈现')
    expect(view.hasUnconfirmedSave).toBe(true); expect(modelView.hasUnconfirmedSave).toBe(true)
    await wrapper.get('[data-action="verify-field"]').trigger('click'); await flushPromises()
    expect(view.hasUnconfirmedSave).toBe(false); expect(modelView.hasUnconfirmedSave).toBe(false)
    expect(view.rows.find(row => row['rowid'] === 'F1')?.['IsPKey']).toBe(0)
    expect(modelView.rows.find(row => row['rowid'] === 'M1')?.['PrimaryKeyFields']).toBe('rowid')
    expect(instance.isDirty, wrapper.findAll('[role="alert"]').map(alert => alert.text()).join(';')).toBe(false); expect(writes(f)).toHaveLength(1)
  }, 30_000)

  it('recovers an invalid native receipt from the field workspace by adopting current formal rows', async () => {
    const f = fixture({allowSourceEdit: true, allowFieldEdit: true, editableFieldProperties: ['description'], sourceFields: [
      {rowid: 'F1', dataModelId: 'M1', Name: 'amount', type: 'dataModel', FieldType: 'number', IsOutput: 1, description: '金额'},
    ]})
    const {wrapper, instance} = await page(); await select(wrapper, 'Orders')
    const session = f.sessions[0]!, dataSet = session.metadataDataSet
    await openModelFieldsTab(wrapper)
    const fieldView = dataSet.getView('Base_DataModel_Field', 'modelFields')!
    fieldView.updateEditingValue('F1', 'description', '最终字段值')
    await writeBound(wrapper.getComponent(DataSpaceModelEditor), 'description', '最终模型值')
    const nativeSave = dataSet.saveChanges.bind(dataSet)
    vi.spyOn(dataSet, 'saveChanges').mockImplementation(async (...args) => {
      const result = await nativeSave(...args)
      return result.data ? {...result, data: {...result.data, viewResults: []}} : result
    })
    await wrapper.get('[data-action="save-model-workspace"]').trigger('click'); await flushPromises()
    expect(writes(f)).toHaveLength(1)
    expect(fieldView.hasUnconfirmedSave).toBe(false)
    expect(dataSet.getView('Base_DataModel')?.hasUnconfirmedSave).toBe(false)
    expect(instance.isDirty).toBe(true)

    await wrapper.get('[data-action="verify-field"]').trigger('click'); await flushPromises()

    expect(writes(f)).toHaveLength(1)
    expect(fieldView.rows.find(row => row['rowid'] === 'F1')?.['description']).toBe('最终字段值')
    expect(dataSet.getView('Base_DataModel')?.rows.find(row => row['rowid'] === 'M1')?.['description']).toBe('最终模型值')
    expect(instance.isDirty).toBe(false)
    expect(wrapper.text()).toContain('已读取并采用当前正式结果')
  }, 30_000)

  it('preserves a second-view edit while adopting an invalid receipt across the original workspace', async () => {
    const f = fixture({allowSourceEdit: true, allowFieldEdit: true, editableFieldProperties: ['description'], sourceFields: [
      {rowid: 'F1', dataModelId: 'M1', Name: 'amount', type: 'dataModel', FieldType: 'number', IsOutput: 1, description: '金额'},
    ]})
    const {wrapper, instance} = await page(); await select(wrapper, 'Orders')
    const dataSet = f.sessions[0]!.metadataDataSet
    await openModelFieldsTab(wrapper)
    const fieldView = dataSet.getView('Base_DataModel_Field', 'modelFields')!
    fieldView.updateEditingValue('F1', 'description', '最终字段值')
    await writeBound(wrapper.getComponent(DataSpaceModelEditor), 'description', '最终模型值')
    const nativeSave = dataSet.saveChanges.bind(dataSet)
    vi.spyOn(dataSet, 'saveChanges').mockImplementation(async (...args) => {
      const result = await nativeSave(...args)
      return result.data ? {...result, data: {...result.data, viewResults: []}} : result
    })
    await wrapper.get('[data-action="save-model-workspace"]').trigger('click'); await flushPromises()
    expect(writes(f)).toHaveLength(1)
    const modelView = dataSet.getView('Base_DataModel')!
    let release!: () => void
    const gate = new Promise<void>(resolve => {release = resolve})
    const load = modelView.loadFromServer.bind(modelView), held = vi.fn()
    vi.spyOn(modelView, 'loadFromServer').mockImplementationOnce(async options => {
      held(); const result = await load(options); await gate; return result
    })

    expect(wrapper.get('[data-action="verify-field"]').text()).toBe('读取并采用当前正式结果')
    await wrapper.get('[data-action="verify-field"]').trigger('click')
    await vi.waitFor(() => expect(held).toHaveBeenCalledTimes(1))
    fieldView.updateEditingValue('F1', 'description', '回读期间新修改')
    release(); await flushPromises()
    expect(fieldView.getEditingRow('F1')?.['description']).toBe('回读期间新修改')
    expect(instance.isDirty).toBe(true)
    expect(writes(f)).toHaveLength(1)
    expect(wrapper.text()).toContain('读取当前正式结果期间出现新草稿')

    await wrapper.get('[data-action="verify-field"]').trigger('click'); await flushPromises()
    expect(fieldView.rows.find(row => row['rowid'] === 'F1')?.['description']).toBe('最终字段值')
    expect(modelView.rows.find(row => row['rowid'] === 'M1')?.['description']).toBe('最终模型值')
    expect(instance.isDirty).toBe(false)
    expect(writes(f)).toHaveLength(1)
  }, 30_000)

  it('binds the model field table and editor to one scoped view and saves back into the full directory', async () => {
    const f = fixture({allowFieldEdit: true, editableFieldProperties: ['description', 'IsOutput'], sourceFields: [
      {rowid: 'PK', dataModelId: 'M1', Name: 'rowid', type: 'dataModel', FieldType: 'string', IsPKey: 1, IsOutput: 1},
      {rowid: 'F1', dataModelId: 'M1', Name: 'amount', type: 'dataModel', FieldType: 'number', IsPKey: 0, IsOutput: 1, description: '金额'},
      {rowid: 'OTHER', dataModelId: 'M2', Name: 'customer', type: 'dataModel', FieldType: 'string', IsPKey: 0, IsOutput: 1},
      {rowid: 'ARG', dataModelId: 'M1', Name: 'input', type: 'inputParams', FieldType: 'string', IsPKey: 0, IsOutput: 0},
    ]})
    const {wrapper, instance} = await page(); await select(wrapper, 'Orders')
    await openModelFieldsTab(wrapper)
    const table = wrapper.get('[aria-label="字段配置编辑"]').getComponent(RendererTable)
    const dataSet = f.sessions[0]!.metadataDataSet
    expect(table.props('dataViewKey')).toBe('META@Base_DataModel_Field@modelFields')
    expect(table.props('dataSource')).toBeUndefined()
    const view = resolveDataViewKey(table.props('dataViewKey'), dataSet)!
    expect(view.rows.map(row => row['rowid']).sort()).toEqual(['F1', 'PK'])
    expect(dataSet.getView('Base_DataModel_Field', 'default')!.rows).toHaveLength(4)
    table.getComponent(SourceTable).vm.$emit('current-change', view.rows.find(row => row['rowid'] === 'F1')); await flushPromises()
    const editor = wrapper.get('[aria-label="字段配置编辑"]')
    await editor.get('[data-action="edit-field"]').trigger('click'); await flushPromises()
    expect(fieldContractDom().getComponent(RendererForm).props('dataViewKey')).toBe(table.props('dataViewKey'))
    await writeBound(fieldContractDom(), 'description', '表格字段修改'); await flushPromises()
    await fieldContractDom().get('[data-action="close-field-editor"]').trigger('click'); await flushPromises()
    expect(view.getEditingRow('F1')?.['description']).toBe('表格字段修改')
    expect(dataSet.getView('Base_DataModel_Field', 'default')!.getEditingRow('F1')?.['description']).toBe('金额')
    expect(instance.isDirty).toBe(true)
    await wrapper.get('[data-action="save-model-workspace"]').trigger('click'); await flushPromises()
    expect(writes(f)).toHaveLength(1)
    expect(view.rows.find(row => row['rowid'] === 'F1')?.['description']).toBe('表格字段修改')
    expect(dataSet.getView('Base_DataModel_Field', 'default')!.rows.find(row => row['rowid'] === 'F1')?.['description']).toBe('表格字段修改')
    expect(dataSet.getView('Base_DataModel_Field', 'default')!.rows).toHaveLength(4)
    expect(instance.isDirty).toBe(false)
    await select(wrapper, 'Customers')
    await openModelFieldsTab(wrapper)
    expect(view.rows.map(row => row['rowid'])).toEqual(['OTHER'])
  })

  it('keeps field selection aligned with its editor while another definition operation locks it', async () => {
    const f = fixture({allowModelRename: true, sourceFields: [
      {rowid: 'PK', dataModelId: 'M1', Name: 'rowid', type: 'dataModel', FieldType: 'string', IsPKey: 1, IsOutput: 1},
      {rowid: 'F1', dataModelId: 'M1', Name: 'amount', type: 'dataModel', FieldType: 'number', IsPKey: 0, IsOutput: 1},
    ]})
    const {wrapper} = await page(); await select(wrapper, 'Orders')
    await openModelFieldsTab(wrapper)
    const view = f.sessions[0]!.metadataDataSet.getView('Base_DataModel_Field', 'modelFields')!
    const currentId = view.currentRow?.['rowid']
    await parameterInput(wrapper.getComponent(DataSpaceModelRename), '节点名称:').setValue('PendingRename'); await flushPromises()
    const table = wrapper.get('[aria-label="字段配置编辑"]').getComponent(RendererTable)
    table.getComponent(SourceTable).vm.$emit('current-change', view.rows.find(row => row['rowid'] !== currentId)); await flushPromises()
    expect(view.currentRow?.['rowid']).toBe(currentId)
    await sourceButton(wrapper.getComponent(DataSpaceModelRename), 'cancel-rename-model').trigger('click'); await flushPromises()
    expect(writes(f)).toHaveLength(0)
  })

  it('saves unified model fields, request settings and data processing then independently assembles the definition', async () => {
    const f = fixture({allowSourceEdit: true, formalProjection: true, allowFieldEdit: true,
      editableFieldProperties: ['description', 'Expression', 'allowAIAdd'],
      desensitizationRules: [{rowid: 'RULE', name: '金额脱敏'}],
      sourceFields: [
        {rowid: 'PK', dataModelId: 'M1', Name: 'rowid', type: 'dataModel', FieldType: 'string', IsPKey: 1, IsOutput: 1},
        {rowid: 'PARENT', dataModelId: 'M1', Name: 'parentId', type: 'dataModel', FieldType: 'string', IsPKey: 0, IsOutput: 1},
        {rowid: 'F1', dataModelId: 'M1', Name: 'amount', description: '金额', type: 'dataModel', FieldType: 'number', IsPKey: 0, IsOutput: 1, Expression: '', allowAIAdd: 0},
      ], businessRows: {Orders: [{rowid: 'O0', parentId: null, amount: 2}, {rowid: 'O1', parentId: null, amount: 12}]}})
    const {wrapper, instance} = await page(); await select(wrapper, 'Orders')
    const session = f.sessions[0]!, tabs = wrapper.find('.node-panel-tabs').getComponent(RendererTabs)
    const previousAddApi = session.metadataDataSet.getView('Base_DataModel')!.getEditingRow('M1')?.['addApi']
    const saveCurrent = async () => {
      await flushPromises()
      expect(wrapper.get('[data-action="save-model-workspace"]').attributes('disabled'), wrapper.text()).toBeUndefined()
      await wrapper.get('[data-action="save-model-workspace"]').trigger('click'); await flushPromises()
      expect(instance.isDirty, wrapper.text()).toBe(false)
    }
    await openModelFieldsTab(wrapper)
    const fields = session.metadataDataSet.getView('Base_DataModel_Field', 'modelFields')!
    fields.updateEditingValue('F1', 'description', '成交金额')
    fields.updateEditingValue('F1', 'Expression', 'RULE'); fields.updateEditingValue('F1', 'allowAIAdd', 1)
    expect(session.metadataDataSet.getView('Base_DataModel_Field', 'default')!.hasEditingChanges()).toBe(false)
    await saveCurrent()
    await tabs.get('#tab-source').trigger('click'); await flushPromises()
    session.getModelEdit('M1').stage('description', '模型与视图连续保存')
    await saveCurrent()
    await tabs.get('#tab-views').trigger('click'); await flushPromises()
    const viewEditor = wrapper.getComponent(DataSpaceViewEditor)
    await openViewProperties(viewEditor)
    await viewEditor.get('[data-edit-property="filterExpression"]').trigger('click'); await flushPromises()
    viewEditor.getComponent(FilterExpressionEditor).vm.$emit('update:modelValue', {field: 'amount', operator: 'gt', value: 5}); await flushPromises()
    await viewEditor.get('[data-action="finish-view-property"]').trigger('click'); await flushPromises()
    await viewEditor.get('[data-action="save-views"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false)
    await tabs.get('#tab-dataProcess').trigger('click'); await flushPromises()
    const processEditor = wrapper.getComponent(DataSpaceTableConfiguration)
    const json = processEditor.get('[data-json-member="url"] input')
    await json.setValue('/api/DataOperation/GetData'); await json.trigger('change'); await flushPromises()
    await saveCurrent()
    expect(writes(f)).toHaveLength(2)
    await wrapper.get('[data-action="close-definition"]').trigger('click'); await flushPromises()
    const reopened = await f.open('A')
    expect(reopened).not.toBe(session)
    const model = reopened.metadataDataSet.getView('Base_DataModel')!.rows.find(row => row['rowid'] === 'M1')!
    expect(model).toMatchObject({description: '模型与视图连续保存'})
    expect(model['addApi']).toBe(previousAddApi)
    expect(DataSpaceDesignApi.parseFilter(String(model['Filter']))).toBeUndefined()
    const field = (await reopened.loadModelFields('M1')).rows.find(row => row['rowid'] === 'F1')!
    expect(field).toMatchObject({description: '成交金额', Expression: 'RULE', allowAIAdd: 1})
    const dataSet = reopened.definitionDataSet!
    expect(dataSet.scenarioId).toBe('A')
    expect(dataSet.getTable('OrdersAlias')?.api?.list?.url).toBe('/api/DataOperation/GetData')
    expect(dataSet.getTable('OrdersAlias')?.columns.find(column => column.name === 'amount')?.label).toBe('成交金额')
    const view = dataSet.getView('OrdersAlias', 'default')!
    expect((await view.loadFromServer()).success).toBe(true)
    expect(view.rows.map(row => row['rowid'])).toEqual(['O1'])
    const query = f.requests.filter(request => request.url === '/api/DataOperation/GetData').at(-1)!
    expect(Object.entries(query.headers ?? {}).filter(([key]) => key.toLowerCase() === 'x-formkey').map(([, value]) => value)).toEqual(['A'])
    expect(query.data).toMatchObject({Table: [{Name: 'Orders'}]})
    const preview = await reopened.openPreview({modelId: 'M1', modelName: 'Orders', tableName: 'OrdersAlias', viewId: 'default'})
    try {
      expect((await preview.view.loadFromServer()).success).toBe(true)
      expect(preview.view.rows).toEqual([expect.objectContaining({rowid: 'O1', amount: 12})])
      expect((await preview.view.loadFromServer({page: 1, pageSize: 1, sort: 'amount:desc'})).success).toBe(true)
      expect(preview.view.rows.map(row => row['rowid'])).toEqual(['O1'])
      expect(preview.view.filterExpression).toEqual({field: 'amount', operator: 'gt', value: 5})
    } finally {preview.dispose()}
    expect(writes(f)).toHaveLength(2)
    expect(f.fileWrites).toHaveLength(2)
  }, 30000)

  it('keeps former frontend field drafts in the unified model view protected across tabs', async () => {
    const f = fixture({allowFieldEdit: true, editableFieldProperties: ['Expression', 'allowAIAdd'],
      desensitizationRules: [{rowid: 'RULE', name: '脱敏'}], sourceFields: [
        {rowid: 'PK', dataModelId: 'M1', Name: 'rowid', type: 'dataModel', FieldType: 'string', IsPKey: 1, IsOutput: 1, Expression: '', allowAIAdd: 0},
        {rowid: 'F1', dataModelId: 'M1', Name: 'amount', type: 'dataModel', FieldType: 'number', IsPKey: 0, IsOutput: 1, Expression: '', allowAIAdd: 0},
      ]}), {wrapper, instance} = await page()
    await select(wrapper, 'Orders')
    const tabs = wrapper.getComponent(RendererTabs)
    await openModelFieldsTab(wrapper)
    expect(tabs.find('#tab-frontModel').exists()).toBe(false)
    expect(wrapper.get('[aria-label="模型字段工作区"]').isVisible()).toBe(true)
    const view = f.sessions[0]!.metadataDataSet.getView('Base_DataModel_Field', 'modelFields')!
    expect(view.rows.map(row => row['rowid']).sort()).toEqual(['F1', 'PK'])
    view.updateEditingValue('F1', 'allowAIAdd', 1); await flushPromises()
    expect(instance.isDirty).toBe(true)
    await tabs.get('#tab-source').trigger('click'); await flushPromises()
    await select(wrapper, 'Customers')
    expect(wrapper.get('.design-detail h2').text()).toBe('Orders')
    await openModelFieldsTab(wrapper)
    const panel = wrapper.get('[aria-label="模型字段工作区"]')
    await panel.findAll('button').find(button => button.text() === '放弃本地修改')!.trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false); expect(writes(f)).toHaveLength(0)
    expect(view.getEditingRow('F1')?.['allowAIAdd']).toBe(0)
  })

  it('keeps one model draft across standard workspace tabs and opens a selected named view', async () => {
    const f = fixture(), {wrapper, instance} = await page()
    await select(wrapper, 'Orders')
    const tabs = wrapper.getComponent(RendererTabs), editor = wrapper.getComponent(DataSpaceModelEditor)
    expect(tabs.props('dataViewKey')).toBe(`${f.sessions[0]!.metadataDataSet.scenarioId}@Base_DataModel@default`)
    expect(tabs.props('dataMember')).toBe('currentRow')
    expect(tabs.findAll('[role="tab"]').filter(tab => tab.element.closest('.el-tabs') === tabs.get('.el-tabs').element).map(tab => tab.text())).toEqual(['1 模型结构', '2 请求方案', '3 字段呈现', '4 数据处理', '5 数据视图'])
    expect(tabs.props('modelValue')).toBe('source')
    expect(wrapper.getComponent(DataSpaceModelRename).isVisible()).toBe(true)
    await writeBound(editor, 'description', '跨分区模型草稿')
    expect(instance.isDirty).toBe(true)
    await select(wrapper, 'Customers')
    expect(wrapper.get('.design-detail h2').text()).toBe('Orders')
    await wrapper.get('[data-action="save-model-workspace"]').trigger('click'); await flushPromises()
    expect(writes(f)).toHaveLength(1)
    expect((await f.open('A')).metadataDataSet.getView('Base_DataModel', 'default')!.getEditingRow('M1')?.['description']).toBe('跨分区模型草稿')
    await tabs.get('#tab-request').trigger('click'); await flushPromises()
    await tabs.get('#tab-source').trigger('click'); await flushPromises()
    expect(wrapper.getComponent(DataSpaceModelEditor).element).toBe(editor.element)
    await select(wrapper, 'shared')
    expect(wrapper.getComponent(RendererTabs).props('modelValue')).toBe('views')
    expect(wrapper.getComponent(DataSpaceViewEditor).isVisible()).toBe(true)
  })

  it('saves meta fields and request settings from the reference shared header without locking the other tab', async () => {
    const f = fixture({allowSourceEdit: true, allowFieldEdit: true, editableFieldProperties: ['description'], sourceFields: [
      {rowid: 'F1', dataModelId: 'M1', Name: 'amount', type: 'dataModel', FieldType: 'number', IsPKey: 0, IsOutput: 1, description: '金额'},
    ]})
    const {wrapper, instance} = await page(); await select(wrapper, 'Orders')
    const tabs = wrapper.getComponent(RendererTabs), session = f.sessions[0]!
    expect(tabs.props('toolbarPlacement')).toBe('header')
    const fields = session.metadataDataSet.getView('Base_DataModel_Field', 'modelFields')!
    const models = session.metadataDataSet.getView('Base_DataModel', 'default')!
    await openModelFieldsTab(wrapper)
    fields.updateEditingValue('F1', 'description', '字段统一保存')
    models.updateEditingValue('M1', 'description', '模型统一保存'); await flushPromises()
    expect(instance.isDirty).toBe(true)
    const fieldPanel = wrapper.get('[aria-label="字段配置编辑"]')
    fieldPanel.getComponent(RendererTable).getComponent(SourceTable).vm.$emit('current-change', fields.rows.find(row => row['rowid'] === 'F1'))
    await flushPromises()
    await fieldPanel.get('[data-action="edit-field"]').trigger('click'); await flushPromises()
    expect(wrapper.get('[data-action="save-model-workspace"]').attributes('disabled')).toBeDefined()
    await fieldContractDom().get('[data-action="close-field-editor"]').trigger('click'); await flushPromises()
    await wrapper.get('[data-action="save-model-workspace"]').trigger('click'); await flushPromises()
    expect(writes(f)).toHaveLength(1)
    expect(instance.isDirty, JSON.stringify({model: session.getModelEdit('M1').getState(), field: session.getFieldEdit('F1', 'modelFields').getState(), alerts: wrapper.findAll('[role="alert"]').map(item => item.text()), status: wrapper.findAll('[role="status"]').map(item => item.text())})).toBe(false)
    const fresh = await f.open('A')
    expect(fresh.metadataDataSet.getView('Base_DataModel_Field')?.rows[0]?.['description']).toBe('字段统一保存')
    expect(fresh.getModelEdit('M1').read().fields.find(item => item.name === 'description')?.value).toBe('模型统一保存')
  })

  it('saves model and field drafts from the source tab in one unified workspace batch', async () => {
    const f = fixture({allowFieldEdit: true, editableFieldProperties: ['description'], sourceFields: [
      {rowid: 'F1', dataModelId: 'M1', Name: 'ordIdx', type: 'dataModel', FieldType: 'int', IsOutput: 1, description: '排序字段'},
    ]})
    const {wrapper, instance} = await page(); await select(wrapper, 'Orders')
    const tabs = wrapper.getComponent(RendererTabs), session = f.sessions[0]!
    await openModelFieldsTab(wrapper)
    const fieldView = session.metadataDataSet.getView('Base_DataModel_Field', 'modelFields')!
    const fieldTable = wrapper.get('[aria-label="字段配置编辑"]')
    fieldTable.getComponent(RendererTable).getComponent(SourceTable).vm.$emit('current-change', fieldView.rows[0]); await flushPromises()
    await fieldTable.get('[data-action="edit-field"]').trigger('click'); await flushPromises()
    await writeBound(fieldContractDom(), 'description', 'ordIdx描述')
    await fieldContractDom().get('[data-action="close-field-editor"]').trigger('click'); await flushPromises()
    expect(fieldView.getEditingPatch('F1'), 'field editor must stage its contract into the native field view').toMatchObject({description: 'ordIdx描述'})
    await tabs.get('#tab-source').trigger('click'); await flushPromises()
    const modelEditor = wrapper.getComponent(DataSpaceModelEditor), modelView = session.metadataDataSet.getView('Base_DataModel', 'default')!
    await writeBound(modelEditor, 'description', 'SourceScope模型说明')
    expect(wrapper.get('[data-action="save-model-workspace"]').attributes('disabled')).toBeUndefined()

    await wrapper.get('[data-action="save-model-workspace"]').trigger('click'); await flushPromises()

    expect(writes(f), wrapper.findAll('[role="alert"]').map(item => item.text()).join(';')).toHaveLength(1)
    expect(writes(f)[0]?.data).toEqual(expect.arrayContaining([
      expect.objectContaining({TableName: 'Base_DataModel', CrudModel: expect.objectContaining({Changed: [expect.objectContaining({rowid: 'M1', description: 'SourceScope模型说明'})]})}),
      expect.objectContaining({TableName: 'Base_DataModel_Field', CrudModel: expect.objectContaining({Changed: [expect.objectContaining({rowid: 'F1', description: 'ordIdx描述'})]})}),
    ]))
    expect(modelView.hasEditingChanges() || modelView.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(fieldView.hasEditingChanges() || fieldView.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(instance.isDirty).toBe(false)
    const reopened = await f.open('A')
    expect(reopened.metadataDataSet.getView('Base_DataModel')?.rows.find(row => row['rowid'] === 'M1')?.['description']).toBe('SourceScope模型说明')
    expect((await reopened.loadModelFields('M1')).rows.find(row => row['rowid'] === 'F1')?.['description']).toBe('ordIdx描述')
    expect(writes(f)).toHaveLength(1)
  })

  it('saves a field-only draft from the source tab without loading sibling field views', async () => {
    const f = fixture({allowFieldEdit: true, editableFieldProperties: ['description'], sourceFields: [
      {rowid: 'F1', dataModelId: 'M1', Name: 'ordIdx', type: 'dataModel', FieldType: 'int', IsOutput: 1, description: '排序字段'},
    ]})
    const {wrapper, instance} = await page(); await select(wrapper, 'Orders')
    const tabs = wrapper.getComponent(RendererTabs), session = f.sessions[0]!
    await openModelFieldsTab(wrapper)
    const fieldView = session.metadataDataSet.getView('Base_DataModel_Field', 'modelFields')!
    const fieldTable = wrapper.get('[aria-label="字段配置编辑"]')
    fieldTable.getComponent(RendererTable).getComponent(SourceTable).vm.$emit('current-change', fieldView.rows[0]); await flushPromises()
    await fieldTable.get('[data-action="edit-field"]').trigger('click'); await flushPromises()
    await writeBound(fieldContractDom(), 'description', 'ordIdx独立修改')
    await fieldContractDom().get('[data-action="close-field-editor"]').trigger('click'); await flushPromises()
    await tabs.get('#tab-source').trigger('click'); await flushPromises()
    const dataSet = session.metadataDataSet, inputFields = dataSet.getView('Base_DataModel_Field', 'modelInputFields')
    expect(inputFields?.requestState ?? RequestState.Idle).toBe(RequestState.Idle)
    const fieldReadsBeforeSave = f.requests.filter(request => request.url === '/api/DataOperation/GetData'
      && isRecord(request.data) && JSON.stringify(request.data).includes('modelInputFields')).length

    expect(wrapper.get('[data-action="save-model-workspace"]').attributes('disabled')).toBeUndefined()
    await wrapper.get('[data-action="save-model-workspace"]').trigger('click'); await flushPromises()

    expect(writes(f), wrapper.findAll('[role="alert"]').map(item => item.text()).join(';')).toHaveLength(1)
    expect(writes(f)[0]?.data).toEqual([expect.objectContaining({TableName: 'Base_DataModel_Field', CrudModel: expect.objectContaining({
      Added: [], Deleted: [], Changed: [expect.objectContaining({rowid: 'F1', description: 'ordIdx独立修改'})],
    })})])
    expect(inputFields?.requestState ?? RequestState.Idle).toBe(RequestState.Idle)
    expect(f.requests.filter(request => request.url === '/api/DataOperation/GetData'
      && isRecord(request.data) && JSON.stringify(request.data).includes('modelInputFields'))).toHaveLength(fieldReadsBeforeSave)
    expect(fieldView.hasEditingChanges() || fieldView.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(instance.isDirty).toBe(false)
    expect((await f.open('A').then(reopened => reopened.loadModelFields('M1'))).rows.find(row => row['rowid'] === 'F1')?.['description']).toBe('ordIdx独立修改')
    expect(writes(f)).toHaveLength(1)
  })

  it('keeps a combined native capture unknown when source-tab save loses its response and recovers it once from fields', async () => {
    const f = fixture({allowFieldEdit: true, editableFieldProperties: ['description'], sourceFields: [
      {rowid: 'F1', dataModelId: 'M1', Name: 'ordIdx', type: 'dataModel', FieldType: 'int', IsOutput: 1, description: '排序字段'},
    ]})
    const {wrapper, instance} = await page(); await select(wrapper, 'Orders')
    const tabs = wrapper.getComponent(RendererTabs), session = f.sessions[0]!
    await openModelFieldsTab(wrapper)
    const fieldView = session.metadataDataSet.getView('Base_DataModel_Field', 'modelFields')!
    const fieldTable = wrapper.get('[aria-label="字段配置编辑"]')
    fieldTable.getComponent(RendererTable).getComponent(SourceTable).vm.$emit('current-change', fieldView.rows[0]); await flushPromises()
    await fieldTable.get('[data-action="edit-field"]').trigger('click'); await flushPromises()
    await writeBound(fieldContractDom(), 'description', 'unknown联合字段')
    await fieldContractDom().get('[data-action="close-field-editor"]').trigger('click'); await flushPromises()
    await tabs.get('#tab-source').trigger('click'); await flushPromises()
    await writeBound(wrapper.getComponent(DataSpaceModelEditor), 'description', 'unknown联合模型')
    f.loseNextResponse()

    await wrapper.get('[data-action="save-model-workspace"]').trigger('click'); await flushPromises()

    const modelView = session.metadataDataSet.getView('Base_DataModel', 'default')!
    expect(writes(f)).toHaveLength(1)
    expect(writes(f)[0]?.data).toEqual(expect.arrayContaining([
      expect.objectContaining({TableName: 'Base_DataModel'}),
      expect.objectContaining({TableName: 'Base_DataModel_Field'}),
    ]))
    expect(modelView.hasUnconfirmedSave).toBe(true)
    expect(fieldView.hasUnconfirmedSave).toBe(true)
    expect(wrapper.get('[data-action="save-model-workspace"]').attributes('disabled')).toBeDefined()
    await tabs.get('#tab-fields').trigger('click'); await flushPromises()
    await wrapper.get('[data-action="verify-field"]').trigger('click'); await flushPromises()
    expect(modelView.hasUnconfirmedSave).toBe(false)
    expect(fieldView.hasUnconfirmedSave).toBe(false)
    expect(modelView.rows.find(row => row['rowid'] === 'M1')?.['description']).toBe('unknown联合模型')
    expect(fieldView.rows.find(row => row['rowid'] === 'F1')?.['description']).toBe('unknown联合字段')
    expect(instance.isDirty, wrapper.findAll('[role="alert"]').map(item => item.text()).join(';')).toBe(false)
    expect(writes(f)).toHaveLength(1)
  }, 30_000)

  it('closes a view configuration without measuring hidden request labels or creating edits',async()=>{
    fixture()
    const warnings=vi.spyOn(console,'warn').mockImplementation(()=>{})
    try {
      const {wrapper,instance}=await page();await select(wrapper,'default')
      expect(wrapper.findComponent(DataSpaceModelEditor).exists()).toBe(false)
      expect(instance.isDirty).toBe(false)
      await wrapper.get('[data-action="close-definition"]').trigger('click');await flushPromises()
      expect(wrapper.findComponent(DataSpaceModelEditor).exists()).toBe(false)
      expect(warnings.mock.calls.filter(call=>String(call[0]).includes('unexpected width'))).toEqual([])
      expect(instance.isDirty).toBe(false)
    } finally {warnings.mockRestore()}
  })

  it.each(['non-text-value', 'missing-name'])('keeps malformed source input definitions visible without inventing unsaved edits: %s', async mode => {
    fixture({sourceInput: true, sourceFields: [{rowid: 'BAD', dataModelId: 'M1', Name: mode === 'missing-name' ? '' : 'badInput', type: 'inputParams', ValueFun: mode === 'missing-name' ? '' : {invalid: true}}]})
    const {wrapper, instance} = await page(); await select(wrapper, 'Orders')
    const editor = wrapper.getComponent(DataSpaceModelEditor)
    expect(editor.text()).toContain(mode === 'missing-name' ? '来源入参身份' : 'ValueFun不是文本')
    expect(instance.isDirty).toBe(false)
    expect(wrapper.get('[data-action="save-model-workspace"]').attributes('disabled')).toBeDefined()
  })

  it.each(['save', 'cancel', 'unknown'] as const)('restores source input fields with shared model workspace %s', async action => {
    const f = fixture({allowSourceEdit: true, editableFieldProperties: ['description'], sourceFields: [
      {rowid: 'F1', dataModelId: 'M1', Name: 'amount', type: 'dataModel', FieldType: 'number', IsOutput: 1, description: '金额'},
      {rowid: 'I1', dataModelId: 'M1', Name: 'customerArg', type: 'inputParams', FieldType: 'string', ValueFun: 'legacy'},
      {rowid: 'I2', dataModelId: 'M1', Name: 'otherArg', type: 'inputParams', FieldType: 'string', ValueFun: ''},
    ]})
    f.setModelValues({Type: '接口'})
    const {wrapper, instance} = await page('?scenarioId=A', true); await select(wrapper, 'Orders')
    const session = f.sessions[0]!, tabs = wrapper.getComponent(RendererTabs), editor = wrapper.getComponent(DataSpaceModelEditor)
    await tabs.get('#tab-source').trigger('click'); await flushPromises()
    const table = editor.findAllComponents(RendererTable).find(item => item.props('dataViewKey')?.endsWith('@sourceInputFields'))!
    expect(table).toBeDefined(); expect(table.props('dataSource')).toBeUndefined()
    expect(table.getComponent(ElTable).props()).toMatchObject({maxHeight:240})
    expect(table.findAllComponents(FieldText).map(field => field.props('field'))).toEqual(['Name', 'description', 'FieldType'])
    const functionField = table.getComponent(FieldValueFunction)
    expect(functionField.props('field')).toBe('ValueFun')
    functionField.props('onDialogVisibleChange')?.(true); await flushPromises()
    expect(instance.isDirty).toBe(true)
    expect(wrapper.get('[data-action="save-model-workspace"]').attributes('disabled')).toBeDefined()
    functionField.props('onDialogVisibleChange')?.(false); await flushPromises()
    const view = session.metadataDataSet.getView('Base_DataModel_Field', 'sourceInputFields')!
    view.updateEditingValue('I1', 'ValueFun', '{"Type":"GetInputParam","ParamName":"customer"}')
    view.updateEditingValue('I2', 'ValueFun', '{"Type":"GetConstValue","Value":false}')
    await openModelFieldsTab(wrapper)
    session.metadataDataSet.getView('Base_DataModel_Field', 'modelFields')!.updateEditingValue('F1', 'description', '修改字段')
    await flushPromises()
    if (action === 'cancel') {
      await wrapper.get('[data-action="cancel-field"]').trigger('click'); await flushPromises()
      expect(view.getEditingRow('I1')?.['ValueFun']).toBe('legacy')
      expect(view.getEditingRow('I2')?.['ValueFun']).toBe('')
      expect(instance.isDirty).toBe(false); expect(writes(f)).toHaveLength(0)
      return
    }
    session.metadataDataSet.getView('Base_DataModel', 'default')!.updateEditingValue('M1', 'description', '来源参数与模型说明')
    await flushPromises()
    expect(wrapper.get('[data-action="save-model-workspace"]').attributes('disabled')).toBeUndefined()
    if (action === 'unknown') f.loseNextResponse()
    await wrapper.get('[data-action="save-model-workspace"]').trigger('click'); await flushPromises()
    expect(writes(f)).toHaveLength(1)
    if (action === 'unknown') {
      expect(instance.isDirty).toBe(true)
      expect(wrapper.get('[data-action="save-model-workspace"]').attributes('disabled')).toBeDefined()
      await openModelFieldsTab(wrapper)
      await wrapper.get('[data-action="verify-field"]').trigger('click'); await flushPromises()
      expect(writes(f)).toHaveLength(1)
    }
    expect(instance.isDirty, wrapper.findAll('[role="alert"]').map(item => item.text()).join(';')).toBe(false)
    const fresh = await f.open('A'), reopened = await fresh.loadSourceInputFields('M1')
    expect(reopened.rows.map(row => row['ValueFun'])).toEqual(['{"Type":"GetInputParam","ParamName":"customer"}', '{"Type":"GetConstValue","Value":false}'])
  }, 30_000)

  it.each([
    {button: 'verify-model', staged: false}, {button: 'verify-model', staged: true},
    {button: 'verify-field', staged: false}, {button: 'verify-field', staged: true},
  ])('preserves later workspace edits during sequential recovery: $button staged=$staged', async ({button, staged}) => {
    const f = fixture({allowSourceEdit: true, allowFieldEdit: true, editableFieldProperties: ['description'], sourceFields: [
      {rowid: 'F1', dataModelId: 'M1', Name: 'amount', type: 'dataModel', FieldType: 'number', IsOutput: 1, description: '金额'},
      {rowid: 'I1', dataModelId: 'M1', Name: 'customerArg', type: 'inputParams', FieldType: 'string', ValueFun: ''},
    ]})
    f.setModelValues({Type: '接口'})
    const {wrapper, instance} = await page('?scenarioId=A', true); await select(wrapper, 'Orders')
    await wrapper.find('.node-panel-tabs').getComponent(RendererTabs).get('#tab-source').trigger('click'); await flushPromises()
    const session = f.sessions[0]!, models = session.metadataDataSet.getView('Base_DataModel')!
    const inputs = session.metadataDataSet.getView('Base_DataModel_Field', 'sourceInputFields')!
    const fields = session.metadataDataSet.getView('Base_DataModel_Field', 'modelFields')!
    const original = '{"Type":"GetInputParam","ParamName":"customer"}', later = '{"Type":"GetConstValue","Value":"later"}'
    inputs.updateEditingValue('I1', 'ValueFun', original)
    await writeBound(wrapper.getComponent(DataSpaceModelEditor), 'description', '已提交模型')
    f.loseNextResponse()
    await wrapper.get('[data-action="save-model-workspace"]').trigger('click'); await flushPromises()
    expect(writes(f)).toHaveLength(1)
    let release!: () => void
    const gate = new Promise<void>(resolve => {release = resolve}), load = models.loadFromServer.bind(models)
    const held = vi.spyOn(models, 'loadFromServer').mockImplementationOnce(async options => {
      const result = await load(options); await gate; return result
    })
    if (button === 'verify-model') {
      await wrapper.get('[data-action="verify-model"]').trigger('click'); await flushPromises()
      expect(wrapper.findAll('[role="alert"]').map(alert => alert.text()).join(';')).toContain('3 字段呈现')
      await openModelFieldsTab(wrapper)
    } else await openModelFieldsTab(wrapper)
    await wrapper.get('[data-action="verify-field"]').trigger('click'); await flushPromises()
    expect(held, wrapper.findAll('[role="alert"]').map(alert => alert.text()).join(';')).toHaveBeenCalledTimes(1)
    inputs.updateEditingValue('I1', 'ValueFun', later)
    fields.updateEditingValue('F1', 'description', '等待期间新字段')
    if (staged) {
      expect((await inputs.applyEditingRows(['I1'])).success).toBe(true)
      expect((await fields.applyEditingRows(['F1'])).success).toBe(true)
    }
    release(); await flushPromises()
    expect(inputs.getEditingRow('I1')?.['ValueFun']).toBe(later)
    expect(fields.getEditingRow('F1')?.['description']).toBe('等待期间新字段')
    expect(instance.isDirty).toBe(true)
    expect(wrapper.findAll('[role="alert"]').some(alert => /草稿|修改/.test(alert.text()))).toBe(true)
    expect(writes(f)).toHaveLength(1)
    // Only a new explicit choice may discard these later changes and verify the original write.
    await wrapper.get('[data-action="verify-field"]').trigger('click'); await flushPromises()
    expect(inputs.getEditingRow('I1')?.['ValueFun']).toBe(original)
    expect(instance.isDirty, wrapper.findAll('[role="alert"]').map(alert => alert.text()).join(';')).toBe(false)
    inputs.updateEditingValue('I1', 'ValueFun', later); await flushPromises()
    await wrapper.get('[data-action="save-model-workspace"]').trigger('click'); await flushPromises()
    expect(writes(f)).toHaveLength(2)
    const fresh = await f.open('A'), reopened = await fresh.loadSourceInputFields('M1')
    expect(reopened.getEditingRow('I1')?.['ValueFun']).toBe(later)
    expect(fresh.getModelEdit('M1').read().fields.find(field => field.name === 'description')?.value).toBe('已提交模型')
  }, 15_000)

  it.each(['field-only', 'source-input-only'] as const)('recovers a %s capture without a model owner capture', async participant => {
    const f = fixture({allowFieldEdit: true, allowSourceEdit: true, editableFieldProperties: ['description'], sourceFields: [
      {rowid: 'F1', dataModelId: 'M1', Name: 'rowid', type: 'dataModel', FieldType: 'string', IsPKey: 1, IsOutput: 1, description: ''},
      {rowid: 'I1', dataModelId: 'M1', Name: 'customerArg', type: 'inputParams', FieldType: 'string', ValueFun: ''},
    ]})
    if (participant === 'source-input-only') f.setModelValues({Type: '接口'})
    const {wrapper, instance} = await page('?scenarioId=A', true); await select(wrapper, 'Orders'); await openModelFieldsTab(wrapper)
    const session = f.sessions[0]!, dataSet = session.metadataDataSet, model = session.getModelEdit('M1')
    if (participant === 'field-only') {
      await wrapper.get('[aria-label="字段配置编辑"]').get('[data-action="edit-field"]').trigger('click'); await flushPromises()
      await writeBound(fieldContractDom(), 'description', '字段单独保存')
      await fieldContractDom().get('[data-action="close-field-editor"]').trigger('click'); await flushPromises()
    }
    else {
      await session.loadSourceInputFields('M1')
      session.getModelSourceInputs('M1')[0]!.stage('{"Type":"GetConstValue","Value":"参数单独保存"}')
    }
    f.loseNextResponse()
    if (participant === 'field-only') {
      expect(wrapper.get('[data-action="save-model-workspace"]').attributes('disabled')).toBeUndefined()
      await wrapper.get('[data-action="save-model-workspace"]').trigger('click'); await flushPromises()
    } else await expect(session.getModelSourceInputs('M1')[0]!.save()).rejects.toThrow()
    expect(model.getRecoveryCapture()).toBeUndefined()
    const capture = participant === 'field-only' ? session.getFieldEdit('F1', 'modelFields').getRecoveryCapture() : session.getModelSourceInputs('M1')[0]!.getRecoveryCapture()
    expect(capture).toBeDefined(); expect(capture!.targets.some(target => target.tableName === 'Base_DataModel')).toBe(false)
    expect(writes(f)).toHaveLength(1)
    await wrapper.get('[data-action="verify-field"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false)
    expect(writes(f)).toHaveLength(1)
    if (participant === 'field-only') expect(dataSet.getView('Base_DataModel_Field', 'modelFields')?.rows.find(row => row['rowid'] === 'F1')?.['description']).toBe('字段单独保存')
    else expect(dataSet.getView('Base_DataModel_Field', 'sourceInputFields')?.rows.find(row => row['rowid'] === 'I1')?.['ValueFun']).toContain('参数单独保存')
  })

  it('keeps a lost combined receipt locked and verifies both parts without another write', async () => {
    const f = fixture({allowSourceEdit: true, allowFieldEdit: true, editableFieldProperties: ['description'], sourceFields: [
      {rowid: 'F1', dataModelId: 'M1', Name: 'amount', type: 'dataModel', FieldType: 'number', IsPKey: 0, IsOutput: 1, description: '金额'},
    ]})
    const {wrapper, instance} = await page(); await select(wrapper, 'Orders')
    const tabs = wrapper.find('.node-panel-tabs').getComponent(RendererTabs), session = f.sessions[0]!
    await openModelFieldsTab(wrapper)
    session.metadataDataSet.getView('Base_DataModel_Field', 'modelFields')!.updateEditingValue('F1', 'description', '已写字段')
    await tabs.get('#tab-source').trigger('click'); await flushPromises()
    await writeBound(wrapper.getComponent(DataSpaceModelEditor), 'description', '已写模型')
    f.loseNextResponse()
    await wrapper.get('[data-action="save-model-workspace"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(true)
    expect(wrapper.get('[data-action="save-model-workspace"]').attributes('disabled')).toBeDefined()
    await openModelFieldsTab(wrapper)
    await wrapper.get('[data-action="verify-field"]').trigger('click'); await flushPromises()
    expect(instance.isDirty, wrapper.findAll('[role="alert"]').map(alert => alert.text()).join(';')).toBe(false); expect(writes(f)).toHaveLength(1)
    expect(session.getModelEdit('M1').getState()).toEqual({pending: false, status: 'idle'})
    expect(session.getFieldEdit('F1', 'modelFields').getState()).toEqual({pending: false, status: 'idle'})
  })

  it('edits fields within their model workspace while request settings remain available', async () => {
    const f = fixture({allowFieldEdit: true, editableFieldProperties: ['description'], sourceFields: [
      {rowid: 'PK', dataModelId: 'M1', Name: 'rowid', type: 'dataModel', FieldType: 'string', IsPKey: 1, IsOutput: 1},
      {rowid: 'F1', dataModelId: 'M1', Name: 'amount', type: 'dataModel', FieldType: 'number', IsPKey: 0, IsOutput: 1, description: '金额'},
    ]})
    const {wrapper, instance} = await page(); await select(wrapper, 'Orders')
    const tabs = wrapper.getComponent(RendererTabs)
    await openModelFieldsTab(wrapper)
    const fieldView = f.sessions[0]!.metadataDataSet.getView('Base_DataModel_Field', 'modelFields')!
    wrapper.get('[aria-label="字段配置编辑"]').getComponent(RendererTable).getComponent(SourceTable).vm.$emit('current-change', fieldView.rows.find(row => row['rowid'] === 'F1'))
    await flushPromises()
    const editor = wrapper.get('[aria-label="字段配置编辑"]')
    await editor.get('[data-action="edit-field"]').trigger('click'); await flushPromises()
    await writeBound(fieldContractDom(), 'description', '字段分区草稿'); await flushPromises()
    await fieldContractDom().get('[data-action="close-field-editor"]').trigger('click'); await flushPromises()
    expect(fieldView.getEditingRow('F1')?.['description']).toBe('字段分区草稿')
    await tabs.get('#tab-request').trigger('click'); await flushPromises()
    expect(wrapper.getComponent(DataSpaceModelRequest).props('disabled')).toBe(false)
    await select(wrapper, 'Customers')
    expect(wrapper.get('.design-detail h2').text()).toBe('Orders')
    await openModelFieldsTab(wrapper)
    await wrapper.get('[data-action="cancel-field"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false); expect(writes(f)).toHaveLength(0)
    await select(wrapper, 'Customers')
    expect(wrapper.get('.design-detail h2').text()).toBe('Customers')
  })

  it.each(['cancel', 'save', 'unknown'])('deletes the selected formal graph model through the original owner: %s', async outcome => {
    const f=fixture({overviewOnly:true,missing:true,allowDelete:true,sourceFields:[{rowid:'F1',dataModelId:'M1',Name:'rowid',type:'dataModel'}]})
    const {wrapper,instance}=await page(),flow=wrapper.getComponent(VueFlow)
    expect(sourceButton(wrapper,'remove-graph-selection').attributes('disabled')).toBeDefined()
    flow.vm.$emit('nodeClick',{node:flow.props('nodes')!.find(node=>node.data?.title==='Orders')});await flushPromises()
    expect(wrapper.find('.design-detail').exists()).toBe(false)
    await sourceButton(wrapper,'remove-graph-selection').trigger('click');await flushPromises()
    expect(wrapper.text()).toContain('待删除：Orders')
    expect(wrapper.text()).toContain('Base_DataModel_Field：1 条')
    expect(wrapper.findComponent(DataSpaceModelEditor).exists()).toBe(false)
    expect(writes(f)).toHaveLength(0);expect(f.fileWrites).toHaveLength(0)
    if(outcome==='cancel') {
      await sourceButton(wrapper,'cancel-remove-model').trigger('click');await flushPromises()
      expect(instance.isDirty).toBe(false);expect(wrapper.find('.design-detail').exists()).toBe(false)
      expect(flow.props('nodes')).toHaveLength(2);expect(writes(f)).toHaveLength(0)
    } else {
      if(outcome==='unknown')f.loseNextResponse()
      await sourceButton(wrapper,'confirm-remove-model').trigger('click');await flushPromises()
      expect(writes(f)).toHaveLength(1)
      if(outcome==='unknown') {
        expect(wrapper.find('[data-action="verify-remove-model"]').exists()).toBe(true)
        await sourceButton(wrapper,'verify-remove-model').trigger('click');await flushPromises()
        expect(writes(f)).toHaveLength(1)
        await sourceButton(wrapper,'accept-remove-model').trigger('click');await flushPromises()
      }
      expect(instance.isDirty).toBe(false);expect(wrapper.find('.design-detail').exists()).toBe(false)
      expect((await f.open('A')).metadataDataSet.getView('Base_DataModel')!.rows.map(row=>row['rowid'])).toEqual(['M2'])
    }
  })

  it('does not delete a graph model without current row permission or through a stale selection command',async()=>{
    const f=fixture({missing:true,allowDelete:true,denyDeleteIds:['M1']}),{wrapper}=await page(),flow=wrapper.getComponent(VueFlow)
    flow.vm.$emit('nodeClick',{node:flow.props('nodes')!.find(node=>node.data?.title==='Customers')});await flushPromises()
    const command=wrapper.getComponent(RendererGraph).props('toolbar')!.children!.find(item=>typeof item==='object' && item.props?.['data-action']==='remove-graph-selection')
    if(typeof command!=='object')throw new Error('删除动作未进入标准工具栏')
    const old=command.props?.['onClick']
    if(typeof old!=='function')throw new Error('删除动作缺少事件')
    flow.vm.$emit('nodeClick',{node:flow.props('nodes')!.find(node=>node.data?.title==='Orders')});await flushPromises()
    expect(sourceButton(wrapper,'remove-graph-selection').attributes('disabled')).toBeDefined()
    await old();await flushPromises()
    expect(wrapper.find('.design-detail').exists()).toBe(false);expect(writes(f)).toHaveLength(0)
  })

  it.each([false,true])('removes the selected native graph relation only through its original draft and file owner: save=%s',async save=>{
    const f=fixture();await f.open('A')
    const config=JSON.parse(f.stored.get('A')!)
    config.resourceRelations=[{relationId:'R',parentTable:'CustomersAlias',childTable:'OrdersAlias',filterExpression:{field:'parentId',operator:'eq',value:'C'}}]
    f.stored.set('A',JSON.stringify(config))
    const {wrapper,instance}=await page(),flow=wrapper.getComponent(VueFlow)
    flow.vm.$emit('edgeClick',{edge:flow.props('edges')![0]});await flushPromises()
    expect(sourceButton(wrapper,'remove-graph-selection').attributes('disabled'),wrapper.text()).toBeUndefined()
    await sourceButton(wrapper,'remove-graph-selection').trigger('click');await flushPromises()
    expect(instance.isDirty,wrapper.text()).toBe(true);expect(writes(f)).toHaveLength(0);expect(f.fileWrites).toHaveLength(0)
    await sourceButton(wrapper,save?'save-relations':'discard-relations').trigger('click');await flushPromises()
    expect(instance.isDirty,wrapper.text()).toBe(false)
    expect(flow.props('edges')).toHaveLength(save?0:1)
    const reopened=await f.open('A')
    expect(reopened.definitionDataSet!.resourceRelations).toHaveLength(save?0:1)
    expect(f.fileWrites).toHaveLength(save?1:0);expect(writes(f)).toHaveLength(0)
  })

  it.each([false, true])('shows remaining native relation edits after a stored receipt (unknown=%s)', async unknown => {
    const f = fixture(); await f.open('A')
    const config = JSON.parse(f.stored.get('A')!)
    config.resourceRelations = [{relationId: 'R', parentTable: 'CustomersAlias', childTable: 'OrdersAlias', filterExpression: {field: 'parentId', operator: 'eq', value: 'C'}}]
    f.stored.set('A', JSON.stringify(config))
    const {wrapper, instance} = await page(), flow = wrapper.getComponent(VueFlow)
    flow.vm.$emit('edgeDoubleClick', {edge: flow.props('edges')![0]}); await flushPromises()
    await writeBound(wrapper, 'relationId', 'captured-edge')
    const definitions = f.sessions.at(-1)!.metadataDataSet.getView('DataResourceRelationDefinition')!
    const key = definitions.getPkKey(definitions.currentRow!)!, release = f.holdFileResponse()
    if (unknown) f.loseNextFileResponse()
    try {
      await sourceButton(wrapper, 'save-relations').trigger('click'); await flushPromises()
      expect(f.fileWrites).toHaveLength(1)
      definitions.updateEditingValue(key, 'relationId', 'next-edge')
      release(); await flushPromises()
      if (unknown) {
        await sourceButton(wrapper, 'verify-relations').trigger('click'); await flushPromises()
      }
      expect(f.fileWrites).toHaveLength(1)
      expect(definitions.getEditingRow(key)?.['relationId']).toBe('next-edge')
      expect(instance.isDirty).toBe(true)
      expect(wrapper.get('[aria-label="模型关系编辑"]').text()).toContain('仍有修改待保存')
      expect(sourceButton(wrapper, 'save-relations').attributes('disabled')).toBeUndefined()
      expect((await f.open('A')).definitionDataSet!.resourceRelations?.map(item => item.relationId)).toEqual(['captured-edge'])
      await sourceButton(wrapper, 'save-relations').trigger('click'); await flushPromises()
      expect(instance.isDirty).toBe(false); expect(f.fileWrites).toHaveLength(2)
      expect(wrapper.get('[aria-label="模型关系编辑"]').text()).toContain('关系配置已保存并回读确认')
      expect((await f.open('A')).definitionDataSet!.resourceRelations?.map(item => item.relationId)).toEqual(['next-edge'])
      expect(writes(f)).toHaveLength(0)
    } finally {release()}
  }, 15000)

  it('keeps a rejected graph deletion preview visible and permits closing without writes',async()=>{
    const f=fixture({allowDelete:true}),{wrapper,instance}=await page(),flow=wrapper.getComponent(VueFlow)
    flow.vm.$emit('nodeClick',{node:flow.props('nodes')!.find(node=>node.data?.title==='Orders')});await flushPromises()
    await sourceButton(wrapper,'remove-graph-selection').trigger('click');await flushPromises()
    expect(wrapper.get('[aria-label="正式模型删除"] [role="alert"]').text()).toContain('模型仍有视图绑定')
    expect(sourceButton(wrapper,'close-definition').attributes('disabled'),wrapper.text()).toBeUndefined()
    expect(instance.isDirty).toBe(false);expect(writes(f)).toHaveLength(0)
    await sourceButton(wrapper,'close-definition').trigger('click');await flushPromises()
    flow.vm.$emit('nodeDoubleClick',{node:flow.props('nodes')!.find(node=>node.data?.title==='Customers')});await flushPromises()
    expect(wrapper.findComponent(DataSpaceModelEditor).exists()).toBe(true)
  })

  it('deletes converted native graph relations without deleting or reimporting the old database record',async()=>{
    const f=fixture({allowDelete:true,sourceFields:[
      {rowid:'F1',dataModelId:'M1',Name:'rowid',type:'dataModel',IsPKey:1,IsOutput:1},
      {rowid:'F2',dataModelId:'M1',Name:'parentId',type:'dataModel',IsOutput:1},
      {rowid:'F3',dataModelId:'M2',Name:'rowid',type:'dataModel',IsPKey:1,IsOutput:1},
    ],relationRows:[{rowid:'R',parentModId:'M2',childModId:'M1',parentTable:'Customers',childTable:'Orders',depType:'',cascadeDel:0,
      filter:'{"Type":"cond","Field":"parentId","Operator":"equal","ValueFun":{"Type":"GetTableField","Field":"rowid"}}'}]})
    const {wrapper,instance}=await page(),flow=wrapper.getComponent(VueFlow)
    expect(flow.props('edges'),wrapper.text()).toHaveLength(1)
    flow.vm.$emit('edgeClick',{edge:flow.props('edges')![0]});await flushPromises()
    await sourceButton(wrapper,'remove-graph-selection').trigger('click');await flushPromises()
    expect(instance.isDirty).toBe(true);expect(writes(f)).toHaveLength(0);expect(f.fileWrites).toHaveLength(0)
    await wrapper.get('[data-action="save-relations"]').trigger('click');await flushPromises()
    expect(instance.isDirty).toBe(false);expect(flow.props('edges')).toHaveLength(0)
    expect(writes(f)).toHaveLength(0);expect(f.fileWrites).toHaveLength(1)
    const reopened=await f.open('A')
    expect(reopened.definitionDataSet?.resourceRelations).toEqual([])
    expect(reopened.metadataDataSet.getView('Base_DataModel_Relation','default')?.rows).toHaveLength(1)
  })

  it('previews formal deletion without writes and cancellation releases page navigation', async () => {
    const f = fixture({missing: true, allowDelete: true, sourceFields: [{rowid: 'F1', dataModelId: 'M1', Name: 'rowid', type: 'dataModel'}]})
    const {wrapper, instance} = await page()
    const navigation = wrapper.getComponent(RendererTree)
    const navigationView = resolveDataViewKey(navigation.props('dataViewKey'), f.sessions[0]!.metadataDataSet)
    expect(navigation.props('dataSource')).toBeUndefined()
    expect(navigationView).toBeDefined()
    await select(wrapper, 'Orders')
    await previewGraphModelRemoval(wrapper)
    expect(wrapper.text()).toContain('Base_DataModel_Field：1 条')
    expect(instance.isDirty).toBe(true)
    await select(wrapper, 'Customers'); expect(wrapper.text()).toContain('请先取消或核验当前模型删除')
    expect(navigationView?.currentRow?.['id']).toBe(JSON.stringify(['Base_DataModel', 'M1']))
    expect(writes(f)).toHaveLength(0)
    await wrapper.get('[data-action="cancel-remove-model"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false)
    await select(wrapper, 'Customers')
    await sourceButton(wrapper, 'close-definition').trigger('click'); await flushPromises()
    expect(sourceButton(wrapper, 'remove-graph-selection').attributes('disabled')).toBeUndefined()
  })

  it('keeps deletion verification reachable after the selected model row disappeared', async () => {
    const f = fixture({missing: true, allowDelete: true, sourceFields: [{rowid: 'F1', dataModelId: 'M1', Name: 'rowid', type: 'dataModel'}]})
    const {wrapper, instance} = await page()
    await select(wrapper, 'Orders')
    await previewGraphModelRemoval(wrapper)
    f.loseNextResponse()
    await wrapper.get('[data-action="confirm-remove-model"]').trigger('click'); await flushPromises()
    expect(wrapper.find('[data-action="verify-remove-model"]').exists(), wrapper.text()).toBe(true)
    expect(instance.isDirty).toBe(true)
    const count = writes(f).length
    await wrapper.get('[data-action="verify-remove-model"]').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('缺少完整删除回执')
    expect(writes(f)).toHaveLength(count)
    await wrapper.get('[data-action="accept-remove-model"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false)
    expect(wrapper.findAll('[data-design-node]').some(node => node.text() === 'Orders')).toBe(false)
  })

  it('keeps layout recovery reachable after confirmed deletion and does not replay the database write', async () => {
    const f = fixture({missing: true, allowDelete: true, sourceFields: [{rowid: 'F1', dataModelId: 'M1', Name: 'rowid', type: 'dataModel'}]})
    f.stored.set('A', JSON.stringify({scenarioId: 'A', tables: {}, layout: {modelPositions: {M1: {x: 1, y: 2}, M2: {x: 3, y: 4}}}}))
    const {wrapper, instance} = await page()
    await select(wrapper, 'Orders')
    await previewGraphModelRemoval(wrapper)
    expect(wrapper.text()).toContain('布局坐标将在数据库删除确认后单独清理')
    f.loseNextFileResponse()
    await wrapper.get('[data-action="confirm-remove-model"]').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('数据库记录已删除并回读确认')
    expect(instance.isDirty).toBe(true)
    expect(writes(f)).toHaveLength(1); expect(f.fileWrites).toHaveLength(1)
    await wrapper.get('[data-action="resume-remove-model-layout"]').trigger('click'); await flushPromises()
    expect(instance.isDirty, wrapper.text()).toBe(false)
    expect(writes(f)).toHaveLength(1); expect(f.fileWrites).toHaveLength(1)
    expect(wrapper.findAll('[data-design-node]').some(node => node.text() === 'Orders')).toBe(false)
    expect((await f.open('A')).viewState?.config['layout']).toEqual({modelPositions: {M2: {x: 3, y: 4}}})
  })

  it('shows newly discovered dependent records and lets the user adopt the incomplete deletion result', async () => {
    const f = fixture({missing: true, allowDelete: true, sourceFields: [{rowid: 'F1', dataModelId: 'M1', Name: 'rowid', type: 'dataModel'}]})
    const originalFile = JSON.stringify({scenarioId: 'A', tables: {}, layout: {modelPositions: {M1: {x: 1, y: 2}}}})
    f.stored.set('A', originalFile)
    const {wrapper, instance} = await page()
    await select(wrapper, 'Orders')
    await previewGraphModelRemoval(wrapper)
    const dataSet = f.sessions.at(-1)!.metadataDataSet, save = dataSet.saveChanges.bind(dataSet)
    vi.spyOn(dataSet, 'saveChanges').mockImplementation(async args => {
      const result = await save(args)
      f.created.set('Base_DataModel_Field', [{rowid: 'LATE-FIELD', dataSetId: 'A', dataModelId: 'M1', Name: 'late', type: 'dataModel'}])
      return result
    })
    await wrapper.get('[data-action="confirm-remove-model"]').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('LATE-FIELD：新增从属记录仍存在；不在原删除清单')
    expect(wrapper.find('[data-action="resume-remove-model-layout"]').exists()).toBe(false)
    expect(instance.isDirty).toBe(true)
    await wrapper.get('[data-action="verify-remove-model"]').trigger('click'); await flushPromises()
    await wrapper.get('[data-action="accept-remove-model"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false)
    expect(wrapper.text()).toContain('不代表原删除完整成功')
    expect(wrapper.text()).toContain('未归类定义（1）')
    expect(dataSet.getView('Base_DataModel_Field')!.requestState).toBe(RequestState.Idle)
    await select(wrapper, '记录 1 · late · LATE-FIELD')
    expect(wrapper.get('[data-definition-detail]').text()).toContain('LATE-FIELD')
    expect(dataSet.getView('Base_DataModel_Field')!.requestState).toBe(RequestState.Idle)
    expect(writes(f)).toHaveLength(1); expect(f.fileWrites).toHaveLength(0)
    expect(f.stored.get('A')).toBe(originalFile)
    expect((await f.open('A')).metadataDataSet.getView('Base_DataModel_Field')?.rows.some(row => row['rowid'] === 'LATE-FIELD')).toBe(true)
  })

  it('confirms deletion and an independent reopen keeps the other model', async () => {
    const raw = ' {"Type":"GetRefData","RefTableName":"Orders","RefFieldName":"rowid","FkFieldName":"rowid","Extra":false} '
    const f = fixture({missing: true, allowDelete: true, sourceFields: [
      {rowid: 'F1', dataModelId: 'M1', Name: 'rowid', type: 'dataModel'},
      {rowid: 'F3', dataModelId: 'M2', Name: 'rowid', type: 'dataModel', ValueFun: raw},
    ]})
    f.setModelValues({Type: '数据库表', MetaName: 'Orders'}, 'A', 'M1')
    f.setModelValues({Type: '数据库表'}, 'A', 'M2')
    const {wrapper, instance} = await page()
    await select(wrapper, 'Orders')
    await previewGraphModelRemoval(wrapper)
    await wrapper.get('[data-action="confirm-remove-model"]').trigger('click'); await flushPromises()
    expect(instance.isDirty, wrapper.text()).toBe(false)
    const reopened = await page()
    expect(reopened.wrapper.findAll('[data-design-node]').some(node => node.text() === 'Orders')).toBe(false)
    await select(reopened.wrapper, 'Customers')
    expect(reopened.wrapper.getComponent(DataSpaceModelEditor).props('modelId')).toBe('M2')
    expect(f.sessions.at(-1)?.metadataDataSet.getView('Base_DataModel_Field')?.rows.find(row => row['rowid'] === 'F3')?.['ValueFun']).toBe(raw)
    expect(writes(f)).toHaveLength(1); expect(f.fileWrites).toHaveLength(0)
  })

  it.each(['missing', 'unbound', 'unresolved-binding'])('previews an unbound formal model without changing a %s shared view file', async state => {
    const f = fixture({missing: true, readOnly: true, businessRows: {Orders: [{rowid: 'O1', parentId: 'C1'}]}})
    if (state !== 'missing') f.stored.set('A', state === 'unbound' ? '{"scenarioId":"A","tables":{}}'
      : '{"scenarioId":"A","tables":{"Missing":{"modelBinding":{"modelId":"UNKNOWN","modelName":"Unknown"},"views":{"default":{}}}}}')
    const before = f.stored.get('A'), {wrapper, instance} = await page()
    await select(wrapper, 'Orders')
    await sourceButton(wrapper, 'open-model-preview').trigger('click'); await flushPromises()
    const preview = wrapper.getComponent(DataSpaceQueryPreview)
    expect(preview.text()).toContain('模型查询预览')
    const field = preview.findAllComponents(FieldText).find(item => item.props('field') === 'context')!
    await field.get('input').setValue('{"customer":["C1"],"enabled":false}'); await flushPromises()
    expect(f.requests.filter(request => JSON.stringify(request.data).includes('"Name":"Orders"'))).toHaveLength(1)
    const pageSize = preview.getComponent(FieldNumber).get('input')
    await pageSize.setValue('3'); await flushPromises() // Inputs now query through the native multi-input cascade.
    expect(field.get('input').element.value).toBe('{"customer":["C1"],"enabled":false}')
    expect(pageSize.element.value).toBe('3')
    const table = preview.getComponent(RendererTable)
    expect(table.props('dataViewKey')).toBe('A@Orders@default')
    expect(table.getComponent(SourceTable).props('data')).toMatchObject([{rowid: 'O1', parentId: 'C1'}])
    const requests = f.requests.filter(request => JSON.stringify(request.data).includes('"Name":"Orders"'))
    expect(requests).toHaveLength(2) // Each changed parent value refreshes the same result DataView.
    expect(JSON.stringify(requests[1]!.data)).toContain('C1')
    expect(JSON.stringify(requests[0]!.data)).toContain('false')
    expect(f.stored.get('A')).toBe(before); expect(f.fileWrites).toHaveLength(0); expect(writes(f)).toHaveLength(0)
    await sourceButton(preview, 'close-query-preview').trigger('click'); await flushPromises()
    expect(wrapper.findComponent(DataSpaceQueryPreview).exists()).toBe(false)
    expect(instance.isDirty).toBe(false)
  })

  it.each(['source', 'dataProcess'])('opens model preview after a named view switches to %s and releases the workspace on close', async section => {
    const f = fixture({businessRows: {Orders: [{rowid: 'O1', parentId: 'C1'}]}}), {wrapper, instance} = await page()
    await select(wrapper, 'shared')
    await wrapper.get('.node-panel-tabs').get(`#tab-${section}`).trigger('click'); await flushPromises()
    await sourceButton(wrapper, 'open-model-preview').trigger('click'); await flushPromises()
    const preview = wrapper.getComponent(DataSpaceQueryPreview)
    expect(preview.text()).toContain('模型查询预览')
    expect(preview.find('[role="alert"]').exists(), preview.text()).toBe(false)
    await sourceButton(preview, 'run-query-preview').trigger('click'); await flushPromises()
    expect(preview.getComponent(RendererTable).props('dataViewKey')).toBe('A@Orders@default')
    expect(f.requests.some(request => JSON.stringify(request.data).includes('"Name":"Orders"'))).toBe(true)
    await sourceButton(preview, 'close-query-preview').trigger('click'); await flushPromises()
    expect(wrapper.findComponent(DataSpaceQueryPreview).exists()).toBe(false)
    expect(sourceButton(wrapper, 'close-definition').attributes('disabled')).toBeUndefined()
    expect(instance.isDirty).toBe(false); expect(f.fileWrites).toEqual([]); expect(writes(f)).toEqual([])
  })

  it('previews saved formal sorting from the clean default field view without loading a model workspace', async () => {
    const f = fixture({sourceFields: [
      {rowid: 'F1', dataModelId: 'M1', Name: 'rowid', type: 'dataModel', FieldType: 'string', IsPKey: 1, IsOutput: 1},
      {rowid: 'F2', dataModelId: 'M1', Name: 'rank', AsName: 'priority', type: 'dataModel', FieldType: 'number', IsOutput: 1, Order: 4, OrderType: 'descending'},
      {rowid: 'F3', dataModelId: 'M1', Name: 'inactive', type: 'dataModel', FieldType: 'string', IsOutput: 1, Order: 0, OrderType: 'ascending'},
    ], businessRows: {Orders: [{rowid: 'O1', priority: 3, inactive: 'I'}]}})
    const session = await f.open('A'), preview = await session.openModelPreview({modelId: 'M1', modelName: 'Orders'})
    try {
      await preview.query({context: {}})
      const request = [...f.requests].reverse().find(item => JSON.stringify(item.data).includes('"Name":"Orders"'))!
      expect(request.data).toMatchObject({Table: [{Fields: expect.arrayContaining([
        expect.objectContaining({Name: 'rank', OrderType: 'descending', Order: 1}),
        expect.objectContaining({Name: 'inactive', OrderType: null, Order: 0}),
      ])}]})
      expect(session.metadataDataSet.getView('Base_DataModel_Field', 'modelFields')?.rows ?? []).toEqual([])
      expect(preview.view.rows[0]?.['priority']).toBe(3)
    } finally {preview.dispose()}
    expect(f.fileWrites).toEqual([]); expect(writes(f)).toEqual([])
  })

  it('uses descending formal sort priority in model preview and excludes zero priority before and after cancellation', async () => {
    const f = fixture({overviewOnly: true, allowFieldEdit: true, editableFieldProperties: ['Order'], sourceFields: [
      {rowid: 'F1', dataModelId: 'M1', Name: 'rowid', type: 'dataModel', FieldType: 'string', IsPKey: 1, IsOutput: 1},
      {rowid: 'F2', dataModelId: 'M1', Name: 'low', type: 'dataModel', FieldType: 'string', IsOutput: 1, Order: 8, OrderType: 'ascending'},
      {rowid: 'F3', dataModelId: 'M1', Name: 'high', type: 'dataModel', FieldType: 'string', IsOutput: 1, Order: 2, OrderType: 'descending'},
      {rowid: 'F4', dataModelId: 'M1', Name: 'inactive', type: 'dataModel', FieldType: 'string', IsOutput: 1, Order: 0, OrderType: 'ascending'},
    ], businessRows: {Orders: [{rowid: 'O1', low: 'A', high: 'A', inactive: 'Z'}, {rowid: 'O2', low: 'B', high: 'B', inactive: 'A'}]}})
    const session = await f.open('A'), fields = await session.loadModelFields('M1')
    fields.updateEditingValue('F2', 'Order', 1); fields.updateEditingValue('F3', 'Order', 9)
    const preview = await session.openModelPreview({modelId: 'M1', modelName: 'Orders'})
    try {
      await preview.query({context: {}})
      const request = [...f.requests].reverse().find(item => JSON.stringify(item.data).includes('"Name":"Orders"'))!
      expect(request.data).toMatchObject({Table: [{Fields: expect.arrayContaining([
        expect.objectContaining({Name: 'high', OrderType: 'descending', Order: 2}),
        expect.objectContaining({Name: 'low', OrderType: 'ascending', Order: 1}),
        expect.objectContaining({Name: 'inactive', OrderType: null, Order: 0}),
      ])}]})
      expect(preview.view.rows.map(row => row['rowid'])).toEqual(['O2', 'O1'])
    } finally {preview.dispose()}
    fields.discardEditingRows()
    const restored = await session.openModelPreview({modelId: 'M1', modelName: 'Orders'})
    try {
      await restored.query({context: {}})
      const request = [...f.requests].reverse().find(item => JSON.stringify(item.data).includes('"Name":"Orders"'))!
      expect(request.data).toMatchObject({Table: [{Fields: expect.arrayContaining([
        expect.objectContaining({Name: 'low', OrderType: 'ascending', Order: 2}),
        expect.objectContaining({Name: 'high', OrderType: 'descending', Order: 1}),
        expect.objectContaining({Name: 'inactive', OrderType: null, Order: 0}),
      ])}]})
      expect(restored.view.rows.map(row => row['rowid'])).toEqual(['O1', 'O2'])
    } finally {restored.dispose()}
    expect(f.fileWrites).toEqual([]); expect(writes(f)).toEqual([])
  })

  it('previews current field workspace without saving and restores saved columns after cancellation',async()=>{
    const f=fixture({allowFieldEdit:true,editableFieldProperties:['description','IsOutput'],sourceFields:[
      {rowid:'F1',dataModelId:'M1',Name:'rowid',type:'dataModel',FieldType:'string',IsPKey:1,IsOutput:1},
      {rowid:'F2',dataModelId:'M1',Name:'note',type:'dataModel',FieldType:'string',IsPKey:0,IsOutput:1},
    ],businessRows:{Orders:[{rowid:'O1',note:'saved'}]}}),{wrapper,instance}=await page('?scenarioId=A',true)
    await select(wrapper,'Orders')
    await openModelFieldsTab(wrapper)
    const session=f.sessions.at(-1)!,fields=session.metadataDataSet.getView('Base_DataModel_Field','modelFields')!
    fields.updateEditingValue('F1','description','预览标题');fields.updateEditingValue('F2','IsOutput',0);await flushPromises()
    expect(instance.isDirty).toBe(true)
    await sourceButton(wrapper,'open-model-preview').trigger('click');await flushPromises()
    const preview=wrapper.getComponent(DataSpaceQueryPreview)
    expect(preview.find('[role="alert"]').exists(),preview.text()).toBe(false)
    await sourceButton(preview,'run-query-preview').trigger('click');await flushPromises()
    expect(preview.text()).toContain('预览标题')
    const request=[...f.requests].reverse().find(item=>JSON.stringify(item.data).includes('"Name":"Orders"'))!
    expect(JSON.stringify(request.data)).not.toContain('note')
    await sourceButton(preview,'close-query-preview').trigger('click');await flushPromises()
    expect(instance.isDirty).toBe(true);expect(fields.getEditingPatch('F2')).toEqual({IsOutput:0})
    fields.discardEditingRows();await flushPromises()
    const restored=await session.openModelPreview({modelId:'M1',modelName:'Orders'})
    expect(restored.view.columns.map(column=>column.name)).toContain('note');restored.dispose()
    expect(instance.isDirty).toBe(false);expect(f.fileWrites).toEqual([]);expect(writes(f)).toEqual([])
  })

  it('edits model preview request inputs without changing model metadata on close',async()=>{
    const f=fixture({businessRows:{Orders:[{rowid:'O1',parentId:''}]}}),{wrapper,instance}=await page()
    await select(wrapper,'Orders')
    const session=f.sessions.at(-1)!,models=session.metadataDataSet.getView('Base_DataModel')!
    expect(instance.isDirty).toBe(false)
    const button=sourceButton(wrapper,'open-model-preview')
    expect(button.attributes('disabled')).toBeUndefined()
    await button.trigger('click');await flushPromises()
    const preview=wrapper.getComponent(DataSpaceQueryPreview)
    expect(preview.find('[role="alert"]').exists(),preview.text()).toBe(false)
    preview.findAllComponents(FieldRadio).find(c => c.props('field') === 'outputType')!.getComponent(ElRadioGroup).vm.$emit('update:modelValue', 'Join')
    await flushPromises()
    await sourceButton(preview,'run-query-preview').trigger('click');await flushPromises()
    const request=f.requests.filter(item=>JSON.stringify(item.data).includes('"Name":"Orders"')).at(-1)!
    expect(request.data).toMatchObject({Table:[{OutputType:'Join'}]})
    await sourceButton(preview,'close-query-preview').trigger('click');await flushPromises()
    expect(wrapper.findComponent(DataSpaceQueryPreview).exists()).toBe(false)
    expect(models.hasEditingChanges('M1')).toBe(false);expect(instance.isDirty).toBe(false)
    expect(f.fileWrites).toEqual([]);expect(writes(f)).toEqual([])
  })

  it('rejects mismatched model identity and pending metadata before model preview assembly', async () => {
    const f = fixture({missing: true}), session = await f.open('A')
    await expect(session.openModelPreview({modelId: 'M1', modelName: 'Customers'})).rejects.toThrow('MODEL_IDENTITY')
    const models = session.metadataDataSet.getView('Base_DataModel', 'default')!
    models.updateEditingValue('M1', 'description', 'unsaved')
    await expect(session.openModelPreview({modelId: 'M1', modelName: 'Orders'})).rejects.toThrow(/未提交|修改/)
    expect(models.getEditingRow('M1')?.['description']).toBe('unsaved')
    expect(f.requests.filter(request => JSON.stringify(request.data).includes('"Name":"Orders"'))).toHaveLength(0)
    expect(f.stored.size).toBe(0); expect(f.fileWrites).toHaveLength(0); expect(writes(f)).toHaveLength(0)
  })

  it('keeps model preview separate from saved named-view filters and disposes it on session change', async () => {
    const f = fixture({businessRows: {Orders: [{rowid: 'O1', parentId: 'C1'}]}})
    const text = JSON.stringify({scenarioId: 'A', tables: {OrdersAlias: {modelBinding: {modelId: 'M1', modelName: 'Orders'},
      views: {default: {pageSize: 5, filterExpression: {field: 'parentId', operator: 'eq', value: 'VIEW_ONLY'}}}}}})
    f.stored.set('A', text)
    const session = await f.open('A')
    const preview = await session.openModelPreview({modelId: 'M1', modelName: 'Orders'})
    try {
      await preview.query({context: {}})
      const request = f.requests.find(item => JSON.stringify(item.data).includes('"Name":"Orders"'))!
      expect(request).toBeDefined()
      expect(JSON.stringify(request.data)).not.toContain('VIEW_ONLY')
      expect(preview.view.rows).toMatchObject([{rowid: 'O1'}])
      expect(preview.view.fieldAccess(preview.view.rows[0]!, 'parentId').write).toBe('denied')
      expect(f.stored.get('A')).toBe(text)
      session.dispose()
      await expect(preview.query({context: {}})).rejects.toThrow(/PREVIEW_STALE|DISPOSED|destroyed/i)
      expect(preview.disposed).toBe(true)
      expect(f.fileWrites).toHaveLength(0); expect(writes(f)).toHaveLength(0)
    } finally {preview.dispose()}
  })

  it.each(['legacy', 'native'])('previews and cancels a %s binding removal, then saves and reopens without deleting formal metadata', async format => {
    const f = fixture({overviewOnly: format === 'native'})
    if (format === 'native') f.stored.set('A', JSON.stringify({scenarioId: 'A', schemaVersion: 2, resourceRelations: [], tables: {
      OrdersAlias: {modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {default: {}, shared: {pageSize: 12}}},
      CustomersAlias: {modelBinding: {modelId: 'M2', modelName: 'Customers'}, views: {default: {}, shared: {pageSize: 24}}},
      Unavailable: {modelBinding: {modelId: 'UNAVAILABLE', modelName: 'Unavailable'}, views: {default: {}}},
    }}))
    const {wrapper, instance} = await page()
    const before = f.stored.get('A'), metadata = f.sessions[0]!.metadataDataSet
    const modelRows = structuredClone(metadata.getView('Base_DataModel', 'default')!.rows)
    const fieldRows = structuredClone(metadata.getView('Base_DataModel_Field', 'default')!.rows)
    await select(wrapper, 'Orders')
    await select(wrapper, 'shared')
    const editor = wrapper.getComponent(DataSpaceViewEditor)
    await editor.get('[data-action="preview-remove-binding"]').trigger('click'); await flushPromises()
    expect(editor.get('[data-binding-removal]').text()).toContain('OrdersAlias')
    expect(editor.get('[data-binding-removal]').text()).toContain('default、shared')
    expect(instance.isDirty).toBe(true)
    await editor.get('[data-action="cancel-remove-binding"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false); expect(f.stored.get('A')).toBe(before)
    await editor.get('[data-action="preview-remove-binding"]').trigger('click'); await flushPromises()
    await editor.get('[data-action="confirm-remove-binding"]').trigger('click'); await flushPromises()
    expect(editor.text()).toContain('已记录解除绑定')
    expect(editor.find('[data-binding-removal]').exists()).toBe(false)
    expect(f.sessions[0]!.metadataDataSet.getView('DataTableBindingDefinition')!.rows.some(row => row['tableName'] === 'OrdersAlias')).toBe(false)
    expect(f.stored.get('A')).toBe(before); expect(f.fileWrites).toHaveLength(0)
    await editor.get('[data-action="save-views"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false); expect(f.fileWrites).toHaveLength(1); expect(writes(f)).toHaveLength(0)
    if (format === 'native') expect(f.assemblyScopes).toEqual([])
    const reopened = await f.open('A', {deferDefinition: format === 'native'})
    if (format === 'native') {
      expect(reopened.metadataDataSet.getView('DataTableBindingDefinition')!.rows.map(row => row['tableName'])).toEqual(['CustomersAlias', 'Unavailable'])
      const preview = await reopened.openPreview({tableName: 'CustomersAlias', viewId: 'shared', modelId: 'M2', modelName: 'Customers'})
      try {expect(preview.view.pageSize).toBe(24)} finally {preview.dispose()}
    } else {
      expect(reopened.definitionDataSet?.getTable('OrdersAlias')).toBeUndefined()
      expect(reopened.definitionDataSet?.getView('CustomersAlias', 'shared')).toBeDefined()
    }
    expect(metadata.getView('Base_DataModel', 'default')!.rows).toEqual(modelRows)
    expect(metadata.getView('Base_DataModel_Field', 'default')!.rows).toEqual(fieldRows)
    expect(editor.findAllComponents(FieldText).map(field => field.props('field'))).toContain('newTable')
  })

  it('keeps a binding removal draft recoverable and verifies an unknown save without replay', async () => {
    const f = fixture(), {wrapper, instance} = await page()
    await select(wrapper, 'Orders')
    const editor = wrapper.getComponent(DataSpaceViewEditor)
    await editor.get('[data-action="preview-remove-binding"]').trigger('click'); await flushPromises()
    await editor.get('[data-action="confirm-remove-binding"]').trigger('click'); await flushPromises()
    await editor.get('[data-action="preview-remote-views"]').trigger('click'); await flushPromises()
    await editor.get('[data-action="adopt-remote-views"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false)
    await chooseBound(editor, '已有模型绑定', 'OrdersAlias')
    await editor.get('[data-action="preview-remove-binding"]').trigger('click'); await flushPromises()
    await editor.get('[data-action="confirm-remove-binding"]').trigger('click'); await flushPromises()
    f.loseNextFileResponse()
    await editor.get('[data-action="save-views"]').trigger('click'); await flushPromises()
    expect(editor.text()).toContain('文件提交结果未知'); expect(f.fileWrites).toHaveLength(1)
    await editor.get('[data-action="verify-views"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false); expect(f.fileWrites).toHaveLength(1)
    expect((await f.open('A')).definitionDataSet?.getTable('OrdersAlias')).toBeUndefined()
  })

  it('refreshes binding choices after removing one of two bindings for the same model', async () => {
    const f = fixture()
    await f.open('A')
    const config: unknown = JSON.parse(f.stored.get('A')!)
    if (!isRecord(config) || !isRecord(config['tables'])) throw new Error('missing fixture tables')
    config['tables']['OtherOrders'] = structuredClone(config['tables']['OrdersAlias'])
    f.stored.set('A', JSON.stringify(config))
    const {wrapper} = await page()
    await select(wrapper, 'Orders')
    const editor = wrapper.getComponent(DataSpaceViewEditor)
    await chooseBound(editor, '已有模型绑定', 'OrdersAlias')
    await editor.get('[data-action="preview-remove-binding"]').trigger('click'); await flushPromises()
    await editor.get('[data-action="confirm-remove-binding"]').trigger('click'); await flushPromises()
    const choices = (await openBoundSelect(editor, '已有模型绑定')).findAllComponents(ElOption).map(option => option.props('value'))
    expect(choices).toEqual(['OtherOrders'])
    await chooseBound(editor, '已有模型绑定', 'OtherOrders')
    expect(editor.get('[data-action="preview-remove-binding"]').attributes('disabled')).toBeUndefined()
    expect(f.fileWrites).toHaveLength(0); expect(writes(f)).toHaveLength(0)
  })

  it('leaves referenced bindings intact and cancels the rejected removal preview', async () => {
    const f = fixture()
    await f.open('A')
    const config: unknown = JSON.parse(f.stored.get('A')!)
    if (!isRecord(config)) throw new Error('missing fixture config')
    config['viewCascades'] = [{parentTable: 'OrdersAlias', parentViewId: 'shared', childTable: 'CustomersAlias', childViewId: 'default', filterBindings: [{sourceField: 'rowid', targetField: 'rowid'}]}]
    f.stored.set('A', JSON.stringify(config))
    const {wrapper, instance} = await page()
    await select(wrapper, 'Orders')
    const editor = wrapper.getComponent(DataSpaceViewEditor)
    await editor.get('[data-action="preview-remove-binding"]').trigger('click'); await flushPromises()
    await editor.get('[data-action="confirm-remove-binding"]').trigger('click'); await flushPromises()
    expect(editor.get('[role="alert"]').text()).toContain('viewCascades')
    expect(f.sessions.at(-1)!.viewState!.text).toBe(f.stored.get('A'))
    expect(editor.find('[data-binding-removal]').exists()).toBe(true)
    await editor.get('[data-action="cancel-remove-binding"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false); expect(f.fileWrites).toHaveLength(0)
  })

  it('rejects an outdated binding confirmation and protects unsaved view input', async () => {
    const f = fixture(), {wrapper} = await page()
    await select(wrapper, 'Orders')
    const editor = wrapper.getComponent(DataSpaceViewEditor), session = f.sessions[0]!
    await writeBound(editor, 'newName', 'unsaved')
    expect(editor.get('[data-action="preview-remove-binding"]').attributes('disabled')).toBeDefined()
    await editor.get('[data-action="discard-view-edits"]').trigger('click'); await flushPromises()
    await editor.get('[data-action="preview-remove-binding"]').trigger('click'); await flushPromises()
    const definitions = session.metadataDataSet.getView('DataViewDefinition')!
    const definition = definitions.rows.find(row => row['tableName'] === 'OrdersAlias' && row['viewId'] === 'shared')!
    definitions.updateEditingValue(definitions.getPkKey(definition)!, 'pageSize', 67)
    expect((await session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewDefinition', viewId: 'default'}]})).success).toBe(true)
    await editor.get('[data-action="confirm-remove-binding"]').trigger('click'); await flushPromises()
    expect(editor.get('[role="alert"]').text()).toContain('配置已改变')
    expect(session.metadataDataSet.getView('DataViewDefinition')!.rows.find(row => row['tableName'] === 'OrdersAlias' && row['viewId'] === 'shared')?.['pageSize']).toBe(67)
    expect(JSON.parse(session.viewState!.text).tables.OrdersAlias.views.shared.pageSize).toBe(67)
    expect(f.fileWrites).toHaveLength(1)
    await editor.get('[data-action="cancel-remove-binding"]').trigger('click'); await flushPromises()
    expect(session.viewState?.dirty).toBe(false)
    await select(wrapper, 'shared')
    await (await boundNumber(wrapper, 'pageSize')).setValue('38')
    expect(wrapper.getComponent(DataSpaceViewEditor).get('[data-action="preview-remove-binding"]').attributes('disabled')).toBeDefined()
  })

  it('renders only the space and model directory until a definition branch is opened', async () => {
    const f = fixture({unmatchedFieldOwner: true})
    const {wrapper, instance} = await page()
    await sourceButton(wrapper, 'toggle-directory').trigger('click'); await flushPromises()
    const labels = () => wrapper.findAll('[data-design-node]').map(node => node.text())
    expect(labels()).toEqual(['空间 A', '输入参数', '模型（2）', 'Orders', 'Customers', '模型关系', '数据级联', '未归类定义（1）'])
    expect(f.sessions[0]!.metadataDataSet.getView('Base_DataModel_Field', 'default')!.rows).toHaveLength(1)
    expect(wrapper.get('[data-tree-warning]').text()).toContain('字段有 1 条记录')
    await select(wrapper, 'Orders')
    expect(labels()).toContain('数据视图（2）')
    expect(wrapper.findAll('[data-design-node]').find(node => node.text() === '数据视图（2）')!.isVisible()).toBe(true)
    expect(labels()).not.toContain('shared')
    await select(wrapper, '数据视图（2）')
    expect(labels()).toContain('shared')
    await select(wrapper, 'shared')
    expect(wrapper.get('[data-definition-detail]').text()).toContain('12')
    expect(wrapper.findAll('[data-design-node]').find(node => node.text() === 'shared')!.isVisible()).toBe(true)
    await wrapper.get('[data-action="show-unplaced"]').trigger('click'); await flushPromises()
    expect(wrapper.get('.design-detail h2').text()).toBe('未归类定义（1）')
    expect(labels()).toContain('字段（1）')
    expect(labels()).not.toContain('记录 1 · 订单编号 · F1')
    await select(wrapper, '记录 1 · 订单编号 · F1')
    expect(wrapper.get('[data-unplaced-reason]').text()).toContain('保留原记录')
    expect(instance.isDirty).toBe(false)
    expect(writes(f)).toHaveLength(0); expect(f.fileWrites).toHaveLength(0)
  })

  it('creates a query cascade with field and selected-key filters through the page controls', async () => {
    const f = fixture()
    const {wrapper, instance} = await page()
    await select(wrapper, '数据级联')
    const editor = wrapper.getComponent(DataSpaceCascadeEditor)
    await chooseBound(editor, '新级联类型', 'query')
    await writeBound(editor, 'newId', 'query-selection')
    await editor.get('[data-action="add-cascade"]').trigger('click'); await flushPromises()
    expect(editor.text()).toContain('父视图的字段值或选中主键数组形成子视图的过滤条件')
    for (const [label, table, viewId] of [['父查询视图', 'OrdersAlias', 'shared'], ['子查询视图', 'CustomersAlias', 'default']] as const) {
      const picker = bindingPicker(wrapper, label)
      await chooseBound(picker, '模型绑定', table); await flushPromises()
      await chooseBound(picker, '数据视图', viewId); await flushPromises()
    }
    await editor.get('[data-action="add-filter"]').trigger('click'); await flushPromises()
    expect(bindingPicker(wrapper, '查询输入 1').findAll('[role="alert"]').map(item => item.text())).toEqual([])
    expect((await openBoundSelect(bindingPicker(wrapper, '查询输入 1'), '字段')).findAllComponents(ElOption).map(option => option.props('value'))).toContain('parentId')
    await chooseBound(bindingPicker(wrapper, '查询输入 1'), '字段', 'parentId')
    expect(boundSelect(bindingPicker(wrapper, '查询输入 1'), '字段').props('modelValue')).toBe('parentId')
    await chooseBound(bindingPicker(wrapper, '查询目标 1'), '字段', 'parentId')
    await editor.get('[data-action="add-filter"]').trigger('click'); await flushPromises()
    await chooseBound(bindingPicker(wrapper, '查询目标 2'), '字段', 'rowid')
    await editor.get('[data-action="save-cascades"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false)
    expect((await f.open('A')).definitionDataSet?.viewCascades).toEqual([{kind: 'query', cascadeId: 'query-selection',
      parentTable: 'OrdersAlias', parentViewId: 'shared', childTable: 'CustomersAlias', childViewId: 'default',
      filterBindings: [{sourceField: 'parentId', targetField: 'parentId'}, {targetField: 'rowid'}]}])
    expect(f.fileWrites).toHaveLength(1)
  }, 15_000)

  it('edits and saves a scoped cascade from overview with an unrelated invalid view still preserved', async () => {
    const f = fixture({overviewOnly: true, businessRows: {Orders: [{rowid: 'O1', parentId: 'ROOT'}, {rowid: 'O2', parentId: 'O1'}]}}), original = {scenarioId: 'A', tables: {
      OrdersAlias: {modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {default: {}, shared: {}}},
      CustomersAlias: {modelBinding: {modelId: 'M2', modelName: 'Customers'}, views: {default: {sortExpression: [{field: 'missing', direction: 'asc'}]}}},
    }}
    f.stored.set('A', JSON.stringify(original))
    const {wrapper} = await page(), session = f.sessions.at(-1)!
    await select(wrapper, '数据级联')
    expect(session.definitionStatus).toBe('unloaded')
    expect(session.metadataDataSet.getView('Base_DataModel_Field')!.requestState).not.toBe(RequestState.Loaded)
    const editor = wrapper.getComponent(DataSpaceCascadeEditor)
    await chooseBound(editor, '新级联类型', 'query'); await writeBound(editor, 'newId', 'scoped')
    await editor.get('[data-action="add-cascade"]').trigger('click'); await flushPromises()
    for (const [label, viewId] of [['父查询视图', 'shared'], ['子查询视图', 'default']] as const) {
      const picker = bindingPicker(wrapper, label)
      await chooseBound(picker, '模型绑定', 'OrdersAlias'); await chooseBound(picker, '数据视图', viewId)
    }
    await editor.get('[data-action="add-filter"]').trigger('click'); await flushPromises()
    await chooseBound(bindingPicker(wrapper, '查询输入 1'), '字段', 'rowid')
    await chooseBound(bindingPicker(wrapper, '查询目标 1'), '字段', 'parentId')
    await editor.get('[data-action="save-cascades"]').trigger('click'); await flushPromises()
    expect(editor.text()).toContain('级联配置已保存并回读确认')
    expect(JSON.parse(f.stored.get('A')!).tables).toEqual(original.tables)
    expect(f.assemblyScopes).toEqual([['OrdersAlias']])
    expect(session.metadataDataSet.getView('Base_DataModel_Field')!.requestState).not.toBe(RequestState.Loaded)
    expect(f.fileWrites).toHaveLength(1)
    expect((session.metadataDataSet.viewCascades ?? []).some(cascade => cascade.kind === 'field' && cascade.optionsView.tableName === 'DataViewFieldOption'
      && cascade.optionsView.viewId.startsWith('CascadeBinding_'))).toBe(true)
    const reopened = await f.open('A', {deferDefinition: true})
    const preview = await reopened.openPreview({modelId: 'M1', modelName: 'Orders', tableName: 'OrdersAlias', viewId: 'shared'})
    try {
      await preview.query({context: {}})
      await vi.waitFor(() => expect(preview.view.dataSet!.getView('OrdersAlias', 'default')!.rows).toMatchObject([{rowid: 'O2'}]))
      expect(f.fileWrites).toHaveLength(1)
    } finally {preview.dispose(); reopened.dispose()}
  })

  it('edits query parameter inputs and typed enable conditions then reopens and executes the same configuration', async () => {
    const f = fixture({businessRows: {Orders: [{rowid: 'O1', parentId: 2}, {rowid: 'O2', parentId: 3}],
      Customers: [{rowid: 'C1'}, {rowid: 'C2'}, {rowid: 'C3'}]}})
    const {wrapper, instance} = await page()
    await select(wrapper, '数据级联')
    const editor = wrapper.getComponent(DataSpaceCascadeEditor)
    await chooseBound(editor, '新级联类型', 'query'); await writeBound(editor, 'newId', 'query-inputs')
    await editor.get('[data-action="add-cascade"]').trigger('click'); await flushPromises()
    for (const [label, table, viewId] of [['父查询视图', 'OrdersAlias', 'shared'], ['子查询视图', 'CustomersAlias', 'default']] as const) {
      const picker = bindingPicker(wrapper, label)
      await chooseBound(picker, '模型绑定', table); await chooseBound(picker, '数据视图', viewId)
    }
    await editor.get('[data-action="add-query-input"]').trigger('click'); await flushPromises()
    const input = bindingPicker(wrapper, '查询参数 1')
    await chooseBound(input, '字段', 'parentId'); await chooseBound(input, '查询配置目标', 'pageSize')
    await chooseBound(input, '空值处理', 'false')
    await chooseBound(input, '输入参与条件', 'enabled')
    await chooseBound(input, '条件字段', 'rowid'); await writeJsonBound(input, 'equalsValue', 'O1')
    await editor.get('[data-action="add-query-when"]').trigger('click'); await flushPromises()
    const when = bindingPicker(wrapper, '查询启用条件 1')
    await chooseBound(when, '字段', 'parentId'); await writeJsonBound(when, 'equalsValue', 2)
    await chooseBound(editor, '自动加载子查询', 0)
    await editor.get('[data-action="save-cascades"]').trigger('click'); await flushPromises()
    expect(editor.text()).toContain('级联配置已保存并回读确认')
    expect(instance.isDirty).toBe(false)
    const reopened = await f.open('A'), runtime = reopened.definitionDataSet!
    expect(runtime.viewCascades).toEqual([{kind: 'query', cascadeId: 'query-inputs', parentTable: 'OrdersAlias', parentViewId: 'shared',
      childTable: 'CustomersAlias', childViewId: 'default', filterBindings: [], inputBindings: [{sourceField: 'parentId', target: 'pageSize',
        omitEmpty: false, when: {field: 'rowid', equals: 'O1'}}], when: [{field: 'parentId', equals: 2}], autoLoad: false}])
    const parent = runtime.getView('OrdersAlias', 'shared')!, child = runtime.getView('CustomersAlias', 'default')!
    expect((await parent.loadFromServer()).success).toBe(true)
    await child.refresh()
    expect(child.loadingError).toBeNull()
    expect(child.pageSize).toBe(2); expect(child.rows).toHaveLength(2); expect(child.total).toBe(3)
    parent.setCurrentRowById('O2')
    await vi.waitFor(() => expect(child.rows).toEqual([]))
    expect(writes(f)).toHaveLength(0)
    expect(f.stored.get('A')).not.toContain('CascadeBinding_')
  }, 15_000)

  it('edits filter operators and preserves an invalid typed condition draft until explicit cancel', async () => {
    const f = fixture()
    await f.open('A')
    const config = JSON.parse(f.stored.get('A')!)
    f.stored.set('A', JSON.stringify({...config, viewCascades: [{parentTable: 'OrdersAlias', parentViewId: 'shared',
      childTable: 'CustomersAlias', childViewId: 'default', filterBindings: [{sourceField: 'parentId', targetField: 'parentId'}]}]}))
    const {wrapper, instance} = await page()
    await select(wrapper, 'OrdersAlias@shared → CustomersAlias@default')
    const editor = wrapper.getComponent(DataSpaceCascadeEditor)
    const filter = bindingPicker(wrapper, '查询输入 1')
    await chooseBound(filter, '过滤方式', 'contains'); await chooseBound(filter, '空值处理', 'true')
    await editor.get('[data-action="add-query-when"]').trigger('click'); await flushPromises()
    const when = bindingPicker(wrapper, '查询启用条件 1')
    await chooseBound(when, '字段', 'rowid'); await writeJsonBound(when, 'equalsValue', false)
    await editor.get('[data-action="save-cascades"]').trigger('click'); await flushPromises()
    const saved = f.stored.get('A')!
    expect(JSON.parse(saved).viewCascades).toEqual([{parentTable: 'OrdersAlias', parentViewId: 'shared', childTable: 'CustomersAlias', childViewId: 'default',
      filterBindings: [{sourceField: 'parentId', targetField: 'parentId', operator: 'contains', omitEmpty: true}], when: [{field: 'rowid', equals: false}]}])
    const active = bindingPicker(wrapper, '查询启用条件 1')
    await writeJsonBound(active, 'equalsValue', {})
    expect(editor.get('[data-action="save-cascades"]').attributes('disabled')).toBeDefined()
    expect(editor.text()).toContain('条件值')
    expect(instance.isDirty).toBe(true)
    await select(wrapper, '输入参数')
    expect(wrapper.text()).toContain('请先保存或明确处理当前级联草稿')
    expect(f.fileWrites).toHaveLength(1)
    await editor.get('[data-action="discard-cascades"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false); expect(f.stored.get('A')).toBe(saved)
    await select(wrapper, '输入参数')
    expect(Object.keys(f.sessions[1]!.metadataDataSet.tables).some(name => name.startsWith('CascadeBinding_'))).toBe(false)
  })

  it('preserves JSON mappings and prevents removing a sibling from replacing an invalid condition draft', async () => {
    const f = fixture()
    await f.open('A')
    const config = JSON.parse(f.stored.get('A')!), query = {parentTable: 'OrdersAlias', parentViewId: 'shared', childTable: 'CustomersAlias', childViewId: 'default', filterBindings: [],
      inputBindings: [{sourceField: 'parentId', target: 'queryContext', format: 'json', omitEmpty: true}],
      when: [{field: 'rowid', equals: 0}, {field: 'parentId', equals: null}]}
    f.stored.set('A', JSON.stringify({...config, viewCascades: [query]}))
    const {wrapper, instance} = await page()
    await select(wrapper, 'OrdersAlias@shared → CustomersAlias@default')
    const editor = wrapper.getComponent(DataSpaceCascadeEditor), input = bindingPicker(wrapper, '查询参数 1')
    expect(instance.isDirty).toBe(false)
    expect(boundSelect(input, '输入格式').props('modelValue')).toBe('json')
    await chooseBound(input, '字段', 'rowid')
    await writeJsonBound(bindingPicker(wrapper, '查询启用条件 2'), 'equalsValue', [])
    expect(editor.get('[data-action="remove-query-when-0"]').attributes('disabled')).toBeDefined()
    await bindingPicker(wrapper, '查询启用条件 2').get('[data-action="discard-invalid-binding"]').trigger('click'); await flushPromises()
    expect(JSON.parse(bindingPicker(wrapper, '查询启用条件 2').getComponent(JsonTreeEditor).props('modelValue')!)).toEqual({value:null})
    await editor.get('[data-action="remove-query-when-0"]').trigger('click'); await flushPromises()
    await editor.get('[data-action="remove-query-when-0"]').trigger('click'); await flushPromises()
    await editor.get('[data-action="save-cascades"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false)
    const {when: _when, ...withoutConditions} = query
    expect(JSON.parse(f.stored.get('A')!).viewCascades).toEqual([{...withoutConditions, inputBindings: [{...query.inputBindings[0], sourceField: 'rowid'}]}])
  })

  it('preserves a query cascade without an invented identity and verifies an unknown file write without replay', async () => {
    const f = fixture()
    await f.open('A')
    const config: unknown = JSON.parse(f.stored.get('A')!)
    if (!isRecord(config)) throw new Error('fixture config missing')
    const query = {parentTable: 'OrdersAlias', parentViewId: 'shared', childTable: 'CustomersAlias', childViewId: 'default', filterBindings: [{targetField: 'parentId'}]}
    f.stored.set('A', JSON.stringify({...config, viewCascades: [query]}))
    const {wrapper, instance} = await page()
    await select(wrapper, 'OrdersAlias@shared → CustomersAlias@default')
    const editor = wrapper.getComponent(DataSpaceCascadeEditor)
    const definitions = f.sessions.at(-1)!.metadataDataSet.getView('DataViewCascadeDefinition')!
    const form = editor.get('[data-cascade-auto-load]').getComponent(RendererForm)
    expect(resolveDataViewKey(form.props('dataViewKey')!, f.sessions.at(-1)!.metadataDataSet)).toBe(definitions)
    expect(definitions.hasEditingChanges()).toBe(false)
    expect(editor.get('[data-cascade-auto-load]').text()).toContain('未配置（默认加载）')
    await writeBound(editor, 'cascadeId', 'optional-name')
    await writeBound(editor, 'cascadeId', '')
    await chooseBound(editor, '自动加载子查询', 1)
    await editor.get('[data-action="clear-cascade-auto-load"]').trigger('click'); await flushPromises()
    expect(definitions.getEditingRow(definitions.getPkKey(definitions.currentRow!)!)?.['autoLoad']).toBeUndefined()
    await chooseBound(editor, '自动加载子查询', 0)
    f.loseNextFileResponse()
    await editor.get('[data-action="save-cascades"]').trigger('click'); await flushPromises()
    expect(editor.text()).toContain('文件提交结果未知')
    expect(instance.isDirty).toBe(true)
    expect(f.fileWrites).toHaveLength(1)
    await editor.get('[data-action="verify-cascades"]').trigger('click'); await flushPromises()
    expect(editor.text()).toContain('已核验并确认保存结果')
    expect(instance.isDirty).toBe(false)
    expect(f.fileWrites).toHaveLength(1)
    expect((await f.open('A')).definitionDataSet?.viewCascades).toEqual([{...query, autoLoad: false}])
    await select(wrapper, 'OrdersAlias@shared → CustomersAlias@default')
    const reopenedEditor = wrapper.getComponent(DataSpaceCascadeEditor)
    await reopenedEditor.get('[data-action="remove-cascade"]').trigger('click'); await flushPromises()
    await reopenedEditor.get('[data-action="discard-cascades"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false)
    await select(wrapper, 'OrdersAlias@shared → CustomersAlias@default')
    const finalEditor = wrapper.getComponent(DataSpaceCascadeEditor)
    await finalEditor.get('[data-action="remove-cascade"]').trigger('click'); await flushPromises()
    await finalEditor.get('[data-action="save-cascades"]').trigger('click'); await flushPromises()
    expect(finalEditor.text()).toContain('级联配置已保存并回读确认')
    expect((await f.open('A')).definitionDataSet?.viewCascades ?? []).toEqual([])
    expect(writes(f)).toHaveLength(0)
  })

  it.each([false, true])('shows remaining native cascade edits after a stored receipt (unknown=%s)', async unknown => {
    const f = fixture(); await f.open('A')
    const config = JSON.parse(f.stored.get('A')!)
    const query = {parentTable: 'OrdersAlias', parentViewId: 'shared', childTable: 'CustomersAlias', childViewId: 'default', filterBindings: [{targetField: 'parentId'}]}
    f.stored.set('A', JSON.stringify({...config, viewCascades: [query]}))
    const {wrapper, instance} = await page()
    await select(wrapper, 'OrdersAlias@shared → CustomersAlias@default')
    const editor = wrapper.getComponent(DataSpaceCascadeEditor)
    await chooseBound(editor, '自动加载子查询', 0)
    const definitions = f.sessions.at(-1)!.metadataDataSet.getView('DataViewCascadeDefinition')!
    const key = definitions.getPkKey(definitions.currentRow!)!, release = f.holdFileResponse()
    if (unknown) f.loseNextFileResponse()
    try {
      await editor.get('[data-action="save-cascades"]').trigger('click'); await flushPromises()
      expect(f.fileWrites).toHaveLength(1)
      definitions.updateEditingValue(key, 'autoLoad', true)
      release(); await flushPromises()
      if (unknown) {
        await editor.get('[data-action="verify-cascades"]').trigger('click'); await flushPromises()
      }
      expect(f.fileWrites).toHaveLength(1)
      expect(definitions.getEditingRow(key)?.['autoLoad']).toBe(true)
      expect(instance.isDirty).toBe(true)
      expect(editor.text()).toContain('仍有修改待保存')
      expect(editor.get('[data-action="save-cascades"]').attributes('disabled')).toBeUndefined()
      expect((await f.open('A')).definitionDataSet!.viewCascades).toEqual([{...query, autoLoad: false}])
      await editor.get('[data-action="save-cascades"]').trigger('click'); await flushPromises()
      expect(instance.isDirty).toBe(false); expect(f.fileWrites).toHaveLength(2)
      expect(editor.text()).toContain('级联配置已保存并回读确认')
      expect((await f.open('A')).definitionDataSet!.viewCascades).toEqual([{...query, autoLoad: true}])
      expect(writes(f)).toHaveLength(0)
    } finally {release()}
  }, 15000)

  it('retains invalid downstream references on model changes and cancels all temporary binding state', async () => {
    const f = fixture()
    await f.open('A')
    const config: unknown = JSON.parse(f.stored.get('A')!)
    if (!isRecord(config) || !isRecord(config['tables']) || !isRecord(config['tables']['OrdersAlias'])
      || !isRecord(config['tables']['OrdersAlias']['views'])) throw new Error('fixture config missing')
    config['tables']['OrdersAlias']['views']['private'] = {}
    const cascade = {kind: 'field', cascadeId: 'retain-reference', tableName: 'OrdersAlias', viewId: 'private', targetField: 'parentId',
      valueFormat: 'native', valuePolicy: {mode: 'retain'}, optionsView: {tableName: 'CustomersAlias', viewId: 'default'},
      parents: [{tableName: 'CustomersAlias', viewId: 'shared', parameter: 'ids'}]}
    f.stored.set('A', JSON.stringify({...config, viewCascades: [cascade]}))
    const before = f.stored.get('A')
    const {wrapper, instance} = await page()
    await select(wrapper, 'retain-reference')
    const editor = wrapper.getComponent(DataSpaceCascadeEditor)
    const picker = bindingPicker(wrapper, '子字段')
    expect((await openBoundSelect(picker, '字段')).findAllComponents(ElOption).map(option => option.props('value'))).not.toContain('rowid')
    await chooseBound(picker, '模型绑定', 'CustomersAlias'); await flushPromises()
    expect(boundSelect(picker, '数据视图').props('modelValue')).toBe('private')
    expect(boundSelect(picker, '字段').props('modelValue')).toBe('parentId')
    expect(picker.text()).toContain('private（失效引用）')
    await editor.get('[data-action="save-cascades"]').trigger('click'); await flushPromises()
    expect(f.fileWrites).toHaveLength(0)
    expect(instance.isDirty).toBe(true)
    expect(editor.find('[role="alert"]').exists()).toBe(true)
    await editor.get('[data-action="discard-cascades"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false)
    expect(f.stored.get('A')).toBe(before)
    await select(wrapper, '输入参数')
    expect(Object.keys(f.sessions[1]!.metadataDataSet.tables).some(name => name.startsWith('CascadeBinding_'))).toBe(false)
  })

  it('discards a new cascade without selecting its removed definition row',async()=>{
    const f=fixture(),{wrapper,instance}=await page();await select(wrapper,'数据级联')
    const editor=wrapper.getComponent(DataSpaceCascadeEditor)
    await writeBound(editor,'newId','cancel-new');await editor.get('[data-action="add-cascade"]').trigger('click');await flushPromises()
    const view=f.sessions[0]!.metadataDataSet.getView('DataViewCascadeDefinition')!,selectRow=vi.spyOn(view,'setCurrentRowById')
    try {
      await editor.get('[data-action="discard-cascades"]').trigger('click');await flushPromises()
      expect(selectRow.mock.results.some(result=>result.type==='return'&&result.value===false)).toBe(false)
      expect(view.rows.some(row=>row['cascadeId']==='cancel-new')).toBe(false)
      expect(instance.isDirty).toBe(false);expect(f.fileWrites).toHaveLength(0);expect(writes(f)).toHaveLength(0)
    }finally{selectRow.mockRestore()}
  })

  it.each(['native', 'selection-string'])('saves explicit clear-value types for %s and isolates a second target', async valueFormat => {
    const f = fixture()
    await f.open('A')
    const config: unknown = JSON.parse(f.stored.get('A')!)
    if (!isRecord(config)) throw new Error('fixture config missing')
    f.stored.set('A', JSON.stringify({...config, viewCascades: [{kind: 'field', cascadeId: 'clear-explicit', tableName: 'OrdersAlias', viewId: 'default', targetField: 'parentId',
      valueFormat, valuePolicy: {mode: 'retain'}, optionsView: {tableName: 'CustomersAlias', viewId: 'default'},
      parents: [{tableName: 'CustomersAlias', viewId: 'shared', parameter: 'ids'}]}]}))
    const {wrapper, instance} = await page()
    await select(wrapper, 'clear-explicit')
    const editor = wrapper.getComponent(DataSpaceCascadeEditor)
    await chooseBound(editor, '子值更新策略', 'retain-valid')
    await editor.get('[data-action="edit-clear-value"]').trigger('click')
    await writeJsonBound(editor, 'clearValue', {})
    await editor.get('[data-action="apply-clear-value"]').trigger('click')
    expect(editor.get('[data-action="save-cascades"]').attributes('disabled')).toBeDefined()
    expect(editor.text()).toContain('清空值须为')
    await writeJsonBound(editor, 'clearValue', false)
    await editor.get('[data-action="cancel-clear-value"]').trigger('click')
    await editor.get('[data-action="edit-clear-value"]').trigger('click')
    expect(JSON.parse(editor.getComponent(JsonTreeEditor).props('modelValue')!)).toEqual({value:null})
    if(valueFormat==='selection-string'){
      await writeJsonBound(editor, 'clearValue', [0,false,'a,b'])
      await editor.get('[data-action="apply-clear-value"]').trigger('click')
      expect(editor.text()).toContain('选中值字符串格式只接受')
    }
    await writeJsonBound(editor, 'clearValue', valueFormat === 'native' ? [0,false,'a,b'] : 'a,b')
    await editor.get('[data-action="apply-clear-value"]').trigger('click')
    await editor.get('[data-action="save-cascades"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false)
    expect((await f.open('A')).definitionDataSet?.viewCascades?.[0]).toMatchObject({valueFormat, valuePolicy: {mode: 'retain-valid', clearValue: valueFormat === 'native' ? [0, false, 'a,b'] : 'a,b'}})
    expect((await f.open('B')).definitionDataSet?.viewCascades ?? []).toEqual([])
    expect(f.fileWrites.map(write => write.targetId)).toEqual(['A'])
  })

  it('edits a multi-input field cascade through the metadata space and reopens the saved native definition', async () => {
    const f = fixture({businessRows: {Orders: [{rowid: 'O1', parentId: 'C1'}], Customers: [{rowid: 'C1', parentId: 'group'}]}})
    const {wrapper, instance} = await page()
    await select(wrapper, '数据级联')
    const editor = wrapper.getComponent(DataSpaceCascadeEditor)
    await writeBound(editor, 'newId', 'customer-options')
    await editor.get('[data-action="add-cascade"]').trigger('click'); await flushPromises()
    async function binding(label: string, table: string, view: string, field?: string) {
      const picker = bindingPicker(wrapper, label)
      await chooseBound(picker, '模型绑定', table); await flushPromises()
      await chooseBound(picker, '数据视图', view); await flushPromises()
      if (field !== undefined) await chooseBound(picker, '字段', field)
      await flushPromises()
    }
    await binding('子字段', 'OrdersAlias', 'default', 'parentId')
    await binding('子选项来源', 'CustomersAlias', 'default')
    await editor.get('[data-action="add-parent"]').trigger('click'); await flushPromises()
    await binding('父输入 1', 'OrdersAlias', 'shared', 'parentId')
    await writeBound(bindingPicker(wrapper, '父输入 1'), 'parameter', 'customer')
    await editor.get('[data-action="add-parent"]').trigger('click'); await flushPromises()
    await binding('父输入 2', 'CustomersAlias', 'shared')
    await writeBound(bindingPicker(wrapper, '父输入 2'), 'parameter', 'selectedIds')
    const metadata = f.sessions[0]!.metadataDataSet
    const definitionView = metadata.getView('DataViewCascadeDefinition', 'default')!
    for (const form of editor.findAllComponents(RendererForm)) {
      expect(form.props('dataSource')).toBeUndefined()
      expect(form.props('contextDataMember')).toBe('currentRow')
      expect(resolveDataViewKey(form.props('dataViewKey'), metadata)).toBeDefined()
    }
    expect(editor.findAllComponents(RendererForm).some(form => resolveDataViewKey(form.props('dataViewKey'), metadata) === definitionView)).toBe(true)
    const endpointForm = bindingPicker(wrapper, '子字段').getComponent(RendererForm)
    expect(resolveDataViewKey(endpointForm.props('dataViewKey'), metadata)?.dataSet).toBe(metadata)
    expect(editor.findAllComponents(RendererButton).some(button => button.attributes('data-action') === 'save-cascades')).toBe(true)
    expect(definitionView.getEditingRow(definitionView.getPkKey(definitionView.rows[0]!)!)?.['tableName']).toBe('OrdersAlias')
    expect(instance.isDirty).toBe(true)
    await select(wrapper, '输入参数')
    expect(wrapper.text()).toContain('请先保存或明确处理当前级联草稿')
    await editor.get('[data-action="save-cascades"]').trigger('click'); await flushPromises()
    expect(editor.text()).toContain('级联配置已保存并回读确认')
    expect(instance.isDirty).toBe(false)
    expect(f.fileWrites).toHaveLength(1)
    const reopened = await f.open('A')
    expect(reopened.definitionDataSet?.viewCascades).toEqual([{kind: 'field', cascadeId: 'customer-options',
      tableName: 'OrdersAlias', viewId: 'default', targetField: 'parentId', valueFormat: 'native', valuePolicy: {mode: 'retain'},
      parents: [{tableName: 'OrdersAlias', viewId: 'shared', field: 'parentId', parameter: 'customer'},
        {tableName: 'CustomersAlias', viewId: 'shared', parameter: 'selectedIds'}], optionsView: {tableName: 'CustomersAlias', viewId: 'default'}}])
    expect(f.stored.get('A')).not.toContain('CascadeBinding')
    const runtime = reopened.definitionDataSet!
    for (const [table, viewId] of [['OrdersAlias', 'shared'], ['CustomersAlias', 'shared'], ['OrdersAlias', 'default']]) {
      expect((await runtime.getView(table!, viewId!)!.loadFromServer()).success).toBe(true)
    }
    expect(await runtime.refreshFieldCascade({tableName: 'OrdersAlias', viewId: 'default', field: 'parentId'}))
      .toMatchObject({status: 'ready', valueStatus: 'valid', options: [{rowid: 'C1'}]})
    expect(runtime.getView('OrdersAlias', 'default')!.getEditingRow('O1')?.['parentId']).toBe('C1')
    expect(f.requests.some(request => isRecord(request.data) && JSON.stringify(request.data).includes('"inputParams":[{"Name":"customer","Value":"C1"},{"Name":"selectedIds","Value":["C1"]}]'))).toBe(true)
    expect(writes(f)).toHaveLength(0)
  }, 15_000)

  // 完整来源替换包含预览、字段映射、批量保存、独立重开和视图切换；仅本集成用例使用10秒预算。
  it('switches a table to a database view through bound source controls and retains the session with its new native resource', async () => {
    const source = {type: 'databaseView' as const, id: 'NEXT', name: 'NewView', description: '视图来源', dbid: 'DB2', databaseName: 'new', providerId: ''}
    const field = {type: 'dataModel' as const, Name: 'rowid', description: 'ID', FieldType: 'varchar', IsPKey: 1, IsOutput: 1,
      AsName: '', ValueFun: '', Expression: '', allowAIAdd: 0, OrderType: '', Order: 0, Group: 0}
    const f = fixture({overviewOnly: true, allowSourceEdit: true, formalProjection: true,
      sourceFields: [{...field, rowid: 'F1', dataModelId: 'M1'}], businessRows: {Orders: [{rowid: 'ORDER'}]},
      modelSources: {query: async () => ({rows: [source], total: 1}), prepare: async () => ({source,
        model: {Type: '数据库视图', MetaName: source.name, description: source.description, DbId: 'DB2', DbName: 'new',
          JoinType: '', ForeignKeyFields: '', JoinFilter: '', PId: ''}, fields: [field]})}})
    const {wrapper, instance} = await page()
    await select(wrapper, 'Orders')
    const editor = wrapper.getComponent(DataSpaceModelSource)
    await openSourcePicker(editor); await chooseBound(editor, '来源类型', 'databaseView')
    await previewSource(editor, f.sessions[0]!.metadataDataSet)
    expect(sourceButton(editor, 'replace-source').attributes('disabled')).toBeUndefined()
    await sourceButton(editor, 'replace-source').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false); expect(writes(f)).toHaveLength(1); expect(f.fileWrites).toHaveLength(0)
    expect(f.sessions).toHaveLength(1); expect(f.modelRow()).toMatchObject({Type: '数据库视图', Name: 'Orders', MetaName: 'NewView'})
    const session = f.sessions[0]!
    await session.loadDefinition()
    const view = resolveDataViewKey('A@Orders@shared', session.definitionDataSet!)!
    expect(view.dataTable?.resourceType).toBe('database-view')
    expect((await view.loadFromServer()).success).toBe(true); expect(view.rows[0]?.['rowid']).toBe('ORDER')
  }, 10_000)

  it.each([false, true])('binds replacement deletion and new source parameters through standard views (parameter=%s)', async parameter => {
    const source = {type: parameter ? 'interface' as const : 'table' as const, id: 'NEXT', name: 'NewSource', description: '', dbid: 'DB2', databaseName: 'new', providerId: ''}
    const field = {type: 'dataModel' as const, Name: 'rowid', description: 'ID', FieldType: 'varchar', IsPKey: 1, IsOutput: 1,
      AsName: '', ValueFun: '', Expression: '', allowAIAdd: 0, OrderType: '', Order: 0, Group: 0}
    const f = fixture({overviewOnly: true, allowSourceEdit: true, allowDelete: true, allowFieldAdd: true,
      sourceFields: [{...field, rowid: 'F1', dataModelId: 'M1'}, {...field, rowid: 'F2', dataModelId: 'M1', Name: 'obsolete', IsPKey: 0, IsOutput: 0}],
      modelSources: {query: async () => ({rows: [source], total: 1}), prepare: async () => ({source,
        model: {Type: parameter ? '接口' : '数据库表', MetaName: source.name, description: '', DbId: 'DB2', DbName: 'new', JoinType: '', ForeignKeyFields: '', JoinFilter: '', PId: ''},
        fields: [field, ...parameter ? [{...field, type: 'inputParams' as const, Name: 'customerArg', IsPKey: 0, IsOutput: 0}] : []]})}})
    if (parameter) f.setModelValues({Type: '接口'})
    const {wrapper, instance} = await page()
    await select(wrapper, 'Orders')
    const session = f.sessions[0]!, loadInputs = vi.spyOn(session, 'loadSourceInputFields')
    const editor = wrapper.getComponent(DataSpaceModelSource)
    await openSourcePicker(editor)
    if (parameter) await chooseBound(editor, '来源类型', 'interface')
    await previewSource(editor, f.sessions[0]!.metadataDataSet)
    const removal = editor.findAllComponents(FieldCheckbox).find(field => field.props('label') === '移除旧字段 obsolete')
    expect(removal).toBeDefined()
    expect(Object.hasOwn(removal!.vm.$.vnode.props ?? {}, 'modelValue')).toBe(false)
    await removal!.get('input[type="checkbox"]').setValue(true); await flushPromises()
    if (parameter) {
      const input = editor.getComponent(FieldValueFunction)
      expect(input.props('modelValue')).toBeUndefined()
      expect(resolveDataViewKey(input.props('inputParameterDataViewKey'), f.sessions[0]!.metadataDataSet)?.rows).toContainEqual(expect.objectContaining({value: 'customer'}))
      await input.get('button').trigger('click'); await flushPromises()
      const dialog = input.getComponent(FilterValueFunctionDialog)
      dialog.getComponent(ElTabs).vm.$emit('update:modelValue', 'GetInputParam'); await flushPromises()
      dialog.findAllComponents(ElSelect)[0]!.vm.$emit('update:modelValue', 'customer')
      await new DOMWrapper(document.body).get('[data-function-confirm]').trigger('click'); await flushPromises()
    }
    expect(sourceButton(editor, 'replace-source').attributes('disabled')).toBeUndefined()
    await sourceButton(editor, 'replace-source').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false); expect(writes(f)).toHaveLength(1)
    expect(f.sessions).toHaveLength(1)
    const rows = session.metadataDataSet.getView('Base_DataModel_Field', 'modelFields')!.rows
    expect(rows.some(row => row['Name'] === 'obsolete')).toBe(false)
    if (parameter) {
      const inputs = session.metadataDataSet.getView('Base_DataModel_Field', 'sourceInputFields')!
      expect(inputs.requestState).toBe(RequestState.Loaded)
      const original = '{"Type":"GetInputParam","ParamName":"customer"}', next = '{"Type":"GetConstValue","Value":"after-replacement"}'
      expect(inputs.rows).toContainEqual(expect.objectContaining({Name: 'customerArg', type: 'inputParams', IsOutput: 0, ValueFun: original}))
      const modelEditor = wrapper.getComponent(DataSpaceModelEditor)
      expect(modelEditor.get('.request-source-inputs').text()).toContain('customerArg')
      expect(loadInputs).toHaveBeenCalledTimes(1)
      const id = String(inputs.getPkKey(inputs.rows.find(row => row['Name'] === 'customerArg')!))
      inputs.updateEditingValue(id, 'ValueFun', next); await flushPromises()
      await modelEditor.get('[data-action="cancel-model"]').trigger('click'); await flushPromises()
      expect(inputs.getEditingRow(id)?.['ValueFun']).toBe(original)
      expect(writes(f)).toHaveLength(1); expect(instance.isDirty).toBe(false)
      expect(loadInputs).toHaveBeenCalledTimes(1)
      inputs.updateEditingValue(id, 'ValueFun', next); await flushPromises()
      await wrapper.get('[data-action="save-model-workspace"]').trigger('click'); await flushPromises()
      expect(writes(f)).toHaveLength(2); expect(instance.isDirty).toBe(false)
      expect(writes(f)[1]?.data).toEqual([expect.objectContaining({TableName: 'Base_DataModel_Field', CrudModel: expect.objectContaining({
        Added: [], Deleted: [], Changed: [expect.objectContaining({rowid: id, ValueFun: next})],
      })})])
      const reopened = await f.open('A')
      expect((await reopened.loadSourceInputFields('M1')).getEditingRow(id)?.['ValueFun']).toBe(next)
    }
  }, 15_000)

  it.each([false, true])('maps a source field and adds an explicitly selected output, then shows the updated model (overview=%s)', async overviewOnly => {
    const source = {type: 'table' as const, id: 'NEXT', name: 'NewSource', description: '', dbid: 'DB2', databaseName: 'new', providerId: ''}
    const field = {type: 'dataModel' as const, Name: 'rowid', description: 'ID', FieldType: 'varchar', IsPKey: 1, IsOutput: 1,
      AsName: '', ValueFun: '', Expression: '', allowAIAdd: 0, OrderType: '', Order: 0, Group: 0}
    const f = fixture({overviewOnly, allowSourceEdit: true, allowFieldEdit: true, allowFieldAdd: true, allowRelationEdit: true,
      sourceFields: [{...field, rowid: 'F1', dataModelId: 'M1'}, {...field, rowid: 'F2', dataModelId: 'M1', Name: 'parentId', IsPKey: 0,
        ValueFun: '{"Type":"GetTableField","Field":"parentId"}'},
        {...field, rowid: 'C1', dataModelId: 'M1', Name: 'display', AsName: 'caption', FieldType: '计算字段', IsPKey: 0,
          ValueFun: '{"Type":"GetTableField","Field":"parentId"}'}],
      relationRows: [{rowid: 'R', parentModId: 'M2', childModId: 'M1', parentTable: 'Customers', childTable: 'Orders', depType: '', cascadeDel: 0,
        filter: '{"Type":"cond","Field":"parentId","Operator":"equal","ValueFun":{"Type":"GetTableField","Field":"rowid"}}'}],
      modelSources: {query: async () => ({rows: [source], total: 1}), prepare: async () => ({source, model: {Type: '数据库表', MetaName: source.name,
        description: '', DbId: 'DB2', DbName: 'new', JoinType: '', ForeignKeyFields: '', JoinFilter: '', PId: ''},
      fields: [field, {...field, Name: 'parentCode', IsPKey: 0}, {...field, Name: 'extra', IsPKey: 0}]})}})
    f.setModelValues({parentField: 'parentId', hasChildField: 'hasChildren',
      Filter: '{"Type":"cond","Field":"parentId","Operator":"equal","ValueFun":{"Type":"GetInputParam","ParamName":"customer"}}'})
    const {wrapper, instance} = await page()
    await select(wrapper, 'Orders')
    const editor = wrapper.getComponent(DataSpaceModelSource)
    await openSourcePicker(editor)
    await flushPromises()
    await previewSource(editor, f.sessions[0]!.metadataDataSet)
    expect(sourceButton(editor, 'replace-source').attributes('disabled')).toBeDefined()
    const mapping = editor.findAllComponents(FieldSelect).find(field => field.props('label') === '来源字段 parentId')!
    expect(mapping.props('options')).toBeUndefined()
    expect((await openBoundSelect(editor, '来源字段 parentId')).findAllComponents(ElOption).map(option => option.props('value'))).toContain('rowid')
    expect(sourcePreviewDom().text()).toContain('parentId（来源缺失或合同不符，原值保留）')
    await chooseBound(editor, '来源字段 parentId', 'parentCode')
    const addition = editor.findAllComponents(FieldCheckbox).find(field => field.props('label') === '引入字段 extra')!
    expect(Object.hasOwn(addition.vm.$.vnode.props ?? {}, 'modelValue')).toBe(false)
    await addition.get('input[type="checkbox"]').setValue(true); await flushPromises()
    expect(sourcePreviewDom().text()).toContain('保留记录ID及输出名 parentId')
    expect(sourcePreviewDom().get('[aria-label="关系引用迁移"]').text()).toContain('parentId')
    expect(sourcePreviewDom().get('[aria-label="关系引用迁移"]').text()).toContain('parentCode')
    expect(sourcePreviewDom().get('[aria-label="模型字段引用迁移"]').text()).toContain('父字段parentIdparentCode')
    expect(sourcePreviewDom().get('[aria-label="模型表达式迁移"]').text()).toContain('Orders · Filter')
    expect(sourcePreviewDom().get('[aria-label="模型表达式迁移"]').text()).toContain('parentCode')
    expect(sourcePreviewDom().get('[aria-label="字段取值引用迁移"]').text()).toContain('parentId')
    expect(sourcePreviewDom().get('[aria-label="字段取值引用迁移"]').text()).toContain('parentCode')
    expect(sourcePreviewDom().get('[aria-label="字段取值引用迁移"]').text()).toContain('display')
    expect(sourcePreviewDom().text()).toContain('保留计算字段及配置')
    await sourceButton(editor, 'replace-source').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false)
    expect(f.sessions).toHaveLength(1)
    expect(f.sessions[0]!.metadataDataSet.destroyed).toBe(false)
    expect(wrapper.text()).not.toContain('DATA_SPACE_MODEL_CONTEXT')
    expect((await f.sessions[0]!.loadModelFields('M1')).rows).toHaveLength(4)
    expect(f.sessions[0]!.metadataDataSet.getView('Base_DataModel_Field')!.requestState).toBe(RequestState.Idle)
    expect(wrapper.text()).toContain('字段（未加载）')
    expect(f.modelRow()).toMatchObject({parentField: 'parentCode', hasChildField: 'hasChildren'})
    const reopened = await f.open('A')
    expect((await reopened.loadModelFields('M1')).rows.find(row => row['rowid'] === 'F2'))
      .toMatchObject({Name: 'parentCode', AsName: 'parentId', ValueFun: '{"Type":"GetTableField","Field":"parentCode"}'})
    expect((await reopened.loadModelFields('M1')).rows.find(row => row['rowid'] === 'C1'))
      .toMatchObject({Name: 'display', AsName: 'caption', FieldType: '计算字段', ValueFun: '{"Type":"GetTableField","Field":"parentCode"}'})
    await select(wrapper, 'shared')
    expect(wrapper.get('[data-definition-detail]').text()).toContain('parentId')
    expect(f.fileWrites).toHaveLength(0)
    expect(JSON.stringify(writes(f))).not.toContain('ModelSourceControls_')
  }, 10000)

  it.each(['interface', 'logicView'] as const)('corrects a source synchronization conflict and binds new %s parameters through the standard editor', async type => {
    const source = {type, id: 'RESOURCE', name: 'OrderSource', description: '当前来源', dbid: '', databaseName: '', providerId: 'PROVIDER'}
    const field = {type: 'dataModel' as const, Name: 'rowid', description: 'ID', FieldType: 'varchar', IsPKey: 1, IsOutput: 1,
      AsName: '', ValueFun: '', Expression: '', allowAIAdd: 0, OrderType: '', Order: 0, Group: 0}
    let incompatible = true
    const f = fixture({overviewOnly: true, deferDefinition: true, formalSourceInputs: true, allowSourceEdit: true, allowFieldAdd: true,
      sourceFields: [{...field, rowid: 'F1', dataModelId: 'M1'}], businessRows: {Orders: [{rowid: 'RESULT'}]},
      modelSources: {query: async () => ({rows: [source], total: 1}), prepare: async () => ({source, model: {
        Type: type === 'interface' ? '接口' : '视图', MetaName: source.name, description: source.description,
        DbId: type === 'interface' ? source.providerId : source.id, DbName: '', JoinType: '', ForeignKeyFields: '', JoinFilter: '', PId: ''},
        fields: [{...field, FieldType: incompatible ? 'int' : 'varchar'}, {...field, type: 'inputParams', Name: 'newArg', IsPKey: 0, IsOutput: 0}]})}})
    f.setModelValues({Type: type === 'interface' ? '接口' : '视图', DbId: type === 'interface' ? source.providerId : source.id})
    const {wrapper, instance} = await page(); await select(wrapper, 'Orders')
    const editor = wrapper.getComponent(DataSpaceModelSource)
    await sourceButton(editor, 'sync-source').trigger('click'); await flushPromises()
    expect(sourcePreviewDom().text()).toContain('varchar → int')
    expect(sourceButton(editor, 'confirm-sync-source').attributes('disabled')).toBeDefined()
    await sourceButton(editor, 'cancel-create').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false); expect(writes(f)).toHaveLength(0)
    expect((await f.sessions[0]!.loadModelFields('M1')).rows[0]?.['FieldType']).toBe('varchar')
    incompatible = false
    await sourceButton(editor, 'sync-source').trigger('click'); await flushPromises()
    expect(sourcePreviewDom().text()).not.toContain('varchar → int')
    expect(sourceButton(editor, 'confirm-sync-source').attributes('disabled')).toBeDefined()
    const input = editor.getComponent(FieldValueFunction)
    expect(input.props('modelValue')).toBeUndefined()
    expect(resolveDataViewKey(input.props('inputParameterDataViewKey'), f.sessions[0]!.metadataDataSet)?.rows).toContainEqual(expect.objectContaining({value: 'customer'}))
    await input.get('button').trigger('click'); await flushPromises()
    const dialog = input.getComponent(FilterValueFunctionDialog)
    dialog.getComponent(ElTabs).vm.$emit('update:modelValue', 'GetInputParam'); await flushPromises()
    dialog.findAllComponents(ElSelect)[0]!.vm.$emit('update:modelValue', 'customer')
    await new DOMWrapper(document.body).get('[data-function-confirm]').trigger('click'); await flushPromises()
    expect(sourceButton(editor, 'confirm-sync-source').attributes('disabled')).toBeUndefined()
    await sourceButton(editor, 'confirm-sync-source').trigger('click'); await flushPromises()
    expect(writes(f)).toHaveLength(1); expect(instance.isDirty).toBe(false); expect(f.sessions).toHaveLength(1)
    expect(f.sessions[0]!.metadataDataSet.destroyed).toBe(false)
    const reopened = f.sessions[0]!
    expect((await reopened.loadSourceInputFields('M1')).rows).toContainEqual(expect.objectContaining({
      Name: 'newArg', ValueFun: '{"Type":"GetInputParam","ParamName":"customer"}', IsOutput: 0,
    }))
    await reopened.loadDefinition()
    const view = resolveDataViewKey('A@Orders@shared', reopened.definitionDataSet!)!
    expect((await view.loadFromServer({context: {customer: 'C10'}})).success).toBe(true)
    expect(view.rows[0]?.['rowid']).toBe('RESULT')
    expect(f.requests.map(request => request.data).filter(isRecord).flatMap(data => Array.isArray(data['Table']) ? data['Table'].filter(isRecord) : [])
      .filter(table => table['Name'] === 'Orders').at(-1)?.['inputParams']).toContainEqual({Name: 'newArg', Value: 'C10'})
    expect(f.fileWrites).toHaveLength(0)
  }, 10_000)

  it.each([false, true])('maps a changed replacement contract through standard views and reopens it (lost=%s)', async lost => {
    const source = {type: 'databaseView' as const, id: 'RESOURCE', name: 'NextView', description: '替换来源', dbid: 'DB2', databaseName: 'new', providerId: ''}
    const field = {type: 'dataModel' as const, Name: 'rowid', description: 'ID', FieldType: 'varchar', IsPKey: 1, IsOutput: 1,
      AsName: '', ValueFun: '', Expression: '', allowAIAdd: 0, OrderType: '', Order: 0, Group: 0}
    const f = fixture({overviewOnly: true, deferDefinition: true, formalProjection: true, allowSourceEdit: true, allowFieldEdit: true,
      editableFieldProperties: ['FieldType'], sourceFields: [{...field, rowid: 'F1', dataModelId: 'M1'}], businessRows: {Orders: [{rowid: 42}]},
      modelSources: {query: async () => ({rows: [source], total: 1}), prepare: async () => ({source, model: {
        Type: '数据库视图', MetaName: source.name, description: source.description, DbId: source.dbid, DbName: source.databaseName,
        JoinType: '', ForeignKeyFields: '', JoinFilter: '', PId: ''}, fields: [{...field, Name: 'nextId', FieldType: 'int'}]})}})
    const bootstrap = await f.open('A', {deferDefinition: true}); bootstrap.dispose()
    const config = JSON.parse(f.stored.get('A')!)
    config.tables.OrdersAlias.views.shared.fieldProjection = [{fieldId: 'F1', source: 'resource', resourceFieldId: 'F1', resourceField: 'rowid', viewField: 'rowid', type: 'varchar',
      label: 'ID', output: true, primaryKey: true, expression: '', value: '', valueFunction: '', group: 0, distinct: false, sortOrder: 0, sortDirection: null}]
    f.stored.set('A', JSON.stringify(config))
    const {wrapper, instance} = await page(); await select(wrapper, 'Orders')
    const active = f.sessions.at(-1)!, editor = wrapper.getComponent(DataSpaceModelSource)
    await openSourcePicker(editor); await chooseBound(editor, '来源类型', 'databaseView')
    await previewSource(editor, active.metadataDataSet)
    vi.spyOn(active.getModelSourceEdit('M1'), 'mapField').mockRejectedValueOnce(new Error('映射读取失败'))
    await chooseBound(editor, '来源字段 rowid', 'nextId')
    expect(sourcePreviewDom().text()).toContain('映射读取失败')
    expect(editor.findAllComponents(FieldSelect).find(field => field.props('label') === '来源字段 rowid')!.getComponent(ElSelect).props('modelValue')).toBe('rowid')
    let release = () => {}
    const waiting = new Promise<void>(resolve => {release = resolve}), originalRead = active.previewRemoteViews.bind(active)
    vi.spyOn(active, 'previewRemoteViews').mockImplementationOnce(async () => {await waiting; return originalRead()})
    await chooseBound(editor, '来源字段 rowid', 'nextId')
    expect(active.getModelSourceEdit('M1').getState().status).toBe('previewing')
    expect(sourceButton(editor, 'replace-source').attributes('disabled')).toBeDefined()
    expect(sourceButton(editor, 'cancel-create').attributes('disabled')).toBeDefined()
    release(); await flushPromises()
    expect(sourcePreviewDom().text()).toContain('将同步以下命名视图的字段合同')
    const checkbox = editor.findAllComponents(FieldCheckbox).find(field => field.props('label') === '确认字段 rowid')!
    expect(checkbox.vm.$.vnode.props?.['modelValue']).toBeUndefined()
    await checkbox.get('input[type="checkbox"]').setValue(true); await flushPromises()
    if (lost) f.loseNextFileResponse()
    expect(sourceButton(editor, 'replace-source').attributes('disabled')).toBeUndefined()
    await sourceButton(editor, 'replace-source').trigger('click'); await flushPromises()
    if (lost) {
      expect(active.getModelSourceEdit('M1').getState().status).toBe('configuration')
      expect(instance.isDirty).toBe(true)
      await sourceButton(editor, 'verify-create').trigger('click'); await flushPromises()
    }
    expect(writes(f)).toHaveLength(1); expect(f.fileWrites).toHaveLength(1); expect(instance.isDirty).toBe(false)
    const reopened = f.sessions.at(-1)!, fields = await reopened.loadModelFields('M1')
    expect(fields.rows).toContainEqual(expect.objectContaining({rowid: 'F1', Name: 'nextId', AsName: 'rowid', FieldType: 'int'}))
    await reopened.loadDefinition()
    const view = resolveDataViewKey('A@Orders@shared', reopened.definitionDataSet!)!
    expect(view.primaryKey).toBe('rowid'); expect(view.columns.find(column => column.name === 'rowid')?.type).toBe('int')
    expect((await view.loadFromServer()).success).toBe(true); expect(view.rows[0]?.['rowid']).toBe(42)
  }, 10_000)

  it.each([false, true])('confirms source type changes and named projections through standard fields, recovering a lost file receipt=%s', async lost => {
    const source = {type: 'databaseView' as const, id: 'RESOURCE', name: 'OrderSource', description: '当前来源', dbid: 'DB', databaseName: 'old-database', providerId: ''}
    const field = {type: 'dataModel' as const, Name: 'rowid', description: 'ID', FieldType: 'varchar', IsPKey: 1, IsOutput: 1,
      AsName: '', ValueFun: '', Expression: '', allowAIAdd: 0, OrderType: '', Order: 0, Group: 0}
    const f = fixture({overviewOnly: true, deferDefinition: true, formalProjection: true, allowSourceEdit: true,
      editableFieldProperties: ['FieldType'], sourceFields: [{...field, rowid: 'F1', dataModelId: 'M1'}], businessRows: {Orders: [{rowid: 42}]},
      modelSources: {query: async () => ({rows: [source], total: 1}), prepare: async () => ({source, model: {
        Type: '数据库视图', MetaName: source.name, description: source.description, DbId: 'DB', DbName: source.databaseName,
        JoinType: '', ForeignKeyFields: '', JoinFilter: '', PId: ''}, fields: [{...field, FieldType: 'int'}]})}})
    f.setModelValues({Type: '数据库视图'})
    const bootstrap = await f.open('A', {deferDefinition: true}); bootstrap.dispose()
    const config = JSON.parse(f.stored.get('A')!)
    config.tables.OrdersAlias.views.shared.fieldProjection = [{fieldId: 'F1', source: 'resource', resourceFieldId: 'F1', resourceField: 'rowid', viewField: 'rowid', type: 'varchar',
      label: 'ID', output: true, primaryKey: true, expression: '', value: '', valueFunction: '', group: 0, distinct: false, sortOrder: 0, sortDirection: null}]
    f.stored.set('A', JSON.stringify(config))
    const {wrapper, instance} = await page(); await select(wrapper, 'Orders')
    const active = f.sessions.at(-1)!
    const editor = wrapper.getComponent(DataSpaceModelSource)
    await sourceButton(editor, 'sync-source').trigger('click'); await flushPromises()
    expect(sourcePreviewDom().text()).toContain('将同步以下命名视图的字段合同')
    const projected = editor.findAllComponents(RendererTable).map(table => resolveDataViewKey(table.props('dataViewKey'), active.metadataDataSet))
      .find(view => view?.columns.some(column => column.name === 'fieldId') && view.columns.some(column => column.name === 'before'))!
    expect(projected.rows).toContainEqual(expect.objectContaining({tableName: 'OrdersAlias', viewId: 'shared', fieldId: 'F1'}))
    const checkbox = editor.findAllComponents(FieldCheckbox).find(field => field.props('label') === '确认字段 rowid')!
    expect(checkbox.vm.$.vnode.props?.['modelValue']).toBeUndefined()
    expect(sourceButton(editor, 'confirm-sync-source').attributes('disabled')).toBeDefined()
    await checkbox.get('input[type="checkbox"]').setValue(true); await flushPromises()
    expect(active.getModelSourceEdit('M1').getState().preview?.contractChanges[0]?.accepted).toBe(true)
    await sourceButton(editor, 'cancel-create').trigger('click'); await flushPromises()
    expect(writes(f)).toHaveLength(0)
    await sourceButton(editor, 'sync-source').trigger('click'); await flushPromises()
    const confirm = editor.findAllComponents(FieldCheckbox).find(field => field.props('label') === '确认字段 rowid')!
    expect((confirm.get('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(false)
    await confirm.get('input[type="checkbox"]').setValue(true); await flushPromises()
    if (lost) f.loseNextFileResponse()
    await sourceButton(editor, 'confirm-sync-source').trigger('click'); await flushPromises()
    if (lost) {
      expect(sourcePreviewDom().text()).toContain('数据库定义已确认')
      expect(active.getModelSourceEdit('M1').getState().status).toBe('configuration')
      expect(instance.isDirty).toBe(true)
      expect(editor.props('disabled')).toBe(false)
      expect(sourceButton(editor, 'verify-create').attributes('disabled')).toBeUndefined()
      await sourceButton(editor, 'verify-create').trigger('click'); await flushPromises()
    }
    expect(writes(f)).toHaveLength(1); expect(instance.isDirty).toBe(false)
    expect(active.metadataDataSet.destroyed).toBe(false)
    const reopened = f.sessions.at(-1)!; await reopened.loadDefinition()
    const view = resolveDataViewKey('A@Orders@shared', reopened.definitionDataSet!)!
    expect(view.columns.find(column => column.name === 'rowid')?.type).toBe('int')
    expect((await view.loadFromServer()).success).toBe(true)
    expect(view.rows[0]?.['rowid']).toBe(42); expect(f.fileWrites).toHaveLength(1)
    expect(reopened).toBe(active)
    const independent = await f.open('A'); await independent.loadDefinition()
    expect(resolveDataViewKey('A@Orders@shared', independent.definitionDataSet!)?.columns.find(column => column.name === 'rowid')?.type).toBe('int')
  }, 10_000)

  it.each([false, true])('confirms a newly introduced source primary through bound standard views and independently reopens it (lost=%s)', async lost => {
    const source = {type: 'databaseView' as const, id: 'RESOURCE', name: 'OrderSource', description: '当前来源', dbid: 'DB', databaseName: 'old-database', providerId: ''}
    const field = {type: 'dataModel' as const, Name: 'rowid', description: 'ID', FieldType: 'varchar', IsPKey: 1, IsOutput: 1,
      AsName: '', ValueFun: '', Expression: '', allowAIAdd: 0, OrderType: '', Order: 0, Group: 0}
    const f = fixture({overviewOnly: true, deferDefinition: true, formalProjection: true, allowSourceEdit: true, allowFieldAdd: true, allowDelete: true,
      sourceFields: [{...field, rowid: 'F1', dataModelId: 'M1'}], businessRows: {Orders: [{newKey: 73}]},
      modelSources: {query: async () => ({rows: [source], total: 1}), prepare: async () => ({source, model: {
        Type: '数据库视图', MetaName: source.name, description: source.description, DbId: 'DB', DbName: source.databaseName,
        JoinType: '', ForeignKeyFields: '', JoinFilter: '', PId: ''}, fields: [{...field, Name: 'newKey', FieldType: 'int', IsOutput: 0}]})}})
    f.setModelValues({Type: '数据库视图', PrimaryKeyFields: 'rowid'})
    const {wrapper, instance} = await page(); await select(wrapper, 'Orders')
    const active = f.sessions.at(-1)!, editor = wrapper.getComponent(DataSpaceModelSource)
    await sourceButton(editor, 'sync-source').trigger('click'); await flushPromises()
    const bound = editor.findAllComponents(RendererTable).map(table => resolveDataViewKey(table.props('dataViewKey'), active.metadataDataSet))
    expect(bound.find(view => view?.columns.some(column => column.name === 'property'))?.rows)
      .toContainEqual(expect.objectContaining({id: 'PrimaryKeyFields', property: '主键字段', before: 'rowid', after: 'newKey'}))
    expect(sourcePreviewDom().text()).toContain('作为主键并参与输出')
    await sourceButton(editor, 'cancel-create').trigger('click'); await flushPromises()
    expect(writes(f)).toHaveLength(0); expect(instance.isDirty).toBe(false)
    await sourceButton(editor, 'sync-source').trigger('click'); await flushPromises()
    expect(sourceButton(editor, 'confirm-sync-source').attributes('disabled')).toBeUndefined()
    if (lost) f.loseNextResponse()
    await sourceButton(editor, 'confirm-sync-source').trigger('click'); await flushPromises()
    if (lost) {
      expect(instance.isDirty).toBe(true); expect(writes(f)).toHaveLength(1)
      await sourceButton(editor, 'verify-create').trigger('click'); await flushPromises()
    }
    expect(writes(f)).toHaveLength(1); expect(instance.isDirty).toBe(false); expect(active.metadataDataSet.destroyed).toBe(false)
    const reopened = f.sessions.at(-1)!; await reopened.loadDefinition()
    const view = resolveDataViewKey('A@Orders@shared', reopened.definitionDataSet!)!
    expect(view.primaryKey).toBe('newKey'); expect(view.columns.some(column => column.name === 'rowid')).toBe(false)
    expect((await view.loadFromServer()).success).toBe(true); expect(view.rows[0]?.['newKey']).toBe(73)
    expect(f.created.get('Base_DataModel_Field')?.filter(row => row['Name'] === 'newKey')).toHaveLength(1)
    expect(reopened).toBe(active)
    const independent = await f.open('A'); await independent.loadDefinition()
    expect(resolveDataViewKey('A@Orders@shared', independent.definitionDataSet!)?.primaryKey).toBe('newKey')
  }, 10_000)

  it.each([false, true])('previews the bound source through standard views, cancels without writes and synchronizes explicitly (overview=%s)', async overviewOnly => {
    const source = {type: 'table' as const, id: 'CURRENT', name: 'OrderSource', description: '当前来源', dbid: 'DB', databaseName: 'old-database', providerId: ''}
    const field = {type: 'dataModel' as const, Name: 'rowid', description: 'ID', FieldType: 'varchar', IsPKey: 1, IsOutput: 1,
      AsName: '', ValueFun: '', Expression: '', allowAIAdd: 0, OrderType: '', Order: 0, Group: 0}
    const f = fixture({overviewOnly, allowSourceEdit: true, allowFieldAdd: true, allowDelete: true,
      sourceFields: [{...field, rowid: 'F1', dataModelId: 'M1'}, {...field, rowid: 'F2', dataModelId: 'M1', Name: 'obsolete', IsPKey: 0, IsOutput: 0}],
      modelSources: {query: async () => ({rows: [source], total: 1}), prepare: async () => ({source, model: {
        Type: '数据库表', MetaName: source.name, description: source.description, DbId: 'DB', DbName: source.databaseName, JoinType: '', ForeignKeyFields: '', JoinFilter: '', PId: ''},
        fields: [field, {...field, Name: 'fresh', IsPKey: 0, IsOutput: 0}]})}})
    const {wrapper, instance} = await page()
    await select(wrapper, 'Orders')
    const editor = wrapper.getComponent(DataSpaceModelSource)
    await sourceButton(editor, 'sync-source').trigger('click'); await flushPromises()
    expect(sourcePreviewDom().text()).toContain('来源字段同步预览')
    expect(sourcePreviewDom().text()).toContain('obsolete')
    expect(sourcePreviewDom().text()).toContain('fresh')
    expect(sourcePreviewDom().text()).not.toContain('引入为输出字段')
    const differences = editor.findAllComponents(RendererTable).map(table => resolveDataViewKey(table.props('dataViewKey'), f.sessions[0]!.metadataDataSet))
      .find(view => view?.columns.some(column => column.name === 'result'))!
    expect(differences.rows).toContainEqual(expect.objectContaining({name: 'obsolete'}))
    expect(writes(f)).toHaveLength(0); expect(instance.isDirty).toBe(true)
    await sourceButton(editor, 'cancel-create').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false); expect(writes(f)).toHaveLength(0)
    await sourceButton(editor, 'sync-source').trigger('click'); await flushPromises()
    await sourceButton(editor, 'confirm-sync-source').trigger('click'); await flushPromises()
    expect(writes(f)).toHaveLength(1); expect(instance.isDirty).toBe(false)
    expect(f.sessions).toHaveLength(1)
    expect(f.sessions[0]!.metadataDataSet.destroyed).toBe(false)
    const fields = await f.sessions.at(-1)!.loadModelFields('M1')
    expect(fields.rows.some(row => row['Name'] === 'fresh')).toBe(true)
    expect(fields.rows.some(row => row['rowid'] === 'F2')).toBe(false)
    expect(f.modelRow().MetaName).toBe('OrderSource')
    if (overviewOnly) for (const name of ['Base_DataModel_Field', 'Base_DataModel_Relation']) {
      expect(f.sessions.at(-1)!.metadataDataSet.getView(name)?.requestState).toBe(name === 'Base_DataModel_Relation' ? RequestState.Loaded : RequestState.Idle)
    }
  })

  it('retries only the visible field read after a confirmed source save without replaying the write', async () => {
    const source = {type: 'table' as const, id: 'CURRENT', name: 'OrderSource', description: '当前来源', dbid: 'DB', databaseName: 'old-database', providerId: ''}
    const field = {type: 'dataModel' as const, Name: 'rowid', description: 'ID', FieldType: 'varchar', IsPKey: 1, IsOutput: 1,
      AsName: '', ValueFun: '', Expression: '', allowAIAdd: 0, OrderType: '', Order: 0, Group: 0}
    const f = fixture({overviewOnly: true, allowSourceEdit: true, allowFieldAdd: true, sourceFields: [{...field, rowid: 'F1', dataModelId: 'M1'}],
      modelSources: {query: async () => ({rows: [source], total: 1}), prepare: async () => ({source, model: {
        Type: '数据库表', MetaName: source.name, description: source.description, DbId: 'DB', DbName: source.databaseName,
        JoinType: '', ForeignKeyFields: '', JoinFilter: '', PId: ''}, fields: [field, {...field, Name: 'fresh', IsPKey: 0, IsOutput: 0}]})}})
    const {wrapper, instance} = await page(); await select(wrapper, 'Orders')
    const session = f.sessions[0]!, editor = wrapper.getComponent(DataSpaceModelSource)
    const fields = session.metadataDataSet.getView('Base_DataModel_Field', 'modelFields')!
    await sourceButton(editor, 'sync-source').trigger('click'); await flushPromises()
    const reading = vi.spyOn(fields, 'loadFromServer').mockRejectedValueOnce(new Error('当前字段读取暂不可用'))
    await sourceButton(editor, 'confirm-sync-source').trigger('click'); await flushPromises()
    expect(f.sessions).toHaveLength(1); expect(session.metadataDataSet.destroyed).toBe(false)
    expect(writes(f)).toHaveLength(1); expect(instance.isDirty).toBe(false)
    expect(session.getModelSourceEdit('M1').getState().status).toBe('idle')
    await openModelFieldsTab(wrapper)
    expect(wrapper.text()).toContain('当前字段读取暂不可用')
    expect(reading).toHaveBeenCalledTimes(1)
    const retry = wrapper.findAllComponents(RendererButton).find(button => button.props('label') === '重新读取模型字段')!
    await retry.trigger('click'); await flushPromises()
    expect(reading).toHaveBeenCalledTimes(2)
    expect(fields.requestState).toBe(RequestState.Loaded)
    expect(fields.rows).toContainEqual(expect.objectContaining({Name: 'fresh', IsOutput: 0}))
    expect(fields.rows).toContainEqual(expect.objectContaining({rowid: 'F1', description: 'ID'}))
    expect(wrapper.text()).not.toContain('当前字段读取暂不可用')
    expect(writes(f)).toHaveLength(1); expect(instance.isDirty).toBe(false)
  })

  it.each([false, true])('replaces a compatible model source and can verify a lost receipt: lost=%s', async lost => {
    const source = {type: 'dict' as const, id: 'NEXT', name: 'NextChoices', description: '新字典', dbid: '', databaseName: '', providerId: ''}
    const f = fixture({allowSourceEdit: true, sourceFields: [], modelSources: {
      query: async () => ({rows: [source], total: 1}), prepare: async () => ({source, model: {
        Type: '字典', MetaName: source.name, description: source.description, DbId: 'NEXT', DbName: '', JoinType: '', ForeignKeyFields: '', JoinFilter: '', PId: ''}, fields: []}),
    }})
    f.setModelValues({Type: '字典'})
    const {wrapper, instance, dynamic} = await page()
    await select(wrapper, 'Orders')
    const editor = wrapper.getComponent(DataSpaceModelSource)
    await openSourcePicker(editor)
    await flushPromises()
    await previewSource(editor, f.sessions[0]!.metadataDataSet)
    expect(() => dynamic.closeSystemPageInstance(instance.instanceId)).toThrow('未保存')
    await select(wrapper, 'Customers'); expect(wrapper.get('.design-detail h2').text()).toBe('Orders')
    if (lost) f.loseNextResponse()
    await sourceButton(editor, 'replace-source').trigger('click'); await flushPromises()
    if (lost) {
      expect(instance.isDirty).toBe(true)
      expect(sourceButton(editor, 'verify-create').attributes('disabled')).toBeUndefined()
      expect(sourcePreviewDom().element.contains(sourceButton(editor, 'verify-create').element)).toBe(true)
      await sourceButton(editor, 'verify-create').trigger('click'); await flushPromises()
    }
    expect(f.modelRow().MetaName).toBe('NextChoices'); expect(f.modelRow().Name).toBe('Orders')
    expect(f.sessions).toHaveLength(1)
    expect(f.sessions[0]!.metadataDataSet.destroyed).toBe(false)
    expect(writes(f)).toHaveLength(1); expect(f.fileWrites).toHaveLength(0)
    expect(wrapper.text()).not.toContain('模型注册名或来源身份已变化')
    expect(wrapper.get('[data-action="save-model-workspace"]').attributes('disabled')).toBeDefined()
    expect(instance.isDirty).toBe(false)
    await writeBound(wrapper.getComponent(DataSpaceModelEditor), 'description', '替换来源后的连续编辑')
    await wrapper.get('[data-action="save-model-workspace"]').trigger('click'); await flushPromises()
    expect(instance.isDirty, wrapper.text()).toBe(false)
    expect(f.modelRow()).toMatchObject({MetaName: 'NextChoices', description: '替换来源后的连续编辑'})
    expect(writes(f)).toHaveLength(2)
  })

  it('retains the source workspace after explicit adoption without reporting or replaying the original replacement', async () => {
    const source = {type: 'dict' as const, id: 'NEXT', name: 'NextChoices', description: '新字典', dbid: '', databaseName: '', providerId: ''}
    const f = fixture({allowSourceEdit: true, sourceFields: [], modelSources: {
      query: async () => ({rows: [source], total: 1}), prepare: async () => ({source, model: {
        Type: '字典', MetaName: source.name, description: source.description, DbId: 'NEXT', DbName: '', JoinType: '', ForeignKeyFields: '', JoinFilter: '', PId: ''}, fields: []}),
    }})
    f.setModelValues({Type: '字典'})
    const {wrapper, instance} = await page()
    await select(wrapper, 'Orders')
    const editor = wrapper.getComponent(DataSpaceModelSource), original = f.sessions[0]!
    await openSourcePicker(editor); await previewSource(editor, original.metadataDataSet)
    f.loseNextResponse()
    await sourceButton(editor, 'replace-source').trigger('click'); await flushPromises()
    f.setModelValues({description: '正式描述另有修改'})
    await sourceButton(editor, 'verify-create').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(true)
    expect(sourcePreviewDom().text()).toContain('正式记录与预览不同')
    await sourceButton(editor, 'accept-create').trigger('click'); await flushPromises()
    expect(f.sessions).toHaveLength(1)
    expect(original.metadataDataSet.destroyed).toBe(false)
    const current = f.sessions.at(-1)!
    expect(current.metadataDataSet.getView('Base_DataModel')!.rows.find(row => row['rowid'] === 'M1')).toMatchObject({
      MetaName: 'NextChoices', description: '正式描述另有修改',
    })
    expect(wrapper.get('.design-detail h2').text()).toBe('Orders')
    expect(wrapper.text()).not.toContain('模型注册名或来源身份已变化')
    expect(instance.isDirty).toBe(false)
    expect(writes(f)).toHaveLength(1); expect(f.fileWrites).toHaveLength(0)
    expect(editor.text()).toContain('已采用当前正式结果，未补写或撤销服务器记录')
    await writeBound(wrapper.getComponent(DataSpaceModelEditor), 'description', '采用来源结果后的连续编辑')
    await wrapper.get('[data-action="save-model-workspace"]').trigger('click'); await flushPromises()
    expect(instance.isDirty, wrapper.text()).toBe(false)
    expect(f.modelRow()).toMatchObject({MetaName: 'NextChoices', description: '采用来源结果后的连续编辑'})
    expect(writes(f)).toHaveLength(2)
  })

  it.each([false, true])('creates from the directory pending node and protects an unknown receipt: lost=%s', async lost => {
    const source = {type: 'dict' as const, id: 'DICT', name: 'Choices', description: '候选', dbid: '', databaseName: '', providerId: ''}
    const f = fixture({allowModelAdd: true, allowFieldAdd: true, modelSources: {
      query: async () => ({rows: [source], total: 1}), prepare: async () => ({source, model: {
        Type: '字典', MetaName: source.name, description: source.description, DbId: 'DICT', DbName: '', JoinType: '', ForeignKeyFields: '', JoinFilter: '', PId: ''}, fields: []}),
    }})
    const {wrapper, instance, dynamic} = await page()
    await createDirectoryNode(wrapper)
    const editor = wrapper.getComponent(DataSpaceModelSource)
    await openSourcePicker(editor)
    const table = editor.getComponent(RendererTable)
    const view = resolveDataViewKey(table.props('dataViewKey'), f.sessions[0]!.metadataDataSet)!
    table.getComponent(SourceTable).vm.$emit('current-change', view.rows[0]); await flushPromises()
    expect(writes(f)).toHaveLength(0)
    await select(wrapper, 'Orders'); expect(wrapper.get('.design-detail h2').text()).toBe('待配置模型')
    if (lost) f.loseNextResponse()
    await sourceButton(editor, 'preview-source').trigger('click'); await flushPromises()
    if (lost) {
      expect(instance.isDirty).toBe(true)
      expect(() => dynamic.closeSystemPageInstance(instance.instanceId)).toThrow('未保存')
      expect(sourceButton(editor, 'create-model').attributes('disabled')).toBeDefined()
      expect(sourceTypeDisabled(editor)).toBe(true)
      expect(editor.findAllComponents(FieldText).find(field => field.props('field') === 'name' && field.find('input').exists())!.get('input').attributes('disabled')).toBeDefined()
      await sourceButton(editor, 'verify-create').trigger('click'); await flushPromises()
    }
    expect(wrapper.get('.design-detail h2').text()).toBe('Choices')
    expect(wrapper.text()).toContain('模型（3）'); expect(instance.isDirty).toBe(false)
    expect(f.created.get('Base_DataModel')?.[0]).toMatchObject({Name: 'Choices', MetaName: 'Choices'})
    expect(JSON.stringify(writes(f))).not.toContain('ModelSourceControls_')
    expect(writes(f)).toHaveLength(1); expect(f.fileWrites).toHaveLength(1)
    const reopened = await f.open('A'), id = f.created.get('Base_DataModel')?.[0]?.['rowid'] as string
    expect(reopened.definitionDataSet?.layout?.modelPositions?.[id]).toBeDefined()
    expect(Object.keys(reopened.definitionDataSet?.layout?.unboundNodes ?? {})).toEqual([])
  })

  it.each(['model-only', 'absent', 'orphan-fields'] as const)('adopts a partial creation without binding the pending node and recovers %s explicitly', async result => {
    const source = {type: 'table' as const, id: 'NEW', name: 'Recovered', description: '恢复来源', dbid: 'DB', databaseName: 'database', providerId: ''}
    const field = {type: 'dataModel' as const, Name: 'id', description: 'ID', FieldType: 'varchar', IsPKey: 1, IsOutput: 1,
      AsName: '', ValueFun: '', Expression: '', allowAIAdd: 0, OrderType: '', Order: 0, Group: 0}
    const options: Parameters<typeof dataSpacePageFixture>[0] = {overviewOnly: true, deferDefinition: true,
      allowModelAdd: true, allowFieldAdd: true, sourceFields: [], businessRows: {Recovered: [{rowid: 'R1', id: 'R1', title: '恢复后数据'}]},
      omitFieldWrite: result === 'model-only', omitFieldReceipt: result === 'model-only',
      modelSources: {query: async () => ({rows: [source], total: 1}), prepare: async () => ({source, model: {
        Type: '数据库表', MetaName: source.name, description: source.description, DbId: 'DB', DbName: 'database', JoinType: '', ForeignKeyFields: '', JoinFilter: '', PId: ''},
        fields: [field, {...field, Name: 'title', IsPKey: 0}]}),
    }}
    const f = fixture(options), {wrapper, instance} = await page()
    const before = f.stored.get('A')
    await createDirectoryNode(wrapper)
    const editor = wrapper.getComponent(DataSpaceModelSource)
    await openSourcePicker(editor)
    f.loseNextResponse()
    await previewSource(editor, f.sessions[0]!.metadataDataSet)
    expect(writes(f)).toHaveLength(1)
    const modelId = String(f.created.get('Base_DataModel')![0]!['rowid'])
    if (result !== 'model-only') f.created.delete('Base_DataModel')
    if (result === 'absent') f.created.delete('Base_DataModel_Field')
    await sourceButton(editor, 'verify-create').trigger('click'); await flushPromises()
    expect(f.sessions[0]!.getModelCreate().getState().status).toBe('different')
    expect(sourcePreviewDom().text()).toContain('未读取到此记录')
    await sourceButton(editor, 'accept-create').trigger('click'); await flushPromises()
    expect(f.sessions[0]!.hasPendingModelCreate()).toBe(false)
    expect(editor.emitted('created')).toBeUndefined()
    expect(wrapper.get('.design-detail h2').text()).toBe('待配置模型')
    expect(instance.isDirty).toBe(true)
    expect(f.fileWrites).toHaveLength(0); expect(f.stored.get('A')).toBe(before)
    await cancelDirectoryNode(wrapper)
    expect(instance.isDirty).toBe(false)
    expect(writes(f)).toHaveLength(1); expect(f.fileWrites).toHaveLength(0)
    if (result === 'model-only') {
      options.omitFieldWrite = false; options.omitFieldReceipt = false
      await select(wrapper, 'Recovered')
      const recovered = wrapper.getComponent(DataSpaceModelSource)
      await sourceButton(recovered, 'sync-source').trigger('click'); await flushPromises()
      expect(sourcePreviewDom().text()).toContain('新增 2 个字段')
      expect(sourceButton(recovered, 'confirm-sync-source').attributes('disabled'), sourcePreviewDom().text()).toBeUndefined()
      await sourceButton(recovered, 'confirm-sync-source').trigger('click'); await flushPromises()
      expect(writes(f)).toHaveLength(2)
      expect(f.created.get('Base_DataModel')).toHaveLength(1)
      const fresh = await f.open('A')
      expect((await fresh.loadModelFields(modelId)).rows.map(row => row['Name']).sort()).toEqual(['id', 'title'])
      await fresh.metadataDataSet.getView('DataViewDefinition')!.addRow({dataSetId: 'A', tableName: 'RecoveredTable',
        dataModelId: modelId, dataModelName: 'Recovered', viewId: 'list'})
      expect((await fresh.metadataDataSet.saveChanges({views: [{tableName: 'DataViewDefinition', viewId: 'default'}]})).success).toBe(true)
      const consumer = await f.open('A')
      await consumer.loadDefinition()
      const dataView = consumer.definitionDataSet!.getView('RecoveredTable', 'list')!
      expect(resolveDataViewKey('A@Recovered@list', consumer.definitionDataSet!)).toBe(dataView)
      expect((await dataView.loadFromServer()).success).toBe(true)
      expect(dataView.rows).toMatchObject([{id: 'R1', title: '恢复后数据'}])
    } else if (result === 'absent') {
      await createDirectoryNode(wrapper)
      const retry = wrapper.getComponent(DataSpaceModelSource)
      await openSourcePicker(retry)
      const list = retry.getComponent(RendererTable), view = resolveDataViewKey(list.props('dataViewKey'), f.sessions[0]!.metadataDataSet)!
      list.getComponent(SourceTable).vm.$emit('current-change', view.rows[0]); await flushPromises()
      await sourceButton(retry, 'preview-source').trigger('click'); await flushPromises()
      expect(writes(f)).toHaveLength(2)
      expect(f.created.get('Base_DataModel')).toHaveLength(1)
      expect(f.created.get('Base_DataModel')![0]!['rowid']).not.toBe(modelId)
      expect(wrapper.get('.design-detail h2').text()).toBe('Recovered')
      expect(instance.isDirty).toBe(false)
    } else {
      expect(f.created.get('Base_DataModel')).toBeUndefined()
      expect(f.created.get('Base_DataModel_Field')).toHaveLength(2)
      expect(f.created.get('Base_DataModel_Field')!.every(row => row['dataModelId'] === modelId)).toBe(true)
      expect(writes(f)).toHaveLength(1)
    }
  }, 10000)

  it('cancels a source preview without saving and invalidates it when filters change', async () => {
    const source = {type: 'dict' as const, id: 'D', name: 'Choices', description: '', dbid: '', databaseName: '', providerId: ''}
    const f = fixture({modelSources: {query: async () => ({rows: [source], total: 1}), prepare: async () => ({source,
      model: {Type: '字典', MetaName: 'Choices', description: '', DbId: 'D', DbName: '', JoinType: '', ForeignKeyFields: '', JoinFilter: '', PId: ''}, fields: []})}})
    const {wrapper, instance} = await page(); await createDirectoryNode(wrapper)
    expect(instance.isDirty).toBe(true)
    const editor = wrapper.getComponent(DataSpaceModelSource)
    await openSourcePicker(editor)
    await flushPromises()
    await previewSource(editor, f.sessions[0]!.metadataDataSet)
    expect(instance.isDirty).toBe(true)
    for (const name of ['', 'Orders']) {
      await writeBound(editor, 'name', name)
      expect(editor.findAllComponents(FieldText).find(field => field.props('field') === 'name' && field.find('input').exists())!.get('input').element.value).toBe(name)
      expect(sourceButton(editor, 'create-model').attributes('disabled')).toBeDefined()
      expect(sourcePreviewDom().text()).toContain('模型注册名')
    }
    await writeBound(editor, 'name', 'BusinessChoices')
    expect(sourceButton(editor, 'create-model').attributes('disabled')).toBeUndefined()
    await openSourcePicker(editor)
    await writeBound(editor, 'keyword', 'different')
    expect(editor.find('[data-source-preview]').exists()).toBe(false)
    expect(instance.isDirty).toBe(true)
    await sourceButton(editor, 'cancel-source-dialog').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(true)
    await cancelDirectoryNode(wrapper)
    expect(instance.isDirty).toBe(false)
    await select(wrapper, 'Orders')
    expect(wrapper.get('.design-detail h2').text()).toBe('Orders')
    expect(f.sessions[0]!.getModelCreate().getState().preview).toBeNull()
    expect(writes(f)).toHaveLength(0)
  })

  it.each(['table', 'databaseView'] as const)('restores the source database display and stable selection for %s', async type => {
    const source = {type, id: 'S', name: 'Orders', description: '', dbid: 'STABLE_DB_ID', databaseName: '', providerId: ''}
    const query = vi.fn(async () => ({rows: [source, {...source, id: 'NAMED', name: 'Named', databaseName: '业务库'},
      {...source, id: 'EMPTY', name: 'Empty', dbid: ''}], total: 25}))
    const f = fixture({modelSources: {query, prepare: async () => {throw new Error('not submitting')}}})
    const session = await f.open('A'), editor = await sourceEditor(session, true); wrappers.push(editor)
    if (type === 'databaseView') await new DOMWrapper(document.body).findAll('[role="tab"]')[5]!.trigger('click')
    await flushPromises()
    const table = editor.getComponent(RendererTable), view = resolveDataViewKey(table.props('dataViewKey'), session.metadataDataSet)!
    const rows = new DOMWrapper(document.body).get('.el-dialog').findAll('tbody tr')
    expect(rows[0]!.text()).toContain('STABLE_DB_ID')
    expect(rows[1]!.text()).toContain('业务库')
    expect(rows[1]!.text()).not.toContain('STABLE_DB_ID')
    expect(rows[2]!.findAll('td').at(-1)!.text()).toBe('-')
    await rows[0]!.trigger('click'); await flushPromises()
    expect(view.getSelectedValues()).toEqual(['S'])
    expect(view.rows[0]).toMatchObject({DbName: '', dbid: 'STABLE_DB_ID'})
    expect(view.hasEditingChanges()).toBe(false)
    table.getComponent(ElPagination).vm.$emit('current-change', 2); await flushPromises()
    expect(query).toHaveBeenLastCalledWith(expect.objectContaining({page: 2, type}), session.metadataDataSet)
    expect(new DOMWrapper(document.body).get('.el-dialog').findAll('tbody tr')[0]!.text()).toContain('STABLE_DB_ID')
    expect(JSON.stringify(f.requests)).not.toContain('databaseDisplay')
    await sourceButton(editor, 'cancel-source-dialog').trigger('click'); await flushPromises()
    expect(writes(f)).toHaveLength(0); expect(session.getModelCreate().getState().pending).toBe(false)
  })

  it.each([
    {permissions: {h: ['DbName']}, name: '', expected: ''},
    {permissions: {m: ['DbName']}, name: '', expected: ''},
    {permissions: {h: ['dbid']}, name: '', expected: ''},
    {permissions: {m: ['dbid']}, name: '', expected: ''},
    {permissions: {h: ['dbid']}, name: '公开库名', expected: '公开库名'},
  ])('checks source database display input permissions: $permissions / $name', async ({permissions, name, expected}) => {
    const source = {type: 'table' as const, id: 'S', name: 'Orders', description: '', dbid: 'PRIVATE_DB_ID', databaseName: name, providerId: ''}
    const f = fixture({sourceFieldPermissions: permissions, modelSources: {query: async () => ({rows: [source], total: 1}), prepare: async () => {throw new Error('not submitting')}}})
    const session = await f.open('A'), editor = await sourceEditor(session, true); wrappers.push(editor)
    const row = new DOMWrapper(document.body).get('.el-dialog tbody tr')
    expect(row.findAll('td').at(-1)!.text()).toBe(expected)
    expect(row.text()).not.toContain('PRIVATE_DB_ID')
    const table = editor.getComponent(RendererTable), view = resolveDataViewKey(table.props('dataViewKey'), session.metadataDataSet)!
    expect(view.fieldAccess(view.rows[0]!, 'databaseDisplay').read).toBe(expected ? 'visible' : 'invisible')
    expect(writes(f)).toHaveLength(0)
  })

  it('restores the reference source tabs and header filters through the same candidate DataViews', async () => {
    const source = {type: 'table' as const, id: 'S', name: 'Orders', description: '订单', dbid: 'DB', databaseName: '业务库', providerId: ''}
    const query = vi.fn(async () => ({rows: [source], total: 25}))
    const f = fixture({modelSources: {query, prepare: async () => {throw new Error('not submitting')}}})
    const session = await f.open('A'), editor = await sourceEditor(session, true); wrappers.push(editor)
    const dialog = editor.getComponent(RendererDialog)
    expect(dialog.props('title')).toBe('数据模型弹出层')
    expect(dialog.props('width')).toBe('min(980px, calc(100vw - 32px))')
    const dom = new DOMWrapper(document.body).get('.el-dialog')
    expect(dom.findAll('[role="tab"]').map(tab => tab.text())).toEqual(['数据库表', '字典', '接口', 'JSON', '视图', '数据库视图'])
    expect(dom.findAll('thead input')).toHaveLength(3)
    expect(dom.get('thead').text()).toContain('表名')
    expect(dom.get('thead').text()).toContain('数据库名称 / 稳定 ID')
    expect(editor.getComponent(RendererTable).props('maxHeight')).toBe(460)
    expect(editor.getComponent(ElPagination).props('pageSizes')).toEqual([10, 20, 50])
    expect(editor.getComponent(ElPagination).props('layout')).not.toContain('jumper')
    for (const [index, value] of ['Order', '订单', '业务'].entries()) {
      await dom.findAll('thead input')[index]!.setValue(value); await flushPromises()
    }
    expect(query).toHaveBeenLastCalledWith(expect.objectContaining({type: 'table', keyword: 'Order', description: '订单', databaseName: '业务', page: 1}), session.metadataDataSet)
    editor.getComponent(ElPagination).vm.$emit('current-change', 2); await flushPromises()
    expect(query).toHaveBeenLastCalledWith(expect.objectContaining({keyword: 'Order', databaseName: '业务', page: 2}), session.metadataDataSet)
    await dom.findAll('[role="tab"]')[1]!.trigger('click'); await flushPromises()
    expect(dom.findAll('thead input')).toHaveLength(2)
    expect(dom.findAll<HTMLInputElement>('thead input').map(input => input.element.value)).toEqual(['', ''])
    expect(query).toHaveBeenLastCalledWith(expect.objectContaining({type: 'dict', keyword: '', description: '', page: 1}), session.metadataDataSet)
    expect(sourceButton(editor, 'preview-source').attributes('disabled')).toBeDefined()
    await dom.get('tbody tr').trigger('click'); await flushPromises()
    expect(sourceButton(editor, 'preview-source').attributes('disabled')).toBeUndefined()
    await sourceButton(editor, 'cancel-source-dialog').trigger('click'); await flushPromises()
    await openSourcePicker(editor)
    expect(sourceButton(editor, 'preview-source').attributes('disabled')).toBeDefined()
    expect(writes(f)).toHaveLength(0); expect(f.fileWrites).toHaveLength(0)
  })

  it('binds source filters and result views, keeps totals and excludes the database filter for other resource types', async () => {
    const source = {type: 'dict' as const, id: 'D', name: 'Choices', description: '候选', dbid: '', databaseName: '', providerId: ''}
    const query = vi.fn(async () => ({rows: [source], total: 11}))
    const f = fixture({modelSources: {query, prepare: async () => ({source, model: {Type: '字典', MetaName: 'Choices', description: '',
      DbId: 'D', DbName: '', JoinType: '', ForeignKeyFields: '', JoinFilter: '', PId: ''}, fields: []})}})
    const {wrapper, instance} = await page(); await createDirectoryNode(wrapper)
    const editor = wrapper.getComponent(DataSpaceModelSource), dataSet = f.sessions[0]!.metadataDataSet
    await openSourcePicker(editor)
    const form = editor.getComponent(RendererForm), view = resolveDataViewKey(form.props('dataViewKey'), dataSet)!
    expect(view.dataSet).toBe(dataSet)
    await writeBound(editor, 'databaseName', 'DB')
    await chooseBound(editor, '来源类型', 'dict')
    await writeBound(editor, 'keyword', 'Choices')
    await writeBound(editor, 'description', '候选')
    expect(view.getEditingRow('search')).toMatchObject({type: 'dict', keyword: 'Choices', description: '候选', databaseName: ''})
    expect(editor.findAllComponents(FieldText).some(field => field.props('field') === 'databaseName')).toBe(false)
    expect(instance.isDirty).toBe(true)
    await flushPromises()
    expect(query).toHaveBeenLastCalledWith({type: 'dict', keyword: 'Choices', description: '候选', page: 1, pageSize: 10}, dataSet)
    const results = resolveDataViewKey(editor.getComponent(RendererTable).props('dataViewKey'), dataSet)!
    expect(results.dataSet).toBe(dataSet)
    expect(results.isMultiSelect).toBe(false)
    expect(results.rows).toMatchObject([{rowid: 'D', TypeName: 'Choices'}]); expect(results.total).toBe(11)
    editor.getComponent(RendererTable).getComponent(ElPagination).vm.$emit('current-change', 2); await flushPromises()
    expect(query).toHaveBeenLastCalledWith({type: 'dict', keyword: 'Choices', description: '候选', page: 2, pageSize: 10}, dataSet)
    editor.getComponent(RendererTable).getComponent(ElPagination).vm.$emit('size-change', 20); await flushPromises()
    expect(sourceButton(editor, 'preview-source').attributes('disabled')).toBeDefined()
    expect(query).toHaveBeenLastCalledWith({type: 'dict', keyword: 'Choices', description: '候选', page: 1, pageSize: 20}, dataSet)
    await chooseBound(editor, '来源类型', 'table')
    expect(view.getEditingRow('search')?.['databaseName']).toBe('')
    expect(resolveDataViewKey(editor.getComponent(RendererTable).props('dataViewKey'), dataSet)?.dataTable?.modelBinding?.modelName).toBe('View_TblList')
    expect(query).toHaveBeenLastCalledWith({type: 'table', keyword: '', description: '', databaseName: '', page: 1, pageSize: 10}, dataSet)
    await sourceButton(editor, 'cancel-source-dialog').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(true)
    await cancelDirectoryNode(wrapper)
    expect(instance.isDirty).toBe(false)
    await select(wrapper, '输入参数')
    expect(view.destroyed).toBe(true); expect(results.destroyed).toBe(true)
    expect(writes(f)).toHaveLength(0)
  })

  it('keeps the source dialog recoverable after query and preview failures and cancels without writes', async () => {
    const source = {type: 'table' as const, id: 'D', name: 'Candidate', description: '', dbid: '', databaseName: '', providerId: ''}
    const query = vi.fn(async () => ({rows: [source], total: 1}))
      .mockRejectedValueOnce(new Error('查询暂不可用')).mockResolvedValueOnce({rows: [], total: 0})
    const prepare = vi.fn(async () => {throw new Error('来源定义暂不可用')})
    const f = fixture({modelSources: {query, prepare}})
    const {wrapper, instance} = await page(); await createDirectoryNode(wrapper)
    const editor = wrapper.getComponent(DataSpaceModelSource)
    await openSourcePicker(editor)
    for (const expected of ['查询暂不可用', '没有符合条件的来源。']) {
      if (expected !== '查询暂不可用') {await sourceButton(editor, 'search-sources').trigger('click'); await flushPromises()}
      expect(new DOMWrapper(document.body).findAll('.el-dialog').find(dialog => dialog.find('.renderer-dialog-title').text() === '数据模型弹出层')?.text()).toContain(expected)
      expect(sourceButton(editor, 'preview-source').attributes('disabled')).toBeDefined()
      expect(sourceButton(editor, 'cancel-source-dialog').attributes('disabled')).toBeUndefined()
    }
    await writeBound(editor, 'keyword', 'Candidate')
    const table = editor.getComponent(RendererTable)
    const view = resolveDataViewKey(table.props('dataViewKey'), f.sessions[0]!.metadataDataSet)!
    table.getComponent(SourceTable).vm.$emit('current-change', view.rows[0]); await flushPromises()
    await sourceButton(editor, 'preview-source').trigger('click'); await flushPromises()
    expect(prepare).toHaveBeenCalledOnce()
    expect(editor.getComponent(RendererDialog).props('modelValue')).toBe(true)
    expect(new DOMWrapper(document.body).findAll('.el-dialog').find(dialog => dialog.find('.renderer-dialog-title').text() === '数据模型弹出层')?.text()).toContain('来源定义暂不可用')
    await sourceButton(editor, 'cancel-source-dialog').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(true)
    await cancelDirectoryNode(wrapper)
    expect(instance.isDirty).toBe(false); expect(writes(f)).toHaveLength(0)
    expect(f.sessions[0]!.getModelCreate().getState().preview).toBeNull()
  })

  it('does not publish unchanged source projections back into the page revision loop', async () => {
    const source = {type: 'dict' as const, id: 'D', name: 'Choices', description: '', dbid: '', databaseName: '', providerId: ''}
    const f = fixture({modelSources: {query: async () => ({rows: [source], total: 1}), prepare: async () => {throw new Error('not previewing')}}})
    const session = await f.open('A'), owner = session.getModelCreate()
    const controls = new DataSpaceSourceControls(session.metadataDataSet, vi.fn())
    const changed = vi.fn(), stop = session.metadataDataSet.onAnyViewChange({rowsChanged: changed})
    try {
      controls.sync(owner.getState())
      changed.mockClear()
      for (let revision = 0; revision < 10; revision++) controls.sync(owner.getState())
      expect(changed).not.toHaveBeenCalled()
      controls.search.updateEditingValue('search', 'type', 'dict')
      controls.setOpen(true); await flushPromises()
      controls.sync(owner.getState())
      expect(changed).toHaveBeenCalled(); expect(controls.results.rows).toMatchObject([{rowid: 'D'}])
      changed.mockClear()
      for (let revision = 0; revision < 10; revision++) controls.sync(owner.getState())
      expect(changed).not.toHaveBeenCalled()
      expect(writes(f)).toHaveLength(0)
    } finally {stop(); controls.dispose()}
  })

  it('isolates source control views between component instances and releases only the disposed controls', async () => {
    const f = fixture({modelSources: {query: async () => ({rows: [], total: 0}), prepare: async () => {throw new Error('no candidate')}}})
    const session = await f.open('A'), dataSet = session.metadataDataSet
    const first = await sourceEditor(session)
    const second = await sourceEditor(session)
    wrappers.push(first, second)
    const a = resolveDataViewKey(first.getComponent(RendererForm).props('dataViewKey'), dataSet)!, b = resolveDataViewKey(second.getComponent(RendererForm).props('dataViewKey'), dataSet)!
    expect(a).not.toBe(b); expect(a.dataSet).toBe(dataSet); expect(b.dataSet).toBe(dataSet)
    await writeBound(first, 'keyword', 'only-first')
    expect(a.getEditingRow('search')?.['keyword']).toBe('only-first')
    expect(b.getEditingRow('search')?.['keyword']).toBe('')
    await first.setProps({disabled: true})
    expect(sourceTypeDisabled(first)).toBe(true)
    first.unmount(); wrappers.splice(wrappers.indexOf(first), 1)
    expect(a.destroyed).toBe(true); expect(b.destroyed).toBe(false)
    expect(dataSet.getView('Base_DataModel', 'default')?.destroyed).toBe(false)
    expect(writes(f)).toHaveLength(0)
  })

  it('releases source controls before a late query settles without updating the disposed projection', async () => {
    let release!: () => void
    const hold = new Promise<void>(resolve => {release = resolve})
    const query = vi.fn(async () => {await hold; return {rows: [], total: 0}})
    const f = fixture({modelSources: {query, prepare: async () => {throw new Error('no candidate')}}})
    const session = await f.open('A')
    const tableNames = Object.keys(session.metadataDataSet.tables).sort()
    const editor = await sourceEditor(session)
    wrappers.push(editor)
    const view = resolveDataViewKey(editor.getComponent(RendererForm).props('dataViewKey'), session.metadataDataSet)!
    await flushPromises()
    expect(query).toHaveBeenCalledOnce(); expect(sourceTypeDisabled(editor)).toBe(false)
    editor.unmount(); wrappers.splice(wrappers.indexOf(editor), 1)
    expect(view.destroyed).toBe(true)
    release(); await flushPromises()
    expect(Object.keys(session.metadataDataSet.tables).sort()).toEqual(tableNames)
    expect(session.getModelCreate().getState().status).toBe('idle')
    expect(writes(f)).toHaveLength(0)
  })

  it('edits model configuration through the original metadata view and reopens the saved definition', async () => {
    const f = fixture()
    const {wrapper, instance} = await page()
    await select(wrapper, 'Orders')
    const editor = wrapper.getComponent(DataSpaceModelEditor)
    const view = f.sessions[0]!.metadataDataSet.getView('Base_DataModel', 'default')!
    expect(editor.findAllComponents(RendererForm).filter(form => !form.element.closest('[aria-label="模型注册名编辑"]')).every(form => form.props('dataSource') === undefined
      && form.props('dataViewKey') === `${view.dataSet?.scenarioId}@Base_DataModel@default`)).toBe(true)
    expect(editor.findAllComponents(RendererForm).length).toBeGreaterThan(0)
    await writeBound(editor, 'description', '订单查询')
    expect(view.currentRow?.['rowid']).toBe('M1')
    expect(view.getEditingRow('M1')?.['description']).toBe('订单查询')
    expect(instance.isDirty).toBe(true)
    await select(wrapper, 'Customers')
    expect(wrapper.get('.design-detail h2').text()).toBe('Orders')
    await wrapper.get('[data-action="save-model-workspace"]').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('模型配置已保存并回读')
    expect(instance.isDirty).toBe(false)
    expect(writes(f)).toHaveLength(1)
    expect(f.fileWrites).toHaveLength(0)
    const reopened = await f.open('A')
    expect(reopened.metadataDataSet.getView('Base_DataModel', 'default')!.rows[0]).toMatchObject({rowid: 'M1', description: '订单查询'})
  })

  it('cancels model choices without sending writes and protects unapplied inline filters', async () => {
    const f = fixture()
    const {wrapper, instance, dynamic} = await page()
    await select(wrapper, 'Orders')
    const editor = wrapper.getComponent(DataSpaceModelEditor)
    await chooseBound(editor, '业务模型', 1)
    await flushPromises()
    expect(instance.isDirty).toBe(true)
    expect(() => dynamic.closeSystemPageInstance(instance.instanceId)).toThrow('未保存')
    await editor.get('[data-action="cancel-model"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false)
    expect(f.modelRow().cacheType).toBe('')
    await wrapper.getComponent(RendererTabs).get('#tab-views').trigger('click'); await flushPromises()
    const viewEditor = wrapper.getComponent(DataSpaceViewEditor)
    await openViewProperties(viewEditor)
    await viewEditor.get('[data-edit-property="filterExpression"]').trigger('click'); await flushPromises()
    const filter = viewEditor.getComponent(RendererFilterExpression)
    expect(filter.props('display')).toBe('inline')
    expect(filter.find('[data-action="open"]').exists()).toBe(false)
    await filter.get('[data-action="json"]').trigger('click'); await filter.get('[data-action="json-text"]').trigger('click')
    filter.getComponent(SparkJsonEditor).vm.$emit('update:modelValue', '{invalid'); await flushPromises()
    expect(instance.isDirty).toBe(true)
    expect(viewEditor.get('[data-action="save-views"]').attributes('disabled')).toBeDefined()
    expect(viewEditor.get('[data-action="finish-view-property"]').attributes('disabled')).toBeDefined()
    expect(() => dynamic.closeSystemPageInstance(instance.instanceId)).toThrow('未保存')
    await writeBound(viewEditor, 'selectionDelimiter', '|')
    expect(filter.getComponent(SparkJsonEditor).props('modelValue')).toBe('{invalid')
    await select(wrapper, 'Customers')
    expect(wrapper.get('.design-detail h2').text()).toBe('default')
    await filter.get('[data-action="cancel"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(true)
    await viewEditor.get('[data-action="discard-view-edits"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false); expect(writes(f)).toHaveLength(0); expect(f.fileWrites).toHaveLength(0)
  })

  it('provides formal model choices to the named-view value function dialog and cancels without writes', async () => {
    const f = fixture({overviewOnly: true})
    const config = {scenarioId: 'A', schemaVersion: 2, tables: {
      OrdersAlias: {modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {default: {filterExpression: {field: 'rowid', operator: 'eq', value: 'x'}}}},
      CustomersAlias: {modelBinding: {modelId: 'M2', modelName: 'Customers'}, views: {default: {}}},
    }, resourceRelations: [{relationId: 'native', parentTable: 'CustomersAlias', childTable: 'OrdersAlias', filterExpression: {field: 'rowid', operator: 'eq', value: 'x'}}]}
    f.stored.set('A', JSON.stringify(config))
    const {wrapper, instance} = await page(); await select(wrapper, 'default')
    const editor = wrapper.getComponent(DataSpaceViewEditor), filter = editor.getComponent(RendererFilterExpression)
    expect(filter.props('functionContext')?.tables?.map(table => table.name)).toEqual(['Orders', 'Customers'])
    expect(filter.props('functionContext')?.relatedFields).toContainEqual({label: 'Customers.rowid', value: 'Customers.rowid'})
    await filter.get('[data-action="open"]').trigger('click'); await flushPromises()
    const body = new DOMWrapper(document.body)
    await body.get('[aria-label="使用服务端值函数"]').trigger('click'); await flushPromises()
    const dialog = filter.getComponent(FilterValueFunctionDialog)
    dialog.getComponent(ElTabs).vm.$emit('update:modelValue', 'GetRefData'); await flushPromises()
    const choice = dialog.findAllComponents(ElSelect)[0]!
    expect(choice.findAllComponents(ElOption).map(option => option.props('value'))).toEqual(['Orders', 'Customers'])
    choice.vm.$emit('update:modelValue', 'Customers'); await flushPromises()
    expect(dialog.findAllComponents(ElSelect)[1]!.findAllComponents(ElOption).map(option => option.props('value'))).toContain('rowid')
    await body.findAll('button').filter(button => button.text() === '取消').at(-1)!.trigger('click'); await flushPromises()
    await body.get('[data-action="cancel"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false); expect(f.fileWrites).toHaveLength(0); expect(writes(f)).toHaveLength(0)
    expect(f.sessions[0]!.definitionStatus).toBe('unloaded')
  })

  it('edits a declared space parameter in the view filter, saves, reopens and queries with its input', async () => {
    const f = fixture({allowSourceEdit: true, formalProjection: true, sourceFields: [
      {rowid: 'ID', dataModelId: 'M1', Name: 'rowid', type: 'dataModel', FieldType: 'string', IsPKey: 1, IsOutput: 1},
    ], businessRows: {Orders: [{rowid: 'C1'}, {rowid: 'C2'}]}})
    f.setModelValues({Filter: '{"Type":"cond","Field":"rowid","Operator":"equal","ValueFun":{"Type":"GetConstValue","Value":"old"}}'})
    const {wrapper, instance} = await page(); await select(wrapper, 'default')
    const editor = wrapper.getComponent(DataSpaceViewEditor)
    await openViewProperties(editor)
    await editor.get('[data-edit-property="filterExpression"]').trigger('click'); await flushPromises()
    const filter = editor.getComponent(RendererFilterExpression)
    filter.getComponent(FilterExpressionEditor).vm.$emit('update:modelValue', {field: 'rowid', operator: 'eq', value: 'old'}); await flushPromises()
    expect(filter.props('dataViewKey')).toBe(`${f.sessions[0]!.metadataDataSet.scenarioId}@DataViewDefinition@default`)
    expect(filter.props('functionContext')?.inputParams).toEqual([{label: '客户', value: 'customer'}])
    await filter.findAll('button').find(button => button.attributes('aria-label') === '使用服务端值函数')!.trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(true)
    expect(editor.get('[data-action="save-views"]').attributes('disabled')).toBeDefined()
    const dialog = filter.getComponent(FilterValueFunctionDialog)
    dialog.getComponent(ElTabs).vm.$emit('update:modelValue', 'GetInputParam'); await flushPromises()
    const choice = dialog.findAllComponents(ElSelect)[0]!
    expect(choice.findAllComponents(ElOption).map(item => item.props('value'))).toContain('customer')
    choice.vm.$emit('update:modelValue', 'customer'); await flushPromises()
    await new DOMWrapper(document.body).get('[data-function-confirm]').trigger('click'); await flushPromises()
    expect(writes(f)).toHaveLength(0)
    await filter.get('[data-action="apply"]').trigger('click'); await flushPromises()
    const fieldView = f.sessions[0]!.metadataDataSet.getView('DataViewDefinition')!
    const expected = {field: 'rowid', operator: 'eq', value: {Type: 'GetInputParam', ParamName: 'customer'}}
    expect(fieldView.getEditingRow(editor.props('rowKey')!)?.['filterExpression']).toEqual(expected)
    expect(instance.isDirty).toBe(true)
    await editor.get('[data-action="finish-view-property"]').trigger('click'); await flushPromises()
    await editor.get('[data-action="save-views"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false); expect(writes(f)).toHaveLength(0); expect(f.fileWrites).toHaveLength(1)
    const fresh = await f.open('A')
    expect(JSON.parse(String(fresh.metadataDataSet.getView('Base_DataModel')?.rows[0]?.['Filter']))).toMatchObject({ValueFun: {Value: 'old'}})
    expect(fresh.definitionDataSet!.getView('OrdersAlias', 'default')!.filterExpression).toEqual(expected)
    const preview = await fresh.openPreview({modelId: 'M1', modelName: 'Orders', tableName: 'OrdersAlias', viewId: 'default'})
    try {
      await preview.query({context: {customer: 'C1'}})
      expect(preview.view.rows.map(row => row['rowid'])).toEqual(['C1'])
      expect(f.requests.some(request => JSON.stringify(request.data).includes('"Name":"customer","Value":"C1"'))).toBe(true)
    } finally {preview.dispose()}
  })

  it.each([
    {options: {inputParameters: '[{"Name":"customer"},{"Name":"customer"}]'}, warning: '空间参数名称不唯一'},
    {options: {hidden: true}, warning: '引用身份不可读'},
  ])('keeps constants editable when the view filter parameter catalog is invalid: $warning', async ({options, warning}) => {
    const f = fixture(options)
    const {wrapper} = await page(); await select(wrapper, 'default')
    const editor = wrapper.getComponent(DataSpaceViewEditor)
    await openViewProperties(editor)
    await editor.get('[data-edit-property="filterExpression"]').trigger('click'); await flushPromises()
    const filter = editor.getComponent(RendererFilterExpression)
    expect(filter.props('functionContext')?.inputParams).toEqual([])
    expect(editor.text()).toContain(warning)
    const tree = {field: 'rowid', operator: 'eq', value: false}
    filter.getComponent(FilterExpressionEditor).vm.$emit('update:modelValue', tree); await flushPromises()
    expect(f.sessions[0]!.metadataDataSet.getView('DataViewDefinition')!.getEditingRow(editor.props('rowKey')!)?.['filterExpression']).toEqual(tree)
    await editor.get('[data-action="finish-view-property"]').trigger('click'); await flushPromises()
    await editor.get('[data-action="save-views"]').trigger('click'); await flushPromises()
    expect(f.fileWrites).toHaveLength(1)
    expect((await f.open('A')).definitionDataSet!.getView('OrdersAlias', 'default')!.filterExpression).toEqual(tree)
    expect(f.modelRow().Filter).toBe(''); expect(writes(f)).toHaveLength(0)
  })

  it('binds the reference request side panel to upstream field definitions and clears it at the root', async () => {
    const f = fixture({sourceFields: [
      {rowid: 'UP', dataModelId: 'M2', Name: 'customer', type: 'dataModel', description: '上游字段'},
      {rowid: 'INPUT', dataModelId: 'M2', Name: 'customerArg', type: 'inputParams', description: '上游入参'},
    ]})
    f.stored.set('A', JSON.stringify({scenarioId: 'A', tables: {
      OrdersAlias: {modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {default: {}}},
      CustomersAlias: {modelBinding: {modelId: 'M2', modelName: 'Customers'}, views: {default: {}}},
    }, resourceRelations: [{relationId: 'N', parentTable: 'CustomersAlias', childTable: 'OrdersAlias', filterExpression: {logic: 'and', filters: []}}]}))
    const {wrapper, instance} = await page('?scenarioId=A', true); await select(wrapper, 'Orders')
    const editor = wrapper.getComponent(DataSpaceModelEditor), side = editor.get('.request-side')
    expect(side.text()).toContain('模型输入参数')
    const table = editor.findAllComponents(RendererTable).find(item => item.props('dataViewKey')?.endsWith('@modelInputFields'))!
    const view = resolveDataViewKey(table.props('dataViewKey'), f.sessions[0]!.metadataDataSet)!
    expect(view.rows.map(row => row['rowid']).sort()).toEqual(['INPUT', 'UP'])
    expect(table.getComponent(ElTable).props()).toMatchObject({maxHeight:520})
    expect(table.findAllComponents(FieldText).map(field => field.props('minWidth'))).toEqual([180,220])
    expect(table.props('dataSource')).toBeUndefined()
    expect(table.findAllComponents(FieldText).map(field => [field.props('field'), field.props('readonly')])).toEqual([['Name', true], ['description', true]])
    expect(instance.isDirty).toBe(false)
    await select(wrapper, 'Customers')
    expect(view.rows).toEqual([]); expect(writes(f)).toHaveLength(0)
  })

  it('saves numeric model flags and explicitly clears a prior selection', async () => {
    const f = fixture(); f.setModelValues({cacheType: '页面', IsBusiness: 1})
    const {wrapper} = await page()
    await select(wrapper, 'Orders')
    const editor = wrapper.getComponent(DataSpaceModelEditor)
    expect(editor.findAllComponents(RendererSection).map(section => section.props('title'))).toEqual(['模型属性', '模型输入参数'])
    expect(editor.findAllComponents(FieldRadio)).toHaveLength(0)
    expect(editor.findAllComponents(FieldCheckbox).map(field => field.props('field'))).toEqual(['IsBusinessMain', 'IsBusiness'])
    await chooseBound(editor, '业务模型', 0)
    await chooseBound(editor, '业务主模型', 1)
    await flushPromises()
    await wrapper.get('[data-action="save-model-workspace"]').trigger('click'); await flushPromises()
    expect(f.modelRow()).toMatchObject({cacheType: '页面', IsBusinessMain: 1, IsBusiness: 0})
    expect(wrapper.text()).toContain('模型配置已保存并回读')
  })

  it('keeps unknown model writes dirty until explicit readback without a second write', async () => {
    const f = fixture()
    const {wrapper, instance} = await page()
    await select(wrapper, 'Orders')
    const editor = wrapper.get('[aria-label="模型配置编辑"]')
    await editor.get('[data-model-field="description"] input').setValue('未知回执')
    f.loseNextResponse()
    await wrapper.get('[data-action="save-model-workspace"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(true)
    expect(wrapper.get('[data-action="save-model-workspace"]').attributes('disabled')).toBeDefined()
    await editor.get('[data-action="verify-model"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false)
    expect(editor.text()).toContain('未重复提交'); expect(writes(f)).toHaveLength(1)
  })

  it('renders model field permissions without exposing hidden configuration', async () => {
    const f = fixture({hidden: true}); f.setModelValues({description: 'secret'})
    f.denyModelField('IsBusiness')
    const {wrapper} = await page()
    await select(wrapper, 'Orders')
    const editor = wrapper.getComponent(DataSpaceModelEditor)
    expect(editor.text()).not.toContain('secret')
    expect(editor.get('[data-model-field="description"]').text()).toContain('不可读')
    expect(boundChoiceProps(editor, '业务模型').disabled).toBe(true)
    expect(writes(f)).toHaveLength(0)
  })

  it('keeps legacy tree values read-only while view request choices follow the selected view', async () => {
    const f = fixture(); f.setModelValues({parentField: 'legacy-parent', OutputType: 'SelfRefData'})
    const {wrapper, instance} = await page(); await select(wrapper, 'default')
    const editor = wrapper.getComponent(DataSpaceViewEditor)
    const selector = editor.getComponent(RendererTabs)
    expect(selector.props('dataViewKey')).toBe(`${f.sessions[0]!.metadataDataSet.scenarioId}@DataViewDefinition@default`)
    const old = editor.get('[data-legacy-request]')
    const legacyFields = () => editor.findAllComponents(FieldText).filter(field => old.element.contains(field.element))
    expect(legacyFields()).toHaveLength(0)
    await old.get('button[aria-expanded]').trigger('click'); await flushPromises()
    expect(legacyFields()).toHaveLength(8)
    expect(legacyFields().every(field => field.props('readonly') === true)).toBe(true)
    const parent = legacyFields().find(field => field.props('field') === 'parentField')!
    expect(parent.get('input').element).toHaveProperty('value', 'legacy-parent')
    const parentField = parent.element
    await old.get('button[aria-expanded]').trigger('click'); await flushPromises()
    expect(legacyFields().find(field => field.props('field') === 'parentField')!.element).toBe(parentField)
    const rows = f.sessions[0]!.metadataDataSet.getView('DataViewDefinition')!
    const defaultKey = editor.props('rowKey')
    const shared = rows.rows.find(row => row['tableName'] === 'OrdersAlias' && row['viewId'] === 'shared')!
    const sharedKey = String(rows.getPkKey(shared))
    selector.vm.$emit('update:modelValue', sharedKey); await flushPromises()
    expect(editor.props('rowKey')).toBe(sharedKey)
    expect((await boundNumber(editor, 'pageSize')).element.value).toBe('12')
    const outputType = editor.get('[data-json-member="outputType"]').getComponent(ElRadioGroup)
    expect(outputType.props('disabled')).toBe(false)
    outputType.vm.$emit('update:modelValue', 'SelfRefData'); await flushPromises()
    expect(rows.getEditingRow(sharedKey)?.['queryConfig']).toEqual({outputType: 'SelfRefData'})
    selector.vm.$emit('update:modelValue', String(defaultKey)); await flushPromises()
    expect(editor.props('rowKey')).toBe(sharedKey)
    expect(instance.isDirty).toBe(true)
    await editor.get('[data-action="discard-view-edits"]').trigger('click'); await flushPromises()
    selector.vm.$emit('update:modelValue', String(defaultKey)); await flushPromises()
    expect(editor.props('rowKey')).toBe(defaultKey)
    expect(f.modelRow()).toMatchObject({parentField: 'legacy-parent', OutputType: 'SelfRefData'})
    expect(instance.isDirty).toBe(false); expect(writes(f)).toHaveLength(0); expect(f.fileWrites).toHaveLength(0)
  })
  it('retains null and unknown numeric flag formats without implicit model edits', async () => {
    const f = fixture(); f.setModelValues({cacheType: 'legacy-cache', IsBusiness: '1', IsBusinessMain: null, topValue: null})
    const {wrapper, instance} = await page()
    await select(wrapper, 'Orders')
    const editor = wrapper.getComponent(DataSpaceModelEditor)
    expect(instance.isDirty).toBe(false)
    expect(boundSelect(editor, '业务模型').props('modelValue')).toBe('1')
    expect(editor.text()).toContain('未确认，保留')
    await writeBound(editor, 'description', 'only description')
    await wrapper.get('[data-action="save-model-workspace"]').trigger('click'); await flushPromises()
    expect(f.modelRow()).toMatchObject({cacheType: 'legacy-cache', IsBusiness: '1', IsBusinessMain: null, topValue: null})
    expect(writes(f)).toHaveLength(1)
    expect(JSON.stringify(writes(f)[0]?.data)).not.toMatch(/IsBusiness|topValue|cacheType/)
  })

  it('binds primary key choices to a two-parent cascade and saves through the original metadata views', async () => {
    const f = fixture({allowSourceEdit: true, editableFieldProperties: ['IsPKey', 'IsOutput'], sourceFields: [
      {rowid: 'PK', dataModelId: 'M1', Name: 'rowid', type: 'dataModel', FieldType: 'string', IsPKey: 1, IsOutput: 1},
      {rowid: 'CODE', dataModelId: 'M1', Name: 'code', type: 'dataModel', FieldType: 'string', IsPKey: 0, IsOutput: 0},
      {rowid: 'CALC', dataModelId: 'M1', Name: 'computed', type: 'dataModel', FieldType: '计算字段', IsPKey: 0, IsOutput: 0},
    ]})
    f.setModelValues({Type: 'JSON', PrimaryKeyFields: 'rowid'})
    const session = await f.open('A'), editor = await modelEditor(session)
    wrappers.push(editor); await flushPromises()
    const dataSet = session.metadataDataSet, models = dataSet.getView('Base_DataModel')!
    const cascade = dataSet.viewCascades?.find(item => item.kind === 'field' && item.targetField === 'PrimaryKeyFields')
    expect(cascade).toMatchObject({kind: 'field', parents: [expect.objectContaining({field: 'dataSetId'}), expect.objectContaining({field: 'rowid'})]})
    expect((await openBoundSelect(editor, '正式主键字段')).findAllComponents(ElOption).map(option => option.props('value'))).toEqual(['', 'rowid', 'code'])
    await chooseBound(editor, '正式主键字段', 'code')
    expect(models.getEditingRow('M1')?.['PrimaryKeyFields']).toBe('code')
    expect(models.rows[0]?.['PrimaryKeyFields']).toBe('rowid')
    await editor.get('[data-action="cancel-model"]').trigger('click'); await flushPromises()
    expect(boundSelect(editor, '正式主键字段').props('modelValue')).toBe('rowid')
    expect(writes(f)).toHaveLength(0)
    await chooseBound(editor, '正式主键字段', 'code')
    await editor.get('[data-action="save-model"]').trigger('click'); await flushPromises()
    expect(editor.text()).toContain('模型配置已保存并回读')
    expect(f.modelRow()).toMatchObject({PrimaryKeyFields: 'code'})
    expect(writes(f)).toHaveLength(1)
  })

  it('rejects an unavailable view request tree field without changing the legacy model or stored file', async () => {
    const f = fixture(); f.setModelValues({parentField: 'legacy-parent'})
    const {wrapper, instance} = await page(); await select(wrapper, 'default')
    const original = f.stored.get('A')
    const editor = wrapper.getComponent(DataSpaceViewEditor)
    await openViewProperties(editor)
    await editor.get('[data-edit-property="queryConfig"]').trigger('click'); await flushPromises()
    await writeJsonBound(editor, 'queryConfig', {outputType: 'SelfRefData', tree: {keyField: 'rowid', parentField: 'missing', nodeId: 'ROOT', mode: 'child'}})
    await editor.get('[data-action="finish-view-property"]').trigger('click'); await flushPromises()
    await editor.get('[data-action="save-views"]').trigger('click'); await flushPromises()
    expect(editor.get('[role="alert"]').text()).toContain('missing')
    expect(instance.isDirty).toBe(true); expect(f.fileWrites).toHaveLength(0); expect(f.stored.get('A')).toBe(original)
    await editor.get('[data-action="discard-view-edits"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false); expect(writes(f)).toHaveLength(0); expect(f.modelRow().parentField).toBe('legacy-parent')
  })
  it('keeps bound model controls locked by the editor and restores original permissions on unlock', async () => {
    const f = fixture(), session = await f.open('A')
    f.denyModelField('IsBusinessMain')
    const editor = await modelEditor(session)
    wrappers.push(editor); await flushPromises()
    await f.sessions[0]!.getModelEdit('M1').reload(false)
    await editor.setProps({disabled: true, revision: (editor.props('revision') ?? 0) + 1}); await flushPromises()
    expect(boundChoiceProps(editor, '业务模型').disabled).toBe(true)
    expect(editor.get('[data-model-field="description"] input').attributes('disabled')).toBeDefined()
    await editor.setProps({disabled: false}); await flushPromises()
    expect(boundChoiceProps(editor, '业务模型').disabled).toBe(false)
    expect(boundChoiceProps(editor, '业务主模型').disabled).toBe(true)
    expect(writes(f)).toHaveLength(0)
  })

  it('explicitly migrates a source parameter, saves only ValueFun and uses it in a new query', async () => {
    const f = fixture({sourceInput: true})
    const {wrapper, instance} = await page()
    await select(wrapper, 'customerArg')
    const original = f.sourceValue()
    const boundFunction = wrapper.getComponent(FieldValueFunction)
    expect(boundFunction.props('dataViewKey')).toBe('META@Base_DataModel_Field@default')
    expect(boundFunction.props('field')).toBe('ValueFun')
    expect(boundFunction.props('modelValue')).toBeUndefined()
    expect(wrapper.get('[data-legacy-source-input]').text()).toBe(original.trim())
    expect(writes(f)).toHaveLength(0)
    await chooseSourceParameter(wrapper)
    expect(instance.isDirty).toBe(true)
    expect(f.sourceValue()).toBe(original)
    await wrapper.get('[data-action="save-source-input"]').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('本次来源入参已保存')
    expect(instance.isDirty).toBe(false)
    expect(writes(f)).toHaveLength(1)
    expect(writes(f)[0]?.data).toEqual([expect.objectContaining({TableName: 'Base_DataModel_Field', CrudModel: expect.objectContaining({
      Changed: [expect.objectContaining({rowid: 'F2', ValueFun: '{"Type":"GetInputParam","ParamName":"customer"}', lingma_sys_key: 'token-A-F2'})],
    })})])
    expect(wrapper.text()).toContain('订单编号')
    expect(f.fileWrites).toHaveLength(0)
    const reopened = await f.open('A')
    expect(reopened.metadataDataSet.getView('Base_DataModel_Field', 'default')!.rows).toHaveLength(2)
    const business = reopened.definitionDataSet!.getView('OrdersAlias', 'shared')!
    business.queryContext = {customer: ['C1', 'C2']}
    expect((await business.loadFromServer()).success).toBe(true)
    const query = f.requests.at(-1)?.data
    expect(isRecord(query) && Array.isArray(query['Table']) && query['Table'][0]).toMatchObject({Name: 'Orders',
      inputParams: expect.arrayContaining([{Name: 'customerArg', Value: ['C1', 'C2']}])})
  })

  it('protects an open source dialog and cancels without changing legacy text', async () => {
    const f = fixture({sourceInput: true})
    const {wrapper, instance, dynamic} = await page()
    await select(wrapper, 'customerArg')
    await wrapper.getComponent(FieldValueFunction).get('[data-function-open]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(true)
    expect(() => dynamic.closeSystemPageInstance(instance.instanceId)).toThrow('未保存')
    await select(wrapper, 'Customers')
    expect(wrapper.get('.design-detail h2').text()).toBe('customerArg')
    expect(wrapper.getComponent(FilterValueFunctionDialog).props('modelValue')).toBe(true)
    await new DOMWrapper(document.body).findAll('button').find(item => item.text() === '取消')!.trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false)
    expect(f.sourceValue()).toContain('SystemData')
    expect(writes(f)).toHaveLength(0)
  })

  it('recovers an unknown source write without replay and preserves the whole field collection', async () => {
    const f = fixture({sourceInput: true}); f.loseNextResponse()
    const {wrapper, instance} = await page()
    await select(wrapper, 'customerArg'); await chooseSourceParameter(wrapper)
    await wrapper.get('[data-action="save-source-input"]').trigger('click'); await flushPromises()
    expect(wrapper.get('[data-action="save-source-input"]').attributes('disabled')).toBeDefined()
    expect(instance.isDirty).toBe(true)
    await wrapper.get('[data-action="verify-source-input"]').trigger('click'); await flushPromises()
    expect(writes(f)).toHaveLength(1)
    expect(instance.isDirty).toBe(false)
    expect(f.sessions[0]!.metadataDataSet.getView('Base_DataModel_Field', 'default')!.rows).toHaveLength(2)
    expect(wrapper.text()).toContain('已重新读取来源入参')
  })

  it.each([{readOnly: true}, {hidden: true}])('enforces current source field permissions in the page: %j', async options => {
    const f = fixture({...options, sourceInput: true})
    const {wrapper} = await page()
    await select(wrapper, 'customerArg')
    expect(wrapper.get('[data-action="save-source-input"]').attributes('disabled')).toBeDefined()
    if (options.hidden) expect(wrapper.text()).not.toContain('SystemData')
    else expect(wrapper.getComponent(FieldValueFunction).get('[data-function-open]').attributes('disabled')).toBeDefined()
    expect(writes(f)).toHaveLength(0)
  })

  it('blocks closing the native page while a source save is in flight', async () => {
    const f = fixture({sourceInput: true})
    const {wrapper, instance, dynamic} = await page()
    await select(wrapper, 'customerArg'); await chooseSourceParameter(wrapper)
    const release = f.holdSourceResponse()
    await wrapper.get('[data-action="save-source-input"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(true)
    expect(() => dynamic.closeSystemPageInstance(instance.instanceId)).toThrow('未保存')
    expect(writes(f)).toHaveLength(1)
    release(); await flushPromises()
    expect(instance.isDirty).toBe(false)
    expect(wrapper.text()).toContain('本次来源入参已保存')
  })

  it('reports an invalid projection and allows explicit repair without hiding it as an empty filter', async () => {
    const f = fixture()
    f.stored.set('A', JSON.stringify({scenarioId: 'A', tables: {OrdersAlias: {
      modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {default: {}, shared: {
        fieldProjection: [{fieldId: 'Orders-rowid', source: 'resource', resourceFieldId: 'Orders-rowid', resourceField: 'rowid',
          viewField: 'orderId', type: 'string', label: '编号', output: true, sortOrder: 0, sortDirection: null, group: 0,
          distinct: false, primaryKey: true, value: '', valueFunction: '', expression: ''}],
      }},
    }}}))
    const {wrapper} = await page()
    await select(wrapper, 'shared')
    await openViewProperties(wrapper)
    await wrapper.get('[data-edit-property="filterExpression"]').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('投影不得覆盖正式模型字段身份或计算定义')
    expect(wrapper.find('[data-action="open"]').exists()).toBe(false)
    expect(f.fileWrites).toHaveLength(0)
    expect(wrapper.find('[data-action="finish-view-property"]').exists()).toBe(false)
    await openViewProperties(wrapper)
    await wrapper.get('[data-clear-property="fieldProjection"]').trigger('click')
    await wrapper.get('[data-action="save-views"]').trigger('click'); await flushPromises()
    expect(f.fileWrites).toHaveLength(1)
    const reopened = await f.open('A')
    const row = reopened.metadataDataSet.getView('DataViewDefinition', 'default')!.rows.find(item => item['viewId'] === 'shared')
    expect(row).not.toHaveProperty('fieldProjection')
    expect(reopened.definitionDataSet?.getView('OrdersAlias', 'shared')).toBeDefined()
  }, 15_000)

  it('binds optional view booleans directly, preserving unset, cancel and independently reopened values', async () => {
    const f = fixture()
    const {wrapper, instance} = await page()
    await select(wrapper, 'default')
    const editor = wrapper.getComponent(DataSpaceViewEditor)
    const metadata = f.sessions[0]!.metadataDataSet
    const view = metadata.getView('DataViewDefinition', 'default')!
    const row = view.rows.find(item => item['tableName'] === 'OrdersAlias' && item['viewId'] === 'default')!
    const key = view.getPkKey(row)!
    expect(view.hasEditingChanges()).toBe(false)
    expect(instance.isDirty).toBe(false)
    expect(editor.findAll('form form')).toHaveLength(0)
    await openViewProperties(editor)
    await editor.get('[data-edit-property="treeConfig"]').trigger('click'); await flushPromises()
    expect(JSON.parse(editor.getComponent(FieldJson).getComponent(JsonTreeEditor).props('modelValue')!)).toEqual({value:{}})
    expect(view.hasEditingChanges()).toBe(false)
    await editor.get('[data-action="finish-view-property"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false)
    for (const name of ['autoLoad', 'autoSelectFirst', 'autoCurrentFirst']) {
      await openViewProperties(editor)
      const form = editor.findAllComponents(RendererForm).find(item => item.find(`[data-property="${name}"]`).exists())!
      expect(resolveDataViewKey(form.props('dataViewKey')!, metadata)).toBe(view)
      expect(form.get(`[data-property="${name}"]`).getComponent(FieldCheckbox).props('field')).toBe(name)
      await openViewProperties(editor)
      expect(editor.get(`[data-property="${name}"]`).text()).toContain('未配置')
    }
    await openViewProperties(editor)
    expect(editor.get('[data-property="pageSize"]').text()).toContain('未配置')
    await chooseBound(editor, '自动加载', 0)
    expect(view.getEditingRow(key)?.['autoLoad']).toBe(false)
    await openViewProperties(editor)
    await editor.get('[data-clear-property="autoLoad"]').trigger('click'); await flushPromises()
    expect(view.getEditingRow(key)?.['autoLoad']).toBeUndefined()
    expect(instance.isDirty).toBe(false)
    await chooseBound(editor, '自动加载', 1)
    expect(view.getEditingRow(key)?.['autoLoad']).toBe(true)
    await openViewProperties(editor)
    await editor.get('[data-clear-property="autoLoad"]').trigger('click'); await flushPromises()
    expect(boundChoiceProps(editor, '自动加载').modelValue).toBe(false)
    await openViewProperties(editor)
    expect(editor.get('[data-property="autoLoad"]').text()).toContain('未配置')
    expect(instance.isDirty).toBe(false)
    await chooseBound(editor, '取值字段候选', 'rowid')
    await chooseBound(editor, '自动加载', 0)
    await editor.get('[data-action="save-views"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false)
    const reopened = await f.open('A')
    const saved = reopened.metadataDataSet.getView('DataViewDefinition', 'default')!.rows.find(item => item['tableName'] === 'OrdersAlias' && item['viewId'] === 'default')!
    expect(saved).toMatchObject({autoLoad: false, valueField: 'rowid'})
    for (const field of ['autoSelectFirst', 'autoCurrentFirst', 'page', 'pageSize', 'selectionDelimiter']) expect(saved).not.toHaveProperty(field)
    const reads = f.requests.length
    await chooseBound(editor, '自动加载', 1)
    await editor.get('[data-action="discard-view-edits"]').trigger('click'); await flushPromises()
    expect(boundChoiceProps(editor, '自动加载').modelValue).toBe(false)
    expect(view.getEditingRow(key)?.['autoLoad']).toBe(false)
    expect(f.requests).toHaveLength(reads)
    expect(f.fileWrites).toHaveLength(1)
    expect(instance.isDirty).toBe(false)
    expect(f.stored.get('A')).not.toContain('ViewControls_')
    await select(wrapper, '输入参数')
    expect(Object.keys(metadata.tables).some(name => name.startsWith('ViewControls_'))).toBe(false)
    expect(metadata.viewCascades?.some(cascade => cascade.cascadeId?.startsWith('ViewControls_'))).toBe(false)
    expect(writes(f)).toHaveLength(0)
  }, 15_000)

  it('persists typed selection and tree configuration and clears only explicit properties', async () => {
    const f = fixture({overviewOnly: true})
    const {wrapper} = await page()
    await select(wrapper, 'shared')
    await openViewProperties(wrapper)
    expect(wrapper.findAll('[data-property]')).toHaveLength(15)
    expect(wrapper.find('[data-property="aggregates"]').exists()).toBe(false)
    await openViewProperties(wrapper)
    expect(wrapper.find('[data-property="queryConfig"]').exists()).toBe(true)
    const editor = wrapper.getComponent(DataSpaceViewEditor)
    const metadata = f.sessions[0]!.metadataDataSet
    const definition = metadata.getView('DataViewDefinition', 'default')!
    const forms = editor.findAllComponents(RendererForm)
    for (const form of forms) {
      expect(form.props('dataSource')).toBeUndefined()
      expect(form.props('contextDataMember')).toBe('currentRow')
      const key = form.props('dataViewKey')
      expect(key).toMatch(new RegExp(`^${metadata.scenarioId}@[^@]+@default$`))
      expect(resolveDataViewKey(key!, metadata)).toBeDefined()
    }
    expect(forms.some(form => resolveDataViewKey(form.props('dataViewKey')!, metadata) === definition)).toBe(true)
    const saveButton = editor.findAllComponents(RendererButton).find(button => button.attributes('data-action') === 'save-views')
    expect(saveButton?.text()).toBe('保存视图配置')
    // Follow the user sequence; opening one dropdown can close another through the native focus chain.
    await chooseBound(editor, '显示字段', 'rowid')
    await chooseBound(editor, '自动加载', 0)
    await chooseBound(editor, '自动选中首行', 0)
    await chooseBound(editor, '提交方式', 'staged')
    await writeBound(editor, 'selectionDelimiter', '|')
    await openViewProperties(wrapper)
    await wrapper.get('[data-clear-property="pageSize"]').trigger('click')
    const tree = {idField: 'rowid', parentIdField: 'parentId', treeMode: 'flat', lazy: false, depthLimit: 4,
      textField: 'rowid', serverPaginationMode: 'root', filterMode: 'include-ancestors'}
    // Exercise the public JSON editor output; VXE rendering is outside this persistence test.
    for (const [property, value] of Object.entries({treeConfig: tree, valueField: ['rowid']})) {
      await openViewProperties(wrapper)
      await wrapper.get(`[data-edit-property="${property}"]`).trigger('click')
      const jsonField=editor.getComponent(FieldJson)
      expect(jsonField.props('field')).toBe(property)
      expect(resolveDataViewKey(jsonField.props('dataViewKey')!,metadata)).toBe(definition)
      expect(boundSelect(editor, '取值字段候选').props('disabled')).toBe(true)
      await writeJsonBound(editor, property, value)
      await flushPromises()
      await wrapper.get('[data-action="finish-view-property"]').trigger('click')
    }
    await saveButton!.trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('视图配置已保存并回读确认')
    const reopened = await f.open('A')
    const row = reopened.metadataDataSet.getView('DataViewDefinition', 'default')!.rows.find(item => item['tableName'] === 'OrdersAlias' && item['viewId'] === 'shared')!
    expect(row).toMatchObject({autoLoad: false, autoSelectFirst: false, commitMode: 'staged', selectionDelimiter: '|',
      treeConfig: tree, valueField: ['rowid'], labelField: 'rowid'})
    expect(row).not.toHaveProperty('pageSize')
    expect(reopened.definitionDataSet?.getView('OrdersAlias', 'shared')?.autoLoad).toBe(false)
    expect(f.fileWrites).toHaveLength(1)
    for (const current of [f.sessions[0]!, reopened]) {
      for (const name of ['Base_DataModel_Field', 'Base_DataModel_Relation']) {
        expect(current.metadataDataSet.getView(name)!.requestState).toBe(current === f.sessions[0] && name === 'Base_DataModel_Relation' ? RequestState.Loaded : RequestState.Idle)
      }
    }
  })


  it('persists typed call parameters together with the JSON tree filter through the selected view', async () => {
    const f = fixture({overviewOnly: true})
    const {wrapper} = await page()
    await select(wrapper, 'shared')
    const editor = wrapper.getComponent(DataSpaceViewEditor), metadata = f.sessions[0]!.metadataDataSet
    const definition = metadata.getView('DataViewDefinition', 'default')!
    await openViewProperties(wrapper)
    await wrapper.get('[data-edit-property="queryContext"]').trigger('click')
    const jsonField = editor.getComponent(FieldJson)
    expect(jsonField.props('field')).toBe('queryContext')
    expect(resolveDataViewKey(jsonField.props('dataViewKey')!, metadata)).toBe(definition)
    expect(boundSelect(editor, '取值字段候选').props('disabled')).toBe(true)
    const queryContext = {customer: 'a,b', count: 0, enabled: false}
    await writeJsonBound(editor, 'queryContext', queryContext)
    await wrapper.get('[data-action="finish-view-property"]').trigger('click')
    await openViewProperties(wrapper)
    await wrapper.get('[data-edit-property="filterExpression"]').trigger('click'); await flushPromises()
    const dialog = editor.getComponent(RendererFilterExpression)
    expect(dialog.props('display')).toBe('inline')
    await dialog.get('[data-action="json"]').trigger('click')
    const filter = {field: 'rowid', operator: 'eq', value: 'a,b'}
    editor.getComponent(RendererFilterExpression).getComponent(JsonTreeEditor).vm.$emit('update:modelValue', JSON.stringify(filter)); await flushPromises()
    await dialog.get('[data-action="apply"]').trigger('click')
    await wrapper.get('[data-action="finish-view-property"]').trigger('click')
    await editor.get('[data-action="save-views"]').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('视图配置已保存并回读确认')
    const reopened = await f.open('A')
    const row = reopened.metadataDataSet.getView('DataViewDefinition')!.rows.find(item => item['tableName'] === 'OrdersAlias' && item['viewId'] === 'shared')!
    expect(row).toMatchObject({filterExpression: filter, queryContext})
    expect(reopened.definitionDataSet?.getView('OrdersAlias', 'shared')?.filterExpression).toEqual(filter)
    expect(reopened.definitionDataSet?.getView('OrdersAlias', 'default')?.filterExpression).toBeUndefined()
    expect(f.fileWrites).toHaveLength(1); expect(writes(f)).toHaveLength(0)
    for (const current of [f.sessions[0]!, reopened]) {
      for (const name of ['Base_DataModel_Field', 'Base_DataModel_Relation']) {
        expect(current.metadataDataSet.getView(name)!.requestState).toBe(current === f.sessions[0] && name === 'Base_DataModel_Relation' ? RequestState.Loaded : RequestState.Idle)
      }
    }
  }, 15_000)
  it('keeps an invalid saved field reference visible until explicitly repaired through its bound control', async () => {
    const f = fixture()
    await f.open('A')
    const config: unknown = JSON.parse(f.stored.get('A')!)
    if (!isRecord(config) || !isRecord(config['tables']) || !isRecord(config['tables']['OrdersAlias'])
      || !isRecord(config['tables']['OrdersAlias']['views'])) throw new Error('missing saved views')
    config['tables']['OrdersAlias']['views']['shared'] = {labelField: 'missing-field'}
    f.stored.set('A', JSON.stringify(config))
    const {wrapper, instance} = await page()
    await select(wrapper, 'shared')
    const editor = wrapper.getComponent(DataSpaceViewEditor)
    await openViewProperties(editor, '结果组织与编辑配置')
    expect(boundSelect(editor, '显示字段').props('modelValue')).toBe('missing-field')
    expect(editor.get('[data-property="labelField"]').text()).toContain('引用已失效')
    expect(instance.isDirty).toBe(false)
    expect(f.fileWrites).toHaveLength(0)
    await openViewProperties(editor, '结果组织与编辑配置')
    await editor.get('[data-clear-property="labelField"]').trigger('click'); await flushPromises()
    await editor.get('[data-action="save-views"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false)
    expect((await f.open('A')).definitionDataSet?.getView('OrdersAlias', 'shared')).toBeDefined()
    await chooseBound(editor, '显示字段', 'rowid')
    await editor.get('[data-action="save-views"]').trigger('click'); await flushPromises()
    expect((await f.open('A')).definitionDataSet?.getView('OrdersAlias', 'shared')?.labelField).toBe('rowid')
    expect(writes(f)).toHaveLength(0)
  })

  it('adds a named view to the unique formal model binding and resolves it after independent reopen', async () => {
    const f = fixture(), {wrapper} = await page()
    await select(wrapper, 'Orders')
    const editor = wrapper.getComponent(DataSpaceViewEditor)
    const choices = (await openBoundSelect(editor, '已有模型绑定')).findAllComponents(ElOption).map(option => option.props('value'))
    expect(choices).toEqual(['OrdersAlias'])
    expect(editor.findAllComponents(FieldText).map(field => field.props('field'))).not.toContain('newTable')
    await writeBound(editor, 'newName', 'review')
    await editor.get('[data-action="add-view"]').trigger('click'); await flushPromises()
    await editor.get('[data-action="save-views"]').trigger('click'); await flushPromises()
    expect(f.fileWrites, editor.text()).toHaveLength(1); expect(writes(f)).toEqual([])
    const fresh = await f.open('A')
    try {
      const dataSet = fresh.definitionDataSet!
      expect(resolveDataViewKey('A@Orders@review', dataSet)).toBe(dataSet.getView('OrdersAlias', 'review'))
      expect(Object.values(dataSet.tables).filter(table => table.modelBinding?.modelId === 'M1')).toHaveLength(1)
      expect(dataSet.getView('OrdersAlias', 'shared')?.pageSize).toBe(12)
    } finally {fresh.dispose()}
  })

  it('rejects duplicate view names without replacing configuration or offering another binding', async () => {
    const f = fixture()
    const {wrapper} = await page()
    await select(wrapper, 'Orders')
    await writeBound(wrapper, 'newName', 'shared')
    await wrapper.get('[data-action="add-view"]').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('已有同名视图')
    const choices = (await openBoundSelect(wrapper, '已有模型绑定')).findAllComponents(ElOption).map(option => option.props('value'))
    expect(choices).toEqual(['OrdersAlias'])
    expect(f.sessions[0]!.viewState?.dirty).toBe(false)
    expect(f.sessions[0]!.definitionStatus).toBe('unloaded')
    expect(f.sessions[0]!.metadataDataSet.getView('DataViewDefinition')!.rows.find(row => row['tableName'] === 'OrdersAlias' && row['viewId'] === 'shared')?.['pageSize']).toBe(12)
    expect(f.fileWrites).toHaveLength(0)
  })

  it('blocks switching and closing while a view draft exists and rejects stale-scope saves', async () => {
    const f = fixture()
    const {wrapper, instance, dynamic} = await page()
    await select(wrapper, 'default')
    expect(wrapper.get('[data-action="remove-view"]').attributes('disabled')).toBeDefined()
    await select(wrapper, 'shared')
    await (await boundNumber(wrapper, 'pageSize')).setValue('32')
    await select(wrapper, 'Customers')
    expect(wrapper.text()).toContain('先保存或明确处理当前视图草稿')
    expect(wrapper.get('.design-detail h2').text()).toBe('shared')
    expect(instance.isDirty).toBe(true)
    expect(() => dynamic.closeSystemPageInstance(instance.instanceId)).toThrow('未保存')
    f.invalidate()
    await wrapper.get('[data-action="save-views"]').trigger('click'); await flushPromises()
    expect(f.sessions[0]!.metadataDataSet.destroyed).toBe(true)
    expect(wrapper.text()).toContain('DATA_SPACE_DESIGN_SESSION_DISPOSED')
    expect(f.fileWrites).toHaveLength(0)
  })

  it('edits one model view in the metadata table and persists it through the original file owner', async () => {
    const f = fixture()
    const {wrapper, instance} = await page()
    await select(wrapper, 'shared')
    await (await boundNumber(wrapper, 'pageSize')).setValue('31')
    const view = f.sessions[0]!.metadataDataSet.getView('DataViewDefinition', 'default')!
    const row = view.rows.find(item => item['tableName'] === 'OrdersAlias' && item['viewId'] === 'shared')!
    expect(view.getEditingRow(view.getPkKey(row)!)?.['pageSize']).toBe(31)
    expect(instance.isDirty).toBe(true)
    expect(f.fileWrites).toHaveLength(0)
    await wrapper.get('[data-action="save-views"]').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('视图配置已保存并回读确认')
    expect(instance.isDirty).toBe(false)
    expect(f.fileWrites).toHaveLength(1)
    const reopened = await f.open('A')
    expect(reopened.definitionDataSet?.getView('OrdersAlias', 'shared')?.pageSize).toBe(31)
    expect(reopened.definitionDataSet?.getView('CustomersAlias', 'shared')?.pageSize).toBe(24)
    expect(writes(f)).toHaveLength(0)
    expect(f.fileWrites[0]?.text).not.toMatch(/DataViewDefinition|"rows"|dataModelId/)
  })

  it('creates the first binding explicitly for a missing file and persists the chosen named view', async () => {
    const f = fixture({missing: true})
    const {wrapper} = await page()
    await select(wrapper, 'Orders')
    await writeBound(wrapper, 'newTable', 'OrderBinding')
    await writeBound(wrapper, 'newName', 'detail')
    await wrapper.get('[data-action="add-view"]').trigger('click'); await flushPromises()
    expect(f.fileWrites).toHaveLength(0)
    await wrapper.get('[data-action="save-views"]').trigger('click'); await flushPromises()
    const reopened = await f.open('A')
    expect(reopened.definitionDataSet?.getView('OrderBinding', 'detail')).toBeDefined()
    expect(reopened.definitionDataSet?.getView('OrderBinding', 'default')).toBeDefined()
    expect(f.fileWrites).toHaveLength(1)
  })

  it.each(['cancel', 'save'] as const)('refreshes implicit default views after later edits are resolved by %s', async resolution => {
    const f = fixture({missing: true}), {wrapper} = await page()
    await select(wrapper, 'Orders')
    await writeBound(wrapper, 'newTable', 'OrderBinding'); await writeBound(wrapper, 'newName', 'detail')
    await wrapper.get('[data-action="add-view"]').trigger('click'); await flushPromises()
    const dataSet = f.sessions[0]!.metadataDataSet, views = dataSet.getView('DataViewDefinition')!
    const save = dataSet.saveChanges.bind(dataSet)
    vi.spyOn(dataSet, 'saveChanges').mockImplementationOnce(async options => {
      const result = await save(options)
      const row = views.rows.find(row => row['tableName'] === 'OrderBinding' && row['viewId'] === 'detail')!
      views.updateEditingValue(views.getPkKey(row)!, 'pageSize', 39)
      return result
    })
    await wrapper.get('[data-action="save-views"]').trigger('click'); await flushPromises()
    expect(views.hasEditingChanges()).toBe(true)
    expect(views.rows.some(row => row['tableName'] === 'OrderBinding' && row['viewId'] === 'default')).toBe(false)
    expect(f.fileWrites).toHaveLength(1)
    await wrapper.get(`[data-action="${resolution === 'cancel' ? 'discard-view-edits' : 'save-views'}"]`).trigger('click')
    await vi.waitFor(() => expect(views.rows.some(row => row['tableName'] === 'OrderBinding' && row['viewId'] === 'default')).toBe(true))
    expect(views.hasEditingChanges()).toBe(false)
    expect(f.fileWrites).toHaveLength(resolution === 'save' ? 2 : 1)
    const reopened = await f.open('A')
    expect(reopened.definitionDataSet?.getView('OrderBinding', 'default')).toBeDefined()
    if (resolution === 'save') expect(reopened.definitionDataSet?.getView('OrderBinding', 'detail')?.pageSize).toBe(39)
  })

  it('reports a confirmed save with failed directory readback and retries the read without writing again', async () => {
    const f = fixture({missing: true}), {wrapper} = await page()
    await select(wrapper, 'Orders')
    await writeBound(wrapper, 'newTable', 'OrderBinding'); await writeBound(wrapper, 'newName', 'detail')
    await wrapper.get('[data-action="add-view"]').trigger('click'); await flushPromises()
    const views = f.sessions[0]!.metadataDataSet.getView('DataViewDefinition')!
    vi.spyOn(views, 'loadFromServer').mockRejectedValueOnce(new Error('目录查询暂不可用'))
    await wrapper.get('[data-action="save-views"]').trigger('click'); await flushPromises()
    expect(f.fileWrites).toHaveLength(1)
    expect(wrapper.text()).toContain('保存已确认，目录回读未完成')
    expect(wrapper.text()).not.toContain('视图配置已保存并回读确认')
    await wrapper.get('[data-action="reload-view-directory"]').trigger('click'); await flushPromises()
    expect(views.requestState).toBe(RequestState.Loaded)
    expect(views.rows.some(row => row['tableName'] === 'OrderBinding' && row['viewId'] === 'default')).toBe(true)
    expect(f.fileWrites).toHaveLength(1)
  })

  it('keeps invalid native edits for correction and explicitly cancels them', async () => {
    const f = fixture()
    const {wrapper, instance} = await page()
    await select(wrapper, 'shared')
    await (await boundNumber(wrapper, 'pageSize')).setValue('0')
    await wrapper.get('[data-action="save-views"]').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('pageSize')
    expect(f.fileWrites).toHaveLength(0)
    expect(instance.isDirty).toBe(true)
    await wrapper.get('[data-action="discard-view-edits"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false)
    expect((await boundNumber(wrapper, 'pageSize')).element).toHaveProperty('value', '12')
  })

  it.each([false, true])('consumes a confirmed property receipt without querying definitions again (unknown=%s)', async unknown => {
    const f = fixture()
    const {wrapper, instance} = await page()
    await select(wrapper, 'shared')
    const editor = wrapper.getComponent(DataSpaceViewEditor)
    await openViewProperties(editor, '其他请求配置与完整编辑')
    const pageSize = editor.findAllComponents(FieldNumber).find(field => field.props('field') === 'pageSize')!
    expect(pageSize.props('modelValue')).toBeUndefined()
    await pageSize.get('input').setValue('47'); await flushPromises()
    const metadata = f.sessions[0]!.metadataDataSet
    const refreshes = [metadata.getView('DataViewDefinition')!, metadata.getView('DataTableBindingDefinition')!,
      metadata.getView('DataTableBindingDefinition', 'fileModels')!].map(view => vi.spyOn(view, 'refresh'))
    if (unknown) f.loseNextFileResponse()
    await editor.get('[data-action="save-views"]').trigger('click'); await flushPromises()
    if (unknown) {
      expect(instance.isDirty).toBe(true)
      expect(f.fileWrites).toHaveLength(1)
      await editor.get('[data-action="verify-views"]').trigger('click'); await flushPromises()
    }
    for (const refresh of refreshes) expect(refresh.mock.calls.length).toBe(0)
    expect(instance.isDirty).toBe(false)
    expect(f.fileWrites).toHaveLength(1)
    expect(writes(f)).toHaveLength(0)
    expect((await f.open('A')).definitionDataSet?.getView('OrdersAlias', 'shared')?.pageSize).toBe(47)
    await pageSize.get('input').setValue('48'); await flushPromises()
    expect(instance.isDirty).toBe(true)
    await editor.get('[data-action="discard-view-edits"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false)
    expect(pageSize.get('input').element.value).toBe('47')
    expect(f.fileWrites).toHaveLength(1)
  })

  it.each([false, true])('shows remaining native view edits after a stored property receipt (unknown=%s)', async unknown => {
    const f = fixture(), {wrapper, instance} = await page()
    await select(wrapper, 'shared')
    await (await boundNumber(wrapper, 'pageSize')).setValue('47')
    const definitions = f.sessions[0]!.metadataDataSet.getView('DataViewDefinition')!
    const row = definitions.rows.find(item => item['tableName'] === 'OrdersAlias' && item['viewId'] === 'shared')!
    const key = definitions.getPkKey(row)!, release = f.holdFileResponse()
    if (unknown) f.loseNextFileResponse()
    try {
      await wrapper.get('[data-action="save-views"]').trigger('click'); await flushPromises()
      expect(f.fileWrites).toHaveLength(1)
      expect((await boundNumber(wrapper, 'pageSize')).attributes('disabled')).toBeDefined()
      definitions.updateEditingValue(key, 'pageSize', 58)
      release(); await flushPromises()
      if (unknown) {
        await wrapper.get('[data-action="verify-views"]').trigger('click'); await flushPromises()
      }
      expect(f.fileWrites).toHaveLength(1)
      expect(definitions.getEditingRow(key)?.['pageSize']).toBe(58)
      expect(instance.isDirty).toBe(true)
      expect(wrapper.getComponent(DataSpaceViewEditor).text()).toContain('仍有修改待保存')
      expect(wrapper.get('[data-action="save-views"]').attributes('disabled')).toBeUndefined()
      expect((await f.open('A')).definitionDataSet?.getView('OrdersAlias', 'shared')?.pageSize).toBe(47)
      await wrapper.get('[data-action="save-views"]').trigger('click'); await flushPromises()
      expect(f.fileWrites).toHaveLength(2)
      expect(instance.isDirty).toBe(false)
      expect(wrapper.getComponent(DataSpaceViewEditor).text()).toContain('视图配置已保存并回读确认')
      expect((await f.open('A')).definitionDataSet?.getView('OrdersAlias', 'shared')?.pageSize).toBe(58)
    } finally {release()}
  }, 15000)

  it('verifies an unknown view file save without replaying the write', async () => {
    const f = fixture(); f.loseNextFileResponse()
    const {wrapper, instance} = await page()
    await select(wrapper, 'shared')
    await (await boundNumber(wrapper, 'pageSize')).setValue('27')
    await wrapper.get('[data-action="save-views"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(true)
    expect(wrapper.get('[data-action="save-views"]').attributes('disabled')).toBeDefined()
    expect((await boundNumber(wrapper, 'pageSize')).attributes('disabled')).toBeDefined()
    expect(boundChoiceProps(wrapper, '自动加载').disabled).toBe(true)
    expect(boundSelect(wrapper, '取值字段候选').props('disabled')).toBe(true)
    await wrapper.get('[data-action="verify-views"]').trigger('click'); await flushPromises()
    expect(f.fileWrites).toHaveLength(1)
    expect(instance.isDirty).toBe(false)
    expect(wrapper.text()).toContain('已核验并确认保存结果')
  })

  it('adds, cancels and deletes a named view without losing the editing entry', async () => {
    const f = fixture()
    const {wrapper, instance} = await page()
    await select(wrapper, 'Orders')
    await writeBound(wrapper, 'newName', 'detail')
    await wrapper.get('[data-action="add-view"]').trigger('click'); await flushPromises()
    expect(wrapper.find('[data-view-properties]').exists()).toBe(true)
    await wrapper.get('[data-action="discard-view-edits"]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false)
    await select(wrapper, 'shared')
    await wrapper.get('[data-action="remove-view"]').trigger('click'); await flushPromises()
    expect(wrapper.find('[data-action="save-views"]').exists()).toBe(true)
    await wrapper.get('[data-action="save-views"]').trigger('click'); await flushPromises()
    expect((await f.open('A')).definitionDataSet?.getView('OrdersAlias', 'shared')).toBeUndefined()
    expect(f.fileWrites).toHaveLength(1)
  })

  it('keeps a later binding edit visible when native remote adoption reaches another definition', async () => {
    const f = fixture(), {wrapper, instance} = await page()
    await select(wrapper, 'shared')
    await (await boundNumber(wrapper, 'pageSize')).setValue('33')
    const remote = f.stored.get('A')!.replace('"pageSize":12', '"pageSize":44')
    f.stored.set('A', remote)
    await wrapper.get('[data-action="preview-remote-views"]').trigger('click'); await flushPromises()
    const metadata = f.sessions[0]!.metadataDataSet, definitions = metadata.getView('DataViewDefinition')!
    const originalRefresh = definitions.refresh.bind(definitions)
    let release!: () => void, entered!: () => void
    const gate = new Promise<void>(resolve => {release = resolve}), ready = new Promise<void>(resolve => {entered = resolve})
    const refresh = vi.spyOn(definitions, 'refresh').mockImplementationOnce(async () => {await originalRefresh(); entered(); await gate})
    try {
      await wrapper.get('[data-action="adopt-remote-views"]').trigger('click'); await ready
      const bindings = metadata.getView('DataTableBindingDefinition')!, row = bindings.rows.find(item => item['tableName'] === 'OrdersAlias')!
      const key = bindings.getPkKey(row)!, config = bindings.getEditingRow(key)?.['configuration']
      if (!isRecord(config)) throw new Error('missing actual model binding configuration')
      bindings.updateEditingValue(key, 'configuration', {...config, businessCategory: 'later-category'})
      release(); await flushPromises()
      expect(bindings.getEditingRow(key)?.['configuration']).toMatchObject({businessCategory: 'later-category'})
      expect(wrapper.getComponent(DataSpaceViewEditor).text()).toContain('DATA_VIEW_UNSAVED_CHANGES')
      expect(instance.isDirty).toBe(true); expect(f.fileWrites).toHaveLength(0)
      expect((await boundNumber(wrapper, 'pageSize')).element.value).toBe('44')
      expect(wrapper.get('[data-action="save-views"]').attributes('disabled')).toBeUndefined()
      await wrapper.get('[data-action="save-views"]').trigger('click'); await flushPromises()
      expect(instance.isDirty).toBe(false); expect(f.fileWrites).toHaveLength(1)
      const reopened = await f.open('A')
      expect(reopened.definitionDataSet!.getTable('OrdersAlias')!.businessCategory).toBe('later-category')
      expect(reopened.definitionDataSet!.getView('OrdersAlias', 'shared')!.pageSize).toBe(44)
      expect(writes(f)).toHaveLength(0)
    } finally {release(); refresh.mockRestore()}
  }, 15000)

  it('shows remote changes before explicit adoption and preserves database parameter drafts', async () => {
    const f = fixture()
    const {wrapper, instance} = await page()
    const metadata = f.sessions[0]!.metadataDataSet
    metadata.getView('Base_DataSet', 'default')!.updateEditingValue('A', 'inputParams', '[]')
    await select(wrapper, 'shared')
    await (await boundNumber(wrapper, 'pageSize')).setValue('33')
    const remote = f.stored.get('A')!.replace('"pageSize":12', '"pageSize":44')
    f.stored.set('A', remote)
    await wrapper.get('[data-action="save-views"]').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('SCENARIO_VIEW_CONFLICT')
    expect(f.fileWrites).toHaveLength(0)
    await wrapper.get('[data-action="preview-remote-views"]').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('"pageSize":44')
    await wrapper.get('[data-action="adopt-remote-views"]').trigger('click'); await flushPromises()
    expect(metadata.getView('Base_DataSet', 'default')!.getEditingRow('A')?.['inputParams']).toBe('[]')
    expect(instance.isDirty).toBe(true)
    expect(f.fileWrites).toHaveLength(0)
    await select(wrapper, 'shared')
    expect((await boundNumber(wrapper, 'pageSize')).element).toHaveProperty('value', '44')
  }, 15_000)

  it('keeps only the blueprint path registration and no self-built design short path', () => {
    const entry = getVuePageEntry('/features/data-platform/data-set-management/design/ui/data-set-design-page')
    expect(entry?.source).toBe('src/views/features/data-platform/data-set-management/design/ui/data-set-design-page.vue')
    expect(entry?.scope).toBe('app')
    expect(getVuePageEntry('/data-space-design')).toBeUndefined()
  })

  it.each(['', '?scenarioId=A&scenarioId=B', '?scenarioId=..', '?scenarioId=a%2Fb'])('rejects missing or invalid target IDs without opening metadata: %s', async query => {
    fixture()
    const {wrapper} = await page(query)
    expect(wrapper.get('[role="alert"]').text()).toContain('目标数据空间 ID 无效')
    expect(openLowcodeDataSpaceDesignSession).not.toHaveBeenCalled()
  })

  it('groups fields and multiple named views under formal models and separates relations from cascades', async () => {
    const f = fixture()
    const {wrapper} = await page()
    expect(openLowcodeDataSpaceDesignSession).toHaveBeenCalledWith('A')
    expect(f.sessions[0]?.metadataDataSet.scenarioId).toBe('META')
    expect(wrapper.text()).toContain('空间 A')
    const tree = wrapper.getComponent(ElTree)
    for (const label of ['Orders', 'Customers']) {
      for (const id of treePath(tree.props('data') ?? [], label) ?? []) {
        if (tree.vm.getNode(id).expanded) continue
        const button = wrapper.findAll('[data-design-node]').find(item => item.attributes('data-design-node') === id)!
        const arrow = button.element.closest('.el-tree-node__content')!.querySelector('.el-tree-node__expand-icon')!
        await new DOMWrapper(arrow).trigger('click'); await flushPromises()
      }
    }
    for (const group of wrapper.findAll('[data-design-node]').filter(item => item.text() === '数据视图（2）')) {
      const arrow = group.element.closest('.el-tree-node__content')!.querySelector('.el-tree-node__expand-icon')!
      await new DOMWrapper(arrow).trigger('click'); await flushPromises()
    }
    expect(wrapper.findComponent(DataSpaceViewEditor).exists()).toBe(false)
    const nodes = wrapper.findAll('[data-design-node]')
    expect(nodes.map(item => item.text())).toEqual(expect.arrayContaining(['Orders', 'Customers', '字段（1）', '数据视图（2）', '模型关系', '数据级联']))
    const shared = nodes.filter(item => item.text() === 'shared')
    expect(shared).toHaveLength(2)
    await shared[0]!.trigger('click'); await flushPromises()
    expect(wrapper.get('[data-definition-detail]').text()).toContain('12')
    expect(wrapper.get('[data-definition-detail]').text()).toContain('treeConfig')
    await shared[1]!.trigger('click'); await flushPromises()
    expect(wrapper.get('[data-definition-detail]').text()).toContain('24')
    expect(writes(f)).toHaveLength(0)
  })

  it('opens input parameters in the standard dialog and cancels the original overlay without submitting', async () => {
    const f = fixture({missing: true})
    const {wrapper, instance} = await page('?scenarioId=A', true)
    await select(wrapper, '输入参数')
    const dialog = wrapper.findAllComponents(RendererDialog).find(item => item.props('title') === '输入参数设置')
    expect(dialog?.props('modelValue')).toBe(true)
    expect(dialog?.props('dataViewKey')).toContain('@Base_DataSet@default')
    expect(dialog?.props('width')).toBe('860px')
    expect(sourceButton(wrapper, 'close-parameters').text()).toBe('取消')
    expect(sourceButton(wrapper, 'save-parameters').text()).toBe('确定')
    await editParameter(wrapper, '描述 1', '取消的草稿')
    await sourceButton(wrapper, 'close-parameters').trigger('click'); await flushPromises()
    expect(dialog?.props('modelValue')).toBe(false)
    expect(instance.isDirty).toBe(false)
    expect(f.sessions[0]!.metadataDataSet.getView('Base_DataSet', 'default')?.hasEditingChanges()).toBe(false)
    expect(writes(f)).toHaveLength(0)
    await select(wrapper, '输入参数')
    await sourceButton(wrapper, 'save-parameters').trigger('click'); await flushPromises()
    expect(dialog?.props('modelValue')).toBe(false)
    expect(instance.isDirty).toBe(false)
    expect(writes(f)).toHaveLength(0)
  })

  it('edits parameter cells directly and cancels all changes through the original field', async () => {
    const f=fixture({missing:true}),{wrapper,instance}=await page('?scenarioId=A',true)
    await select(wrapper,'输入参数')
    await editParameter(wrapper,'描述 1','已确认行')
    await editParameter(wrapper,'描述 1','后续修改')
    expect(instance.isDirty).toBe(true)
    expect(parameterEditor(wrapper).find('[data-json-save-row]').exists()).toBe(false)
    expect(writes(f)).toHaveLength(0)
    await sourceButton(wrapper,'close-parameters').trigger('click');await flushPromises()
    expect(instance.isDirty).toBe(false)
    const view=f.sessions[0]!.metadataDataSet.getView('Base_DataSet')!
    expect(view.hasEditingChanges()).toBe(false)
    await select(wrapper,'输入参数')
    expect(parameterCell(wrapper,0,1).get('input').element).not.toHaveProperty('value','后续修改')
  })

  it('opens a space without pagedata, edits in the original DataView and confirms persistence by reopening', async () => {
    const f = fixture({missing: true})
    const {wrapper, instance} = await page('?scenarioId=A', true)
    expect(wrapper.text()).toContain('尚无视图配置')
    await select(wrapper, '输入参数')
    await editParameter(wrapper, '描述 1', '新的描述')
    expect(instance.isDirty).toBe(true)
    const view = f.sessions[0]!.metadataDataSet.getView('Base_DataSet', 'default')!
    expect(view.getEditingRow('A')?.['inputParams']).toContain('新的描述')
    expect(writes(f)).toHaveLength(0)
    await sourceButton(wrapper, 'save-parameters').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('保存并回读确认')
    expect(instance.isDirty).toBe(false)
    expect(writes(f)).toHaveLength(1)
    expect(f.parameters).toContain('"extra":7')
    const reopened = await page('?scenarioId=A', true)
    await select(reopened.wrapper, '输入参数')
    expect(parameterCell(reopened.wrapper, 0, 1).get('input').element).toHaveProperty('value','新的描述')
    expect(f.stored.size).toBe(0)
  })

  it.each([{hiddenFieldOwner: true}, {unmatchedFieldOwner: true}])('reports records that cannot be placed under a readable model: %j', async options => {
    const f = fixture(options)
    const {wrapper, instance} = await page()
    expect(wrapper.get('[data-tree-warning]').text()).toContain('字段有 1 条记录无法定位到可读的模型或身份')
    await select(wrapper, '未归类定义（1）')
    await select(wrapper, '记录 1 · 订单编号 · F1')
    expect(wrapper.get('[data-definition-detail]').text()).toContain('订单编号')
    expect(wrapper.get('[data-unplaced-reason]').text()).toContain(options.hiddenFieldOwner ? '所属模型身份不可读' : '所属模型未出现在当前可读模型列表')
    if (options.hiddenFieldOwner) expect(wrapper.get('[data-definition-detail]').text()).not.toContain('M1')
    else expect(wrapper.get('[data-definition-detail]').text()).toContain('MISSING')
    expect(wrapper.get('[data-unplaced-reason]').text()).toContain('保留原记录')
    expect(instance.isDirty).toBe(false); expect(writes(f)).toHaveLength(0); expect(f.fileWrites).toHaveLength(0)
    expect(f.sessions[0]!.metadataDataSet.getView('Base_DataModel_Field', 'default')!.rows).toHaveLength(1)
  })

  it('keeps unreadable orphan names and ownership out of labels, titles and detail', async () => {
    const f = fixture({unmatchedFieldOwner: true, hiddenFieldProperties: ['Name', 'dataModelId']})
    const {wrapper} = await page()
    await select(wrapper, '记录 1 · 不可读 · F1')
    expect(wrapper.get('[data-unplaced-reason]').text()).toContain('所属模型身份不可读')
    expect(wrapper.html()).not.toContain('订单编号')
    expect(wrapper.html()).not.toContain('MISSING')
    expect(writes(f)).toHaveLength(0)
  })

  it('keeps unplaced input definitions read-only across reopening and target spaces', async () => {
    const f = fixture({sourceFields: [{rowid: 'ORPHAN_INPUT', dataModelId: '', Name: '未归属入参', type: 'inputParams', ValueFun: '{"Type":"GetInputParam","ParamName":"customer"}'}]})
    const a = await page(), b = await page('?scenarioId=B')
    for (const [target, mounted] of [['A', a], ['B', b]] as const) {
      await select(mounted.wrapper, '记录 1 · 未归属入参 · ORPHAN_INPUT')
      expect(mounted.wrapper.get('[data-unplaced-reason]').text()).toContain('所属模型身份为空或无效')
      const detail = mounted.wrapper.get('[data-definition-detail]')
      expect(detail.findAll('dt').map(field => field.text())).toContain('dataSetId')
      expect(detail.findAll('dd').map(field => field.text())).toContain(target)
      expect(mounted.wrapper.findComponent(FieldValueFunction).exists()).toBe(false)
      expect(mounted.instance.isDirty).toBe(false)
    }
    await a.wrapper.findAll('button').find(button => button.text() === '重新打开')!.trigger('click'); await flushPromises()
    await select(a.wrapper, '记录 1 · 未归属入参 · ORPHAN_INPUT')
    expect(a.wrapper.get('[data-unplaced-reason]').text()).toContain('所属模型身份为空或无效')
    expect(writes(f)).toHaveLength(0); expect(f.fileWrites).toHaveLength(0)
  })

  it('does not expose an unreadable record identity in diagnostic navigation', async () => {
    const f = fixture({hiddenFieldProperties: ['rowid']})
    const {wrapper} = await page()
    await select(wrapper, '记录 1 · 订单编号 · 不可读')
    expect(wrapper.get('[data-unplaced-reason]').text()).toContain('记录身份不可读')
    expect(wrapper.html()).not.toContain('F1')
    expect(writes(f)).toHaveLength(0)
  })

  it('protects an active view draft when opening unplaced definitions', async () => {
    const f = fixture({unmatchedFieldOwner: true})
    const {wrapper, instance} = await page()
    await select(wrapper, 'shared')
    await (await boundNumber(wrapper, 'pageSize')).setValue('31')
    await wrapper.get('[data-action="show-unplaced"]').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('请先保存或明确处理当前视图草稿')
    expect((await boundNumber(wrapper, 'pageSize')).element).toHaveProperty('value', '31')
    expect(instance.isDirty).toBe(true)
    await wrapper.get('[data-action="discard-view-edits"]').trigger('click'); await flushPromises()
    await wrapper.get('[data-action="show-unplaced"]').trigger('click'); await flushPromises()
    expect(wrapper.get('.design-detail h2').text()).toBe('未归类定义（1）')
    expect(instance.isDirty).toBe(false); expect(f.fileWrites).toHaveLength(0)
  })

  it.each([{readOnly: true}, {hidden: true}])('keeps denied fields unreadable or unwritable: %j', async options => {
    const f = fixture(options)
    const {wrapper} = await page('?scenarioId=A', true)
    await select(wrapper, '输入参数')
    expect(sourceButton(wrapper, 'save-parameters').attributes('disabled')).toBeDefined()
    if (options.hidden) expect(parameterEditor(wrapper)).toBeUndefined()
    else {
      expect(parameterCell(wrapper, 0, 0).get('input').element).toHaveProperty('value','customer')
      expect(parameterEditor(wrapper).get('[data-json-add]').attributes('disabled')).toBeDefined()
      await parameterCell(wrapper, 0, 0).trigger('click'); await flushPromises()
      expect(parameterCell(wrapper, 0, 0).get('input').attributes('disabled')).toBeDefined()
    }
    expect(writes(f)).toHaveLength(0)
  })

  it('can cancel incomplete parameter edits and does not save a newly added empty name', async () => {
    const f = fixture({missing: true})
    const {wrapper, instance} = await page('?scenarioId=A', true)
    await select(wrapper, '输入参数')
    await parameterEditor(wrapper).get('[data-json-add]').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(true)
    expect(sourceButton(wrapper, 'save-parameters').attributes('disabled')).toBeUndefined()
    expect(writes(f)).toHaveLength(0)
    await sourceButton(wrapper, 'save-parameters').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('名称不能为空')
    expect(writes(f)).toHaveLength(0)
    await sourceButton(wrapper, 'close-parameters').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false)
    expect(parameterEditor(wrapper)).toBeUndefined()
  })

  it.each(['save', 'verify'] as const)('preserves the shared space row and workbench after parameter %s readback', async action => {
    const f = fixture({missing: true}), {wrapper, instance} = await page('?scenarioId=A', true)
    const view = f.sessions[0]!.metadataDataSet.getView('Base_DataSet')!
    expect(wrapper.get('.design-workbench__hero h2').text()).toBe('空间 A')
    expect(wrapper.get('.design-workbench__title-block p').text()).toBe('空间说明 A')
    await select(wrapper, '输入参数'); await editParameter(wrapper, '描述 1', '来源引用声明')
    if (action === 'verify') f.loseNextResponse()
    await sourceButton(wrapper, 'save-parameters').trigger('click'); await flushPromises()
    if (action === 'verify') {
      await sourceButton(wrapper, 'verify-parameters').trigger('click'); await flushPromises()
    }
    expect(f.sessions[0]!.metadataDataSet.getView('Base_DataSet')).toBe(view)
    expect(view.requestState).toBe(RequestState.Loaded)
    expect(view.rows[0]).toMatchObject({rowid: 'A', Name: '空间 A', description: '空间说明 A'})
    expect(view.rows[0]?.['inputParams']).toContain('来源引用声明')
    expect(view.fieldAccess(view.rows[0]!, 'Name').read).toBe('visible')
    expect(wrapper.get('.design-workbench__hero h2').text()).toBe('空间 A')
    expect(wrapper.get('.design-workbench__title-block p').text()).toBe('空间说明 A')
    expect(writes(f)).toHaveLength(1); expect(instance.isDirty).toBe(false)
    expect(f.fileWrites).toEqual([]); expect(f.assemblyScopes).toEqual([])
    const fresh = await f.open('A')
    expect(fresh.metadataDataSet.getView('Base_DataSet')!.rows[0]).toMatchObject({rowid: 'A', Name: '空间 A', description: '空间说明 A', inputParams: f.parameters})
  })

  it.each(['save', 'verify'] as const)('keeps later space parameter edits visible after %s readback', async action => {
    const f = fixture({missing: true}), {wrapper, instance} = await page('?scenarioId=A', true)
    await select(wrapper, '输入参数'); await editParameter(wrapper, '描述 1', '原提交')
    if (action === 'verify') {
      f.loseNextResponse()
      await sourceButton(wrapper, 'save-parameters').trigger('click'); await flushPromises()
    }
    const view = f.sessions[0]!.metadataDataSet.getView('Base_DataSet')!
    const createQueryView = view.createQueryView.bind(view)
    let release!: () => void
    const gate = new Promise<void>(resolve => {release = resolve})
    const held = vi.fn()
    const hold = (target: typeof view) => {
      const load = target.loadFromServer.bind(target)
      vi.spyOn(target, 'loadFromServer').mockImplementationOnce(async options => {
        held(); const result = await load(options); await gate; return result
      })
    }
    if (action === 'save') vi.spyOn(view, 'createQueryView').mockImplementationOnce(id => {
      const verification = createQueryView(id); hold(verification); return verification
    })
    else hold(view)
    await sourceButton(wrapper, `${action}-parameters`).trigger('click'); await flushPromises()
    expect(held).toHaveBeenCalledTimes(1)
    const later = JSON.parse(String(view.getEditingRow('A')?.['inputParams']))
    later[0].Description = '回读期间新修改'
    view.updateEditingValue('A', 'inputParams', JSON.stringify(later))
    release(); await flushPromises()
    expect(view.getEditingRow('A')?.['inputParams']).toContain('回读期间新修改')
    expect(instance.isDirty).toBe(true); expect(writes(f)).toHaveLength(1)
    const dialog = wrapper.findAllComponents(RendererDialog).find(item => item.props('title') === '输入参数设置')!
    expect(dialog.props('modelValue')).toBe(true)
    expect(wrapper.text()).toContain('仍有未保存修改')
    await sourceButton(wrapper, 'save-parameters').trigger('click'); await flushPromises()
    expect(writes(f)).toHaveLength(2); expect(instance.isDirty).toBe(false)
    const fresh = await f.open('A')
    expect(fresh.metadataDataSet.getView('Base_DataSet')!.rows[0]?.['inputParams']).toContain('回读期间新修改')
  })

  it('explicitly discards a later parameter patch to recover a confirmed write after readback failure', async () => {
    const f = fixture({missing: true}), {wrapper, instance} = await page('?scenarioId=A', true)
    const view = f.sessions[0]!.metadataDataSet.getView('Base_DataSet')!
    await select(wrapper, '输入参数')
    await editParameter(wrapper, '描述 1', '确认写入值')
    const queryCount = f.requests.filter(request => request.url === '/api/DataOperation/GetData').length
    const release = f.holdNextQuery(true)

    await sourceButton(wrapper, 'save-parameters').trigger('click')
    await vi.waitFor(() => expect(f.requests.filter(request => request.url === '/api/DataOperation/GetData')).toHaveLength(queryCount + 1))
    expect(f.parameters).toContain('确认写入值')
    const later = JSON.parse(String(view.rows[0]?.['inputParams']))
    later[0].Description = '明确放弃的新修改'
    view.updateEditingValue('A', 'inputParams', JSON.stringify(later))
    release()
    await flushPromises()

    expect(writes(f)).toHaveLength(1)
    expect(view.hasUnconfirmedSave).toBe(false)
    expect(f.sessions[0]!.getInputParameterState()).toEqual({status: 'readback', pending: true})
    const verify = sourceButton(wrapper, 'verify-parameters')
    expect(verify.text()).toBe('放弃本地新修改并核验')
    await verify.trigger('click'); await flushPromises()

    expect(writes(f)).toHaveLength(1)
    expect(view.rows[0]?.['inputParams']).toContain('确认写入值')
    expect(view.rows[0]?.['inputParams']).not.toContain('明确放弃的新修改')
    expect(view.hasEditingChanges('A')).toBe(false)
    expect(instance.isDirty).toBe(false)
    expect(f.sessions[0]!.getInputParameterState()).toEqual({status: 'idle', pending: false})
  })

  it.each(['cancel', 'save'] as const)('retains parameter edits made before confirmation and can %s them without replaying the first write', async next => {
    const f = fixture({overviewOnly: true}), {wrapper, instance} = await page('?scenarioId=A', true)
    const dataSet = f.sessions[0]!.metadataDataSet, view = dataSet.getView('Base_DataSet')!
    const save = dataSet.saveChanges.bind(dataSet)
    await select(wrapper, '输入参数'); await editParameter(wrapper, '描述 1', '已确认声明')
    vi.spyOn(dataSet, 'saveChanges').mockImplementationOnce(async options => {
      const result = await save(options)
      const later = JSON.parse(String(view.rows[0]?.['inputParams']))
      later[0].Description = '后续编辑'
      view.updateEditingValue('A', 'inputParams', JSON.stringify(later))
      return result
    })
    const initialViews = [...view.dataTable!.viewList]
    await sourceButton(wrapper, 'save-parameters').trigger('click'); await flushPromises()
    expect(f.sessions).toHaveLength(1)
    expect(f.sessions[0]!.getInputParameterState()).toEqual({status: 'idle', pending: true})
    expect(writes(f)).toHaveLength(1); expect(f.parameters).toContain('已确认声明')
    expect(view.getEditingRow('A')?.['inputParams']).toContain('后续编辑')
    expect(instance.isDirty).toBe(true); expect(wrapper.text()).toContain('仍有未保存修改')
    expect(parameterEditor(wrapper).exists()).toBe(true)
    expect(view.dataTable!.viewList).toEqual(initialViews)
    await sourceButton(wrapper, next === 'save' ? 'save-parameters' : 'close-parameters').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(false)
    expect(writes(f)).toHaveLength(next === 'save' ? 2 : 1)
    expect(f.fileWrites).toEqual([])
    expect(dataSet.getView('Base_DataModel_Field')!.requestState).toBe(RequestState.Idle)
    expect(wrapper.get('.design-workbench__hero h2').text()).toBe('空间 A')
    const fresh = await f.open('A')
    expect(fresh.metadataDataSet.getView('Base_DataSet')!.rows[0]?.['inputParams']).toContain(next === 'save' ? '后续编辑' : '已确认声明')
  })

  it('recovers an unknown write by explicit readback without replaying it', async () => {
    const f = fixture({missing: true}); f.loseNextResponse()
    const {wrapper, instance} = await page('?scenarioId=A', true)
    await select(wrapper, '输入参数')
    await editParameter(wrapper, '描述 1', '已写但丢回执')
    await sourceButton(wrapper, 'save-parameters').trigger('click'); await flushPromises()
    expect(instance.isDirty).toBe(true)
    expect(sourceButton(wrapper, 'save-parameters').attributes('disabled')).toBeDefined()
    expect(sourceButton(wrapper, 'close-parameters').attributes('disabled')).toBeDefined()
    const dialog = wrapper.findAllComponents(RendererDialog).find(item => item.props('title') === '输入参数设置')!
    dialog.vm.$emit('update:modelValue', false); await flushPromises()
    expect(dialog.props('modelValue')).toBe(true)
    expect(writes(f)).toHaveLength(1)
    await sourceButton(wrapper, 'verify-parameters').trigger('click'); await flushPromises()
    expect(writes(f)).toHaveLength(1)
    expect(instance.isDirty).toBe(false)
    expect(wrapper.text()).toContain('已重新读取')
  })

  it('keeps an unknown save in another Base_DataSet view isolated from parameter reload', async () => {
    const f = fixture({missing: true}), {wrapper} = await page('?scenarioId=A', true)
    const session = f.sessions[0]!, dataSet = session.metadataDataSet
    const parameters = dataSet.getView('Base_DataSet', 'default')!
    const unrelated = parameters.createQueryView('unrelatedParameterView')
    await unrelated.loadFromServer({allPages: true})
    unrelated.updateEditingValue('A', 'inputParams', '[{"rowid":"OTHER","Name":"isolated"}]')
    f.loseNextResponse()
    await expect(dataSet.saveChanges({views: [{tableName: 'Base_DataSet', viewId: unrelated.viewId, ids: ['A']}]}))
      .rejects.toThrow(/response lost/)
    expect(unrelated.hasUnconfirmedSave).toBe(true)

    await session.reloadInputParameters({discardPending: false})

    expect(unrelated.hasUnconfirmedSave).toBe(true)
    expect(unrelated.getEditingRow('A')?.['inputParams']).toContain('isolated')
    expect(writes(f)).toHaveLength(1)
    wrapper.unmount()
  })

  it.each(['not-applied', 'still-unknown'] as const)('uses the original capture receipt for %s parameter recovery', async outcome => {
    const f = fixture({missing: true}), {wrapper} = await page('?scenarioId=A', true)
    const session = f.sessions[0]!, view = session.metadataDataSet.getView('Base_DataSet', 'default')!
    const original = f.parameters
    await select(wrapper, '输入参数'); await editParameter(wrapper, '描述 1', '待核验值')
    f.loseNextResponse()
    await sourceButton(wrapper, 'save-parameters').trigger('click'); await flushPromises()
    expect(view.hasUnconfirmedSave).toBe(true)
    expect(writes(f)).toHaveLength(1)
    if (outcome === 'not-applied') f.setParameters(original)
    else f.failNextQuery()

    await sourceButton(wrapper, 'verify-parameters').trigger('click'); await flushPromises()

    if (outcome === 'not-applied') {
      expect(view.hasUnconfirmedSave).toBe(false)
      expect(session.getInputParameterState().status).toBe('unsubmitted')
      await sourceButton(wrapper, 'verify-parameters').trigger('click'); await flushPromises()
      expect(session.getInputParameterState().status).toBe('idle')
      expect(view.rows[0]?.['inputParams']).toBe(original)
      expect(view.hasEditingChanges('A')).toBe(false)
    } else {
      expect(view.hasUnconfirmedSave).toBe(true)
      expect(session.getInputParameterState().status).toBe('unknown')
      expect(view.getEditingRow('A')?.['inputParams']).toContain('待核验值')
      await sourceButton(wrapper, 'verify-parameters').trigger('click'); await flushPromises()
      expect(view.hasUnconfirmedSave).toBe(false)
      expect(session.getInputParameterState().status).toBe('idle')
      expect(view.rows[0]?.['inputParams']).toContain('待核验值')
    }
    expect(writes(f)).toHaveLength(1)
    wrapper.unmount()
  })

  it('rejects parameter commands after the session owner query context changes', async () => {
    const f = fixture({missing: true}), {wrapper} = await page('?scenarioId=A', true)
    const session = f.sessions[0]!, view = session.metadataDataSet.getView('Base_DataSet', 'default')!
    view.queryContext = {dataSpaceId: 'OTHER'}

    expect(() => session.stageInputParameters({expectedValue: view.rows[0]?.['inputParams'], value: []}))
      .toThrow(/DATA_SPACE_INPUT_PARAMETERS_CONTEXT/)
    expect(writes(f)).toHaveLength(0)
    wrapper.unmount()
  })

  it('preserves a newer parameter patch when discard waits for capture verification', async () => {
    const f = fixture({missing: true}), {wrapper} = await page('?scenarioId=A', true)
    const session = f.sessions[0]!, view = session.metadataDataSet.getView('Base_DataSet', 'default')!
    const original = f.parameters
    await select(wrapper, '输入参数'); await editParameter(wrapper, '描述 1', '待核验值')
    f.loseNextResponse()
    await sourceButton(wrapper, 'save-parameters').trigger('click'); await flushPromises()
    f.setParameters(original)
    const previousQueries = f.requests.filter(request => request.url === '/api/DataOperation/GetData').length
    const release = f.holdNextQuery()
    const reload = session.reloadInputParameters({discardPending: true})
    await vi.waitFor(() => expect(f.requests.filter(request => request.url === '/api/DataOperation/GetData')).toHaveLength(previousQueries + 1))
    view.updateEditingValue('A', 'inputParams', '[{"rowid":"P1","Name":"稍后编辑"}]')
    release()
    await expect(reload).rejects.toThrow(/草稿已变化|DATA_VIEW_UNSAVED_CHANGES/)
    expect(view.hasUnconfirmedSave).toBe(false)
    expect(view.getEditingRow('A')?.['inputParams']).toContain('稍后编辑')
    expect(session.getInputParameterState().pending).toBe(true)
    wrapper.unmount()
  })

  it('keeps a native save with an invalid receipt in verification state', async () => {
    const f = fixture({missing: true}), {wrapper} = await page('?scenarioId=A', true)
    const session = f.sessions[0]!, dataSet = session.metadataDataSet
    const view = dataSet.getView('Base_DataSet', 'default')!
    await select(wrapper, '输入参数'); await editParameter(wrapper, '描述 1', '回执待核验')
    const nativeSave = dataSet.saveChanges.bind(dataSet)
    vi.spyOn(dataSet, 'saveChanges').mockImplementation(async (...args) => {
      const result = await nativeSave(...args)
      if (!result.data || !args[0]?.views?.some(item => item.tableName === 'Base_DataSet')) return result
      return {...result, data: {...result.data, viewResults: []}}
    })

    await sourceButton(wrapper, 'save-parameters').trigger('click'); await flushPromises()

    expect(view.hasUnconfirmedSave).toBe(false)
    expect(session.getInputParameterState().status).toBe('readback')
    expect(writes(f)).toHaveLength(1)
    await sourceButton(wrapper, 'verify-parameters').trigger('click'); await flushPromises()
    expect(session.getInputParameterState().status).toBe('idle')
    expect(view.rows[0]?.['inputParams']).toContain('回执待核验')
    expect(writes(f)).toHaveLength(1)
    wrapper.unmount()
  })

  it('keeps native capture recovery with an invalid receipt in verification state', async () => {
    const f = fixture({missing: true}), {wrapper} = await page('?scenarioId=A', true)
    const session = f.sessions[0]!, dataSet = session.metadataDataSet
    const view = dataSet.getView('Base_DataSet', 'default')!
    await select(wrapper, '输入参数'); await editParameter(wrapper, '描述 1', '恢复回执待核验')
    f.loseNextResponse()
    await sourceButton(wrapper, 'save-parameters').trigger('click'); await flushPromises()
    expect(view.hasUnconfirmedSave).toBe(true)
    const nativeSave = dataSet.saveChanges.bind(dataSet)
    vi.spyOn(dataSet, 'saveChanges').mockImplementation(async (...args) => {
      const result = await nativeSave(...args)
      if (!result.data || !args[0]?.views?.some(item => item.tableName === 'Base_DataSet')) return result
      return {...result, data: {...result.data, viewResults: []}}
    })

    await sourceButton(wrapper, 'verify-parameters').trigger('click'); await flushPromises()

    expect(view.hasUnconfirmedSave).toBe(false)
    expect(session.getInputParameterState().status).toBe('readback')
    await sourceButton(wrapper, 'verify-parameters').trigger('click'); await flushPromises()
    expect(session.getInputParameterState().status).toBe('idle')
    expect(view.rows[0]?.['inputParams']).toContain('恢复回执待核验')
    expect(writes(f)).toHaveLength(1)
    wrapper.unmount()
  })

  it('keeps metadata and relation editing available without invoking unrelated target assembly', async () => {
    const f = fixture({broken: true})
    const {wrapper} = await page('?scenarioId=A', true)
    expect(wrapper.text()).not.toContain('模型关系无法装配')
    await select(wrapper, '原生关系定义')
    expect(wrapper.text()).not.toContain('模型关系无法装配')
    expect(f.assemblyScopes).toEqual([])
    expect(sourceButton(wrapper, 'add-relation').text()).toBe('新增关系草稿')
    expect(wrapper.text()).toContain('Orders')
    await sourceButton(wrapper, 'close-definition').trigger('click'); await flushPromises()
    await select(wrapper, '输入参数')
    expect(parameterCell(wrapper, 0, 0).get('input').element).toHaveProperty('value','customer')
  })

  it('disposes late sessions after unmount and isolates separate target calls', async () => {
    const f = fixture({missing: true})
    const firstSession = await f.open('A')
    let release: (() => void) | undefined
    vi.mocked(openLowcodeDataSpaceDesignSession).mockImplementationOnce(() => new Promise(resolve => {release = () => resolve(firstSession)}))
    const first = await page('?scenarioId=A', true)
    first.wrapper.unmount()
    release?.(); await flushPromises()
    expect(firstSession.metadataDataSet.destroyed).toBe(true)
    const a = await page('?scenarioId=A', true)
    const b = await page('?scenarioId=B', true)
    await select(a.wrapper, '输入参数')
    await editParameter(a.wrapper, '描述 1', 'A 的草稿')
    expect(a.instance.isDirty).toBe(true)
    expect(b.instance.isDirty).toBe(false)
    expect(b.wrapper.text()).toContain('空间 B')
    f.invalidate()
    await sourceButton(a.wrapper, 'save-parameters').trigger('click'); await flushPromises()
    expect(writes(f)).toHaveLength(0)
    expect(a.wrapper.text()).toMatch(/SPARK_(EXECUTION_SCOPE|QUERY_CONTEXT)_STALE/)
    expect(a.wrapper.findComponent(RendererGraph).exists()).toBe(false)
    expect(a.wrapper.text()).not.toContain('输入参数已保存并回读确认')
  })
})

describe('native design graph migration', () => {
  it.each(['addApi', 'updateApi', 'deleteApi'])('keeps formal models referenced by legacy %s visible, selectable and in saved layout', async operation => {
    const f = fixture(); f.setModelValues({[operation]: 'Customers'})
    const {wrapper, instance} = await page()
    const flow = wrapper.getComponent(VueFlow)
    expect(flow.props('nodes')!.map(node => node.data.title)).toEqual(['Orders', 'Customers'])
    expect(flow.props('edges')).toHaveLength(0)
    expect(wrapper.text()).not.toContain('端点未唯一绑定')
    const session = f.sessions[0]!, editor = new DataSpaceLayoutEdit(session)
    await editor.initialize()
    expect(session.metadataDataSet.getView('Base_DataModel')!.rows).toHaveLength(2)
    const before = session.viewState!.config
    editor.move({id: 'M2', x: 333, y: 444}); await editor.save()
    const reopened = await f.open('A'), layout = new DataSpaceLayoutEdit(reopened)
    await layout.initialize()
    expect(layout.state().positions['M2']).toEqual({x: 333, y: 444})
    expect(reopened.viewState!.config['tables']).toEqual(before['tables'])
    expect(reopened.viewState!.config['resourceRelations']).toEqual(before['resourceRelations'])
    expect(reopened.metadataDataSet.getView('Base_DataModel')!.rows.find(row => row['rowid'] === 'M1')?.[operation]).toBe('Customers')
    await select(wrapper, 'Customers')
    expect(wrapper.get('.design-detail h2').text()).toBe('Customers')
    expect(instance.isDirty).toBe(false)
    expect(writes(f)).toHaveLength(0)
  })

  it('keeps mutually referenced legacy operation models visible and opens the selected formal model', async () => {
    const f = fixture()
    f.setModelValues({addApi: 'Customers', IsBusinessMain: 1})
    f.setModelValues({updateApi: 'Orders'}, 'A', 'M2')
    const {wrapper, instance} = await page()
    const flow = wrapper.getComponent(VueFlow)
    expect(flow.props('nodes')!.map(node => node.data.title)).toEqual(['Orders', 'Customers'])
    const customer = flow.props('nodes')!.find(node => node.data.title === 'Customers')!
    flow.vm.$emit('nodeDoubleClick', {node: customer}); await flushPromises()
    expect(wrapper.get('.design-detail h2').text()).toBe('Customers')
    const models = f.sessions[0]!.metadataDataSet.getView('Base_DataModel')!
    expect(models.currentRow?.['rowid']).toBe('M2')
    expect(models.rows.find(row => row['rowid'] === 'M1')?.['addApi']).toBe('Customers')
    expect(models.rows.find(row => row['rowid'] === 'M2')?.['updateApi']).toBe('Orders')
    expect(instance.isDirty).toBe(false)
    expect(f.fileWrites).toHaveLength(0); expect(writes(f)).toHaveLength(0)
  })

  it('keeps reference canvas commands in the main toolbar and native recovery commands in its tail', async () => {
    const f = fixture(), {wrapper, instance} = await page()
    const toolbar = wrapper.get('.renderer-graph-toolbar')
    expect(toolbar.get('.renderer-toolbar-lane--start').findAll('button').map(button => button.text())).toEqual([
      '选择', '新增模型', '居中', '全图', '对齐', '放大', '缩小', '输入参数', '复制API', '删除', '保存布局',
    ])
    expect(toolbar.get('.renderer-toolbar-lane--end').findAll('button').map(button => button.text())).toEqual([
      '模型目录', '重新打开', '模型关系', '数据级联', '取消布局修改',
    ])
    const flow = wrapper.getComponent(VueFlow), store = useVueFlow(flow.props('id'))
    const node = flow.props('nodes')!.find(item => item.data.title === 'Orders')!
    flow.vm.$emit('nodeClick', {node: {id: node.id}}); await flushPromises()
    const pointer = f.sessions[0]!.metadataDataSet.getView('Base_DataModel')!.currentRow
    store.setNodes(store.nodes.value.map(item => ({...item, selected: false})))
    await sourceButton(wrapper, 'select-graph-current').trigger('click'); await flushPromises()
    expect(store.nodes.value.filter(item => item.selected).map(item => item.id)).toEqual([node.id])
    expect(f.sessions[0]!.metadataDataSet.getView('Base_DataModel')!.currentRow).toBe(pointer)
    expect(wrapper.find('.design-detail').exists()).toBe(false)
    await sourceButton(wrapper, 'toggle-directory').trigger('click'); await flushPromises()
    expect(wrapper.get('[aria-label="数据空间层次"]').isVisible()).toBe(true)
    expect(instance.isDirty).toBe(false); expect(writes(f)).toHaveLength(0); expect(f.fileWrites).toHaveLength(0)
  })

  it('restores the overview and full-width canvas with an optional DataView-bound model directory', async () => {
    const f = fixture(); f.setModelValues({IsBusinessMain: 1})
    const {wrapper, instance} = await page()
    const overview = wrapper.get('[aria-label="空间工作台概览"]')
    expect(overview.get('.design-workbench__primary-value').text()).toBe('Orders')
    expect(overview.findAll('.design-workbench__metric-value').map(value => value.text())).toContain('2')
    expect(overview.find('input').exists()).toBe(false)
    expect(wrapper.get('[aria-label="数据空间层次"]').isVisible()).toBe(false)
    expect(wrapper.get('.design-layout').classes()).not.toContain('design-layout--directory')
    expect(wrapper.get('.graph-node--danger').text()).toContain('主业务')
    await sourceButton(wrapper, 'toggle-directory').trigger('click'); await flushPromises()
    expect(wrapper.get('[aria-label="数据空间层次"]').isVisible()).toBe(true)
    await select(wrapper, 'Orders')
    expect(wrapper.getComponent(DataSpaceModelEditor).props('modelId')).toBe('M1')
    await sourceButton(wrapper, 'close-definition').trigger('click'); await flushPromises()
    await sourceButton(wrapper, 'toggle-directory').trigger('click'); await flushPromises()
    expect(wrapper.get('[aria-label="数据空间层次"]').isVisible()).toBe(false)
    expect(instance.isDirty).toBe(false); expect(writes(f)).toHaveLength(0)
  })

  it('restores reference source captions and model badges while retaining native graph interactions', async () => {
    const f = fixture()
    f.setModelValues({Type: 'table', IsBusinessMain: 1, IsBusiness: 1, description: '订单业务说明'})
    f.setModelValues({Type: 'table', IsBusinessMain: 0, IsBusiness: 0}, 'A', 'M2')
    const {wrapper, instance} = await page()
    const flow = wrapper.getComponent(VueFlow)
    const orders = flow.props('nodes')!.find(node => node.data.title === 'Orders')!
    const customers = flow.props('nodes')!.find(node => node.data.title === 'Customers')!
    expect(orders.data).toMatchObject({caption: '数据库表', description: '订单业务说明', badge: {label: '主业务', tone: 'danger'}})
    expect(customers.data).toMatchObject({caption: '数据库表', badge: {label: '普通模型', tone: 'primary'}})
    expect(wrapper.get('.design-canvas-panel__type-list').text()).toContain('数据库表')
    const models = f.sessions[0]!.metadataDataSet.getView('Base_DataModel', 'default')!
    expect(models.rows.map(row => row['Type'])).toEqual(['table', 'table'])
    flow.vm.$emit('nodeClick', {node: customers}); await flushPromises()
    expect(models.currentRow?.['rowid']).toBe('M2'); expect(wrapper.find('.design-detail').exists()).toBe(false)
    flow.vm.$emit('nodeDoubleClick', {node: customers}); await flushPromises()
    expect(wrapper.getComponent(DataSpaceModelEditor).props('modelId')).toBe('M2')
    await sourceButton(wrapper, 'close-definition').trigger('click'); await flushPromises()
    f.setModelValues({IsBusinessMain: 0, IsBusiness: 1})
    await wrapper.findAllComponents(RendererButton).find(button => button.props('label') === '重新打开')!.trigger('click')
    await flushPromises()
    expect(wrapper.getComponent(VueFlow).props('nodes')!.find(node => node.data.title === 'Orders')!.data.badge)
      .toEqual({label: '业务模型', tone: 'primary'})
    expect(instance.isDirty).toBe(false); expect(writes(f)).toHaveLength(0)
  })

  it('keeps the canvas primary, selects on click and opens model details only on double click', async () => {
    const f = fixture(), {wrapper, instance} = await page()
    expect(wrapper.find('.design-detail').exists()).toBe(false)
    const flow = wrapper.getComponent(VueFlow)
    const node = flow.props('nodes')!.find(item => item.data?.['title'] === 'Orders')!
    flow.vm.$emit('nodeClick', {node: {id: node.id}}); await flushPromises()
    expect(wrapper.find('.design-detail').exists()).toBe(false)
    expect(f.sessions[0]!.metadataDataSet.getView('Base_DataModel', 'default')?.currentRow?.['rowid']).toBe('M1')
    flow.vm.$emit('nodeDoubleClick', {node: {id: node.id}}); await flushPromises()
    const dialog = wrapper.findAllComponents(RendererDialog).find(item => item.props('title') === 'Orders')!
    expect(dialog?.props('modelValue')).toBe(true)
    // The workspace retains the space context; its nested editor binds the model.
    expect(dialog.props('dataViewKey')).toBe(`${f.sessions[0]!.metadataDataSet.scenarioId}@Base_DataSet@default`)
    expect(wrapper.getComponent(DataSpaceModelEditor).findAllComponents(RendererForm).some(form =>
      form.props('dataViewKey') === `${f.sessions[0]!.metadataDataSet.scenarioId}@Base_DataModel@default`)).toBe(true)
    expect(wrapper.getComponent(DataSpaceModelEditor).props('modelId')).toBe('M1')
    await sourceButton(wrapper, 'close-definition').trigger('click'); await flushPromises()
    expect(wrapper.find('.design-detail').exists()).toBe(false)
    expect(wrapper.findComponent(VueFlow).exists()).toBe(true)
    expect(instance.isDirty).toBe(false); expect(writes(f)).toHaveLength(0); expect(f.fileWrites).toHaveLength(0)
  })

  it('prevents closing the definition dialog while its DataView has a draft and releases after cancellation', async () => {
    const f = fixture(), {wrapper, instance} = await page()
    await select(wrapper, 'Orders')
    const editor = wrapper.getComponent(DataSpaceModelEditor)
    await writeBound(editor, 'description', 'dialog draft')
    const dialog = wrapper.findAllComponents(RendererDialog).find(item => item.props('title') === 'Orders')!
    expect(dialog?.props('closeDisabled')).toBe(true)
    dialog.vm.$emit('update:modelValue', false); await flushPromises()
    expect(wrapper.findComponent(DataSpaceModelEditor).exists()).toBe(true)
    expect(instance.isDirty).toBe(true)
    await sourceButton(editor, 'cancel-model').trigger('click'); await flushPromises()
    expect(dialog.props('closeDisabled')).toBe(false)
    await sourceButton(wrapper, 'close-definition').trigger('click'); await flushPromises()
    expect(wrapper.find('.design-detail').exists()).toBe(false)
    expect(instance.isDirty).toBe(false); expect(writes(f)).toHaveLength(0)
  })

  it('opens input parameters directly from the canvas toolbar without another definition dialog', async () => {
    const f = fixture(), {wrapper} = await page('?scenarioId=A', true)
    const button = wrapper.findAllComponents(RendererButton).find(item => item.props('label') === '输入参数')!
    await button.get('button').trigger('click'); await flushPromises()
    expect(wrapper.find('.design-detail').exists()).toBe(false)
    expect(wrapper.findAllComponents(RendererDialog).filter(item => item.props('modelValue'))).toHaveLength(1)
    expect(parameterCell(wrapper, 0, 1).exists()).toBe(true)
    await sourceButton(wrapper, 'close-parameters').trigger('click'); await flushPromises()
    expect(writes(f)).toHaveLength(0)
  })

  it('opens the existing relation editor from its bound edge without staging writes', async () => {
    const f = fixture()
    const initial = await f.open('A'); initial.dispose()
    const config = JSON.parse(f.stored.get('A')!)
    config.resourceRelations = [{relationId: 'ORDERS', parentTable: 'CustomersAlias', childTable: 'OrdersAlias',
      filterExpression: {field: 'parentId', operator: 'eq', value: {Type: 'GetTableField', Field: 'CustomersAlias.rowid'}}}]
    f.stored.set('A', JSON.stringify(config))
    const {wrapper, instance} = await page()
    const flow = wrapper.getComponent(VueFlow)
    expect(flow.props('edges')).toHaveLength(1)
    flow.vm.$emit('edgeDoubleClick', {edge: {id: flow.props('edges')![0]!.id}}); await flushPromises()
    expect(wrapper.get('.design-detail h2').text()).toBe('ORDERS')
    expect(wrapper.find('[data-action="save-relations"]').exists()).toBe(true)
    expect(f.sessions.at(-1)!.metadataDataSet.getView('DataResourceRelationDefinition', 'default')?.currentRow?.['relationId']).toBe('ORDERS')
    expect(instance.isDirty).toBe(false)
    expect(writes(f)).toHaveLength(0); expect(f.fileWrites).toHaveLength(0)
  })

  it('opens the existing model editor from the standard graph and keeps dirty selection guarded', async () => {
    const f = fixture()
    const {wrapper} = await page()
    const session = f.sessions[0]!
    const flow = wrapper.getComponent(VueFlow)
    const orders = flow.props('nodes')!.find(node => node.data?.['title'] === 'Orders')!
    const customers = flow.props('nodes')!.find(node => node.data?.['title'] === 'Customers')!
    expect(orders).toBeDefined(); expect(customers).toBeDefined()
    flow.vm.$emit('nodeDoubleClick', {node: {id: orders.id}}); await flushPromises()
    const editor = wrapper.getComponent(DataSpaceModelEditor)
    expect(editor.props('modelId')).toBe('M1')
    await writeBound(editor, 'description', 'unsaved graph edit')
    flow.vm.$emit('nodeClick', {node: {id: customers.id}}); await flushPromises()
    expect(wrapper.getComponent(DataSpaceModelEditor).props('modelId')).toBe('M1')
    expect(wrapper.text()).toContain('请先保存、取消或核验当前模型配置')
    expect(session.metadataDataSet.getView('Base_DataModel', 'default')?.currentRow?.['rowid']).toBe('M1')
    expect(writes(f)).toHaveLength(0)
  })
})


describe('metadata invalidation ownership', () => {
  it('updates the bound array header draft without rebuilding the space overview', async () => {
    const {DataSpaceWorkbench} = await import('@/views/features/data-platform/data-set-management/design/workbench/data-space-workbench')
    const f = fixture({overviewOnly: true, allowArrayEdit: true, allowFieldEdit: true,
      editableFieldProperties: ['description', 'Order'], sourceFields: [
        {rowid: 'F1', dataModelId: 'M1', Name: 'name', description: '名称', type: 'dataModel', FieldType: 'string', IsOutput: 1, IsPKey: 1, Order: 0},
      ]})
    f.setModelValues({Type: '数组', PrimaryKeyFields: 'name', items: '[{"name":"before"}]'})
    const {wrapper, instance} = await page()
    await select(wrapper, 'Orders')
    await wrapper.get('[data-action="edit-array"]').trigger('click'); await flushPromises()
    const body = new DOMWrapper(document.body)
    await body.get('[data-action="array-headers"]').trigger('click'); await flushPromises()
    const headers = wrapper.getComponent({name: 'DataSpaceArrayHeaders'})
    const draft = resolveDataViewKey(headers.getComponent(RendererForm).props('dataViewKey'), f.sessions[0]!.metadataDataSet)!
    const refresh = vi.spyOn(DataSpaceWorkbench.prototype, 'refresh')
    try {
      draft.updateEditingValue('array', 'headerDraft', JSON.stringify([{id: 'F1', name: 'name', label: '局部表头草稿', order: 0, primary: true}]))
      await flushPromises()
      expect(body.text()).toContain('局部表头草稿')
      expect(body.get('[data-action="save-array"]').attributes('disabled')).toBeDefined()
      expect(refresh).not.toHaveBeenCalled()
      expect(f.sessions[0]!.metadataDataSet.getView('Base_DataModel')!.getEditingRow('M1')?.['items']).toBe('[{"name":"before"}]')
      expect(writes(f)).toEqual([]); expect(f.fileWrites).toEqual([])
      await body.get('[data-action="cancel-array-headers"]').trigger('click'); await flushPromises()
      await body.get('[data-action="cancel-array"]').trigger('click'); await flushPromises()
      expect(instance.isDirty).toBe(false)
      expect(f.sessions[0]!.metadataDataSet.getTable(draft.tableName)).toBeUndefined()
    } finally {refresh.mockRestore()}
  })

  it('refreshes bound space projections after formal query results change', async () => {
    const f = fixture({overviewOnly: true})
    const {wrapper} = await page()
    const models = f.sessions[0]!.metadataDataSet.getView('Base_DataModel')!
    expect(wrapper.text()).toContain('未设置')
    f.setModelValues({IsBusinessMain: 1})
    await models.refresh()
    expect(models.requestState).toBe(RequestState.Loaded)
    await flushPromises()
    expect(wrapper.get('.design-workbench__primary-value').text()).toBe('Orders')
    expect(writes(f)).toEqual([]); expect(f.fileWrites).toEqual([])
  })
})
