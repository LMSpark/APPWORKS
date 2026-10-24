import assert from 'node:assert/strict'
import path from 'node:path'
import {createServer} from 'vite'

const root = process.cwd()
const server = await createServer({root, mode: 'development', configFile: path.resolve(root, 'vite.config.ts'),
  server: {middlewareMode: true}, appType: 'custom'})
try {
  const dataModule = await server.ssrLoadModule('/packages/spark-data/src/index.ts')
  const queryModule = await server.ssrLoadModule('/packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-options.ts')
  const dataSet = dataModule.DataSet.fromJson({dataSetName: 'Probe', scenarioId: 'FORM', tables: {
    Base_DataModel: {tableName: 'Base_DataModel', modelBinding: {modelId: 'MODEL', modelName: 'Base_DataModel'},
      columns: [
        {name: 'rowid', type: 'string'}, {name: 'Name', type: 'string'}, {name: 'Type', type: 'string'},
        {name: 'DbId', type: 'string'}, {name: 'MetaName', type: 'string'}, {name: 'dataSetId', type: 'string'},
      ], views: {default: {queryContext: {dataSpaceId: 'TENANT-SCOPE'}}}},
  }})
  const table = dataSet.getTable('Base_DataModel')
  const defaultView = dataSet.getView('Base_DataModel', 'default')
  assert.ok(table && defaultView)
  const temp = defaultView.createQueryView('binding-probe')
  const filter = dataModule.DataViewFilter.group({logic: 'and', filters: [
    {field: 'Type', operator: 'eq', value: '字典'},
    {field: 'DbId', operator: 'eq', value: '327D74EC0ABC4196AA75C56D944B8201'},
  ]})
  assert.throws(() => temp.configure({filterExpression: filter}), /条件只接受 field、operator 与 value/,
    'DataView.configure must reject a DataViewFilter instance where ViewMetadata requires a plain tree')
  const plainTree = filter.toJSON()
  temp.configure({filterExpression: plainTree, queryContext: {}, queryConfig: {
    allPages: true, maxRows: 50000, fields: ['rowid', 'Name', 'Type', 'DbId', 'MetaName', 'dataSetId'],
  }})
  assert.deepEqual(temp.filterExpression, plainTree)
  assert.deepEqual(temp.queryContext, {})
  const command = queryModule.captureDataSpaceViewQuery(temp, {
    page: 1, pageSize: 20, allPages: true, maxRows: 50000,
    fields: ['rowid', 'Name', 'Type', 'DbId', 'MetaName', 'dataSetId'],
  })
  assert.equal(command.identity.scenarioId, 'FORM')
  assert.equal(command.identity.metaName, 'Base_DataModel')
  assert.deepEqual(command.options.inputParams, [])
  const wire = queryModule.encodeDataSpaceQueryOptions(command.options)
  assert.deepEqual(wire.inputParams, undefined)
  assert.equal(wire.filter?.Type, 'and')
  assert.equal(wire.filter?.Filters?.length, 2)
  assert.deepEqual(wire.fields?.map(field => field.Name), ['rowid', 'Name', 'Type', 'DbId', 'MetaName', 'dataSetId'])
  assert.equal(defaultView.queryContext.dataSpaceId, 'TENANT-SCOPE', 'temporary query config must not alter default context')
  table.destroyView('binding-probe')
  assert.equal(temp.destroyed, true)
  dataSet.destroy()
  console.log(JSON.stringify({status: 'passed', assertions: 14,
    evidence: 'real DataSet/DataView/createQueryView and formal DataSpace query capture/encoding; no executor or network'}))
} finally {
  await server.close()
}
