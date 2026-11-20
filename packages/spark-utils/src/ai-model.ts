/**
 * @module @spark-appworks/spark-utils:ai-model
 * 职责：提供框架无关的 ai model 基础工具能力，支撑日志、HTTP、capability、克隆或快照等通用场景。
 * 边界：必须保持纯 TypeScript 基础层，不依赖 Vue、spark-data、spark-component 或应用运行时。
 * AI用途：需要复用底层工具或判断包边界是否被破坏时，用本模块确认最底层能力语义。
 */
/** @see packages/spark-ai/docs/ai-model-spec.md */

/** AI 可编辑模型协议基类。协议只强制 toJson；save/load/fromJson 由子类按需添加。 */
export abstract class SparkAIModel {
    /** 创建 Spark AIModel 实例。 */
constructor(_options: Record<string, unknown>) {
    void _options
  }

    /** 执行 to Json 操作。 */
abstract toJson(): Record<string, unknown>
}
