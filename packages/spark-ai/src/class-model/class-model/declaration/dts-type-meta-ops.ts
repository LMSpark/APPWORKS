/**
 * @module @spark-appworks/spark-ai:class-model/class-model/declaration/dts-type-meta-ops
 * 职责：提供 DtsTypeMeta 类型树的遍历、引用收集和 MethodMeta 返回类型归一化能力。
 * 边界：只处理 .d.ts 投影后的类型元数据，不读取源文件、不执行工具，也不生成运行时 schema。
 * AI用途：当需要判断参数/返回类型如何递归寻址、渲染或参与闭包加载时，用本模块定位类型树规则。
 */
import type { DtsTypeMeta, MethodMeta } from '../types'

/** TypeDoc `SignatureReflection.type`。 */
export function resolveMethodReturnType(method: MethodMeta): DtsTypeMeta | undefined {
  return method.type
}

/** parameters + type 完整时可从 type 树渲染完整签名。 */
export function canRenderMethodSignatureFromTypeTree(method: MethodMeta): boolean {
  return method.parameters !== undefined && resolveMethodReturnType(method) !== undefined
}

/** 收集 type 树中的 reference 名（跳过 type parameter）。 */
export function collectDtsTypeReferenceNames(typeMeta: DtsTypeMeta | undefined): readonly string[] {
  const names = new Set<string>()
  visitDtsTypeMeta(typeMeta, (node) => {
    if (node.type !== 'reference' || node.refersToTypeParameter === true) return
    names.add(node.name)
  })
  return [...names]
}

export function visitDtsTypeMeta(
  typeMeta: DtsTypeMeta | undefined,
  visit: (node: DtsTypeMeta) => void,
): void {
  if (typeMeta === undefined) return
  visit(typeMeta)
  switch (typeMeta.type) {
    case 'reference':
      for (const typeArgument of typeMeta.typeArguments ?? []) {
        visitDtsTypeMeta(typeArgument, visit)
      }
      break
    case 'array':
    case 'optional':
    case 'rest':
      visitDtsTypeMeta(typeMeta.elementType, visit)
      break
    case 'union':
    case 'intersection':
      for (const item of typeMeta.types) {
        visitDtsTypeMeta(item, visit)
      }
      break
    case 'tuple':
      for (const element of typeMeta.elements) {
        visitDtsTypeMeta(element, visit)
      }
      break
    case 'reflection':
      for (const signature of typeMeta.declaration.signatures) {
        for (const parameter of signature.parameters) {
          visitDtsTypeMeta(parameter.type, visit)
        }
        visitDtsTypeMeta(signature.type, visit)
      }
      break
    case 'intrinsic':
    case 'literal':
    case 'unknown':
      break
  }
}
