#!/usr/bin/env node

/**
 * Offline projectPlanning verification.
 *
 * Exercises DTS ClassModel project knowledge, model_script sandbox, app-layer factory
 * gates, and L4 artifact fixtures — without LLM, SSE, EventSource, or dev server.
 *
 * Requires generated DTS ClassModel JSON:
 *   pnpm run generate:class-model-surface
 */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = path.resolve(import.meta.dirname, '..')

const testFiles = [
  'tests/app/services/project-planning-ai-runner.test.ts',
  'tests/app/services/project-planning/grouped-planning-contract.test.ts',
  'packages/spark-ai/src/tests/tool-loop/tool-loop-nudge-hooks.test.ts',
  'packages/spark-ai/src/tests/script-runtime/native-script-sandbox.test.ts',
  'packages/spark-ai/src/tests/tool-loop/function-call-recovery-enricher.test.ts',
]

for (const file of testFiles) {
  if (!existsSync(path.resolve(ROOT, file))) throw new Error(`Offline test file is missing: ${file}`)
}

const result = spawnSync(
  'pnpm',
  ['exec', 'vitest', 'run', ...testFiles],
  {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
  },
)

if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}

process.exit(result.status ?? 1)
