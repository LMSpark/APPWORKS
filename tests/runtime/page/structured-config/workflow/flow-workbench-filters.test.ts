import {describe, expect, it} from 'vitest'
import {
  buildFlowWorkbenchTabFilterExpression,
  flowWorkbenchMetaName,
  flowWorkbenchTabBinding,
} from '@/platform-adapters/resources/system/workflow/manage/flow-workbench/flow-workbench-filters'

describe('flow-workbench filters', () => {
  it('maps tabs to meta and views', () => {
    expect(flowWorkbenchTabBinding('pending')).toEqual({
      tab: 'pending',
      modelName: 'WFOBJ_FLOW_Waiting',
      viewId: 'workbenchPending',
    })
    expect(flowWorkbenchTabBinding('processed').viewId).toBe('workbenchProcessed')
    expect(flowWorkbenchMetaName('started')).toBe('WFOBJ_FLOW')
  })

  it('builds processed filter expression with SendUserId and OR groups', () => {
    const expr = buildFlowWorkbenchTabFilterExpression('processed')
    expect(expr).toMatchObject({logic: 'and'})
    if (!('filters' in expr)) throw new Error('expected group')
    expect(expr.filters[0]).toMatchObject({field: 'SendUserId', operator: 'eq'})
    const orStep = expr.filters.find(item => 'logic' in item && item.logic === 'or' && 'filters' in item
      && item.filters.some(leaf => 'field' in leaf && leaf.field === 'STEPTYPE'))
    expect(orStep).toBeDefined()
  })

  it('builds shared and started expressions', () => {
    expect(buildFlowWorkbenchTabFilterExpression('shared')).toMatchObject({logic: 'and'})
    expect(buildFlowWorkbenchTabFilterExpression('started')).toMatchObject({field: 'createuser', operator: 'eq'})
  })

})