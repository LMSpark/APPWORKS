import assert from 'node:assert/strict'
import {readFile, writeFile} from 'node:fs/promises'
const base = 'node_modules/.cache/metadata-integration-20261025/'
const evidence = JSON.parse(await readFile(base + 'b2-relation-spa-main.json', 'utf8'))
assert.equal(evidence.truncated, false)
assert.deepEqual(evidence.counts, {requests: 138, document: 0, failures: 0, reads: 131, writes: 2})
assert.ok(evidence.requests.every(request => request.status === 200))
const reads = evidence.requests.filter(request => request.path === '/api/DataOperation/GetData')
assert.equal(reads.length, 131)
assert.ok(reads.every(request => request.code === 200 && !request.bodyUnavailable))
assert.equal(evidence.created.table, 'Base_TblRln')
assert.deepEqual(evidence.created.counts, {added: 1, changed: 0, deleted: 0})
assert.equal(evidence.created.code, 200)
assert.equal(evidence.created.readCode, 200)
assert.equal(evidence.created.readCount, 1)
const row = evidence.created.readRow
assert.equal(row.rowid, '34A3F87EA002AF6EB93B3E5C0A173EEA')
assert.equal(row.pktbid, 'A4AAF1C36F3B4B8B8ED12B25A126C668')
assert.equal(row.fktbid, '313440ED9A37613ED0F729340652D7E7')
assert.equal(row.pkdbid, '4F69FFD7A0B94BD6928A139B1B4358C6')
assert.equal(row.fkdbid, row.pkdbid)
assert.equal(row.IsCascadeDeletion, 0)
const expression = JSON.parse(row.RelshipExp)
assert.deepEqual(expression, {Type: 'cond', Field: 'test_user.age', Value: null,
  Operator: 'equal', ValueFun: {Type: 'GetTableField', Field: 'testTB1.id'}})
assert.deepEqual(JSON.parse(evidence.created.added[0].RelshipExp), expression)
assert.equal(evidence.renamed.table, 'Base_TblRln')
assert.deepEqual(evidence.renamed.counts, {added: 0, changed: 1, deleted: 0})
assert.deepEqual([...evidence.renamed.changedFieldNames].sort(), ['lingma_sys_key', 'rlname', 'rowid'])
assert.deepEqual(evidence.renamed.changed, [{rowid: row.rowid, rlname: evidence.retainedTest.name}])
assert.equal(evidence.renamed.code, 200)
assert.equal(evidence.renamed.readCode, 200)
assert.deepEqual(evidence.renamed.readRow, {...row, rlname: evidence.retainedTest.name})
const label = JSON.parse(await readFile(base + 'b2-relation-label-spa.json', 'utf8'))
assert.equal(label.truncated, false)
assert.equal(label.document, 0)
assert.equal(label.failures, 0)
assert.equal(label.requests.length, 38)
assert.ok(label.requests.every(request => request.path === '/api/DataOperation/GetData'
  && request.code === 200 && request.status === 200))
const labelReadbacks = label.requests.filter(request => request.record)
assert.equal(labelReadbacks.length, 3)
for (const result of labelReadbacks) assert.deepEqual(result.record, evidence.renamed.readRow)
const summary = {status: 'passed', counts: evidence.counts, retainedTest: evidence.retainedTest,
  finalLabelWindow: {reads: 38, exactRelationReadbacks: 3, document: 0, writes: 0, failures: 0, truncated: false},
  claims: ['no Document navigation', 'all formal query responses accepted', 'one exact relationship create',
    'name-only exact change', 'formal endpoint/expression roundtrip', 'no deletion or DDL request'],
  limits: evidence.limits}
await writeFile(base + 'b2-relation-spa-root-audit.json', JSON.stringify(summary, null, 2) + '\n')
console.log(JSON.stringify(summary))
