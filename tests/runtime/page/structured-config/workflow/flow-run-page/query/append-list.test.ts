import {expect, it} from 'vitest'
import {readFileSync} from 'node:fs'
import {DataSet, bindDataSetReadonlyCommandQuery} from '@spark-appworks/spark-data'
import {queryFlowAppendParticipants} from '@/lowcode/resources/system/workflow/manage/flow-append-user/flow-append-user-list'

it('queries the exact relation in its declared named view without replacing the source history', async () => {
  const config = JSON.parse(readFileSync('config/pages/workflow/flow-workbench/pagedata.json', 'utf8'))
  const declaration = config.tables.WFOBJ_FLOW_RELATIONLINE_STEP.views.appendParticipants
  expect(declaration).toBeDefined()
  const ds = DataSet.fromJson({scenarioId: 'S', tables: {WFOBJ_FLOW_RELATIONLINE_STEP: {resourceType: 'logical-view', resourceId: 'steps', columns: ['rowid', 'WFOBJID', 'SendNodeModelId', 'ReceiveNodeModelId', 'LastStepID', 'StepState', 'STATUS', 'ReceiveUserId', 'ReceiveUserName'].map(name => ({name, type: 'string', ...(name === 'rowid' ? {isPrimaryKey: true} : {})})), views: {default: {queryConfig: {pagination: 'none'}}, appendParticipants: declaration}}}})
  const source = ds.getView('WFOBJ_FLOW_RELATIONLINE_STEP')!, list = ds.getView('WFOBJ_FLOW_RELATIONLINE_STEP', 'appendParticipants')!
  const target = {rowid: 'T', WFOBJID: 'WF', SendNodeModelId: 'N1', ReceiveNodeModelId: 'N2', LastStepID: 'L', TITLE: '节点'}
  const rows = [{...target, StepState: '0', STATUS: '0', ReceiveUserId: 'U1', ReceiveUserName: '张三'}, {...target, rowid: 'A', StepState: '1'}, {...target, rowid: 'DONE', StepState: '2'}, {...target, rowid: 'OTHER', LastStepID: 'L2', StepState: '0'}]
  let returnedRows = rows, duringLoad = () => {}
  for (const view of [source, list]) bindDataSetReadonlyCommandQuery(view, {resource: {resourceType: 'logical-view', resourceId: 'steps'}, guard: () => {}, loadRows: async () => {
    if (view === list) {duringLoad(); return returnedRows}
    return rows
  }})
  try {
    await source.refresh()
    expect(source.rows[0]).toMatchObject({rowid: 'T', WFOBJID: 'WF', SendNodeModelId: 'N1', ReceiveNodeModelId: 'N2', LastStepID: 'L'})
    const original = source.rows[0]
    expect(await queryFlowAppendParticipants(source, target, () => {})).toBe(list)
    expect(list.rows.map(row => row['rowid'])).toEqual(['T', 'A'])
    expect(source.rows).toHaveLength(4); expect(source.rows[0]).toBe(original)
    returnedRows = []
    expect(await queryFlowAppendParticipants(source, target, () => {})).toBe(list)
    expect(list.rows).toEqual([]); expect(source.rows).toHaveLength(4)
    let current = true
    duringLoad = () => {current = false}
    await expect(queryFlowAppendParticipants(source, target, () => {if (!current) throw Error('ORIGINAL_HOST_CHANGED')})).rejects.toThrow('ORIGINAL_HOST_CHANGED')
    await expect(queryFlowAppendParticipants(source, {...target, WFOBJID: 'OTHER'}, () => {})).rejects.toThrow()
    await expect(queryFlowAppendParticipants(source, {WFOBJID: 'WF'}, () => {})).rejects.toThrow(/身份/)
    source.queryContext = {other: 'scope'}
    await expect(queryFlowAppendParticipants(source, target, () => {})).rejects.toThrow()
  } finally {ds.destroy()}
})
