import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { buildDebugBreak } from './build-debug.mjs'

/** manifest 键与 shard 路径必须为源码 repo 相对路径，禁止 `.d.ts.json` 与 `class-model-emit/`。 */
function assertClassModelBundleNativeShardPaths(manifest) {
  const violations = []
  for (const [sourcePath, entry] of Object.entries(manifest.files ?? {})) {
    if (sourcePath.includes('class-model-emit/') || sourcePath.endsWith('.d.ts')) {
      violations.push(`manifest key must be native source path: ${sourcePath}`)
    }
    const file = entry?.file
    if (typeof file === 'string') {
      if (file.endsWith('.d.ts.json') || file.includes('/class-model-emit/')) {
        violations.push(`shard path must be native *.ts.json / *.vue.json: ${file}`)
      }
    }
    if (violations.length >= 10) break
  }
  for (const [className, entry] of Object.entries(manifest.classIndex ?? {})) {
    const sourcePath = entry?.sourcePath
    if (
      typeof sourcePath === 'string'
      && (sourcePath.includes('class-model-emit/') || sourcePath.endsWith('.d.ts'))
    ) {
      violations.push(`classIndex sourcePath must be native: ${className} -> ${sourcePath}`)
    }
    if (violations.length >= 10) break
  }
  if (violations.length > 0) {
    throw new Error([
      'ClassModel bundle uses legacy emit-path manifest keys or .d.ts.json shard paths.',
      ...violations,
    ].join('\n'))
  }
}

/**
 * Fail-fast：manifest 存在但 shard 缺失时抛错（generate 中断或拷贝前校验）。
 * 只校验 guide manifest（manifest.json + files/**）；不校验 runtime/manifest.json（已冻结，见 spark-ai-platform.md §3.4）。
 * 每个声明的 JSON Schema 必须集中在 shard.$defs，raw member 上不得保留重复 schema 或编译期 provenance。
 */
