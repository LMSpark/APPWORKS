/**
 * @module app:lowcode/resources/structured-config/workflow-definition/trigger/cron-assistance
 * 职责：沿原 DataSet 生成时间表达式候选，明确采用时只更新已捕获的定义草稿。
 * 边界：不保存定义、不调度执行、不从候选推断权限。原定义行、触发类型或草稿已变更时拒绝采用。
 * AI用途：在工作流定义中从调度说明取得候选，经用户确认后写入当次打开的 timeExp 字段。
 */
import type {DataSet, DataView} from '@spark-appworks/spark-data'
import type {AiTurnDraftRunner} from '@spark-appworks/spark-ai/agent'
import {AiDataEntryHost} from '@/platform-adapters/resources/shared/ai-data-entry-host'
import {parseWorkflowCronCandidate} from './cron-candidate'

const runners = new WeakMap<DataSet, AiTurnDraftRunner>()

/** 仅发送调度需求，候选结果仍须由用户确认。 */
export async function requestWorkflowCronCandidate(dataSet: DataSet, requirement: string, signal: AbortSignal): Promise<string> {
  const description = requirement.trim()
  if (!description || description.length > 1000) throw Error('请输入 1 至 1000 个字符的调度说明')
  signal.throwIfAborted()
  let runner = runners.get(dataSet)
  if (!runner) {
    runner = new AiDataEntryHost({dataSet}).createDraftRunner()
    runners.set(dataSet, runner)
  }
  const draft = await runner.run([
    '根据调度说明生成一条六段 Quartz Cron 表达式，依次为秒、分、时、日、月、周。',
    '仅输出表达式，使用数字、英文月份或星期、星号、列表、范围、步长。日和周中恰好一项用问号。不要输出多行、Markdown 或解释。',
    description,
  ].join('\n'), signal)
  signal.throwIfAborted()
  return parseWorkflowCronCandidate(draft)
}

/** 草稿确认需要同一正式查询、同一原行及未变更的触发字段。 */
export function captureWorkflowCronTarget(view: DataView, definitionId: string) {
  const row = view.currentRow
  if (!row || view.rows.length !== 1 || view.getPkKey(row) !== definitionId
    || view.dataTable?.modelBinding?.modelName !== 'Base_WorkflowDefinition') {
    throw Error('缺少当前工作流的正式定义')
  }
  const fields = ['activeType', 'timeExp']
  const assertRead = view.captureReadRow(row, fields)
  const initial = (view.getEditingRow(definitionId) ?? row)['timeExp']
  const assertCurrent = () => {
    assertRead()
    const draft = view.getEditingRow(definitionId) ?? row
    if (view.currentRow !== row || view.queryContext['definitionId'] !== definitionId
      || view.hasUnconfirmedSave || view.mutating || draft['activeType'] !== 'time'
      || draft['timeExp'] !== initial) throw Error('时间触发定义已变化，请重新生成候选')
    if (view.fieldAccess(row, 'timeExp').write !== 'allowed') throw Error('当前时间表达式不可编辑')
  }
  assertCurrent()
  return {assertCurrent, apply(candidate: string) {
    assertCurrent()
    view.updateEditingValue(definitionId, 'timeExp', candidate)
  }}
}
