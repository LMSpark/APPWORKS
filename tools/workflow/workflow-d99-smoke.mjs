#!/usr/bin/env node
/**
 * D99 半自动烟测：可选 G0 apply、GetStepHistory 只读探测，输出 evidence。
 * 用法：node tools/workflow/workflow-d99-smoke.mjs [--read-only] [--skip-g0]
 */
import {spawnSync} from 'node:child_process'
import {writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {loadSparkEnvFromLocal} from './load-spark-env.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
const args = new Set(process.argv.slice(2))
const readOnly = args.has('--read-only')
const skipG0 = args.has('--skip-g0')

loadSparkEnvFromLocal()

const baseUrl = String(process.env.SPARK_BASE_URL ?? '').replace(/\/$/, '')
const token = String(process.env.SPARK_TOKEN ?? '').trim()
const appId = String(process.env.SPARK_APP_ID ?? '').trim()
const wfId = String(process.env.WORKFLOW_SMOKE_WFID ?? '').trim()

const sparkReady = Boolean(baseUrl && token && appId)

function runG0() {
  if (!sparkReady) {
    return {status: 'blocked', reason: 'missing SPARK_BASE_URL / SPARK_TOKEN / SPARK_APP_ID'}
  }
  if (skipG0) return {status: 'skipped'}
  const script = readOnly ? 'read-workflow-model-ids.mjs' : 'run-g0-apply.mjs'
  const result = spawnSync(process.execPath, [join(here, script)], {cwd: root, encoding: 'utf8', env: process.env})
  if (result.status !== 0) {
    return {status: 'fail', stderr: (result.stderr || result.stdout || '').trim().slice(0, 500)}
  }
  return {status: 'pass', stdout: (result.stdout || '').trim().slice(0, 300)}
}

async function probeGetStepHistory() {
  if (!sparkReady) {
    return {status: 'blocked', reason: 'missing SPARK credentials'}
  }
  if (!wfId) {
    return {status: 'skipped', reason: 'missing WORKFLOW_SMOKE_WFID'}
  }
  const url = new URL(`${baseUrl}/api/Flow/GetStepHistory`)
  url.searchParams.set('wfId', wfId)
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-AppId': appId,
      },
    })
    const json = await response.json()
    const result = json?.Result ?? json?.result
    return {
      status: response.ok && (json?.Code === 200 || json?.Code === undefined) ? 'pass' : 'fail',
      httpStatus: response.status,
      code: json?.Code,
      message: typeof json?.Message === 'string' ? json.Message.slice(0, 200) : undefined,
      resultShape: Array.isArray(result) ? `array(${result.length})` : typeof result,
      queryKey: 'wfId',
      wfId,
    }
  } catch (cause) {
    return {status: 'fail', error: cause instanceof Error ? cause.message : String(cause), wfId}
  }
}

const automated = {
  g0: runG0(),
  getStepHistory: await probeGetStepHistory(),
  probedAt: new Date().toISOString(),
}

const probePath = join(root, 'notes', 'evidence', `workflow-d99-probe-${stamp}.json`)
writeFileSync(probePath, `${JSON.stringify(automated, null, 2)}\n`, 'utf8')

const smokePath = join(root, 'notes', 'evidence', 'workflow-smoke-r15-20261115.json')
const smoke = {
  round: 15,
  branch: 'codex/spark-data-s1-command-safety',
  automated,
  probeFile: `notes/evidence/workflow-d99-probe-${stamp}.json`,
  manual: {
    workbenchFourTabs: 'pending',
    designNodeAuthSaveReopen: 'pending',
    runSubmitOrBack: 'pending',
    detailToRunPage: 'pending',
  },
  gates: {typecheck: 'pending', workflowVitest: 'pending', verifyRules: 'pending'},
}

writeFileSync(smokePath, `${JSON.stringify(smoke, null, 2)}\n`, 'utf8')
console.log(`已写入 ${probePath}`)
console.log(`已更新 ${smokePath}`)

const failed = [automated.g0, automated.getStepHistory].some(
  item => item.status === 'fail' || item.status === 'blocked',
)
process.exit(failed && !readOnly ? 1 : 0)