#!/usr/bin/env node
/**
 * R16 闭环：probe → G0 apply → 定向 vitest → manual-probe → smoke（须 manualSpa 全 pass 才 exit 0）。
 */
import {spawnSync} from 'node:child_process'
import {readFileSync, writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {SPA_CHECKLIST_KEYS, todayStamp} from './workflow-spa-evidence.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')

function runNode(script, args = []) {
  const result = spawnSync(process.execPath, [join(here, script), ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit',
    env: process.env,
  })
  return result.status ?? 1
}

function runPnpm(command, args = []) {
  const result = spawnSync('pnpm', [command, ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit',
    env: process.env,
    shell: true,
  })
  return result.status ?? 1
}

const probe = runNode('probe-workflow-metadata.mjs')
if (probe !== 0) process.exit(probe)

const g0 = runNode('run-g0-apply.mjs')
if (g0 !== 0) process.exit(g0)

const vitest = runPnpm('exec', [
  'vitest',
  'run',
  'tests/scripts/workflow/workflow-get-data-page.test.ts',
  'tests/scripts/workflow/workflow-formal-pk-tiers.test.ts',
  'tests/scripts/workflow/workflow-formal-pk-tier-b.test.ts',
  'tests/scripts/workflow/workflow-formal-pk-persist-diagnose.test.ts',
  'tests/runtime/page/structured-config/workflow/workflow-pagedata-binding.test.ts',
  'tests/runtime/page/structured-config/workflow/flow-workbench-pagedata-contract.test.ts',
  'tests/runtime/page/structured-config/workflow/flow-design',
])
if (vitest !== 0) process.exit(vitest)

if (runNode('workflow-manual-probe.mjs') !== 0) process.exit(1)

const typecheck = runPnpm('run', ['typecheck'])
if (typecheck !== 0) process.exit(typecheck)

const verifyRules = runPnpm('run', ['verify:rules'])
if (verifyRules !== 0) process.exit(verifyRules)

const smoke = runNode('workflow-d99-smoke.mjs', ['--skip-g0'])
if (smoke !== 0) process.exit(smoke)

const stamp = todayStamp()
const smokePath = join(root, 'notes', 'evidence', `workflow-smoke-r16-${stamp}.json`)
try {
  const prior = JSON.parse(readFileSync(smokePath, 'utf8'))
  prior.gates = {
    typecheck: typecheck === 0 ? 'pass' : 'fail',
    workflowVitest: vitest === 0 ? 'pass' : 'fail',
    verifyRules: verifyRules === 0 ? 'pass' : 'fail',
  }
  writeFileSync(smokePath, `${JSON.stringify(prior, null, 2)}\n`, 'utf8')
} catch {
  // smoke 已写；门禁仅记于 exit 路径
}
try {
  const payload = JSON.parse(readFileSync(smokePath, 'utf8'))
  const manualSpa = payload.manualSpa ?? {}
  const spaPending = SPA_CHECKLIST_KEYS.some(key => manualSpa[key] !== 'pass')
  const signoff = payload.signoffStatus
  if (spaPending || signoff !== 'ready') {
    console.error(`R16 未签收: signoff=${signoff} manualSpa=${JSON.stringify(manualSpa)}`)
    process.exit(1)
  }
} catch (cause) {
  console.error(cause instanceof Error ? cause.message : String(cause))
  process.exit(1)
}

process.exit(0)