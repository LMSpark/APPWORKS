import {expect, it, vi} from 'vitest'
import {DataSet, bindDataSetCommandSubmit, ensureDataSetResourceView} from '@spark-appworks/spark-data'
import {FlowRunCommandResource} from '@/lowcode/resources/system/workflow/manage/flow-run-page/command/flow-run-command-resource'
import {assertApprovalCommandAvailable, submitApprovalCommand, verifyApprovalCommand} from '@/lowcode/resources/system/workflow/manage/flow-run-page/command/submit'

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

it('retains the dispatched unknown command even when its original parameter proof expires', async () => {
  const ds = DataSet.fromJson({scenarioId: 'approval', tables: {}})
  const view = ensureDataSetResourceView({dataSet: ds, tableName: 'ApprovalCommand', resource: {resourceType: 'command', resourceId: 'workflow:approval'}, columns: [{name: 'rowid', primary: true}, {name: 'action'}, {name: 'flowObjectId'}, {name: 'stepId'}, {name: 'nextNode', type: 'array'}]})
  const dispatch = vi.fn(async () => {throw Error('lost receipt')})
  bindDataSetCommandSubmit(view, new FlowRunCommandResource({view, dispatch, guard: () => {}, captureTarget: () => () => {}}).binding())
  let current = true
  try {
    await expect(submitApprovalCommand(ds, {action: 'submit', flowObjectId: 'WF', stepId: 'S'}, () => {if (!current) throw Error('ORIGINAL_INPUT_STALE')})).rejects.toThrow()
    const ids = [...view.dirtyTracking.pendingCreateIds]
    current = false
    await expect(verifyApprovalCommand(ds)).rejects.toThrow()
    expect(view.hasUnconfirmedSave).toBe(true)
    expect([...view.dirtyTracking.pendingCreateIds]).toEqual(ids)
    expect(dispatch).toHaveBeenCalledTimes(1)
  } finally {ds.destroy()}
})

it.each(['refresh', 'save'])('does not dispatch or strand a command when original input expires during %s', async stage => {
  const ds = DataSet.fromJson({scenarioId: 'approval', tables: {}})
  const view = ensureDataSetResourceView({dataSet: ds, tableName: 'ApprovalCommand', resource: {resourceType: 'command', resourceId: 'workflow:approval'}, columns: [{name: 'rowid', primary: true}, {name: 'action'}, {name: 'flowObjectId'}, {name: 'stepId'}, {name: 'nextNode', type: 'array'}]})
  const dispatch = vi.fn(async () => {})
  bindDataSetCommandSubmit(view, new FlowRunCommandResource({view, dispatch, guard: () => {}, captureTarget: () => () => {}}).binding())
  let current = true
  if (stage === 'refresh') vi.spyOn(view, 'refresh').mockImplementationOnce(async () => {await view.loadFromServer(); current = false})
  else vi.spyOn(ds, 'saveChanges').mockImplementationOnce(async options => {current = false; return DataSet.prototype.saveChanges.call(ds, options)})
  try {
    await expect(submitApprovalCommand(ds, {action: 'submit', flowObjectId: 'WF', stepId: 'S'}, () => {if (!current) throw Error('ORIGINAL_INPUT_STALE')})).rejects.toThrow()
    expect(dispatch).not.toHaveBeenCalled()
    expect(view.hasUnconfirmedSave).toBe(false)
    expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
    current = true
    await submitApprovalCommand(ds, {action: 'submit', flowObjectId: 'WF', stepId: 'S'}, () => {if (!current) throw Error('ORIGINAL_INPUT_STALE')})
    expect(dispatch).toHaveBeenCalledTimes(1)
  } finally {ds.destroy()}
})
