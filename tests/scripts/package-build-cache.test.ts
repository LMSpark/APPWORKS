import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import {
  computePackageInputFingerprint,
  isPackageBuildFresh,
  writeBuildStamp,
} from '../../scripts/lib/package-build-cache.mjs'

type TempPackageOptions = {
  name?: string
  dependencies?: Record<string, string>
  source?: string
}

function createTempPackage(options: TempPackageOptions = {}) {
  const root = mkdtempSync(join(tmpdir(), 'spark-pkg-cache-'))
  mkdirSync(join(root, 'src'), { recursive: true })
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    name: options.name ?? '@spark-appworks/test-pkg',
    main: './dist/index.js',
    dependencies: options.dependencies ?? {},
  }, null, 2))
  writeFileSync(join(root, 'src/index.ts'), options.source ?? 'export const value = 1\n')
  mkdirSync(join(root, 'dist'), { recursive: true })
  writeFileSync(join(root, 'dist/index.js'), 'export const value = 1\n')
  return root
}

describe('package-build-cache', () => {
  it('detects unchanged package output as fresh', () => {
    const pkgRoot = createTempPackage()
    const fingerprint = computePackageInputFingerprint(pkgRoot)
    writeBuildStamp(pkgRoot, fingerprint)

    expect(isPackageBuildFresh(pkgRoot, fingerprint)).toBe(true)

    rmSync(pkgRoot, { recursive: true, force: true })
  })

  it('includes workspace dependency fingerprints in package hash', () => {
    const depRoot = createTempPackage({ name: '@spark-appworks/dep-a' })
    const pkgRoot = createTempPackage({
      name: '@spark-appworks/consumer',
      dependencies: { '@spark-appworks/dep-a': 'workspace:*' },
    })

    const depFingerprint = computePackageInputFingerprint(depRoot)
    const before = computePackageInputFingerprint(pkgRoot, new Map([
      ['@spark-appworks/dep-a', depFingerprint],
    ]))

    writeFileSync(join(depRoot, 'src/index.ts'), 'export const value = 2\n')
    const afterDepChange = computePackageInputFingerprint(depRoot)
    const after = computePackageInputFingerprint(pkgRoot, new Map([
      ['@spark-appworks/dep-a', afterDepChange],
    ]))

    expect(before).not.toBe(after)

    rmSync(depRoot, { recursive: true, force: true })
    rmSync(pkgRoot, { recursive: true, force: true })
  })

  it('persists stamp metadata under dist', () => {
    const pkgRoot = createTempPackage()
    const fingerprint = computePackageInputFingerprint(pkgRoot)
    writeBuildStamp(pkgRoot, fingerprint)

    const stamp = JSON.parse(readFileSync(join(pkgRoot, 'dist/.spark-build-stamp.json'), 'utf8'))
    expect(stamp.fingerprint).toBe(fingerprint)
    expect(typeof stamp.builtAt).toBe('string')

    rmSync(pkgRoot, { recursive: true, force: true })
  })
})
