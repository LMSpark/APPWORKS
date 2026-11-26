#!/usr/bin/env node

/**
 * Offline pageDesign smoke verification.
 *
 * Exercises page and scenario registration, workflow view bindings and the
 * ClassModel sandbox without LLM calls or a running dev server.
 */

import path from 'node:path'
import process from 'node:process'
import { runExactVitest } from './lib/run-exact-vitest.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')

const testFiles = [
  'tests/app/config/vue-page-registry.test.ts',
  'tests/app/services/page-design-ai-runner.test.ts',
  'tests/app/dev/dev-state-page-file-closed-loop.test.ts',
  'tests/app/dev/use-dev-state-page-data-history.test.ts',
  'tests/app/features/application/application-function-management/application-function-page-entry.test.ts',
  'tests/app/services/page-design-operation-guard.test.ts',
  'tests/runtime/page/design/page-design-gates.test.ts',
  'tests/runtime/page/design/page-design-sop.test.ts',
  'tests/runtime/page/runtime/page-model-view-binding.test.ts',
  'tests/runtime/auth-nav/repository-scenarios/repository-scenario-resource.test.ts',
  'tests/runtime/auth-nav/platform-login/public-scenario.test.ts',
  'tests/runtime/page/structured-config/workflow/flow-design/flow-design-page-mount.test.ts',
  'tests/runtime/page/structured-config/workflow/flow-workbench-page.test.ts',
  'packages/spark-ai/src/tests/tool-loop/tool-loop-nudge-hooks.test.ts',
  'packages/spark-ai/src/tests/script-runtime/native-script-sandbox.test.ts',
  'packages/spark-ai/src/tests/tool-loop/function-call-recovery-enricher.test.ts',
]

process.exit(runExactVitest(ROOT, testFiles))
