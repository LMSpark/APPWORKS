import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  DTS_CLASS_MODEL_BUNDLE_PROTOCOL,
  DTS_CLASS_MODEL_BUNDLE_VERSION,
  DTS_FILE_PROJECTION_VERSION,
} from '../class-model/bundle/dts-bundle-types'
import { buildDtsClassModelBundle } from '../class-model/bundle/build-dts-class-model-bundle'
import { DtsClassModelBundleLoader } from '../class-model/bundle/dts-class-model-bundle-loader'
import { projectDtsFileProjection } from '../class-model/declaration/project-from-declarations'
import { createDtsBundleClassModelKnowledgeProvider } from '../knowledge'
import {
  readDtsClassModelBundleManifest,
  readDtsFileProjectionDocument,
} from '../class-model/bundle/read-dts-class-model-bundle-json'
import { sourceFileFromEmitPath } from '../class-model/bundle/class-model-emit-path'
import type { DtsTypeDeclarationModel } from '../class-model/types'

const removedReturnTypeField = ['return', 'Type'].join('')
const removedReturnTypeRefsField = ['return', 'Type', 'Refs'].join('')
const removedReturnTextField = ['return', 'Type', 'Text'].join('')
const removedParamsTextField = ['params', 'Type', 'Text'].join('')

function bundleSourcePath(sourcePath: string): string {
  return sourceFileFromEmitPath(sourcePath)
}

function expectClassModel(model: DtsTypeDeclarationModel | undefined, name: string): Extract<DtsTypeDeclarationModel, { declarationKind: 'class' }> {
  if (model?.declarationKind !== 'class') throw new Error(`Expected class model: ${name}`)
  return model
}

function expectInterfaceModel(model: DtsTypeDeclarationModel | undefined, name: string): Extract<DtsTypeDeclarationModel, { declarationKind: 'interface' }> {
  if (model?.declarationKind !== 'interface') throw new Error(`Expected interface model: ${name}`)
  return model
}

function expectTypeAliasModel(model: DtsTypeDeclarationModel | undefined, name: string): Extract<DtsTypeDeclarationModel, { declarationKind: 'typeAlias' }> {
  if (model?.declarationKind !== 'typeAlias') throw new Error(`Expected type alias model: ${name}`)
  return model
}

