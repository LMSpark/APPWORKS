import {ensureFlowRunApprovalViews} from '@/platform-adapters/resources/system/workflow/manage/flow-run-page/input/approval-input-workspace'
import {expect, it, vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {config, flushPromises, mount} from '@vue/test-utils'
import {defineComponent, h, markRaw, ref, shallowRef, type PropType} from 'vue'
import ElementPlus from 'element-plus'
import {DataSet, bindDataSetCommandSubmit, bindDataSetReadonlyCommandQuery, ensureDataSetResourceView, type SparkNode} from '@spark-appworks/spark-data'
import {PageRuntime, PageTool, ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {PAGE_RUNTIME, PAGE_SERVICE, RendererTable, Spark, SparkPageRenderer, registerAllRenderers, useSparkComponent} from '@spark-appworks/spark-component'
import {createTestPageService} from '../../../../../../support/helpers/page-service-host'
import {HttpClientBase, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {createApprovalOptionsBindings} from '@/platform-adapters/resources/system/workflow/manage/flow-run-page/query/runtime-bindings'
import {createApprovalCommandBindings} from '@/platform-adapters/resources/system/workflow/manage/flow-run-page/command/runtime-bindings'
import FlowAppendUser from '@/views/features/workflow/flow-append-user/ui/flow-append-user.vue'

vi.mock('@/platform-adapters/lowcode-runtime', () => ({lowcodeApi: {}, lowcodeHttp: {}}))

class FlowAppendRevokeHttp extends HttpClientBase {
  readonly calls: RequestConfig[] = []
  unknown = false
  badDictionary = false
  dictionaryCalls: RequestConfig[] = []
  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    if (config.url === '/api/DataOperation/GetData') {
      this.dictionaryCalls.push(config)
      if (this.badDictionary) return {data: {Code: 500, Message: 'dictionary failed'}, status: 200, statusText: 'OK', headers: {}}
      const stepState = JSON.stringify(config.data).includes('流程步骤状态')
      return {data: {Code: 200, Result: {data: {Count: 2, Items: [{rowid: 'D0', val: 0, txt: stepState ? '待接收' : '待办理', ordIdx: 0}, {rowid: 'D1', val: 1, txt: stepState ? '处理中' : '已办理', ordIdx: 1}]}}}, status: 200, statusText: 'OK', headers: {}}
    }
    this.calls.push(config)
    if (config.method === 'GET') return {data: {Code: 200, Result: [{nodeId: 'N2', maxNum: 2, minNum: 1, allowChange: '0', userList: [{UserId: 'U1', UserName: '张三'}, {UserId: 'U3', UserName: '王五'}]}]}, status: 200, statusText: 'OK', headers: {}}
    if (this.unknown) throw Error('lost receipt')
    return {data: {Code: 200, Result: true}, status: 200, statusText: 'OK', headers: {}}
  }
}

it.each(['list', 'revoke', 'unknown', 'expired-refresh', 'expired-save', 'add-cancel', 'add-success', 'add-unknown', 'add-late', 'add-target', 'dictionary-error', 'dictionary-stale'])('keeps the original list and command through %s', async outcome => {
  const scene = 'A5BADCEE11D2438CB9E75C2453A220A6'

  const pageText = readFileSync('config/pages/workflow/flow-workbench/pagedata.json', 'utf8'), pageTables = JSON.parse(pageText).tables
  const declaration = JSON.parse(readFileSync('config/pages/workflow/flow-workbench/pagedata.json', 'utf8')).tables.WFOBJ_FLOW_RELATIONLINE_STEP
  const ds = DataSet.fromJson({scenarioId: scene, tables: {AppendStepStates: pageTables.AppendStepStates, AppendHandleStates: pageTables.AppendHandleStates, AppendOptions: pageTables.AppendOptions, AppendCandidates: pageTables.AppendCandidates, ApprovalCommand: pageTables.ApprovalCommand, WFOBJ_FLOW_RELATIONLINE_STEP: {resourceType: 'logical-view', resourceId: 'steps', columns: [...['rowid', 'WFOBJID', 'SendNodeModelId', 'ReceiveNodeModelId', 'LastStepID', 'StepState', 'STATUS', 'ReceiveUserId', 'ReceiveUserName'].map(name => ({name, type: 'string', ...(name === 'rowid' ? {isPrimaryKey: true} : {})})), ...declaration.columns], views: {default: {autoLoad: false, queryConfig: {pagination: 'none'}}, appendParticipants: declaration.views.appendParticipants}}}})
  const source = ds.getView('WFOBJ_FLOW_RELATIONLINE_STEP')!, list = ds.getView('WFOBJ_FLOW_RELATIONLINE_STEP', 'appendParticipants')!
  const context = ref({rowid: 'T', WFOBJID: 'WF', SendNodeModelId: 'N1', ReceiveNodeModelId: 'N2', LastStepID: 'L', TITLE: '节点'})
  const rows = [{...context.value, ReceiveUserId: 'U1', ReceiveUserName: '张三', StepState: '0', STATUS: '0'}, {...context.value, rowid: 'A', ReceiveUserId: 'U2', ReceiveUserName: '李四', StepState: '1', STATUS: '1'}, {...context.value, rowid: 'OTHER', LastStepID: 'L2', ReceiveUserName: '其他关系', StepState: '0', STATUS: '0'}]
  const readList = vi.fn(async () => rows)
  bindDataSetReadonlyCommandQuery(source, {resource: {resourceType: 'logical-view', resourceId: 'steps'}, guard: () => {}, loadRows: async () => rows})
  bindDataSetReadonlyCommandQuery(list, {resource: {resourceType: 'logical-view', resourceId: 'steps'}, guard: () => {}, loadRows: readList})
  await source.refresh()
  const command = ds.getView('ApprovalCommand')!
  const objects = ensureDataSetResourceView({dataSet: ds, tableName: 'WFOBJ_FLOW', resource: {resourceType: 'service-query', resourceId: 'objects'}, columns: [{name: 'rowid', primary: true}, {name: 'WFMID'}]})
  bindDataSetReadonlyCommandQuery(objects, {resource: {resourceType: 'service-query', resourceId: 'objects'}, guard: () => {}, loadRows: async () => [{rowid: 'WF', WFMID: 'M'}]})
  await objects.refresh()
  const http = new FlowAppendRevokeHttp(); http.badDictionary = outcome === 'dictionary-error'
  let appScope = 'fixture'
  const factory = createApprovalCommandBindings({config: new ScenarioViewConfig(scene, readFileSync('config/pages/workflow/flow-workbench/pagedata.json', 'utf8')), http, readScope: () => ({token: appScope, headers: {'X-AppId': 'APP'}}), assertCurrent: () => {}}).commandBindings?.['ApprovalCommand']
  if (!factory) throw Error('missing original command owner')
  bindDataSetCommandSubmit(command, factory(command))
  const optionView = ds.getView('AppendOptions')!, optionFactory = createApprovalOptionsBindings({config: new ScenarioViewConfig(scene, pageText), http, readScope: () => ({token: appScope, headers: {'X-AppId': 'APP'}}), assertCurrent: () => {}}).projectionBindings?.['AppendOptions']
  if (!optionFactory) throw Error('missing append options owner')
  bindDataSetReadonlyCommandQuery(optionView, optionFactory(optionView))
  const dictionaryFactories = createApprovalOptionsBindings({config: new ScenarioViewConfig(scene, pageText), http, readScope: () => ({token: appScope, headers: {'X-AppId': 'APP'}}), assertCurrent: () => {}}).projectionBindings
  for (const name of ['AppendStepStates', 'AppendHandleStates']) {
    const view = ds.getView(name)!, binding = dictionaryFactories?.[name]
    if (!binding) throw Error('missing original dictionary binding')
    bindDataSetReadonlyCommandQuery(view, binding(view))
  }
  const select = vi.fn(async () => [{label: '王五', value: 'U3:王五'}])
  const save = vi.spyOn(ds, 'saveChanges')
  const tool = new PageTool({pageId: 'append-list'})
  for (const filename of ['rule.json', 'script.js', 'style.css'] as const) {
    tool.hydrateFileText(filename, readFileSync(`src/views/features/workflow/flow-runtime/run-page/ui/tool/${filename}`, 'utf8'))
  }
  tool.markLoaded()
  // The shared tool also binds the history view by its formal workbench identity.
  const runtime = markRaw(new PageRuntime({tool, scenarioIds: [scene], loadScenario: async () => ds}))
  await runtime.load()
  ensureFlowRunApprovalViews(ds)
  registerAllRenderers()
  const append = shallowRef<InstanceType<typeof FlowAppendUser> | null>(null)
  const AppendHost = defineComponent({
    props: {toolRules: {type: Array as PropType<SparkNode[]>, required: true}},
    setup(props) {
      const {sparkProvide} = useSparkComponent({type: 'append-test-input'})
      sparkProvide(PAGE_SERVICE, {...createTestPageService(), selectEntities: select})
      return () => h(FlowAppendUser, {ref: append, toolRules: props.toolRules, context: context.value,
        stepViewKey: `${scene}@WFOBJ_FLOW_RELATIONLINE_STEP@default`})
    },
  })
  const host = {runtime, assertCurrent() {}, invoke(name: string, input: unknown) {
    if (name.startsWith('append.')) return append.value?.invoke(name.slice('append.'.length), input)
  }}
  const Host = defineComponent({setup() {
    const {sparkProvide} = useSparkComponent({type: 'append-test'})
    sparkProvide(PAGE_RUNTIME, runtime)
    return () => h(SparkPageRenderer, {pageRuntime: runtime, host, autoLoad: false,
      routeSnapshot: {path: '/test', fullPath: '/test', name: null, params: {}, query: {}, hash: ''}},
    {content: ({children}: {children: SparkNode[]}) => h(AppendHost, {toolRules: children})})
  }})
  const originalStubs = {...config.global.stubs}, stubs = {...originalStubs}
  for (const key of ['SparkComponentRenderer', 'spark-component-renderer', 'el-table', 'el-table-column', 'el-button']) delete stubs[key]
  config.global.stubs = stubs
  const wrapper = mount(Host, {attachTo: document.body, global: {plugins: [ElementPlus, Spark.createPlugin()], stubs}})
  try {
    await flushPromises()
    if (outcome === 'dictionary-error') {expect(wrapper.text()).toContain('dictionary failed'); expect(wrapper.findComponent(RendererTable).exists()).toBe(false); expect(http.calls).toHaveLength(0); return}
    expect(http.dictionaryCalls).toHaveLength(2)
    expect(wrapper.findComponent(RendererTable).props('dataViewKey')).toBe(`${scene}@WFOBJ_FLOW_RELATIONLINE_STEP@appendParticipants`)
    expect(wrapper.text()).toContain('张三'); expect(wrapper.text()).toContain('李四'); expect(wrapper.text()).not.toContain('其他关系')
    if (outcome === 'list') {expect(ds.getView('AppendStepStates')?.rows[0]).toMatchObject({val: 0, value: '0'}); const state = ds.getView('AppendStepStates')!; expect(state.fieldAccess(state.rows[0]!, 'value').read).toBe('visible'); expect(state.fieldAccess(state.rows[0]!, 'txt').read).toBe('visible'); state.captureReadResult()(); expect(wrapper.text()).toContain('待办理'); expect(wrapper.text()).toContain('处理中')}
    if (outcome === 'dictionary-stale') {
      appScope = 'other'
      for (const name of ['AppendStepStates', 'AppendHandleStates']) ds.getView(name)!.queryConfig = {pagination: 'none', fields: ['rowid', 'val', 'txt', 'value', 'label']}
      await flushPromises()
      expect(wrapper.text()).not.toContain('待办理'); expect(wrapper.text()).not.toContain('处理中')
      expect(http.calls).toHaveLength(0)
      return
    }
    const buttons = wrapper.findAll('button').filter(button => button.text() === '撤回')
    expect(list.rows.map(row => row['appendRevokeDisabled'])).toEqual([false, true])
    expect(buttons).toHaveLength(2)
    expect(buttons[0]!.attributes('disabled')).toBeUndefined(); expect(buttons[1]!.attributes('disabled')).toBeDefined()
    if (outcome.startsWith('add-')) {
      await wrapper.findAll('button').find(button => button.text() === '添加办理人')!.trigger('click'); await flushPromises()
      const input = ds.getView('AppendInput')!
      expect(input.rows[0]?.['receiveUsers']).toEqual(['U3:王五'])
      const click = async (label: string) => {const button = Array.from(document.body.querySelectorAll('button')).find(button => button.textContent?.trim() === label); expect(button).toBeDefined(); button!.click(); await flushPromises()}
      if (outcome === 'add-target') {
        context.value = {...context.value, LastStepID: 'L2', TITLE: '新节点'}; await flushPromises()
        await click('确认')
        expect(command.hasUnconfirmedSave).toBe(false); expect(input.rows).toHaveLength(1)
        await click('取消')
        expect(input.rows).toEqual([]); expect(wrapper.text()).toContain('新节点'); expect(wrapper.text()).toContain('上下文与原步骤不符')
        expect(wrapper.findComponent(RendererTable).exists()).toBe(false)
      } else if (outcome === 'add-late') {
        let release: (() => void) | undefined
        select.mockImplementationOnce(() => new Promise(resolve => {release = () => resolve([{label: '王五', value: 'U3:王五'}])}))
        const picker = document.body.querySelector<HTMLButtonElement>('.primary-action-button'); expect(picker).not.toBeNull(); picker!.click(); await flushPromises()
        await click('取消'); release?.(); await flushPromises()
        expect(input.rows).toEqual([])
      } else if (outcome === 'add-cancel') {await click('取消'); expect(input.rows).toEqual([])}
      else {
        if (outcome === 'add-unknown') http.unknown = true
        await click('确认')
        if (outcome === 'add-unknown') {
          const ids = [...command.dirtyTracking.pendingCreateIds]
          expect(command.hasUnconfirmedSave).toBe(true); expect(input.rows[0]?.['receiveUsers']).toEqual(['U3:王五'])
          await click('核验原命令结果')
          expect(command.hasUnconfirmedSave).toBe(true); expect([...command.dirtyTracking.pendingCreateIds]).toEqual(ids)
          const cancel = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent?.trim() === '取消')
          expect(cancel?.disabled).toBe(true)
        } else {expect(command.hasUnconfirmedSave).toBe(false); expect(input.rows).toEqual([]); expect(readList).toHaveBeenCalledTimes(2)}
      }
      const posts = http.calls.filter(call => call.method === 'POST')
      expect(posts).toHaveLength(['add-cancel', 'add-late', 'add-target'].includes(outcome) ? 0 : 1)
      if (posts.length) expect(posts[0]?.data).toEqual(['U3:王五'])
      return
    }
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
