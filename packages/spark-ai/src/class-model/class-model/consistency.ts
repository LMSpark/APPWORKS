/**
 * @module @spark-appworks/spark-ai:class-model/class-model/consistency
 * 职责：维护 DTS DtsTypeDeclarationModel 知识链路中的 consistency 能力，围绕 ClassModelBuildConsistencyIssue 提供声明投影、协议读取、知识查询或运行时适配。
 * 边界：只服务 .d.ts => JSON => guide 的知识索引链路，不直接执行业务页面逻辑。
 * AI用途：当需要判断 DtsTypeDeclarationModel 在 class-model/class-model/consistency 这一段如何生成、加载或投影时，用本模块定位职责。
 */
import type { AttributeMeta, DtsTypeDeclarationModel, ClassModelDocument, ConstructorMeta, MethodMeta } from './types'
import {
  collectModuleApiKinds,
  projectClassModelFromApi,
  resolveModuleApiOrUndefined,
} from './model-projection'
import {
  renderAttributeDeclarationLine,
  renderConstructorSignature,
  renderMethodSignature,
} from './signature-renderer'

/** Class Model Build Consistency Issue 的语义模型。 */
export type ClassModelBuildConsistencyIssue = Readonly<{
  /** 问题编码，当前固定为 'CLASS_MODEL_BUILD_CONSISTENCY_MISMATCH'，预留未来区分不同不一致类型。 */
  code: string
  /** 不一致字段的点分路径，如 'module.kinds'、'{kind}.attributes.{name}.jsdoc'，用于定位差异位置。 */
  path: string
  /** 人类可读的差异描述，格式：'源码反射与构建入口不一致: source=... buildEntry=...'。 */
  message: string
}>

/** 跨构建对账：按需投影 DtsTypeDeclarationModel 后比较稳定语义字段。 */
export function compareClassModelDocumentsForBuildConsistency(
  sourceDocument: ClassModelDocument,
  buildEntryDocument: ClassModelDocument,
): readonly ClassModelBuildConsistencyIssue[] {
  const issues: ClassModelBuildConsistencyIssue[] = []
  compareValue({
    issues,
    path: 'rootKind',
    sourceValue: sourceDocument.rootKind,
    buildEntryValue: buildEntryDocument.rootKind,
  })

  const kinds = [...new Set([
    ...collectModuleApiKinds(sourceDocument.module),
    ...collectModuleApiKinds(buildEntryDocument.module),
  ])].sort()
  compareValue({
    issues,
    path: 'module.kinds',
    sourceValue: collectModuleApiKinds(sourceDocument.module).join(','),
    buildEntryValue: collectModuleApiKinds(buildEntryDocument.module).join(','),
  })

  for (const kind of kinds) {
    const sourceApi = resolveModuleApiOrUndefined(sourceDocument, kind)
    const buildApi = resolveModuleApiOrUndefined(buildEntryDocument, kind)
    if (sourceApi === undefined || buildApi === undefined) {
      compareValue({
        issues,
        path: `${kind}.modulePresence`,
        sourceValue: sourceApi === undefined ? 'missing' : 'present',
        buildEntryValue: buildApi === undefined ? 'missing' : 'present',
      })
      continue
    }
    const sourceModel = projectClassModelFromApi(sourceApi)
    const buildModel = projectClassModelFromApi(buildApi)
    compareModel({
      issues,
      kind,
      sourceDocument,
      buildEntryDocument,
      sourceModel,
      buildModel,
    })
  }
  return issues
}

type CompareModelCommand = Readonly<{
  issues: ClassModelBuildConsistencyIssue[]
  kind: string
  sourceDocument: ClassModelDocument
  buildEntryDocument: ClassModelDocument
  sourceModel: DtsTypeDeclarationModel
  buildModel: DtsTypeDeclarationModel
}>

