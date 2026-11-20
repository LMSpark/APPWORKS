/**
 * @module app:views/app/workflow-designs/workflow-design-class-model
 * 职责：WorkflowDesigns 按根类读取 ClassModel 知识，整理为类、构造器、属性与方法的参考选项。
 * 边界：只读知识并整理文本，不修改设计稿。
 * AI用途：排查设计页 ClassModel 参考面板的查询或文档内容时，从本模块定位。
 */
import {createWorkerDtsClassModelKnowledgeProvider, type ClassModelKnowledgeProvider} from '@spark-appworks/spark-ai/class-model'
import {getDtsClassModelManifestUrl} from '@/services/class-model-artifacts/artifact-urls'

/** 一段可读文档：JSDoc 原文优先，其次摘要。 */
type ClassModelDoc = {
  /** JSDoc 原文。 */
  jsdoc: string
  /** 摘要。 */
  summary: string
}

/** 类的方法。 */
type ClassModelMethodOption = ClassModelDoc & {
  /** 方法名。 */
  name: string
  /** 签名。 */
  signature: string
}

/** 类的属性。 */
type ClassModelAttributeOption = ClassModelDoc & {
  /** 属性名。 */
  name: string
  /** 类型文本。 */
  typeText: string
}

/** 类的构造器。 */
type ClassModelConstructorOption = ClassModelDoc & {
  /** 签名。 */
  signature: string
}

/** 一个类及其构造器、属性与方法。 */
export type ClassModelOption = ClassModelDoc & {
  /** 类名。 */
  kind: string
  /** 构造器，null 表示未声明。 */
  constructorSignature: ClassModelConstructorOption | null
  /** 属性。 */
  attributes: ClassModelAttributeOption[]
  /** 方法。 */
  methods: ClassModelMethodOption[]
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : null
}

function textOf(value: Record<string, unknown>, field: string): string {
  const text = value[field]
  return typeof text === 'string' ? text.trim() : ''
}

function records(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.flatMap(item => {const found = record(item); return found ? [found] : []}) : []
}

function doc(value: Record<string, unknown>): ClassModelDoc {
  return {jsdoc: textOf(value, 'jsdoc'), summary: textOf(value, 'summary')}
}

/** 以根类创建 ClassModel 知识读取器。 */
export function createClassModelKnowledgeProvider(rootClassName: string): ClassModelKnowledgeProvider {
  return createWorkerDtsClassModelKnowledgeProvider({
    workerUrl: new URL('../../../services/class-model-knowledge.worker.ts', import.meta.url),
    dtsClassModelManifestUrl: getDtsClassModelManifestUrl(),
    rootClassName,
  })
}

/** 整理知识查询结果；缺名称的类和成员不列出。 */
export function readClassModelOptions(value: unknown): ClassModelOption[] {
  return records(record(value)?.['models']).flatMap(model => {
    const kind = textOf(model, 'kind') || textOf(model, 'name')
    if (!kind) return []
    const constructor = record(model['constructorSignature'])
    const signature = constructor ? textOf(constructor, 'signature') : ''
    return [{kind, ...doc(model),
      constructorSignature: constructor && signature ? {...doc(constructor), signature} : null,
      attributes: records(model['attributes']).flatMap(item => textOf(item, 'name')
        ? [{name: textOf(item, 'name'), typeText: textOf(item, 'typeText'), ...doc(item)}] : []),
      methods: records(model['methods']).flatMap(item => textOf(item, 'name')
        ? [{name: textOf(item, 'name'), signature: textOf(item, 'signature'), ...doc(item)}] : [])}]
  })
}

/** 文档文本：JSDoc 原文优先，其次摘要，都没有时提示无文档。 */
export function classModelDocText(item: Readonly<Partial<ClassModelDoc>>): string {
  return [item.jsdoc, item.summary].map(text => text?.trim() ?? '').find(text => text !== '') ?? 'No JSDoc.'
}
