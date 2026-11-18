#!/usr/bin/env node

/**
 * Offline pageDesign smoke verification.
 *
 * Exercises the ClassModel sandbox path (model_script) and app-layer registration
 * hooks without LLM calls or a running dev server.
 */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = path.resolve(import.meta.dirname, '..')

const testFiles = [
  'tests/app/services/page-design-ai-runner.test.ts',
  'tests/app/dev/dev-state-page-file-closed-loop.test.ts',
  'tests/app/services/page-design-operation-guard.test.ts',
  'tests/runtime/page/design/page-design-gates.test.ts',
  'tests/runtime/page/design/page-design-sop.test.ts',
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
