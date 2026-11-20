/**
 * @module @spark-appworks/spark-component:page/renderer/useCssScope
 * 职责：维护 @spark-appworks/spark-component 中 page/renderer/useCssScope 的模块能力，围绕 UseCssScopeOptions 提供稳定的公开契约。
 * 边界：只覆盖当前模块职责，不把相邻包、运行时副作用或业务配置混入同一语义入口。
 * AI用途：需要定位 page/renderer/useCssScope 的声明、导出和使用边界时，从本模块开始。
 */
/**
 * CSS 作用域 Composable
 */

import { ref, onUnmounted } from 'vue'
import { scopeCSS, removeScopedStyle } from './scopeCSS'

type UseCssScopeOptions = {
    /** 是否 enable Scope。 */
enableScope?: boolean}

/**
 * CSS 作用域隔离 Hook
 *
 * pageId 在 setScopedCss 调用时传入（而非初始化时），
 * 因为 composable 创建时 pageId 通常尚未确定。
 *
 * @example
 * ```vue
 * <script setup>
 * const { scopedCss, setScopedCss } = useCssScope()
 *
 * onMounted(() => {
 *   setScopedCss('home', '.button { color: red; }')
 * })
 * </script>
 *
 * <template>
 *   <component :is="'style'" v-if="scopedCss">{{ scopedCss }}</component>
 * </template>
 * ```
 */
export function useCssScope(options: UseCssScopeOptions = {}) {
  const { enableScope = true } = options
  const scopedCss = ref<string>('')
  let lastPageId = ''

  const setScopedCss = (pageId: string, css: string) => {
    lastPageId = pageId
    if (!css) {
      scopedCss.value = ''
      return
    }

    scopedCss.value = enableScope
      ? scopeCSS({ pageId, css })
      : css
  }

  // 组件卸载时清理样式
  onUnmounted(() => {
    if (lastPageId) removeScopedStyle(lastPageId)
  })

  return {
    scopedCss,
    setScopedCss
  }
}
