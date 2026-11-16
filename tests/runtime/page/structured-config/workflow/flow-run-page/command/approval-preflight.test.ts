import {expect, it, vi} from 'vitest'
import {DataSet, bindDataSetCommandSubmit, ensureDataSetResourceView} from '@spark-appworks/spark-data'
import {FlowRunCommandResource} from '@/lowcode/resources/system/workflow/manage/flow-run-page/command/flow-run-command-resource'
import {assertApprovalCommandAvailable, submitApprovalCommand} from '@/lowcode/resources/system/workflow/manage/flow-run-page/command/submit'

it.each([false, true])('preflights the original owner without staging or dispatching unknown=%s', async unknown => {
  const ds = DataSet.fromJson({scenarioId: 'approval', tables: {}})
  const view = ensureDataSetResourceView({dataSet: ds, tableName: 'ApprovalCommand', resource: {resourceType: 'command', resourceId: 'workflow:approval'}, columns: [{name: 'rowid', primary: true}, {name: 'action'}, {name: 'flowObjectId'}, {name: 'stepId'}, {name: 'nextNode', type: 'array'}]})
  const dispatch = vi.fn(async () => {if (unknown) throw Error('lost receipt')})
  let revision = 0
  bindDataSetCommandSubmit(view, new FlowRunCommandResource({view, dispatch, guard: () => {}, captureTarget: () => {
    const captured = revision
    return () => {if (captured !== revision) throw Error('formal query replaced')}
  }}).binding())
  try {
    const input = {action: 'submit', flowObjectId: 'WF1', stepId: 'S1'}
    await assertApprovalCommandAvailable(ds, input)
    expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
    await ds.saveChanges()
    expect(dispatch).not.toHaveBeenCalled()
    if (unknown) {
      await expect(submitApprovalCommand(ds, input)).rejects.toThrow(/未知/)
      const ids = [...view.dirtyTracking.pendingCreateIds]
      await expect(assertApprovalCommandAvailable(ds, input)).rejects.toThrow(/未知/)
      expect(view.hasUnconfirmedSave).toBe(true)
      expect([...view.dirtyTracking.pendingCreateIds]).toEqual(ids)
    } else {
      await submitApprovalCommand(ds, input)
      await expect(assertApprovalCommandAvailable(ds, input)).rejects.toThrow(/已确认/)
      expect(dispatch).toHaveBeenCalledTimes(1)
      revision += 1
      await assertApprovalCommandAvailable(ds, input)
      expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
      await submitApprovalCommand(ds, input)
      expect(dispatch).toHaveBeenCalledTimes(2)
    }
  } finally {ds.destroy()}
})
