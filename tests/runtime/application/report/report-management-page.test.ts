import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {config, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {defineComponent, h} from 'vue'
import {createMemoryHistory, createRouter, RouterView} from 'vue-router'
import ElementPlus from 'element-plus'
import {PageTool, type PageRuntime} from '@spark-appworks/spark-project-model'
import {getSparkNodeChildren} from '@spark-appworks/spark-data'
import {FieldText, FieldTextarea, RendererButton, RendererDialog, RendererTable, Spark, registerAllRenderers} from '@spark-appworks/spark-component'
import {createDynamicRouter} from '../../../../packages/spark-app/src/router/dynamic'
import {createReportRuntime, readPersistedReport} from './report.fixture'
import {provideTestPageService} from '../../../support/helpers/page-service-host'
import rule from '@/views/features/integration/report/ui/tool/rule.json?raw'
import script from '@/views/features/integration/report/ui/tool/script.js?raw'
import style from '@/views/features/integration/report/ui/tool/style.css?raw'

const state: {runtime: PageRuntime | undefined; preserveRuntime?: () => boolean; setReloadBlocked?: (value: boolean) => void} = vi.hoisted(() => ({runtime: undefined}))
const scenario = 'FB291E325272007AEED8921C28B93CFD'
vi.mock('@/views/features/shared/runtime/use-feature-page-runtime', async () => {
  const {ref} = await import('vue')
  const {PAGE_RUNTIME, useSparkComponent} = await import('@spark-appworks/spark-component')
  return {useFeaturePageRuntime: (options: {preserveRuntime: () => boolean}) => {
    state.preserveRuntime = options.preserveRuntime
    const reloadBlocked = ref(false)
    state.setReloadBlocked = value => {reloadBlocked.value = value}
    if (!state.runtime) throw new Error('缺少测试运行实例')
    const {sparkProvide} = useSparkComponent({type: 'report-test-runtime'})
    sparkProvide(PAGE_RUNTIME, state.runtime)
    return {viewKey: ref(`${scenario}@Base_ReportInfo@default`), session: {runtime: state.runtime, isCurrent: (runtime: PageRuntime) => state.runtime === runtime},
      ready: ref(true), loading: ref(false), error: ref(''), reloadBlocked, loadCurrentRoute: vi.fn()}
  }}
})

const {default: ReportManagementPage} = await import('@/views/features/integration/report/ui/report-management-page.vue')
const wrappers: VueWrapper[] = []
const runtimes: PageRuntime[] = []
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
  delete state.preserveRuntime
  delete state.setReloadBlocked
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  config.global.stubs = originalStubs
})

