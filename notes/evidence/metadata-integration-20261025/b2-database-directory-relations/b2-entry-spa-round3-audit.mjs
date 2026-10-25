import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'

const base = 'node_modules/.cache/metadata-integration-20261025/'
const evidence = JSON.parse(readFileSync(`${base}b2-entry-spa-round3.json`, 'utf8'))
assert.equal(evidence.truncated, false)
assert.equal(evidence.failures.length, 0)
assert.equal(evidence.requests.length, 113)
assert.equal(evidence.responses.length, 109)
assert(evidence.requests.every(r => r.type !== 'Document'))
assert(evidence.requests.every(r => r.query || r.type === 'Script'))
assert(evidence.responses.every(r => r.httpStatus === 200 && r.code === 200 && !r.readbackError))
const runtimeQueries = evidence.requests.filter(r => r.query?.OutputFieldMode === 'REQUEST')
const fields = runtimeQueries.filter(r => r.query.Table[0].Name === 'Base_TblField')
assert.equal(fields.length, 1)
const target = '313440ED9A37613ED0F729340652D7E7'
assert.deepEqual(fields[0].query.Table[0].Filter.ValueFun.Value, [target])
const fieldReply = evidence.responses.find(r => r.id === fields[0].id)
assert.equal(fieldReply.count, 12)
assert.equal(fieldReply.rows.length, 12)
assert(fieldReply.rows.every(r => r.tblid === target))
const tables = runtimeQueries.filter(r => r.query.Table[0].Name === '_Base_TblList')
assert.deepEqual(tables.map(r => evidence.responses.find(s => s.id === r.id).count), [2, 11, 2])
assert.deepEqual(tables.map(r => r.query.Table[0].Filter.ValueFun.Value), [
  ['4F69FFD7A0B94BD6928A139B1B4358C6'],
  ['09C58DF7D2AF4E6FB565AB82AB2ABEB3'],
  ['4F69FFD7A0B94BD6928A139B1B4358C6'],
])
const files = {
  RendererTable: 'packages/spark-component/src/components/containers/data-views/RendererTable/RendererTable.vue',
  tablePage: 'src/views/features/data-platform/database-management/table-and-view/ui/table-and-view-page.vue',
  tableCatalog: 'src/lowcode/resources/database/lowcode-database-table-view.ts',
  directoryPage: 'src/views/DataBaseManage/DataBaseManage/index.vue',
}
for (const [key, file] of Object.entries(files)) {
  assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex').toUpperCase(), evidence.productHashes[key])
}
console.log(JSON.stringify({status: 'passed', requests: 113, formalReplies: 109, runtimeFieldQueries: 1,
  fieldRows: 12, tableCounts: [2, 11, 2], documents: 0, businessWrites: 0, frozenProductHashes: 4}))
