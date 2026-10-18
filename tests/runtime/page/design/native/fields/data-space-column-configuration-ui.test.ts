import {afterEach, describe, expect, it, vi} from 'vitest'
import {config, flushPromises, mount} from '@vue/test-utils'
import {defineComponent, h, onBeforeUnmount, ref} from 'vue'
import ElementPlus, {ElSelect, ElTable, ElTableColumn} from 'element-plus'
import {FieldText, FieldCheckbox, RendererButton, RendererToolbar, Spark, PAGE_RUNTIME, DATA_ROW, useSparkComponent} from '@spark-appworks/spark-component'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import DataSpaceModelFields from '@/views/features/data-platform/data-set-management/design/ui/node-panel/fields/DataSpaceModelFields.vue'
import {dataSpacePageFixture} from '../data-space-page.fixture'

const originalStubs = config.global.stubs, cleanups: Array<() => void> = []
afterEach(() => {cleanups.splice(0).reverse().forEach(fn => fn()); config.global.stubs = originalStubs; vi.unstubAllGlobals()})
async function fixture(extra: Parameters<typeof dataSpacePageFixture>[0] = {}, includeRules = true) {
  const stubs = {...config.global.stubs}
  for (const key of ['el-table', 'el-table-column', 'SparkComponentRenderer', 'spark-component-renderer']) delete stubs[key]
  config.global.stubs = stubs
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
  const f = dataSpacePageFixture({allowFieldEdit: true, editableFieldProperties: ['description', 'Expression', 'allowAIAdd'],
    ...(includeRules ? {desensitizationRules: [{rowid: 'RULE', name: '隐藏手机号'}]} : {}), sourceFields: [
      {rowid: 'F1', dataModelId: 'M1', Name: 'amount', description: '金额', type: 'dataModel', FieldType: 'number', IsPKey: 0, IsOutput: 1, Expression: '', allowAIAdd: 0},
      {rowid: 'OTHER', dataModelId: 'M2', Name: 'customer', type: 'dataModel', FieldType: 'string', IsPKey: 0, IsOutput: 1},
    ], ...extra})
  cleanups.push(() => f.dispose())
  const session = await f.open('A'), runtime = new PageRuntime({pageId: 'column-configuration-test', scenarioIds: [session.metadataDataSet.scenarioId!], loadScenario: async () => session.metadataDataSet})
  await runtime.load(); cleanups.push(() => runtime.dispose())
  const registry = Spark.createRegistry(); registry.register({type: 'r-text', component: FieldText})
  registry.register({type: 'r-checkbox', component: FieldCheckbox})
  registry.register({type: 'r-toolbar', component: RendererToolbar}); registry.register({type: 'r-button', component: RendererButton})
  const Host = defineComponent({setup() {
    const revision = ref(0), {sparkProvide} = useSparkComponent({type: 'column-configuration-test'})
    sparkProvide(PAGE_RUNTIME, runtime); sparkProvide(DATA_ROW, {rowid: 'M1', Name: '外层模型'})
    const changed = () => {revision.value++}
    const off = session.metadataDataSet.onAnyViewChange({rowsChanged: changed, editingChanged: changed, editingFieldChanged: changed, editingDiscarded: changed})
    onBeforeUnmount(off)
    return () => h(DataSpaceModelFields, {session, modelId: 'M1', fieldIds: ['F1'], revision: revision.value, onChanged: changed})
  }})
  const wrapper = mount(Host, {attachTo: document.body, global: {plugins: [ElementPlus, Spark.createPlugin({registry})],
    components: {'el-table': ElTable, 'el-table-column': ElTableColumn}, stubs: {'el-table': ElTable, 'el-table-column': ElTableColumn}}})
  cleanups.push(() => wrapper.unmount()); await flushPromises()
  const button = (label: string) => wrapper.findAll('button').find(item => item.text() === label)!
  const view = session.metadataDataSet.getView('Base_DataModel_Field', 'modelFields')!
  return {f, session, wrapper, button, view}
}

