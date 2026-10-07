/**
 * @module @spark-appworks/spark-app:shell/page-ui/pageUiService
 * 职责：提供应用壳层 pageUiService 能力，围绕 模块入口、副作用注册或内部组合逻辑 连接导航、认证、插件、主题或 AI 宿主接线。
 * 边界：只负责 spark-app 基础设施和运行时接线，不定义底层 DataSet，也不实现组件渲染细节。
 * AI用途：需要理解应用层如何把路由、服务和组件系统组装起来时，用本模块定位 page-ui/pageUiService。
 */
import { reactive } from 'vue'
import { createRequest, isRecord } from '@spark-appworks/spark-utils'
import type { PageServiceCapability } from '@spark-appworks/spark-component'

type PageDialogOptions = Parameters<PageServiceCapability['showDialog']>[0]
type PageDialogResult = Awaited<ReturnType<PageServiceCapability['showDialog']>>
type PageSelectEntitiesOptions = Parameters<PageServiceCapability['selectEntities']>[0]
type PageSelectorOption = Awaited<ReturnType<PageServiceCapability['selectEntities']>>[number]
type PageBrowseFilesOptions = Parameters<PageServiceCapability['browseFiles']>[0]
type PageSelectedFile = Awaited<ReturnType<PageServiceCapability['browseFiles']>>[number]
type PageUploadFilesOptions = Parameters<PageServiceCapability['uploadFiles']>[0]
type PageUploadedFile = Awaited<ReturnType<PageServiceCapability['uploadFiles']>>[number]
type PageSelectorValue = PageSelectorOption['value']
type PageSelectorCurrentValue = PageSelectorValue | PageSelectorValue[]

type DialogState = {
  visible: boolean
  title: string
  content: string
  confirmText: string
  cancelText: string
  showCancelButton: boolean
  dangerouslyUseHTMLString: boolean
  width: string}

type SelectorState = {
  visible: boolean
  title: string
  placeholder: string
  multiple: boolean
  searchable: boolean
  confirmText: string
  cancelText: string
  emptyText: string
  searchKeyword: string
  options: PageSelectorOption[]
  selectedValues: string[]}

const dialogState = reactive<DialogState>({
  visible: false,
  title: '',
  content: '',
  confirmText: '确定',
  cancelText: '取消',
  showCancelButton: false,
  dangerouslyUseHTMLString: false,
  width: '560px',
})

const selectorState = reactive<SelectorState>({
  visible: false,
  title: '',
  placeholder: '请输入关键字',
  multiple: false,
  searchable: true,
  confirmText: '确定',
  cancelText: '取消',
  emptyText: '暂无可选项',
  searchKeyword: '',
  options: [],
  selectedValues: [],
})

let dialogResolver: ((result: PageDialogResult) => void) | null = null
let selectorResolver: ((result: PageSelectorOption[]) => void) | null = null

function mapFile(file: File): PageSelectedFile {
  return {
    name: file.name,
    size: file.size,
    type: file.type,
    lastModified: file.lastModified,
    file,
  }
}


function getErrorResponse(value: unknown): unknown {
  if (!isRecord(value)) return value
  return value['response'] ?? value
}

function extractUploadedUrl(response: unknown): string | undefined {
  if (!isRecord(response)) return undefined
  const record = response
  const candidate = record['url'] ?? record['path'] ?? record['filePath'] ?? record['data']
  if (typeof candidate === 'string') return candidate
  if (isRecord(candidate)) {
    const nested = candidate
    const nestedCandidate = nested['url'] ?? nested['path'] ?? nested['filePath']
    return typeof nestedCandidate === 'string' ? nestedCandidate : undefined
  }
  return undefined
}

function normalizeSelectorKeys(value: PageSelectorCurrentValue | undefined): string[] {
  if (Array.isArray(value)) return value.map(item => String(item))
  if (typeof value === 'string') {
    if (!value.trim()) return []
    return value.split(',').map(item => item.trim()).filter(Boolean)
  }
  if (typeof value === 'number' || typeof value === 'boolean') return [String(value)]
  return []
}

