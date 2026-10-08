/**
 * @module @spark-appworks/spark-component:page/services/buildPageService
 * 职责：提供 build Page Service 在 spark-component 渲染体系中的辅助能力，连接配置、上下文和组件运行时。
 * 边界：只服务 component-runtime，不绕过 DataViewKey/DataSet 管线，也不承担应用路由职责。
 * AI用途：排查组件配置、运行态上下文或渲染注册关系时，用本模块确认局部语义。
 */
/**
 * PAGE_SERVICE 能力构建工厂
 *
 * 构建 PageServiceCapability 实现，
 * 优先使用 props 注入的 UI 服务（测试或宿主覆盖），回退到 Element Plus。
 */

import type { Router, LocationQueryRaw } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type {
  PageBrowseFilesOptions,
  PageDialogOptions,
  PageSelectorOption,
  PageSelectEntitiesOptions,
  PageServiceCapability,
  PageSelectedFile,
  PageUploadFilesOptions,
  PageUploadedFile,
  PageDialogResult,
} from '../../core/capability-keys.js'
import { createRequest, isRecord, isRequestError } from '@spark-appworks/spark-utils'
import { pageLogger } from './pageLogger'

/** 内部实现：ElMessageBox.confirm() 取消时抛出 'cancel' 字符串或 { action: 'cancel' }，用于区分真正的异常。这是 PageServiceCapability 内部实现细节，script.js 不能直接访问 ElMessageBox（已从沙箱移除）。 */
function isElCancelAction(e: unknown): boolean {
  if (e === 'cancel') return true
  return isRecord(e) && e['action'] === 'cancel'
}

/** 可选的外部 UI 服务注入（测试或宿主覆盖用） */
export type PageServiceOverrides = {
    /** message Service 回调。 */
messageService?: {
    success: (msg: string) => void
    warning: (msg: string) => void
    error: (msg: string) => void
    info: (msg: string) => void
  } | undefined
    /** confirm Service 回调。 */
confirmService?: {
    confirm: (msg: string, title?: string) => Promise<unknown>
    alert: (msg: string, title?: string) => Promise<unknown>
    prompt?: (msg: string, title?: string) => Promise<string | null>
  } | undefined
    /** page Service 字段。 */
pageService?: Partial<PageServiceCapability> | undefined}

function mapFile(file: File): PageSelectedFile {
  return {
    name: file.name,
    size: file.size,
    type: file.type,
    lastModified: file.lastModified,
    file,
  }
}

function extractUploadedUrl(response: unknown): string | undefined {
  if (!isRecord(response)) return undefined
  const candidate = response['url'] ?? response['path'] ?? response['filePath'] ?? response['data']
  if (typeof candidate === 'string') return candidate
  if (isRecord(candidate)) {
    const nestedCandidate = candidate['url'] ?? candidate['path'] ?? candidate['filePath']
    return typeof nestedCandidate === 'string' ? nestedCandidate : undefined
  }
  return undefined
}

function queryValue(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return value
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  throw new Error('页面调用参数必须是标量或标量数组')
}

function stringifyQueryParams(params: Record<string, unknown>): LocationQueryRaw {
  const query: LocationQueryRaw = {}
  for (const [key, value] of Object.entries(params)) {
    query[key] = Array.isArray(value) ? value.map((item: unknown) => queryValue(item)) : queryValue(value)
  }
  return query
}

function createFilePicker(options?: PageBrowseFilesOptions): Promise<PageSelectedFile[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.style.display = 'none'
    input.accept = options?.accept ?? ''
    input.multiple = options?.multiple === true
    input.onchange = () => {
      const files = Array.from(input.files ?? []).map(mapFile)
      input.remove()
      resolve(files)
    }
    input.oncancel = () => {
      input.remove()
      resolve([])
    }
    document.body.appendChild(input)
    input.click()
  })
}

