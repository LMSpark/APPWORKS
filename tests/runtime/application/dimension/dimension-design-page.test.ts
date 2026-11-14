import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {defineComponent, h} from 'vue'
import {createMemoryHistory, createRouter, RouterView} from 'vue-router'
import ElementPlus from 'element-plus'
import {RequestState} from '@spark-appworks/spark-data'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {RendererButton, RendererTable, Spark, registerAllRenderers} from '@spark-appworks/spark-component'
import {createDynamicRouter} from '../../../../packages/spark-app/src/router/dynamic'
import {createDimensionRuntime, keys, scenario, seedDimensionRule} from './dimension.fixture'
import {provideTestPageService} from '../../../support/helpers/page-service-host'

const state: {runtime: PageRuntime | undefined} = vi.hoisted(() => ({runtime: undefined}))
vi.mock('@/views/features/shared/runtime/use-feature-page-runtime', async () => {
  const {ref} = await import('vue')
  const {PAGE_RUNTIME, useSparkComponent} = await import('@spark-appworks/spark-component')
  return {useFeaturePageRuntime: () => {
    if (!state.runtime) throw new Error('缺少测试运行实例')
    const {sparkProvide} = useSparkComponent({type: 'dimension-test-runtime'})
    sparkProvide(PAGE_RUNTIME, state.runtime)
    return {viewKey: keys.binding, session: {runtime: state.runtime},
      ready: ref(true), loading: ref(false), error: ref(''), loadCurrentRoute: vi.fn()}
  }}
})

const {default: DimensionDesignPage} = await import('@/views/features/data-platform/structured-config/dimension-definition/ui/dimension-design-page.vue')
const wrappers: VueWrapper[] = [], runtimes: PageRuntime[] = []
beforeEach(() => {
  registerAllRenderers()
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
})
afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  runtimes.splice(0).forEach(runtime => runtime.dispose())
  state.runtime = undefined
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

type OpenOptions = Readonly<{
  existing?: boolean
  preload?: boolean
  tab?: string
  prepare?: (fixture: Awaited<ReturnType<typeof createDimensionRuntime>>) => void
}>

async function open(options: OpenOptions = {}) {
  const {existing = false, preload = true, tab = '规则治理', prepare} = options
  const f = await createDimensionRuntime('R1', true, preload)
  runtimes.push(f.runtime)
  if (existing) await seedDimensionRule(f)
  prepare?.(f)
  if (preload) {
    for (const name of ['Bil_Dimension_Definition', 'Bil_Dimension_Dict_Type', 'Bil_Dimension_Biz_Category']) {
      await f.dataSet.getView(name)?.refresh()
    }
  } else await f.bindings.refresh()
  state.runtime = f.runtime
  const clean = defineComponent({render: () => h('div', 'clean')})
  const router = createRouter({history: createMemoryHistory(), routes: []})
  const dynamic = createDynamicRouter({router, pageComponent: clean,
    loadNavigation: async () => ({id: 'root', title: 'Root', childPlacement: 'header', items: [
      {id: 'dimension', title: '维度', path: '/dimension', itemKind: 'system-page'},
      {id: 'clean', title: 'Clean', path: '/clean', itemKind: 'system-page'},
    ]}), componentMap: {'/dimension': DimensionDesignPage, '/clean': clean}})
  await dynamic.registerRoutes()
  await router.push('/dimension')
  const wrapper = mount(defineComponent({setup: () => {
    provideTestPageService(router)
    return () => h(RouterView)
  }}), {
    attachTo: document.body, global: {plugins: [router, ElementPlus, Spark.createPlugin()]},
  })
  wrappers.push(wrapper)
  await flushPromises()
  const instance = dynamic.getSystemPageInstance(router.currentRoute.value)
  if (!instance) throw new Error('维度系统页实例缺失')
  const switchTab = async (label: string) => {
    const pane = wrapper.findAll('[role="tab"]').find(item => item.text().includes(label))
    if (!pane) throw new Error(`页签缺失: ${label}`)
    await pane.trigger('click')
    await flushPromises()
  }
  if (tab !== '来源锚点') await switchTab(tab)
  const button = (label: string) => {
    const found = wrapper.findAllComponents(RendererButton).find(item => item.props('label') === label)
    if (!found) throw new Error(`按钮不存在: ${label}`)
    return found
  }
  const click = async (label: string) => {
    await button(label).get('button').trigger('click')
    await flushPromises()
  }
  return {...f, router, dynamic, instance, wrapper, button, click, switchTab}
}

