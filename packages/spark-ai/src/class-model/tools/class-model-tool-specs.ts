/**
 * @module @spark-appworks/spark-ai:class-model/tools/class-model-tool-specs
 * 职责：维护 DTS DtsTypeDeclarationModel 知识链路中的 class-model-tool-specs 能力，围绕 ClassModelToolSpec 提供声明投影、协议读取、知识查询或运行时适配。
 * 边界：只服务 .d.ts => JSON => guide 的知识索引链路，不直接执行业务页面逻辑。
 * AI用途：当需要判断 DtsTypeDeclarationModel 在 class-model/tools/class-model-tool-specs 这一段如何生成、加载或投影时，用本模块定位职责。
 */
import type { JsonSchemaObject } from '@spark-appworks/spark-json-document'
import { CLASS_MODEL_TOOL_NAMES, type ClassModelToolName } from './tool-names'

/** Class Model Tool Spec 的语义模型。 */
export type ClassModelToolSpec = Readonly<{
  /** 工具类型，固定为 'function'，对齐 OpenAI function calling 协议。 */
  type: 'function'
  /** 工具定义：name 为 ClassModelToolName 枚举值，description 面向 LLM，parameters 为 Draft 2020-12 JSON Schema。 */
  function: {
    readonly name: string
    readonly description: string
    readonly parameters: JsonSchemaObject
  }
}>

export function listClassModelToolSpecs(): readonly ClassModelToolSpec[] {
  return [
    buildClassModelQueryTool(),
    buildClassModelGuideTool(),
    buildClassModelAttributeGuideTool(),
    buildClassModelActionGuideTool(),
    buildClassModelScriptTool(),
    buildHumanQuestionTool(),
    buildAgentCompleteTool(),
  ]
}

export function findClassModelToolSpec(toolName: string): ClassModelToolSpec | undefined {
  return listClassModelToolSpecs().find(spec => spec.function.name === toolName)
}

function buildClassModelQueryTool(): ClassModelToolSpec {
  return toolSpec({
    name: CLASS_MODEL_TOOL_NAMES.query,
    description: 'Query the DtsTypeDeclarationModel DtsTypeDeclarationModel catalog before choosing model, attribute, or method guides.',
    properties: {
      kind: { type: 'string', description: 'Optional exact DtsTypeDeclarationModel kind.' },
      keyword: { type: 'string', description: 'Optional keyword matched against model/member names and summaries.' },
      componentName: { type: 'string', description: 'Optional exact SPARK component name, for example RendererTable or FieldText.' },
      componentType: { type: 'string', description: 'Optional exact SPARK component type, for example r-table or r-text.' },
      componentLevel: {
        type: 'string',
        enum: ['table-level', 'row-level', 'container', 'field-level', 'display', 'infrastructure'],
        description: 'Optional SPARK component level.',
      },
      componentLayer: {
        type: 'string',
        enum: ['data-view-container', 'row-scope', 'layout-container', 'zone-container', 'data-field', 'field-support', 'data-display', 'static-display', 'editor', 'support'],
        description: 'Optional SPARK component architecture layer.',
      },
      componentDirectory: { type: 'string', description: 'Optional SPARK component directory, for example containers/data-views or fields/data-components.' },
      includeMembers: { type: 'boolean', description: 'When true, include compact attribute and method summaries.' },
    },
  })
}

function buildClassModelGuideTool(): ClassModelToolSpec {
  return toolSpec({
    name: CLASS_MODEL_TOOL_NAMES.modelGuide,
    description: 'Render one DtsTypeDeclarationModel as d.ts-like declaration with native JSDoc.',
    properties: {
      kind: { type: 'string', description: 'DtsTypeDeclarationModel kind.' },
    },
    required: ['kind'],
  })
}

function buildClassModelAttributeGuideTool(): ClassModelToolSpec {
  return toolSpec({
    name: CLASS_MODEL_TOOL_NAMES.attributeGuide,
    description: 'Render one DtsTypeDeclarationModel attribute declaration with native JSDoc.',
    properties: {
      kind: { type: 'string', description: 'DtsTypeDeclarationModel kind.' },
      attributeName: { type: 'string', description: 'Attribute name.' },
    },
    required: ['kind', 'attributeName'],
  })
}

function buildClassModelActionGuideTool(): ClassModelToolSpec {
  return toolSpec({
    name: CLASS_MODEL_TOOL_NAMES.actionGuide,
    description: 'Render one DtsTypeDeclarationModel public action declaration with native JSDoc.',
    properties: {
      kind: { type: 'string', description: 'DtsTypeDeclarationModel kind.' },
      actionName: { type: 'string', description: 'Action name.' },
    },
    required: ['kind', 'actionName'],
  })
}

function buildClassModelScriptTool(): ClassModelToolSpec {
  return toolSpec({
    name: CLASS_MODEL_TOOL_NAMES.script,
    description: 'Execute a JavaScript-only model_script body through the injected business script executor after reading relevant guides.',
    properties: {
      script: {
        type: 'string',
        description: 'JavaScript async function body only. Do not return TypeScript, TSX, JSX, import/export, type annotations, interfaces, or an async function wrapper.',
      },
    },
    required: ['script'],
  })
}

function buildHumanQuestionTool(): ClassModelToolSpec {
  return toolSpec({
    name: CLASS_MODEL_TOOL_NAMES.humanQuestion,
    description: 'Ask the human for missing facts or approval when guessing would be risky.',
    properties: {
      context: { type: 'string', description: 'What the agent is trying to complete.' },
      reason: { type: 'string', description: 'Why user input is needed.' },
      missingFacts: { type: 'array', items: { type: 'string' }, description: 'Missing facts, ordered by importance.' },
      candidateOptions: { type: 'array', items: { type: 'string' }, description: 'Optional choices.' },
    },
    required: ['context', 'reason'],
  })
}

function buildAgentCompleteTool(): ClassModelToolSpec {
  return toolSpec({
    name: CLASS_MODEL_TOOL_NAMES.agentComplete,
    description: 'Request completion through the domain model completion method after all tool work is done; if the domain model rejects it, read the tool result and continue querying or executing.',
    properties: {
      summary: { type: 'string', description: 'Short final user-facing summary.' },
    },
    required: ['summary'],
  })
}

function toolSpec(input: Readonly<{
  name: ClassModelToolName
  description: string
  properties: NonNullable<JsonSchemaObject['properties']>
  required?: readonly string[]
}>): ClassModelToolSpec {
  return {
    type: 'function',
    function: {
      name: input.name,
      description: input.description,
      parameters: {
        type: 'object',
        properties: input.properties,
        required: input.required ?? [],
        additionalProperties: false,
      },
    },
  }
}
