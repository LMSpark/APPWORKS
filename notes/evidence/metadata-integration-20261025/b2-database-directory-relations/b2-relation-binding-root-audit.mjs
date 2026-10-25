import assert from 'node:assert/strict'
import {readFileSync, writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'

const base = new URL('./', import.meta.url)
const read = name => JSON.parse(readFileSync(new URL(name, base), 'utf8'))
const creation = read('b2-relation-model-created.json')
const output = read('b2-relation-output-saved.json')
const inventory = read('b2-relation-source-inventory-result.json')
const modelId = 'D2B9B94A1641BB87E6D3D9251A14D70D'
const target = 'A8FB2B2B161125A16FD15ED9581CD15B'
const changedNames = ['pkdbid', 'pktbid', 'pktable', 'fkdbid', 'fktbid', 'fktable', 'rlname', 'IsCascadeDeletion', 'createuser', 'createtime', 'RelshipExp']
const expectedOutputs = [...changedNames, 'rowid', 'lingma_sys_ent'].sort()
assert.equal(creation.modelId, modelId)
assert.equal(creation.spaceId, target)
assert.equal(creation.truncated, false)
assert.equal(creation.documentRequests, 0)
assert.deepEqual(creation.failures, [])
assert.equal(creation.submitted.length, 2)
const modelWrite = creation.submitted.find(item => item.table === 'Base_DataModel')
const fieldWrite = creation.submitted.find(item => item.table === 'Base_DataModel_Field')
assert.equal(modelWrite.added.length, 1)
assert.equal(modelWrite.added[0].rowid, modelId)
assert.equal(modelWrite.added[0].Name, 'Base_TblRln')
assert.equal(modelWrite.added[0].dataSetId, target)
assert.equal(fieldWrite.added.length, 25)
for (const item of creation.submitted) {
  assert.equal(item.changed, 0)
  assert.equal(item.deleted, 0)
}
for (const field of fieldWrite.added) {
  assert.equal(field.dataSetId, target)
  assert.equal(field.dataModelId, modelId)
  assert.equal(field.allowAIAdd, 0)
}
const modelReadback = creation.requests.find(item => item.requestId === '2180.31284')
assert.equal(modelReadback.count, 7)
assert.equal(modelReadback.rows.filter(row => row.rowid === modelId).length, 1)
for (const prior of inventory.models.rows) {
  const row = modelReadback.rows.find(item => item.rowid === prior.rowid)
  assert.ok(row)
  for (const key of ['rowid', 'dataSetId', 'Name', 'MetaName', 'Type', 'DbId']) assert.equal(row[key], prior[key])
}
const fieldsReadback = creation.requests.find(item => item.requestId === '2180.31285')
assert.equal(fieldsReadback.count, 25)
assert.equal(fieldsReadback.rows.length, 25)
assert.deepEqual(fieldsReadback.rows.map(row => row.rowid).sort(), fieldWrite.added.map(row => row.rowid).sort())
assert.equal(creation.layoutReadback.scenarioId, target)
assert.deepEqual(creation.layoutReadback.tables, {})
assert.deepEqual(creation.layoutReadback.layout.modelPositions[modelId], {x: 150, y: 450})
assert.equal(Object.keys(creation.layoutReadback.layout.modelPositions).length, 7)
assert.equal(output.truncated, false)
assert.equal(output.documentRequests, 0)
assert.equal(output.write.length, 1)
const update = output.write[0]
assert.equal(update.table, 'Base_DataModel_Field')
assert.equal(update.added, 0)
assert.equal(update.deleted, 0)
assert.equal(update.changed.length, 11)
for (const row of update.changed) {
  assert.deepEqual(row.fieldKeys.sort(), ['IsOutput', 'rowid'])
  assert.equal(row.IsOutput, 1)
}
assert.deepEqual(update.changed.map(row => fieldWrite.added.find(field => field.rowid === row.rowid)?.Name).sort(), changedNames.sort())
const savedFields = output.responses.filter(row => ['2180.31306', '2180.31307'].includes(row.id)).flatMap(row => row.rows)
assert.equal(savedFields.length, 25)
assert.deepEqual(savedFields.filter(row => Number(row.IsOutput) === 1).map(row => row.Name).sort(), expectedOutputs)
for (const field of savedFields) {
  const previous = fieldsReadback.rows.find(item => item.rowid === field.rowid)
  assert.ok(previous)
  for (const key of ['dataSetId', 'dataModelId', 'Name', 'IsPKey', 'FieldType']) assert.equal(field[key], previous[key])
  if (!changedNames.includes(field.Name)) assert.equal(field.IsOutput, previous.IsOutput)
}
assert.equal(savedFields.find(row => row.Name === 'RelshipExp').FieldType, 'json')
assert.equal(savedFields.find(row => row.Name === 'IsCascadeDeletion').FieldType, 'int')
assert.ok(output.responses.every(row => row.http === 200 && row.code === 200))
const report = {
  status: 'passed', modelId, modelAdded: 1, fieldsAdded: 25, outputFieldsChanged: 11, formalOutputs: expectedOutputs,
  unchangedPriorModels: inventory.models.rows.length, layoutNodes: 7, documentRequests: 0,
  limits: ['No relation business row was saved', 'Runtime formal primary key and RelshipExp value representation require separate verification', 'Layout and database persistence are separate operations'],
  evidence: ['b2-relation-model-created.json', 'b2-relation-output-saved.json'].map(name => ({name, sha256: createHash('sha256').update(readFileSync(new URL(name, base))).digest('hex')})),
}
writeFileSync(new URL('b2-relation-binding-root-audit.json', base), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
