/**
 * @module app:lowcode/resources/system/workflow/manage/flow-run-page/command/submit
 * 职责：审批动作只通过原场景命令视图提交，保留未知输入以供核验。
 */
import type {DataSet, DataRow} from '@spark-appworks/spark-data'

export async function submitApprovalCommand(dataSet: DataSet, input: Readonly<DataRow>): Promise<void> {
  const view = dataSet.getView('ApprovalCommand', 'default')
  if (!view || view.destroyed || dataSet.destroyed) throw Error('审批命令视图未装配')
  if (view.mutating || view.hasUnconfirmedSave || view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges()) throw Error('请先处理原审批命令；结果未知时禁止重新提交')
  await view.refresh()
  if (view.loadingError) throw view.loadingError
  await view.addRow({...input, nextNode: input['nextNode'] ?? []})
  const result = await dataSet.saveChanges({views: [{tableName: 'ApprovalCommand', viewId: 'default'}]})
  if (!result.success) throw Error('审批命令未确认完成')
}
