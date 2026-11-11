import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {defineComponent, h, ref} from 'vue'
import ElementPlus, {ElMessageBox} from 'element-plus'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {PAGE_RUNTIME, RendererButton, RendererDialog, Spark, registerAllRenderers, useSparkComponent} from '@spark-appworks/spark-component'
import ReportCreateDialog from '@/views/features/integration/report/ui/report-create-dialog.vue'
import {createReportRuntime} from './report.fixture'

const scenario = 'REPORT'
const infoKey = `${scenario}@Base_ReportInfo@default`
const reportKey = `${scenario}@Base_Report@default`
const appKey = `${scenario}@Base_AppSystemList@default`
const wrappers: VueWrapper[] = []
const runtimes: PageRuntime[] = []

async function respondToConfirmation(label: string): Promise<void> {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>('.el-message-box__btns button')).reverse()
    .find(item => item.textContent?.trim() === label)
  if (!button) throw new Error(`确认框按钮不存在: ${label}`)
  button.click()
  await flushPromises()
}

beforeEach(() => {
  registerAllRenderers()
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
})
afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  runtimes.splice(0).forEach(runtime => runtime.dispose())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function open() {
  const {http, dataSet, runtime, info, report, apps} = await createReportRuntime(scenario)
  runtimes.push(runtime)
  await info.addRowWithIdentity({field: 'rowid', value: 'I'}, {RptName: '测试报表', modid: 'APP', modname: '应用', version_id: 'V'})
  await report.addRowWithIdentity({field: 'rowid', value: 'V'}, {RptID: 'I', Version: '0', State: '1', isMerg: '0', isDashboards: '0'})
  const closed = vi.fn(), boundInfoId = ref('I')
  const Host = defineComponent({setup() {
    const {sparkProvide} = useSparkComponent({type: 'report-create-test'})
    sparkProvide(PAGE_RUNTIME, runtime)
    return () => h(ReportCreateDialog, {infoKey, reportKey, appKey, infoId: boundInfoId.value, reportId: 'V', onClose: closed})
  }})
  const wrapper = mount(Host, {attachTo: document.body, global: {plugins: [ElementPlus, Spark.createPlugin()]}})
  wrappers.push(wrapper)
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
  return {http, dataSet, runtime, info, report, apps, wrapper, closed, button, click, boundInfoId}
}