export function assertClassModelBundleComplete(bundleRoot, options = {}) {
  const root = resolve(bundleRoot)
  const manifestPath = join(root, 'manifest.json')
  buildDebugBreak('class-model-assert:start', { bundleRoot: root, manifestPath })
  if (!existsSync(manifestPath)) {
    throw new Error(
      `Missing ${manifestPath}. Run pnpm run generate:class-model-surface before build.`,
    )
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  assertClassModelBundleNativeShardPaths(manifest)
  const duplicates = Array.isArray(manifest.duplicates) ? manifest.duplicates : []
  if (duplicates.length > 0) {
    throw new Error([
      `ClassModel public symbol index contains ${String(duplicates.length)} duplicate(s).`,
      'Public type names must be globally unique; module-private declarations must not enter module.symbols.',
      ...duplicates.slice(0, 10).map(item => `- ${String(item.className)}: ${String(item.keptFile)} / ${String(item.skippedFile)}`),
    ].join('\n'))
  }
  const missing = []
  for (const [sourcePath, entry] of Object.entries(manifest.files ?? {})) {
    const relativeFile = entry?.file
    if (typeof relativeFile !== 'string' || !existsSync(join(root, relativeFile))) {
      missing.push(sourcePath)
    }
    if (missing.length >= 10) break
  }
  if (missing.length > 0) {
    throw new Error([
      `ClassModel bundle is incomplete (${String(missing.length)}+ missing shard file(s)).`,
      'Run: pnpm run generate:class-model-surface',
      ...missing.slice(0, 10).map((sourcePath) => `- ${sourcePath}`),
    ].join('\n'))
  }

  buildDebugBreak('class-model-assert:shards-ok', {
    fileCount: Object.keys(manifest.files ?? {}).length,
  })

  if (options.requireParamsSchema === true) {
    assertGuideShardExecutableSchemas(root, manifest)
  }
}

/** guide shard 的可执行 schema 必须集中到 shard.$defs，且 raw 元数据不得持久化 provenance。 */
export function assertClassModelGuideExecutableSchemas(bundleRoot) {
  const root = resolve(bundleRoot)
  const manifestPath = join(root, 'manifest.json')
  if (!existsSync(manifestPath)) {
    throw new Error(
      `Missing ${manifestPath}. Run pnpm run generate:class-model-surface before ClassModel schema verification.`,
    )
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  assertGuideShardExecutableSchemas(root, manifest)
}

/** CI 门禁：module/model/constructor 级 semantic-gaps 必须为 0；attribute/method 作为报告债务输出。 */
export function assertClassModelSemanticGapsZero(bundleRoot) {
  const root = resolve(bundleRoot)
  const semanticJsonPath = join(root, 'semantic-gaps.json')
  if (!existsSync(semanticJsonPath)) {
    throw new Error(
      `Missing ${semanticJsonPath}. Run pnpm run generate:class-model-surface before semantic gap verification.`,
    )
  }
  const report = JSON.parse(readFileSync(semanticJsonPath, 'utf8'))
  const gateGaps = semanticGateGaps(report)
  const gapCount = gateGaps.length
  if (gapCount > 0) {
    const samples = gateGaps.slice(0, 10).map(gap => {
      const label = gap.memberName === undefined ? gap.className : `${gap.className}.${gap.memberName}`
      return `- [${gap.kind}] ${label} (${gap.sourceFile})`
    })
    throw new Error([
      `ClassModel module/model/constructor semantic gaps must be zero for CI gate (gateGapCount=${String(gapCount)}, totalGapCount=${String(Number(report.gapCount ?? report.gaps?.length ?? 0))}).`,
      'Fix module/model/constructor JSDoc in source files, then run: pnpm run generate:class-model-surface',
      ...samples,
    ].join('\n'))
  }
}

function semanticGateGaps(report) {
  const gaps = Array.isArray(report.gaps) ? report.gaps : []
  return gaps.filter(gap => gap?.kind === 'module'
    || gap?.kind === 'model'
    || gap?.kind === 'constructor')
}

function assertGuideShardExecutableSchemas(bundleRoot, manifest) {
  const violations = []
  for (const [sourcePath, entry] of Object.entries(manifest.files ?? {})) {
    const relativeFile = entry?.file
    if (typeof relativeFile !== 'string') continue
    const shardPath = join(bundleRoot, relativeFile)
    if (!existsSync(shardPath)) continue

    const shard = JSON.parse(readFileSync(shardPath, 'utf8'))
    if (shard.$schema !== 'https://json-schema.org/draft/2020-12/schema') {
      violations.push(`${sourcePath}.$schema: missing Draft 2020-12 schema resource header`)
    }
    const shardDefs = shard.$defs !== null && typeof shard.$defs === 'object' && !Array.isArray(shard.$defs)
      ? shard.$defs
      : {}
    const models = shard.models ?? {}
    for (const [typeName, model] of Object.entries(models)) {
      if (model === null || typeof model !== 'object') continue
      if (Object.hasOwn(model, 'rootSchema')) {
        violations.push(`${sourcePath}#${typeName}.rootSchema: remove redundant rootSchema; use jsonSchema`)
      }
      if (Object.hasOwn(model, 'shapeKind')) {
        violations.push(`${sourcePath}#${typeName}.shapeKind: use declarationKind`)
      }
      for (const flatField of ['constructorMeta', 'attributes', 'methods', 'declarationTypeText', 'declarationRelations']) {
        if (Object.hasOwn(model, flatField)) {
          violations.push(`${sourcePath}#${typeName}.${flatField}: flat declaration fields are not allowed`)
        }
      }
      if (Object.hasOwn(model, 'jsonSchema')) {
        violations.push(`${sourcePath}#${typeName}.jsonSchema: duplicate of top-level $defs`)
      }
      if (Object.hasOwn(model, 'provenance')) {
        violations.push(`${sourcePath}#${typeName}.provenance: compile-time source metadata must not be persisted; keep only consumed component profile`)
      }
      const jsonSchema = shardDefs[typeName]
      if (jsonSchema === null || typeof jsonSchema !== 'object' || Array.isArray(jsonSchema)) {
        if (isJsonSchemaOptionalOpaqueTypeAlias(model)) continue
        violations.push(`${sourcePath}#/$defs/${typeName}: missing Draft 2020-12 schema`)
        continue
      }
      if (jsonSchema.$schema !== 'https://json-schema.org/draft/2020-12/schema') {
        violations.push(`${sourcePath}#/$defs/${typeName}.$schema`)
      }
      const defs = jsonSchema.$defs !== null && typeof jsonSchema.$defs === 'object' && !Array.isArray(jsonSchema.$defs)
        ? jsonSchema.$defs
        : {}
      const declarationMembers = declarationMembersForModel(model)
      for (const attribute of declarationMembers.attributes) {
        if (attribute !== null && typeof attribute === 'object') {
          const attributeName = typeof attribute.name === 'string' ? attribute.name : '<anonymous>'
          if (Object.hasOwn(attribute, 'schema')) {
            violations.push(`${sourcePath}#${typeName}.${attributeName}.schema: duplicate of jsonSchema.properties`)
          }
          if (Object.hasOwn(attribute, 'provenance')) {
            violations.push(`${sourcePath}#${typeName}.${attributeName}.provenance: compile-time source metadata must not be persisted`)
          }
        }
      }

      const constructorMeta = model.classDecl?.constructorMeta
      if (model.declarationKind === 'class') {
        if (constructorMeta === undefined || constructorMeta === null || typeof constructorMeta !== 'object') {
          violations.push(`${sourcePath}#${typeName}.classDecl.constructorMeta: required for class`)
        } else {
          if (Object.hasOwn(constructorMeta, 'paramsSchema')) {
            violations.push(`${sourcePath}#${typeName}.constructor.paramsSchema: duplicate of jsonSchema.$defs`)
          }
          if (Object.hasOwn(constructorMeta, 'provenance')) {
            violations.push(`${sourcePath}#${typeName}.constructor.provenance: compile-time source metadata must not be persisted`)
          }
          if (!isExecutableParamsSchema(defs['constructor.params'])) {
            violations.push(`${sourcePath}#${typeName}.constructor: missing jsonSchema.$defs["constructor.params"]`)
          }
        }
      }

      for (const method of declarationMembers.methods) {
        if (method === null || typeof method !== 'object') continue
        const methodName = typeof method.name === 'string' ? method.name : '<anonymous>'
        if (Object.hasOwn(method, 'paramsSchema')) {
          violations.push(`${sourcePath}#${typeName}.${methodName}.paramsSchema: duplicate of jsonSchema.$defs`)
        }
        if (Object.hasOwn(method, 'returnSchema')) {
          violations.push(`${sourcePath}#${typeName}.${methodName}.returnSchema: duplicate of jsonSchema.$defs`)
        }
        if (Object.hasOwn(method, 'provenance')) {
          violations.push(`${sourcePath}#${typeName}.${methodName}.provenance: compile-time source metadata must not be persisted`)
        }
        if (!isExecutableParamsSchema(defs[`method.${methodName}.params`])) {
          violations.push(`${sourcePath}#${typeName}.${methodName}: missing jsonSchema.$defs["method.${methodName}.params"]`)
        }
      }
    }

    if (violations.length >= 10) break
  }

  if (violations.length > 0) {
    throw new Error([
      `ClassModel guide shard(s) violate jsonSchema-only schema contract (${String(violations.length)}+ violation(s)).`,
      'Regenerate with: pnpm run generate:class-model-surface',
      ...violations.slice(0, 10).map((item) => `- ${item}`),
    ].join('\n'))
  }
}

function isJsonSchemaOptionalOpaqueTypeAlias(model) {
  return model?.declarationKind === 'typeAlias'
    && model.classDecl === undefined
    && ((model.typeAlias?.members?.attributes ?? []).length === 0)
    && ((model.typeAlias?.members?.methods ?? []).length === 0)
}

function declarationMembersForModel(model) {
  if (model?.declarationKind === 'class') return normalizeDeclarationMembers(model.classDecl?.members)
  if (model?.declarationKind === 'interface') return normalizeDeclarationMembers(model.interfaceDecl?.members)
  if (model?.declarationKind === 'typeAlias') return normalizeDeclarationMembers(model.typeAlias?.members)
  return { attributes: [], methods: [] }
}

function normalizeDeclarationMembers(members) {
  return {
    attributes: Array.isArray(members?.attributes) ? members.attributes : [],
    methods: Array.isArray(members?.methods) ? members.methods : [],
  }
}

function isExecutableParamsSchema(value) {
  return value !== null
    && typeof value === 'object'
    && value.type === 'object'
    && typeof value.properties === 'object'
    && value.properties !== null
}

function collectLocalDefsRefs(value, refs = []) {
  if (value === null || typeof value !== 'object') return refs
  if (Array.isArray(value)) {
    for (const item of value) collectLocalDefsRefs(item, refs)
    return refs
  }
  if (typeof value.$ref === 'string' && value.$ref.startsWith('#/$defs/')) refs.push(value.$ref)
  for (const child of Object.values(value)) collectLocalDefsRefs(child, refs)
  return refs
}
