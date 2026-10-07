/**
 * @module @spark-appworks/spark-ai:class-model/class-model/declaration/reflection-connectivity
 * 职责：维护 DTS DtsTypeDeclarationModel 知识链路中的 reflection-connectivity 能力，围绕 ClassModelReflectionConnectivityIssue 提供声明投影、协议读取、知识查询或运行时适配。
 * 边界：只服务 .d.ts => JSON => guide 的知识索引链路，不直接执行业务页面逻辑。
 * AI用途：当需要判断 DtsTypeDeclarationModel 在 class-model/class-model/reflection-connectivity 这一段如何生成、加载或投影时，用本模块定位职责。
 */
import type { AiApiAttributeMetadata, AiApiObjectMetadata, AiRuntimeApiMetadataJson } from '../../metadata'
import type { ClassModelDocument } from '../types'
import {
  listAttributeReachableKinds,
  projectClassModelFromApi,
  resolveModuleApi,
} from '../model-projection'

/** Class Model Reflection Connectivity Issue 的语义模型。 */
export type ClassModelReflectionConnectivityIssue = Readonly<{
  /** 问题编码：REFLECTION_MODEL_PROJECTION_FAILED = 投影失败，REFLECTION_KIND_UNREACHABLE_VIA_ATTRIBUTES = 不可达，REFLECTION_ATTRIBUTE_API_DISCONNECTED = 属性链断路。 */
  code: string
  /** 不一致位置：kind 名或 '{owner}.attributes.{name}' 形式的点分路径。 */
  path: string
  /** 人类可读的差异描述，包含具体 className 和失败原因。 */
  message: string
}>

/**
 * 审计 DtsTypeDeclarationModel 反射与属性链是否断路。
 *
 * ClassModelDocument 不预存 models；registry className 必须可投影，且非 root 须经子模型字段链可达。
 */
export function auditClassModelReflectionConnectivity(
  document: ClassModelDocument,
): readonly ClassModelReflectionConnectivityIssue[] {
  const issues: ClassModelReflectionConnectivityIssue[] = []
  const apisByKind = collectApisByKind(document.module)
  const reachable = new Set(listAttributeReachableKinds(document))

  for (const kind of listRegistryKinds(document.module)) {
    try {
      projectClassModelFromApi(resolveModuleApi(document, kind))
    } catch (error) {
      issues.push({
        code: 'REFLECTION_MODEL_PROJECTION_FAILED',
        path: kind,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  for (const [kind, api] of apisByKind) {
    for (const attribute of api.attributes ?? []) {
      auditAttributeReflection({
        issues,
        ownerKind: kind,
        attribute,
        document,
      })
    }
  }

  for (const kind of listRegistryKinds(document.module)) {
    if (kind === document.rootKind) continue
    if (!reachable.has(kind)) {
      issues.push({
        code: 'REFLECTION_KIND_UNREACHABLE_VIA_ATTRIBUTES',
        path: kind,
        message: `className "${kind}" 无法从 root "${document.rootKind}" 经子模型公开字段链到达。`,
      })
    }
  }

  return issues
}

function auditAttributeReflection(command: Readonly<{
  issues: ClassModelReflectionConnectivityIssue[]
  ownerKind: string
  attribute: AiApiAttributeMetadata
  document: ClassModelDocument
}>): void {
  const nestedKind = command.attribute.api?.kind
  if (nestedKind === undefined || nestedKind.length === 0) return
  if (!isRegistryKind(command.document.module, nestedKind)) {
    command.issues.push({
      code: 'REFLECTION_ATTRIBUTE_API_DISCONNECTED',
      path: `${command.ownerKind}.attributes.${command.attribute.name}`,
      message: `属性 "${command.attribute.name}" 反射到 className "${nestedKind}"，但 module apiRegistry 无该 className。`,
    })
  }
}

function isRegistryKind(module: AiRuntimeApiMetadataJson, kind: string): boolean {
  return module.rootApi.kind === kind || module.apiRegistry?.[kind] !== undefined
}

function listRegistryKinds(module: AiRuntimeApiMetadataJson): readonly string[] {
  return [module.rootApi.kind, ...Object.keys(module.apiRegistry ?? {})].sort()
}

function collectApisByKind(module: AiRuntimeApiMetadataJson): Map<string, AiApiObjectMetadata> {
  const apiByKind = new Map<string, AiApiObjectMetadata>()
  const pending: AiApiObjectMetadata[] = [module.rootApi, ...Object.values(module.apiRegistry ?? {})]
  while (pending.length > 0) {
    const api = pending.shift()
    if (api === undefined || apiByKind.has(api.kind)) continue
    apiByKind.set(api.kind, api)
    pending.push(...collectNestedApis(api))
  }
  return apiByKind
}

function collectNestedApis(api: AiApiObjectMetadata): readonly AiApiObjectMetadata[] {
  const apis: AiApiObjectMetadata[] = []
  for (const attribute of api.attributes ?? []) {
    if (attribute.api !== undefined) apis.push(attribute.api)
  }
  for (const action of api.actions) {
    for (const ref of action.resultApis ?? []) {
      if (ref.api !== undefined) apis.push(ref.api)
    }
  }
  return apis
}
