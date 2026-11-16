#!/usr/bin/env node
/**
 * Tier A：BatchTableOperate 写回 Base_DataModel.PrimaryKeyFields=rowid（默认 dry-run）。
 */
import {spawnSync} from 'node:child_process'
import {writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {collectAllPages} from './get-data-page.mjs'
import {loadSparkEnvFromLocal} from './load-spark-env.mjs'
import {ensureSparkEnvFromSession} from './resolve-spark-session.mjs'
import {buildSparkAuthHeaders, loadSparkHttpContext} from './spark-http-headers.mjs'
import {
  formalRowId,
  readWorkflowModelMap,
} from './workflow-metadata-models.mjs'
import {buildModelChangedRow, postBatchTableOperate} from './workflow-formal-pk-batch.mjs'
import {
  classifyDesignerOnly,
  loadFormalPkDetailByModelId,
  partitionFormalPkRepairs,
  resolveFormalPkDetailEvidencePath,
  todayEvidenceStamp,
} from './workflow-formal-pk-tiers.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')

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

async function readPrimaryKeyFields(ctx, modelId, headers) {
  const {items} = await collectAllPages({
    baseUrl: ctx.baseUrl,
    headers,
    tableName: 'Base_DataModel',
    pageSize: 500,
    maxRows: 50_000,
  })
  const hit = items.find(row => formalRowId(row) === modelId)
  return hit ? String(hit.PrimaryKeyFields ?? hit.primaryKeyFields ?? '').trim() : ''
}

async function verifyTierAReadback(ctx, tierA, headers) {
  const checks = []
  for (const item of tierA) {
    const pk = await readPrimaryKeyFields(ctx, item.modelId, headers)
    checks.push({
      modelId: item.modelId,
      modelName: item.modelName,
      primaryKeyFields: pk,
      ok: pk === 'rowid',
    })
  }
  return checks
}

function runProbeFormalPk() {
  return spawnSync(process.execPath, [join(here, 'probe-workflow-formal-pk.mjs')], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit',
    env: process.env,
  }).status ?? 1
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
const {tierA: tierARaw, tierB, tierC} = partitionFormalPkRepairs(repair, detailByModelId)
const tierA = tierARaw.filter(item => !classifyDesignerOnly(item, detailByModelId.get(item.modelId)))
const tierASkippedDesigner = tierARaw.filter(item => classifyDesignerOnly(item, detailByModelId.get(item.modelId)))

if (!repair.length) {
  process.stdout.write('formal pk repair 清单为空，跳过 apply。\n')
  process.exit(0)
}

if (!tierA.length && !tierASkippedDesigner.length) {
  console.error('无 Tier A 可 API 写回；请先处理 Tier B/C 或刷新 detail。')
  console.error(`Tier B (${tierB.length}): ${tierB.map(r => r.modelName).join(', ')}`)
  console.error(`Tier C (${tierC.length}): ${tierC.map(r => r.modelName).join(', ')}`)
  process.exit(2)
}
if (!tierA.length && tierASkippedDesigner.length) {
  process.stdout.write(`Tier A 均属 designerOnly（${tierASkippedDesigner.map(r => r.modelName).join(', ')}），跳过 API。\n`)
  process.exit(args.apply ? runProbeFormalPk() : 0)
}

const {items: allModels} = await collectAllPages({
  baseUrl: ctx.baseUrl,
  headers,
  tableName: 'Base_DataModel',
  pageSize: 500,
  maxRows: 50_000,
})

const planned = []
const missingRow = []
for (const item of tierA) {
  const source = allModels.find(row => formalRowId(row) === item.modelId)
  if (!source) {
    missingRow.push(item.modelId)
    continue
  }
  const before = String(source.PrimaryKeyFields ?? source.primaryKeyFields ?? '').trim()
  if (before === 'rowid') continue
  const changed = buildModelChangedRow(source, 'rowid')
  planned.push({
    ...item,
    beforePrimaryKeyFields: before,
    changed,
  })
}

if (missingRow.length) {
  console.error(`未在 Base_DataModel 扫描中定位 modelId: ${missingRow.join(', ')}`)
  process.exit(1)
}

if (!planned.length) {
  process.stdout.write('Tier A 已全部为 rowid，无需写回。\n')
  process.exit(args.apply ? runProbeFormalPk() : 0)
}

const stamp = todayEvidenceStamp()
const evidencePath = join(root, 'notes', 'evidence', `workflow-formal-pk-tier-a-apply-${stamp}.json`)
const evidence = {
  at: new Date().toISOString(),
  mode: args.apply ? 'apply' : 'dry-run',
  detailPath: args.detailPath,
  tierCounts: {A: tierA.length, A_designerOnly: tierASkippedDesigner.length, B: tierB.length, C: tierC.length},
  designerOnlySkipped: tierASkippedDesigner.map(r => ({modelId: r.modelId, modelName: r.modelName})),
  planned: planned.map(row => ({
    modelId: row.modelId,
    modelName: row.modelName,
    scenarioKey: row.scenarioKey,
    beforePrimaryKeyFields: row.beforePrimaryKeyFields,
    afterPrimaryKeyFields: 'rowid',
  })),
  tierB: tierB.map(r => ({modelId: r.modelId, modelName: r.modelName, repairHint: r.repairHint})),
  tierC: tierC.map(r => ({modelId: r.modelId, modelName: r.modelName, repairHint: r.repairHint})),
}
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
process.stdout.write(`${evidencePath}\n`)
process.stdout.write(`Tier A 拟写回 ${planned.length} 条（dry-run=${!args.apply}）\n`)

if (!args.apply) {
  process.exit(0)
}

const receipts = []
const applyFailures = []
for (const row of planned) {
  const receipt = await postBatchTableOperate(ctx, 'Base_DataModel', [row.changed])
  receipts.push({modelId: row.modelId, modelName: row.modelName, scenarioId: row.scenarioId, ...receipt})
  if (receipt.code !== 200) {
    applyFailures.push({...row, receipt})
    console.error(
      `BatchTableOperate 失败 model=${row.modelName}: Code=${receipt.code} ${receipt.message ?? ''}（A5BAD 等空间可能须设计器手工）`,
    )
  }
}
evidence.applyReceipts = receipts
evidence.manualRequired = [
  ...tierASkippedDesigner.map(r => ({modelId: r.modelId, modelName: r.modelName, reason: 'designerOnly'})),
  ...applyFailures.map(row => ({
    modelId: row.modelId,
    modelName: row.modelName,
    reason: 'api_failed',
  })),
]
evidence.applyFailures = applyFailures.map(row => ({
  modelId: row.modelId,
  modelName: row.modelName,
  scenarioKey: row.scenarioKey,
  code: row.receipt.code,
  message: row.receipt.message,
}))
if (applyFailures.length) {
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
}
const succeededIds = new Set(
  receipts.filter(row => row.code === 200).map(row => row.modelId),
)
const readback = await verifyTierAReadback(
  ctx,
  tierA.filter(item => succeededIds.has(item.modelId)),
  headers,
)
evidence.readback = readback
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')

const failedReadback = readback.filter(row => !row.ok)
if (failedReadback.length) {
  console.error(`写后回读未全部为 rowid: ${JSON.stringify(failedReadback)}`)
  process.exit(1)
}

const probeStatus = runProbeFormalPk()
const hadSuccess = receipts.some(row => row.code === 200)
if (applyFailures.length && !hadSuccess) process.exit(1)
if (applyFailures.length) process.exit(1)
process.exit(probeStatus)