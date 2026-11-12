/**
 * @module @spark-appworks/spark-component:components/fields/data-components/composables/value/richTextHtmlPolicy
 * 职责：富文本 HTML 白名单清洗：标签、属性、内联样式、class 与 URL 协议按固定策略收敛，供 FieldHtmlEditor 展示/回写及页面预览共用。
 * 边界：纯 DOM 变换，不访问网络、不读 DataSet；输入非字符串按空串处理。依赖浏览器 DOM（template 元素）。
 * AI用途：任何把用户或后端富文本放入 v-html/innerHTML 之前必须经 sanitizeRichTextHtml，不得自行拼白名单。
 */

const ALLOWED_TAGS = new Set(['a', 'b', 'blockquote', 'br', 'code', 'div', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'i', 'img', 'li', 'ol', 'p', 'pre', 's', 'span', 'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul'])
/** 整体移除（含内容）的危险元素；其余未知标签只去壳保留文本子节点。 */
const DROPPED_TAGS = new Set(['embed', 'form', 'iframe', 'object', 'script', 'style', 'svg', 'video', 'template', 'noscript', 'math', 'link', 'meta', 'base', 'frame', 'frameset', 'audio', 'canvas', 'textarea', 'select', 'button', 'input'])
const ALLOWED_ATTRIBUTES = new Set(['alt', 'class', 'colspan', 'data-colwidth', 'data-indent', 'data-type', 'dir', 'height', 'href', 'rel', 'rowspan', 'src', 'style', 'target', 'title', 'width'])
const ALLOWED_STYLES = new Set(['background-color', 'color', 'direction', 'font-family', 'font-size', 'line-height', 'margin-left', 'text-align'])
const ALLOWED_CLASS = /^(task-list|task-list-item)$/
const SAFE_URL = /^(?:#|\/(?!\/)|\.\.?\/|\?|https?:|mailto:|tel:)/i
const SAFE_IMAGE_DATA = /^data:image\/(?:gif|jpeg|png|webp);base64,[a-z0-9+/=\s]+$/i
const UNSAFE_STYLE_VALUE = /expression\s*\(|url\s*\(|@import|javascript:/i

function safeUrl(value: string, image: boolean): boolean {
  // 去除控制字符与空白后再判协议，阻止 "java\nscript:" 一类绕过。
  const compact = value.replace(/[\u0000-\u0020\u007f]/g, '')
  if (compact === '') return false
  if (image && SAFE_IMAGE_DATA.test(value.trim())) return true
  if (SAFE_URL.test(compact)) return true
  // 无协议的相对路径（如 "a/b.png"）不含冒号即视为相对。
  return !/^[^/?#]*:/.test(compact)
}

function cleanStyle(value: string): string {
  const kept: string[] = []
  for (const declaration of value.split(';')) {
    const index = declaration.indexOf(':')
    if (index <= 0) continue
    const property = declaration.slice(0, index).trim().toLowerCase()
    const styleValue = declaration.slice(index + 1).trim()
    if (!ALLOWED_STYLES.has(property) || styleValue === '' || UNSAFE_STYLE_VALUE.test(styleValue)) continue
    kept.push(`${property}: ${styleValue}`)
  }
  return kept.join('; ')
}

function cleanElement(element: Element): void {
  const tag = element.tagName.toLowerCase()
  // 外部编辑器（简道云 ProseMirror）以 link 属性保存链接：转为 href 并新窗口打开，再走统一 URL 校验。
  if (tag === 'a' && element.hasAttribute('link')) {
    const link = element.getAttribute('link') ?? ''
    if (link && !element.hasAttribute('href')) {
      element.setAttribute('href', link)
      element.setAttribute('target', '_blank')
    }
  }
  for (const attribute of [...element.attributes]) {
    const name = attribute.name.toLowerCase()
    const value = attribute.value
    if (!ALLOWED_ATTRIBUTES.has(name) || name.startsWith('on')) { element.removeAttribute(attribute.name); continue }
    if (name === 'href' && (tag !== 'a' || !safeUrl(value, false))) { element.removeAttribute(attribute.name); continue }
    if (name === 'src' && (tag !== 'img' || !safeUrl(value, true))) { element.removeAttribute(attribute.name); continue }
    if (name === 'style') {
      const style = cleanStyle(value)
      if (style) element.setAttribute('style', style)
      else element.removeAttribute('style')
      continue
    }
    if (name === 'class') {
      const classes = value.split(/\s+/).filter(item => ALLOWED_CLASS.test(item))
      if (classes.length > 0) element.setAttribute('class', classes.join(' '))
      else element.removeAttribute('class')
      continue
    }
    if (name === 'target' && value !== '_blank' && value !== '_self') element.removeAttribute(attribute.name)
  }
  if (tag === 'img' && !element.hasAttribute('src')) { element.remove(); return }
  if (tag === 'a') {
    const href = element.getAttribute('href') ?? ''
    if (element.getAttribute('target') === '_blank' || /^(?:https?:)?\/\//i.test(href)) element.setAttribute('rel', 'noopener noreferrer')
    else element.removeAttribute('rel')
  }
}

function isElementNode(node: Node): node is Element {
  return node.nodeType === 1
}

function cleanChildren(parent: ParentNode): void {
  for (const node of [...parent.childNodes]) {
    if (node.nodeType === 3) continue
    if (!isElementNode(node)) { node.parentNode?.removeChild(node); continue }
    const element = node
    const tag = element.tagName.toLowerCase()
    if (DROPPED_TAGS.has(tag)) { element.remove(); continue }
    cleanChildren(element)
    if (!ALLOWED_TAGS.has(tag)) { element.replaceWith(...element.childNodes); continue }
    cleanElement(element)
  }
}

/**
 * 按富文本白名单清洗 HTML，返回可直接用于 v-html 的安全片段。
 * @param html 原始 HTML；非字符串按空串处理。
 * @returns 清洗后的 HTML 字符串；仅含空段落时返回空串。
 */
export function sanitizeRichTextHtml(html: unknown): string {
  if (typeof html !== 'string' || html.trim() === '') return ''
  const template = document.createElement('template')
  template.innerHTML = html
  cleanChildren(template.content)
  const result = template.innerHTML
  return /^(?:\s|<p>(?:\s|<br\s*\/?>)*<\/p>|<br\s*\/?>)*$/i.test(result) ? '' : result
}
