import {afterEach, expect, it, vi} from 'vitest'
import {config, DOMWrapper, flushPromises, mount} from '@vue/test-utils'
import {defineComponent, h} from 'vue'
import ElementPlus from 'element-plus'
import {DataSet, ensureDataSetResourceView, ensureDataSetStaticInputTable, bindDataSetReadonlyCommandQuery, bindDataSetCommandSubmit} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {AppPageUiHost, appPageUiService, appPageUiState, cancelAppSelector, closeAppSelector, confirmAppSelector} from '@spark-appworks/spark-app'
import {PAGE_RUNTIME, PAGE_SERVICE, RendererForm, Spark, registerAllRenderers, useSparkComponent, type PageSelectorOption} from '@spark-appworks/spark-component'
import {createTestPageService} from '../../../../../../support/helpers/page-service-host'
import {createFlowRunCandidatesBinding} from '@/platform-adapters/resources/system/workflow/manage/flow-run-page/query/candidates-binding'
import {FlowRunCommandResource} from '@/platform-adapters/resources/system/workflow/manage/flow-run-page/command/flow-run-command-resource'
import {submitApprovalCommand} from '@/platform-adapters/resources/system/workflow/manage/flow-run-page/command/submit'
const originalStubs = {...config.global.stubs}
afterEach(() => {config.global.stubs = originalStubs})

async function fixture(freeChoice = false, nodeId = 'N1', useAppSelector = false) {
  const ds = DataSet.fromJson({scenarioId: 'S', tables: {}})
  const source = ensureDataSetResourceView({dataSet: ds, tableName: 'ApprovalOptions', resource: {resourceType: 'logical-view', resourceId: 'workflow:approval-options'}, columns: [{name: 'id', primary: true}, {name: 'payload', type: 'object'}]})
  bindDataSetReadonlyCommandQuery(source, {resource: {resourceType: 'logical-view', resourceId: 'workflow:approval-options'}, guard: () => {}, loadRows: async () => [{id: 'current', payload: {execUser: [{nodeId: 'N1', maxNum: 1, allowChange: freeChoice, userList: [{UserId: 'U1', UserName: '张三'}]}, {nodeId: 'N2', userList: []}]}}]})
  const directory = ensureDataSetResourceView({dataSet: ds, tableName: 'Base_UserInfo', resource: {resourceType: 'logical-view', resourceId: 'directory'}, columns: [{name: 'rowid', primary: true}, {name: 'UserName'}]})
  directory.queryConfig = {allPages: true, fields: ['rowid', 'UserName']}
  bindDataSetReadonlyCommandQuery(directory, {resource: {resourceType: 'logical-view', resourceId: 'directory'}, guard: () => {}, loadRows: async () => [{rowid: 'U1', UserName: '张三'}, {rowid: 'U2', UserName: '李四'}]})
  if (freeChoice) await directory.refresh()
  const candidates = ensureDataSetResourceView({dataSet: ds, tableName: 'ApprovalCandidates', resource: {resourceType: 'logical-view', resourceId: 'workflow:approval-candidates'}, columns: [{name: 'id', primary: true}, {name: 'name'}, {name: 'value'}, {name: 'nodeId'}]})
  bindDataSetReadonlyCommandQuery(candidates, createFlowRunCandidatesBinding({view: candidates, source, guard: () => {}, userDirectory: () => directory}))
  await source.refresh(); candidates.queryContext = {nodeId}; await candidates.refresh()
  const command = ensureDataSetResourceView({dataSet: ds, tableName: 'ApprovalCommand', resource: {resourceType: 'command', resourceId: 'workflow:approval'}, columns: [{name: 'rowid', primary: true}, {name: 'action'}, {name: 'flowObjectId'}, {name: 'stepId'}, {name: 'nextNode', type: 'array'}]})
  const dispatch = vi.fn(async () => {})
  bindDataSetCommandSubmit(command, new FlowRunCommandResource({view: command, guard: () => {}, dispatch, captureTarget: () => () => {}}).binding())
  ensureDataSetStaticInputTable(ds, 'ApprovalInput', [{name: 'inputId', primary: true}, {name: 'nextNode', type: 'array'}])
  const input = ds.getView('ApprovalInput')!
  input.commitMode = 'staged'
  await input.addRow({inputId: 'current', nextNode: [{NodeId: nodeId, ExecUserList: []}]})
  const id = 'current'
  input.setCurrentRowById(id)
  const runtime = new PageRuntime({pageId: 'candidate-picker', scenarioIds: ['S'], loadScenario: async () => ds})
  await runtime.load(); registerAllRenderers()
  const select = vi.fn<(options: {options?: PageSelectorOption[]}) => Promise<PageSelectorOption[]>>(async options => options.options ?? [])
  const service = {...createTestPageService(), selectEntities: useAppSelector ? appPageUiService.selectEntities : select}
  const Host = defineComponent({setup() {
    const {sparkProvide} = useSparkComponent({type: 'candidate-test'})
    sparkProvide(PAGE_RUNTIME, runtime); sparkProvide(PAGE_SERVICE, service)
    return () => h(RendererForm, {dataViewKey: 'S@ApprovalInput@default', autoColumns: false, showDataViewMeta: false, children: [{type: 'r-json', props: {field: 'nextNode', valueFormat: 'native', mode: 'rows', rowEditMode: 'inline', rowOperations: ['edit']}, children: [{type: 'r-user-picker', props: {field: 'ExecUserList', label: '办理人', multiple: true, valueMode: 'array', optionDataViewKey: 'S@ApprovalCandidates@default', optionLabelField: 'name', optionValueField: 'value'}}]}]})
  }})
  const stubs = {...config.global.stubs}
  for (const key of ['SparkComponentRenderer', 'spark-component-renderer', 'el-table', 'el-table-column', 'el-button']) delete stubs[key]
  config.global.stubs = stubs
  const wrapper = mount(Host, {attachTo: document.body, global: {plugins: [ElementPlus, Spark.createPlugin()], stubs}})
  await flushPromises()
  return {wrapper, runtime, input, ds, candidates, source, directory, select, dispatch, id}
}

