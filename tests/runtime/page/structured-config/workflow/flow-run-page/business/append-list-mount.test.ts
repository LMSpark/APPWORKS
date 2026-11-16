import {expect, it, vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {config, flushPromises, mount} from '@vue/test-utils'
import {defineComponent, h, ref} from 'vue'
import ElementPlus from 'element-plus'
import {DataSet, bindDataSetReadonlyCommandQuery} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {PAGE_RUNTIME, PAGE_SERVICE, RendererTable, Spark, registerAllRenderers, useSparkComponent} from '@spark-appworks/spark-component'
import {createTestPageService} from '../../../../../../support/helpers/page-service-host'
import FlowAppendUser from '@/views/features/workflow/flow-append-user/ui/flow-append-user.vue'

vi.mock('@/lowcode/lowcode-runtime', () => ({lowcodeApi: {}, lowcodeHttp: {}}))

it('binds the original named list through standard children and rejects a changed relation with the same step ID', async () => {
  const declaration = JSON.parse(readFileSync('config/pages/workflow/flow-workbench/pagedata.json', 'utf8')).tables.WFOBJ_FLOW_RELATIONLINE_STEP
  const ds = DataSet.fromJson({scenarioId: 'S', tables: {WFOBJ_FLOW_RELATIONLINE_STEP: {resourceType: 'logical-view', resourceId: 'steps', columns: [...['rowid', 'WFOBJID', 'SendNodeModelId', 'ReceiveNodeModelId', 'LastStepID', 'StepState', 'STATUS', 'ReceiveUserId', 'ReceiveUserName'].map(name => ({name, type: 'string', ...(name === 'rowid' ? {isPrimaryKey: true} : {})})), ...declaration.columns], views: {default: {autoLoad: false, queryConfig: {pagination: 'none'}}, appendParticipants: declaration.views.appendParticipants}}}})
  const source = ds.getView('WFOBJ_FLOW_RELATIONLINE_STEP')!, list = ds.getView('WFOBJ_FLOW_RELATIONLINE_STEP', 'appendParticipants')!
  const context = ref({rowid: 'T', WFOBJID: 'WF', SendNodeModelId: 'N1', ReceiveNodeModelId: 'N2', LastStepID: 'L', TITLE: '节点'})
  const rows = [{...context.value, ReceiveUserId: 'U1', ReceiveUserName: '张三', StepState: '0', STATUS: '0'}, {...context.value, rowid: 'A', ReceiveUserId: 'U2', ReceiveUserName: '李四', StepState: '1', STATUS: '1'}, {...context.value, rowid: 'OTHER', LastStepID: 'L2', ReceiveUserName: '其他关系', StepState: '0', STATUS: '0'}]
  const readList = vi.fn(async () => rows)
  bindDataSetReadonlyCommandQuery(source, {resource: {resourceType: 'logical-view', resourceId: 'steps'}, guard: () => {}, loadRows: async () => rows})
  bindDataSetReadonlyCommandQuery(list, {resource: {resourceType: 'logical-view', resourceId: 'steps'}, guard: () => {}, loadRows: readList})
  await source.refresh()
  const runtime = new PageRuntime({pageId: 'append-list', scenarioIds: ['S'], loadScenario: async () => ds})
  await runtime.load(); registerAllRenderers()
  const Host = defineComponent({setup() {
    const {sparkProvide} = useSparkComponent({type: 'append-test'})
    sparkProvide(PAGE_RUNTIME, runtime); sparkProvide(PAGE_SERVICE, createTestPageService())
    return () => h(FlowAppendUser, {context: context.value, stepViewKey: 'S@WFOBJ_FLOW_RELATIONLINE_STEP@default'})
  }})
  const originalStubs = {...config.global.stubs}, stubs = {...originalStubs}
  for (const key of ['SparkComponentRenderer', 'spark-component-renderer', 'el-table', 'el-table-column', 'el-button']) delete stubs[key]
  config.global.stubs = stubs
  const wrapper = mount(Host, {attachTo: document.body, global: {plugins: [ElementPlus, Spark.createPlugin()], stubs}})
  try {
    await flushPromises()
    expect(wrapper.findComponent(RendererTable).props('dataViewKey')).toBe('S@WFOBJ_FLOW_RELATIONLINE_STEP@appendParticipants')
    expect(wrapper.text()).toContain('张三'); expect(wrapper.text()).toContain('李四'); expect(wrapper.text()).not.toContain('其他关系')
    const buttons = wrapper.findAll('button').filter(button => button.text() === '撤回')
    expect(buttons).toHaveLength(2)
    expect(buttons[0]!.attributes('disabled')).toBeUndefined(); expect(buttons[1]!.attributes('disabled')).toBeDefined()
    context.value = {...context.value, LastStepID: 'L2'}; await flushPromises()
    expect(wrapper.text()).toContain('上下文与原步骤不符')
    expect(wrapper.findComponent(RendererTable).exists()).toBe(false)
    expect(readList).toHaveBeenCalledTimes(1)
    expect(source.rows).toHaveLength(3)
  } finally {wrapper.unmount(); runtime.dispose(); config.global.stubs = originalStubs}
})
