/**
 * @module @spark-appworks/spark-ai:class-model/class-model/declaration/dts-ast-utils
 * 职责：提供 DTS 投影链路中跨模块共享的 AST 工具函数，消除 project-from-declarations 和 build-dts-class-model-bundle 之间的重复定义。
 * 边界：只包含无状态的纯函数，不持有 TypeScript Program 实例，不读写文件系统。
 * AI用途：当需要修改路径归一化、符号解析或声明名称提取逻辑时，用本模块确认唯一实现位置。
 */
import { relative, resolve } from 'node:path'

import ts from 'typescript'

export {
  CLASS_MODEL_EMIT_PREFIX,
  CLASS_MODEL_EMIT_SOURCE,
  CLASS_MODEL_EMIT_TSCONFIG,
  isClassModelEmitPath,
  sourceFileFromEmitPath,
  toClassModelEmitPath,
} from '../bundle/class-model-emit-path'

/** 将绝对路径归一化为相对于 repoRoot 的 POSIX 风格路径。 */
export function normalizeRepoPath(absolutePath: string, repoRoot: string): string {
  return relative(resolve(repoRoot), resolve(absolutePath)).replace(/\\/g, '/')
}

/** 判断节点是否有 export 修饰符。 */
export function hasExportModifier(node: ts.Node): boolean {
  return ts.canHaveModifiers(node)
    && (ts.getModifiers(node)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false)
}

/** 判断节点是否有 readonly 修饰符。 */
export function hasReadonlyModifier(node: ts.Node): boolean {
  return ts.canHaveModifiers(node)
    && (ts.getModifiers(node)?.some(modifier => modifier.kind === ts.SyntaxKind.ReadonlyKeyword) ?? false)
}

/** 判断类元素是否为私有成员（private 关键字或 # 前缀）。仅对 ClassElement 有效。 */
export function isPrivateMember(member: ts.ClassElement): boolean {
  const modifiers = ts.canHaveModifiers(member) ? ts.getModifiers(member) : undefined
  if (modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.PrivateKeyword) === true) return true
  if (ts.isPropertyDeclaration(member) && ts.isIdentifier(member.name)) {
    return member.name.text.startsWith('#')
  }
  return false
}

/** 判断类属性声明是否为私有成员（private 关键字或 # 前缀）。 */
export function isPrivateProperty(member: ts.PropertyDeclaration | ts.PropertySignature): boolean {
  if (ts.isPropertyDeclaration(member)) return isPrivateMember(member)
  return false
}

/** 从属性名节点提取名称文本。 */
export function readMemberName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name)) return name.text
  if (ts.isStringLiteral(name)) return name.text
  if (ts.isNumericLiteral(name)) return name.text
  return undefined
}