describe('维度规则页面入口与生命周期', () => {
  it('新规则和结果在一个编辑器提交，草稿期间阻止路由切换', async () => {
    const f = await open()
    await f.click('新增规则')
    await vi.waitFor(() => expect(f.instance.isDirty).toBe(true))
    await f.router.push('/clean')
    expect(f.router.currentRoute.value.path).toBe('/dimension')
    const id = [...f.rule.dirtyTracking.pendingCreateIds][0]
    if (id === undefined) throw new Error('缺少新增规则身份')
    f.rule.updateEditingValue(id, 'rule_code', 'page-rule')
    f.rule.updateEditingValue(id, 'rule_name', '页面规则')
    f.rule.updateEditingValue(id, 'event_code', 'expense')
    await f.click('添加结果')
    const result = f.result.rows[0], resultId = result && f.result.getPkKey(result)
    if (resultId === undefined) throw new Error('缺少新增结果身份')
    f.result.updateEditingValue(resultId, 'dim_category', 'finance')
    f.result.updateEditingValue(resultId, 'dim_code', 'cost')
    f.result.updateEditingValue(resultId, 'value_expr', 'item.code')
    await f.click('保存规则')
    await vi.waitFor(() => expect(f.instance.isDirty).toBe(false))
    expect(f.http.records['Bil_Dimension_Rule']).toMatchObject([{rowid: id, rule_code: 'page-rule', biz_category: 'finance'}])
    expect(f.http.records['Bil_Dimension_Rule_Result']).toMatchObject([{rowid: resultId, rule_id: String(id)}])
    expect(f.http.saves).toHaveLength(2)
    await f.router.push('/clean')
    expect(f.router.currentRoute.value.path).toBe('/clean')
  })

  it('取消新规则时不留下规则或子项草稿', async () => {
    const f = await open()
    await f.click('新增规则')
    await f.click('添加结果')
    await f.click('取消')
    expect(f.rule.rows).toHaveLength(0)
    expect(f.result.rows).toHaveLength(0)
    expect(f.http.saves).toHaveLength(0)
    expect(f.instance.isDirty).toBe(false)
  })

  it('删除回执中断后页面保留核验入口并阻止离开', async () => {
    const f = await open({existing: true})
    const table = f.wrapper.findAllComponents(RendererTable).find(item => item.props('dataViewKey') === keys.rule)
    const row = f.rule.rows[0]
    if (!table || !row) throw new Error('规则表或记录缺失')
    const actions = table.props('actions')
    const action = actions?.children?.find(item => typeof item === 'object' && item !== null && item.props?.['label'] === '删除')
    if (!action || typeof action !== 'object' || typeof action.props?.['onClick'] !== 'function') throw new Error('规则删除入口缺失')
    f.http.failAfterWrite = true
    action.props['onClick'](row)
    await flushPromises()
    const confirm = Array.from(document.querySelectorAll<HTMLButtonElement>('.el-message-box__btns button')).reverse()
      .find(button => button.textContent?.trim() === '确定')
    if (!confirm) throw new Error('删除确认按钮缺失')
    confirm.click()
    await flushPromises()
    await vi.waitFor(() => expect(f.condition.hasUnconfirmedSave).toBe(true))
    expect(f.instance.isDirty).toBe(true)
    await f.router.push('/clean')
    expect(f.router.currentRoute.value.path).toBe('/dimension')
    await f.click('核验原删除结果')
    expect(f.http.saves).toHaveLength(2)
    expect(f.http.records['Bil_Dimension_Rule']).toHaveLength(1)
    await f.click('继续删除规则')
    await vi.waitFor(() => expect(f.instance.isDirty).toBe(false))
    expect(f.http.records['Bil_Dimension_Rule']).toHaveLength(0)
    expect(f.http.saves).toHaveLength(3)
  })
})

