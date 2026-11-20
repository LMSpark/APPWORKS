#!/usr/bin/env node

/**
 * 前端生产构建：根 Vite 应用（monorepo 包通过 vite alias 指向 src，无需预构建 dist）。
 *
 * ClassModel 编译 SSOT：generated/dts-class-model/（已入库；Vite 插件映射到 /dts-class-model/）。
 */

import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { ROOT_DIR, runCommand } from './build-shared.mjs'
import { buildDebugBreak } from './lib/build-debug.mjs'

function ensureClassModelBundle() {
  buildDebugBreak('build-frontend:ensure-class-model-bundle')
  const result = spawnSync(process.execPath, ['scripts/ensure-class-model-bundle.mjs'], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

ensureClassModelBundle()

console.log('\n🧩 组件注册模式: 编译时注册（packages 走 Vite alias → src）')
buildDebugBreak('build-frontend:before-vite-build')
runCommand('pnpm exec vite build', { cwd: ROOT_DIR })
buildDebugBreak('build-frontend:complete')