async function browseFiles(options?: PageBrowseFilesOptions): Promise<PageSelectedFile[]> {
  return await new Promise((resolve) => {
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

async function selectEntities(options: PageSelectEntitiesOptions): Promise<PageSelectorOption[]> {
  if (selectorResolver) {
    selectorResolver([])
  }

  selectorState.title = options.title ?? `选择${options.entityName ?? '项目'}`
  selectorState.placeholder = options.placeholder ?? '请输入关键字'
  selectorState.multiple = options.multiple === true
  selectorState.searchable = options.searchable !== false
  selectorState.confirmText = options.confirmText ?? '确定'
  selectorState.cancelText = options.cancelText ?? '取消'
  selectorState.emptyText = options.emptyText ?? '暂无可选项'
  selectorState.searchKeyword = ''
  selectorState.options = options.options?.slice() ?? []
  selectorState.selectedValues = normalizeSelectorKeys(options.currentValue)
  selectorState.visible = true

  return await new Promise<PageSelectorOption[]>((resolve) => {
    selectorResolver = resolve
  })
}

async function uploadFiles(options: PageUploadFilesOptions): Promise<PageUploadedFile[]> {
  const selectedFiles = options.files ?? (await browseFiles(options)).map(item => item.file)
  if (selectedFiles.length === 0) return []

  const results: PageUploadedFile[] = []
  for (const file of selectedFiles) {
    const formData = new FormData()
    formData.append(options.fieldName ?? 'file', file)
    if (options.data !== undefined) {
      for (const [key, value] of Object.entries(options.data)) {
        formData.append(key, value)
      }
    }

    const client = createRequest()
    const headers: Record<string, string> = {}
    if (options.headers !== undefined) {
      Object.assign(headers, options.headers)
    }

    let responseData: unknown
    try {
      responseData = await client.post<unknown>(options.action, formData, {
        ...(Object.keys(headers).length > 0 ? { headers } : {}),
        ...(options.withCredentials === true ? { withCredentials: true } : {}),
      })
    } catch (err) {
      responseData = getErrorResponse(err)
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

async function showDialog(options: PageDialogOptions): Promise<PageDialogResult> {
  if (dialogResolver) {
    dialogResolver('close')
  }

  dialogState.title = options.title ?? '提示'
  dialogState.content = options.content ?? options.message ?? ''
  dialogState.confirmText = options.confirmText ?? '确定'
  dialogState.cancelText = options.cancelText ?? '取消'
  dialogState.showCancelButton = options.showCancelButton === true
  dialogState.dangerouslyUseHTMLString = options.dangerouslyUseHTMLString === true
  dialogState.width = options.width ?? '560px'
  dialogState.visible = true

  return await new Promise<PageDialogResult>((resolve) => {
    dialogResolver = resolve
  })
}

function resolveDialog(result: PageDialogResult): void {
  const resolver = dialogResolver
  dialogResolver = null
  dialogState.visible = false
  if (resolver) resolver(result)
}

function resolveSelector(result: PageSelectorOption[]): void {
  const resolver = selectorResolver
  selectorResolver = null
  selectorState.visible = false
  selectorState.searchKeyword = ''
  if (resolver) resolver(result)
}

export const appPageUiState = {
  dialog: dialogState,
  selector: selectorState,
}

export const appPageUiService: Pick<PageServiceCapability, 'showDialog' | 'selectEntities' | 'browseFiles' | 'uploadFiles'> = {
  showDialog,
  selectEntities,
  browseFiles,
  uploadFiles,
}

export function confirmAppDialog(): void {
  resolveDialog('confirm')
}

export function cancelAppDialog(): void {
  resolveDialog('cancel')
}

export function closeAppDialog(): void {
  resolveDialog('close')
}

export function confirmAppSelector(): void {
  const selected = selectorState.selectedValues
    .map((selectedValue) => selectorState.options.find((option: PageSelectorOption) => String(option.value) === selectedValue) ?? null)
    .filter((option): option is PageSelectorOption => option !== null)
  resolveSelector(selectorState.multiple ? selected : selected.slice(0, 1))
}

export function cancelAppSelector(): void {
  resolveSelector([])
}

export function closeAppSelector(): void {
  resolveSelector([])
}
