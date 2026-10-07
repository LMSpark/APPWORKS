/**
 * @module @spark-appworks/spark-app:app/error-handler
 * 职责：提供 spark-app 应用壳中的 error handler 能力，连接路由、导航、认证、插件、页面 UI 或 AI 桥接。
 * 边界：负责应用层编排，不下沉实现底层数据模型，也不直接改写组件包的渲染协议。
 * AI用途：排查页面打开、导航状态、权限上下文或应用侧 AI 接线时，用本模块确认 app 层入口。
 */
/**
 * Error Handler
 * 全局错误处理与降级策略
 */

import { type App, defineComponent } from 'vue'
import type { ErrorHandlerOptions, ErrorContext } from '../types'
import { ErrorType } from '../types'
import { createLogger } from '../logger'
import { toError } from '@spark-appworks/spark-utils'

const errorLogger = createLogger('error', { suppressErrorConsoleTrace: true })

const VUE_INTERNAL_FRAME_RE = /(runtime-core\.esm-bundler\.js|reactivity\.esm-bundler\.js|runtime-dom\.esm-bundler\.js|node_modules[\\/](vue|@vue)[\\/])/i

function compactStackLikeText(raw: string | undefined, maxFrames = 12): string | undefined {
  if (typeof raw !== 'string' || raw.trim().length === 0) return undefined

  const lines = raw
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)

  if (lines.length === 0) return undefined

  const internal: string[] = []
  const app: string[] = []

  for (const line of lines) {
    if (VUE_INTERNAL_FRAME_RE.test(line)) internal.push(line)
    else app.push(line)
  }

  const preferred = app.length > 0 ? app : lines
  const kept = preferred.slice(0, maxFrames)
  const omitted = lines.length - kept.length

  if (omitted > 0) {
    kept.push(`... [省略 ${omitted} 条调用帧，其中 Vue/运行时内部帧 ${internal.length} 条]`)
  }

  return kept.join('\n')
}

function toLoggedErrorMeta(raw: unknown): Record<string, unknown> {
  const error = toError(raw)
  return {
    rawType: raw instanceof Error ? raw.name || 'Error' : raw === null ? 'null' : typeof raw,
    message: error.message,
    stack: compactStackLikeText(error.stack),
  }
}

/**
 * 设置全局错误处理
 *
 * @returns 清理函数，调用后移除全局事件监听器（HMR / 应用卸载时使用）
 */
export function setupErrorHandler(app: App, options: ErrorHandlerOptions = {}): () => void {
  const { onError, errorClassifier, onErrorByType } = options
  const cleanupFns: Array<() => void> = []

  function getRawErrorKind(raw: unknown): string {
    if (raw instanceof Error) return raw.name || 'Error'
    if (raw === null) return 'null'
    return typeof raw
  }

  // Vue 错误处理
  app.config.errorHandler = (err: unknown, instance, info) => {
    const error = toError(err)
    const errorType = errorClassifier ? errorClassifier(error) : classifyError(error)
    
    const context: ErrorContext = {
      info,
      timestamp: Date.now()
    }
    
    if (instance?.$options.name !== undefined) {
      context.source = instance.$options.name
    }

    if (instance?.$options.__file !== undefined) {
      context.file = String(instance.$options.__file)
    }

    const summary = `[Global Error] ${errorType} ${error.message}`

    errorLogger.error(summary, {
      type: errorType,
      rawType: getRawErrorKind(err),
      message: error.message,
      context,
      stack: compactStackLikeText(error.stack),
    })

    // 追加一条摘要日志，避免控制台预览折叠成 "Object" 时丢失关键信息。
    errorLogger.error(summary)

    // 用户自定义错误处理
    if (onError) {
      onError(error, context)
    }

    // 根据错误类型处理（如果提供了回调）
    if (onErrorByType) {
      onErrorByType(errorType, error)
    }
  }

  // Vue 警告处理（模板警告、prop 验证失败等 → 进入 Logger）
  app.config.warnHandler = (msg, _instance, trace) => {
    errorLogger.warn('[Vue Warning]', {
      message: msg,
      trace: compactStackLikeText(trace, 10),
    })
  }

  // Promise 未捕获错误
  if (typeof window !== 'undefined') {
    const rejectionHandler = (event: PromiseRejectionEvent) => {
      // event.reason 类型为 any，转为 Error 或字符串记录
      const reason = event.reason instanceof Error
        ? toLoggedErrorMeta(event.reason)
        : { reason: String(event.reason) }
      errorLogger.error('[Unhandled Promise]', reason)
      event.preventDefault()
      
      if (onError) {
        onError(
          event.reason instanceof Error ? event.reason : new Error(String(event.reason)),
          { info: 'unhandledrejection', timestamp: Date.now() }
        )
      }
    }
    window.addEventListener('unhandledrejection', rejectionHandler)
    cleanupFns.push(() => window.removeEventListener('unhandledrejection', rejectionHandler))
  }

  app.component('ErrorBoundary', createErrorBoundary())
  errorLogger.info('已注册 ErrorBoundary 组件')

  errorLogger.info('全局错误处理已设置')

  // 返回清理函数（HMR / 应用卸载时调用，避免累积监听器）
  return () => {
    for (const fn of cleanupFns) fn()
    cleanupFns.length = 0
  }
}

/**
 * 错误分类
 */
function classifyError(error: Error): ErrorType {
  const message = error.message.toLowerCase()
  
  if (message.includes('auth') || message.includes('token')) {
    return ErrorType.Auth
  }
  if (message.includes('permission') || message.includes('forbidden')) {
    return ErrorType.Permission
  }
  if (message.includes('network') || message.includes('fetch')) {
    return ErrorType.Network
  }
  if (message.includes('validation') || message.includes('invalid')) {
    return ErrorType.Validation
  }
  
  return ErrorType.Unknown
}

/**
 * 错误类型处理建议（供消费层参考）
 * 
 * @example
 * ```ts
 * setupErrorHandler(app, {
 *   onErrorByType: (type, error) => {
 *     switch (type) {
 *       case 'AUTH':
 *         // 重定向到平台首页，由路由守卫统一处理
 *         router.push('/')
 *         break
 *       case 'PERMISSION':
 *         ElMessage.error('权限不足')
 *         break
 *       case 'NETWORK':
 *         ElMessage.error('网络错误')
 *         break
 *       default:
 *         ElMessage.error(error.message)
 *     }
 *   }
 * })
 * ```
 */

/**
 * 创建错误边界组件（Vue 3）
 */
export function createErrorBoundary(fallbackRender?: (error: Error) => unknown) {
  return defineComponent({
    name: 'ErrorBoundary',
    data(): { error: Error | null } {
      return {
        error: null
      }
    },
    errorCaptured(err: unknown) {
      this.error = err instanceof Error ? err : new Error(String(err))
      errorLogger.error('[Error Boundary]', toLoggedErrorMeta(this.error))
      return false // 阻止错误继续传播
    },
    render() {
      if (this.error) {
        return fallbackRender
          ? fallbackRender(this.error)
          : this.$slots['fallback'] !== undefined
          ? this.$slots['fallback']()
          : null
      }
      return this.$slots['default']?.()
    }
  })
}
