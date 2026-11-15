import {describe, expect, it} from 'vitest'
import {
  buildFlowWorkbenchTabFilterFields,
  flowWorkbenchMetaName,
} from '@/lowcode/resources/system/workflow/manage/flow-workbench/flow-workbench-filters'

describe('flow-workbench filters', () => {
  it('maps pending tab to Waiting meta', () => {
    expect(flowWorkbenchMetaName('pending')).toBe('WFOBJ_FLOW_Waiting')
    const fields = buildFlowWorkbenchTabFilterFields('pending', 'U-1')
    expect(fields).toEqual([{field: 'UserID', operator: 'eq', value: 'U-1'}])
  })

  it('returns null without user id', () => {
    expect(buildFlowWorkbenchTabFilterFields('pending', '')).toBeNull()
  })
})