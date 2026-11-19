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

import path from 'node:path'
import process from 'node:process'
import { runExactVitest } from './lib/run-exact-vitest.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')

const testFiles = [
  'tests/app/services/project-planning-ai-runner.test.ts',
  'tests/app/services/project-planning/grouped-planning-contract.test.ts',
  'packages/spark-ai/src/tests/tool-loop/tool-loop-nudge-hooks.test.ts',
  'packages/spark-ai/src/tests/script-runtime/native-script-sandbox.test.ts',
  'packages/spark-ai/src/tests/tool-loop/function-call-recovery-enricher.test.ts',
]

process.exit(runExactVitest(ROOT, testFiles))
