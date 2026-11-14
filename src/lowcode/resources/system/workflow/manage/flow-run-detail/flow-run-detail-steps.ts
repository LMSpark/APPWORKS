/**
 * @module app:lowcode/resources/system/workflow/manage/flow-run-detail-steps
 * 职责：运行详情步骤钻取纯逻辑（过滤、分组、待办标记）。
 */
export type FlowRunDetailStepRow = Readonly<Record<string, unknown>>
export type FlowRunDetailWaitingRow = Readonly<Record<string, unknown>>

function normalizeText(value: unknown): string {
  return String(value ?? '').trim()
}

export function filterVoidedSteps(rows: readonly FlowRunDetailStepRow[], showVoided: boolean): FlowRunDetailStepRow[] {
  if (showVoided) return [...rows]
  return rows.filter(row => {
    const state = normalizeText(row['StepState'])
    return state === '0' || state === '1'
  })
}

export function buildWaitingStepIdSet(waiting: readonly FlowRunDetailWaitingRow[]): ReadonlySet<string> {
  const set = new Set<string>()
  for (const row of waiting) {
    const stepId = normalizeText(row['StepID'])
    if (stepId) set.add(stepId)
  }
  return set
}

export function isWaitingStep(rowid: unknown, waitingStepIds: ReadonlySet<string>): boolean {
  return waitingStepIds.has(normalizeText(rowid))
}

export function stepsReceivedAtNode(steps: readonly FlowRunDetailStepRow[], nodeId: string): FlowRunDetailStepRow[] {
  const id = normalizeText(nodeId)
  if (!id) return []
  return steps.filter(row => normalizeText(row['ReceiveNodeModelId']) === id)
}

export function stepsSentFromNode(steps: readonly FlowRunDetailStepRow[], nodeId: string): FlowRunDetailStepRow[] {
  const id = normalizeText(nodeId)
  if (!id) return []
  return steps.filter(row => normalizeText(row['SendNodeModelId']) === id)
}

export function stepsOnEdge(
  steps: readonly FlowRunDetailStepRow[],
  sourceNodeId: string,
  targetNodeId: string,
): FlowRunDetailStepRow[] {
  const from = normalizeText(sourceNodeId)
  const to = normalizeText(targetNodeId)
  if (!from || !to) return []
  return steps.filter(
    row => normalizeText(row['SendNodeModelId']) === from && normalizeText(row['ReceiveNodeModelId']) === to,
  )
}