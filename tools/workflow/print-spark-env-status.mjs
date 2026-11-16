#!/usr/bin/env node
/**
 * 不打印密钥内容，只报告 G0/D99 烟测凭证是否就绪。
 */
import {loadSparkEnvFromLocal} from './load-spark-env.mjs'
import {ensureSparkEnvFromSession} from './resolve-spark-session.mjs'

loadSparkEnvFromLocal()
try {
  await ensureSparkEnvFromSession()
} catch {
  // 仅报告状态，不抛错
}

const baseUrl = String(process.env.SPARK_BASE_URL ?? '').trim()
const token = String(process.env.SPARK_TOKEN ?? '').trim()
const appId = String(process.env.SPARK_APP_ID ?? '').trim()
const wfId = String(process.env.WORKFLOW_SMOKE_WFID ?? '').trim()
const gateway = String(process.env.LOWCODE_GATEWAY_URL ?? '').trim()

const lines = [
  `LOWCODE_GATEWAY_URL: ${gateway ? 'set' : 'missing'}`,
  `SPARK_BASE_URL: ${baseUrl ? 'set' : 'missing'}`,
  `SPARK_TOKEN: ${token ? `set (${token.length} chars)` : 'missing'}`,
  `SPARK_APP_ID: ${appId ? 'set' : 'missing'}`,
  `WORKFLOW_SMOKE_WFID: ${wfId ? 'set' : 'optional/missing'}`,
  '',
  'G0 ready: ' + (baseUrl && token && appId ? 'yes' : 'no'),
]

if (!token || !appId) {
  lines.push(
    '',
    '.env.local needs two additional lines (gitignored); see .env.local.example.',
    '  SPARK_TOKEN=<Bearer token from logged-in SPA Network request>',
    '  SPARK_APP_ID=D99A1DCE9894698799101EFD70F8FC76',
    'Then: node tools/workflow/workflow-d99-smoke.mjs',
  )
}

process.stdout.write(`${lines.join('\n')}\n`)
process.exit(baseUrl && token && appId ? 0 : 1)