describe('readDtsClassModelBundleJson', () => {
  it('parses generated manifest with structural validation', () => {
    const tempRoot = resolve(tmpdir(), `spark-dts-class-model-manifest-${String(process.pid)}-${String(Date.now())}`)
    try {
      const sourcePath = 'class-model-emit/packages/spark-utils/src/ai-model.d.ts'
      const absolutePath = resolve(tempRoot, sourcePath)
      const outputDir = resolve(tempRoot, 'generated/dts-class-model')
      mkdirSync(dirname(absolutePath), { recursive: true })
      writeFileSync(absolutePath, [
        '/** AI editable model base. */',
        'export abstract class SparkAIModel {',
        '  /** Converts model state to JSON. */',
        '  abstract toJson(): Record<string, unknown>',
        '  /** Removes a model by module id. */',
        '  abstract remove(moduleId: string): boolean',
        '  /** Attaches another model. */',
        '  abstract attach(model: SparkAIModel): SparkAIModel',
        '}',
      ].join('\n'), 'utf8')

      const result = buildDtsClassModelBundle({
        repoRoot: tempRoot,
        rootFiles: [absolutePath],
        outputDir,
      })
      const raw: unknown = JSON.parse(readFileSync(result.manifestPath, 'utf8'))
      const manifest = readDtsClassModelBundleManifest(raw)
      expect(manifest.schemaVersion).toBe(DTS_CLASS_MODEL_BUNDLE_VERSION)
      expect(manifest.protocol).toBe(DTS_CLASS_MODEL_BUNDLE_PROTOCOL)
      expect(Object.keys(manifest.classIndex)).toContain('SparkAIModel')
      expect(Object.keys(manifest.files)).toContain(bundleSourcePath(sourcePath))
      expect(manifest.files[bundleSourcePath(sourcePath)]?.module).toMatchObject({
        name: '@spark-appworks/spark-utils:ai-model',
        sourceFile: 'packages/spark-utils/src/ai-model.ts',
        jsdocSource: 'inferred',
      })
      expect(manifest.files[bundleSourcePath(sourcePath)]?.module.symbols).toContain('SparkAIModel')
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('does not emit $ref to type aliases without persisted schema', () => {
    const tempRoot = resolve(tmpdir(), `spark-dts-class-model-ref-${String(process.pid)}-${String(Date.now())}`)
    try {
      const sourcePath = 'class-model-emit/packages/demo/src/adapter.d.ts'
      const absolutePath = resolve(tempRoot, sourcePath)
      const outputDir = resolve(tempRoot, 'generated/dts-class-model')
      mkdirSync(dirname(absolutePath), { recursive: true })
      writeFileSync(absolutePath, [
        '/** @module demo:adapter',
        ' * 职责：验证 schema ref 只指向实际存在的 $defs。',
        ' * 边界：只覆盖构造函数别名这种不可 JSON Schema 化的声明。',
        ' * AI用途：防止生成器把不可验证声明写成悬空 $ref。',
        ' */',
        '/** 构造函数别名，不应生成 JSON Schema $defs。 */',
        'export type Ctor = new (...args: never[]) => object',
        '/** 引用构造函数别名的可序列化命令。 */',
        'export type Command = Readonly<{',
        '  moduleClass: Ctor',
        '  name: string',
        '}>',
      ].join('\n'), 'utf8')

      buildDtsClassModelBundle({
        repoRoot: tempRoot,
        rootFiles: [absolutePath],
        outputDir,
      })
      const shardPath = resolve(outputDir, 'files', `${bundleSourcePath(sourcePath)}.json`)
      const shard = JSON.parse(readFileSync(shardPath, 'utf8')) as {
        $defs: Record<string, { properties?: Record<string, unknown> }>
      }

      expect(shard.$defs['Ctor']).toBeUndefined()
      expect(shard.$defs['Command']?.properties?.['moduleClass']).toEqual({
        type: 'object',
        title: 'Ctor',
      })
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('writes sorted manifest files and class index keys', () => {
    const tempRoot = resolve(tmpdir(), `spark-dts-class-model-sorted-${String(process.pid)}-${String(Date.now())}`)
    try {
      const alphaSourcePath = 'class-model-emit/packages/demo/src/alpha.d.ts'
      const zetaSourcePath = 'class-model-emit/packages/demo/src/zeta.d.ts'
      const alphaPath = resolve(tempRoot, alphaSourcePath)
      const zetaPath = resolve(tempRoot, zetaSourcePath)
      const outputDir = resolve(tempRoot, 'generated/dts-class-model')
      mkdirSync(dirname(alphaPath), { recursive: true })
      mkdirSync(dirname(zetaPath), { recursive: true })
      writeFileSync(alphaPath, [
        '/** Alpha model. */',
        'export class Alpha {',
        '  /** Creates Alpha. */',
        '  constructor()',
        '}',
      ].join('\n'), 'utf8')
      writeFileSync(zetaPath, [
        '/** Zeta model. */',
        'export class Zeta {',
        '  /** Creates Zeta. */',
        '  constructor()',
        '}',
      ].join('\n'), 'utf8')

      const result = buildDtsClassModelBundle({
        repoRoot: tempRoot,
        rootFiles: [zetaPath, alphaPath],
        outputDir,
      })
      const manifest = JSON.parse(readFileSync(result.manifestPath, 'utf8')) as {
        files: Record<string, unknown>
        classIndex: Record<string, unknown>
      }

      expect(Object.keys(manifest.files)).toEqual([bundleSourcePath(alphaSourcePath), bundleSourcePath(zetaSourcePath)])
      expect(Object.keys(manifest.classIndex)).toEqual(['Alpha', 'Zeta'])
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('keeps private declarations in shards without adding them to the global class index', () => {
    const tempRoot = resolve(tmpdir(), `spark-dts-class-model-private-${String(process.pid)}-${String(Date.now())}`)
    try {
      const firstSourcePath = 'class-model-emit/packages/demo/src/first.d.ts'
      const secondSourcePath = 'class-model-emit/packages/demo/src/second.d.ts'
      const firstPath = resolve(tempRoot, firstSourcePath)
      const secondPath = resolve(tempRoot, secondSourcePath)
      const outputDir = resolve(tempRoot, 'generated/dts-class-model')
      mkdirSync(dirname(firstPath), { recursive: true })
      writeFileSync(firstPath, 'type Props = { first: string }\nexport type FirstApi = { props: Props }\n', 'utf8')
      writeFileSync(secondPath, 'type Props = { second: string }\nexport type SecondApi = { props: Props }\n', 'utf8')

      const result = buildDtsClassModelBundle({
        repoRoot: tempRoot,
        rootFiles: [firstPath, secondPath],
        outputDir,
      })

      expect(result.manifest.duplicates).toBeUndefined()
      expect(Object.keys(result.manifest.classIndex)).toEqual(['FirstApi', 'SecondApi'])
      const firstEntry = result.manifest.files[bundleSourcePath(firstSourcePath)]
      if (firstEntry === undefined) throw new Error('Missing first private-symbol shard.')
      const firstProjection = readDtsFileProjectionDocument(
        JSON.parse(readFileSync(resolve(outputDir, firstEntry.file), 'utf8')),
      )
      expect(firstProjection.symbols).toEqual(['FirstApi'])
      expect(firstProjection.models['Props']).toBeDefined()
      expect(firstProjection.models['FirstApi']).toBeDefined()
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('parses a generated per-file projection shard', () => {
    const tempRoot = resolve(tmpdir(), `spark-dts-class-model-shard-${String(process.pid)}-${String(Date.now())}`)
    try {
      const sourcePath = 'class-model-emit/packages/spark-utils/src/ai-model.d.ts'
      const absolutePath = resolve(tempRoot, sourcePath)
      const sourceTsPath = resolve(tempRoot, 'packages/spark-utils/src/ai-model.ts')
      const outputDir = resolve(tempRoot, 'generated/dts-class-model')
      mkdirSync(dirname(sourceTsPath), { recursive: true })
      writeFileSync(sourceTsPath, '/** AI editable model base. */\n', 'utf8')
      mkdirSync(dirname(absolutePath), { recursive: true })
      writeFileSync(absolutePath, [
        '/** AI editable model base. */',
        'export abstract class SparkAIModel {',
        '  /** Converts model state to JSON. */',
        '  abstract toJson(): Record<string, unknown>',
        '  /** Removes a model by module id. */',
        '  abstract remove(moduleId: string): boolean',
        '  /** Attaches another model. */',
        '  abstract attach(model: SparkAIModel): SparkAIModel',
        '}',
      ].join('\n'), 'utf8')

      const result = buildDtsClassModelBundle({
        repoRoot: tempRoot,
        rootFiles: [absolutePath],
        outputDir,
      })
      const entry = result.manifest.files[bundleSourcePath(sourcePath)]
      if (entry === undefined) throw new Error(`Missing test shard entry: ${sourcePath}`)
      const raw: unknown = JSON.parse(readFileSync(resolve(outputDir, entry.file), 'utf8'))
      const projection = readDtsFileProjectionDocument(raw)
      const rawRecord = raw as {
        models?: Record<string, {
          classDecl?: {
            constructorMeta?: Record<string, unknown>
            members?: {
              methods?: Array<Record<string, unknown>>
            }
          }
        }>
      }
      const sparkModel = expectClassModel(projection.models['SparkAIModel'], 'SparkAIModel')
      expect(projection.schemaVersion).toBe(DTS_FILE_PROJECTION_VERSION)
      expect(projection.module).toMatchObject({
        name: '@spark-appworks/spark-utils:ai-model',
        sourceFile: 'packages/spark-utils/src/ai-model.ts',
        modulePath: 'ai-model',
        jsdocSource: 'source-file-jsdoc',
      })
      expect(projection.symbols).toContain('SparkAIModel')
      expect(projection.generatedAt).toBe(statSync(sourceTsPath).mtime.toISOString())
      expect(projection.models['SparkAIModel']?.jsonSchema).toMatchObject({
        type: 'object',
        title: 'SparkAIModel',
      })
      expect(Object.keys(projection.models)).toContain('SparkAIModel')
      expect(rawRecord.models?.['SparkAIModel']?.classDecl?.constructorMeta).not.toHaveProperty('paramsSchema')
      expect(rawRecord.models?.['SparkAIModel']?.classDecl?.constructorMeta).toHaveProperty('parameters', [])
      expect(sparkModel.classDecl.constructorMeta.signatureText).toBe('constructor()')
      expect(sparkModel.classDecl.constructorMeta.paramsSchema).toMatchObject({
        type: 'object',
        properties: {},
        additionalProperties: false,
      })
      const rawToJsonMethod = rawRecord.models?.['SparkAIModel']?.classDecl?.members?.methods
        ?.find(method => method['name'] === 'toJson')
      expect(rawToJsonMethod).toHaveProperty('parameters', [])
      const removeMethod = sparkModel.classDecl.members.methods.find(method => method.name === 'remove')
      const rawRemoveMethod = rawRecord.models?.['SparkAIModel']?.classDecl?.members?.methods
        ?.find(method => method['name'] === 'remove')
      expect(Object.keys(rawRemoveMethod ?? {})).toEqual([
        'name',
        'jsdoc',
        'parameters',
        'type',
      ])
      expect(rawRemoveMethod).not.toHaveProperty('paramsSchema')
      expect(rawRemoveMethod).not.toHaveProperty('returnSchema')
      expect(rawRemoveMethod).not.toHaveProperty(removedReturnTypeField)
      expect(rawRemoveMethod).not.toHaveProperty('signatureText')
      expect(removeMethod?.signatureText).toContain('remove(moduleId: string): boolean')
      expect(removeMethod?.parameterStyle).toBe('positional')
      expect(removeMethod?.parameters).toEqual([{
        name: 'moduleId',
        type: { type: 'intrinsic', name: 'string' },
      }])
      expect(removeMethod?.type).toEqual({ type: 'intrinsic', name: 'boolean' })
      expect(removeMethod).not.toHaveProperty(removedReturnTypeField)
      expect(removeMethod).not.toHaveProperty(removedReturnTypeRefsField)
      expect(removeMethod).not.toHaveProperty(removedReturnTextField)
      expect(removeMethod?.paramsSchema).toMatchObject({
        type: 'object',
        properties: {
          moduleId: { type: 'string' },
        },
      })
      expect(removeMethod?.returnSchema).toEqual({ type: 'boolean' })
      expect(removeMethod).not.toHaveProperty(removedParamsTextField)
      expect(removeMethod).not.toHaveProperty('provenance')
      const attachMethod = sparkModel.classDecl.members.methods.find(method => method.name === 'attach')
      expect(attachMethod?.signatureText).toContain('attach(model: SparkAIModel): SparkAIModel')
      expect(attachMethod?.parameterStyle).toBe('positional')
      expect(attachMethod?.parameters).toEqual([{
        name: 'model',
        type: {
          type: 'reference',
          name: 'SparkAIModel',
          sourcePath: bundleSourcePath(sourcePath),
        },
      }])
      expect(attachMethod).not.toHaveProperty(removedReturnTextField)
      expect(attachMethod?.type).toEqual({
        type: 'reference',
        name: 'SparkAIModel',
        sourcePath: bundleSourcePath(sourcePath),
      })
      expect(attachMethod).not.toHaveProperty(removedReturnTypeField)
      expect(attachMethod).not.toHaveProperty(removedReturnTypeRefsField)
      expect(attachMethod?.paramsSchema).toMatchObject({
        type: 'object',
        properties: {
          model: { $ref: '#/$defs/SparkAIModel' },
        },
      })
      expect(attachMethod?.returnSchema).toEqual({ $ref: '#/$defs/SparkAIModel' })
      expect(attachMethod).not.toHaveProperty(removedParamsTextField)
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('classifies spark component declarations from dts paths', () => {
    const cases = [
      {
        sourcePath: 'class-model-emit/packages/spark-component/src/components/containers/data-views/RendererTable/RendererTable.props.d.ts',
        declaration: 'export type RTableProps = { dataViewKey?: string }',
        className: 'RTableProps',
        expected: {
          componentName: 'RendererTable',
          componentType: 'r-table',
          componentLevel: 'table-level',
          componentLayer: 'data-view-container',
          componentDirectory: 'containers/data-views',
        },
      },
      {
        sourcePath: 'class-model-emit/packages/spark-component/src/components/containers/layout/RendererSection/RendererSection.props.d.ts',
        declaration: 'export type RSectionProps = { title?: string }',
        className: 'RSectionProps',
        expected: {
          componentName: 'RendererSection',
          componentType: 'r-section',
          componentLevel: 'container',
          componentLayer: 'layout-container',
          componentDirectory: 'containers/layout',
        },
      },
      {
        sourcePath: 'class-model-emit/packages/spark-component/src/components/fields/data-components/FieldText.props.d.ts',
        declaration: 'export type RTextProps = { field?: string }',
        className: 'RTextProps',
        expected: {
          componentName: 'FieldText',
          componentType: 'r-text',
          componentLevel: 'field-level',
          componentLayer: 'data-field',
          componentDirectory: 'fields/data-components',
        },
      },
      {
        sourcePath: 'class-model-emit/packages/spark-component/src/components/containers/support/scope/RendererFieldScope.vue.d.ts',
        declaration: 'export type RendererFieldScopeProps = { row?: unknown }',
        className: 'RendererFieldScopeProps',
        expected: {
          componentName: 'RendererFieldScope',
          componentType: 'r-field-scope',
          componentLevel: 'row-level',
          componentLayer: 'row-scope',
          componentDirectory: 'containers/support',
        },
      },
    ]
    const tempRoot = resolve(tmpdir(), `spark-dts-class-model-${String(process.pid)}-${String(Date.now())}`)
    try {
      for (const item of cases) {
        const absolutePath = resolve(tempRoot, item.sourcePath)
        mkdirSync(dirname(absolutePath), { recursive: true })
        writeFileSync(absolutePath, `${item.declaration}\n`, 'utf8')
        const projection = projectDtsFileProjection({ repoRoot: tempRoot, absolutePath })
        expect(projection.models[item.className]?.provenance).toMatchObject(item.expected)
        expect(projection.module).toMatchObject(item.expected)
        expect(projection.module.jsdoc).toContain(String(item.expected.componentLayer))
      }
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('persists component profile without provenance while keeping query consumption', async () => {
    const tempRoot = resolve(tmpdir(), `spark-dts-class-model-component-profile-${String(process.pid)}-${String(Date.now())}`)
    const sourcePath = 'class-model-emit/packages/spark-component/src/components/fields/data-components/FieldText.props.d.ts'
    const absolutePath = resolve(tempRoot, sourcePath)
    const outputDir = resolve(tempRoot, 'generated/dts-class-model')
    const expectedComponent = {
      name: 'FieldText',
      type: 'r-text',
      level: 'field-level',
      layer: 'data-field',
      directory: 'fields/data-components',
    }
    try {
      mkdirSync(dirname(absolutePath), { recursive: true })
      writeFileSync(absolutePath, [
        '/** FieldText component props. */',
        'export type RTextProps = {',
        '  /** Bound field name. */',
        '  field?: string',
        '}',
      ].join('\n'), 'utf8')

      const result = buildDtsClassModelBundle({
        repoRoot: tempRoot,
        rootFiles: [absolutePath],
        outputDir,
      })
      const entry = result.manifest.files[bundleSourcePath(sourcePath)]
      if (entry === undefined) throw new Error(`Missing component shard entry: ${sourcePath}`)
      expect(result.manifest.componentIndex?.entries['RTextProps']).toEqual({
        className: 'RTextProps',
        sourcePath: bundleSourcePath(sourcePath),
        file: entry.file,
        component: expectedComponent,
      })
      expect(result.manifest.componentIndex?.byLevel['field-level']).toEqual(['RTextProps'])
      expect(result.manifest.componentIndex?.byLayer['data-field']).toEqual(['RTextProps'])
      expect(result.manifest.componentIndex?.byType['r-text']).toEqual(['RTextProps'])
      const raw: unknown = JSON.parse(readFileSync(resolve(outputDir, entry.file), 'utf8'))
      const rawRecord = raw as {
        models?: Record<string, {
          component?: unknown
          typeAlias?: {
            members?: {
              attributes?: Array<Record<string, unknown>>
            }
          }
        }>
      }
      const rawModel = rawRecord.models?.['RTextProps']
      expect(JSON.stringify(raw)).not.toContain('"provenance"')
      expect(rawModel?.component).toEqual(expectedComponent)
      expect(rawModel).not.toHaveProperty('provenance')
      expect(rawModel?.typeAlias?.members?.attributes?.[0]).not.toHaveProperty('provenance')

      const projection = readDtsFileProjectionDocument(raw)
      expect(projection.models['RTextProps']?.component).toEqual(expectedComponent)
      expect(projection.models['RTextProps']).not.toHaveProperty('provenance')

      const fetchedFiles: string[] = []
      const loader = new DtsClassModelBundleLoader({
        manifestUrl: pathToFileURL(result.manifestPath).href,
        fetchJson: async (url) => {
          const filePath = fileURLToPath(url)
          fetchedFiles.push(relative(outputDir, filePath).replace(/\\/gu, '/'))
          return JSON.parse(readFileSync(filePath, 'utf8')) as unknown
        },
      })
      const componentEntries = await loader.listComponentIndexEntries({ level: 'field-level' })
      expect(componentEntries.map(componentEntry => componentEntry.className)).toEqual(['RTextProps'])
      expect(fetchedFiles).toEqual([
        relative(outputDir, result.manifestPath).replace(/\\/gu, '/'),
      ])
      await expect(loader.ensureComponentQuery({ type: 'r-text' })).resolves.toEqual(['RTextProps'])
      expect(fetchedFiles).toEqual([
        relative(outputDir, result.manifestPath).replace(/\\/gu, '/'),
        entry.file,
      ])

      const provider = createDtsBundleClassModelKnowledgeProvider({
        dtsClassModelManifestUrl: pathToFileURL(result.manifestPath).href,
        rootClassName: 'RTextProps',
        fetchJson: async url => JSON.parse(readFileSync(fileURLToPath(url), 'utf8')) as unknown,
      })
      await provider.init()
      const query = await provider.query({ keyword: 'r-text', includeMembers: false })
      const payload = query as {
        models?: Array<{
          kind?: string
          component?: unknown
        }>
      }
      const queryModel = payload.models?.find(item => item.kind === 'RTextProps')
      expect(queryModel?.component).toEqual(expectedComponent)
      const indexedQuery = await provider.query({ componentLevel: 'field-level', includeMembers: false })
      const indexedPayload = indexedQuery as {
        models?: Array<{
          kind?: string
          component?: unknown
        }>
      }
      const indexedModel = indexedPayload.models?.find(item => item.kind === 'RTextProps')
      expect(indexedModel?.component).toEqual(expectedComponent)
      await expect(provider.modelGuide({ kind: 'RTextProps' })).resolves.toContain('SPARK component type=r-text')
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('captures module-level leading jsdoc before imports', () => {
    const tempRoot = resolve(tmpdir(), `spark-dts-class-model-module-${String(process.pid)}-${String(Date.now())}`)
    const sourcePath = 'class-model-emit/packages/spark-project-model/src/project/project-workspace.d.ts'
    const absolutePath = resolve(tempRoot, sourcePath)
    try {
      mkdirSync(dirname(absolutePath), { recursive: true })
      writeFileSync(absolutePath, [
        '/**',
        ' * ProjectWorkspace module boundary.',
        ' * Owns project editing IO and delegates state to ProjectModel.',
        ' */',
        "import type { HttpClientBase } from '@spark-appworks/spark-utils'",
        '/** Workspace options. */',
        'export type ProjectWorkspaceOptions = { http: HttpClientBase }',
      ].join('\n'), 'utf8')

      const projection = projectDtsFileProjection({ repoRoot: tempRoot, absolutePath })
      expect(projection.module).toMatchObject({
        name: '@spark-appworks/spark-project-model:project/project-workspace',
        sourceFile: 'packages/spark-project-model/src/project/project-workspace.ts',
        modulePath: 'project/project-workspace',
        jsdocSource: 'leading-jsdoc',
      })
      expect(projection.module.jsdoc).toContain('ProjectWorkspace module boundary')
      expect(projection.models['ProjectWorkspaceOptions']?.jsdoc).toContain('Workspace options')
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('normalizes class member jsdoc without raw comment delimiters', () => {
    const tempRoot = resolve(tmpdir(), `spark-dts-class-model-member-jsdoc-${String(process.pid)}-${String(Date.now())}`)
    const sourcePath = 'class-model-emit/packages/spark-ai/src/agent/business/demo-registry.d.ts'
    const absolutePath = resolve(tempRoot, sourcePath)
    try {
      mkdirSync(dirname(absolutePath), { recursive: true })
      writeFileSync(absolutePath, [
        '/** Registry model used by the host. */',
        'export class DemoRegistry {',
        '  /**',
        '   * Registers a business entry.',
        '   *',
        '   * @param moduleId stable business module id.',
        '   * @returns true when the entry is accepted.',
        '   */',
        '  register(moduleId: string): boolean',
        '}',
      ].join('\n'), 'utf8')

      const projection = projectDtsFileProjection({ repoRoot: tempRoot, absolutePath })
      const model = projection.models['DemoRegistry']
      const demoRegistry = expectClassModel(model, 'DemoRegistry')
      const method = demoRegistry.classDecl.members.methods.find(item => item.name === 'register')

      expect(model?.jsdoc).toBe('Registry model used by the host.')
      expect(method?.jsdoc).toContain('Registers a business entry.')
      expect(method?.jsdoc).toContain('@param moduleId')
      expect(method?.jsdoc).toContain('@returns true when the entry is accepted.')
      expect(method?.jsdoc).not.toContain('/**')
      expect(method?.jsdoc).not.toContain('*/')
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('captures module-level source file comments when dts cannot carry them', () => {
    const tempRoot = resolve(tmpdir(), `spark-dts-class-model-source-module-${String(process.pid)}-${String(Date.now())}`)
    const sourcePath = 'class-model-emit/packages/spark-component/src/components/containers/layout/RendererButton.vue.d.ts'
    const absolutePath = resolve(tempRoot, sourcePath)
    const vueSourcePath = resolve(tempRoot, 'packages/spark-component/src/components/containers/layout/RendererButton.vue')
    try {
      mkdirSync(dirname(absolutePath), { recursive: true })
      mkdirSync(dirname(vueSourcePath), { recursive: true })
      writeFileSync(vueSourcePath, [
        '<!--',
        '@module RendererButton',
        'RendererButton 模块封装按钮容器的显示、动作触发和禁用态语义。',
        '-->',
        '<template><button /></template>',
      ].join('\n'), 'utf8')
      writeFileSync(absolutePath, [
        '/** Button props. */',
        'export type RButtonProps = { text?: string }',
      ].join('\n'), 'utf8')

      const projection = projectDtsFileProjection({ repoRoot: tempRoot, absolutePath })
      expect(projection.module).toMatchObject({
        sourceFile: 'packages/spark-component/src/components/containers/layout/RendererButton.vue',
        jsdocSource: 'source-file-jsdoc',
        componentName: 'RendererButton',
      })
      expect(projection.module.jsdoc).toContain('按钮容器')
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('preserves raw declaration relations from dts syntax', () => {
    const tempRoot = resolve(tmpdir(), `spark-dts-class-model-relations-${String(process.pid)}-${String(Date.now())}`)
    const sourcePath = 'class-model-emit/packages/spark-component/src/components/fields/data-components/FieldText.props.d.ts'
    const absolutePath = resolve(tempRoot, sourcePath)
    try {
      mkdirSync(dirname(absolutePath), { recursive: true })
      writeFileSync(absolutePath, [
        'export type SparkNodeProps = { id?: string }',
        'export type SparkFieldSemanticProps<T> = { value?: T }',
        'export interface RBaseProps { base?: string }',
        'export interface RDerivedProps extends RBaseProps { label?: string }',
        'export type RTextProps = SparkNodeProps & SparkFieldSemanticProps<string>',
      ].join('\n'), 'utf8')

      const projection = projectDtsFileProjection({ repoRoot: tempRoot, absolutePath })
      const derivedProps = expectInterfaceModel(projection.models['RDerivedProps'], 'RDerivedProps')
      const textProps = expectTypeAliasModel(projection.models['RTextProps'], 'RTextProps')
      expect(derivedProps.interfaceDecl.declarationRelations).toEqual([
        {
          kind: 'extends',
          typeText: 'RBaseProps',
          targetName: 'RBaseProps',
        },
      ])
      expect(textProps.typeAlias.declarationTypeText)
        .toBe('SparkNodeProps & SparkFieldSemanticProps<string>')
      expect(textProps.typeAlias.declarationRelations).toEqual([
        {
          kind: 'intersection',
          typeText: 'SparkNodeProps',
          targetName: 'SparkNodeProps',
        },
        {
          kind: 'intersection',
          typeText: 'SparkFieldSemanticProps<string>',
          targetName: 'SparkFieldSemanticProps',
        },
      ])
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('resolves cross-file dts refs through the bundle loader', async () => {
    const tempRoot = resolve(tmpdir(), `spark-dts-class-model-cross-ref-${String(process.pid)}-${String(Date.now())}`)
    const registrationSourcePath = 'class-model-emit/packages/spark-ai/src/agent/business/registration-types.d.ts'
    const registrySourcePath = 'class-model-emit/packages/spark-ai/src/agent/business/business-registry.d.ts'
    const registrationPath = resolve(tempRoot, registrationSourcePath)
    const registryPath = resolve(tempRoot, registrySourcePath)
    const outputDir = resolve(tempRoot, 'generated/dts-class-model')
    try {
      mkdirSync(dirname(registrationPath), { recursive: true })
      writeFileSync(registrationPath, [
        '/** Business registration passed into the host registry. */',
        'export type AiAgentRegistration<TInput = unknown> = {',
        '  /** Stable business module id. */',
        '  moduleId: string',
        '  /** Business input contract carried by the registration. */',
        '  input?: TInput',
        '}',
      ].join('\n'), 'utf8')
      writeFileSync(registryPath, [
        "import type { AiAgentRegistration } from './registration-types'",
        '/** Host registry for AI business registrations. */',
        'export class AiAgentRegistry<TInput = unknown> {',
        '  /** Stores a registration for later session resolution. */',
        '  register(registration: AiAgentRegistration<TInput>): void',
        '  /** Resolves a registration by module id. */',
        '  get(moduleId: string): AiAgentRegistration<TInput>',
        '}',
      ].join('\n'), 'utf8')

      const result = buildDtsClassModelBundle({
        repoRoot: tempRoot,
        rootFiles: [registrationPath, registryPath],
        outputDir,
      })
      const registryEntry = result.manifest.files[bundleSourcePath(registrySourcePath)]
      if (registryEntry === undefined) throw new Error(`Missing registry shard entry: ${registrySourcePath}`)
      const registryProjection = readDtsFileProjectionDocument(
        JSON.parse(readFileSync(resolve(outputDir, registryEntry.file), 'utf8')) as unknown,
      )
      const registryModel = expectClassModel(registryProjection.models['AiAgentRegistry'], 'AiAgentRegistry')
      const registerMethod = registryModel.classDecl.members.methods.find(method => method.name === 'register')

      expect(registerMethod?.signatureText).toBe('register(registration: AiAgentRegistration<TInput>): void')
      expect(registerMethod?.parameterStyle).toBe('positional')
      expect(registerMethod?.parameters).toEqual([{
        name: 'registration',
        type: {
          type: 'reference',
          name: 'AiAgentRegistration',
          sourcePath: bundleSourcePath(registrationSourcePath),
          typeArguments: [{
            type: 'reference',
            name: 'TInput',
            refersToTypeParameter: true,
          }],
        },
      }])
      expect(registerMethod).not.toHaveProperty(removedReturnTextField)
      expect(registerMethod?.type).toEqual({ type: 'intrinsic', name: 'void' })
      expect(registerMethod).not.toHaveProperty(removedReturnTypeField)
      expect(registerMethod).not.toHaveProperty(removedReturnTypeRefsField)
      expect(registerMethod?.paramsSchema).toMatchObject({
        type: 'object',
        properties: {
          registration: {
            $ref: 'registration-types.ts.json#/$defs/AiAgentRegistration',
          },
        },
      })
      expect(registerMethod?.returnSchema).toBe(true)

      const fetchedFiles: string[] = []
      const loader = new DtsClassModelBundleLoader({
        manifestUrl: pathToFileURL(result.manifestPath).href,
        fetchJson: async (url) => {
          const filePath = fileURLToPath(url)
          fetchedFiles.push(relative(outputDir, filePath).replace(/\\/gu, '/'))
          return JSON.parse(readFileSync(filePath, 'utf8')) as unknown
        },
      })
      const reachable = await loader.ensureReachableClosure('AiAgentRegistry')
      const surface = loader.buildLoadedSurface()

      expect(reachable).toContain('AiAgentRegistry')
      expect(reachable).toContain('AiAgentRegistration')
      expect(Object.keys(surface.models)).toEqual(expect.arrayContaining([
        'AiAgentRegistry',
        'AiAgentRegistration',
      ]))
      expect(fetchedFiles).toEqual([
        relative(outputDir, result.manifestPath).replace(/\\/gu, '/'),
        registryEntry.file,
        result.manifest.files[bundleSourcePath(registrationSourcePath)]?.file,
      ])
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('projects constructor into guide shard and knowledge surface', async () => {
    const tempRoot = resolve(tmpdir(), `spark-dts-class-model-constructor-${String(process.pid)}-${String(Date.now())}`)
    const optionsSourcePath = 'class-model-emit/packages/spark-ai/src/agent/business/widget-options.d.ts'
    const widgetSourcePath = 'class-model-emit/packages/spark-ai/src/agent/business/widget.d.ts'
    const optionsPath = resolve(tempRoot, optionsSourcePath)
    const widgetPath = resolve(tempRoot, widgetSourcePath)
    const outputDir = resolve(tempRoot, 'generated/dts-class-model')
    try {
      mkdirSync(dirname(optionsPath), { recursive: true })
      writeFileSync(optionsPath, [
        '/** Options used to create a widget. */',
        'export type WidgetOptions = {',
        '  /** Stable widget id. */',
        '  id: string',
        '}',
      ].join('\n'), 'utf8')
      writeFileSync(widgetPath, [
        "import type { WidgetOptions } from './widget-options'",
        '/** Runtime widget created from typed options. */',
        'export class Widget {',
        '  /** Creates a widget from typed options. */',
        '  constructor(options: WidgetOptions, label?: string)',
        '  /** Stable widget id. */',
        '  readonly id: string',
        '}',
      ].join('\n'), 'utf8')

      const result = buildDtsClassModelBundle({
        repoRoot: tempRoot,
        rootFiles: [optionsPath, widgetPath],
        outputDir,
      })
      const widgetEntry = result.manifest.files[bundleSourcePath(widgetSourcePath)]
      if (widgetEntry === undefined) throw new Error(`Missing widget shard entry: ${widgetSourcePath}`)
      const widgetProjection = readDtsFileProjectionDocument(
        JSON.parse(readFileSync(resolve(outputDir, widgetEntry.file), 'utf8')) as unknown,
      )
      const widgetModel = expectClassModel(widgetProjection.models['Widget'], 'Widget')
      expect(widgetModel.classDecl.constructorMeta.signatureText).toContain('constructor(options: WidgetOptions, label?: string)')
      expect(widgetModel.classDecl.constructorMeta.parameters?.map(parameter => parameter.name)).toEqual(['options', 'label'])

      const provider = createDtsBundleClassModelKnowledgeProvider({
        dtsClassModelManifestUrl: pathToFileURL(result.manifestPath).href,
        rootClassName: 'Widget',
        fetchJson: async url => JSON.parse(readFileSync(fileURLToPath(url), 'utf8')) as unknown,
      })
      await provider.init()
      const query = await provider.query({ includeMembers: true })
      const payload = query as {
        models?: Array<{
          kind?: string
          constructorSignature?: { jsdoc?: string; signature?: string }
        }>
      }
      const queryWidget = payload.models?.find(item => item.kind === 'Widget')
      expect(queryWidget?.constructorSignature?.signature).toContain('constructor(options: WidgetOptions, label?: string)')
      expect(queryWidget?.constructorSignature?.jsdoc).toContain('Creates a widget')
      expect(payload.models?.map(model => model.kind)).toContain('WidgetOptions')
      await expect(provider.modelGuide({ kind: 'Widget' })).resolves.toContain(
        'constructor(options: WidgetOptions, label?: string)',
      )
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('preserves private constructor metadata from DTS classes', () => {
    const tempRoot = resolve(tmpdir(), `spark-dts-class-model-private-constructor-${String(process.pid)}-${String(Date.now())}`)
    const sourcePath = 'class-model-emit/packages/spark-ai/src/agent/business/private-host.d.ts'
    const absolutePath = resolve(tempRoot, sourcePath)
    const outputDir = resolve(tempRoot, 'generated/dts-class-model')
    try {
      mkdirSync(dirname(absolutePath), { recursive: true })
      writeFileSync(absolutePath, [
        '/** Host with factory-only construction. */',
        'export class PrivateHost {',
        '  private constructor()',
        '  /** Static factory. */',
        '  static create(): PrivateHost',
        '}',
      ].join('\n'), 'utf8')

      const result = buildDtsClassModelBundle({
        repoRoot: tempRoot,
        rootFiles: [absolutePath],
        outputDir,
      })
      const entry = result.manifest.files[bundleSourcePath(sourcePath)]
      if (entry === undefined) throw new Error(`Missing private host shard entry: ${sourcePath}`)
      const projection = readDtsFileProjectionDocument(
        JSON.parse(readFileSync(resolve(outputDir, entry.file), 'utf8')) as unknown,
      )

      const privateHost = expectClassModel(projection.models['PrivateHost'], 'PrivateHost')
      expect(privateHost.classDecl.constructorMeta.signatureText).toBe('private constructor()')
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('resolves named import aliases to the original dts symbol', () => {
    const tempRoot = resolve(tmpdir(), `spark-dts-class-model-import-alias-${String(process.pid)}-${String(Date.now())}`)
    const registrationSourcePath = 'class-model-emit/packages/spark-ai/src/agent/business/registration-types.d.ts'
    const registrySourcePath = 'class-model-emit/packages/spark-ai/src/agent/business/business-registry.d.ts'
    const registrationPath = resolve(tempRoot, registrationSourcePath)
    const registryPath = resolve(tempRoot, registrySourcePath)
    const outputDir = resolve(tempRoot, 'generated/dts-class-model')
    try {
      mkdirSync(dirname(registrationPath), { recursive: true })
      writeFileSync(registrationPath, [
        '/** Business registration passed into the host registry. */',
        'export type AiAgentRegistration = {',
        '  moduleId: string',
        '}',
      ].join('\n'), 'utf8')
      writeFileSync(registryPath, [
        "import type { AiAgentRegistration as RegistrationSpec } from './registration-types'",
        '/** Host registry for AI business registrations. */',
        'export class AiAgentRegistry {',
        '  /** Stores a registration for later session resolution. */',
        '  register(registration: RegistrationSpec): void',
        '}',
      ].join('\n'), 'utf8')

      const result = buildDtsClassModelBundle({
        repoRoot: tempRoot,
        rootFiles: [registrationPath, registryPath],
        outputDir,
      })
      const registryEntry = result.manifest.files[bundleSourcePath(registrySourcePath)]
      if (registryEntry === undefined) throw new Error(`Missing registry shard entry: ${registrySourcePath}`)
      const registryProjection = readDtsFileProjectionDocument(
        JSON.parse(readFileSync(resolve(outputDir, registryEntry.file), 'utf8')) as unknown,
      )
      const registryModel = expectClassModel(registryProjection.models['AiAgentRegistry'], 'AiAgentRegistry')
      const registerMethod = registryModel.classDecl.members.methods.find(method => method.name === 'register')

      expect(registerMethod?.parameters?.[0]?.type).toEqual({
        type: 'reference',
        name: 'AiAgentRegistration',
        sourcePath: bundleSourcePath(registrationSourcePath),
      })
      expect(registerMethod?.paramsSchema).toMatchObject({
        type: 'object',
        properties: {
          registration: {
            $ref: 'registration-types.ts.json#/$defs/AiAgentRegistration',
          },
        },
      })
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('projects readonly host ensure commands with create return links', async () => {
    const tempRoot = resolve(tmpdir(), `spark-dts-class-model-host-ensure-${String(process.pid)}-${String(Date.now())}`)
    const registrationSourcePath = 'class-model-emit/packages/spark-ai/src/agent/business/registration-types.d.ts'
    const hostSourcePath = 'class-model-emit/packages/spark-ai/src/agent/business/ai-host.d.ts'
    const registrationPath = resolve(tempRoot, registrationSourcePath)
    const hostPath = resolve(tempRoot, hostSourcePath)
    const outputDir = resolve(tempRoot, 'generated/dts-class-model')
    try {
      mkdirSync(dirname(registrationPath), { recursive: true })
      writeFileSync(registrationPath, [
        '/** Business registration created by a host factory. */',
        'export type AiAgentRegistration = {',
        '  /** Unique business module id. */',
        '  moduleId: string',
        '}',
      ].join('\n'), 'utf8')
      writeFileSync(hostPath, [
        "import type { AiAgentRegistration } from './registration-types'",
        '/** ensure 命令：延迟创建 registration 的工厂指令。 */',
        'export type AiAgentHostEnsureCommand = Readonly<{',
        '  /** Expected module id. */',
        '  moduleId: string',
        '  /** Factory that creates the business registration. */',
        '  create: () => AiAgentRegistration',
        '}>',
        '/** Host that accepts business factories. */',
        'export class AiAgentHost {',
        '  /** Ensures a business registration exists. */',
        '  ensure(alias: string, command: AiAgentHostEnsureCommand): AiAgentHost',
        '}',
      ].join('\n'), 'utf8')

      const result = buildDtsClassModelBundle({
        repoRoot: tempRoot,
        rootFiles: [registrationPath, hostPath],
        outputDir,
      })
      const hostEntry = result.manifest.files[bundleSourcePath(hostSourcePath)]
      if (hostEntry === undefined) throw new Error(`Missing host shard entry: ${hostSourcePath}`)
      const hostProjection = readDtsFileProjectionDocument(
        JSON.parse(readFileSync(resolve(outputDir, hostEntry.file), 'utf8')) as unknown,
      )
      const commandModel = hostProjection.models['AiAgentHostEnsureCommand']
      if (commandModel === undefined) throw new Error('Missing AiAgentHostEnsureCommand model.')
      const commandType = expectTypeAliasModel(commandModel, 'AiAgentHostEnsureCommand')
      expect(commandType.typeAlias.members.attributes.map(attribute => attribute.name)).toEqual(['moduleId'])
      expect(commandType.typeAlias.members.methods.map(method => method.name)).toEqual(['create'])
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('creates a DTS bundle knowledge provider from manifest/root/fetchJson', async () => {
    const tempRoot = resolve(tmpdir(), `spark-dts-class-model-knowledge-${String(process.pid)}-${String(Date.now())}`)
    const sourcePath = 'class-model-emit/packages/spark-ai/src/agent/business/business-registry.d.ts'
    const absolutePath = resolve(tempRoot, sourcePath)
    const outputDir = resolve(tempRoot, 'generated/dts-class-model')
    try {
      mkdirSync(dirname(absolutePath), { recursive: true })
      writeFileSync(absolutePath, [
        '/** Host registry for AI business registrations. */',
        'export class AiAgentRegistry {',
        '  /** Stable registry status. */',
        '  status: string',
        '  /** Stores a registration for later session resolution. */',
        '  register(moduleId: string): boolean',
        '}',
      ].join('\n'), 'utf8')

      const result = buildDtsClassModelBundle({
        repoRoot: tempRoot,
        rootFiles: [absolutePath],
        outputDir,
      })
      const provider = createDtsBundleClassModelKnowledgeProvider({
        dtsClassModelManifestUrl: pathToFileURL(result.manifestPath).href,
        rootClassName: 'AiAgentRegistry',
        fetchJson: async url => JSON.parse(readFileSync(fileURLToPath(url), 'utf8')) as unknown,
      })
      await provider.init()

      const query = await provider.query({ keyword: 'registry', includeMembers: true })
      const payload = query as {
        rootKind?: string
        models?: Array<{
          kind?: string
          jsdoc?: string
          attributes?: Array<{ name?: string; jsdoc?: string }>
          methods?: Array<{ name?: string; jsdoc?: string }>
        }>
      }
      const model = payload.models?.find(item => item.kind === 'AiAgentRegistry')

      expect(payload.rootKind).toBe('AiAgentRegistry')
      expect(model?.jsdoc).toContain('Host registry for AI business registrations.')
      expect(model?.attributes?.map(attribute => attribute.name)).toContain('status')
      expect(model?.attributes?.find(attribute => attribute.name === 'status')?.jsdoc).toContain('Stable registry status.')
      expect(model?.methods?.map(method => method.name)).toContain('register')
      expect(model?.methods?.find(method => method.name === 'register')?.jsdoc).toContain('Stores a registration')
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('reloads DTS bundle knowledge after host refresh rebuilds the bundle', async () => {
    const tempRoot = resolve(tmpdir(), `spark-dts-class-model-refresh-${String(process.pid)}-${String(Date.now())}`)
    const sourcePath = 'class-model-emit/packages/spark-ai/src/refresh/refresh-model.d.ts'
    const absolutePath = resolve(tempRoot, sourcePath)
    const outputDir = resolve(tempRoot, 'generated/dts-class-model')
    try {
      mkdirSync(dirname(absolutePath), { recursive: true })
      writeFileSync(absolutePath, [
        '/** Refreshable model v1. */',
        'export class RefreshModel {',
        '  /** Reads old knowledge. */',
        '  readOld(): string',
        '}',
      ].join('\n'), 'utf8')

      const first = buildDtsClassModelBundle({
        repoRoot: tempRoot,
        rootFiles: [absolutePath],
        outputDir,
      })
      const provider = createDtsBundleClassModelKnowledgeProvider({
        dtsClassModelManifestUrl: pathToFileURL(first.manifestPath).href,
        rootClassName: 'RefreshModel',
        fetchJson: async url => JSON.parse(readFileSync(fileURLToPath(url), 'utf8')) as unknown,
        refreshBundle: async () => {
          writeFileSync(absolutePath, [
            '/** Refreshable model v2. */',
            'export class RefreshModel {',
            '  /** Reads new knowledge. */',
            '  readNew(): string',
            '}',
          ].join('\n'), 'utf8')
          buildDtsClassModelBundle({
            repoRoot: tempRoot,
            rootFiles: [absolutePath],
            outputDir,
          })
        },
      })
      await provider.init()

      const before = await provider.query({ kind: 'RefreshModel', includeMembers: true })
      expect(JSON.stringify(before)).toContain('readOld')

      await provider.refresh('RefreshModel')
      const after = await provider.query({ kind: 'RefreshModel', includeMembers: true })
      expect(JSON.stringify(after)).toContain('readNew')
      expect(JSON.stringify(after)).not.toContain('readOld')
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('resolves recursive dts ref closures without looping', async () => {
    const tempRoot = resolve(tmpdir(), `spark-dts-class-model-recursive-ref-${String(process.pid)}-${String(Date.now())}`)
    const nodeSourcePath = 'class-model-emit/packages/spark-data/src/node-tree/tree-node.d.ts'
    const edgeSourcePath = 'class-model-emit/packages/spark-data/src/node-tree/tree-edge.d.ts'
    const nodePath = resolve(tempRoot, nodeSourcePath)
    const edgePath = resolve(tempRoot, edgeSourcePath)
    const outputDir = resolve(tempRoot, 'generated/dts-class-model')
    try {
      mkdirSync(dirname(nodePath), { recursive: true })
      writeFileSync(nodePath, [
        "import type { TreeEdge } from './tree-edge'",
        '/** Tree node whose children are expressed through recursive edges. */',
        'export type TreeNode = {',
        '  /** Stable node id. */',
        '  id: string',
        '  /** Edges from this node to child nodes. */',
        '  edges: TreeEdge[]',
        '}',
      ].join('\n'), 'utf8')
      writeFileSync(edgePath, [
        "import type { TreeNode } from './tree-node'",
        '/** Directed edge that points back to a tree node. */',
        'export type TreeEdge = {',
        '  /** Edge label shown to users. */',
        '  label: string',
        '  /** Child node reached by this edge. */',
        '  child: TreeNode',
        '}',
      ].join('\n'), 'utf8')

      const result = buildDtsClassModelBundle({
        repoRoot: tempRoot,
        rootFiles: [nodePath, edgePath],
        outputDir,
      })
      const nodeEntry = result.manifest.files[bundleSourcePath(nodeSourcePath)]
      const edgeEntry = result.manifest.files[bundleSourcePath(edgeSourcePath)]
      if (nodeEntry === undefined) throw new Error(`Missing node shard entry: ${nodeSourcePath}`)
      if (edgeEntry === undefined) throw new Error(`Missing edge shard entry: ${edgeSourcePath}`)
      const nodeProjection = readDtsFileProjectionDocument(
        JSON.parse(readFileSync(resolve(outputDir, nodeEntry.file), 'utf8')) as unknown,
      )
      const edgeProjection = readDtsFileProjectionDocument(
        JSON.parse(readFileSync(resolve(outputDir, edgeEntry.file), 'utf8')) as unknown,
      )
      const nodeModel = expectTypeAliasModel(nodeProjection.models['TreeNode'], 'TreeNode')
      const edgeModel = expectTypeAliasModel(edgeProjection.models['TreeEdge'], 'TreeEdge')
      expect(nodeModel.jsonSchema?.['$schema']).toBe('https://json-schema.org/draft/2020-12/schema')
      expect(edgeModel.jsonSchema?.['$schema']).toBe('https://json-schema.org/draft/2020-12/schema')

      const nodeEdgesAttr = nodeModel.typeAlias.members.attributes.find(attribute => attribute.name === 'edges')
      expect(nodeEdgesAttr?.schema).toEqual({
        type: 'array',
        items: {
          $ref: 'tree-edge.ts.json#/$defs/TreeEdge',
        },
      })
      const edgeChildAttr = edgeModel.typeAlias.members.attributes.find(attribute => attribute.name === 'child')
      expect(edgeChildAttr?.schema).toEqual({
        $ref: 'tree-node.ts.json#/$defs/TreeNode',
      })

      const fetchedFiles: string[] = []
      const loader = new DtsClassModelBundleLoader({
        manifestUrl: pathToFileURL(result.manifestPath).href,
        fetchJson: async (url) => {
          const filePath = fileURLToPath(url)
          fetchedFiles.push(relative(outputDir, filePath).replace(/\\/gu, '/'))
          return JSON.parse(readFileSync(filePath, 'utf8')) as unknown
        },
      })
      const reachable = await loader.ensureReachableClosure('TreeNode')

      expect(reachable).toEqual(['TreeNode', 'TreeEdge'])
      expect(fetchedFiles).toEqual([
        relative(outputDir, result.manifestPath).replace(/\\/gu, '/'),
        nodeEntry.file,
        edgeEntry.file,
      ])
      expect(loader.buildLoadedSurface().models).toMatchObject({
        TreeNode: { name: 'TreeNode' },
        TreeEdge: { name: 'TreeEdge' },
      })

      const provider = createDtsBundleClassModelKnowledgeProvider({
        dtsClassModelManifestUrl: pathToFileURL(result.manifestPath).href,
        rootClassName: 'TreeNode',
        fetchJson: async url => JSON.parse(readFileSync(fileURLToPath(url), 'utf8')) as unknown,
      })
      await provider.init()
      const query = await provider.query({ kind: 'TreeNode', includeMembers: true })
      const payload = query as {
        models?: Array<{
          kind?: string
          attributes?: Array<{ name?: string; typeText?: string }>
        }>
      }
      const queryNode = payload.models?.find(model => model.kind === 'TreeNode')
      expect(queryNode?.attributes?.find(attribute => attribute.name === 'edges')?.typeText).toBe('TreeEdge[]')
      await expect(provider.attributeGuide({ kind: 'TreeNode', attributeName: 'edges' })).resolves.toContain('edges: TreeEdge[]')
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('writes semantic gap logs for declarations missing jsdoc', () => {
    const tempRoot = resolve(tmpdir(), `spark-dts-class-model-log-${String(process.pid)}-${String(Date.now())}`)
    const sourcePath = 'class-model-emit/packages/spark-component/src/components/fields/data-components/FieldText.props.d.ts'
    const absolutePath = resolve(tempRoot, sourcePath)
    const outputDir = resolve(tempRoot, 'generated/dts-class-model')
    try {
      mkdirSync(dirname(absolutePath), { recursive: true })
      writeFileSync(absolutePath, [
        'export type RTextProps = {',
        '  /** Bound data field name. */',
        '  field?: string',
        '  missingLabel?: string',
        '}',
        'export class DemoModel {',
        '  /** Display name. */',
        '  name: string',
        '  missingCount: number',
        '  /** Saves the current model. */',
        '  save(): void',
        '  reset(): void',
        '}',
      ].join('\n'), 'utf8')

      const result = buildDtsClassModelBundle({
        repoRoot: tempRoot,
        rootFiles: [absolutePath],
        outputDir,
      })
      const report = JSON.parse(readFileSync(result.semanticLogJsonPath, 'utf8')) as {
        gapCount: number
        notes: string[]
        gaps: Array<{
          className: string
          kind: string
          memberName?: string
          reason: string
          chainBreak: string
          fixHint: string
          sourceFile: string
        }>
      }
      const gapIds = report.gaps.map(gap => `${gap.kind}:${gap.className}.${gap.memberName ?? '<model>'}`)

      expect(report.gapCount).toBe(result.semanticGapCount)
      expect(gapIds).toContain('model:RTextProps.<model>')
      expect(gapIds).toContain('model:DemoModel.<model>')
      expect(gapIds).toContain('attribute:RTextProps.missingLabel')
      expect(gapIds).toContain('attribute:DemoModel.missingCount')
      expect(gapIds).toContain('method:DemoModel.reset')
      expect(report.gaps.find(gap => gap.className === 'RTextProps' && gap.kind === 'model')).toMatchObject({
        reason: 'missing-jsdoc',
      })
      expect(report.gaps.find(gap => gap.className === 'DemoModel' && gap.kind === 'method' && gap.memberName === 'reset'))
        .toMatchObject({
          reason: 'missing-jsdoc',
          sourceFile: 'packages/spark-component/src/components/fields/data-components/FieldText.props.ts',
        })
      expect(report.gaps.find(gap => gap.className === 'RTextProps' && gap.kind === 'model')?.chainBreak)
        .toContain('RTextProps')
      expect(report.gaps.find(gap => gap.className === 'RTextProps' && gap.kind === 'model')?.fixHint)
        .toContain('FieldText.props.ts')
      expect(report.notes.join('\n')).toContain('.d.ts')
      expect(report.notes.join('\n')).toContain('attribute、method')
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('rejects manifest with wrong protocol', () => {
    expect(() => readDtsClassModelBundleManifest({
      schemaVersion: DTS_CLASS_MODEL_BUNDLE_VERSION,
      protocol: 'unsupported-protocol',
      generatedAt: '2026-01-01T00:00:00.000Z',
      scannedFileCount: 0,
      files: {},
      classIndex: {},
    })).toThrow(/protocol/)
  })

  it('rejects projection missing required class model fields', () => {
    expect(() => readDtsFileProjectionDocument({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      schemaVersion: DTS_FILE_PROJECTION_VERSION,
      module: {
        name: 'workspace:x',
        sourcePath: 'x.ts',
        sourceFile: 'x.ts',
        modulePath: 'x',
        jsdoc: 'Test module.',
        jsdocSource: 'leading-jsdoc',
        symbols: ['Broken'],
      },
      $defs: {},
      models: {
        Broken: {
        },
      },
    })).toThrow(/name/)
  })

  it('projects optional return types and reflection callback parameters (PR-2)', () => {
    const tempRoot = resolve(tmpdir(), `spark-dts-class-model-pr2-${String(process.pid)}-${String(Date.now())}`)
    const registrationSourcePath = 'class-model-emit/packages/spark-ai/src/agent/business/registration-types.d.ts'
    const registrySourcePath = 'class-model-emit/packages/spark-ai/src/agent/business/business-registry.d.ts'
    const toolSourcePath = 'class-model-emit/packages/spark-ai/src/tools/data-set-crud-tool.d.ts'
    const configPageSourcePath = 'class-model-emit/packages/spark-project-model/src/page/config-page.d.ts'
    const registrationPath = resolve(tempRoot, registrationSourcePath)
    const registryPath = resolve(tempRoot, registrySourcePath)
    const toolPath = resolve(tempRoot, toolSourcePath)
    const configPagePath = resolve(tempRoot, configPageSourcePath)
    try {
      mkdirSync(dirname(registrationPath), { recursive: true })
      mkdirSync(dirname(toolPath), { recursive: true })
      mkdirSync(dirname(configPagePath), { recursive: true })
      writeFileSync(registrationPath, [
        'export type AiAgentRegistration<TInput = unknown> = {',
        '  moduleId: string',
        '  input?: TInput',
        '}',
      ].join('\n'), 'utf8')
      writeFileSync(registryPath, [
        "import type { AiAgentRegistration } from './registration-types'",
        'export class AiAgentRegistry<TInput = unknown> {',
        '  get(moduleId: string): AiAgentRegistration<TInput> | undefined',
        '}',
      ].join('\n'), 'utf8')
      writeFileSync(toolPath, [
        'export class DataSetCrudTool {}',
      ].join('\n'), 'utf8')
      writeFileSync(configPagePath, [
        "import type { DataSetCrudTool } from '../../../spark-ai/src/tools/data-set-crud-tool'",
        'export class ConfigPage {',
        '  editDataSet(run: (tool: DataSetCrudTool) => void | Promise<void>): void',
        '}',
      ].join('\n'), 'utf8')

      const registryProjection = projectDtsFileProjection({ repoRoot: tempRoot, absolutePath: registryPath })
      const configPageProjection = projectDtsFileProjection({ repoRoot: tempRoot, absolutePath: configPagePath })

      const registryModel = expectClassModel(registryProjection.models['AiAgentRegistry'], 'AiAgentRegistry')
      const getMethod = registryModel.classDecl.members.methods.find(method => method.name === 'get')
      expect(getMethod?.type).toEqual({
        type: 'optional',
        elementType: {
          type: 'reference',
          name: 'AiAgentRegistration',
          sourcePath: bundleSourcePath(registrationSourcePath),
          typeArguments: [{
            type: 'reference',
            name: 'TInput',
            refersToTypeParameter: true,
          }],
        },
      })
      expect(getMethod).not.toHaveProperty(removedReturnTypeField)

      const configPageModel = expectClassModel(configPageProjection.models['ConfigPage'], 'ConfigPage')
      const editMethod = configPageModel.classDecl.members.methods.find(method => method.name === 'editDataSet')
      expect(editMethod?.parameters?.[0]?.type).toEqual({
        type: 'reflection',
        declaration: {
          signatures: [{
            parameters: [{
              name: 'tool',
              type: {
                type: 'reference',
                name: 'DataSetCrudTool',
                sourcePath: bundleSourcePath(toolSourcePath),
              },
            }],
            type: {
              type: 'union',
              types: [
                { type: 'intrinsic', name: 'void' },
                {
                  type: 'reference',
                  name: 'Promise',
                  typeArguments: [{ type: 'intrinsic', name: 'void' }],
                },
              ],
            },
          }],
        },
      })
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('follows reflection callback refs in bundle loader closure (PR-3)', async () => {
    const tempRoot = resolve(tmpdir(), `spark-dts-class-model-pr3-${String(process.pid)}-${String(Date.now())}`)
    const toolSourcePath = 'class-model-emit/packages/spark-ai/src/tools/data-set-crud-tool.d.ts'
    const configPageSourcePath = 'class-model-emit/packages/spark-project-model/src/page/config-page.d.ts'
    const toolPath = resolve(tempRoot, toolSourcePath)
    const configPagePath = resolve(tempRoot, configPageSourcePath)
    const outputDir = resolve(tempRoot, 'generated/dts-class-model')
    try {
      mkdirSync(dirname(toolPath), { recursive: true })
      mkdirSync(dirname(configPagePath), { recursive: true })
      writeFileSync(toolPath, [
        '/** Dataset CRUD tool passed into page mutators. */',
        'export class DataSetCrudTool {}',
      ].join('\n'), 'utf8')
      writeFileSync(configPagePath, [
        "import type { DataSetCrudTool } from '../../../spark-ai/src/tools/data-set-crud-tool'",
        'export class ConfigPage {',
        '  editDataSet(run: (tool: DataSetCrudTool) => void | Promise<void>): Promise<void>',
        '}',
      ].join('\n'), 'utf8')

      const result = buildDtsClassModelBundle({
        repoRoot: tempRoot,
        rootFiles: [toolPath, configPagePath],
        outputDir,
      })
      const loader = new DtsClassModelBundleLoader({
        manifestUrl: pathToFileURL(result.manifestPath).href,
        fetchJson: async url => JSON.parse(readFileSync(fileURLToPath(url), 'utf8')) as unknown,
      })
      const reachable = await loader.ensureReachableClosure('ConfigPage')

      expect(reachable).toContain('ConfigPage')
      expect(reachable).toContain('DataSetCrudTool')
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })
})
