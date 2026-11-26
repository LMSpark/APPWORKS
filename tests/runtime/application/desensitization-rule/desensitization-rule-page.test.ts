import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {config, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {defineComponent, h} from 'vue'
import {createMemoryHistory, createRouter, RouterView} from 'vue-router'
import ElementPlus from 'element-plus'
import {PageRuntime, PageTool, ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import { DataSpaceRuntimeApi } from '@spark-appworks/spark-data'
import {FieldSelect, RendererButton, RendererDialog, RendererForm, RendererTable, Spark, registerAllRenderers} from '@spark-appworks/spark-component'
import {LowcodeDataSpaceAssembler} from '@/platform-adapters/data-space/lowcode-data-space-assembler'
import {createDynamicRouter} from '../../../../packages/spark-app/src/router/dynamic'
import {ApiBackend} from '../../page/api-provider/api-provider.fixture'
import {buildFormalModels} from '../../page/structured-config/catalog/structured-config-catalog.fixture'
import {provideTestPageService} from '../../../support/helpers/page-service-host'
import pagedata from '../../../../config/pages/governance/desensitization-rule/pagedata.json?raw'
import rule from '@/views/features/governance/desensitization-rule/ui/tool/rule.json?raw'
import script from '@/views/features/governance/desensitization-rule/ui/tool/script.js?raw'
import style from '@/views/features/governance/desensitization-rule/ui/tool/style.css?raw'
import {buildRuleSample} from '@/views/features/governance/desensitization-rule/ui/desensitization-rule-sample'

const scenario = '3A45C53F29C2C005FF21AA06B2BCA133'
const state: {runtime: PageRuntime | undefined} = vi.hoisted(() => ({runtime: undefined}))
vi.mock('@/views/features/shared/runtime/use-feature-page-runtime', async () => {
  const {ref} = await import('vue')
  const {PAGE_RUNTIME, useSparkComponent} = await import('@spark-appworks/spark-component')
  return {useFeaturePageRuntime: () => {
    if (!state.runtime) throw new Error('缺少测试运行实例')
    const {sparkProvide} = useSparkComponent({type: 'rules-test-runtime'})
    sparkProvide(PAGE_RUNTIME, state.runtime)
    return {viewKey: ref(`${scenario}@Base_Desensitization_Rule@default`),
      session: {runtime: state.runtime, isCurrent: (runtime: PageRuntime) => runtime === state.runtime},
      ready: ref(true), loading: ref(false), error: ref(''), reloadBlocked: ref(false), loadCurrentRoute: vi.fn()}
  }}
})
const {default: RulePage} = await import('@/views/features/governance/desensitization-rule/ui/desensitization-rule-page.vue')
const wrappers: VueWrapper[] = [], runtimes: PageRuntime[] = []
const originalStubs = config.global.stubs
beforeEach(() => {
  registerAllRenderers()
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
  const stubs = {...originalStubs}
  delete stubs['SparkComponentRenderer']
  delete stubs['spark-component-renderer']
  config.global.stubs = stubs
})
afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  runtimes.splice(0).forEach(runtime => runtime.dispose())
  state.runtime = undefined
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  config.global.stubs = originalStubs
})

