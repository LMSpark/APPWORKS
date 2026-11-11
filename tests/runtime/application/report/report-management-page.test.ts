import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {defineComponent, h} from 'vue'
import {createMemoryHistory, createRouter, RouterView} from 'vue-router'
import ElementPlus from 'element-plus'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {RendererButton, RendererDialog, RendererTable, Spark, registerAllRenderers} from '@spark-appworks/spark-component'
import {createDynamicRouter} from '../../../../packages/spark-app/src/router/dynamic'
import {createReportRuntime} from './report.fixture'

const state: {runtime: PageRuntime | undefined} = vi.hoisted(() => ({runtime: undefined}))
const scenario = 'FB291E325272007AEED8921C28B93CFD'
vi.mock('@/views/features/shared/runtime/use-feature-page-runtime', async () => {
  const {ref} = await import('vue')
  const {PAGE_RUNTIME, useSparkComponent} = await import('@spark-appworks/spark-component')
  return {useFeaturePageRuntime: () => {
    if (!state.runtime) throw new Error('缺少测试运行实例')
    const {sparkProvide} = useSparkComponent({type: 'report-test-runtime'})
    sparkProvide(PAGE_RUNTIME, state.runtime)
    return {viewKey: `${scenario}@Base_ReportInfo@default`, session: {runtime: state.runtime},
      ready: ref(true), loading: ref(false), error: ref(''), loadCurrentRoute: vi.fn()}
  }}
})

const {default: ReportManagementPage} = await import('@/views/features/integration/report/ui/report-management-page.vue')
const wrappers: VueWrapper[] = []
const runtimes: PageRuntime[] = []
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

async function open() {
  const f = await createReportRuntime(scenario)
  runtimes.push(f.runtime)
  state.runtime = f.runtime
  const clean = defineComponent({render: () => h('div', 'clean')})
  const router = createRouter({history: createMemoryHistory(), routes: []})
  const dynamic = createDynamicRouter({router, pageComponent: clean,
    loadNavigation: async () => ({id: 'root', title: 'Root', childPlacement: 'header', items: [
      {id: 'report', title: '报表', path: '/report', itemKind: 'system-page'},
      {id: 'clean', title: 'Clean', path: '/clean', itemKind: 'system-page'},
    ]}), componentMap: {'/report': ReportManagementPage, '/clean': clean}})
  await dynamic.registerRoutes()
  await router.push('/report')
  const wrapper = mount(defineComponent({setup: () => () => h(RouterView)}), {
    attachTo: document.body, global: {plugins: [router, ElementPlus, Spark.createPlugin()]},
  })
  wrappers.push(wrapper)
  await flushPromises()
  const instance = dynamic.getSystemPageInstance(router.currentRoute.value)
  if (!instance) throw new Error('报表系统页实例缺失')
  const click = async (label: string) => {
    const button = wrapper.findAllComponents(RendererButton).find(item => item.props('label') === label)
    if (!button) throw new Error(`按钮不存在: ${label}`)
    await button.get('button').trigger('click')
    await flushPromises()
  }
  return {...f, router, dynamic, instance, wrapper, click}
}

describe('报表系统页的新增生命周期', () => {
  it('初始化第二条记录后发生错误时，撤销两条本地新增', async () => {
    const f = await open()
    vi.spyOn(f.info, 'updateEditingValue').mockImplementation(() => {throw new Error('不能关联初始版本')})
    await f.click('新增')
    expect(document.body.textContent).toContain('不能关联初始版本')
    expect(f.info.rows).toHaveLength(0)
    expect(f.report.rows).toHaveLength(0)
    expect(f.http.saves).toHaveLength(0)
    expect(f.instance.isDirty).toBe(false)
  })

  it('草稿阻止关闭和路由切换，取消后允许离开', async () => {
    const f = await open()
    await f.click('新增')
    await vi.waitFor(() => expect(f.instance.isDirty).toBe(true))
    expect(() => f.dynamic.closeSystemPageInstance(f.instance.instanceId)).toThrow('未保存')
    await f.router.push('/clean')
    expect(f.router.currentRoute.value.path).toBe('/report')
    await f.click('取消')
    await vi.waitFor(() => expect(f.instance.isDirty).toBe(false))
    await f.router.push('/clean')
    expect(f.router.currentRoute.value.path).toBe('/clean')
    expect(f.http.saves).toHaveLength(0)
  })

  it('未知保存阻止离开，核验原批次后释放系统页', async () => {
    const f = await open()
    await f.click('新增')
    const row = f.info.rows[0]
    if (!row) throw new Error('缺少本地报表')
    const id = f.info.getPkKey(row)
    if (id === undefined) throw new Error('缺少本地报表身份')
    f.info.updateEditingValue(id, 'RptName', '测试报表')
    f.info.updateEditingValue(id, 'modid', 'APP')
    f.http.failAfterWrite = true
    await f.click('确定')
    await vi.waitFor(() => expect(f.info.hasUnconfirmedSave).toBe(true))
    expect(f.instance.isDirty).toBe(true)
    await f.router.push('/clean')
    expect(f.router.currentRoute.value.path).toBe('/report')
    await f.click('核验原保存结果')
    await vi.waitFor(() => expect(f.instance.isDirty).toBe(false))
    expect(f.http.saves).toHaveLength(2)
    await f.router.push('/clean')
    expect(f.router.currentRoute.value.path).toBe('/clean')
  })

  it('用户明确放弃部分结果核验后，目录保留原目标与非回滚提示', async () => {
    const f = await open()
    await f.click('新增')
    const infoRow = f.info.rows[0], reportRow = f.report.rows[0]
    if (!infoRow || !reportRow) throw new Error('缺少本地新增记录')
    const infoId = f.info.getPkKey(infoRow), reportId = f.report.getPkKey(reportRow)
    if (infoId === undefined || reportId === undefined) throw new Error('缺少本地新增身份')
    f.info.updateEditingValue(infoId, 'RptName', '部分结果')
    f.info.updateEditingValue(infoId, 'modid', 'APP')
    f.http.failAfterWrite = true
    await f.click('确定')
    await vi.waitFor(() => expect(f.info.hasUnconfirmedSave).toBe(true))
    f.http.records['Base_Report'] = []
    await f.click('核验原保存结果')
    await f.click('放弃核验并返回')
    const confirm = Array.from(document.querySelectorAll<HTMLButtonElement>('.el-message-box__btns button')).reverse()
      .find(button => button.textContent?.trim() === '放弃核验')
    if (!confirm) throw new Error('放弃核验确认框缺少确认按钮')
    confirm.click()
    await flushPromises()
    await vi.waitFor(() => expect(f.instance.isDirty).toBe(false))
    expect(document.body.textContent).toContain('服务端可能已部分或全部生效')
    expect(document.body.textContent).toContain(String(infoId))
    expect(document.body.textContent).toContain(String(reportId))
    expect(f.http.records['Base_ReportInfo']).toHaveLength(1)
    expect(f.http.records['Base_Report']).toHaveLength(0)
    expect(f.http.saves).toHaveLength(2)
  })
})

