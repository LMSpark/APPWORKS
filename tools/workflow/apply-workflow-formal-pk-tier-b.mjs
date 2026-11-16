#!/usr/bin/env node
/**
 * Tier B：收敛多余 IsPKey，再写 PrimaryKeyFields=rowid（默认 dry-run）。
 */
import {spawnSync} from 'node:child_process'
import {writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {collectAllPages, fetchGetDataPage} from './get-data-page.mjs'
import {loadSparkEnvFromLocal} from './load-spark-env.mjs'
import {ensureSparkEnvFromSession} from './resolve-spark-session.mjs'
import {buildSparkAuthHeaders, loadSparkHttpContext} from './spark-http-headers.mjs'
import {formalRowId, readWorkflowModelMap} from './workflow-metadata-models.mjs'
import {
  buildFieldChangedRow,
  buildModelChangedRow,
  postBatchTableOperate,
} from './workflow-formal-pk-batch.mjs'
import {
  classifyDesignerOnly,
  loadFormalPkDetailByModelId,
  partitionFormalPkRepairs,
  resolveFormalPkDetailEvidencePath,
  todayEvidenceStamp,
} from './workflow-formal-pk-tiers.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const FIELD_SATURATION = 32

function text(row, keys) {
  for (const key of keys) {
    const value = row[key]
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim()
  }
  return ''
}

function modelFieldId(row) {
  return text(row, ['dataModelId', 'DataModelId', 'datamodelid'])
}

function fieldType(row) {
  return (text(row, ['type', 'Type']) || 'dataModel').toLowerCase()
}

function parseArgs(argv) {
  return {
    apply: argv.includes('--apply'),
    refreshDetail: argv.includes('--refresh-detail'),
    detailPath: (() => {
      const hit = argv.find((arg, index) => argv[index - 1] === '--detail' && arg)
      return hit ?? resolveFormalPkDetailEvidencePath()
    })(),
  }
}

async function scanFieldsForModelIds(ctx, wantIds) {
  const buckets = new Map()
  const want = new Set(wantIds)
  const pageSize = 1000
  let index = 1
  let total = 0
  let idlePages = 0
  while (want.size > 0) {
    const page = await fetchGetDataPage({
      baseUrl: ctx.baseUrl,
      headers: ctx.headers,
      tableName: 'Base_DataModel_Field',
      pageIndex: index,
      pageSize,
    })
    if (index === 1) total = page.count
    let grew = false
    for (const row of page.items) {
      if (fieldType(row) !== 'datamodel') continue
      const mid = modelFieldId(row)
      if (!wantIds.has(mid)) continue
      const list = buckets.get(mid) ?? []
      const rowId = formalRowId(row)
      if (list.some(item => formalRowId(item) === rowId)) continue
      list.push(row)
      buckets.set(mid, list)
      grew = true
      if (list.length >= FIELD_SATURATION) want.delete(mid)
    }
    idlePages = grew ? 0 : idlePages + 1
    const minRows = [...wantIds].every(id => (buckets.get(id)?.length ?? 0) >= 1)
    if (minRows && idlePages >= 2) break
    if (!page.items.length || index * pageSize >= total) break
    index += 1
  }
  return buckets
}

function extraPkeyNames(detail) {
  const pkeys = [...(detail?.modelFieldIsPKey ?? [])].map(name => String(name).trim()).filter(Boolean)
  return pkeys.filter(name => name !== 'rowid')
}

const args = parseArgs(process.argv.slice(2))
loadSparkEnvFromLocal()
await ensureSparkEnvFromSession()
const ctx = loadSparkHttpContext()
const headers = buildSparkAuthHeaders(ctx)

if (args.refreshDetail) {
  const detailRun = spawnSync(process.execPath, [join(here, 'probe-workflow-formal-pk-detail.mjs')], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit',
    env: process.env,
  })
  if (detailRun.status !== 0) process.exit(detailRun.status ?? 1)
}

const detailByModelId = loadFormalPkDetailByModelId(args.detailPath)
const modelMap = await readWorkflowModelMap({baseUrl: ctx.baseUrl, headers})
const repair = modelMap.formalTablePrimaryKey?.repair ?? []
const {tierB} = partitionFormalPkRepairs(repair, detailByModelId)

if (!tierB.length) {
  process.stdout.write('无 Tier B 缺口，跳过 apply-tier-b。\n')
  process.exit(0)
}

