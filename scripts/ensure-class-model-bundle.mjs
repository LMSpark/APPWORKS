#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

import { assertClassModelBundleComplete } from './lib/class-model-bundle-assert.mjs'
import { buildDebugBreak } from './lib/build-debug.mjs'

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const bundleRoot = resolve(repoRoot, 'generated/dts-class-model')
const manifestPath = resolve(bundleRoot, 'manifest.json')

buildDebugBreak('ensure-class-model-bundle:start', { manifestPath, exists: existsSync(manifestPath) })

const isCi = /^(?:true|1)$/i.test(process.env.CI ?? '')
if (isCi || !existsSync(manifestPath)) {
  buildDebugBreak('ensure-class-model-bundle:generate', {isCi})
  const child = spawnSync('pnpm', ['run', 'generate:class-model-surface'], {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if ((child.status ?? 1) !== 0) {
    process.exit(child.status ?? 1)
  }
}

buildDebugBreak('ensure-class-model-bundle:before-assert', { bundleRoot })
assertClassModelBundleComplete(bundleRoot)
buildDebugBreak('ensure-class-model-bundle:complete')