function normalizeSelectorKeys(value: PageSelectEntitiesOptions['currentValue'] | undefined): string[] {
  if (Array.isArray(value)) return value.map(item => String(item))
  if (typeof value === 'string') {
    if (!value.trim()) return []
    return value.split(',').map(item => item.trim()).filter(Boolean)
  }
  if (typeof value === 'number' || typeof value === 'boolean') return [String(value)]
  return []
}

function selectFallbackEntities(options: PageSelectEntitiesOptions): PageSelectorOption[] {
  const candidates = options.options?.filter(option => option.disabled !== true) ?? []
  if (candidates.length === 0) return []
  if (typeof window === 'undefined' || typeof window.prompt !== 'function') return []

  const title = options.title ?? `选择${options.entityName ?? '项目'}`
  const defaultValue = normalizeSelectorKeys(options.currentValue).join(', ')
  const message = [
    title,
    candidates.map(option => `${option.label} (${String(option.value)})`).join('\n'),
    options.multiple ? '请输入 value，多个用逗号分隔' : '请输入 value',
  ].join('\n\n')

  const input = window.prompt(message, defaultValue)
  if (input === null) return []

  const selectedKeys = normalizeSelectorKeys(input)
  const matched = candidates.filter(option => selectedKeys.includes(String(option.value)))
  if (options.multiple === true) return matched
  const firstMatch = matched[0]
  return firstMatch ? [firstMatch] : []
}

async function uploadSelectedFiles(options: PageUploadFilesOptions): Promise<PageUploadedFile[]> {
  const selectedFiles = options.files ?? (await createFilePicker(options)).map(item => item.file)
  if (selectedFiles.length === 0) return []

  const results: PageUploadedFile[] = []
  for (const file of selectedFiles) {
    const formData = new FormData()
    formData.append(options.fieldName ?? 'file', file)
    const extraData = options.data ?? {}
    for (const [key, value] of Object.entries(extraData)) {
      formData.append(key, value)
    }

    const client = createRequest()
    const headers: Record<string, string> = {}
    if (options.headers !== undefined) {
      Object.assign(headers, options.headers)
    }

    let responseData: unknown
    try {
      responseData = await client.post(options.action, formData, {
        ...(Object.keys(headers).length > 0 ? { headers } : {}),
        ...(options.withCredentials === true ? { withCredentials: true } : {}),
      })
    } catch (err) {
      responseData = isRequestError(err) ? err.response : err
    }
    const uploadedUrl = extractUploadedUrl(responseData)
    results.push({
      ...mapFile(file),
      response: responseData,
      ...(uploadedUrl !== undefined ? { url: uploadedUrl } : {}),
    })
  }

  return results
}

async function showFallbackDialog(options: PageDialogOptions): Promise<PageDialogResult> {
  const title = options.title ?? '提示'
  const message = options.content ?? options.message ?? ''
  try {
    const sharedOptions = {
      confirmButtonText: options.confirmText ?? '确定',
      cancelButtonText: options.cancelText ?? '取消',
      dangerouslyUseHTMLString: options.dangerouslyUseHTMLString === true,
      type: options.type ?? 'info',
      ...(options.width ? { customStyle: { width: options.width } } : {}),
    }
    if (options.showCancelButton === true) {
      await ElMessageBox.confirm(message, title, {
        ...sharedOptions,
        distinguishCancelAndClose: true,
      })
    } else {
      await ElMessageBox.alert(message, title, sharedOptions)
    }
    return 'confirm'
  } catch (error) {
    if (error === 'cancel') return 'cancel'
    if (error === 'close' || isElCancelAction(error)) return 'close'
    pageLogger.warn('showDialog 异常', { error })
    return 'close'
  }
}

/**
 * 构建 PAGE_SERVICE 能力实现
 *
 * @param router    Vue Router 实例（navigate 需要）
 * @param overrides 可选的外部 UI 服务（测试或宿主注入）
 */
