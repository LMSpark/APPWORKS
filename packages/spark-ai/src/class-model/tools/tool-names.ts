/**
 * @module @spark-appworks/spark-ai:class-model/tools/tool-names
 * 职责：维护 DTS DtsTypeDeclarationModel 知识链路中的 tool-names 能力，围绕 ClassModelToolName 提供声明投影、协议读取、知识查询或运行时适配。
 * 边界：只服务 .d.ts => JSON => guide 的知识索引链路，不直接执行业务页面逻辑。
 * AI用途：当需要判断 DtsTypeDeclarationModel 在 class-model/tools/tool-names 这一段如何生成、加载或投影时，用本模块定位职责。
 */
/**
 * DtsTypeDeclarationModel 的 OpenAI tool 闭集。
 *
 * 注意：这里才是 OpenAI tool 名；DtsTypeDeclarationModel.methods 只是源码 class
 * public methods 的反射结果，二者不要混用。
 */
export const CLASS_MODEL_TOOL_NAMES = Object.freeze({
  query: 'model_query',
  modelGuide: 'model_class_guide',
  attributeGuide: 'model_attribute_guide',
  actionGuide: 'model_action_guide',
  script: 'model_script',
  humanQuestion: 'human_question',
  agentComplete: 'agent_complete',
} as const)

/** Class Model Tool Name 的语义模型。 */
export type ClassModelToolName = typeof CLASS_MODEL_TOOL_NAMES[keyof typeof CLASS_MODEL_TOOL_NAMES]

export function isClassModelToolName(name: string): name is ClassModelToolName {
  return Object.values(CLASS_MODEL_TOOL_NAMES).some(candidate => candidate === name)
}