async function open(values: Readonly<{type?: string | number; global?: string | number | null}> = {}, backend?: ApiBackend) {
  const http = backend ?? new ApiBackend()
  if (!backend) http.records = {
    Base_Desensitization_Rule: [{rowid: 'R1', type: values.type ?? '1', name: '规则一', description: '', regex: 'a', template: '*',
      original_sample: 'aba', desensitized_sample: '*ba', is_gabale: values.global === undefined ? '0' : values.global}],
    脱敏分类: [{rowid: 'C1', val: '1', txt: '个人信息类'}],
    脱敏全局替换: [{rowid: 'G0', val: '0', txt: '否'}, {rowid: 'G1', val: '1', txt: '是'}],
  }
  const config = new ScenarioViewConfig(scenario, pagedata)
  const bindings = config.toJSON()['tables']
  if (!bindings || typeof bindings !== 'object') throw new Error('场景表缺失')
  const fields = {
    Base_Desensitization_Rule: ['rowid', 'type', 'name', 'description', 'regex', 'template', 'original_sample', 'desensitized_sample', 'is_gabale'],
    脱敏分类: ['rowid', 'val', 'txt', 'ordIdx'], 脱敏全局替换: ['rowid', 'val', 'txt', 'ordIdx'],
  }
  const modelIds: Record<string, string> = {'Base_Desensitization_Rule': '6c0aa89f-a132-4082-8a68-73f0dcaca8b6',
    '脱敏分类': '3406a885-ac20-4f53-bca1-9c1921717763', '脱敏全局替换': 'fbc9a4d7-103b-4360-9ff9-a2202cf53f79'}
  const models = buildFormalModels(fields).map(model => {
    const id = modelIds[model.name]
    if (!id) throw new Error(`缺少模型身份: ${model.name}`)
    return {...model, id, fields: model.fields.map(field => ({...field, modelId: id}))}
  })
  const api = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'scope', headers: {'X-AppId': 'APP'}})})
  const dataSet = new LowcodeDataSpaceAssembler(api, http).assemble({
    config, space: {dataSpaceId: scenario, name: '脱敏规则'}, models, relations: [],
  }).dataSet
  const tool = new PageTool({pageId: 'rule-test'})
  tool.hydrateFileText('rule.json', rule)
  tool.hydrateFileText('script.js', script)
  tool.hydrateFileText('style.css', style)
  tool.markLoaded()
  const runtime = new PageRuntime({tool, scenarioIds: [scenario], loadScenario: async () => dataSet})
  await runtime.load()
  const rules = dataSet.getView('Base_Desensitization_Rule')
  const categories = dataSet.getView('脱敏分类')
  const globals = dataSet.getView('脱敏全局替换')
  if (!rules || !categories || !globals) throw new Error('规则视图缺失')
  await Promise.all([rules.refresh(), categories.refresh(), globals.refresh()])
  runtimes.push(runtime); state.runtime = runtime
  const clean = defineComponent({render: () => h('div', 'clean')})
  const router = createRouter({history: createMemoryHistory(), routes: []})
  const dynamic = createDynamicRouter({router, pageComponent: clean,
    loadNavigation: async () => ({id: 'root', title: 'Root', childPlacement: 'header', items: [
      {id: 'rules', title: '规则', path: '/rules', itemKind: 'system-page'},
      {id: 'clean', title: 'Clean', path: '/clean', itemKind: 'system-page'},
    ]}), componentMap: {'/rules': RulePage, '/clean': clean}})
  await dynamic.registerRoutes()
  await router.push('/rules')
  const wrapper = mount(defineComponent({setup: () => {provideTestPageService(router); return () => h(RouterView)}}), {
    attachTo: document.body, global: {plugins: [router, ElementPlus, Spark.createPlugin()]},
  })
  wrappers.push(wrapper)
  await flushPromises()
  const click = async (label: string) => {
    const button = wrapper.findAllComponents(RendererButton).find(item => item.props('label') === label)
    if (!button) throw new Error(`按钮不存在: ${label}`)
    await button.get('button').trigger('click')
    await flushPromises()
  }
  const action = (label: string) => {
    const table = wrapper.findComponent(RendererTable)
    const node = table.props('actions')?.children?.find(item => typeof item === 'object' && item !== null && item.props?.['label'] === label)
    if (!node || typeof node !== 'object' || typeof node.props?.['onClick'] !== 'function') throw new Error(`行动作不存在: ${label}`)
    return node.props['onClick']
  }
  return {http, dataSet, rules, wrapper, router, click, action}
}

