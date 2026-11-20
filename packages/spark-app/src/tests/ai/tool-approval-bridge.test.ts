import { describe, expect, it, vi } from 'vitest'
import type { AiAgentBeforeFunctionCallOptions } from '@spark-appworks/spark-ai/agent'
import {
  AiToolApprovalBridge,
  createAiToolApprovalBridge,
  type AiToolApprovalBridgeSnapshot,
} from '../../ai/tool-approval-bridge'

function createBeforeFunctionCallOptions(
  toolName = 'model_script',
): AiAgentBeforeFunctionCallOptions {
  return {
    moduleId: 'pageDesign',
    moduleInstanceId: 'orders',
    instanceId: 'orders',
    toolName,
    args: {
      script: 'return page.openPageDesign("orders")',
    },
  }
}

describe('AiToolApprovalBridge', () => {
  it('publishes a pending tool approval and resolves the selected decision', async () => {
    const bridge = createAiToolApprovalBridge({
      now: () => 100,
      idFactory: {
        createId: (_options, sequence) => `approval-${sequence}`,
      },
    })
    const snapshots: AiToolApprovalBridgeSnapshot[] = []
    bridge.subscribe((snapshot) => snapshots.push(snapshot))

    const decision = bridge.beforeFunctionCall(createBeforeFunctionCallOptions())

    expect(bridge.listPending()).toEqual([{
      id: 'approval-1',
      moduleId: 'pageDesign',
      moduleInstanceId: 'orders',
      instanceId: 'orders',
      toolName: 'model_script',
      args: {
        script: 'return page.openPageDesign("orders")',
      },
      requestedAt: 100,
    }])

    expect(bridge.decide('approval-1', { status: 'allow' })).toBe(true)
    await expect(decision).resolves.toEqual({ status: 'allow' })
    expect(bridge.listPending()).toEqual([])
    expect(snapshots.map((snapshot) => snapshot.pending.length)).toEqual([0, 1, 0])
  })

  it('cancels every pending approval with an abort directive', async () => {
    const bridge = new AiToolApprovalBridge({
      idFactory: {
        createId: (_options, sequence) => `approval-${sequence}`,
      },
    })

    const first = bridge.beforeFunctionCall(createBeforeFunctionCallOptions('model_script'))
    const second = bridge.beforeFunctionCall(createBeforeFunctionCallOptions('model_class_guide'))

    expect(bridge.listPending().map((request) => request.id)).toEqual(['approval-1', 'approval-2'])
    expect(bridge.cancelPending('用户停止运行')).toBe(2)

    await expect(first).resolves.toEqual({ status: 'abort', reason: '用户停止运行' })
    await expect(second).resolves.toEqual({ status: 'abort', reason: '用户停止运行' })
    expect(bridge.listPending()).toEqual([])
  })

  it('ignores decisions for missing requests and supports unsubscribe', async () => {
    const bridge = createAiToolApprovalBridge()
    const listener = vi.fn()
    const unsubscribe = bridge.subscribe(listener)

    expect(bridge.decide('missing', { status: 'allow' })).toBe(false)
    unsubscribe()
    const pending = bridge.beforeFunctionCall(createBeforeFunctionCallOptions())
    expect(bridge.cancelPending()).toBe(1)
    await expect(pending).resolves.toEqual({ status: 'abort', reason: '审批已取消。' })

    expect(listener).toHaveBeenCalledTimes(1)
  })
})
