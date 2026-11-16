import {describe, expect, it, vi} from 'vitest'
import {DataSet, bindDataSetCommandSubmit, ensureDataSetResourceView} from '@spark-appworks/spark-data'
import {FlowRunCommandResource} from '@/lowcode/resources/system/workflow/manage/flow-run-page/command/flow-run-command-resource'
import {submitApprovalCommand, verifyApprovalCommand} from '@/lowcode/resources/system/workflow/manage/flow-run-page/command/submit'

describe('approval command through the original DataSet', () => {
  it('retains an unknown command and verifies without dispatching it twice', async () => {
    const ds = DataSet.fromJson({scenarioId: 'approval', tables: {}})
    const view = ensureDataSetResourceView({dataSet: ds, tableName: 'ApprovalCommand', resource: {resourceType: 'command', resourceId: 'workflow:approval'},
      columns: [{name: 'rowid', primary: true}, {name: 'action'}, {name: 'flowObjectId'}, {name: 'stepId'}, {name: 'idea'}, {name: 'nextNode', type: 'array'}]})
    const dispatch = vi.fn(async () => {throw Error('lost response')})
    const guard = vi.fn()
    let sourceCurrent = true
    const captureTarget = () => () => {if (!sourceCurrent) throw Error('formal query expired')}
    const binding = new FlowRunCommandResource({view, guard, dispatch, captureTarget}).binding()
    bindDataSetCommandSubmit(view, binding)
    try {
      await view.refresh()
      const row = await view.addRow({action: 'submit', flowObjectId: 'WF-1', stepId: 'S1', idea: '同意', nextNode: [{NodeId: 'N1', ExecUserList: ['U1']}]})
      await expect(binding.submit({...row, nextNode: [{NodeId: 'N1', ExecUserList: ['U2']}]})).rejects.toThrow()
      expect(dispatch).not.toHaveBeenCalled()
      await expect(binding.submit({...row, idea: 'changed'})).rejects.toThrow()
      expect(dispatch).not.toHaveBeenCalled()
      await expect(binding.submit({...row, stepId: 'other-step'})).rejects.toThrow()
      expect(dispatch).not.toHaveBeenCalled()
      sourceCurrent = false
      await expect(ds.saveChanges()).rejects.toThrow()
      expect(dispatch).not.toHaveBeenCalled()
      sourceCurrent = true
      await expect(binding.submit({...row})).rejects.toThrow()
      expect(dispatch).toHaveBeenCalledTimes(1)
      await expect(view.addRow({action: 'submit', flowObjectId: 'WF-2', stepId: 'S2'})).rejects.toThrow()
      await expect(ds.saveChanges()).rejects.toThrow()
      expect(view.hasUnconfirmedSave).toBe(true)
      await expect(verifyApprovalCommand(ds)).rejects.toThrow(/核验/)
      expect(dispatch).toHaveBeenCalledTimes(1)
      await expect(binding.submit({...row})).rejects.toThrow()
      expect(dispatch).toHaveBeenCalledTimes(1)
      await expect(ds.saveChanges()).rejects.toThrow()
      expect(dispatch).toHaveBeenCalledTimes(1)
      expect(view.hasUnconfirmedSave).toBe(true)
    } finally {ds.destroy()}
  })
})


it.each(['submit', 'back', 'forceBack', 'toCreator', 'revoke'])('does not issue a new %s command for an already confirmed original target', async action => {
  const ds = DataSet.fromJson({scenarioId: 'approval', tables: {}})
  const view = ensureDataSetResourceView({dataSet: ds, tableName: 'ApprovalCommand', resource: {resourceType: 'command', resourceId: 'workflow:approval'}, columns: [{name: 'rowid', primary: true}, {name: 'action'}, {name: 'flowObjectId'}, {name: 'stepId'}, {name: 'nextNode', type: 'array'}]})
  const dispatch = vi.fn(async () => {})
  let revision = 0
  bindDataSetCommandSubmit(view, new FlowRunCommandResource({view, dispatch, guard: () => {}, captureTarget: () => {
    const captured = revision
    return () => {if (captured !== revision) throw Error('formal query replaced')}
  }}).binding())
  try {
    const input = {action, flowObjectId: 'WF-1', stepId: 'S1'}
    await submitApprovalCommand(ds, input)
    await view.refresh()
    await expect(submitApprovalCommand(ds, input)).rejects.toThrow(/已确认/)
    expect(dispatch).toHaveBeenCalledTimes(1)
    revision += 1
    await submitApprovalCommand(ds, input)
    expect(dispatch).toHaveBeenCalledTimes(2)
    await submitApprovalCommand(ds, {...input, stepId: 'S2'})
    expect(dispatch).toHaveBeenCalledTimes(3)
  } finally {ds.destroy()}
})
