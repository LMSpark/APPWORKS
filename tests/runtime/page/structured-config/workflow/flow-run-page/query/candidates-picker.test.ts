import {afterEach, expect, it, vi} from 'vitest'
import {config, flushPromises, mount} from '@vue/test-utils'
import {defineComponent, h} from 'vue'
import ElementPlus from 'element-plus'
import {DataSet, ensureDataSetResourceView, ensureDataSetStaticInputTable, bindDataSetReadonlyCommandQuery, bindDataSetCommandSubmit} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {PAGE_RUNTIME, PAGE_SERVICE, RendererForm, Spark, registerAllRenderers, useSparkComponent, type PageSelectorOption} from '@spark-appworks/spark-component'
import {createTestPageService} from '../../../../../../support/helpers/page-service-host'
import {createFlowRunCandidatesBinding} from '@/lowcode/resources/system/workflow/manage/flow-run-page/query/candidates-binding'
import {FlowRunCommandResource} from '@/lowcode/resources/system/workflow/manage/flow-run-page/command/flow-run-command-resource'
import {submitApprovalCommand} from '@/lowcode/resources/system/workflow/manage/flow-run-page/command/submit'
const originalStubs = {...config.global.stubs}
afterEach(() => {config.global.stubs = originalStubs})

async function fixture(freeChoice = false, nodeId = 'N1') {
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
  const service = {...createTestPageService(), selectEntities: select}
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
