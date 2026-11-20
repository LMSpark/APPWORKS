/**
 * @module @spark-appworks/spark-ai:class-model/class-model/schema/class-model-json-schema-def-keys
 * 职责：定义 DtsTypeDeclarationModel JSON Schema 中 constructor/method 参数与返回值的 $defs key 规则。
 * 边界：只做纯字符串 key 生成，不依赖 TypeScript AST、Node FS、bundle IO 或运行时 loader。
 * AI用途：需要追踪 method/constructor schema 如何写入或从 $defs 恢复时，用本模块确认稳定 key。
 */

export const CLASS_MODEL_CONSTRUCTOR_PARAMS_DEF_KEY = 'constructor.params'

export function classModelMethodParamsDefKey(methodName: string): string {
  return `method.${methodName}.params`
}

export function classModelMethodReturnDefKey(methodName: string): string {
  return `method.${methodName}.return`
}
