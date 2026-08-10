#!/usr/bin/env node

/** AppWorks 全量构建：公共包与前端产物。后端由 lowcode-jdk17 独立提供。 */
import process from 'node:process'
import { ROOT_DIR, runCommand } from './build-shared.mjs'
import { buildDebugBreak } from './lib/build-debug.mjs'

buildDebugBreak('build-all:start')

try {
  runCommand('node scripts/build-packages.mjs', { cwd: ROOT_DIR })
  buildDebugBreak('build-all:after-packages')
  runCommand('node scripts/build-frontend.mjs', { cwd: ROOT_DIR })
  buildDebugBreak('build-all:complete')
  console.log('\nAppWorks packages and frontend build completed.')
} catch (error) {
  console.error(`\nBuild failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
