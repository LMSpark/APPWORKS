#!/usr/bin/env node
/**
 * 只读拉取 workflow 场景 WFM_* 正式 modelId，输出 JSON 供 pagedata 粘贴。
 */
import {loadSparkEnvFromLocal} from './load-spark-env.mjs'
import {ensureSparkEnvFromSession} from './resolve-spark-session.mjs'
import {buildSparkAuthHeaders, loadSparkHttpContext, WORKFLOW_METADATA_DESIGN_FORM_KEY} from './spark-http-headers.mjs'
import {listMissingModels, readWorkflowModelMap} from './workflow-metadata-models.mjs'

loadSparkEnvFromLocal()
await ensureSparkEnvFromSession()

const {baseUrl, token, appId} = loadSparkHttpContext()

if (!baseUrl || !token || !appId) {
  console.error('缺少 SPARK_BASE_URL / SPARK_TOKEN / SPARK_APP_ID')
  process.exit(1)
}

async function main() {
  const output = await readWorkflowModelMap({baseUrl, headers: buildSparkAuthHeaders()})
  const missing = listMissingModels(output)
  if (missing.length) {
    throw new Error(`实服未返回 modelId: ${missing.join(', ')}（元数据 Base_DataModel 缺登记或 dataSetId 不一致）`)
  }
  output.readAt = new Date().toISOString()
  output.designFormKey = WORKFLOW_METADATA_DESIGN_FORM_KEY
  output.transport = 'DataOperation/GetData+pagedScan'
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})