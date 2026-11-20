import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {defineComponent, h} from 'vue'
import ElementPlus from 'element-plus'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {FieldText, FieldTextarea, PAGE_RUNTIME, RendererButton, Spark, registerAllRenderers, useSparkComponent} from '@spark-appworks/spark-component'
import FeatureRecordDialog from '@/views/features/shared/record/feature-record-dialog.vue'
import FeatureRecordFields from '@/views/features/shared/record/feature-record-fields.vue'
import {createReportRuntime} from './report.fixture'

const wrappers: VueWrapper[] = [], runtimes: PageRuntime[] = []
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
  const f = await createReportRuntime('REPORT')
  runtimes.push(f.runtime)
  f.http.records['Base_ReportInfo'] = [{rowid: 'I1', RptName: '原名称', RptDesc: '原说明'}]
  await f.info.refresh()
  const closed = vi.fn()
  const Host = defineComponent({setup() {
    const {sparkProvide} = useSparkComponent({type: 'feature-record-test'})
    sparkProvide(PAGE_RUNTIME, f.runtime)
    return () => h(FeatureRecordDialog, {dataViewKey: 'REPORT@Base_ReportInfo@default', recordId: 'I1', title: '编辑',
      specs: [{field: 'RptName', label: '名称', required: true},
        {field: 'RptDesc', label: '说明', kind: 'textarea', when: (row: Record<string, unknown>) => row['RptName'] === '新名称'}],
      onClose: closed})
  }})
  const wrapper = mount(Host, {attachTo: document.body, global: {plugins: [ElementPlus, Spark.createPlugin()]}})
  wrappers.push(wrapper)
  await flushPromises()
  const click = async (label: string) => {
    const button = wrapper.findAllComponents(RendererButton).find(item => item.props('label') === label)
    if (!button) throw new Error(`按钮不存在: ${label}`)
    await button.get('button').trigger('click')
    await flushPromises()
  }
  return {...f, wrapper, click, closed}
}

describe('共享记录字段表单', () => {
  it('标准字段写入原视图，条件字段随编辑显示并经原保存链提交', async () => {
    const f = await open()
    expect(f.wrapper.findAllComponents(FieldTextarea)).toHaveLength(0)
    await f.wrapper.getComponent(FieldText).get('input').setValue('新名称')
    await flushPromises()
    expect(f.info.getEditingRow('I1')?.['RptName']).toBe('新名称')
    const description = f.wrapper.getComponent(FieldTextarea)
    await description.get('textarea').setValue('新说明')
    await f.click('确定')
    await vi.waitFor(() => expect(f.closed).toHaveBeenCalledOnce())
    expect(f.http.records['Base_ReportInfo']).toMatchObject([{rowid: 'I1', RptName: '新名称', RptDesc: '新说明'}])
    expect(f.http.saves).toHaveLength(1)
  })

  it('取消只放弃本记录的编辑覆盖', async () => {
    const f = await open()
    await f.wrapper.getComponent(FieldText).get('input').setValue('新名称')
    await f.click('取消')
    expect(f.closed).toHaveBeenCalledOnce()
    expect(f.info.getEditingRow('I1')?.['RptName']).toBe('原名称')
    expect(f.http.saves).toHaveLength(0)
  })

  it('组合标题缺少视图或字段列表时明确报错', async () => {
    const f = await createReportRuntime('REPORT')
    runtimes.push(f.runtime)
    f.http.records['Base_ReportInfo'] = [{rowid: 'I1', RptName: '原名称'}]
    await f.info.refresh()
    const Host = defineComponent({setup() {
      const {sparkProvide} = useSparkComponent({type: 'feature-record-test'})
      sparkProvide(PAGE_RUNTIME, f.runtime)
      return () => h(FeatureRecordFields, {dataViewKey: 'REPORT@Base_ReportInfo@default', recordId: 'I1',
        row: f.info.getEditingRow('I1') ?? undefined,
        specs: [{field: 'RptName', label: '名称', kind: 'select', labelJoiner: ' / '}]})
    }})
    expect(() => mount(Host, {global: {plugins: [ElementPlus, Spark.createPlugin()]}}))
      .toThrow('字段组合标题需要选项视图和标题字段列表')
  })
})
