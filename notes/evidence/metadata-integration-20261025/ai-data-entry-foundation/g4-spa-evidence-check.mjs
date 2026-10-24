// Read-only audit of browser-observed evidence. Never issues application requests.
import {readFile, writeFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
const cache = 'node_modules/.cache/metadata-integration-20261024/'
const trace = JSON.parse(await readFile(cache + 'g4-spa-verified-network.json', 'utf8'))
assert.equal(trace.documentLoads.length, 0)
assert.equal(trace.errors.length, 0)
for (const request of trace.requests) {
  assert.equal(request.httpStatus, 200, request.path)
  assert.equal(request.response?.Code, 200, request.path)
  assert.equal(request.failure, undefined)
  assert.equal(request.responseReadError, undefined)
}
const entryQueries = trace.requests.filter(item => item.entryQuery)
const rowsAt = step => entryQueries.find(item => item.step === step)?.response.Items
const before = rowsAt('baseline-loaded')
const cancelled = rowsAt('cancel-restored')
const saved = rowsAt('save-receipt')
const reopened = rowsAt('saved-dictionary-reopened')
assert.equal(before.length, 5)
assert.deepEqual(cancelled, before)
assert.equal(saved.length, 7)
assert.deepEqual(saved.slice(0, 5), before)
assert.deepEqual(reopened, saved)
const other = entryQueries.find(item => item.step === 'other-dictionary-loaded')
assert.equal(other.request.Table[0].Filter.ValueFun.Value, 'D39BC0D2B65836CD7D80AC84C53C5B99')
assert.equal(other.response.Items.length, 0) // The observer retains only the test dictionary's rows.
const writes = trace.requests.filter(item => item.path === '/api/DataOperation/BatchTableOperateRequestByCRUD')
assert.equal(writes.length, 1)
assert.equal(writes[0].request.length, 1)
const change = writes[0].request[0]
assert.equal(change.TableName, '_Base_DictData')
assert.equal(change.CrudModel.Added.length, 2)
assert.deepEqual(change.CrudModel.Changed, [])
assert.deepEqual(change.CrudModel.Deleted, [])
for (const [index, row] of change.CrudModel.Added.entries()) {
  assert.deepEqual(Object.keys(row).sort(), ['crttime', 'ordIdx', 'rowid', 'txt', 'typeid', 'val'])
  assert.equal(row.typeid, trace.dictionaryId)
  assert.equal(row.ordIdx, index + 4)
  assert.equal(row.val, `G4S_20261025_F721_${index === 0 ? 'A' : 'B'}`)
  assert.equal(reopened[index + 5].rowid, row.rowid)
}
const creates = trace.requests.filter(item => item.path === '/api/ai/v1/turns' && item.method === 'POST')
assert.equal(creates.length, 2)
assert.notEqual(creates[0].request.idempotencyKey, creates[1].request.idempotencyKey)
assert.notEqual(creates[0].response.Result.conversationId, creates[1].response.Result.conversationId)
for (const create of creates) {
  assert.equal(create.request.agentId, '2114051153246425088')
  const message = JSON.parse(create.request.message)
  assert.deepEqual(Object.keys(message).sort(), ['allowedFields', 'businessContext', 'businessPrompt', 'maxEntries'])
  assert.deepEqual(message.allowedFields.map(field => field.name), ['ordIdx', 'createuser', 'exVal_4', 'val', 'txt'])
  assert.equal(message.allowedFields[0].type, 'tinyint')
  const turnId = create.response.Result.turnId
  const terminal = trace.requests.find(item => item.path === `/api/ai/v1/turns/${turnId}` && item.response?.Result?.status === 'COMPLETED')
  assert.ok(terminal)
  const candidates = JSON.parse(terminal.response.Result.assistantDraft)
  assert.equal(candidates.entries.length, 2)
  assert.deepEqual(candidates.entries.map(row => row.ordIdx), [4, 5])
}
const proof = {
  passed: true, dictionaryId: trace.dictionaryId, requests: trace.requests.length,
  documentLoads: 0, eventTruncations: 0, turnCreates: creates.length, businessWrites: writes.length,
  counts: {before: before.length, afterCancel: cancelled.length, afterSave: saved.length, afterReopen: reopened.length},
  turnIds: creates.map(item => item.response.Result.turnId),
  retainedAddedRows: reopened.slice(5).map(({rowid, val, txt, ordIdx}) => ({rowid, val, txt, ordIdx})),
  originalRowsUnchanged: true, savedOnlyTwoAddedEntries: true, otherDictionaryIsolated: true,
  fixedAgentReference: true, userMessageContainsOnlyBusinessInputAndSchema: true,
  scope: 'Completed same-SPA flow after layout fix; later source path relocation is separately checked.'
}
await writeFile(cache + 'g4-spa-evidence-check.json', JSON.stringify(proof, null, 2) + '\n')
console.log(JSON.stringify(proof))
