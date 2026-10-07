/**
 * @module @spark-appworks/spark-ai:class-model/class-model/declaration/dts-jsdoc-reader
 * 职责：从 `.d.ts` AST 节点读取和清理 JSDoc 注释，统一处理多行注释格式和标签。
 * 边界：只读取节点文本和语法注释，不访问语义求值器、不解释 JSDoc 语义、不生成 DtsTypeDeclarationModel 字段。
 * AI用途：排查 JSDoc 读取丢失或格式错乱时，用本模块确认提取和清理规则。
 */
import ts from 'typescript'

export function readJsDoc(node: ts.Node, sourceFile?: ts.SourceFile): string {
  const jsDocNodes = readJsDocNodes(node)
  if (jsDocNodes.length > 0) {
    return jsDocNodes
      .map(jsDoc => renderJsDocNode(jsDoc, sourceFile))
      .filter(text => text.length > 0)
      .join('\n')
      .trim()
  }

  const resolvedSourceFile = sourceFile ?? node.getSourceFile()
  const fullText = resolvedSourceFile.getFullText()
  const ranges = ts.getLeadingCommentRanges(fullText, node.getFullStart()) ?? []
  return ranges
    .map(range => fullText.slice(range.pos, range.end))
    .filter(text => text.trim().startsWith('/**'))
    .map(cleanJsDocBlock)
    .filter(text => text.length > 0)
    .join('\n')
    .trim()
}

function readJsDocNodes(node: ts.Node): readonly ts.JSDoc[] {
  return ts.getJSDocCommentsAndTags(node).filter(isJsDocNode)
}

function renderJsDocNode(node: ts.JSDoc, sourceFile: ts.SourceFile | undefined): string {
  const lines = [
    normalizeJsDocComment(node.comment, sourceFile),
    ...[...(node.tags ?? [])].map(tag => renderJsDocTag(tag, sourceFile)),
  ].filter(line => line.length > 0)
  return lines.join('\n').trim()
}

function renderJsDocTag(tag: ts.JSDocTag, sourceFile: ts.SourceFile | undefined): string {
  const text = normalizeJsDocComment(tag.comment, sourceFile)
  const name = readJsDocTagName(tag, sourceFile)
  const body = [name, text].filter(item => item.length > 0).join(' ')
  const tagName = tag.tagName.getText(sourceFile)
  return body.length === 0 ? `@${tagName}` : `@${tagName} ${body}`
}

function readJsDocTagName(tag: ts.JSDocTag, sourceFile: ts.SourceFile | undefined): string {
  if (isNamedJsDocTag(tag)) {
    const name = tag.name
    return name === undefined ? '' : name.getText(sourceFile)
  }
  return ''
}

function isJsDocNode(node: ts.JSDoc | ts.JSDocTag): node is ts.JSDoc {
  return node.kind === ts.SyntaxKind.JSDocComment
}

function isNamedJsDocTag(
  tag: ts.JSDocTag,
): tag is ts.JSDocParameterTag | ts.JSDocPropertyTag | ts.JSDocTypedefTag | ts.JSDocCallbackTag {
  return ts.isJSDocParameterTag(tag)
    || ts.isJSDocPropertyTag(tag)
    || ts.isJSDocTypedefTag(tag)
    || ts.isJSDocCallbackTag(tag)
}

function normalizeJsDocComment(
  comment: ts.JSDoc['comment'],
  sourceFile: ts.SourceFile | undefined,
): string {
  if (comment === undefined) return ''
  if (typeof comment === 'string') return normalizeJsDocText(comment)
  if (Array.isArray(comment)) {
    return normalizeJsDocText(comment.map(part => part.getText(sourceFile)).join(''))
  }
  return normalizeJsDocText(String(comment))
}

export function normalizeJsDocText(text: string): string {
  const normalized = text.trim()
  if (normalized.length === 0) return ''
  if (normalized.startsWith('/**') || normalized.startsWith('/*')) {
    return cleanJsDocBlock(normalized)
  }
  return normalized
    .split(/\r?\n/u)
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n')
    .trim()
}

export function cleanJsDocBlock(text: string): string {
  return text
    .replace(/^\/\*\*/u, '')
    .replace(/\*\/$/u, '')
    .split(/\r?\n/u)
    .map(line => line.replace(/^\s*\*\s?/u, '').trim())
    .filter(line => line.length > 0)
    .join('\n')
    .trim()
}

export function cleanVueModuleComment(text: string): string {
  return text
    .replace(/^<!--/u, '')
    .replace(/-->$/u, '')
    .split(/\r?\n/u)
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n')
    .trim()
}
