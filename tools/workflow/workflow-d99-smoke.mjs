#!/usr/bin/env node
/**
 * D99 R16 烟测证据：G0、GetStepHistory（须 Code=200）、manualContract、manualSpa 拆分签收。
 */
import {spawnSync} from 'node:child_process'
import {readFileSync, writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {loadSparkEnvFromLocal} from './load-spark-env.mjs'
import {ensureSparkEnvFromSession} from './resolve-spark-session.mjs'
import {
  defaultManualSpa,
  readSpaManualSpa,
  SPA_CHECKLIST_KEYS,
  todayStamp,
} from './workflow-spa-evidence.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const stamp = todayStamp()
const args = new Set(process.argv.slice(2))
const readOnly = args.has('--read-only')
const skipG0 = args.has('--skip-g0')

loadSparkEnvFromLocal()

let sessionSource = 'none'
try {
  const session = await ensureSparkEnvFromSession()
  sessionSource = session.source
} catch (cause) {
  const message = cause instanceof Error ? cause.message : String(cause)
  if (!process.env.SPARK_TOKEN?.trim()) {
    console.error(`自动登录未就绪: ${message}`)
  }
}

const baseUrl = String(process.env.SPARK_BASE_URL ?? '').replace(/\/$/, '')
const token = String(process.env.SPARK_TOKEN ?? '').trim()
const appId = String(process.env.SPARK_APP_ID ?? '').trim()
const sparkReady = Boolean(baseUrl && token && appId)

function missingCredentialReason() {
  const missing = []
  if (!baseUrl) missing.push('SPARK_BASE_URL')
  if (!token) missing.push('SPARK_TOKEN')
  if (!appId) missing.push('SPARK_APP_ID')
  return `missing ${missing.join(' / ')}`
}

function readPublishGate() {
  const probePath = join(root, 'notes', 'evidence', `workflow-g0-probe-${stamp}.json`)
  try {
    const probe = JSON.parse(readFileSync(probePath, 'utf8'))
    return {
      path: `notes/evidence/workflow-g0-probe-${stamp}.json`,
      ready: probe?.publishReady?.g0MayProceed === true,
      mayProceed: probe?.publishReady?.g0MayProceed,
      blockers: Array.isArray(probe?.publishBlockers) ? probe.publishBlockers : [],
    }
  } catch {
    return {path: undefined, ready: undefined, blockers: []}
  }
}

function runG0() {
  if (!sparkReady) {
    return {status: 'blocked', reason: missingCredentialReason()}
  }
  if (skipG0) return {status: 'skipped'}
  const publishGate = readPublishGate()
  if (publishGate.ready !== true) {
    return {
      status: 'blocked',
      reason: `lingmacn publish incomplete: ${(publishGate.blockers.length ? publishGate.blockers : ['run probe-workflow-metadata.mjs or see workflow-g0-probe']).join('; ')}`,
      publishGate: publishGate.path,
    }
  }
  const script = readOnly ? 'read-workflow-model-ids.mjs' : 'run-g0-apply.mjs'
  const result = spawnSync(process.execPath, [join(here, script)], {cwd: root, encoding: 'utf8', env: process.env})
  if (result.status !== 0) {
    return {status: 'fail', stderr: (result.stderr || result.stdout || '').trim().slice(0, 500)}
  }
  try {
    const g0read = join(root, 'notes', 'evidence', `workflow-g0-read-${stamp}.json`)
    const payload = JSON.parse(readFileSync(g0read, 'utf8'))
    const flowModel = payload?.scenarios?.flowModelList?.models?.WFM_FLOW_MODLE
    if (!flowModel) {
      return {status: 'fail', stderr: 'G0 JSON 缺少 WFM_FLOW_MODLE modelId（元数据未回读）'}
    }
  } catch (cause) {
    return {status: 'fail', stderr: cause instanceof Error ? cause.message : String(cause)}
  }
  return {status: 'pass', stdout: (result.stdout || '').trim().slice(0, 300)}
}

function resolveG0Result() {
  if (skipG0) {
    try {
      const g0read = join(root, 'notes', 'evidence', `workflow-g0-read-${stamp}.json`)
      const payload = JSON.parse(readFileSync(g0read, 'utf8'))
      const wfmId = payload?.scenarios?.flowModelList?.models?.WFM_FLOW_MODLE
      const formalPkReady = payload?.formalTablePrimaryKey?.ready === true
      if (wfmId && formalPkReady) {
        return {status: 'pass', reason: 'reuse workflow-g0-read (--skip-g0)'}
      }
      if (wfmId && !formalPkReady) {
        const gapCount = payload?.formalTablePrimaryKey?.repair?.length ?? 0
        return {
          status: 'blocked',
          reason: `formal table PrimaryKeyFields not ready (${gapCount} gaps); see notes/evidence/workflow-lingmacn-formal-pk-repair.md`,
        }
      }
    } catch {
      // 无当日 G0 证据
    }
    return {status: 'skipped'}
  }
  return runG0()
}

function runManualProbe() {
  const result = spawnSync(process.execPath, [join(here, 'workflow-manual-probe.mjs')], {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
  })
  const outPath = join(root, 'notes', 'evidence', `workflow-manual-probe-${stamp}.json`)
  try {
    const payload = JSON.parse(readFileSync(outPath, 'utf8'))
    return {
      exitCode: result.status ?? 1,
      path: `notes/evidence/workflow-manual-probe-${stamp}.json`,
      manualContract: payload.manualContract ?? {},
      stepHistory: payload.live?.stepHistory,
    }
  } catch {
    return {exitCode: result.status ?? 1, path: undefined, manualContract: {}, stderr: (result.stderr || '').slice(0, 300)}
  }
}

function buildGetStepHistoryFromProbe(stepHistory) {
  if (!stepHistory || typeof stepHistory !== 'object') {
    return {status: 'skipped', reason: 'manual-probe 未提供 live.stepHistory'}
  }
  if (stepHistory.status === 'pass' && stepHistory.code === 200) {
    return {
      status: 'pass',
      code: 200,
      wfId: stepHistory.wfId,
      stepId: stepHistory.stepId,
      source: stepHistory.source,
      resultShape: stepHistory.resultShape,
    }
  }
  if (stepHistory.status === 'skipped') {
    return {status: 'documented', reason: stepHistory.reason}
  }
  return {
    status: 'fail',
    code: stepHistory.code,
    message: stepHistory.message ?? stepHistory.reason,
    wfId: stepHistory.wfId,
    stepId: stepHistory.stepId,
  }
}

const g0Result = resolveG0Result()
const manualProbe = sparkReady ? runManualProbe() : {exitCode: 1, manualContract: {}, reason: 'missing credentials'}
const spaEvidence = readSpaManualSpa(stamp)

const automated = {
  g0: g0Result,
  getStepHistory: buildGetStepHistoryFromProbe(manualProbe.stepHistory),
  probedAt: new Date().toISOString(),
  g0ProbeFile: `notes/evidence/workflow-g0-probe-${stamp}.json`,
  publishGate: readPublishGate(),
}

const probePath = join(root, 'notes', 'evidence', `workflow-d99-probe-${stamp}.json`)
writeFileSync(probePath, `${JSON.stringify(automated, null, 2)}\n`, 'utf8')

const smokePath = join(root, 'notes', 'evidence', `workflow-smoke-r16-${stamp}.json`)
let priorGates = {typecheck: 'pending', workflowVitest: 'pending', verifyRules: 'pending'}
let priorToolingDelivered = []

function mergePriorGates(prior) {
  if (prior?.gates && typeof prior.gates === 'object') {
    priorGates = {...priorGates, ...prior.gates}
  }
  if (Array.isArray(prior?.toolingDelivered)) {
    priorToolingDelivered = [...prior.toolingDelivered]
  }
}

try {
  mergePriorGates(JSON.parse(readFileSync(smokePath, 'utf8')))
} catch {
  // 新建
}

const manualSpa = {...defaultManualSpa(), ...spaEvidence.manualSpa}
const manualSpaNotes = {...(spaEvidence.payload?.manualSpaNotes ?? {})}

const signoffBlockers = []
if (!sparkReady) signoffBlockers.push(`automated: ${missingCredentialReason()}`)
if (readPublishGate().ready !== true) {
  signoffBlockers.push(`publish: ${(readPublishGate().blockers.length ? readPublishGate().blockers : ['incomplete']).join('; ')}`)
}
if (automated.g0.status !== 'pass') signoffBlockers.push(`automated.g0: ${automated.g0.status}`)
const hist = automated.getStepHistory
if (hist.status !== 'pass' && hist.status !== 'documented') {
  signoffBlockers.push(`automated.getStepHistory: ${hist.status}${hist.reason ? ` (${hist.reason})` : ''}`)
}
if (SPA_CHECKLIST_KEYS.some(key => manualSpa[key] === 'pending')) {
  signoffBlockers.push('manualSpa: D99 四格未验收')
}
if (SPA_CHECKLIST_KEYS.some(key => manualSpa[key] === 'fail')) {
  signoffBlockers.push(...SPA_CHECKLIST_KEYS.filter(key => manualSpa[key] === 'fail').map(key => `manualSpa:${key}`))
}

const gatesAllPass =
  priorGates.typecheck === 'pass'
  && priorGates.workflowVitest === 'pass'
  && priorGates.verifyRules === 'pass'

if (!gatesAllPass) {
  signoffBlockers.push(
    `gates: typecheck=${priorGates.typecheck} workflowVitest=${priorGates.workflowVitest} verifyRules=${priorGates.verifyRules}`,
  )
}

let signoffStatus = 'blocked'
if (
  sparkReady
  && automated.g0.status === 'pass'
  && hist.status === 'pass'
  && gatesAllPass
  && SPA_CHECKLIST_KEYS.every(key => manualSpa[key] === 'pass')
) {
  signoffStatus = 'ready'
  signoffBlockers.length = 0
} else if (SPA_CHECKLIST_KEYS.some(key => manualSpa[key] === 'pending')) {
  signoffStatus = 'awaiting-spa'
}

const smoke = {
  round: 16,
  branch: 'codex/spark-data-s1-command-safety',
  automated,
  probeFile: `notes/evidence/workflow-d99-probe-${stamp}.json`,
  manualChecklist: 'notes/evidence/workflow-d99-manual-checklist.md',
  publishChecklist: 'notes/evidence/workflow-lingmacn-publish-checklist.md',
  publishBlockers: readPublishGate().blockers,
  manualContract: manualProbe.manualContract ?? {},
  manualContractFile: manualProbe.path,
  manualSpa,
  manualSpaNotes,
  spaEvidenceFile: spaEvidence.payload ? `notes/evidence/workflow-spa-smoke-${stamp}.json` : undefined,
  gates: priorGates,
  toolingDelivered: priorToolingDelivered,
  envReady: sparkReady,
  sessionSource,
  envPartial: Boolean(baseUrl && !sparkReady),
  g0EvidenceHint: `notes/evidence/workflow-g0-read-${stamp}.json`,
  signoffStatus,
  signoffBlockers,
}

writeFileSync(smokePath, `${JSON.stringify(smoke, null, 2)}\n`, 'utf8')
console.log(`已写入 ${probePath}`)
console.log(`已更新 ${smokePath} signoff=${signoffStatus}`)

const failed =
  automated.g0.status === 'fail'
  || automated.g0.status === 'blocked'
  || hist.status === 'fail'
  || signoffStatus === 'blocked'
process.exit(failed && !readOnly ? 1 : 0)