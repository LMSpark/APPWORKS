import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'

type CommandResult = Readonly<{
  status: number | null
  stdout: string
  stderr: string
}>

const repoRoot = process.cwd()
const tempRoots: string[] = []

afterEach(() => {
  for (const tempRoot of tempRoots.splice(0)) {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
})

describe('verification rules', () => {
  it('allows type aliases, classes, and as const', () => {
    const root = createTempRoot()
    writeFile(root, 'src/ok.ts', [
      'export type Payload = Readonly<{ value: string }>',
      "const values = ['stable'] as const",
      'export class StableRule {',
      '  public readonly value = values[0]',
      '}',
    ].join('\n'))

    const result = runNode(['tools/verify-ai-codegen-rules.mjs', '--root', root, '--include-root', 'src'])

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('AI codegen rule scan passed')
  })

  it('rejects forbidden codegen patterns including Vue script blocks', () => {
    const root = createTempRoot()
    const removedPathIdentity = ['$', 'paths'].join('')
    writeFile(root, 'src/bad.ts', [
      "import '@spark-appworks/spark-ai/core'",
      'export interface BadPayload { value: string }',
      'namespace RemovedNamespace { export const value = 1 }',
      "export * from './other'",
      "const value = {} as Record<string, unknown>",
      'type OldType = LlmParameterSchemaRoot',
      `type OldMember = ${['Ai', 'Module'].join('')}.PathContext`,
      "const dynamicTool = 'task_detail_getNode'",
      `const removedArgs = '{"${removedPathIdentity}":["task-a"]}'`,
    ].join('\n'))
    writeFile(root, 'src/bad.vue', [
      '<script setup lang="ts">',
      "const value = {} as Record<string, unknown>",
      '</script>',
    ].join('\n'))

    const result = runNode(['tools/verify-ai-codegen-rules.mjs', '--root', root, '--include-root', 'src'])
    const output = `${result.stdout}\n${result.stderr}`

    expect(result.status).toBe(1)
    expect(output).toContain('forbidden @spark-appworks/spark-ai subpath')
    expect(output).toContain('interface declaration is forbidden')
    expect(output).toContain('TypeScript namespace declaration is forbidden')
    expect(output).toContain('export * is forbidden')
    expect(output).toContain('type assertion is forbidden')
    expect(output).toContain('removed AI type name is forbidden')
    expect(output).toContain('removed agent namespace member is forbidden')
    expect(output).toContain('removed dynamic function tool name is forbidden')
    expect(output).toContain('removed protocol identity is forbidden')
    expect(output).toContain('bad.vue')
  })

  it('rejects flat public surfaces and bulk workspace imports', () => {
    const root = createTempRoot()
    writeFile(root, 'packages/spark-ai/src/index.ts', [
      'export type {',
      '  RuntimeProvider,',
      '  RuntimeResolver,',
      '  RuntimeAdapter,',
      '  RuntimeContext,',
      "} from './flat'",
    ].join('\n'))
    writeFile(root, 'packages/spark-ai/src/consumer.ts', [
      "import { One, Two, Three, Four, Five, Six, Seven, Eight, Nine } from '@spark-appworks/spark-ai/agent'",
      'export const names = [One, Two, Three, Four, Five, Six, Seven, Eight, Nine]',
    ].join('\n'))
    writeFile(root, 'packages/spark-ai/src/flat.ts', [
      'export type RuntimeProvider = () => void',
      'export type RuntimeResolver = () => void',
      'export type RuntimeAdapter = () => void',
      'export type RuntimeContext = { value: string }',
      'export class RuntimeImpl {}',
    ].join('\n'))

    const result = runNode(['tools/verify-ai-codegen-rules.mjs', '--root', root, '--include-root', 'packages'])
    const output = `${result.stdout}\n${result.stderr}`

    expect(result.status).toBe(1)
    expect(output).toContain('flat public surface')
    expect(output).toContain('too many named imports')
    expect(output).toContain('mechanical Interface/Impl name is forbidden')
  })

  it('rejects signature patterns that make generated code hard to read', () => {
    const root = createTempRoot()
    writeFile(root, 'src/bad-signature.ts', [
      'export class BadSignature {',
      '  public constructor(',
      '    /** dependency hidden inside the signature */',
      '    private readonly getValue: () => string,',
      '  ) {}',
      '}',
      'export function tooWide(a: string, b: string, c: string, d: string): string {',
      '  return a + b + c + d',
      '}',
    ].join('\n'))

    const result = runNode(['tools/verify-ai-codegen-rules.mjs', '--root', root, '--include-root', 'src'])
    const output = `${result.stdout}\n${result.stderr}`

    expect(result.status).toBe(1)
    expect(output).toContain('parameter JSDoc is forbidden')
    expect(output).toContain('signature has too many positional parameters')
  })

  it('rejects manual removed business registration in src/services', () => {
    const root = createTempRoot()
    const oldNamespace = ['Ai', 'Module'].join('')
    const oldResult = `${oldNamespace}Result`
    const oldRuntime = `${oldNamespace}Runtime`
    const oldSubpath = ['@spark-appworks/spark-ai', 'modules'].join('/')
    writeFile(root, 'src/services/bad-business.ts', [
      `import { ${oldNamespace}, ${oldResult}, ${oldRuntime} } from '${oldSubpath}'`,
      "import { createAiBusinessKit } from '@spark-appworks/spark-ai/agent'",
      `const runtime = new ${oldRuntime}()`,
      `runtime.register(new ${oldNamespace}({ kind: "ticket", name: "t", description: "d", find: () => ${oldResult}.ok([]) }))`,
      'void createAiBusinessKit',
    ].join('\n'))

    const result = runNode(['tools/verify-ai-codegen-rules.mjs', '--root', root, '--include-root', 'src'])
    const output = `${result.stdout}\n${result.stderr}`

    expect(result.status).toBe(1)
    expect(output).toContain('manual removed agent module construction is forbidden in src/services')
    expect(output).toContain('createAiBusinessKit is removed')
    expect(output).toContain('manual removed agent runtime register is forbidden in src/services')
    expect(output).toContain('AgentWorkflowDefinition activation bindings')
  })

  it('rejects createAiAgentRegistration in src/services', () => {
    const root = createTempRoot()
    writeFile(root, 'src/services/bad-registration.ts', [
      "import { createAiAgentRegistration } from '@spark-appworks/spark-ai/agent'",
      'void createAiAgentRegistration',
    ].join('\n'))

    const result = runNode(['tools/verify-ai-codegen-rules.mjs', '--root', root, '--include-root', 'src'])
    const output = `${result.stdout}\n${result.stderr}`

    expect(result.status).toBe(1)
    expect(output).toContain('createAiAgentRegistration is forbidden in src/services')
    expect(output).toContain('AgentWorkflowDefinition activation bindings')
  })

  it('rejects removed parameter-surface hooks in src/services', () => {
    const root = createTempRoot()
    const oldQuery = ['query', 'Payloads'].join('')
    const oldGuide = ['guide', 'Payload'].join('')
    const oldProvider = ['create', 'Spark', 'Component', 'Catalog', 'Provider'].join('')
    const oldProviderPath = ['./page-design/spark', 'component', 'catalog', 'provider'].join('-')
    writeFile(root, 'src/services/bad-parameter-surface.ts', [
      `import { ${oldProvider} } from '${oldProviderPath}'`,
      `void ${oldProvider}`,
      `void ${oldQuery}`,
      `void ${oldGuide}`,
    ].join('\n'))

    const result = runNode(['tools/verify-ai-codegen-rules.mjs', '--root', root, '--include-root', 'src'])
    const output = `${result.stdout}\n${result.stderr}`

    expect(result.status).toBe(1)
    expect(output).toContain(`${oldQuery} is removed`)
    expect(output).toContain(`${oldGuide} is removed`)
    expect(output).toContain(`${oldProvider} is removed`)
  })

  it('rejects public method drift on critical ClassModel classes', () => {
    const root = createTempRoot()
    writeFile(root, 'packages/spark-ai/src/class-model/runtime/class-model-runtime.ts', [
      'export class ClassModelRuntime {',
      '  public getTools(): void {}',
      '  public executeTool(): void {}',
      '  public removedPathCall(): void {}',
      '}',
    ].join('\n'))

    const result = runNode(['tools/verify-ai-codegen-rules.mjs', '--root', root, '--include-root', 'packages'])
    const output = `${result.stdout}\n${result.stderr}`

    expect(result.status).toBe(1)
    expect(output).toContain('public method surface drift for ClassModelRuntime')
    expect(output).toContain('extra=[removedPathCall]')
  })

  it('rejects framework imports inside framework-free packages', () => {
    const root = createTempRoot()
    writeJson(root, 'packages/spark-data/package.json', {
      name: '@spark-appworks/spark-data',
      dependencies: {},
    })
    writeFile(root, 'packages/spark-data/src/index.ts', "import { ref } from 'vue'\nexport const value = ref(1)\n")

    const result = runNode(['tools/verify-architecture.mjs', '--root', root])
    const output = `${result.stdout}\n${result.stderr}`

    expect(result.status).toBe(1)
    expect(output).toContain('framework-free')
    expect(output).toContain('vue')
  })

  it('validates the spark-ai public subpath allowlist', () => {
    const root = createTempRoot()
    const removedAgentSubpath = ['./', 'modules'].join('')
    const removedAgentDistEntry = ['./dist/', 'modules', '/index.js'].join('')
    const removedAgentAlias = ['@spark-appworks/spark-ai', 'modules'].join('/')
    const removedAgentAliasTarget = ['./packages/spark-ai/src/', 'modules', '/index.ts'].join('')
    writeJson(root, 'packages/spark-ai/package.json', {
      name: '@spark-appworks/spark-ai',
      exports: {
        '.': './dist/index.js',
        './json': './dist/json/index.js',
        './agent': './dist/agent/index.js',
        [removedAgentSubpath]: removedAgentDistEntry,
        './class-model': './dist/class-model/index.js',
        './core': './dist/core/index.js',
      },
    })
    writeFile(root, 'tsconfig.json', [
      '{',
      '  "compilerOptions": {',
      '    "paths": {',
      '      "@spark-appworks/spark-ai": ["./packages/spark-ai/src/index.ts"],',
      '      "@spark-appworks/spark-ai/json": ["./packages/spark-ai/src/json/index.ts"],',
      '      "@spark-appworks/spark-ai/agent": ["./packages/spark-ai/src/agent/index.ts"],',
      `      "${removedAgentAlias}": ["${removedAgentAliasTarget}"],`,
      '      "@spark-appworks/spark-ai/class-model": ["./packages/spark-ai/src/class-model/index.ts"],',
      '      "@spark-appworks/spark-ai/core": ["./packages/spark-ai/src/core/index.ts"]',
      '    }',
      '  }',
      '}',
    ].join('\n'))

    const result = runNode(['tools/verify-architecture.mjs', '--root', root])
    const output = `${result.stdout}\n${result.stderr}`

    expect(result.status).toBe(1)
    expect(output).toContain('spark-ai package exports')
    expect(output).toContain('spark-ai aliases')
  })

  it('rejects business material inside the spark-ai kernel', () => {
    const root = createTempRoot()
    writeJson(root, 'packages/spark-ai/package.json', {
      name: '@spark-appworks/spark-ai',
      exports: {
        '.': './dist/index.js',
        './json': './dist/json/index.js',
        './agent': './dist/agent/index.js',
        './class-model': './dist/class-model/index.js',
      },
    })
    writeFile(root, 'tsconfig.json', [
      '{',
      '  "compilerOptions": {',
      '    "paths": {',
      '      "@spark-appworks/spark-ai": ["./packages/spark-ai/src/index.ts"],',
      '      "@spark-appworks/spark-ai/json": ["./packages/spark-ai/src/json/index.ts"],',
      '      "@spark-appworks/spark-ai/agent": ["./packages/spark-ai/src/agent/index.ts"],',
      '      "@spark-appworks/spark-ai/class-model": ["./packages/spark-ai/src/class-model/index.ts"]',
      '    }',
      '  }',
      '}',
    ].join('\n'))
    writeFile(root, 'packages/spark-ai/src/bad.ts', [
      "export const PAGE_DESIGN_TRACE = 'pageDesign should stay in business packages'",
    ].join('\n'))
    writeFile(root, 'packages/spark-ai/src/agent/native-runtime/native-script-sandbox.ts', [
      "export const hint = 'await this.openPageDesign({ pageId })'",
    ].join('\n'))
    writeFile(root, 'packages/spark-ai/src/class-model/tests/class-model.test.ts', [
      "export const fixtureUrl = 'metadata://page-design-runtime'",
    ].join('\n'))

    const result = runNode(['tools/verify-architecture.mjs', '--root', root])
    const output = `${result.stdout}\n${result.stderr}`

    expect(result.status).toBe(1)
    expect(output).toContain('spark-ai kernel must not contain business material')
    expect(output).toContain('openPageDesign')
    expect(output).not.toContain('class-model.test.ts')
  })

  it('rejects forbidden pages-config page ids outside manifest', () => {
    const root = createTempRoot()
    writeJson(root, 'backend-api-contracts/characterization-fixtures/pages-config/manifest.json', {
      protocol: 'spark-appworks.pages-config-manifest',
      schemaVersion: 1,
      projects: {
        'demo/homepage': ['good-page'],
      },
    })
    writeJson(root, 'backend-api-contracts/characterization-fixtures/pages-config/demo/homepage/good-page/rule.json', [])
    writeJson(root, 'backend-api-contracts/characterization-fixtures/pages-config/demo/homepage/good-page/pagedata.json', {})
    writeJson(root, 'backend-api-contracts/characterization-fixtures/pages-config/demo/homepage/123/rule.json', [])
    writeJson(root, 'backend-api-contracts/characterization-fixtures/pages-config/demo/homepage/123/pagedata.json', {})

    const result = runNode(['tools/verify-pages-config.mjs', '--root', root])
    const output = `${result.stdout}\n${result.stderr}`

    expect(result.status).toBe(1)
    expect(output).toContain('pure numeric pageId')
    expect(output).toContain('not listed in backend-api-contracts/characterization-fixtures/pages-config/manifest.json')
  })
})

function createTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spark-rules-'))
  tempRoots.push(root)
  return root
}

function runNode(args: readonly string[]): CommandResult {
  const result = spawnSync(process.execPath, [...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  return {
    status: result.status,
    stdout: String(result.stdout),
    stderr: String(result.stderr),
  }
}

function writeJson(root: string, relativeFile: string, value: unknown): void {
  writeFile(root, relativeFile, `${JSON.stringify(value, null, 2)}\n`)
}

function writeFile(root: string, relativeFile: string, content: string): void {
  const filePath = path.join(root, relativeFile)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content)
}
