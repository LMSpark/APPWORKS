#!/usr/bin/env node

/**
 * Offline verification for the current project-model contract and page-design gates.
 */

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const ROOT = path.resolve(import.meta.dirname, '..')

const testFiles = [
  'packages/spark-project-model/tests/project-model.test.ts',
  'packages/spark-project-model/tests/io/navigation-tree-sync.test.ts',
  'tests/page/page-design-gates.test.ts',
  'tests/services/page-design-ai-runner.test.ts',
  'tests/services/project-planning-ai-runner.test.ts',
  'packages/spark-app/src/tests/runtime-target.test.ts',
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