describe('报表新增的双记录提交', () => {
  it('取消未提交的新增只丢弃两条本地记录', async () => {
    const f = await open()
    await f.click('取消')
    expect(f.closed).toHaveBeenCalledOnce()
    expect(f.info.rows).toHaveLength(0)
    expect(f.report.rows).toHaveLength(0)
    expect(f.http.saves).toHaveLength(0)
  })

  it('回执中断后不能取消，核验原批次不会重发新增', async () => {
    const f = await open()
    f.http.failAfterWrite = true
    await f.click('确定')
    await vi.waitFor(() => {
      expect(f.info.hasUnconfirmedSave).toBe(true)
      expect(f.report.hasUnconfirmedSave).toBe(true)
    })
    expect(f.http.saves).toHaveLength(2)
    expect(f.wrapper.getComponent(RendererDialog).props('closeDisabled')).toBe(true)
    expect(f.button('取消').props('disabled')).toBe(true)
    f.wrapper.getComponent(RendererDialog).vm.$emit('update:modelValue', false)
    await flushPromises()
    expect(f.closed).not.toHaveBeenCalled()
    expect(f.info.dirtyTracking.isPendingCreate('I')).toBe(true)
    expect(f.report.dirtyTracking.isPendingCreate('V')).toBe(true)
    await f.click('核验原保存结果')
    await vi.waitFor(() => expect(f.closed).toHaveBeenCalledOnce())
    expect(f.http.saves).toHaveLength(2)
    expect(f.http.records['Base_ReportInfo']).toMatchObject([{rowid: 'I', version_id: 'V'}])
    expect(f.http.records['Base_Report']).toMatchObject([{rowid: 'V', RptID: 'I'}])
  })

  it('明确拒绝后仍可取消，不向服务端写入', async () => {
    const f = await open()
    f.http.rejectNextSave = true
    await f.click('确定')
    expect(f.info.hasUnconfirmedSave).toBe(false)
    expect(f.report.hasUnconfirmedSave).toBe(false)
    expect(f.closed).not.toHaveBeenCalled()
    await f.click('取消')
    expect(f.closed).toHaveBeenCalledOnce()
    expect(f.info.rows).toHaveLength(0)
    expect(f.report.rows).toHaveLength(0)
    expect(f.http.saves).toHaveLength(0)
  })

  it('确认原批次未生效后仅允许用户显式重新提交', async () => {
    const f = await open()
    let interrupted = true
    f.http.beforeSave = async () => {
      if (interrupted) {interrupted = false; throw new Error('派发后连接中断')}
    }
    await f.click('确定')
    await vi.waitFor(() => expect(f.info.hasUnconfirmedSave).toBe(true))
    expect(f.http.saves).toHaveLength(0)
    await f.click('核验原保存结果')
    await vi.waitFor(() => expect(f.info.hasUnconfirmedSave).toBe(false))
    expect(document.body.textContent).toContain('原提交未生效')
    expect(f.closed).not.toHaveBeenCalled()
    expect(f.http.saves).toHaveLength(0)
    await f.click('确定')
    await vi.waitFor(() => expect(f.closed).toHaveBeenCalledOnce())
    expect(f.http.saves).toHaveLength(2)
  })

  it('部分生效的原批次保持待核验，不允许关闭或重发', async () => {
    const f = await open()
    f.http.failAfterWrite = true
    await f.click('确定')
    await vi.waitFor(() => expect(f.info.hasUnconfirmedSave).toBe(true))
    f.http.records['Base_Report'] = []
    await f.click('核验原保存结果')
    expect(document.body.textContent).toContain('部分生效')
    expect(f.info.hasUnconfirmedSave).toBe(true)
    expect(f.report.hasUnconfirmedSave).toBe(true)
    expect(f.button('取消').props('disabled')).toBe(true)
    expect(f.closed).not.toHaveBeenCalled()
    expect(f.http.saves).toHaveLength(2)
  })

  it('放弃核验需要明确确认，并保留服务端可能已生效的记录', async () => {
    const f = await open()
    f.http.failAfterWrite = true
    await f.click('确定')
    await vi.waitFor(() => expect(f.info.hasUnconfirmedSave).toBe(true))
    f.http.records['Base_Report'] = []
    await f.click('核验原保存结果')
    await f.click('放弃核验并返回')
    await respondToConfirmation('继续核验')
    expect(f.closed).not.toHaveBeenCalled()
    expect(f.info.hasUnconfirmedSave).toBe(true)
    await f.click('放弃核验并返回')
    await respondToConfirmation('放弃核验')
    expect(f.closed).toHaveBeenCalledWith('abandoned')
    expect(f.info.hasUnconfirmedSave).toBe(false)
    expect(f.report.hasUnconfirmedSave).toBe(false)
    expect(f.info.rows).toHaveLength(0)
    expect(f.report.rows).toHaveLength(0)
    expect(f.http.records['Base_ReportInfo']).toMatchObject([{rowid: 'I'}])
    expect(f.http.records['Base_Report']).toHaveLength(0)
    expect(f.http.saves).toHaveLength(2)
  })

  it('原提交后出现其他编辑时不放弃捕获或丢弃新修改', async () => {
    const f = await open()
    f.http.failAfterWrite = true
    await f.click('确定')
    await vi.waitFor(() => expect(f.info.hasUnconfirmedSave).toBe(true))
    f.report.updateEditingValue('V', 'Version', '后来修改')
    await f.click('放弃核验并返回')
    await respondToConfirmation('放弃核验')
    expect(document.body.textContent).toContain('还有其他待处理修改')
    expect(f.closed).not.toHaveBeenCalled()
    expect(f.info.hasUnconfirmedSave).toBe(true)
    expect(f.report.hasUnconfirmedSave).toBe(true)
    expect(f.report.getEditingRow('V')?.['Version']).toBe('后来修改')
    expect(f.http.saves).toHaveLength(2)
  })

  it('确认期间原记录身份变化时保留原捕获和两条本地记录', async () => {
    const f = await open()
    f.http.failAfterWrite = true
    await f.click('确定')
    await vi.waitFor(() => expect(f.info.hasUnconfirmedSave).toBe(true))
    await f.click('放弃核验并返回')
    f.boundInfoId.value = 'OTHER'
    await flushPromises()
    await respondToConfirmation('放弃核验')
    expect(document.body.textContent).toContain('原提交身份已变化')
    expect(f.closed).not.toHaveBeenCalled()
    expect(f.info.hasUnconfirmedSave).toBe(true)
    expect(f.report.hasUnconfirmedSave).toBe(true)
    expect(f.info.dirtyTracking.isPendingCreate('I')).toBe(true)
    expect(f.report.dirtyTracking.isPendingCreate('V')).toBe(true)
    expect(f.http.saves).toHaveLength(2)
  })

  it('来源不支持放弃时保留原捕获和本地新增', async () => {
    const f = await open()
    f.http.failAfterWrite = true
    await f.click('确定')
    await vi.waitFor(() => expect(f.info.hasUnconfirmedSave).toBe(true))
    vi.spyOn(f.info, 'abandonUnconfirmedSave').mockReturnValueOnce(false)
    await f.click('放弃核验并返回')
    await respondToConfirmation('放弃核验')
    expect(document.body.textContent).toContain('原来源不支持放弃核验')
    expect(f.closed).not.toHaveBeenCalled()
    expect(f.info.hasUnconfirmedSave).toBe(true)
    expect(f.report.hasUnconfirmedSave).toBe(true)
    expect(f.info.dirtyTracking.isPendingCreate('I')).toBe(true)
    expect(f.report.dirtyTracking.isPendingCreate('V')).toBe(true)
    expect(f.http.saves).toHaveLength(2)
  })

  it('放弃过程中断且原核验状态已改变时保留草稿并禁止重发', async () => {
    const f = await open()
    f.http.failAfterWrite = true
    await f.click('确定')
    await vi.waitFor(() => expect(f.info.hasUnconfirmedSave).toBe(true))
    vi.spyOn(f.report, 'abandonUnconfirmedSave').mockReturnValueOnce(false)
    await f.click('放弃核验并返回')
    await respondToConfirmation('放弃核验')
    expect(document.body.textContent).toContain('原核验状态已改变')
    expect(document.body.textContent).toContain('报表ID I、版本ID V')
    expect(f.closed).not.toHaveBeenCalled()
    expect(f.info.dirtyTracking.isPendingCreate('I')).toBe(true)
    expect(f.report.dirtyTracking.isPendingCreate('V')).toBe(true)
    expect(f.button('取消').props('disabled')).toBe(true)
    expect(f.button('确定').props('disabled')).toBe(true)
    await f.click('确定')
    expect(f.http.saves).toHaveLength(2)
  })

  it('确认框异常时明确显示错误而不是当成取消', async () => {
    const f = await open()
    f.http.failAfterWrite = true
    await f.click('确定')
    await vi.waitFor(() => expect(f.info.hasUnconfirmedSave).toBe(true))
    vi.spyOn(ElMessageBox, 'confirm').mockRejectedValueOnce(new Error('确认框不可用'))
    await f.click('放弃核验并返回')
    expect(document.body.textContent).toContain('确认框不可用')
    expect(f.info.hasUnconfirmedSave).toBe(true)
    expect(f.closed).not.toHaveBeenCalled()
  })

  it('不接管其他入口的未知提交，也不丢弃本窗草稿', async () => {
    const f = await open()
    f.http.failAfterWrite = true
    await expect(f.dataSet.saveChanges({views: [{tableName: f.info.tableName, viewId: f.info.viewId, ids: ['I']}]})).rejects.toThrow()
    await flushPromises()
    expect(f.info.hasUnconfirmedSave).toBe(true)
    expect(f.button('确定').props('disabled')).toBe(true)
    expect(f.button('取消').props('disabled')).toBe(true)
    expect(document.body.textContent).toContain('其他操作的待核验提交')
    f.wrapper.getComponent(RendererDialog).vm.$emit('update:modelValue', false)
    await flushPromises()
    expect(f.closed).not.toHaveBeenCalled()
    expect(f.report.dirtyTracking.isPendingCreate('V')).toBe(true)
    expect(f.http.saves).toHaveLength(1)
  })

  it('新增已确认但权限回读失败时只重读权限，不重做新增', async () => {
    const f = await open()
    let blocked = true
    f.http.beforeDefinitionRead = async () => {if (blocked) throw new Error('权限回读中断')}
    await f.click('确定')
    await vi.waitFor(() => expect(f.info.hasPendingSavedRowPermissions).toBe(true))
    expect(f.http.saves).toHaveLength(2)
    expect(f.closed).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('尚需回读')
    blocked = false
    await f.click('回读已保存权限')
    await vi.waitFor(() => expect(f.closed).toHaveBeenCalledOnce())
    expect(f.info.hasPendingSavedRowPermissions).toBe(false)
    expect(f.report.hasPendingSavedRowPermissions).toBe(false)
    expect(f.http.saves).toHaveLength(2)
  })

  it('没有双视图新增回执时不将剩余草稿报告为成功', async () => {
    const f = await open()
    vi.spyOn(f.dataSet, 'saveChanges').mockResolvedValueOnce({success: true, data: {
      viewCount: 0, appliedEditingRows: 0, failedEditingRows: 0, createdCount: 0, savedCount: 0, deletedCount: 0,
      failedCount: 0, failedViews: [], viewResults: [],
    }})
    await f.click('确定')
    expect(f.closed).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('待保存或缺少确认回执')
    expect(f.info.dirtyTracking.isPendingCreate('I')).toBe(true)
    expect(f.report.dirtyTracking.isPendingCreate('V')).toBe(true)
  })

  it.each([true, false])('已确认一条时保留回执，用户显式继续提交另一条（汇总成功=%s）', async success => {
    const f = await open()
    const save = f.dataSet.saveChanges.bind(f.dataSet)
    vi.spyOn(f.dataSet, 'saveChanges').mockImplementationOnce(async () => {
      const partial = await save({views: [{tableName: f.info.tableName, viewId: f.info.viewId, ids: ['I']}]})
      return {...partial, success, message: '另一条尚未提交'}
    })
    await f.click('确定')
    expect(f.closed).not.toHaveBeenCalled()
    expect(f.http.saves.map(item => item.table)).toEqual(['Base_ReportInfo'])
    expect(f.button('取消').props('disabled')).toBe(true)
    expect(f.report.dirtyTracking.isPendingCreate('V')).toBe(true)
    await f.click('保存剩余记录')
    await vi.waitFor(() => expect(f.closed).toHaveBeenCalledOnce())
    expect(f.http.saves.map(item => item.table)).toEqual(['Base_ReportInfo', 'Base_Report'])
  })

  it('宿主记录身份变化后不操作旧草稿，也不提交新目标', async () => {
    const f = await open()
    f.boundInfoId.value = 'OTHER'
    await flushPromises()
    expect(document.body.textContent).toContain('原报表编辑身份已变化')
    expect(f.button('确定').props('disabled')).toBe(true)
    f.wrapper.getComponent(RendererDialog).vm.$emit('update:modelValue', false)
    await flushPromises()
    expect(f.closed).not.toHaveBeenCalled()
    expect(f.info.dirtyTracking.isPendingCreate('I')).toBe(true)
    expect(f.report.dirtyTracking.isPendingCreate('V')).toBe(true)
    expect(f.http.saves).toHaveLength(0)
  })

  it('应用名称回填失败时展示错误并保留两个草稿', async () => {
    const f = await open()
    f.info.updateEditingValue('I', 'modname', '旧名称')
    vi.spyOn(f.info, 'updateEditingValue').mockImplementation(() => {throw new Error('应用名称不可修改')})
    await f.click('确定')
    expect(document.body.textContent).toContain('应用名称不可修改')
    expect(f.closed).not.toHaveBeenCalled()
    expect(f.info.dirtyTracking.isPendingCreate('I')).toBe(true)
    expect(f.report.dirtyTracking.isPendingCreate('V')).toBe(true)
    expect(f.http.saves).toHaveLength(0)
  })
})