it.each(['scope-disposal', 'candidate-refresh', 'replacement-disposal'])('retires only the original selector on %s', async action => {
  const f = await fixture(false, 'N1', true)
  let mounted = true
  const unmount = () => { f.wrapper.unmount(); mounted = false }
  try {
    await f.wrapper.get('.primary-action-button').trigger('click')
    await flushPromises()
    expect(appPageUiState.selector.options.map(item => item.value)).toEqual(['U1:张三'])
    if (action === 'replacement-disposal') {
      const originalRequestId = appPageUiState.selector.requestId
      void appPageUiService.selectEntities({title: '另一选择框', options: [{label: '王五', value: 'U3'}]})
      unmount()
      closeAppSelector(originalRequestId)
      expect(appPageUiState.selector.visible).toBe(true)
      expect(appPageUiState.selector.options.map(item => item.value)).toEqual(['U3'])
    } else {
      if (action === 'scope-disposal') unmount()
      else { f.candidates.queryContext = {nodeId: 'N2'}; await f.candidates.refresh() }
      await flushPromises()
      expect(appPageUiState.selector.visible).toBe(false)
      expect(appPageUiState.selector.options).toEqual([])
    }
    expect(f.dispatch).not.toHaveBeenCalled()
  } finally {
    if (mounted) unmount()
    closeAppSelector()
    f.runtime.dispose()
  }
})

it.each(['cancel', 'close', 'replacement', 'confirm-empty'])('settles %s on the original approval field through the application selector', async action => {
  const f = await fixture(false, 'N1', true)
  const open = async () => {
    await f.wrapper.get('.primary-action-button').trigger('click')
    await flushPromises()
  }
  try {
    await open()
    appPageUiState.selector.selectedValues = ['U1:张三']
    confirmAppSelector()
    await flushPromises()
    expect(f.input.getEditingRow(f.id)?.['nextNode']).toEqual([{NodeId: 'N1', ExecUserList: ['U1:张三']}])

    await open()
    if (action === 'cancel') cancelAppSelector()
    else if (action === 'close') closeAppSelector()
    else if (action === 'replacement') void appPageUiService.selectEntities({title: '其他选择'})
    else {
      appPageUiState.selector.selectedValues = []
      confirmAppSelector()
    }
    await flushPromises()
    expect(f.input.getEditingRow(f.id)?.['nextNode']).toEqual([
      {NodeId: 'N1', ExecUserList: action === 'confirm-empty' ? [] : ['U1:张三']},
    ])
    expect(f.dispatch).not.toHaveBeenCalled()
  } finally {
    f.wrapper.unmount()
    closeAppSelector()
    f.runtime.dispose()
  }
})

it('writes selected encoded people through standard JSON children to the original parameter view and cancels without dispatch', async () => {
  const f = await fixture()
  try {
    await f.wrapper.get('.primary-action-button').trigger('click'); await flushPromises()
    expect(f.select.mock.calls[0]?.[0].options).toEqual([{label: '张三', value: 'U1:张三'}])
    expect(f.input.getEditingRow(f.id)?.['nextNode']).toEqual([{NodeId: 'N1', ExecUserList: ['U1:张三']}])
    f.input.discardEditingRows([f.id]); await flushPromises()
    expect(f.input.getEditingRow(f.id)?.['nextNode'] ?? f.input.rows[0]?.['nextNode']).toEqual([{NodeId: 'N1', ExecUserList: []}])
    expect(f.dispatch).not.toHaveBeenCalled()
  } finally {f.wrapper.unmount(); f.runtime.dispose()}
})

