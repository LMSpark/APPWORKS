import {describe, expect, it, vi} from 'vitest'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {FLOW_DESIGN_SCENARIO_ID, saveFlowDesignInfo} from '@/lowcode/resources/system/workflow/manage'

vi.mock('@/lowcode/resources/system/workflow/manage/flow-design-file-context', () => ({
  resolveFlowDesignFileContext: vi.fn(async () => ({customPath: 'SysForm'})),
}))
vi.mock('@/lowcode/resources/system/workflow/manage/flow-design/flow-design-table-sync', () => ({
  syncFlowDesignTables: vi.fn(async () => undefined),
}))

const saveChanges = vi.fn(async () => ({success: true, message: 'ok'}))
const uploadWorkingText = vi.fn(async () => ({} as Readonly<Record<string, unknown>>))

type MockView = {
  destroyed: boolean
  rows: Array<Record<string, unknown>>
  queryContext: Record<string, string>
  updateEditingValue: ReturnType<typeof vi.fn>
  getPkKey: (row: unknown) => string
  fieldAccess: ReturnType<typeof vi.fn>
}

function createModelView(): MockView {
  return {
    destroyed: false,
    rows: [{rowid: 'FM-1', TITLE: '流程A', DesignJson: ''}],
    queryContext: {},
    updateEditingValue: vi.fn(),
    getPkKey: () => 'FM-1',
    fieldAccess: vi.fn(() => ({write: 'allowed'})),
  }
}

function createRuntime(modelView: MockView): PageRuntime {
  const nodeView = {destroyed: false, rows: [{rowid: 'N1', TITLE: '开始'}], queryContext: {}}
  const edgeView = {destroyed: false, rows: [], queryContext: {}}
  return {
    getDataSet: (scenarioId: string) => scenarioId === FLOW_DESIGN_SCENARIO_ID
      ? {
        getView: (name: string) => {
          if (name === 'WFM_FLOW_MODLE') return modelView
          if (name === 'WFM_FLOW_NODE') return nodeView
          if (name === 'WFM_NODE_REALATION') return edgeView
          return undefined
        },
        saveChanges,
      }
      : undefined,
  } as unknown as PageRuntime
}

describe('saveFlowDesignInfo', () => {
  it('uploads EJ2.json, patches DesignJson, and saves dataset', async () => {
    const modelView = createModelView()
    const runtime = createRuntime(modelView)
    await saveFlowDesignInfo({
      runtime,
      flowModelId: 'FM-1',
      fileUpload: {uploadWorkingText},
    })
    expect(uploadWorkingText).toHaveBeenCalledWith(expect.objectContaining({
      fileName: 'FM-1EJ2.json',
      customPath: 'SysForm',
    }))
    expect(modelView.updateEditingValue).toHaveBeenCalledWith('FM-1', 'DesignJson', expect.any(String))
    expect(saveChanges).toHaveBeenCalledOnce()
  })

  it('throws when saveChanges fails', async () => {
    const modelView = createModelView()
    const runtime = createRuntime(modelView)
    saveChanges.mockResolvedValueOnce({success: false, message: 'denied'})
    await expect(saveFlowDesignInfo({
      runtime,
      flowModelId: 'FM-1',
      fileUpload: {uploadWorkingText},
    })).rejects.toThrow(/denied|保存/)
  })
})