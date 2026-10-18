import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {afterEach, describe, expect, it} from 'vitest'
import ts from 'typescript'
import {createInMemoryDeclarationCompilerHost} from '../../../scripts/lib/class-model/declaration-host'
import {ClassModelDeclarationSchema} from '../../../packages/spark-ai/src/class-model/class-model/schema/class-model-declaration-schema'
import {buildDtsClassModelBundle} from '../../../packages/spark-ai/src/class-model/class-model/bundle/build-dts-class-model-bundle'
import {createDtsBundleClassModelKnowledgeProvider} from '../../../packages/spark-ai/src/class-model/knowledge/dts-bundle-class-model-knowledge-service'

const fixtureRoots: string[] = []
afterEach(() => {
  for (const root of fixtureRoots.splice(0)) rmSync(root, {recursive: true, force: true})
})

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'class-model-declaration-'))
  fixtureRoots.push(root)
  const stale = join(root, 'node_modules/@fixture/data/index.d.ts')
  mkdirSync(dirname(stale), {recursive: true})
  writeFileSync(stale, 'export declare enum DataMember { Rows = "rows" }')
  const emit = join(root, 'class-model-emit')
  const consumer = join(emit, 'src/consumer.d.ts')
  const dependency = join(emit, 'packages/data/index.d.ts')
  const files = new Map([
    [dependency, 'export { DataMember } from "./member.js";'],
    [join(emit, 'packages/data/member.d.ts'), 'export declare enum DataMember { Value = "value", Rows = "rows" }'],
    [join(emit, 'src/position.d.ts'), 'export type Position = "top" | "bottom";'],
    [consumer, 'import {DataMember} from "@fixture/data"; import {Position} from "@/position"; export type Toolbar = { dataMember?: DataMember; position?: Position; gap?: number | string; enabled?: boolean };'],
  ])
  const sourceOptions: ts.CompilerOptions = {
    rootDir: root, outDir: emit, baseUrl: root,
    paths: {'@fixture/data': ['packages/data/index.ts'], '@/*': ['src/*']},
  }
  return {root, consumer, dependency, files, sourceOptions}
}

describe('ClassModel in-memory declaration graph', () => {
  it('uses current aliased enums and wildcard imports instead of stale package declarations', () => {
    const setup = fixture()
    const host = createInMemoryDeclarationCompilerHost(setup)
    // Only the consuming file is a root: virtual dependency directories must also resolve.
    const program = ClassModelDeclarationSchema.createProgram([setup.consumer], host)
    const source = program.getSourceFile(setup.consumer)
    const declaration = source?.statements.find(ts.isTypeAliasDeclaration)
    if (declaration === undefined) throw new Error('Missing Toolbar declaration')
    expect(new ClassModelDeclarationSchema(program).project(declaration)).toEqual({
      type: 'object', properties: {
        dataMember: {enum: ['value', 'rows']},
        position: {enum: ['top', 'bottom']},
        gap: {anyOf: [{type: 'string'}, {type: 'number'}]},
        enabled: {enum: [false, true]},
      }, additionalProperties: false,
    })
    expect(program.getSourceFiles().some(file => file.fileName.includes('node_modules/@fixture/data'))).toBe(false)
    expect(program.getSemanticDiagnostics()).toEqual([])
  })

  it('rejects a missing current alias target instead of falling back to an old dist', () => {
    const setup = fixture()
    setup.files.delete(setup.dependency)
    const host = createInMemoryDeclarationCompilerHost(setup)
    expect(() => ClassModelDeclarationSchema.createProgram([setup.consumer], host))
      .toThrow(/ClassModel.*@fixture\/data.*declaration/u)
  })

  it('projects enum members and their string values to one unique optional value set', () => {
    const setup = fixture()
    // eslint-disable-next-line no-template-curly-in-string -- The fixture is literal DTS source.
    setup.files.set(setup.consumer, 'import {DataMember} from "@fixture/data"; export type Toolbar = { dataMember?: DataMember | `${DataMember}` };')
    const program = ClassModelDeclarationSchema.createProgram([setup.consumer], createInMemoryDeclarationCompilerHost(setup))
    const declaration = program.getSourceFile(setup.consumer)?.statements.find(ts.isTypeAliasDeclaration)
    if (declaration === undefined) throw new Error('Missing Toolbar declaration')
    expect(new ClassModelDeclarationSchema(program).project(declaration)).toEqual({
      type: 'object', properties: {dataMember: {enum: ['value', 'rows']}}, additionalProperties: false,
    })
  })

  it('delivers property types and default documentation through the generated bundle guide', async () => {
    const setup = fixture()
    setup.files.set(setup.consumer, [
      'import {DataMember} from "@fixture/data";',
      '/** Toolbar configuration. */',
      'export type Toolbar = {',
      '  /** Current DataView member. */',
      '  dataMember?: DataMember;',
      '  /** Gap in pixels or CSS length.\n   * @default 8\n   */',
      '  gap?: number | string;',
      '}',
    ].join('\n'))
    const result = buildDtsClassModelBundle({repoRoot: setup.root, rootFiles: [...setup.files.keys()],
      outputDir: join(setup.root, 'generated'), compilerHost: createInMemoryDeclarationCompilerHost(setup)})
    const provider = createDtsBundleClassModelKnowledgeProvider({rootClassName: 'Toolbar',
      dtsClassModelManifestUrl: pathToFileURL(result.manifestPath).href,
      fetchJson: async url => JSON.parse(readFileSync(fileURLToPath(url), 'utf8')),
    })
    const guide = await provider.attributeGuide({kind: 'Toolbar', attributeName: 'gap'})
    expect(guide).toContain('Gap in pixels or CSS length.')
    expect(guide).toContain('@default 8')
    expect(guide).toContain('string | number')
    await expect(provider.attributeGuide({kind: 'Toolbar', attributeName: 'dataMember'})).resolves.toContain('"value"')
    await expect(provider.modelGuide({kind: 'Toolbar'})).resolves.toContain('@default 8')
  })
})