describe('unified model field workspace', () => {
  it('edits model fields, rule options and numeric AI flag in one view, saves together and cancels', async () => {
    const {wrapper, button, view, f} = await fixture()
    const row = wrapper.findAll('tbody tr').find(item => item.text().includes('amount'))!
    expect(row.exists()).toBe(true); expect(wrapper.text()).not.toContain('customer')
    await row.get('td:last-child input[type="checkbox"]').setValue(true); await flushPromises()
    expect(view.getEditingRow('F1')?.['allowAIAdd']).toBe(1)
    view.updateEditingValue('F1', 'description', '统一模型字段'); await flushPromises()
    const select = wrapper.findComponent(ElSelect)
    expect(select.exists()).toBe(true)
    await select.get('.el-select__wrapper').trigger('click'); await flushPromises()
    const option = [...document.querySelectorAll('.el-select-dropdown__item')].find(item => item.textContent?.includes('隐藏手机号'))
    expect(option).toBeDefined(); (option as HTMLElement).click(); await flushPromises()
    expect(view.getEditingRow('F1')?.['Expression']).toBe('RULE')
    await button('批量保存字段配置').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('本次字段配置已批量保存')
    expect(f.requests.filter(r => r.url?.includes('BatchTableOperate'))).toHaveLength(1)
    const fresh = await f.open('A'), reopened = await fresh.loadModelFields('M1')
    expect(reopened.rows[0]).toMatchObject({description: '统一模型字段', Expression: 'RULE', allowAIAdd: 1})
    await row.get('td:last-child input[type="checkbox"]').setValue(false); await flushPromises()
    await button('放弃本地修改').trigger('click'); await flushPromises()
    expect(view.getEditingRow('F1')?.['allowAIAdd']).toBe(1)
    expect(button('批量保存字段配置').attributes('disabled')).toBeDefined()
  })
  it('clears an existing rule through the standard selector and persists empty text, then reopens it', async () => {
    const {wrapper, button, view, f} = await fixture({sourceFields: [
      {rowid: 'F1', dataModelId: 'M1', Name: 'amount', type: 'dataModel', FieldType: 'number', IsPKey: 0, IsOutput: 1, Expression: 'OLD_RULE', allowAIAdd: 0},
    ]})
    const select = wrapper.findComponent(ElSelect)
    expect(select.exists()).toBe(true)
    expect(select.text()).toContain('OLD_RULE')
    await select.trigger('mouseenter'); await flushPromises()
    await select.get('.el-select__clear').trigger('click'); await flushPromises()
    expect(view.getEditingRow('F1')?.['Expression']).toBe('')
    await button('批量保存字段配置').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('本次字段配置已批量保存')
    const reopened = await (await f.open('A')).loadModelFields('M1')
    expect(reopened.rows[0]?.['Expression']).toBe('')
    expect(f.requests.filter(r => r.url?.includes('BatchTableOperate'))).toHaveLength(1)
  })
  it('keeps read-only definitions visible while refusing edits', async () => {
    const {wrapper, button, view} = await fixture({readOnly: true})
    expect(wrapper.text()).toContain('amount')
    expect(wrapper.get('tbody input[type="checkbox"]').attributes('disabled')).toBeDefined()
    expect(wrapper.getComponent(ElSelect).props('disabled')).toBe(true)
    expect(button('批量保存字段配置').attributes('disabled')).toBeDefined()
    expect(view.hasEditingChanges()).toBe(false)
  })
  it('preserves a stored rule and other field editing when the optional rule resource is absent', async () => {
    const {wrapper, view, button, f} = await fixture({sourceFields: [
      {rowid: 'F1', dataModelId: 'M1', Name: 'amount', type: 'dataModel', FieldType: 'number', IsPKey: 0, IsOutput: 0, Expression: 'OLD_RULE', allowAIAdd: 0},
    ]}, false)
    expect(wrapper.text()).toContain('amount')
    expect(wrapper.getComponent(ElSelect).props('disabled')).toBe(true)
    view.updateEditingValue('F1', 'description', '仍可维护模型'); await flushPromises()
    await button('批量保存字段配置').trigger('click'); await flushPromises()
    const reopened = await (await f.open('A')).loadModelFields('M1')
    expect(reopened.rows[0]).toMatchObject({description: '仍可维护模型', Expression: 'OLD_RULE', IsOutput: 0})
  })
})
