#!/usr/bin/env node
/**
 * PK 持久化诊断：连接指纹 + 缺口行快照 + 重复模型扫描。
 */
import {writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {collectAllPages} from './get-data-page.mjs'
import {loadSparkEnvFromLocal} from './load-spark-env.mjs'
import {ensureSparkEnvFromSession} from './resolve-spark-session.mjs'
import {buildSparkAuthHeaders, loadSparkHttpContext} from './spark-http-headers.mjs'
import {readWorkflowModelMap} from './workflow-metadata-models.mjs'
import {
  buildPersistDiagnoseReport,
  sparkConnectionFingerprint,
} from './workflow-formal-pk-persist-diagnose.mjs'
import {todayEvidenceStamp} from './workflow-formal-pk-tiers.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

loadSparkEnvFromLocal()
await ensureSparkEnvFromSession()

const ctx = loadSparkHttpContext()
const fingerprint = sparkConnectionFingerprint()
process.stdout.write(
  `SPARK_BASE_URL=${fingerprint.baseUrl}\nSPARK_APP_ID=${fingerprint.appId}\ntenant-id=${fingerprint.tenantId}\nSPARK_TOKEN=${fingerprint.tokenPresent ? `set(${fingerprint.tokenLength})` : 'missing'}\n`,
)

const headers = buildSparkAuthHeaders(ctx)
const modelMap = await readWorkflowModelMap({baseUrl: ctx.baseUrl, headers})
const repair = modelMap.formalTablePrimaryKey?.repair ?? []
const {items} = await collectAllPages({
  baseUrl: ctx.baseUrl,
  headers,
  tableName: 'Base_DataModel',
  pageSize: 500,
  maxRows: 50_000,
})

const report = buildPersistDiagnoseReport(repair, items, fingerprint)
const stamp = todayEvidenceStamp()
const outPath = join(root, 'notes', 'evidence', `workflow-formal-pk-persist-diagnose-${stamp}.json`)
writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

for (const target of report.targets) {
  const pk = target.snapshot?.primaryKeyFields || '(missing row)'
  process.stdout.write(`${target.modelName}\t${target.modelId}\tPK=${pk}\n`)
}
if (report.duplicateNameInSpace.length) {
  process.stderr.write(`警告：${report.duplicateNameInSpace.length} 组重复 Name@dataSetId，见 ${outPath}\n`)
}
process.stdout.write(`${outPath}\n`)
process.exit(repair.length ? 1 : 0)