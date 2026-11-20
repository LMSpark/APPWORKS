import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const refreshLocks = new Map()

export function createDtsClassModelBundleRefreshFunction(options = {}) {
  const repoRoot = resolve(options.repoRoot ?? DEFAULT_REPO_ROOT)
  const scriptPath = resolve(repoRoot, 'scripts/generate-dts-class-model.mjs')
  const stdio = options.stdio ?? 'inherit'

  return async input => {
    const rootClassName = normalizeRequiredText(input?.rootClassName, 'rootClassName')
    const requestedClassName = normalizeOptionalText(input?.requestedClassName)
    const targetClassName = requestedClassName ?? rootClassName
    const lockKey = `${repoRoot}:${targetClassName}`
    const existing = refreshLocks.get(lockKey)
    if (existing !== undefined) {
      await existing
      return
    }

    const task = Promise.resolve().then(() => {
      const child = spawnSync('pnpm', [
        'exec',
        'tsx',
        '--no-cache',
        scriptPath,
        '--model',
        targetClassName,
      ], {
        cwd: repoRoot,
        stdio,
        shell: process.platform === 'win32',
      })
      if (child.status !== 0) {
        throw new Error(`DTS ClassModel targeted refresh failed for ${targetClassName} with exit code ${String(child.status ?? 1)}.`)
      }
    })

    refreshLocks.set(lockKey, task)
    try {
      await task
    } finally {
      refreshLocks.delete(lockKey)
    }
  }
}

function normalizeRequiredText(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`DTS ClassModel refresh requires ${field}.`)
  }
  return value.trim()
}

function normalizeOptionalText(value) {
  if (value === undefined) return undefined
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length === 0 ? undefined : trimmed
}
