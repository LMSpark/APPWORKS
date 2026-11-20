/**
 * @module @spark-appworks/spark-component:page/renderer/scopeCSS
 * 职责：提供 scope CSS 在 spark-component 渲染体系中的辅助能力，连接配置、上下文和组件运行时。
 * 边界：只服务 component-runtime，不绕过 DataViewKey/DataSet 管线，也不承担应用路由职责。
 * AI用途：排查组件配置、运行态上下文或渲染注册关系时，用本模块确认局部语义。
 */
/**
 * CSS 作用域隔离工具
 */

/**
 * CSS 作用域选项
 */
export type CssScopeOptions = {
    /** page Id 标识。 */
pageId: string
    /** css 字段。 */
css: string}

/**
 * 为 CSS 添加作用域前缀
 * 
 * 支持顶层规则和 @media / @supports 等 at-rules 内部的嵌套规则。
 * pageId 中的特殊字符会被转义以防止 CSS 注入。
 *
 * @example
 * ```typescript
 * const scopedCss = scopeCSS({
 *   pageId: 'home',
 *   css: '.button { color: red; }'
 * })
 * // 结果: [data-page="home"].spark-page-container .button { color: red; }
 * ```
 */
export function scopeCSS(options: CssScopeOptions): string {
  const { pageId, css } = options
  
  if (!css) return ''

  // 转义 pageId 中的特殊字符（防止 CSS 属性选择器注入）
  const safePageId = pageId.replace(/[\\"]/g, '\\$&')
  const prefix = `[data-page="${safePageId}"].spark-page-container`

  /** 为单层 CSS 文本中的选择器添加 scope 前缀 */
  function scopeSelectors(cssText: string): string {
    return cssText.replace(
      /([^{}]+)\{([^}]*)\}/g,
      (_match: string, selector: string, rules: string) => {
        // 跳过内部 at-rules（不应出现在此层，但保险起见）
        if (selector.trim().startsWith('@')) {
          return `${selector}{${rules}}`
        }

        const selectors = selector.split(',').map((s: string) => {
          const trimmed = s.trim()
          if (trimmed.includes('[data-page')) return trimmed
          return `${prefix} ${trimmed}`
        })

        return `${selectors.join(', ')} {${rules}}`
      }
    )
  }

  // 先处理 at-rules（@media, @supports 等）的内部规则
  // 匹配: @media (...) { ... }  —— 用贪婪匹配内部花括号块
  const result = css.replace(
    /(@(?:media|supports|layer|container)[^{]*)\{([\s\S]*?\})\s*\}/g,
    (_match: string, atRule: string, innerCss: string) => {
      return `${atRule}{${scopeSelectors(innerCss)}}`
    }
  )

  // 再处理顶层规则（排除已处理的 at-rules 和 @keyframes/@font-face）
  return scopeSelectors(result).replace(
    // 恢复 @keyframes / @font-face：它们不应被 scope（内部不含选择器）
    new RegExp(`${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} (@(?:keyframes|font-face))`, 'g'),
    '$1'
  )
}

/**
 * 移除页面样式
 */
export function removeScopedStyle(pageId: string): void {
  if (typeof document === 'undefined') return
  
  const styles = document.querySelectorAll(`style[data-page-style="${pageId}"]`)
  for (const style of styles) style.remove()
}
