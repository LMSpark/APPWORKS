#!/usr/bin/env node
/**
 * 只读拉取 workflow 场景 WFM_* 正式 modelId，输出 JSON 供 pagedata 粘贴。
 * 用法：SPARK_BASE_URL=http://localhost:5273 SPARK_TOKEN=... SPARK_APP_ID=... node tools/workflow/read-workflow-model-ids.mjs
 */
const baseUrl = String(process.env.SPARK_BASE_URL ?? '').replace(/\/$/, '')
const token = String(process.env.SPARK_TOKEN ?? '').trim()
const appId = String(process.env.SPARK_APP_ID ?? '').trim()

const scenarios = [
  {key: 'flowModelList', scenarioId: '87F0EF6AD1B64D67FFE597E7E3285994'},
  {key: 'flowDesign', scenarioId: '6E462C4A39EE0D96F4D1A28FFE887C89'},
]
const modelNames = ['WFM_FLOW_MODLE', 'WFM_FLOW_NODE', 'WFM_NODE_REALATION']

if (!baseUrl || !token || !appId) {
  console.error('缺少 SPARK_BASE_URL / SPARK_TOKEN / SPARK_APP_ID')
  process.exit(1)
}

async function postJson(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-AppId': appId,
    },
    body: JSON.stringify(body),
  })
  const json = await response.json()
  if (!response.ok || (typeof json?.Code === 'number' && json.Code !== 200)) {
    throw new Error(json?.Message ?? `HTTP ${response.status}`)
  }
  return json.Result ?? json
}

async function readModels(scenarioId) {
  const payload = await postJson('/api/DataSpaceDesign/ReadModelBatch', {dataSpaceId: scenarioId})
  const models = Array.isArray(payload) ? payload : payload?.models
  if (!Array.isArray(models)) throw new Error(`场景 ${scenarioId} 未返回模型数组`)
  const picked = {}
  for (const name of modelNames) {
    const hit = models.find(item => String(item?.Name ?? item?.name ?? '').trim() === name)
    const modelId = String(hit?.rowid ?? hit?.RowID ?? hit?.modelId ?? '').trim()
    if (modelId) picked[name] = modelId
  }
  return picked
}

async function main() {
  const output = {readAt: new Date().toISOString(), scenarios: {}}
  for (const entry of scenarios) {
    output.scenarios[entry.key] = {scenarioId: entry.scenarioId, models: await readModels(entry.scenarioId)}
  }
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})