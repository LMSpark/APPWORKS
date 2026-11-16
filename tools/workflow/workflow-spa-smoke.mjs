#!/usr/bin/env node
/**
 * 写入 / 合并 R16 SPA 四格证据（供浏览器烟测或 --json 导入）。
 * 用法：
 *   node tools/workflow/workflow-spa-smoke.mjs --json path/to/report.json
 *   node tools/workflow/workflow-spa-smoke.mjs --set workbenchFourTabs=pass --note "..."
 */
import {readFileSync} from 'node:fs'
import {
  SPA_CHECKLIST_KEYS,
  todayStamp,
  writeSpaEvidence,
} from './workflow-spa-evidence.mjs'

const args = process.argv.slice(2)

function parseAssignments() {
  const manualSpa = {}
  const manualSpaNotes = {}
  let jsonPath
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]
    if (token === '--json' && args[index + 1]) {
      jsonPath = args[index + 1]
      index += 1
      continue
    }
    if (token === '--note' && args[index + 1]) {
      const text = args[index + 1]
      const key = args.find(item => item.startsWith('--set ') || item.includes('='))
      index += 1
      if (key) manualSpaNotes[key.replace('--set ', '')] = text
      continue
    }
    if (token.startsWith('--set ') || token.includes('=')) {
      const [rawKey, rawValue] = token.replace('--set ', '').split('=')
      const key = rawKey.trim()
      const value = String(rawValue ?? '').trim()
      if (SPA_CHECKLIST_KEYS.includes(key) && (value === 'pass' || value === 'fail' || value === 'pending')) {
        manualSpa[key] = value
      }
    }
  }
  return {jsonPath, manualSpa, manualSpaNotes}
}

const {jsonPath, manualSpa, manualSpaNotes} = parseAssignments()
let patch = {manualSpa, manualSpaNotes, probedAt: new Date().toISOString()}

if (jsonPath) {
  const external = JSON.parse(readFileSync(jsonPath, 'utf8'))
  patch = {
    ...external,
    manualSpa: {...manualSpa, ...(external.manualSpa ?? {})},
    manualSpaNotes: {...manualSpaNotes, ...(external.manualSpaNotes ?? {})},
    networkSamples: external.networkSamples ?? {},
    steps: external.steps ?? [],
  }
}

const stamp = todayStamp()
const {path, payload} = writeSpaEvidence(patch, stamp)
process.stdout.write(`${path}\n${JSON.stringify(payload, null, 2)}\n`)

const failed = SPA_CHECKLIST_KEYS.some(key => payload.manualSpa?.[key] === 'fail')
const pending = SPA_CHECKLIST_KEYS.some(key => payload.manualSpa?.[key] === 'pending')
process.exit(failed ? 1 : pending ? 2 : 0)