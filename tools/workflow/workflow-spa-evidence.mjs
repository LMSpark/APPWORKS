/**
 * R16 SPA 四格证据读写与合并（浏览器烟测专用，不写入 manualContract）。
 */
import {existsSync, readFileSync, readdirSync, writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

export const SPA_CHECKLIST_KEYS = [
  'workbenchFourTabs',
  'designNodeAuthSaveReopen',
  'runSubmitOrBack',
  'detailToRunPage',
]

export function defaultManualSpa() {
  return Object.fromEntries(SPA_CHECKLIST_KEYS.map(key => [key, 'pending']))
}

/**
 * @param {string} [stamp] YYYYMMDD；缺省时取 evidence 目录最新 workflow-spa-smoke-*.json
 */
export function resolveSpaEvidencePath(stamp) {
  const dir = join(root, 'notes', 'evidence')
  if (stamp) return join(dir, `workflow-spa-smoke-${stamp}.json`)
  const files = readdirSync(dir)
    .filter(name => /^workflow-spa-smoke-\d{8}\.json$/.test(name))
    .sort()
  if (!files.length) return join(dir, `workflow-spa-smoke-${todayStamp()}.json`)
  return join(dir, files.at(-1))
}

export function todayStamp() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '')
}

export function readSpaEvidence(stamp) {
  const path = resolveSpaEvidencePath(stamp)
  if (!existsSync(path)) {
    return {path, payload: undefined}
  }
  try {
    return {path, payload: JSON.parse(readFileSync(path, 'utf8'))}
  } catch {
    return {path, payload: undefined}
  }
}

export function readSpaManualSpa(stamp) {
  const {payload} = readSpaEvidence(stamp)
  const manualSpa = {...defaultManualSpa(), ...(payload?.manualSpa ?? {})}
  return {manualSpa, networkSamples: payload?.networkSamples ?? {}, payload}
}

export function readSpaStepHistorySample(stamp) {
  const {payload} = readSpaEvidence(stamp)
  const sample = payload?.networkSamples?.getStepHistory
  if (!sample || typeof sample !== 'object') return undefined
  const wfId = String(sample.wfId ?? sample.wfid ?? '').trim()
  const stepId = String(sample.stepId ?? sample.StepID ?? sample.curStepID ?? '').trim()
  const code = sample.code ?? sample.Code
  if (!wfId || !stepId) return undefined
  return {wfId, stepId, code, source: 'workflow-spa-smoke'}
}

export function writeSpaEvidence(patch, stamp = todayStamp()) {
  const path = join(root, 'notes', 'evidence', `workflow-spa-smoke-${stamp}.json`)
  const prior = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {}
  const payload = {
    round: 16,
    probedAt: new Date().toISOString(),
    devBaseUrl: patch.devBaseUrl ?? prior.devBaseUrl ?? 'http://127.0.0.1:5273',
    appId: patch.appId ?? prior.appId,
    manualSpa: {...defaultManualSpa(), ...(prior.manualSpa ?? {}), ...(patch.manualSpa ?? {})},
    manualSpaNotes: {...(prior.manualSpaNotes ?? {}), ...(patch.manualSpaNotes ?? {})},
    networkSamples: {...(prior.networkSamples ?? {}), ...(patch.networkSamples ?? {})},
    steps: patch.steps ?? prior.steps ?? [],
  }
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  return {path, payload}
}