async function seed(f: Awaited<ReturnType<typeof open>>) {
  f.http.records['Base_ReportInfo'] = [{rowid: 'R1', RptName: '报表一', modid: 'APP', modname: '应用', RptDesc: '', version_id: 'V1', version_dataid: 'D1'}]
  f.http.records['Base_Report'] = [
    {rowid: 'V1', RptID: 'R1', Version: '一', State: '1', isMerg: '0', isDashboards: '0', DataFormID: 'D1'},
    {rowid: 'V2', RptID: 'R1', Version: '二', State: '0', isMerg: '0', isDashboards: '0', DataFormID: 'D2'},
  ]
  await Promise.all([f.info.refresh(), f.report.refresh()])
  await flushPromises()
}
type ActionNode = {props?: {label?: string; onClick?: (row: Record<string, unknown>) => void}}
async function rowAction(f: Awaited<ReturnType<typeof open>>, label: string, row: Record<string, unknown>, table = 0) {
  const target = f.wrapper.findAllComponents(RendererTable).at(table)
  const actions = target?.props('actions') as {children?: ActionNode[]} | undefined
  const action = actions?.children?.find(item => item.props?.label === label)?.props?.onClick
  if (!action) throw new Error(`行按钮不存在: ${label}`)
  action(row)
  await flushPromises()
}
function infoRow(f: Awaited<ReturnType<typeof open>>) {
  const row = f.info.rows[0]
  if (!row) throw new Error('缺少报表行')
  return row
}
async function confirmBox(accept: boolean) {
  const box = Array.from(document.querySelectorAll<HTMLElement>('.el-message-box__btns')).reverse()[0]
  const button = box?.querySelectorAll<HTMLButtonElement>('button')[accept ? 1 : 0]
  if (!button) throw new Error('删除确认框缺少按钮')
  button.click()
  await flushPromises()
}
describe('报表多记录修改的失败收敛', () => {
  it('删除回执中断后锁定目录，核验原批次确认已删除且不重发', async () => {
    const f = await open()
    await seed(f)
    f.http.failAfterWrite = true
    await rowAction(f, '删除', infoRow(f))
    await confirmBox(true)
    await vi.waitFor(() => expect(document.body.textContent).toContain('核验原保存结果'))
    expect(f.http.saves).toHaveLength(2)
    expect(f.instance.isDirty).toBe(true)
    await f.click('新增')
    expect(f.info.dirtyTracking.hasPendingChanges()).toBe(true)
    await f.click('核验原保存结果')
    await vi.waitFor(() => expect(f.instance.isDirty).toBe(false))
    expect(document.body.textContent).toContain('原保存结果已确认')
    expect(f.http.saves).toHaveLength(2)
    expect(f.http.records['Base_ReportInfo']).toHaveLength(0)
    expect(f.http.records['Base_Report']).toHaveLength(0)
    expect(f.info.rows).toHaveLength(0)
  })

  it('删除在写入前被拒绝时撤销本地删除并刷新，可再次删除', async () => {
    const f = await open()
    await seed(f)
    f.http.rejectNextSave = true
    await rowAction(f, '删除', infoRow(f))
    await confirmBox(true)
    await vi.waitFor(() => expect(document.body.textContent).toContain('已撤销本地修改'))
    expect(f.instance.isDirty).toBe(false)
    expect(f.info.rows).toHaveLength(1)
    expect(f.http.records['Base_Report']).toHaveLength(2)
    await rowAction(f, '删除', infoRow(f))
    await confirmBox(true)
    await vi.waitFor(() => expect(document.body.textContent).toContain('删除成功'))
    expect(f.http.records['Base_ReportInfo']).toHaveLength(0)
    expect(f.http.records['Base_Report']).toHaveLength(0)
  })

  it('取消删除确认不提交', async () => {
    const f = await open()
    await seed(f)
    await rowAction(f, '删除', infoRow(f))
    await confirmBox(false)
    expect(f.http.saves).toHaveLength(0)
    expect(f.instance.isDirty).toBe(false)
  })

  it('启动版本被拒绝时撤销两表本地修改，未知回执须在目录核验', async () => {
    const f = await open()
    await seed(f)
    await rowAction(f, '历史版本', infoRow(f))
    const dialog = () => {
      const found = Array.from(document.querySelectorAll<HTMLElement>('.el-dialog')).find(item => item.textContent?.includes('报表设计'))
      if (!found) throw new Error('版本窗缺失')
      return found
    }
    const versions = f.runtime.resolveView(`${scenario}@Base_Report@byReport`)
    if (!versions) throw new Error('缺少版本视图')
    await vi.waitFor(() => expect(versions.rows).toHaveLength(2))
    const second = () => {
      const found = versions.rows.find(row => row['rowid'] === 'V2')
      if (!found) throw new Error('缺少版本二')
      return found
    }
    f.http.rejectNextSave = true
    await rowAction(f, '启动', second(), 1)
    await vi.waitFor(() => expect(dialog().textContent).toContain('已撤销本地修改'))
    expect(versions.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(f.info.hasEditingChanges()).toBe(false)
    expect(f.info.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(f.http.records['Base_ReportInfo']?.[0]?.['version_id']).toBe('V1')

    f.http.failAfterWrite = true
    await rowAction(f, '启动', second(), 1)
    await vi.waitFor(() => expect(dialog().textContent).toContain('结果未确认'))
    const saves = f.http.saves.length
    await rowAction(f, '删除', second(), 1)
    expect(f.http.saves).toHaveLength(saves)
    expect(dialog().textContent).toContain('结果未确认')
    const close = f.wrapper.findAllComponents(RendererDialog).find(item => item.props('title') === '报表设计')
    if (!close) throw new Error('版本窗组件缺失')
    close.vm.$emit('update:model-value', false)
    await flushPromises()
    expect(document.body.textContent).toContain('结果未确认')
    await f.click('核验原保存结果')
    await vi.waitFor(() => expect(f.instance.isDirty).toBe(false))
    expect(f.http.saves).toHaveLength(saves)
    expect(f.http.records['Base_ReportInfo']?.[0]?.['version_id']).toBe('V2')
    expect(f.http.records['Base_Report']?.find(row => row['rowid'] === 'V2')?.['State']).toBe('1')
    expect(f.http.records['Base_Report']?.find(row => row['rowid'] === 'V1')?.['State']).toBe('0')
  })
  it('绑定模型被拒绝时撤销两表修改，回执中断后关窗核验不重发', async () => {
    const f = await open()
    await seed(f)
    await rowAction(f, '模型', infoRow(f))
    const picker = f.runtime.resolveView(`${scenario}@Base_DataSet@picker`)
    if (!picker) throw new Error('缺少模型候选视图')
    await vi.waitFor(() => expect(picker.rows).toHaveLength(2))
    const table = f.wrapper.findAllComponents(RendererTable).at(1)
    const choose = table?.props('onRowClick') as ((row: Record<string, unknown>) => void) | undefined
    const target = picker.rows.find(row => row['rowid'] === 'D2')
    if (!choose || !target) throw new Error('模型选择入口缺失')
    choose(target)
    await flushPromises()
    f.http.rejectNextSave = true
    await f.click('确定')
    await vi.waitFor(() => expect(document.body.textContent).toContain('已撤销本地修改'))
    expect(f.info.hasEditingChanges()).toBe(false)
    expect(f.report.hasEditingChanges()).toBe(false)
    expect(f.info.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(f.report.dirtyTracking.hasPendingChanges()).toBe(false)

    f.http.failAfterWrite = true
    await f.click('确定')
    await vi.waitFor(() => expect(document.body.textContent).toContain('结果未确认'))
    const saves = f.http.saves.length
    await f.click('确定')
    expect(f.http.saves).toHaveLength(saves)
    await f.click('取消')
    await f.click('核验原保存结果')
    await vi.waitFor(() => expect(f.instance.isDirty).toBe(false))
    expect(f.http.saves).toHaveLength(saves)
    expect(f.http.records['Base_ReportInfo']?.[0]?.['version_dataid']).toBe('D2')
    expect(f.http.records['Base_Report']?.find(row => row['rowid'] === 'V1')?.['DataFormID']).toBe('D2')
  })
})