const wantIds = new Set(tierB.map(item => item.modelId))
const fieldBuckets = await scanFieldsForModelIds({baseUrl: ctx.baseUrl, headers}, wantIds)
const {items: allModels} = await collectAllPages({
  baseUrl: ctx.baseUrl,
  headers,
  tableName: 'Base_DataModel',
  pageSize: 500,
  maxRows: 50_000,
})

const planned = []
for (const item of tierB) {
  const detail = detailByModelId.get(item.modelId)
  const extras = extraPkeyNames(detail)
  if (!extras.length) continue
  const fields = fieldBuckets.get(item.modelId) ?? []
  const fieldChanges = []
  for (const name of extras) {
    const source = fields.find(row => text(row, ['Name', 'name']) === name)
    if (!source) {
      fieldChanges.push({fieldName: name, missing: true})
      continue
    }
    if (Number(source.IsPKey) === 0) continue
    fieldChanges.push({
      fieldName: name,
      changed: buildFieldChangedRow(source, {IsPKey: 0}),
    })
  }
  const modelSource = allModels.find(row => formalRowId(row) === item.modelId)
  const designerOnly = classifyDesignerOnly(item, detail)
  const pkBefore = modelSource
    ? String(modelSource.PrimaryKeyFields ?? modelSource.primaryKeyFields ?? '').trim()
    : ''
  planned.push({
    ...item,
    designerOnly,
    extraPkeys: extras,
    fieldChanges,
    modelChange:
      !designerOnly && modelSource && pkBefore !== 'rowid'
        ? buildModelChangedRow(modelSource, 'rowid')
        : undefined,
    missingModelRow: !modelSource,
  })
}

const stamp = todayEvidenceStamp()
const evidencePath = join(root, 'notes', 'evidence', `workflow-formal-pk-tier-b-apply-${stamp}.json`)
const evidence = {
  at: new Date().toISOString(),
  mode: args.apply ? 'apply' : 'dry-run',
  detailPath: args.detailPath,
  planned: planned.map(row => ({
    modelId: row.modelId,
    modelName: row.modelName,
    scenarioKey: row.scenarioKey,
    designerOnly: row.designerOnly,
    extraPkeys: row.extraPkeys,
    fieldPatches: row.fieldChanges.map(f => f.fieldName ?? f.changed?.Name),
    willPatchModel: Boolean(row.modelChange),
  })),
}
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
process.stdout.write(`${evidencePath}\n`)
process.stdout.write(`Tier B 拟处理 ${planned.length} 个模型（dry-run=${!args.apply}）\n`)

if (!args.apply) {
  process.exit(0)
}

const receipts = []
const applyFailures = []

for (const row of planned) {
  const fieldPayload = row.fieldChanges.filter(change => change.changed).map(change => change.changed)
  if (fieldPayload.length) {
    const receipt = await postBatchTableOperate(ctx, 'Base_DataModel_Field', fieldPayload)
    receipts.push({
      step: 'field',
      modelId: row.modelId,
      modelName: row.modelName,
      count: fieldPayload.length,
      ...receipt,
    })
    if (receipt.code !== 200) {
      applyFailures.push({modelId: row.modelId, modelName: row.modelName, step: 'field', ...receipt})
      console.error(`Tier B 字段写回失败 ${row.modelName}: ${receipt.message ?? receipt.code}`)
      continue
    }
  }
  if (row.modelChange) {
    const receipt = await postBatchTableOperate(ctx, 'Base_DataModel', [row.modelChange])
    receipts.push({step: 'model', modelId: row.modelId, modelName: row.modelName, ...receipt})
    if (receipt.code !== 200) {
      applyFailures.push({modelId: row.modelId, modelName: row.modelName, step: 'model', ...receipt})
      console.error(`Tier B 模型写回失败 ${row.modelName}: ${receipt.message ?? receipt.code}`)
    }
  }
}

evidence.applyReceipts = receipts
evidence.applyFailures = applyFailures
evidence.manualRequired = planned
  .filter(row => row.designerOnly)
  .map(row => ({modelId: row.modelId, modelName: row.modelName, reason: 'designerOnly model PrimaryKeyFields'}))
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')

const hadSuccess = receipts.some(row => row.code === 200)
if (applyFailures.length && !hadSuccess) process.exit(1)
process.exit(applyFailures.length ? 1 : 0)