async function open() {
  const tool = new PageTool({pageId: 'report-test'})
  tool.hydrateFileText('rule.json', rule)
  tool.hydrateFileText('script.js', script)
  tool.hydrateFileText('style.css', style)
  tool.markLoaded()
  const f = await createReportRuntime(scenario, undefined, tool)
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
  const wrapper = mount(defineComponent({setup: () => {provideTestPageService(router); return () => h(RouterView)}}), {
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

  it.each([false, true])('新增只在收到双记录回执后释放系统页（回执中断=%s）', async lost => {
    const f = await open()
    await f.click('新增')
    const row = f.info.rows[0]
    if (!row) throw new Error('缺少本地报表')
    const id = f.info.getPkKey(row)
    if (id === undefined) throw new Error('缺少本地报表身份')
    f.info.updateEditingValue(id, 'RptName', '测试报表')
    f.info.updateEditingValue(id, 'modid', 'APP')
    f.http.failAfterWrite = lost
    f.http.beforeSave = vi.fn()
    await f.click('确定')
    if (lost) {
      await vi.waitFor(() => expect(f.info.hasUnconfirmedSave).toBe(true))
      await f.router.push('/clean')
      expect(f.router.currentRoute.value.path).toBe('/report')
      await f.click('核验原保存结果')
      expect(document.body.textContent).toContain('SPARK_SAVE_UNVERIFIABLE')
      expect(f.info.hasUnconfirmedSave).toBe(true)
      expect(f.report.hasUnconfirmedSave).toBe(true)
      expect(() => f.dynamic.closeSystemPageInstance(f.instance.instanceId)).toThrow('未保存')
    }
    await vi.waitFor(() => expect(f.instance.isDirty).toBe(lost))
    const persisted = await readPersistedReport(scenario, f.http)
    expect(persisted.info.rows).toMatchObject([{rowid: id, RptName: '测试报表', modid: 'APP'}])
    expect(persisted.versions.rows).toMatchObject([{rowid: persisted.info.rows[0]?.['version_id'], RptID: id}])
    expect(f.http.beforeSave).toHaveBeenCalledOnce()
    expect(f.http.saves).toHaveLength(2)
    await f.router.push('/clean')
    expect(f.router.currentRoute.value.path).toBe(lost ? '/report' : '/clean')
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
  if (!action) throw new Error(`行按钮不存在: ${label} ${f.wrapper.text()} ${JSON.stringify(actions)}`)
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
  it('行操作绑定报表目录的正式完整视图键', async () => {
    const f = await open()
    await seed(f)
    const actions = getSparkNodeChildren(f.wrapper.getComponent(RendererTable).props('actions')?.children)
    expect(actions).toHaveLength(4)
    for (const action of actions) {
      expect(typeof action.props?.['dataViewKey']).toBe('string')
      expect(action.props?.['dataViewKey']).toBe(`${scenario}@Base_ReportInfo@default`)
    }
  })

  it('规则驱动的编辑表单只保存原报表及重新映射的应用名称', async () => {
    const f = await open()
    await seed(f)
    f.http.records['Base_ReportInfo']![0]!['modname'] = '旧名称'
    await f.info.refresh()
    await rowAction(f, '编辑', infoRow(f))
    const field = f.wrapper.findAllComponents(FieldTextarea).find(item => item.props('field') === 'RptDesc')
    if (!field) throw new Error('报表编辑规则未渲染描述字段')
    await field.get('textarea').setValue('更新后的描述')
    await f.click('确定')
    expect(f.http.saves).toHaveLength(1)
    expect(f.http.saves[0]?.changed).toEqual([expect.objectContaining({rowid: 'R1', RptDesc: '更新后的描述', modname: '应用'})])
  })

  it('删除回执中断后保留原删除捕获，即使独立重开已读不到目录与版本', async () => {
    const f = await open()
    await seed(f)
    f.http.failAfterWrite = true
    f.http.beforeSave = vi.fn()
    await rowAction(f, '删除', infoRow(f))
    await confirmBox(true)
    await vi.waitFor(() => expect(document.body.textContent).toContain('核验原保存结果'))
    expect(f.http.saves).toHaveLength(2)
    expect(f.instance.isDirty).toBe(true)
    expect(state.preserveRuntime?.()).toBe(true)
    state.setReloadBlocked?.(true)
    await flushPromises()
    expect(f.wrapper.text()).toContain('当前仍显示原报表')
    const switchButton = f.wrapper.findAllComponents(RendererButton).find(button => button.props('label') === '切换到当前导航')
    expect(switchButton?.props('disabled')).toBe(true)
    const verifyButton = f.wrapper.findAllComponents(RendererButton).find(button => button.props('label') === '核验原保存结果')
    expect(verifyButton?.props('disabled')).toBe(false)
    await f.click('新增')
    expect(f.info.dirtyTracking.hasPendingChanges()).toBe(true)
    await f.click('核验原保存结果')
    expect(document.body.textContent).toContain('SPARK_SAVE_UNVERIFIABLE')
    expect(f.instance.isDirty).toBe(true)
    expect(f.info.hasUnconfirmedSave).toBe(true)
    expect(f.info.dirtyTracking.pendingDeleteIds).toEqual(new Set(['R1']))
    const versions = f.runtime.resolveView(`${scenario}@Base_Report@byReport`)!
    expect(versions.hasUnconfirmedSave).toBe(true)
    expect(versions.dirtyTracking.pendingDeleteIds).toEqual(new Set(['V1', 'V2']))
    const persisted = await readPersistedReport(scenario, f.http)
    expect(f.http.beforeSave).toHaveBeenCalledOnce()
    expect(f.http.saves).toHaveLength(2)
    expect(persisted.info).toMatchObject({rows: [], total: 0})
    expect(persisted.versions).toMatchObject({rows: [], total: 0})
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

  it.each(['refreshed', 'partial'] as const)('拒绝使用失效报表或不完整版本删除 (%s)', async mode => {
    const f = await open()
    await seed(f)
    const versions = f.runtime.resolveView(`${scenario}@Base_Report@byReport`)!
    const paging = mode === 'partial' ? vi.spyOn(versions, 'nextPageAvailable', 'get').mockReturnValue(true) : undefined
    try {
      await rowAction(f, '删除', infoRow(f))
      if (mode === 'refreshed') await f.info.refresh()
      await confirmBox(true)
      await vi.waitFor(() => expect(document.body.textContent).toContain(
        mode === 'refreshed' ? '原查询身份或行已变化' : '报表版本未完整读取'))
      expect(f.http.saves).toHaveLength(0)
      expect(f.info.dirtyTracking.hasPendingChanges()).toBe(false)
      expect(versions.dirtyTracking.hasPendingChanges()).toBe(false)
    } finally {paging?.mockRestore()}
  })

  it('取消删除确认不提交', async () => {
    const f = await open()
    await seed(f)
    await rowAction(f, '删除', infoRow(f))
    await confirmBox(false)
    expect(f.http.saves).toHaveLength(0)
    expect(f.instance.isDirty).toBe(false)
    expect(state.preserveRuntime?.()).toBe(false)
  })

  it.each(['confirmed', 'mismatch'] as const)('新增版本核对启用版本配置 (%s)', async mode => {
    const f = await open()
    await seed(f)
    f.http.records['Base_Report']![0]!['isMerg'] = '1'
    f.http.records['Base_Report']![0]!['isDashboards'] = '1'
    if (mode === 'mismatch') {
      f.http.records['Base_ReportInfo']![0]!['version_id'] = 'V2'
      await f.info.refresh()
    }
    await rowAction(f, '历史版本', infoRow(f))
    const versions = f.runtime.resolveView(`${scenario}@Base_Report@byReport`)!
    await vi.waitFor(() => expect(versions.rows).toHaveLength(2))
    const dialog = [...document.querySelectorAll('.el-dialog')].find(item => item.textContent?.includes('报表设计'))
    const add = [...dialog?.querySelectorAll('button') ?? []].find(item => item.textContent?.trim() === '新增')
    if (!add) throw new Error('缺少新增版本入口')
    add.click()
    await flushPromises()
    if (mode === 'confirmed') {
      const id = [...versions.dirtyTracking.pendingCreateIds][0]
      if (id === undefined) throw new Error('缺少新版本草稿')
      expect(versions.getEditingRow(id)).toMatchObject({RptID: 'R1', State: '0', isMerg: '1', isDashboards: '1'})
    } else {
      expect(dialog?.textContent).toContain('报表头与启用版本不一致')
      expect(versions.dirtyTracking.hasPendingChanges()).toBe(false)
    }
    expect(f.http.saves).toHaveLength(0)
  })

  it('版本规则表单校验名称并只保存原版本行', async () => {
    const f = await open()
    await seed(f)
    await rowAction(f, '历史版本', infoRow(f))
    const versions = f.runtime.resolveView(`${scenario}@Base_Report@byReport`)!
    await vi.waitFor(() => expect(versions.rows).toHaveLength(2))
    const original = versions.rows.find(row => row['rowid'] === 'V2')
    if (!original) throw new Error('缺少原版本')
    await rowAction(f, '编辑', original, 1)
    const editor = f.wrapper.findAllComponents(RendererDialog).find(item => item.props('title') === '编辑版本')
    if (!editor) throw new Error('缺少版本编辑表单')
    const input = editor.getComponent(FieldText).get('input')
    await input.setValue('')
    await f.click('确定')
    expect(document.body.textContent).toContain('请填写版本名称')
    expect(f.http.saves).toHaveLength(0)
    await input.setValue('修订版')
    await f.click('确定')
    expect(f.http.saves).toHaveLength(1)
    expect(f.http.saves[0]?.changed).toEqual([expect.objectContaining({rowid: 'V2', Version: '修订版'})])
  })

  it('历史版本刷新后拒绝编辑或删除同主键旧行', async () => {
    const f = await open()
    await seed(f)
    await rowAction(f, '历史版本', infoRow(f))
    const versions = f.runtime.resolveView(`${scenario}@Base_Report@byReport`)!
    await vi.waitFor(() => expect(versions.rows).toHaveLength(2))
    const stale = versions.rows.find(row => row['rowid'] === 'V2')
    if (!stale) throw new Error('缺少原版本')
    await versions.refresh()
    await rowAction(f, '编辑', stale, 1)
    expect(f.wrapper.findAllComponents(RendererDialog).some(dialog => dialog.props('title') === '编辑版本')).toBe(false)
    await rowAction(f, '删除', stale, 1)
    expect(document.body.textContent).toContain('缺少唯一原查询行')
    expect(f.http.saves).toHaveLength(0)
    expect(versions.dirtyTracking.hasPendingChanges()).toBe(false)
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
    await rowAction(f, '启动', {...second()}, 1)
    expect(f.http.saves).toHaveLength(0)
    expect(versions.hasEditingChanges()).toBe(false)
    expect(f.info.hasEditingChanges()).toBe(false)
    const originalAccess = versions.fieldAccess.bind(versions)
    const restricted = vi.spyOn(versions, 'fieldAccess').mockImplementation((row, field) => {
      const access = originalAccess(row, field)
      return row?.['rowid'] === 'V1' && field === 'State' ? {...access, read: 'invisible'} : access
    })
    try {
      await rowAction(f, '启动', second(), 1)
      expect(f.http.saves).toHaveLength(0)
      expect(versions.hasEditingChanges()).toBe(false)
      expect(f.info.hasEditingChanges()).toBe(false)
    } finally {restricted.mockRestore()}
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
    f.info.updateEditingValue('R1', 'RptDesc', '稍后补充的说明')
    await f.click('核验原保存结果')
    expect(document.body.textContent).toContain('SPARK_SAVE_UNVERIFIABLE')
    expect(f.instance.isDirty).toBe(true)
    expect(f.info.hasUnconfirmedSave).toBe(true)
    expect(versions.hasUnconfirmedSave).toBe(true)
    expect(f.info.getEditingPatch('R1')).toMatchObject({RptDesc: '稍后补充的说明'})
    const persisted = await readPersistedReport(scenario, f.http)
    expect(f.http.saves).toHaveLength(saves)
    expect(persisted.info.rows).toMatchObject([{rowid: 'R1', version_id: 'V2', RptDesc: ''}])
    expect(persisted.versions.rows.find(row => row['rowid'] === 'V2')?.['State']).toBe('1')
    expect(persisted.versions.rows.find(row => row['rowid'] === 'V1')?.['State']).toBe('0')
  })
  it.each(['version', 'picker'] as const)('拒绝使用失效版本或候选绑定模型 (%s)', async changed => {
    const f = await open()
    await seed(f)
    await rowAction(f, '模型', infoRow(f))
    const picker = f.runtime.resolveView(`${scenario}@Base_DataSet@picker`)!
    await vi.waitFor(() => expect(picker.rows).toHaveLength(2))
    const choose = f.wrapper.findAllComponents(RendererTable).at(1)?.props('onRowClick') as ((row: Record<string, unknown>) => void) | undefined
    const target = picker.rows.find(row => row['rowid'] === 'D2')
    if (!choose || !target) throw new Error('模型选择入口缺失')
    choose(target)
    await flushPromises()
    if (changed === 'version') {
      f.http.records['Base_ReportInfo']![0]!['version_id'] = 'V2'
      await f.info.refresh()
    } else await picker.refresh()
    await f.click('确定')
    expect(document.body.textContent).toContain('原查询身份或行已变化')
    expect(f.http.saves).toHaveLength(0)
    expect(f.info.hasEditingChanges()).toBe(false)
    expect(f.report.hasEditingChanges()).toBe(false)
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

    await f.click('取消')
    await rowAction(f, '模型', infoRow(f))
    await vi.waitFor(() => expect(f.wrapper.findAllComponents(RendererTable).at(1)?.props('onRowClick')).toBeTypeOf('function'))
    const reopened = f.wrapper.findAllComponents(RendererTable).at(1)?.props('onRowClick')
    const current = picker.rows.find(row => row['rowid'] === 'D2')
    if (!reopened || !current) throw new Error('重新打开后缺少正式模型候选')
    await reopened(current, undefined, undefined, {cancel: false})
    await flushPromises()
    f.http.failAfterWrite = true
    await f.click('确定')
    await vi.waitFor(() => expect(document.body.textContent).toContain('结果未确认'))
    const saves = f.http.saves.length
    await f.click('确定')
    expect(f.http.saves).toHaveLength(saves)
    await f.click('取消')
    await f.click('核验原保存结果')
    expect(document.body.textContent).toContain('SPARK_SAVE_UNVERIFIABLE')
    expect(f.instance.isDirty).toBe(true)
    expect(f.info.hasUnconfirmedSave).toBe(true)
    expect(f.report.hasUnconfirmedSave).toBe(true)
    const persisted = await readPersistedReport(scenario, f.http)
    expect(f.http.saves).toHaveLength(saves)
    expect(persisted.info.rows).toMatchObject([{rowid: 'R1', version_dataid: 'D2'}])
    expect(persisted.versions.rows.find(row => row['rowid'] === 'V1')?.['DataFormID']).toBe('D2')
  })
})