describe('维度工作区查询与主从身份', () => {
  it('首开只读来源锚点，访问工作区才加载所需视图', async () => {
    const f = await open({preload: false, tab: '来源锚点'})
    expect(f.http.reads.map(item => item.table)).toEqual(['Bil_Dimension_Source_Binding'])
    await f.switchTab('规则治理')
    expect(f.http.reads.map(item => item.table)).toEqual(expect.arrayContaining([
      'Bil_Dimension_Rule_Template', 'Bil_Dimension_Rule',
    ]))
    for (const name of ['Bil_Dimension_Definition', 'Bil_Dimension_Dict_Type', 'Bil_Dimension_Biz_Category']) {
      expect(f.http.reads.map(item => item.table)).not.toContain(name)
    }
    await f.click('刷新')
    for (const name of ['Bil_Dimension_Definition', 'Bil_Dimension_Dict_Type', 'Bil_Dimension_Biz_Category']) {
      expect(f.http.reads.map(item => item.table)).not.toContain(name)
    }
    await f.switchTab('业务分类')
    expect(f.http.reads.map(item => item.table)).toContain('Bil_Dimension_Biz_Category')
  })

  it.each([false, true])('连续选择来源锚点时，迟到的旧查询不能覆盖当前明细（旧请求失败：%s）', async lateFailure => {
    const f = await open({tab: '来源锚点'})
    f.http.records['Bil_Dimension_Source_Binding'] = [
      {id: 'A', binding_code: '锚点甲', event_code: 'first'},
      {id: 'B', binding_code: '锚点乙', event_code: 'second'},
    ]
    f.http.records['Bil_Dimension_Source_Mapping'] = [
      {id: 'MA', binding_id: 'A', source_field_name: '甲字段'},
      {id: 'MB', binding_id: 'B', source_field_name: '乙字段'},
    ]
    await f.bindings.refresh()
    let release = () => {}
    const first = new Promise<void>(resolve => {release = resolve})
    let reads = 0
    f.http.beforeDefinitionRead = async name => {
      if (name === 'Bil_Dimension_Source_Mapping' && ++reads === 1) {
        await first
        if (lateFailure) throw new Error('旧来源请求失败')
      }
    }
    expect(f.bindings.setCurrentRowById('A')).toBe(true)
    await vi.waitFor(() => expect(reads).toBe(1))
    expect(f.bindings.setCurrentRowById('B')).toBe(true)
    const mapping = f.dataSet.getView('Bil_Dimension_Source_Mapping', 'byBinding')
    if (!mapping) throw new Error('来源映射视图缺失')
    await vi.waitFor(() => expect(mapping.rows.map(row => row['id'])).toEqual(['MB']))
    release()
    await flushPromises()
    expect(mapping.rows.map(row => row['id'])).toEqual(['MB'])
    expect(mapping.requestState).toBe(RequestState.Loaded)
    expect(f.bindings.currentRow?.['id']).toBe('B')
    expect(f.wrapper.text()).toContain('映射明细：锚点乙')
    expect(f.wrapper.text()).not.toContain('旧来源请求失败')
  })

  it('其他工作区查询失败不阻塞来源锚点，显式刷新后可恢复', async () => {
    let fail = true
    const f = await open({preload: false, tab: '来源锚点', prepare: fixture => {
      fixture.http.beforeDefinitionRead = async name => {
        if (name === 'Bil_Dimension_Biz_Category' && fail) throw new Error('分类查询失败')
      }
    }})
    expect(f.bindings.requestState).toBe(RequestState.Loaded)
    expect(f.wrapper.text()).toContain('维度中心')
    await f.switchTab('业务分类')
    const category = f.dataSet.getView('Bil_Dimension_Biz_Category')
    if (!category) throw new Error('业务分类视图缺失')
    await vi.waitFor(() => expect(category.requestState).toBe(RequestState.Failed))
    expect(f.wrapper.text()).toContain('分类查询失败')
    expect(f.bindings.requestState).toBe(RequestState.Loaded)
    fail = false
    await f.click('刷新')
    expect(category.requestState).toBe(RequestState.Loaded)
    expect(f.http.reads.map(item => item.table)).not.toContain('Bil_Dimension_Definition')
  })

  it('事件与字典明细分别跟随各自正式视图的当前值，清空选择不留旧结果', async () => {
    const f = await open({preload: false, tab: '来源锚点', prepare: fixture => {
      fixture.http.records['Bil_Dimension_Rule_Template'] = [
        {rowid: 'E1', event_code: 'expense', template_name: '费用'},
        {rowid: 'E2', event_code: 'invoice', template_name: '发票'},
      ]
      fixture.http.records['Bil_Dimension_Source_Binding'] = [
        {id: 'A', binding_code: '甲', event_code: 'expense'},
        {id: 'B', binding_code: '乙', event_code: 'invoice'},
      ]
      fixture.http.records['Bil_Dimension_Dict_Type'] = [
        {rowid: 'D1', dict_type_code: 'country', dict_type_name: '国家'},
        {rowid: 'D2', dict_type_code: 'currency', dict_type_name: '币种'},
      ]
      fixture.http.records['Bil_Dimension_Dict_Item'] = [
        {rowid: 'I1', dict_type_code: 'country', item_code: 'CN'},
        {rowid: 'I2', dict_type_code: 'currency', item_code: 'CNY'},
      ]
    }})
    await f.switchTab('事件合同')
    const eventBindings = f.dataSet.getView('Bil_Dimension_Source_Binding', 'byEvent')
    const types = f.dataSet.getView('Bil_Dimension_Dict_Type')
    const items = f.dataSet.getView('Bil_Dimension_Dict_Item', 'byType')
    if (!eventBindings || !types || !items) throw new Error('事件或字典视图缺失')
    expect(f.events.setCurrentRowById('E1')).toBe(true)
    await vi.waitFor(() => expect(eventBindings.rows.map(row => row['id'])).toEqual(['A']))
    expect(f.wrapper.text()).toContain('蓝图锚点：expense')
    expect(f.events.setCurrentRowById('E2')).toBe(true)
    await vi.waitFor(() => expect(eventBindings.rows.map(row => row['id'])).toEqual(['B']))
    f.events.setCurrentRowById(null)
    await vi.waitFor(() => expect(eventBindings.rows).toHaveLength(0))
    expect(f.wrapper.text()).not.toContain('蓝图锚点：')
    await f.switchTab('已有映射')
    expect(types.setCurrentRowById('D1')).toBe(true)
    await vi.waitFor(() => expect(items.rows.map(row => row['rowid'])).toEqual(['I1']))
    expect(f.wrapper.text()).toContain('字典项：country')
    expect(types.setCurrentRowById('D2')).toBe(true)
    await vi.waitFor(() => expect(items.rows.map(row => row['rowid'])).toEqual(['I2']))
    types.setCurrentRowById(null)
    await vi.waitFor(() => expect(items.rows).toHaveLength(0))
    expect(f.wrapper.text()).not.toContain('字典项：')
  })

  it('切换明细失败时不展示上一来源的数据，可对当前来源重试', async () => {
    const f = await open({preload: false, tab: '来源锚点', prepare: fixture => {
      fixture.http.records['Bil_Dimension_Source_Binding'] = [
        {id: 'A', binding_code: '锚点甲'}, {id: 'B', binding_code: '锚点乙'},
      ]
      fixture.http.records['Bil_Dimension_Source_Mapping'] = [
        {id: 'MA', binding_id: 'A'}, {id: 'MB', binding_id: 'B'},
      ]
    }})
    const mapping = f.dataSet.getView('Bil_Dimension_Source_Mapping', 'byBinding')
    if (!mapping) throw new Error('来源映射视图缺失')
    f.bindings.setCurrentRowById('A')
    await vi.waitFor(() => expect(mapping.rows.map(row => row['id'])).toEqual(['MA']))
    let fail = true
    f.http.beforeDefinitionRead = async name => {
      if (name === 'Bil_Dimension_Source_Mapping' && fail) throw new Error('映射查询失败')
    }
    f.bindings.setCurrentRowById('B')
    await vi.waitFor(() => expect(mapping.requestState).toBe(RequestState.Failed))
    expect(mapping.rows).toHaveLength(0)
    expect(f.wrapper.text()).toContain('映射明细：锚点乙')
    expect(f.wrapper.text()).toContain('映射查询失败')
    fail = false
    await f.click('重试明细')
    await vi.waitFor(() => expect(mapping.rows.map(row => row['id'])).toEqual(['MB']))
    expect(f.http.saves).toHaveLength(0)
  })

  it('来源身份不可读时级联明确失败，不使用受限字段查询', async () => {
    const f = await open({preload: false, tab: '来源锚点', prepare: fixture => {
      fixture.http.hiddenFields['Bil_Dimension_Source_Binding'] = ['id']
      fixture.http.records['Bil_Dimension_Source_Binding'] = [{id: 'A', binding_code: '锚点甲'}]
    }})
    f.bindings.setCurrentRowById('A')
    const mapping = f.dataSet.getView('Bil_Dimension_Source_Mapping', 'byBinding')
    if (!mapping) throw new Error('来源映射视图缺失')
    await vi.waitFor(() => expect(mapping.requestState).toBe(RequestState.Failed))
    expect(f.wrapper.text()).toContain('字段不可读')
    expect(f.http.reads.map(item => item.table)).not.toContain('Bil_Dimension_Source_Mapping')
  })
})
