/**
 * @module app:lowcode/resources/system/workflow/manage/flow-run-page/command/submit
 * 职责：审批动作只通过原场景命令视图提交，保留未知输入以供核验。
 */
import type {DataSet, DataRow} from '@spark-appworks/spark-data'
import {FlowRunCommandResource} from './flow-run-command-resource'

/** 只核验原未知捕获；不刷新、不新增命令，也不提交同场景其它视图。 */
export async function verifyApprovalCommand(dataSet: DataSet): Promise<void> {
  const view = dataSet.getView('ApprovalCommand', 'default')
  if (!view || view.destroyed || dataSet.destroyed) throw Error('审批命令视图未装配')
  if (view.mutating) throw Error('原审批命令仍在执行')
  const isUnconfirmed = () => view.hasUnconfirmedSave
  if (!isUnconfirmed()) throw Error('没有待核验的原审批命令')
  const result = await dataSet.saveChanges({views: [{tableName: 'ApprovalCommand', viewId: 'default'}]})
  if (!result.success || isUnconfirmed()) throw Error('原审批命令结果仍待核验')
}

/** 只从原查询owner预检，不新增命令行；业务回调调用整个DataSet保存也不会提前派发审批。 */
export async function assertApprovalCommandAvailable(dataSet: DataSet, input: Readonly<DataRow>): Promise<void> {
  const view = dataSet.getView('ApprovalCommand', 'default')
  if (!view || view.destroyed || dataSet.destroyed) throw Error('审批命令视图未装配')
  if (view.mutating || view.hasUnconfirmedSave || view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges()) throw Error('请先处理原审批命令；结果未知时禁止重新提交')
  await view.refresh()
  if (view.loadingError) throw view.loadingError
  FlowRunCommandResource.assertCanPrepare(view, input)
}

export async function submitApprovalCommand(dataSet: DataSet, input: Readonly<DataRow>): Promise<void> {
  const view = dataSet.getView('ApprovalCommand', 'default')
  if (!view) throw Error('原审批命令视图已失效')
  await assertApprovalCommandAvailable(dataSet, input)
  if (dataSet.getView('ApprovalCommand', 'default') !== view) throw Error('原审批命令视图已变化')
  await view.addRow({...input, ...(view.getColumn('isReturn') ? {isReturn: input['isReturn'] ?? false} : {}), nextNode: input['nextNode'] ?? []})
  const result = await dataSet.saveChanges({views: [{tableName: 'ApprovalCommand', viewId: 'default'}]})
  if (!result.success) throw Error('审批命令未确认完成')
}
