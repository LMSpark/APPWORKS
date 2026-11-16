import {expect, it, vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {config, flushPromises, mount} from '@vue/test-utils'
import {defineComponent, h, ref} from 'vue'
import ElementPlus from 'element-plus'
import {DataSet, bindDataSetCommandSubmit, bindDataSetReadonlyCommandQuery, ensureDataSetResourceView} from '@spark-appworks/spark-data'
import {PageRuntime, ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {PAGE_RUNTIME, PAGE_SERVICE, RendererTable, Spark, registerAllRenderers, useSparkComponent} from '@spark-appworks/spark-component'
import {createTestPageService} from '../../../../../../support/helpers/page-service-host'
import {HttpClientBase, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {createApprovalCommandBindings} from '@/lowcode/resources/system/workflow/manage/flow-run-page/command/runtime-bindings'
import FlowAppendUser from '@/views/features/workflow/flow-append-user/ui/flow-append-user.vue'

vi.mock('@/lowcode/lowcode-runtime', () => ({lowcodeApi: {}, lowcodeHttp: {}}))

class FlowAppendRevokeHttp extends HttpClientBase {
  readonly calls: RequestConfig[] = []
  unknown = false
  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.calls.push(config)
    if (this.unknown) throw Error('lost receipt')
    return {data: {Code: 200, Result: true}, status: 200, statusText: 'OK', headers: {}}
  }
}

it.each(['list', 'revoke', 'unknown', 'expired-refresh', 'expired-save'])('keeps the original list and command through %s', async outcome => {
  const scene = 'A5BADCEE11D2438CB9E75C2453A220A6'

  const declaration = JSON.parse(readFileSync('config/pages/workflow/flow-workbench/pagedata.json', 'utf8')).tables.WFOBJ_FLOW_RELATIONLINE_STEP
  const ds = DataSet.fromJson({scenarioId: scene, tables: {WFOBJ_FLOW_RELATIONLINE_STEP: {resourceType: 'logical-view', resourceId: 'steps', columns: [...['rowid', 'WFOBJID', 'SendNodeModelId', 'ReceiveNodeModelId', 'LastStepID', 'StepState', 'STATUS', 'ReceiveUserId', 'ReceiveUserName'].map(name => ({name, type: 'string', ...(name === 'rowid' ? {isPrimaryKey: true} : {})})), ...declaration.columns], views: {default: {autoLoad: false, queryConfig: {pagination: 'none'}}, appendParticipants: declaration.views.appendParticipants}}}})
  const source = ds.getView('WFOBJ_FLOW_RELATIONLINE_STEP')!, list = ds.getView('WFOBJ_FLOW_RELATIONLINE_STEP', 'appendParticipants')!
  const context = ref({rowid: 'T', WFOBJID: 'WF', SendNodeModelId: 'N1', ReceiveNodeModelId: 'N2', LastStepID: 'L', TITLE: '节点'})
  const rows = [{...context.value, ReceiveUserId: 'U1', ReceiveUserName: '张三', StepState: '0', STATUS: '0'}, {...context.value, rowid: 'A', ReceiveUserId: 'U2', ReceiveUserName: '李四', StepState: '1', STATUS: '1'}, {...context.value, rowid: 'OTHER', LastStepID: 'L2', ReceiveUserName: '其他关系', StepState: '0', STATUS: '0'}]
  const readList = vi.fn(async () => rows)
  bindDataSetReadonlyCommandQuery(source, {resource: {resourceType: 'logical-view', resourceId: 'steps'}, guard: () => {}, loadRows: async () => rows})
  bindDataSetReadonlyCommandQuery(list, {resource: {resourceType: 'logical-view', resourceId: 'steps'}, guard: () => {}, loadRows: readList})
  await source.refresh()
  const command = ensureDataSetResourceView({dataSet: ds, tableName: 'ApprovalCommand', resource: {resourceType: 'command', resourceId: 'workflow:approval'}, columns: [{name: 'rowid', primary: true}, ...['action', 'flowObjectId', 'stepId', 'targetStepViewKey'].map(name => ({name})), {name: 'nextNode', type: 'array'}]})
  const objects = ensureDataSetResourceView({dataSet: ds, tableName: 'WFOBJ_FLOW', resource: {resourceType: 'service-query', resourceId: 'objects'}, columns: [{name: 'rowid', primary: true}, {name: 'WFMID'}]})
  bindDataSetReadonlyCommandQuery(objects, {resource: {resourceType: 'service-query', resourceId: 'objects'}, guard: () => {}, loadRows: async () => [{rowid: 'WF', WFMID: 'M'}]})
  await objects.refresh()
  const http = new FlowAppendRevokeHttp()
  const factory = createApprovalCommandBindings({config: new ScenarioViewConfig(scene, readFileSync('config/pages/workflow/flow-workbench/pagedata.json', 'utf8')), http, readScope: () => ({token: 'fixture', headers: {'X-AppId': 'APP'}}), assertCurrent: () => {}}).commandBindings?.['ApprovalCommand']
  if (!factory) throw Error('missing original command owner')
  bindDataSetCommandSubmit(command, factory(command))
  const save = vi.spyOn(ds, 'saveChanges')
  const runtime = new PageRuntime({pageId: 'append-list', scenarioIds: [scene], loadScenario: async () => ds})
  await runtime.load(); registerAllRenderers()
  const Host = defineComponent({setup() {
    const {sparkProvide} = useSparkComponent({type: 'append-test'})
    sparkProvide(PAGE_RUNTIME, runtime); sparkProvide(PAGE_SERVICE, createTestPageService())
    return () => h(FlowAppendUser, {context: context.value, stepViewKey: `${scene}@WFOBJ_FLOW_RELATIONLINE_STEP@default`})
  }})
  const originalStubs = {...config.global.stubs}, stubs = {...originalStubs}
  for (const key of ['SparkComponentRenderer', 'spark-component-renderer', 'el-table', 'el-table-column', 'el-button']) delete stubs[key]
  config.global.stubs = stubs
  const wrapper = mount(Host, {attachTo: document.body, global: {plugins: [ElementPlus, Spark.createPlugin()], stubs}})
  try {
    await flushPromises()
    expect(wrapper.findComponent(RendererTable).props('dataViewKey')).toBe(`${scene}@WFOBJ_FLOW_RELATIONLINE_STEP@appendParticipants`)
    expect(wrapper.text()).toContain('张三'); expect(wrapper.text()).toContain('李四'); expect(wrapper.text()).not.toContain('其他关系')
    const buttons = wrapper.findAll('button').filter(button => button.text() === '撤回')
    expect(buttons).toHaveLength(2)
    expect(buttons[0]!.attributes('disabled')).toBeUndefined(); expect(buttons[1]!.attributes('disabled')).toBeDefined()
    if (outcome !== 'list') {
      if (outcome === 'unknown') http.unknown = true
      if (outcome === 'expired-refresh') vi.spyOn(command, 'refresh').mockImplementationOnce(async () => {await command.loadFromServer(); await list.refresh()})
      if (outcome === 'expired-save') save.mockImplementationOnce(async options => {await list.refresh(); return DataSet.prototype.saveChanges.call(ds, options)})
      await buttons[0]!.trigger('click'); await flushPromises()
      if (outcome.startsWith('expired')) {
        expect(http.calls).toHaveLength(0)
        expect(command.hasUnconfirmedSave).toBe(false)
        expect(command.dirtyTracking.hasPendingChanges()).toBe(false)
        return
      }
      expect(save).toHaveBeenCalled()
      expect(http.calls).toHaveLength(1)
      expect(http.calls[0]?.url).toBe('/api/Flow/FlowRevoke')
      expect(http.calls[0]?.params).toEqual({curStepID: 'T', wfid: 'WF'})
      if (outcome === 'unknown') {
        expect(command.hasUnconfirmedSave).toBe(true)
        const ids = [...command.dirtyTracking.pendingCreateIds]
        expect(wrapper.text()).toContain('未知')
        await wrapper.findAll('button').find(button => button.text() === '核验原命令结果')!.trigger('click'); await flushPromises()
        expect(command.hasUnconfirmedSave).toBe(true)
        expect([...command.dirtyTracking.pendingCreateIds]).toEqual(ids)
        expect(http.calls).toHaveLength(1); expect(readList).toHaveBeenCalledTimes(1)
        expect(wrapper.findAll('button').find(button => button.text() === '添加办理人')!.attributes('disabled')).toBeDefined()
      } else {expect(command.hasUnconfirmedSave).toBe(false); expect(readList).toHaveBeenCalledTimes(2)}
      return
    }
    context.value = {...context.value, LastStepID: 'L2'}; await flushPromises()
    expect(wrapper.text()).toContain('上下文与原步骤不符')
    expect(wrapper.findComponent(RendererTable).exists()).toBe(false)
    expect(readList).toHaveBeenCalledTimes(1)
    expect(source.rows).toHaveLength(3)
  } finally {wrapper.unmount(); runtime.dispose(); config.global.stubs = originalStubs}
})
