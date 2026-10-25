import {readFile, writeFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import path from 'node:path'
const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const read = name => readFile(path.join(root, name), 'utf8').then(JSON.parse)
const capture = await read('b1-business-select-network.json')
const identities = await read('b1-business-select-identities.json')
assert.equal(capture.requests.length, 44)
assert.deepEqual(capture.documentLoads, [])
assert.deepEqual(capture.errors, [])
assert.equal(identities.truncated, false)
assert.equal(identities.hasMore, false)
assert.equal(identities.requests.length, 44)
const appId = 'D99A1DCE9894698799101EFD70F8FC76'
const dictionaryId = 'D7F531C8DA4842B682DD9248A8539DFC'
const dictionaryScenarioId = '69B79AB779DF4C12A5595DACDF3283F1'
const headerScenarioId = '446B5D94A71587E9BD4D325A4DF5F6F8'
const providerId = '8DAD6968DF1B4AE7A99887FCEAC66D91'
for (const record of capture.requests) {
  assert.equal(record.path, '/api/DataOperation/GetData')
  assert.equal(record.httpStatus, 200)
  assert.equal(record.response?.Code, 200)
  assert.equal(record.failure, undefined)
  assert.equal(record.responseReadError, undefined)
  const identity = identities.requests.find(item => item.id === record.id)?.identity
  assert.equal(identity?.['X-AppId'], appId)
  if (record.table === '_Base_DictType' || record.table === '_Base_DictData') assert.equal(identity['x-FormKey'], dictionaryScenarioId)
  if (record.table === 'Base_InterfaceProvider_Headers') assert.equal(identity['x-FormKey'], headerScenarioId)
}
const records = table => capture.requests.filter(record => record.table === table)
const definitions = records('_Base_DictType'), entries = records('_Base_DictData'), headers = records('Base_InterfaceProvider_Headers')
for (const list of [definitions, entries, headers]) assert.equal(list.length, 2)
for (const record of definitions) {
  assert.equal(record.response.Count, 1)
  assert.deepEqual(record.response.Items, [{rowid:dictionaryId, TypeName:'接口公共头部信息使用类型'}])
  assert.equal(record.request.Table[0].Filter.Field, 'TypeName')
  assert.equal(record.request.Table[0].Filter.ValueFun.Value, '接口公共头部信息使用类型')
}
for (const record of entries) {
  assert.equal(record.response.Count, 3)
  assert.equal(record.response.Items.length, 3)
  assert.equal(record.request.Table[0].Filter.Field, 'typeid')
  assert.equal(record.request.Table[0].Filter.ValueFun.Value, dictionaryId)
  assert(record.response.Items.every(row => row.typeid === dictionaryId))
  assert.deepEqual(record.response.Items.map(row => [row.val,row.txt]), [['expired','过期使用'],['all','固定使用'],['auth','认证使用']])
}
assert.deepEqual(entries[0].response.Items, entries[1].response.Items)
for (const record of headers) {
  assert.equal(record.response.Count, 0)
  assert.deepEqual(record.response.Items, [])
  assert.equal(record.request.Table[0].Filter.Field, 'proId')
  assert.equal(record.request.Table[0].Filter.ValueFun.Value, providerId)
}
const artifacts = {}
for (const file of ['b1-select-options.png', 'b1-select-draft.png', 'b1-select-reopened-empty.png', 'b1-select-nav-clipped.png', 'b1-business-select-network.json', 'b1-business-select-identities.json']) {
  const bytes = await readFile(path.join(root,file))
  artifacts[file] = {bytes:bytes.length, sha256:createHash('sha256').update(bytes).digest('hex')}
}
const report = {verifiedAt:new Date().toISOString(), sourceHead:'a176ae2f56ccd507f34d7e36d4489bba28422c94',
  requests:44, completeReceipts:44, documentLoads:0, nonQueryRequests:0, truncated:false,
  appId,providerId,dictionaryId,dictionaryScenarioId,headerScenarioId,
  definitionRequests:definitions.map(row=>row.id),entryRequests:entries.map(row=>row.id),headerRequests:headers.map(row=>row.id),
  originalAndReopenedHeaderCounts:[0,0],dictionaryOptionsUnchanged:true,
  limitations:['UI screenshots show selected labels, not hidden DataView memory.', 'Dispose is inferred from source and fresh queries; no runtime destroyed property was inspected.', 'Original navigation was clipped at default width; temporary 2300px viewport was reset after navigation.', 'No save, permanent delete, or global reference integrity was tested.'], artifacts}
await writeFile(path.join(root,'b1-business-select-audit.json'),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({result:'PASS',requests:44,completeReceipts:44,documents:0,writes:0,options:3,headerCounts:[0,0]}))
