import {describe, expect, it, vi} from 'vitest'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {
  FLOW_DESIGN_SCENARIO_ID,
  FLOW_MONITOR_SCENARIO_ID,
  FLOW_WORKBENCH_SCENARIO_ID,
  prepareFlowRunPage,
} from '@/platform-adapters/resources/system/workflow/manage'

type MockView = {
  destroyed: boolean
  queryContext: Record<string, string>
  loadingError: Error | null
  refresh: ReturnType<typeof vi.fn>
  rows: Array<Record<string, unknown>>
  total: number
  countReported: boolean
  captureReadRow: ReturnType<typeof vi.fn>
  captureReadResult: ReturnType<typeof vi.fn>
  fieldAccess: ReturnType<typeof vi.fn>
}

function createView(rows: MockView['rows']): MockView {
  return {destroyed: false, queryContext: {}, loadingError: null, refresh: vi.fn(async () => undefined), rows,
    total: rows.length, countReported: true, captureReadRow: vi.fn(() => () => {}), captureReadResult: vi.fn(() => () => {}),
    fieldAccess: vi.fn(() => ({read: 'visible'}))}
}

function fixture() {
  const monitor = {
    View_FlowObjList: createView([{rowid: 'WF-OTHER', TITLE: '另一流程', WFMID: 'FM-1', BusTblObjID: 'BUS-OTHER'}]),
    WFOBJ_FLOW: createView([{rowid: 'WF-1', TITLE: '请假', WFMID: 'FM-1', BusTblObjID: 'BUS-9'}]),
  }
  const design = {
    WFM_WORKFORM: createView([{rowid: 'D1', FORMID: 'F1', FormName: '表单1', URL: '/demo/form', mobileUrl: '', FlowID: 'FM-1'}]),
  }
  const workbench = {
    WFOBJ_FLOW: createView([{rowid: 'WF-1', WFMID: 'FM-1'}]),
    WFOBJ_FLOW_FORM: createView([]),
    WFOBJ_FLOW_RELATIONLINE_STEP: createView([{rowid: 'S1', WFOBJID: 'WF-1'}]),
  }
  const runtime = {
    getDataSet: (id: string) => {
      if (id === FLOW_MONITOR_SCENARIO_ID) return {getView: (name: string) => monitor[name as keyof typeof monitor]}
      if (id === FLOW_DESIGN_SCENARIO_ID) return {getView: (name: string) => design[name as keyof typeof design]}
      if (id === FLOW_WORKBENCH_SCENARIO_ID) return {getView: (name: string) => workbench[name as keyof typeof workbench]}
      return undefined
    },
  } as unknown as PageRuntime
  return {runtime, monitor, design, workbench}
}

