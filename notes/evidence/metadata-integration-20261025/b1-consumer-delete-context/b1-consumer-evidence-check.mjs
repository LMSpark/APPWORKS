// Read-only verification of browser-observed evidence; no application requests.
import {readFile, writeFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
const cache = 'node_modules/.cache/metadata-integration-20261024/'
const read = async name => JSON.parse(await readFile(cache + name, 'utf8'))
const initial = await read('b1-consumer-inspection-network.json')
const runtime = await read('b1-consumer-runtime-readback.json')
const firstFile = await read('b1-consumer-view-file-proof.json')
const sortedFile = await read('b1-consumer-view-sort-file-proof.json')
const previous = await read('g4-spa-verified-network.json')
const name = 'B1Sort_20261024_1925F4C2'
const modelId = 'F9F01665D4A98E1FF996CD8A48D3C373'
const spaceId = '944DEE5A0E5170F903E0E008172C4CD2'
const dictId = '327D74EC0ABC4196AA75C56D944B8201'
const fields = ['rowid', 'val', 'txt', 'exVal_1', 'exVal_2', 'exVal_3', 'exVal_4', 'ordIdx'].sort()
for (const trace of [initial, runtime]) {
  assert.equal(trace.documentLoads.length, 0)
  assert.equal(trace.errors.length, 0)
  assert.ok(trace.requests.every(r => !r.failure && !r.responseReadError))
}
const writes = initial.requests.filter(r => r.path.endsWith('BatchTableOperateRequestByCRUD'))
assert.equal(writes.length, 1)
assert.equal(writes[0].httpStatus, 200)
assert.equal(writes[0].response.Code, 200)
assert.deepEqual(writes[0].request.map(r => r.TableName).sort(), ['Base_DataModel', 'Base_DataModel_Field'])
for (const part of writes[0].request) {
  assert.deepEqual(part.CrudModel.Changed, [])
  assert.deepEqual(part.CrudModel.Deleted, [])
}
const model = writes[0].request.find(r => r.TableName === 'Base_DataModel').CrudModel.Added
assert.equal(model.length, 1)
assert.equal(model[0].rowid, modelId)
assert.equal(model[0].dataSetId, spaceId)
assert.equal(model[0].DbId, dictId)
assert.equal(model[0].Name, name)
assert.equal(model[0].Type, '字典')
const columns = writes[0].request.find(r => r.TableName === 'Base_DataModel_Field').CrudModel.Added
assert.deepEqual(columns.map(r => r.Name).sort(), fields)
assert.ok(columns.every(r => r.dataModelId === modelId && r.dataSetId === spaceId))
assert.equal(initial.requests.filter(r => r.httpStatus === 401).length, 2)
const unfinished = runtime.requests.filter(r => r.httpStatus === undefined)
assert.deepEqual(unfinished.map(r => [r.id, r.step, r.request.Table[0].Name]), [['2180.5413', 'clean-close-final-frozen', 'Base_DataSet']])
for (const r of runtime.requests.filter(r => r.httpStatus !== undefined)) {
  assert.equal(r.httpStatus, 200, r.id)
  assert.equal(r.response.Code, 200, r.id)
  assert.ok(r.path.endsWith('/GetData'), r.path)
}
const queries = runtime.requests.filter(r => r.request.Table?.some(t => t.Name === name))
assert.equal(queries.length, 3) // model preview, unsorted view, independently reopened sorted view
const final = queries.at(-1)
assert.equal(final.response.Count, 7)
assert.equal(final.response.Items.length, 7)
assert.deepEqual(final.request.Table[0].Fields.filter(f => f.Order).map(f => [f.Name, f.OrderType]), [['ordIdx', 'ascending']])
assert.deepEqual(final.response.Items.map(r => r.ordIdx), [0, 0, 1, 2, 3, 4, 5])
const baseline = previous.requests.find(r => r.step === 'saved-dictionary-reopened' && r.entryQuery).response.Items
const project = rows => rows.map(r => Object.fromEntries(fields.map(k => [k, r[k] ?? null]))).sort((a,b) => a.rowid.localeCompare(b.rowid))
assert.deepEqual(project(final.response.Items), project(baseline))
assert.deepEqual(project(queries[0].response.Items), project(baseline))
const formalModels = runtime.requests.flatMap(r => r.response?.Items ?? []).filter(r => r.rowid === modelId)
assert.ok(formalModels.some(r => r.DbId === dictId && r.dataSetId === spaceId && r.Name === name))
const formalFields = runtime.requests.flatMap(r => r.response?.Items ?? []).filter(r => r.dataModelId === modelId && r.type === 'dataModel')
assert.deepEqual([...new Set(formalFields.map(r => r.Name))].sort(), fields)
for (const evidence of [firstFile, sortedFile]) {
  assert.equal(evidence.truncated, false)
  assert.equal(evidence.records.filter(r => r.path.endsWith('/UploadFile')).length, 1)
  assert.ok(evidence.records.every(r => r.http === 200))
  assert.ok(evidence.records.filter(r => r.code !== undefined).every(r => r.code === 200))
}
const configs = [...firstFile.records, ...sortedFile.records].filter(r => r.scenarioId === spaceId)
assert.ok(configs.length >= 5)
assert.equal(new Set(configs.map(r => r.otherTablesSha256)).size, 1)
assert.equal(new Set(configs.map(r => r.layoutSha256)).size, 1)
const finalTable = configs.at(-1).b1Table
assert.deepEqual(finalTable.modelBinding, {modelId, modelName: name})
assert.deepEqual(finalTable.views.b1Consumer, {valueField: 'val', labelField: 'txt', sortExpression: [{field: 'ordIdx', direction: 'asc'}]})
const proof = {passed: true, modelId, spaceId, dictionaryId: dictId,
  creation: {modelAdded: 1, fieldsAdded: 8, changed: 0, deleted: 0},
  fileSaves: 2, otherTablesAndLayoutUnchangedDuringViewSaves: true,
  authBoundary: 'Two HTTP 401 responses ended the initial window; normal reauthentication precedes the independent runtime window.',
  sameSpaRuntime: {queries: runtime.requests.length, completeQueryReceipts: runtime.requests.length - unfinished.length,
    unfinishedClosingCatalogQueries: unfinished.map(r => r.id), documents: 0, eventTruncations: 0, businessWrites: 0,
    modelQueries: queries.length, reopenedRowCount: 7, dataMatchesRetainedDictionary: true},
  viewKey: `${spaceId}@${name}@b1Consumer`, retained: true,
  limits: ['No permanent deletion executed.', 'No global absence-of-reference proof.', 'Named view table preview verified; dedicated business select component consumption remains separate.']}
await writeFile(cache + 'b1-consumer-evidence-check.json', JSON.stringify(proof, null, 2) + '\n')
console.log(JSON.stringify(proof))
