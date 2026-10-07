/**
 * @module @spark-appworks/spark-app:theme/index
 * 职责：提供 spark-app 应用壳中的 index 能力，连接路由、导航、认证、插件、页面 UI 或 AI 桥接。
 * 边界：负责应用层编排，不下沉实现底层数据模型，也不直接改写组件包的渲染协议。
 * AI用途：排查页面打开、导航状态、权限上下文或应用侧 AI 接线时，用本模块确认 app 层入口。
 */
/**
 * SPARK 主题服务
 *
 * 基于 Vue 响应式状态实现，支持：
 * - light / dark / auto（跟随系统偏好）三模式
 * - Element Plus 暗黑模式自动切换（html.dark class）
 * - localStorage 持久化
 * - 通过 SPARK 能力系统 provide 给组件树
 *
 * @example
 * ```ts
 * import { createThemeService } from '@spark-appworks/spark-app'
 *
 * const theme = createThemeService()
 * theme.setMode('dark')
 * console.log(theme.isDark) // true
 * ```
 */

import { isThemeMode, type ThemeCapability as ComponentThemeCapability, type ThemeMode } from '@spark-appworks/spark-component'
import { computed, getCurrentScope, inject, onScopeDispose, ref, watch, type ComputedRef, type InjectionKey, type Ref } from 'vue'

/** 应用壳主题能力：组件 ThemeCapability + 存储作用域切换。 */
export type AppThemeCapability = ComponentThemeCapability & {
  /** 切换 localStorage 作用域键；传入 null 重置为默认（无作用域）键。切换后自动从新作用域重新加载已存储的主题模式并持久化 */
  setStorageScope(scopeKey: string | null): void
}

/** Vue DI 注入键（仅供 App.vue / Settings.vue 等非 SPARK 组件使用） */
export const THEME_INJECTION_KEY: InjectionKey<AppThemeCapability> = Symbol('spark-theme')

/** 主题服务配置 */
export type ThemeServiceOptions = {
  /** 初始模式（默认 'auto'） */
  initialMode?: ThemeMode
  /** localStorage 存储键名（默认 'spark-theme-mode'） */
  storageKey?: string
  /** localStorage 作用域；设置后存储键为 `${storageKey}:${storageScope}` */
  storageScope?: string | null}

/** 响应式主题服务（内部使用，组件层可直接读 ref） */
export type ThemeServiceReactive = AppThemeCapability & {
  /** 响应式当前模式 */
    readonly modeRef: Ref<ThemeMode>
    /** 响应式 isDark */
    readonly isDarkRef: ComputedRef<boolean>}

function normalizeScopeKey(scopeKey: string | null | undefined): string | null {
  if (typeof scopeKey !== 'string') return null
  const trimmed = scopeKey.trim()
  return trimmed.length > 0 ? trimmed : null
}

function getScopedStorageKey(storageKey: string, scopeKey: string | null): string {
  return scopeKey === null ? storageKey : `${storageKey}:${scopeKey}`
}

function safeGetItem(key: string): string | null {
  if (typeof localStorage === 'undefined') return null
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSetItem(key: string, value: string): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(key, value)
  } catch {
    // localStorage may be unavailable in restricted browser contexts.
  }
}

function readStoredThemeMode(storageKey: string, scopeKey: string | null, fallback: ThemeMode): ThemeMode {
  const scopedStorageKey = getScopedStorageKey(storageKey, scopeKey)
  const scopedValue = safeGetItem(scopedStorageKey)
  if (isThemeMode(scopedValue)) return scopedValue
  return fallback
}

function getSystemThemeMode(): 'light' | 'dark' {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function syncDocumentTheme(isDark: boolean): void {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', isDark)
  document.documentElement.setAttribute('data-vxe-ui-theme', isDark ? 'dark' : 'light')
}

/**
 * 创建主题服务
 *
 * 需要在 Vue 应用或 effectScope 内调用（依赖 Vue 响应式系统）。
 */
export function createThemeService(options: ThemeServiceOptions = {}): ThemeServiceReactive {
  const {
    initialMode = 'auto',
    storageKey = 'spark-theme-mode',
    storageScope = null,
  } = options

  const fallbackMode = isThemeMode(initialMode) ? initialMode : 'auto'
  let currentStorageScope = normalizeScopeKey(storageScope)
  const systemMode = ref<'light' | 'dark'>(getSystemThemeMode())
  const storeMode = ref<ThemeMode>(readStoredThemeMode(storageKey, currentStorageScope, fallbackMode))
  const resolvedMode = computed<'light' | 'dark'>(() =>
    storeMode.value === 'auto' ? systemMode.value : storeMode.value,
  )
  const isDarkRef = computed(() => resolvedMode.value === 'dark')

  const mediaQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null
  const handleSystemThemeChange = (event: MediaQueryListEvent | MediaQueryList) => {
    systemMode.value = event.matches ? 'dark' : 'light'
  }

  if (mediaQuery !== null) {
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleSystemThemeChange)
      if (getCurrentScope() !== undefined) {
        onScopeDispose(() => mediaQuery.removeEventListener('change', handleSystemThemeChange))
      }
    } else if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(handleSystemThemeChange)
      if (getCurrentScope() !== undefined) {
        onScopeDispose(() => mediaQuery.removeListener(handleSystemThemeChange))
      }
    }
  }

  function persistMode(mode: ThemeMode): void {
    safeSetItem(getScopedStorageKey(storageKey, currentStorageScope), mode)
  }

  function loadCurrentScopeMode(): void {
    const nextMode = readStoredThemeMode(storageKey, currentStorageScope, fallbackMode)
    storeMode.value = nextMode
    persistMode(nextMode)
    syncDocumentTheme(isDarkRef.value)
  }

  watch(storeMode, persistMode, { immediate: true, flush: 'sync' })
  watch(isDarkRef, syncDocumentTheme, { immediate: true, flush: 'sync' })

  const service: ThemeServiceReactive = {
    get current(): 'light' | 'dark' {
      return resolvedMode.value
    },
    get mode(): ThemeMode {
      return storeMode.value
    },
    setMode(mode: ThemeMode): void {
      if (!isThemeMode(mode)) {
        throw new Error(`Invalid theme mode: ${String(mode)}`)
      }
      storeMode.value = mode
    },
    setStorageScope(scopeKey: string | null): void {
      const nextScope = normalizeScopeKey(scopeKey)
      if (nextScope === currentStorageScope) return
      currentStorageScope = nextScope
      loadCurrentScopeMode()
    },
    get isDark(): boolean {
      return isDarkRef.value
    },
    toggle(): void {
      // 如果当前 resolved 为 dark → 切到 light；否则切到 dark
      storeMode.value = isDarkRef.value ? 'light' : 'dark'
    },
    modeRef: storeMode,
    isDarkRef,
  }

  return service
}

/**
 * 在 Vue 组件中获取主题服务
 *
 * 需要在 `app.provide(THEME_INJECTION_KEY, themeService)` 之后使用。
 * 适用于 App.vue / Settings.vue 等非 SPARK 组件；
 * SPARK 组件使用 `consume(THEME)` 获取。
 */
export function useTheme(): AppThemeCapability | undefined {
  return inject(THEME_INJECTION_KEY, undefined)
}
