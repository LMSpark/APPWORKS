import {expect, it} from 'vitest'
import {DataSet, bindDataSetReadonlyCommandQuery, ensureDataSetResourceView} from '@spark-appworks/spark-data'
import {createFlowAppendOptionsBinding} from '@/lowcode/resources/system/workflow/manage/flow-append-user/options-binding'

it('binds configuration to the original parent and the matching node instead of the first response entry', async () => {
  const ds = DataSet.fromJson({scenarioId: 'S', tables: {}})
  const source = ensureDataSetResourceView({dataSet: ds, tableName: 'WFOBJ_FLOW_RELATIONLINE_STEP', resource: {resourceType: 'service-query', resourceId: 'steps'}, columns: [{name: 'rowid', primary: true}, ...['WFOBJID', 'SendNodeModelId', 'ReceiveNodeModelId', 'LastStepID'].map(name => ({name}))]})
  bindDataSetReadonlyCommandQuery(source, {resource: {resourceType: 'service-query', resourceId: 'steps'}, guard: () => {}, loadRows: async () => [{rowid: 'P', WFOBJID: 'WF', SendNodeModelId: 'N1', ReceiveNodeModelId: 'N2', LastStepID: 'L'}]})
  const view = ensureDataSetResourceView({dataSet: ds, tableName: 'AppendOptions', resource: {resourceType: 'logical-view', resourceId: 'workflow:append-options'}, columns: [{name: 'id', primary: true}, {name: 'payload', type: 'object'}, {name: 'nodeId'}, {name: 'minNum', type: 'number'}, {name: 'maxNum', type: 'number'}, {name: 'allowChange', type: 'boolean'}]})
  let values: unknown[] = [{nodeId: 'OTHER', maxNum: 9, allowChange: '1', userList: []}, {nodeId: 'N2', minNum: 1, maxNum: 2, userList: [{UserId: 'U', UserName: '甲'}]}]
  bindDataSetReadonlyCommandQuery(view, createFlowAppendOptionsBinding({view, source, guard: () => {}, client: {getExecutionUsers: async () => values}}))
  try {
    await source.refresh()
    view.queryContext = {stepId: 'P', flowObjectId: 'WF', upNodeId: 'N1', nodeId: 'N2', lastStepId: 'L'}
    await view.refresh()
    expect(view.loadingError).toBeNull()
    expect(view.rows[0]).toMatchObject({nodeId: 'N2', minNum: 1, maxNum: 2, allowChange: false})
    const proof = view.captureReadRow(view.rows[0]!, ['payload'])
    await source.refresh(); expect(() => proof()).toThrow()
    values = [{nodeId: 'OTHER', maxNum: 9, allowChange: '1', userList: []}]
    await view.refresh(); expect(view.loadingError).not.toBeNull()
    values = [{nodeId: 'N2', maxNum: false, allowChange: '1', userList: []}]
    await view.refresh(); expect(view.loadingError).not.toBeNull()
  } finally {ds.destroy()}
})
