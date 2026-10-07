/**
 * @module app:views/app/workflow-designs/workflow-design-class-model
 * 职责：WorkflowDesigns 读取 ClassModel 知识并整理业务节点模型、构造器、属性与方法选项。
 * 边界：只做知识读取与文本整理，不修改设计稿。
 * AI用途：排查业务节点模型下拉或文档摘要内容时，从本模块定位。
 */
import { createWorkerDtsClassModelKnowledgeProvider, type ClassModelKnowledgeProvider } from '@spark-appworks/spark-ai/class-model'
import { standardizeJsonSchema, type JsonSchema } from '@spark-appworks/spark-json-document'
import type { WorkflowDesignNodeView, WorkflowDesignVariable } from '@/services/workflow-designs'
import { getDtsClassModelManifestUrl } from '@/services/class-model-artifacts/artifact-urls'
import type { ClassModelAttributeOption, ClassModelConstructorOption, ClassModelMethodOption, ClassModelOption, WorkflowRuntimeBinding } from './workflow-design-view-types'
import { isJsonRecord } from './workflow-design-fields'

export function classModelOptionMemberDocText(option: ClassModelOption, memberName: string): string {
  const trimmedMember = memberName.trim()
  const attribute = option.attributes.find(item => item.name === trimmedMember)
  if (attribute !== undefined) return classModelDocText(attribute)
  const method = option.methods.find(item => item.name === trimmedMember)
  if (method !== undefined) return classModelDocText(method)
  return ''
}

export function shouldEditNodeConfig(view: WorkflowDesignNodeView): boolean {
  return view.isBusinessNode
}

export function readBusinessNodeModelClassName(view: WorkflowDesignNodeView): string {
  if (!view.isBusinessNode) return ''
  const model = readPrimaryBusinessNodeModel(view.node.data)
  if (!isJsonRecord(model)) return 'unbound model'
  const className = model['className']
  return typeof className === 'string' && className.trim().length > 0 ? className.trim() : 'unbound model'
}

export function readBusinessNodeValidationActionName(view: WorkflowDesignNodeView): string {
  if (!view.isBusinessNode) return ''
  const model = readPrimaryBusinessNodeModel(view.node.data)
  const completion = isJsonRecord(model?.['completion']) ? model['completion'] : undefined
  const memberName = isJsonRecord(completion) ? completion['memberName'] : undefined
  return typeof memberName === 'string' && memberName.trim().length > 0 ? memberName.trim() : ''
}

export function createClassModelKnowledgeProvider(rootClassName: string): ClassModelKnowledgeProvider {
  return createWorkerDtsClassModelKnowledgeProvider({
    workerUrl: new URL('../../../services/class-model-knowledge.worker.ts', import.meta.url),
    dtsClassModelManifestUrl: getDtsClassModelManifestUrl(),
    rootClassName,
  })
}

export function readClassModelOptions(value: unknown): ClassModelOption[] {
  if (!isJsonRecord(value) || !Array.isArray(value['models'])) return []
  return value['models']
    .filter(isJsonRecord)
    .map((model): ClassModelOption | null => {
      const kind = readTextField(model, 'kind') || readTextField(model, 'name')
      if (kind.length === 0) return null
      return {
        kind,
        jsdoc: readTextField(model, 'jsdoc'),
        summary: readTextField(model, 'summary'),
        constructorSignature: readConstructorOption(model['constructorSignature']),
        attributes: readAttributeOptions(model['attributes']),
        methods: readMethodOptions(model['methods']),
      }
    })
    .filter((item): item is ClassModelOption => item !== null)
}

export function readConstructorOption(value: unknown): ClassModelConstructorOption | null {
  if (!isJsonRecord(value)) return null
  const signature = readTextField(value, 'signature')
  if (signature.length === 0) return null
  return {
    jsdoc: readTextField(value, 'jsdoc'),
    summary: readTextField(value, 'summary'),
    signature,
  }
}

export function readAttributeOptions(value: unknown): ClassModelAttributeOption[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(isJsonRecord)
    .map((attribute): ClassModelAttributeOption | null => {
      const name = readTextField(attribute, 'name')
      if (name.length === 0) return null
      return {
        name,
        jsdoc: readTextField(attribute, 'jsdoc'),
        summary: readTextField(attribute, 'summary'),
        typeText: readTextField(attribute, 'typeText'),
      }
    })
    .filter((item): item is ClassModelAttributeOption => item !== null)
}

export function readMethodOptions(value: unknown): ClassModelMethodOption[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(isJsonRecord)
    .map((method): ClassModelMethodOption | null => {
      const name = readTextField(method, 'name')
      if (name.length === 0) return null
      return {
        name,
        jsdoc: readTextField(method, 'jsdoc'),
        summary: readTextField(method, 'summary'),
        signature: readTextField(method, 'signature'),
      }
    })
    .filter((item): item is ClassModelMethodOption => item !== null)
}

export function readTextField(value: unknown, field: string): string {
  if (!isJsonRecord(value)) return ''
  const text = value[field]
  return typeof text === 'string' ? text.trim() : ''
}

export function classModelDocText(item: Readonly<{ jsdoc?: string; summary?: string }>): string {
  const jsdoc = typeof item.jsdoc === 'string' ? item.jsdoc.trim() : ''
  if (jsdoc.length > 0) return jsdoc
  const summary = typeof item.summary === 'string' ? item.summary.trim() : ''
  return summary.length > 0 ? summary : 'No JSDoc.'
}

export function shortClassModelDocText(item: Readonly<{ jsdoc?: string; summary?: string }>): string {
  const line = classModelDocText(item).split('\n').map(part => part.trim()).find(part => part.length > 0) ?? ''
  return line.length > 96 ? `${line.slice(0, 95)}...` : line
}

export function readPrimaryBusinessNodeModel(data: unknown): Record<string, unknown> | null {
  if (!isJsonRecord(data)) return null
  const models = data['models']
  if (Array.isArray(models) && isJsonRecord(models[0])) return models[0]
  return null
}

export function ensurePrimaryBusinessNodeModel(data: Record<string, unknown>, nodeId: string): Record<string, unknown> {
  const models: unknown[] = Array.isArray(data['models']) ? data['models'].slice() : []
  const primary = isJsonRecord(models[0]) ? models[0] : {}
  if (readTextField(primary, 'id').length === 0) primary['id'] = `${nodeId}.model`
  if (readTextField(primary, 'sourceRef').length === 0) primary['sourceRef'] = '$'
  models[0] = primary
  data['models'] = models
  return primary
}

export function createWorkflowParamsSchema(
  existing: unknown,
  variables: readonly WorkflowDesignVariable[],
): WorkflowRuntimeBinding['inputContract']['paramsSchema'] {
  const standardized = standardizeJsonSchema(existing)
  const current = typeof standardized === 'boolean' ? {} : standardized
  const properties: Record<string, JsonSchema> = {}
  const required: string[] = []
  for (const variable of variables) {
    properties[variable.name] = standardizeJsonSchema(variable.schema ?? { type: 'string' })
    if (variable.required === true) required.push(variable.name)
  }
  return {
    ...current,
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  }
}
