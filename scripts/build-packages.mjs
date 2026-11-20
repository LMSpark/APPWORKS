#!/usr/bin/env node

/**
 * 按 workspace 依赖顺序构建 packages/*（vite JS + tsc/vue-tsc 声明）。
 *
 * 用法：
 *   node scripts/build-packages.mjs
 *   node scripts/build-packages.mjs --only spark-utils,spark-data
 *   node scripts/build-packages.mjs --dry-run
 *   node scripts/build-packages.mjs --force
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { PACKAGES_DIR, runCommand } from './build-shared.mjs'
import { buildDebugBreak } from './lib/build-debug.mjs'
import {
  computePackageInputFingerprint,
  isPackageBuildFresh,
  writeBuildStamp,
} from './lib/package-build-cache.mjs'
import { resolvePackagesInBuildOrder } from './lib/sort-packages-by-dependency.mjs'

function parseOnlyArg(argv) {
  const onlyFlagIndex = argv.indexOf('--only')
  if (onlyFlagIndex >= 0) {
    const value = argv[onlyFlagIndex + 1]
    if (!value || value.startsWith('--')) {
      throw new Error('--only requires a comma-separated package dir list')
    }
    return value.split(',').map((item) => item.trim()).filter(Boolean)
  }
  return null
}

function readPackageJson(pkgDir) {
  const packageJsonPath = join(PACKAGES_DIR, pkgDir, 'package.json')
  return JSON.parse(readFileSync(packageJsonPath, 'utf8'))
}

function readPackageName(pkgDir) {
  return readPackageJson(pkgDir).name
}

function hasBuildScript(pkgDir) {
  return typeof readPackageJson(pkgDir).scripts?.build === 'string'
}

function main() {
  const argv = process.argv.slice(2)
  const dryRun = argv.includes('--dry-run')
  const force = argv.includes('--force')
  const onlyDirs = parseOnlyArg(argv)
  const selected = resolvePackagesInBuildOrder(PACKAGES_DIR, onlyDirs)
  const packages = selected.filter(hasBuildScript)
  const skippedWithoutBuild = selected.filter((pkgDir) => !hasBuildScript(pkgDir))

  buildDebugBreak('build-packages:order-resolved', {
    packages,
    skippedWithoutBuild,
    dryRun,
    force,
    onlyDirs,
  })

  if (packages.length === 0) {
    console.log('No packages selected.')
    process.exit(0)
  }

  console.log(`📦 Package build order: ${packages.join(' → ')}`)
  if (skippedWithoutBuild.length > 0) {
    console.log(`ℹ️  Skipping source-only packages (no build script): ${skippedWithoutBuild.join(', ')}`)
  }
  if (dryRun) {
    process.exit(0)
  }

  const dependencyFingerprints = new Map()
  let builtCount = 0
  let skippedCount = 0

  for (const pkgDir of packages) {
    const pkgRoot = join(PACKAGES_DIR, pkgDir)
    const fingerprint = computePackageInputFingerprint(pkgRoot, dependencyFingerprints)
    const fresh = !force && isPackageBuildFresh(pkgRoot, fingerprint)

    buildDebugBreak('build-packages:package-decision', {
      pkgDir,
      fresh,
      fingerprint,
    })

    if (fresh) {
      console.log(`\n⏭️  Skipping ${pkgDir} (unchanged)`)
      dependencyFingerprints.set(readPackageName(pkgDir), fingerprint)
      skippedCount += 1
      continue
    }

    console.log(`\n🔧 Building ${pkgDir} ...`)
    buildDebugBreak('build-packages:before-pnpm-build', { pkgDir })
    runCommand('pnpm run build', { cwd: pkgRoot })
    writeBuildStamp(pkgRoot, fingerprint)
    dependencyFingerprints.set(readPackageName(pkgDir), fingerprint)
    builtCount += 1
  }

  console.log(`\n✅ Package build complete (${builtCount} built, ${skippedCount} skipped).`)
  buildDebugBreak('build-packages:complete', { builtCount, skippedCount })
}

try {
  main()
} catch (error) {
  console.error(`\n❌ ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