describe('脱敏规则页面', () => {
  it.each([{global: 0, expected: '#ba'}, {global: 1, expected: '#b#'}])('保留数值字典原值并按全局值 $global 计算', async ({global, expected}) => {
    const f = await open({type: 1, global})
    f.action('编辑')(f.rules.rows[0]!)
    await flushPromises()
    f.rules.updateEditingValue('R1', 'template', '#')
    await f.click('确定')
    await vi.waitFor(() => expect(f.http.records['Base_Desensitization_Rule']?.[0]?.['desensitized_sample']).toBe(expected))
    expect(f.http.records['Base_Desensitization_Rule']?.[0]).toMatchObject({type: 1, is_gabale: global})
    expect(f.http.saves).toHaveLength(1)
  })

  it('编辑字典值0时仅替换首次匹配，字典值1时替换全部并保存', async () => {
    const f = await open()
    const row = f.rules.rows[0]!
    f.action('编辑')(row)
    await flushPromises()
    expect(f.wrapper.findComponent(RendererDialog).exists()).toBe(true)
    f.rules.updateEditingValue('R1', 'template', '#')
    await f.click('确定')
    await vi.waitFor(() => expect(f.http.records['Base_Desensitization_Rule']?.[0]?.['desensitized_sample']).toBe('#ba'))
    f.action('编辑')(f.rules.rows[0]!)
    await flushPromises()
    f.rules.updateEditingValue('R1', 'is_gabale', '1')
    await f.click('确定')
    await vi.waitFor(() => expect(f.http.records['Base_Desensitization_Rule']?.[0]?.['desensitized_sample']).toBe('#b#'))
    expect(f.http.saves).toHaveLength(2)
  })

  it('新增可取消；无效正则不派发保存', async () => {
    const f = await open()
    await f.click('新增')
    expect(f.wrapper.getComponent(RendererDialog).findAllComponents(FieldSelect).map(field => field.props('field'))).toEqual(['type'])
    await f.router.push('/clean')
    expect(f.router.currentRoute.value.path).toBe('/rules')
    const id = [...f.rules.dirtyTracking.pendingCreateIds][0]
    if (id === undefined) throw new Error('新增草稿缺少身份')
    for (const [field, value] of Object.entries({type: '1', name: '规则二', regex: '[', template: '*', original_sample: 'abc'})) {
      f.rules.updateEditingValue(id, field, value)
    }
    await f.click('确定')
    expect(document.body.textContent).toContain('输入正则不合法')
    expect(f.http.saves).toHaveLength(0)
    await f.click('取消')
    expect(f.rules.dirtyTracking.hasPendingChanges()).toBe(false)
  })

  it('删除可取消，回执中断不重复派发删除', async () => {
    const f = await open()
    f.action('删除')(f.rules.rows[0]!)
    await flushPromises()
    await f.click('取消')
    expect(f.http.saves).toHaveLength(0)
    f.action('删除')(f.rules.rows[0]!)
    await flushPromises()
    f.http.failAfterWrite = true
    await f.click('确定删除')
    await vi.waitFor(() => expect(f.rules.hasUnconfirmedSave).toBe(true))
    expect(f.http.saves).toHaveLength(1)
    expect(document.body.textContent).toContain('删除结果未知，保留原提交，不会重复删除。')
    await f.router.push('/clean')
    expect(f.router.currentRoute.value.path).toBe('/rules')
    await f.click('核验原删除结果')
    await vi.waitFor(() => expect(f.rules.hasUnconfirmedSave).toBe(false))
    expect(f.rules.rows).toEqual([])
    expect(f.http.saves).toHaveLength(1)
    await f.router.push('/clean')
    expect(f.router.currentRoute.value.path).toBe('/clean')
  })

  it('confirms the chosen rule and reads the remaining original rule in a new instance', async () => {
    const f = await open()
    const records = f.http.records['Base_Desensitization_Rule']!
    records.push({...records[0], rowid: 'R2', name: '规则二'})
    await f.rules.refresh()
    f.action('删除')(f.rules.rows.find(row => row['rowid'] === 'R2')!)
    await flushPromises()
    const dialog = f.wrapper.getComponent(RendererDialog)
    expect(dialog.props('id')).toBe('ruleDeleteDialog')
    expect(dialog.text()).toContain('确定要删除此脱敏规则吗？')
    expect(dialog.getComponent(RendererForm).props('contextRowId')).toBe('R2')
    await f.click('确定删除')
    await vi.waitFor(() => expect(f.wrapper.findComponent(RendererDialog).exists()).toBe(false))
    expect(f.http.saves).toMatchObject([{table: 'Base_Desensitization_Rule', deleted: [{rowid: 'R2'}]}])
    const reopened = await open({}, f.http)
    expect(reopened.rules.rows.map(row => row['rowid'])).toEqual(['R1'])
    expect(f.http.saves).toHaveLength(1)
  })

  it('keeps a hidden original name out of the delete dialog and reports a rejected write', async () => {
    const f = await open()
    f.http.hiddenFields['Base_Desensitization_Rule'] = ['name']
    await f.rules.refresh()
    f.action('删除')(f.rules.rows[0]!)
    await flushPromises()
    expect(f.wrapper.getComponent(RendererDialog).text()).not.toContain('规则一')
    f.http.rejectNextSave = true
    await f.click('确定删除')
    await vi.waitFor(() => expect(document.body.textContent).toContain('Rejected before write'))
    expect(f.http.saves).toEqual([])
    expect(f.http.records['Base_Desensitization_Rule']?.map(row => row['rowid'])).toEqual(['R1'])
  })
})

describe('脱敏样例', () => {
  it('拒绝不匹配和无效正则', () => {
    expect(buildRuleSample({regex: '[', template: '*', original: 'abc', global: false}).error).toContain('正则不合法')
    expect(buildRuleSample({regex: 'z', template: '*', original: 'abc', global: false}).error).toContain('原文不合法')
  })
})