it.each(['candidate-query', 'options-source'])('does not adopt a late selector response after %s changes', async target => {
  const f = await fixture()
  try {
    let release: (() => void) | undefined
    f.select.mockImplementationOnce(() => new Promise(resolve => {release = () => resolve([{label: '张三', value: 'U1:张三'}])}))
    await f.wrapper.get('.primary-action-button').trigger('click'); await flushPromises()
    if (target === 'candidate-query') {f.candidates.queryContext = {nodeId: 'N2'}; await f.candidates.refresh()}
    else f.source.queryContext = {stepId: 'other-step'}
    await flushPromises()
    release?.(); await flushPromises()
    expect(f.input.getEditingRow(f.id)?.['nextNode'] ?? f.input.rows[0]?.['nextNode']).toEqual([{NodeId: 'N1', ExecUserList: []}])
    expect(f.dispatch).not.toHaveBeenCalled()
  } finally {f.wrapper.unmount(); f.runtime.dispose()}
})

it('captures the final parameter value only at confirmation and submits it through the immutable command', async () => {
  const f = await fixture()
  try {
    await f.wrapper.get('.primary-action-button').trigger('click'); await flushPromises()
    await submitApprovalCommand(f.ds, {action: 'submit', flowObjectId: 'WF1', stepId: 'S1', nextNode: f.input.getEditingRow(f.id)?.['nextNode']})
    expect(f.dispatch).toHaveBeenCalledTimes(1)
    expect(f.dispatch).toHaveBeenCalledWith(expect.objectContaining({nextNode: [{NodeId: 'N1', ExecUserList: ['U1:张三']}]}))
  } finally {f.wrapper.unmount(); f.runtime.dispose()}
})

it('does not open the selector with cached people after the original options source expires', async () => {
  const f = await fixture()
  try {
    f.source.queryContext = {stepId: 'other-step'}
    await f.wrapper.get('.primary-action-button').trigger('click'); await flushPromises()
    expect(f.select).not.toHaveBeenCalled()
    expect(f.dispatch).not.toHaveBeenCalled()
  } finally {f.wrapper.unmount(); f.runtime.dispose()}
})

it('keeps an empty node candidate list scoped even when the tenant directory contains people', async () => {
  const f = await fixture(true, 'N2')
  try {
    expect(f.directory.rows).toHaveLength(2)
    expect(f.candidates.rows).toHaveLength(0)
    await f.wrapper.get('.primary-action-button').trigger('click'); await flushPromises()
    expect(f.select.mock.calls[0]?.[0].options).toEqual([])
    expect(f.input.getEditingRow(f.id)?.['nextNode']).toEqual([{NodeId: 'N2', ExecUserList: []}])
    expect(f.dispatch).not.toHaveBeenCalled()
  } finally {f.wrapper.unmount(); f.runtime.dispose()}
})

it('selects directory people through the same standard picker and refuses a late result after directory refresh', async () => {
  const f = await fixture(true)
  try {
    f.select.mockResolvedValueOnce([{label: '李四', value: 'U2:李四'}])
    await f.wrapper.get('.primary-action-button').trigger('click'); await flushPromises()
    expect(f.select.mock.calls[0]?.[0].options).toEqual([{label: '张三', value: 'U1:张三'}, {label: '李四', value: 'U2:李四'}])
    expect(f.input.getEditingRow(f.id)?.['nextNode']).toEqual([{NodeId: 'N1', ExecUserList: ['U2:李四']}])
    f.input.discardEditingRows([f.id]); await flushPromises()
    let release: (() => void) | undefined
    f.select.mockImplementationOnce(() => new Promise(resolve => {release = () => resolve([{label: '李四', value: 'U2:李四'}])}))
    await f.wrapper.get('.primary-action-button').trigger('click'); await flushPromises()
    await f.directory.refresh(); release?.(); await flushPromises()
    expect(f.input.getEditingRow(f.id)?.['nextNode'] ?? f.input.rows[0]?.['nextNode']).toEqual([{NodeId: 'N1', ExecUserList: []}])
    expect(f.dispatch).not.toHaveBeenCalled()
  } finally {f.wrapper.unmount(); f.runtime.dispose()}
})

function mountSelectorHost() {
  const wrapper = mount(AppPageUiHost, {
    attachTo: document.body,
    global: {plugins: [ElementPlus], stubs: {ElDialog: false, ElButton: false, teleport: false}},
  })
  const body = new DOMWrapper(document.body)
  function dialog() {
    const rendered = body.findAll('.el-dialog').find(item => item.find('.app-page-selector-body').exists())
    if (!rendered) throw new Error('未找到原应用壳选择弹窗')
    return rendered
  }
  async function click(label: string) {
    const control = dialog().findAll('button').find(item => item.text() === label)
    if (!control) throw new Error(`未找到选择器动作 ${label}`)
    await control.trigger('click')
    await flushPromises()
  }
  return {wrapper, dialog, click}
}

