import {expect, it} from 'vitest'
import {DataSet, bindDataSetReadonlyCommandQuery, ensureDataSetResourceView} from '@spark-appworks/spark-data'
import {createFlowRunCandidatesBinding} from '@/lowcode/resources/system/workflow/manage/flow-run-page/query/candidates-binding'

it.each(['zero', 'empty', 'hidden-name', 'partial', 'limited', 'replacement'] as const)('keeps directory scope for %s', async mode => {
  const ds = DataSet.fromJson({scenarioId: 'S', tables: {}})
  const source = ensureDataSetResourceView({dataSet: ds, tableName: 'Options', resource: {resourceType: 'logical-view', resourceId: 'options'}, columns: [{name: 'id', primary: true}, {name: 'payload', type: 'object'}]})
  bindDataSetReadonlyCommandQuery(source, {resource: {resourceType: 'logical-view', resourceId: 'options'}, guard: () => {}, loadRows: async () => [{id: 'current', payload: {execUser: [{nodeId: 'N', maxNum: mode === 'zero' ? 0 : 1, allowChange: '1', userList: [{UserId: 'U1', UserName: '张三'}]}]}}]})
  const directory = ensureDataSetResourceView({dataSet: ds, tableName: 'Users', resource: {resourceType: 'logical-view', resourceId: 'directory'}, columns: [{name: 'rowid', primary: true}, {name: 'UserName'}]})
  directory.queryConfig = {allPages: true, ...(mode === 'limited' ? {maxRows: 1} : {})}
  directory.bindQueryExecutor({executeQuery: async () => ({rows: mode === 'empty' ? [] : [{rowid: 'U2', UserName: '李四'}], total: mode === 'empty' ? 0 : mode === 'partial' ? 2 : 1, countReported: true,
    resultPrimaryKey: '', assertIdentity: () => {}, rowKey: () => undefined,
    fieldAccess: () => ({read: 'visible' as const, write: 'denied' as const, component: 'readonly' as const, required: false, writeMode: 'readonly' as const}),
    readFieldAccess: (_row, field) => mode === 'hidden-name' && field === 'UserName' ? 'invisible' : 'visible',
    addActionState: () => 'hidden', editActionState: () => 'hidden', deleteActionState: () => 'hidden', createChildActionState: () => 'hidden', viewActionState: () => 'enabled'})}, {resource: {resourceType: 'logical-view', resourceId: 'directory'}})
  const view = ensureDataSetResourceView({dataSet: ds, tableName: 'Candidates', resource: {resourceType: 'logical-view', resourceId: 'workflow:approval-candidates'}, columns: [{name: 'id', primary: true}, {name: 'name'}, {name: 'value'}, {name: 'nodeId'}]})
  let current = directory, reads = 0
  bindDataSetReadonlyCommandQuery(view, createFlowRunCandidatesBinding({view, source, guard: () => {}, userDirectory: () => {reads++; return current}}))
  try {
    await source.refresh(); if (mode !== 'zero') await directory.refresh()
    view.queryContext = {nodeId: 'N'}; await view.refresh()
    if (mode === 'limited' || mode === 'partial') {expect(view.loadingError?.message).toMatch(/完整/); return}
    expect(view.loadingError).toBeNull()
    if (mode === 'zero') {expect(reads).toBe(0); expect(view.rows).toEqual([]); return}
    const proof = view.captureReadResult()
    if (mode === 'empty' || mode === 'hidden-name') expect(view.rows.map(row => row['value'])).toEqual(['U1:张三'])
    else expect(view.rows.map(row => row['value'])).toEqual(['U1:张三', 'U2:李四'])
    if (mode === 'replacement') current = source
    else await directory.refresh()
    expect(() => proof()).toThrow()
  } finally {ds.destroy()}
})
