import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
// @ts-ignore TS7016 -- Node .mjs helper
import { augmentIncrementalPlanWithConfigDrift, canSkipDeclarationEmit, planIncrementalBundleBuild, readDtsManifestSnapshot, resolveEmitSourcePathsForIncrementalPlan, writeDtsManifestSnapshot } from '../../scripts/lib/class-model-incremental-build.mjs'
import { dtsSourcePathToBundleRelativeJson } from '../../packages/spark-ai/src/class-model/class-model/bundle/dts-bundle-url'

describe('class-model-incremental-build', () => {
  it('maps emit source paths to native shard relative paths', () => {
    expect(dtsSourcePathToBundleRelativeJson('class-model-emit/packages/demo/src/widget.d.ts'))
      .toBe('files/packages/demo/src/widget.ts.json')
    expect(dtsSourcePathToBundleRelativeJson('packages/demo/src/widget.ts'))
      .toBe('files/packages/demo/src/widget.ts.json')
  })

  it('treats legacy array .dts-manifest as full rebuild', () => {
    const root = mkdtempSync(join(tmpdir(), 'spark-dts-manifest-legacy-'))
    try {
      writeFileSync(join(root, '.dts-manifest.json'), JSON.stringify(['a.d.ts']), 'utf8')
      expect(readDtsManifestSnapshot(join(root, '.dts-manifest.json'))).toBeUndefined()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('skips unchanged shards when source mtime matches snapshot', () => {
    const root = mkdtempSync(join(tmpdir(), 'spark-dts-incremental-'))
    try {
      const repoRoot = root
      const outputDir = join(root, 'generated/dts-class-model')
      const emitSourcePath = 'class-model-emit/packages/demo/src/widget.d.ts'
      const manifestSourcePath = 'packages/demo/src/widget.ts'
      const sourceTs = join(repoRoot, 'packages/demo/src/widget.ts')
      const shardRelative = dtsSourcePathToBundleRelativeJson(manifestSourcePath)
      const shardPath = join(outputDir, shardRelative)
      const mtime = new Date('2026-01-02T03:04:05.000Z')

      mkdirSync(join(repoRoot, 'packages/demo/src'), { recursive: true })
      writeFileSync(sourceTs, 'export class Widget {}\n', 'utf8')
      utimesSync(sourceTs, mtime, mtime)
      mkdirSync(join(outputDir, 'files/packages/demo/src'), { recursive: true })
      writeFileSync(shardPath, JSON.stringify({
        symbols: ['Widget'],
        generatedAt: mtime.toISOString(),
      }), 'utf8')

      const existingManifest = {
        files: {
          [manifestSourcePath]: {
            file: shardRelative,
            module: { sourceFile: manifestSourcePath },
          },
        },
      }
      const existingDtsManifest = {
        schemaVersion: 1,
        entries: {
          [manifestSourcePath]: {
            sourceFile: manifestSourcePath,
            sourceModifiedAt: mtime.toISOString(),
            shardFile: shardRelative,
          },
        },
      }

      const plan = planIncrementalBundleBuild({
        repoRoot,
        outputDir,
        emitSourcePaths: [emitSourcePath],
        dtsFiles: [resolve(repoRoot, emitSourcePath)],
        existingManifest,
        existingDtsManifest,
        resolveProgramRootFiles: () => [],
      })

      expect(plan.mode).toBe('incremental')
      expect([...plan.unchangedSourcePaths]).toEqual([emitSourcePath])
      expect(plan.changedSourcePaths.size).toBe(0)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('marks shard as changed when source mtime differs', () => {
    const root = mkdtempSync(join(tmpdir(), 'spark-dts-incremental-changed-'))
    try {
      const repoRoot = root
      const outputDir = join(root, 'generated/dts-class-model')
      const emitSourcePath = 'class-model-emit/packages/demo/src/widget.d.ts'
      const manifestSourcePath = 'packages/demo/src/widget.ts'
      const sourceTs = join(repoRoot, 'packages/demo/src/widget.ts')
      const shardRelative = dtsSourcePathToBundleRelativeJson(manifestSourcePath)
      const shardPath = join(outputDir, shardRelative)
      const oldMtime = new Date('2026-01-02T03:04:05.000Z')
      const newMtime = new Date('2026-01-03T03:04:05.000Z')

      mkdirSync(join(repoRoot, 'packages/demo/src'), { recursive: true })
      writeFileSync(sourceTs, 'export class Widget {}\n', 'utf8')
      utimesSync(sourceTs, newMtime, newMtime)
      mkdirSync(join(outputDir, 'files/packages/demo/src'), { recursive: true })
      writeFileSync(shardPath, JSON.stringify({
        symbols: ['Widget'],
        generatedAt: oldMtime.toISOString(),
      }), 'utf8')

      const plan = planIncrementalBundleBuild({
        repoRoot,
        outputDir,
        emitSourcePaths: [emitSourcePath],
        dtsFiles: [resolve(repoRoot, emitSourcePath)],
        existingManifest: {
          files: {
            [manifestSourcePath]: { file: shardRelative, module: { sourceFile: manifestSourcePath } },
          },
        },
        existingDtsManifest: {
          schemaVersion: 1,
          entries: {
            [manifestSourcePath]: {
              sourceFile: manifestSourcePath,
              sourceModifiedAt: oldMtime.toISOString(),
              shardFile: shardRelative,
            },
          },
        },
        resolveProgramRootFiles: (changed: string[]) => changed.map((path: string) => resolve(repoRoot, path)),
      })

      expect(plan.mode).toBe('incremental')
      expect([...plan.changedSourcePaths]).toEqual([emitSourcePath])
      expect(plan.unchangedSourcePaths.size).toBe(0)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('writes source mtime entries into .dts-manifest.json', () => {
    const root = mkdtempSync(join(tmpdir(), 'spark-dts-manifest-write-'))
    try {
      const repoRoot = root
      const manifestPath = join(root, '.dts-manifest.json')
      const manifestSourcePath = 'packages/demo/src/widget.ts'
      const sourceTs = join(repoRoot, 'packages/demo/src/widget.ts')
      const mtime = new Date('2026-01-02T03:04:05.000Z')
      mkdirSync(join(repoRoot, 'packages/demo/src'), { recursive: true })
      writeFileSync(sourceTs, 'export class Widget {}\n', 'utf8')
      utimesSync(sourceTs, mtime, mtime)

      writeDtsManifestSnapshot({
        repoRoot,
        manifestPath,
        writeFileSync,
        inputFingerprint: 'build-inputs',
        declarationFingerprints: new Map([['class-model-emit/packages/demo/src/widget.d.ts', 'emitted-widget']]),
        manifest: {
          files: {
            [manifestSourcePath]: {
              file: dtsSourcePathToBundleRelativeJson(manifestSourcePath),
              module: { sourceFile: manifestSourcePath },
            },
          },
        },
      })

      const snapshot = JSON.parse(readFileSync(manifestPath, 'utf8'))
      expect(snapshot.schemaVersion).toBe(1)
      expect(snapshot.inputFingerprint).toBe('build-inputs')
      expect(snapshot.entries[manifestSourcePath]).toMatchObject({
        sourceFile: manifestSourcePath,
        sourceModifiedAt: mtime.toISOString(),
        declarationFingerprint: 'emitted-widget',
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('skips unchanged shards when manifest keys use source repo paths', () => {
    const root = mkdtempSync(join(tmpdir(), 'spark-dts-incremental-source-keys-'))
    try {
      const repoRoot = root
      const outputDir = join(root, 'generated/dts-class-model')
      const emitSourcePath = 'class-model-emit/packages/demo/src/widget.d.ts'
      const manifestSourcePath = 'packages/demo/src/widget.ts'
      const sourceTs = join(repoRoot, 'packages/demo/src/widget.ts')
      const shardRelative = dtsSourcePathToBundleRelativeJson(manifestSourcePath)
      const shardPath = join(outputDir, shardRelative)
      const mtime = new Date('2026-01-02T03:04:05.000Z')

      mkdirSync(join(repoRoot, 'packages/demo/src'), { recursive: true })
      writeFileSync(sourceTs, 'export class Widget {}\n', 'utf8')
      utimesSync(sourceTs, mtime, mtime)
      mkdirSync(join(outputDir, 'files/packages/demo/src'), { recursive: true })
      writeFileSync(shardPath, JSON.stringify({
        symbols: ['Widget'],
        generatedAt: mtime.toISOString(),
      }), 'utf8')

      const existingManifest = {
        files: {
          [manifestSourcePath]: {
            file: shardRelative,
            module: { sourceFile: manifestSourcePath },
          },
        },
      }
      const existingDtsManifest = {
        schemaVersion: 1,
        entries: {
          [manifestSourcePath]: {
            sourceFile: manifestSourcePath,
            sourceModifiedAt: mtime.toISOString(),
            shardFile: shardRelative,
          },
        },
      }

      const plan = planIncrementalBundleBuild({
        repoRoot,
        outputDir,
        emitSourcePaths: [emitSourcePath],
        dtsFiles: [resolve(repoRoot, emitSourcePath)],
        existingManifest,
        existingDtsManifest,
        resolveProgramRootFiles: () => [],
      })

      expect(plan.mode).toBe('incremental')
      expect([...plan.unchangedSourcePaths]).toEqual([emitSourcePath])
      expect(plan.changedSourcePaths.size).toBe(0)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('resolveEmitSourcePathsForIncrementalPlan maps source-path manifest keys to emit paths', () => {
    expect(resolveEmitSourcePathsForIncrementalPlan({
      configEmitSourcePaths: ['class-model-emit/phantom.d.ts'],
      existingManifest: {
        files: {
          'packages/demo/src/widget.ts': { file: 'files/packages/demo/src/widget.ts.json' },
        },
      },
    })).toEqual([
      'class-model-emit/packages/demo/src/widget.d.ts',
    ])
  })

  it('resolveEmitSourcePathsForIncrementalPlan prefers manifest keys when manifest exists', () => {
    expect(resolveEmitSourcePathsForIncrementalPlan({
      configEmitSourcePaths: [
        'class-model-emit/a.d.ts',
        'class-model-emit/b.d.ts',
        'class-model-emit/phantom.d.ts',
      ],
      existingManifest: {
        files: {
          'packages/demo/a.ts': { file: 'files/packages/demo/a.ts.json' },
          'packages/demo/b.ts': { file: 'files/packages/demo/b.ts.json' },
        },
      },
    })).toEqual([
      'class-model-emit/packages/demo/a.d.ts',
      'class-model-emit/packages/demo/b.d.ts',
    ])
  })

  it('keeps emitted dependency shards that are not direct configuration roots', () => {
    const plan = {
      mode: 'incremental',
      changedSourcePaths: new Set(),
      unchangedSourcePaths: new Set(['class-model-emit/packages/demo/a.d.ts']),
      removedSourcePaths: new Set(),
      programRootFiles: [],
    }
    const augmented = augmentIncrementalPlanWithConfigDrift(plan, {
      repoRoot: process.cwd(),
      configEmitSourcePaths: [
        'class-model-emit/packages/demo/a.d.ts',
        'class-model-emit/phantom.d.ts',
      ],
      existingManifest: {
        files: {
          'packages/demo/a.ts': { file: 'files/packages/demo/a.ts.json' },
          'packages/demo/dependency.ts': { file: 'files/packages/demo/dependency.ts.json' },
        },
      },
      existingDtsManifest: { schemaVersion: 1, entries: {} },
      resolveProgramRootFiles: (paths: string[]) => paths,
    })
    expect(augmented.changedSourcePaths.size).toBe(0)
    expect([...augmented.newConfigSourcePaths ?? []]).toEqual([])
    expect(augmented.removedSourcePaths.size).toBe(0)
  })

  it('canSkipDeclarationEmit detects new emitted source candidates', () => {
    expect(canSkipDeclarationEmit({
      mode: 'incremental',
      changedSourcePaths: new Set(),
      removedSourcePaths: new Set(),
      newConfigSourcePaths: new Set(['class-model-emit/phantom.d.ts']),
    })).toBe(false)
  })

  it('refreshes inferred declarations and reverse consumers when source times are unchanged', () => {
    const root = mkdtempSync(join(tmpdir(), 'spark-dts-consumers-'))
    try {
      const names = ['owner', 'inline', 'consumer', 'unrelated']
      const outputDir = join(root, 'generated/dts-class-model')
      const timestamp = new Date('2026-01-02T03:04:05.000Z')
      const files = {}
      const entries = {}
      const fingerprints = new Map<string, string>()
      for (const name of names) {
        const sourceFile = `${name}.ts`
        const file = join(root, sourceFile)
        const shardFile = `files/${sourceFile}.json`
        const emitKey = `class-model-emit/${name}.d.ts`
        mkdirSync(join(outputDir, 'files'), { recursive: true })
        writeFileSync(file, `export const ${name} = 1\n`)
        utimesSync(file, timestamp, timestamp)
        writeFileSync(join(outputDir, shardFile), JSON.stringify({module:{symbols:[name]}}))
        Object.assign(files, {[sourceFile]:{file:shardFile,module:{sourceFile}}})
        Object.assign(entries, {[sourceFile]:{sourceFile,shardFile,sourceModifiedAt:timestamp.toISOString(),declarationFingerprint:'prior'}})
        fingerprints.set(emitKey,name==='owner'||name==='inline'?'next':'prior')
      }
      const emitSourcePaths = [...fingerprints.keys()]
      const plan = planIncrementalBundleBuild({
        repoRoot:root,outputDir,emitSourcePaths,dtsFiles:emitSourcePaths.map(path=>resolve(root,path)),
        existingManifest:{files},existingDtsManifest:{schemaVersion:1,entries},declarationFingerprints:fingerprints,
        resolveDependentSourcePaths:(changed:ReadonlySet<string>)=>{
          expect([...changed]).toEqual(['class-model-emit/inline.d.ts','class-model-emit/owner.d.ts'])
          return ['class-model-emit/consumer.d.ts']
        },
        resolveProgramRootFiles:()=>[],
      })
      expect([...plan.changedSourcePaths]).toEqual(['class-model-emit/inline.d.ts','class-model-emit/owner.d.ts','class-model-emit/consumer.d.ts'])
      expect([...plan.unchangedSourcePaths]).toEqual(['class-model-emit/unrelated.d.ts'])
      expect([...plan.knownClassNamesBySourcePath.keys()]).toEqual(['class-model-emit/unrelated.d.ts'])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('canSkipDeclarationEmit is true only when manifest shards unchanged and none removed', () => {
    expect(canSkipDeclarationEmit({
      mode: 'incremental',
      changedSourcePaths: new Set(),
      removedSourcePaths: new Set(),
    })).toBe(true)
    expect(canSkipDeclarationEmit({
      mode: 'incremental',
      changedSourcePaths: new Set(['class-model-emit/a.d.ts']),
      removedSourcePaths: new Set(),
    })).toBe(false)
    expect(canSkipDeclarationEmit({
      mode: 'incremental',
      changedSourcePaths: new Set(),
      removedSourcePaths: new Set(['class-model-emit/b.d.ts']),
    })).toBe(false)
    expect(canSkipDeclarationEmit(undefined)).toBe(false)
  })
})