describe('prepareFlowRunPage', () => {
  it('uses the exact formal object before loading forms and steps', async () => {
    const {runtime, monitor, design, workbench} = fixture()
    const result = await prepareFlowRunPage({runtime, wfid: 'WF-1', flowid: 'FM-1'})
    expect(result).toMatchObject({instanceTitle: '请假', flowObjectId: 'WF-1', busRowId: 'BUS-9'})
    expect(monitor.View_FlowObjList.refresh).not.toHaveBeenCalled()
    expect(result.stepId).toBe('')
    expect(workbench.WFOBJ_FLOW.refresh).toHaveBeenCalledOnce()
    expect(result.formTabs).toHaveLength(1)
    expect(result.formTabs[0]?.tabKey).toBe('F1')
    expect(result.formTabs[0]?.queryString).toBe('flowobjid=WF-1&formkey=F1')
    expect(design.WFM_WORKFORM.queryContext['FLOWID']).toBe('FM-1')
    expect(result.stepHistoryViewKey).toContain('WFOBJ_FLOW_RELATIONLINE_STEP')
    expect(workbench.WFOBJ_FLOW_RELATIONLINE_STEP.queryContext['WFOBJID']).toBe('WF-1')
    expect(workbench.WFOBJ_FLOW_RELATIONLINE_STEP.refresh).toHaveBeenCalledOnce()
    const selected = await prepareFlowRunPage({runtime, wfid: 'WF-1', flowid: 'FM-1', stepId: 'S1'})
    expect(selected.stepId).toBe('S1')
    await expect(prepareFlowRunPage({runtime, wfid: 'WF-1', flowid: 'FM-1', stepId: 'missing'})).rejects.toThrow(/步骤/)
    workbench.WFOBJ_FLOW_RELATIONLINE_STEP.rows.push({rowid: 'S1', WFOBJID: 'WF-1'})
    await expect(prepareFlowRunPage({runtime, wfid: 'WF-1', flowid: 'FM-1', stepId: 'S1'})).rejects.toThrow(/步骤/)
  })

  it.each(['other instance', 'hidden params', 'duplicate', 'incomplete', 'blank path', 'unproven empty'])('rejects %s without substituting a design form', async mode => {
    const {runtime, workbench} = fixture()
    const view = workbench.WFOBJ_FLOW_FORM
    const object = {rowid: 'OF1', WFOBJID: 'WF-1', FORMID: 'F2', FormPath: '/business', FormParams: 'rowid=BUS-9', FormName: '原业务表单'}
    view.rows = [object]
    view.total = 1
    if (mode === 'other instance') object.WFOBJID = 'WF-OTHER'
    if (mode === 'hidden params') view.captureReadRow.mockImplementation((_row, fields: string[]) => {
      if (fields.includes('FormParams')) throw Error('原正式字段不可读')
      return () => {}
    })
    if (mode === 'duplicate') {view.rows.push({...object, rowid: 'OF2'}); view.total = 2}
    if (mode === 'incomplete') view.total = 2
    if (mode === 'blank path') object.FormPath = ''
    if (mode === 'unproven empty') {
      view.rows = []; view.total = 0
      view.captureReadResult.mockImplementation(() => {throw Error('原正式表单查询结果已失效')})
    }
    await expect(prepareFlowRunPage({runtime, wfid: 'WF-1', flowid: 'FM-1'})).rejects.toThrow(/表单|字段/)
  })

  it('keeps visible instance route parameters and rejects a design form owned by another model', async () => {
    const {runtime, design, workbench} = fixture()
    const view = workbench.WFOBJ_FLOW_FORM
    view.rows = [{rowid: 'OF1', WFOBJID: 'WF-1', FORMID: 'F2', FormPath: '/business', FormParams: 'rowid=BUS-9', FormName: '原业务表单'}]
    view.total = 1
    const command = {runtime, wfid: 'WF-1', flowid: 'FM-1'}
    const result = await prepareFlowRunPage({...command, ...{preferMobileForm: true}})
    expect(result.formTabs).toEqual([{tabKey: 'F2', formKey: 'F2', label: '原业务表单', sourcePath: '/business', queryString: 'rowid=BUS-9'}])
    view.rows = []; view.total = 0
    design.WFM_WORKFORM.rows[0]!['FlowID'] = 'FM-OTHER'
    await expect(prepareFlowRunPage(command)).rejects.toThrow(/表单/)
  })

  it('prefers the authorized mobile design path and falls back only after a readable empty value', async () => {
    const {runtime, design} = fixture()
    const view = design.WFM_WORKFORM
    view.rows[0]!['mobileUrl'] = '/demo/mobile'
    const command = {runtime, wfid: 'WF-1', flowid: 'FM-1'}
    const mobile = {...command, preferMobileForm: true}
    expect((await prepareFlowRunPage(command)).formTabs[0]?.sourcePath).toBe('/demo/form')
    expect((await prepareFlowRunPage(mobile)).formTabs[0]).toMatchObject({sourcePath: '/demo/mobile', queryString: 'flowobjid=WF-1&formkey=F1'})
    view.rows[0]!['mobileUrl'] = ''
    expect((await prepareFlowRunPage(mobile)).formTabs[0]?.sourcePath).toBe('/demo/form')
    view.captureReadRow.mockImplementation((_row, fields: string[]) => {
      if (fields.includes('mobileUrl')) throw Error('原正式字段不可读')
      return () => {}
    })
    await expect(prepareFlowRunPage(mobile)).rejects.toThrow('原正式字段不可读')
  })

  it.each(['absent', 'multiple', 'unreported', 'other object', 'other model', 'hidden business key'])('rejects %s before loading companion views', async mode => {
    const {runtime, monitor, design, workbench} = fixture()
    const view = monitor.WFOBJ_FLOW
    if (mode === 'absent') {view.rows = []; view.total = 0}
    if (mode === 'multiple') view.total = 2
    if (mode === 'unreported') view.countReported = false
    if (mode === 'other object') view.rows[0]!['rowid'] = 'WF-OTHER'
    if (mode === 'other model') view.rows[0]!['WFMID'] = 'FM-OTHER'
    if (mode === 'hidden business key') view.captureReadRow.mockImplementation(() => {throw Error('原正式字段不可读')})
    await expect(prepareFlowRunPage({runtime, wfid: 'WF-1', flowid: 'FM-1'})).rejects.toThrow(/正式/)
    expect(design.WFM_WORKFORM.refresh).not.toHaveBeenCalled()
    expect(workbench.WFOBJ_FLOW_FORM.refresh).not.toHaveBeenCalled()
    expect(workbench.WFOBJ_FLOW_RELATIONLINE_STEP.refresh).not.toHaveBeenCalled()
  })

  it('keeps a readable empty business identity and uses the object key for a hidden title', async () => {
    const {runtime, monitor} = fixture()
    const view = monitor.WFOBJ_FLOW
    view.rows[0]!['BusTblObjID'] = null
    view.fieldAccess.mockReturnValue({read:'denied'})
    await expect(prepareFlowRunPage({runtime, wfid: 'WF-1', flowid: 'FM-1'})).resolves.toMatchObject({instanceTitle: 'WF-1', busRowId: ''})
  })

  it('rechecks the original object after companion queries', async () => {
    const {runtime, monitor, design} = fixture()
    let current = true
    monitor.WFOBJ_FLOW.captureReadRow.mockReturnValue(() => {if (!current) throw Error('原正式实例已失效')})
    design.WFM_WORKFORM.refresh.mockImplementation(async () => {current = false})
    await expect(prepareFlowRunPage({runtime, wfid: 'WF-1', flowid: 'FM-1'})).rejects.toThrow('原正式实例已失效')
  })

  it('rejects missing wfid', async () => {
    const runtime = {getDataSet: () => ({getView: () => createView([])})} as unknown as PageRuntime
    await expect(prepareFlowRunPage({runtime, wfid: '', flowid: 'FM-1'})).rejects.toThrow(/wfid/)
  })
})