export function buildPageService(
  router: Router,
  overrides?: PageServiceOverrides
): PageServiceCapability {
  const extension = overrides?.pageService

  return {
    copyText: async (text) => {
      if (typeof extension?.copyText === 'function') {
        await extension.copyText(text)
        return
      }
      const clipboard = typeof navigator === 'undefined' ? undefined : Reflect.get(navigator, 'clipboard')
      if (!isRecord(clipboard) || typeof clipboard['writeText'] !== 'function') {
        throw new Error('当前环境不支持剪贴板写入')
      }
      await Reflect.apply(clipboard['writeText'], clipboard, [text])
    },

    showMessage: (message, type = 'info') => {
      try {
        const fn = overrides?.messageService?.[type]
        if (typeof fn === 'function') { fn(message); return }
      } catch (e) {
        pageLogger.warn('messageService 调用异常', { type, error: e })
      }
      ElMessage({ message, type })
    },

    showConfirm: async (
      message: string,
      title?: string,
      options?: { confirmText?: string; cancelText?: string; type?: 'warning' | 'info' | 'error' | 'success' }
    ) => {
      try {
        if (overrides?.confirmService) {
          await overrides.confirmService.confirm(message, title)
          return true
        }
        const confirmText: string = options?.confirmText ?? '确定'
        const cancelText: string  = options?.cancelText  ?? '取消'
        const confirmType          = options?.type ?? 'warning'
        await ElMessageBox.confirm(message, title ?? '确认', {
          confirmButtonText: confirmText,
          cancelButtonText:  cancelText,
          type: confirmType,
        })
        return true
      } catch (e) {
        if (!isElCancelAction(e)) {
          pageLogger.warn('showConfirm 异常', { error: e })
        }
        return false
      }
    },

    showPrompt: async (
      message: string,
      title?: string,
      options?: { placeholder?: string; defaultValue?: string }
    ) => {
      try {
        if (overrides?.confirmService?.prompt) {
          return await overrides.confirmService.prompt(message, title)
        }
        const placeholder: string  = options?.placeholder  ?? ''
        const defaultValue: string = options?.defaultValue ?? ''
        const result = await ElMessageBox.prompt(message, title ?? '请输入', {
          confirmButtonText: '确定',
          cancelButtonText:  '取消',
          inputPlaceholder:  placeholder,
          inputValue:        defaultValue,
        })
        // ElMessageBox.prompt 结果类型是 MessageBoxData，需要运行时检查
        return isRecord(result) && typeof result['value'] === 'string'
          ? result['value']
          : null
      } catch (e) {
        if (!isElCancelAction(e)) {
          pageLogger.warn('showPrompt 异常', { error: e })
        }
        return null
      }
    },

    showAlert: async (
      message: string,
      title?: string,
      options?: { type?: 'warning' | 'info' | 'error' | 'success' }
    ) => {
      const alertType = options?.type ?? 'info'
      try {
        if (overrides?.confirmService) {
          await overrides.confirmService.alert(message, title)
          return
        }
        await ElMessageBox.alert(message, title ?? '提示', {
          confirmButtonText: '确定',
          type: alertType,
        })
      } catch (e) {
        if (!isElCancelAction(e)) {
          pageLogger.warn('showAlert 异常', { error: e })
        }
      }
    },

    showDialog: async (options) => {
      if (typeof extension?.showDialog === 'function') {
        return await extension.showDialog(options)
      }
      return await showFallbackDialog(options)
    },

    selectEntities: async (options) => {
      if (typeof extension?.selectEntities === 'function') {
        return await extension.selectEntities(options)
      }
      return selectFallbackEntities(options)
    },

    browseFiles: async (options) => {
      if (typeof extension?.browseFiles === 'function') {
        return await extension.browseFiles(options)
      }
      return await createFilePicker(options)
    },

    uploadFiles: async (options) => {
      if (typeof extension?.uploadFiles === 'function') {
        return await extension.uploadFiles(options)
      }
      return await uploadSelectedFiles(options)
    },

    showLoading: (_show, _text) => {
      pageLogger.warn('showLoading 尚未接入全局加载遮罩服务')
    },

    navigate: (path, params) => {
      router.push(params ? { path, query: stringifyQueryParams(params) } : path)
        .catch((err: unknown) => { pageLogger.warn('导航失败', { path, error: err }) })
    },
  }
}
