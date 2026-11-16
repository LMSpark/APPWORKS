/**
 * workflow 烟测 HTTP 头：Bearer + D99 + 元数据设计 x-FormKey。
 */
import {loadSparkEnvFromLocal} from './load-spark-env.mjs'

export const WORKFLOW_METADATA_DESIGN_FORM_KEY = '8D1AB14DD8277F3E7017CD38F77B09FD'

export function loadSparkHttpContext() {
  loadSparkEnvFromLocal()
  const baseUrl = String(process.env.SPARK_BASE_URL ?? '').replace(/\/$/, '')
  const token = String(process.env.SPARK_TOKEN ?? '').trim()
  const appId = String(process.env.SPARK_APP_ID ?? '').trim()
  const tenantId = String(process.env.SPARK_TENANT_NAME ?? 'NewApp').trim()
  return {baseUrl, token, appId, tenantId}
}

export function buildSparkAuthHeaders(context = loadSparkHttpContext()) {
  const {token, appId, tenantId} = context
  if (!token || !appId) throw new Error('missing SPARK_TOKEN or SPARK_APP_ID')
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'X-AppId': appId,
    'tenant-id': tenantId,
    'x-FormKey': WORKFLOW_METADATA_DESIGN_FORM_KEY,
  }
}