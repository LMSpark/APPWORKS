import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import {spawnSync} from 'node:child_process'
import {afterEach, describe, expect, it} from 'vitest'

type CommandResult = Readonly<{status: number | null; stdout: string; stderr: string}>

const repoRoot = process.cwd()
const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots.splice(0)) fs.rmSync(root, {recursive: true, force: true})
})

describe('architecture feature import paths', () => {
  it('allows preserved src/views/features page imports from the legacy page hierarchy', () => {
    const root = createTempRoot()
    writeFile(root, 'src/views/DataBaseManage/DataBaseManage/index.vue', [
      '<script setup lang="ts">',
      "import RegisterDatabaseDialog from '@/views/features/data-platform/database-management/table-and-view/ui/register-database-dialog.vue'",
      'void RegisterDatabaseDialog',
      '</script>',
    ].join('\n'))

    const result = runArchitectureCheck(root)
    const output = `${result.stdout}\n${result.stderr}`

    expect(result.status, output).toBe(0)
    expect(output).toContain('Architecture verification passed')
  })

  it('allows a relative import to the preserved src/views/features page hierarchy', () => {
    const root = createTempRoot()
    writeFile(root, 'src/views/DataBaseManage/DataBaseManage/index.vue', [
      '<script setup lang="ts">',
      "import RegisterDatabaseDialog from '../../features/data-platform/database-management/table-and-view/ui/register-database-dialog.vue'",
      'void RegisterDatabaseDialog',
      '</script>',
    ].join('\n'))

    const result = runArchitectureCheck(root)
    const output = `${result.stdout}\n${result.stderr}`

    expect(result.status, output).toBe(0)
    expect(output).toContain('Architecture verification passed')
  })

  it('allows a Vite root-relative import to the preserved src/views/features page hierarchy', () => {
    const root = createTempRoot()
    writeFile(root, 'src/views/DataBaseManage/DataBaseManage/index.vue', [
      '<script setup lang="ts">',
      "import RegisterDatabaseDialog from '/src/views/features/data-platform/database-management/table-and-view/ui/register-database-dialog.vue'",
      'void RegisterDatabaseDialog',
      '</script>',
    ].join('\n'))

    const result = runArchitectureCheck(root)
    const output = `${result.stdout}\n${result.stderr}`

    expect(result.status, output).toBe(0)
    expect(output).toContain('Architecture verification passed')
  })

  it('rejects legacy src/features dependencies from non-feature source files', () => {
    const root = createTempRoot()
    writeFile(root, 'src/page.ts', [
      "import { legacyFeature } from '@/features/legacy/feature'",
      'void legacyFeature',
    ].join('\n'))

    const result = runArchitectureCheck(root)
    const output = `${result.stdout}\n${result.stderr}`

    expect(result.status).toBe(1)
    expect(output).toContain('src/page.ts:1 src/ must not import features outside tests')
  })

  it('rejects relative imports into the legacy src/features boundary', () => {
    const root = createTempRoot()
    writeFile(root, 'src/views/page.ts', [
      "import { legacyFeature } from '../features/legacy/feature'",
      'void legacyFeature',
    ].join('\n'))

    const result = runArchitectureCheck(root)
    const output = `${result.stdout}\n${result.stderr}`

    expect(result.status, output).toBe(1)
    expect(output).toContain('src/views/page.ts:1 src/ must not import features outside tests')
  })

  it('rejects a Vite root-relative import into the legacy src/features boundary', () => {
    const root = createTempRoot()
    writeFile(root, 'src/views/page.ts', [
      "import { legacyFeature } from '/src/features/legacy/feature'",
      'void legacyFeature',
    ].join('\n'))

    const result = runArchitectureCheck(root)
    const output = `${result.stdout}\n${result.stderr}`

    expect(result.status, output).toBe(1)
    expect(output).toContain('src/views/page.ts:1 src/ must not import features outside tests')
  })

  it('does not exempt preserved src/views/features files from legacy src/features dependency checks', () => {
    const root = createTempRoot()
    writeFile(root, 'src/views/features/shared/page.ts', [
      "import { legacyFeature } from '@/features/legacy/feature'",
      'void legacyFeature',
    ].join('\n'))

    const result = runArchitectureCheck(root)
    const output = `${result.stdout}\n${result.stderr}`

    expect(result.status, output).toBe(1)
    expect(output).toContain('src/views/features/shared/page.ts:1 src/ must not import features outside tests')
  })
})

function runArchitectureCheck(root: string): CommandResult {
  const result = spawnSync(process.execPath, ['tools/verify-architecture.mjs', '--root', root], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  return {status: result.status, stdout: String(result.stdout), stderr: String(result.stderr)}
}

function createTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spark-arch-paths-'))
  tempRoots.push(root)
  return root
}

function writeFile(root: string, relativeFile: string, content: string): void {
  const file = path.join(root, relativeFile)
  fs.mkdirSync(path.dirname(file), {recursive: true})
  fs.writeFileSync(file, content)
}
