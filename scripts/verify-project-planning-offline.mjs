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
import path from 'node:path'
import process from 'node:process'

const ROOT = path.resolve(import.meta.dirname, '..')

const testFiles = [
  'tests/app/services/project-planning-agent-run-provider.test.ts',
  'tests/app/services/project-planning-ai-runner.test.ts',
  'tests/scripts/project-planning-hr-artifact-assert.test.ts',
  'packages/spark-ai/src/tests/native-script-sandbox.test.ts',
  'packages/spark-ai/src/tests/function-call-recovery-enricher.test.ts',
  'packages/spark-ai/src/tests/tool-loop-nudge-hooks.test.ts',
]

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