function compareModel(command: CompareModelCommand): void {
  const { issues, kind, sourceDocument, buildEntryDocument, sourceModel, buildModel } = command
  compareValue({
    issues,
    path: `${kind}.name`,
    sourceValue: sourceModel.name,
    buildEntryValue: buildModel.name,
  })
  const sourceConstructor = comparableConstructor(sourceModel)
  const buildConstructor = comparableConstructor(buildModel)
  const sourceAttributes = comparableAttributes(sourceModel)
  const buildAttributes = comparableAttributes(buildModel)
  const sourceMethods = comparableMethods(sourceModel)
  const buildMethods = comparableMethods(buildModel)
  compareValue({
    issues,
    path: `${kind}.jsdoc`,
    sourceValue: sourceModel.jsdoc,
    buildEntryValue: buildModel.jsdoc,
  })
  compareValue({
    issues,
    path: `${kind}.constructorMeta.signature`,
    sourceValue: sourceConstructor === undefined
      ? undefined
      : renderConstructorSignature(sourceConstructor),
    buildEntryValue: buildConstructor === undefined
      ? undefined
      : renderConstructorSignature(buildConstructor),
  })
  compareValue({
    issues,
    path: `${kind}.constructorMeta.jsdoc`,
    sourceValue: sourceConstructor?.jsdoc,
    buildEntryValue: buildConstructor?.jsdoc,
  })
  compareValue({
    issues,
    path: `${kind}.attributes`,
    sourceValue: sourceAttributes.map(attribute => attribute.name).sort().join(','),
    buildEntryValue: buildAttributes.map(attribute => attribute.name).sort().join(','),
  })
  for (const sourceAttribute of sourceAttributes) {
    const buildAttribute = buildAttributes.find(attribute => attribute.name === sourceAttribute.name)
    if (buildAttribute === undefined) continue
    compareValue({
      issues,
      path: `${kind}.attributes.${sourceAttribute.name}.declaration`,
      sourceValue: renderAttributeDeclarationLine(sourceDocument, kind, sourceAttribute),
      buildEntryValue: renderAttributeDeclarationLine(buildEntryDocument, kind, buildAttribute),
    })
    compareValue({
      issues,
      path: `${kind}.attributes.${sourceAttribute.name}.jsdoc`,
      sourceValue: sourceAttribute.jsdoc,
      buildEntryValue: buildAttribute.jsdoc,
    })
  }
  compareValue({
    issues,
    path: `${kind}.methods`,
    sourceValue: sourceMethods.map(method => method.name).sort().join(','),
    buildEntryValue: buildMethods.map(method => method.name).sort().join(','),
  })
  for (const sourceMethod of sourceMethods) {
    const buildMethod = buildMethods.find(method => method.name === sourceMethod.name)
    if (buildMethod === undefined) continue
    compareValue({
      issues,
      path: `${kind}.methods.${sourceMethod.name}.signature`,
      sourceValue: renderMethodSignature(sourceDocument, kind, sourceMethod),
      buildEntryValue: renderMethodSignature(buildEntryDocument, kind, buildMethod),
    })
    compareValue({
      issues,
      path: `${kind}.methods.${sourceMethod.name}.jsdoc`,
      sourceValue: sourceMethod.jsdoc,
      buildEntryValue: buildMethod.jsdoc,
    })
  }
}

function comparableConstructor(model: DtsTypeDeclarationModel): ConstructorMeta | undefined {
  return model.declarationKind === 'class' ? model.classDecl.constructorMeta : undefined
}

function comparableAttributes(model: DtsTypeDeclarationModel): readonly AttributeMeta[] {
  if (model.declarationKind === 'class') return model.classDecl.members.attributes
  if (model.declarationKind === 'interface') return model.interfaceDecl.members.attributes
  if (model.declarationKind === 'typeAlias') return model.typeAlias.members.attributes
  return model.enumDecl.members
}

function comparableMethods(model: DtsTypeDeclarationModel): readonly MethodMeta[] {
  if (model.declarationKind === 'class') return model.classDecl.members.methods
  if (model.declarationKind === 'interface') return model.interfaceDecl.members.methods
  if (model.declarationKind === 'typeAlias') return model.typeAlias.members.methods
  return []
}

type CompareValueCommand = Readonly<{
  issues: ClassModelBuildConsistencyIssue[]
  path: string
  sourceValue: unknown
  buildEntryValue: unknown
}>

function compareValue(command: CompareValueCommand): void {
  if (command.sourceValue === command.buildEntryValue) return
  command.issues.push({
    code: 'CLASS_MODEL_BUILD_CONSISTENCY_MISMATCH',
    path: command.path,
    message: `源码反射与构建入口不一致: source=${String(command.sourceValue)} buildEntry=${String(command.buildEntryValue)}`,
  })
}
