import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {defineComponent, h} from 'vue'
import {createMemoryHistory, createRouter, RouterView} from 'vue-router'
import ElementPlus from 'element-plus'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {RendererButton, RendererTable, Spark, registerAllRenderers} from '@spark-appworks/spark-component'
import {createDynamicRouter} from '../../../../packages/spark-app/src/router/dynamic'
import {createDimensionRuntime, keys, scenario, seedDimensionRule} from './dimension.fixture'

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

async function open(existing = false) {
  const f = await createDimensionRuntime()
  runtimes.push(f.runtime)
  if (existing) await seedDimensionRule(f)
  for (const name of ['Bil_Dimension_Definition', 'Bil_Dimension_Dict_Type', 'Bil_Dimension_Biz_Category']) {
    await f.dataSet.getView(name)?.refresh()
  }
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
  const wrapper = mount(defineComponent({setup: () => () => h(RouterView)}), {
    attachTo: document.body, global: {plugins: [router, ElementPlus, Spark.createPlugin()]},
  })
  wrappers.push(wrapper)
  await flushPromises()
  const instance = dynamic.getSystemPageInstance(router.currentRoute.value)
  if (!instance) throw new Error('维度系统页实例缺失')
  const tab = wrapper.findAll('[role="tab"]').find(item => item.text().includes('规则治理'))
  if (!tab) throw new Error('规则治理页签缺失')
  await tab.trigger('click')
  await flushPromises()
  const button = (label: string) => {
    const found = wrapper.findAllComponents(RendererButton).find(item => item.props('label') === label)
    if (!found) throw new Error(`按钮不存在: ${label}`)
    return found
  }
  const click = async (label: string) => {
    await button(label).get('button').trigger('click')
    await flushPromises()
  }
  return {...f, router, dynamic, instance, wrapper, button, click}
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
    const f = await open(true)
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
      .find(button => button.textContent?.trim() === 'OK')
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
