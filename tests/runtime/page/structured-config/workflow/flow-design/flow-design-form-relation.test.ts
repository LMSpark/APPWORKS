import {HttpClientBase, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {describe, expect, it, vi} from 'vitest'
import type {DataView} from '@spark-appworks/spark-data'
import {
  buildWorkFormRelationPayload,
  saveFlowWorkFormRelation,
  shouldSyncWorkFormRelation,
} from '@/lowcode/resources/system/workflow/manage/flow-design/flow-design-form-relation'

class FlowHttpStub extends HttpClientBase {
  readonly calls: RequestConfig[] = []

  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.calls.push(config)
    return {data: {Code: 200, Result: true}, status: 200, statusText: 'OK', headers: {}}
  }
}

function createWorkFormView(rows: Array<Record<string, unknown>>, pending = false): DataView {
  return {
    rows,
    destroyed: false,
    hasEditingChanges: () => pending,
    dirtyTracking: {hasPendingChanges: () => pending},
  } as unknown as DataView
}

describe('flow-design-form-relation', () => {
  it('maps workform rows to payload', () => {
    const view = createWorkFormView([{
      rowid: 'F1',
      FORMID: 'form-a',
      FormName: '请假',
      URL: '/a',
      FlowID: 'FM-1',
    }])
    expect(buildWorkFormRelationPayload(view, 'FM-1')).toEqual([expect.objectContaining({
      ROWID: 'F1',
      FORMID: 'form-a',
      FormName: '请假',
      URL: '/a',
      FlowID: 'FM-1',
    })])
  })

  it('posts SaveFlowAndFormRelation when rows exist', async () => {
    const http = new FlowHttpStub()
    const view = createWorkFormView([{rowid: 'F1', FORMID: 'f', FormName: 'x'}])
    expect(shouldSyncWorkFormRelation(view)).toBe(true)
    await saveFlowWorkFormRelation({
      http,
      flowModelId: 'FM-9',
      view,
      readScope: () => ({token: 't', headers: {'X-AppId': 'app'}}),
    })
    expect(http.calls[0]?.url).toBe('/api/Flow/SaveFlowAndFormRelation/FM-9')
    expect(http.calls[0]?.method).toBe('POST')
  })

  it('skips empty view without pending changes', async () => {
    const http = new FlowHttpStub()
    const view = createWorkFormView([])
    expect(shouldSyncWorkFormRelation(view)).toBe(false)
    await saveFlowWorkFormRelation({
      http,
      flowModelId: 'FM-9',
      view,
      readScope: () => ({token: 't', headers: {}}),
    })
    expect(http.calls).toHaveLength(0)
  })
})