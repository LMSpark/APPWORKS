#!/usr/bin/env node
/**
 * R16 收口：formal-pk probe → Tier B/A apply → metadata → G0 → close-loop。
 */
import {spawnSync} from 'node:child_process'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {loadSparkEnvFromLocal} from './load-spark-env.mjs'
import {ensureSparkEnvFromSession} from './resolve-spark-session.mjs'
import {buildSparkAuthHeaders, loadSparkHttpContext} from './spark-http-headers.mjs'
import {readWorkflowModelMap} from './workflow-metadata-models.mjs'
import {writePkRepairChecklistEvidence} from './workflow-formal-pk-checklist.mjs'
import {loadFormalPkDetailByModelId, resolveFormalPkDetailEvidencePath} from './workflow-formal-pk-tiers.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')

function runNode(script, nodeArgs = []) {
  const result = spawnSync(process.execPath, [join(here, script), ...nodeArgs], {
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

function parseArgs(argv) {
  return {
    applyTierA: argv.includes('--apply-tier-a'),
    applyTierB: argv.includes('--apply-tier-b'),
    skipSpa: argv.includes('--skip-spa'),
    refreshDetail: argv.includes('--refresh-detail'),
    printChecklist: argv.includes('--print-checklist'),
    pkOnly: argv.includes('--pk-only'),
    diagnosePk: argv.includes('--diagnose-pk'),
    continueOnPkBlock: argv.includes('--continue-on-pk-block'),
  }
}

async function emitManualChecklist(applyFailureModelIds = []) {
  const ctx = loadSparkHttpContext()
  const headers = buildSparkAuthHeaders(ctx)
  const detailPath = resolveFormalPkDetailEvidencePath()
  const detailByModelId = loadFormalPkDetailByModelId(detailPath)
  const modelMap = await readWorkflowModelMap({baseUrl: ctx.baseUrl, headers})
  const repair = modelMap.formalTablePrimaryKey?.repair ?? []
  const {mdPath, jsonPath} = writePkRepairChecklistEvidence(repair, detailByModelId, {applyFailureModelIds})
  process.stderr.write(`\n手工清单: ${mdPath}\nJSON: ${jsonPath}\n`)
  return repair.length
}

function runContinueOnPkBlockPipeline() {
  process.stdout.write('\n=== --continue-on-pk-block：PK 未就绪，仍跑仓内烟测 ===\n')
  const manual = runNode('workflow-manual-probe.mjs')
  const vitest = runPnpm('exec', [
    'vitest',
    'run',
    'tests/scripts/workflow/',
    'tests/runtime/page/structured-config/workflow/workflow-pagedata-binding.test.ts',
    'tests/runtime/page/structured-config/workflow/flow-workbench-pagedata-contract.test.ts',
    'tests/runtime/page/structured-config/workflow/flow-design',
  ])
  const smoke = runNode('workflow-d99-smoke.mjs', ['--skip-g0'])
  process.stderr.write(`manual-probe=${manual} vitest=${vitest} d99-smoke=${smoke}\n`)
  return manual === 0 && vitest === 0 ? smoke : 1
}

const args = parseArgs(process.argv.slice(2))
loadSparkEnvFromLocal()
await ensureSparkEnvFromSession()

if (args.printChecklist) {
  const gap = await emitManualChecklist()
  process.exit(gap > 0 ? 2 : 0)
}

if (args.diagnosePk) {
  runNode('diagnose-workflow-formal-pk-persist.mjs')
}

if (args.refreshDetail && !args.pkOnly) {
  const detailRun = runNode('probe-workflow-formal-pk-detail.mjs')
  if (detailRun !== 0) process.exit(detailRun)
}

let probe = runNode('probe-workflow-formal-pk.mjs')

if (probe !== 0 && !args.pkOnly) {
  const tierBArgs = []
  if (args.applyTierB) tierBArgs.push('--apply')
  if (args.refreshDetail) tierBArgs.push('--refresh-detail')
  runNode('apply-workflow-formal-pk-tier-b.mjs', tierBArgs)

  const tierAArgs = []
  if (args.applyTierA) tierAArgs.push('--apply')
  if (args.refreshDetail) tierAArgs.push('--refresh-detail')
  runNode('apply-workflow-formal-pk-tier-a.mjs', tierAArgs)

  probe = runNode('probe-workflow-formal-pk.mjs')
}

if (probe !== 0) {
  if (!args.applyTierA && !args.applyTierB && !args.pkOnly) {
    process.stdout.write('提示：设计器见 workflow-designer-pk-runbook-20261116.md；或 --apply-tier-b / --apply-tier-a。\n')
  }
  await emitManualChecklist()
  if (args.continueOnPkBlock) {
    runContinueOnPkBlockPipeline()
    process.exit(3)
  }
  process.exit(2)
}

probe = runNode('probe-workflow-metadata.mjs')
if (probe !== 0) process.exit(probe)

probe = runNode('run-g0-apply.mjs')
if (probe !== 0) process.exit(probe)

if (!args.skipSpa) {
  process.stdout.write('SPA 四格须登录 5273 实测；见 workflow-designer-pk-runbook 与 workflow-spa-smoke.mjs。\n')
}

probe = runNode('workflow-r16-close-loop.mjs')
process.exit(probe)