it.each([
  {nodeId: 'N1', previous: ['U1:张三', 'U9:不可解析样本'], returned: ['U1:张三']},
  {nodeId: 'N2', previous: ['U9:不可解析样本'], returned: []},
])('keeps unresolved original people on ordinary confirmation for $nodeId', async ({nodeId, previous, returned}) => {
  const f = await fixture(false, nodeId, true), host = mountSelectorHost()
  try {
    const before = [{NodeId: nodeId, ExecUserList: previous}]
    f.input.updateEditingValue(f.id, 'nextNode', before)
    await flushPromises()
    const changes = vi.fn()
    f.input.events.on('editingFieldChanged', changes)
    try {
      await f.wrapper.get('.primary-action-button').trigger('click')
      await flushPromises()
      expect(appPageUiState.selector.options.map(item => item.value)).toEqual(returned)
      expect(appPageUiState.selector.selectedValues).toEqual(previous)
      expect(host.dialog().text()).not.toContain('U9:不可解析样本')
      if (returned.length === 0) expect(host.dialog().text()).toContain('暂无可选项')
      await host.click('确定')
      expect(f.dispatch).not.toHaveBeenCalled()
      expect({visible: appPageUiState.selector.visible, value: f.input.getEditingRow(f.id)?.['nextNode'], writeEvents: changes.mock.calls.length})
        .toEqual({visible: true, value: before, writeEvents: 0})
      expect(appPageUiState.selector.selectedValues).toEqual(previous)
      expect(appPageUiState.selector.options.map(item => item.value)).toEqual(returned)
      expect(host.dialog().get('[role="status"]').text()).toContain('原选择中有当前候选无法核对的项')
      expect(host.dialog().text()).not.toContain('U9:不可解析样本')
    } finally {f.input.events.off('editingFieldChanged', changes)}
  } finally {
    f.wrapper.unmount()
    host.wrapper.unmount()
    closeAppSelector()
    f.runtime.dispose()
  }
})

it('preserves an original unresolved person on actual cancel and explicitly clears the field', async () => {
  const f = await fixture(false, 'N1', true), host = mountSelectorHost()
  try {
    const before = [{NodeId:'N1', ExecUserList:['U1:张三','U9:不可解析样本']}]
    f.input.updateEditingValue(f.id, 'nextNode', before)
    await flushPromises()
    await f.wrapper.get('.primary-action-button').trigger('click')
    await flushPromises()
    await host.click('取消')
    expect(f.input.getEditingRow(f.id)?.['nextNode']).toEqual(before)
    await f.wrapper.get('.clear-action-button').trigger('click')
    await flushPromises()
    expect(f.input.getEditingRow(f.id)?.['nextNode']).toEqual([{NodeId:'N1', ExecUserList:[]}])
    expect(f.dispatch).not.toHaveBeenCalled()
  } finally {
    f.wrapper.unmount()
    host.wrapper.unmount()
    closeAppSelector()
    f.runtime.dispose()
  }
})

it('uses the explicitly chosen replacement in the actual single selector dialog', async () => {
  const host = mountSelectorHost()
  try {
    const result = appPageUiService.selectEntities({
      currentValue: 'U9:不可解析样本',
      options: [{label: '新候选', value: 'U1:张三'}],
    })
    await flushPromises()
    const choice = host.dialog().get('input[type="radio"]')
    expect(choice.attributes('checked')).toBeUndefined()
    await host.click('确定')
    expect(host.dialog().get('[role="status"]').text()).toContain('原选择中有当前候选无法核对的项')
    await choice.setValue(true)
    expect(host.dialog().find('[role="status"]').exists()).toBe(false)
    await host.click('确定')
    await expect(result).resolves.toEqual([{label: '新候选', value: 'U1:张三'}])
  } finally {
    host.wrapper.unmount()
    closeAppSelector()
  }
})
it('confirms an initially empty selection and an explicitly unchecked visible option', async () => {
  const host = mountSelectorHost()
  try {
    const initiallyEmpty = appPageUiService.selectEntities({multiple: true, currentValue: [], options: []})
    await flushPromises()
    await host.click('确定')
    await expect(initiallyEmpty).resolves.toEqual([])

    const visible = appPageUiService.selectEntities({
      multiple: true,
      currentValue: ['U1:张三'],
      options: [{label: '张三', value: 'U1:张三'}],
    })
    await flushPromises()
    await host.dialog().get('input[type="checkbox"]').setValue(false)
    await host.click('确定')
    await expect(visible).resolves.toEqual([])
  } finally {
    host.wrapper.unmount()
    closeAppSelector()
  }
})
