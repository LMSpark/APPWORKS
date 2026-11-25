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
  const temporaryParent = fs.realpathSync(os.tmpdir())
  for (const root of tempRoots.splice(0)) {
    const resolved = fs.realpathSync(root)
    if (path.dirname(resolved) !== temporaryParent || !path.basename(resolved).startsWith('spark-arch-paths-')) {
      throw new Error('architecture fixture directory is outside the temporary root')
    }
    fs.rmSync(resolved, {recursive: true, force: true})
  }
})

describe('architecture feature import paths', () => {
  it('rejects direct Element Plus imports in business page scripts and helpers', () => {
    const root = createTempRoot()
    writeFile(root, 'src/views/page.vue', '<script setup>\nimport { ElTable } from "element-plus"\n</script>')
    writeFile(root, 'src/views/icons.ts', 'export { Search } from "@element-plus/icons-vue"')
    writeFile(root, 'src/views/fields.ts', 'import Input from "element-plus/es/components/input"')
    const result = runArchitectureCheck(root)
    expect(result.status).toBe(1)
    for (const file of ['page.vue', 'icons.ts', 'fields.ts']) {
      expect(result.stderr).toContain(`src/views/${file}:`)
    }
  })

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

describe('workspace dependency boundaries', () => {
  const utilityPackage = '@spark-appworks/spark-utils'
  const utilityExports = {'.': './dist/index.js', './public': './dist/public.js',
    './parts/*': './dist/parts/*.js', './parts/private': null}

  function setupConsumer(root: string, importer: string, specifier: string): void {
    writeFile(root, 'src/app-only.ts', 'export const appOnly = true\n')
    writeFile(root, 'packages/spark-utils/src/private.ts', 'export const privateValue = true\n')
    writeFile(root, 'packages/spark-utils/package.json', JSON.stringify({name: utilityPackage, exports: utilityExports}))
    writeFile(root, 'packages/spark-data/package.json', JSON.stringify({name: '@spark-appworks/spark-data',
      exports: {import: './dist/index.js'}, dependencies: {[utilityPackage]: 'workspace:*'}}))
    writeFile(root, importer, `import ${JSON.stringify(specifier)}\n`)
  }

  it.each([
    ['src/read.ts', '../packages/spark-utils/src/private', 'package implementation paths'],
    ['src/read.ts', '/packages/spark-utils/src/private', 'package implementation paths'],
    ['packages/spark-data/src/read.ts', '@/app-only', 'must not import host src implementation'],
    ['packages/spark-data/src/read.ts', '../../../src/app-only', 'must not import host src implementation'],
    ['src/read.ts', '@spark-appworks/spark-utils/private', 'subpath is not exported'],
    ['packages/spark-data/src/read.ts', '@spark-appworks/spark-utils/private', 'subpath is not exported'],
    ['src/read.ts', '@spark-appworks/spark-utils/parts/private', 'subpath is not exported'],
  ] as const)('reports %s importing %s through an invalid boundary', (importer, specifier, problem) => {
    const root = createTempRoot()
    setupConsumer(root, importer, specifier)
    const result = runArchitectureCheck(root)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(importer)
    expect(result.stderr).toContain(problem)
  })

  it.each([
    ['src/read.ts', '@spark-appworks/spark-utils'],
    ['packages/spark-data/src/read.ts', '@spark-appworks/spark-utils/public'],
    ['src/read.ts', '@spark-appworks/spark-utils/parts/details'],
    ['src/read.ts', '@spark-appworks/spark-data'],
    ['packages/spark-utils/src/read.ts', './private'],
  ] as const)('allows %s to load declared module %s', (importer, specifier) => {
    const root = createTempRoot()
    setupConsumer(root, importer, specifier)
    const result = runArchitectureCheck(root)
    expect(result.status, result.stderr).toBe(0)
  })

  it.each(['dependencies', 'optionalDependencies', 'peerDependencies'] as const)('reports a runtime cycle through %s and permits a development-only edge', dependencyField => {
    const root = createTempRoot()
    const data = '@spark-appworks/spark-data'
    const utilities = 'packages/spark-utils/package.json'
    writeFile(root, 'packages/spark-data/package.json', JSON.stringify({name: data,
      dependencies: {[utilityPackage]: 'workspace:*'}}))
    writeFile(root, utilities, JSON.stringify({name: utilityPackage, [dependencyField]: {[data]: 'workspace:*'}}))
    const cycle = runArchitectureCheck(root)
    expect(cycle.status).toBe(1)
    expect(cycle.stderr).toContain('workspace runtime dependency cycle')
    expect(cycle.stderr).toContain(data)
    expect(cycle.stderr).toContain(utilityPackage)
    writeFile(root, utilities, JSON.stringify({name: utilityPackage, devDependencies: {[data]: 'workspace:*'}}))
    expect(runArchitectureCheck(root).status).toBe(0)
  })

  it.each(['dependencies', 'optionalDependencies', 'peerDependencies'] as const)('rejects the component package runtime AI edge declared in %s', dependencyField => {
    const root = createTempRoot()
    const ai = '@spark-appworks/spark-ai'
    const component = 'packages/spark-component/package.json'
    const name = '@spark-appworks/spark-component'
    writeFile(root, 'packages/spark-ai/package.json', JSON.stringify({name: ai,
      exports: {'.': './dist/index.js', './agent': './dist/agent.js', './class-model': './dist/class-model.js'}}))
    writeFile(root, component, JSON.stringify({name, [dependencyField]: {[ai]: 'workspace:*'}}))
    const result = runArchitectureCheck(root)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('spark-component must not have a runtime dependency on spark-ai')
    writeFile(root, component, JSON.stringify({name, devDependencies: {[ai]: 'workspace:*'}}))
    expect(runArchitectureCheck(root).status).toBe(0)
  })
})
