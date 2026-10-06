/**
 * @module app:services/project-model-artifacts/index
 * 职责：提供应用运行时 service 层的 index 能力，连接项目模型、AI Host、租户上下文或页面设计流程。
 * 边界：负责 src 应用侧编排，不修改底层包协议，也不绕过已注册的 capability/data 管线。
 * AI用途：排查应用侧服务如何调用 spark-ai 或项目模型时，用本模块确认运行时接线。
 */
/**
 * DevSystem 设计器制品：rule / pagedata 编辑器的 schema 与投影。
 * 消费 spark-project-model 的领域类型，但不反向进入该包。
 */

export {
  createRuleJsonSchema,
  createRuleTreePolicy,
} from './rule-editor'
