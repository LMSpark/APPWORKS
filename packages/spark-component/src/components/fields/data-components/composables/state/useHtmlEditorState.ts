/**
 * @module @spark-appworks/spark-component:components/fields/data-components/composables/state/useHtmlEditorState
 * 职责：提供 useHtmlEditorState（未注册组件类型）相关的组合式状态或行为封装，复用字段值、选项、权限、动作和交互控制逻辑。
 * 边界：只服务 field-level/data-field 的 setup/runtime 组合，不直接声明页面配置，也不替代组件 props。
 * AI用途：需要理解 use html editor state 的响应式状态来源、值转换或事件副作用时，使用本模块定位实际运行规则。
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { DataRow } from '@spark-appworks/spark-data'
import type { Ref } from 'vue'
import type { ValueRef } from '../../../../shared-types.js'
import { sanitizeRichTextHtml } from '../value/richTextHtmlPolicy.js'

/** Use Html Editor State Options 的调用配置。 */
type UseHtmlEditorStateOptions = {
    /** editor Ref 字段。 */
editorRef: Ref<HTMLElement | null>
    /** field Value 字段。 */
fieldValue: ValueRef<unknown>
    /** 是否 is Current Field Editable。 */
isCurrentFieldEditable: ValueRef<boolean>
    /** sync Value 回调。 */
syncValue: (value: string) => void
    /** emit Update 回调。 */
emitUpdate: (value: string) => void
    /** get Row Raw Value 回调。 */
getRowRawValue: (row: DataRow) => unknown
    /** 读取当前宿主图片上传器（随 props 变化）；上传器返回已持久化的图片地址，缺省时不提供图片插入。 */
readImageUploader?: () => ((file: File) => Promise<string>) | undefined
    /** 图片上传进行数与最近错误的变化通知。 */
onImageUploadState?: ((state: RichTextImageUploadState) => void) | undefined}

/** 富文本图片上传状态：pending 为进行中的上传数，error 为最近一次失败原因（成功开始新上传时清空）。 */
export type RichTextImageUploadState = Readonly<{pending: number; error: string}>

export function stripHtml(value: unknown): string {
  return String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

export function useHtmlEditorState(options: UseHtmlEditorStateOptions) {
  const sourceMode = ref(false)
  /** 展示与编辑面一律使用白名单清洗后的 HTML，存储值中的脚本/事件属性不进入 DOM。 */
  const htmlValue = computed(() => sanitizeRichTextHtml(options.fieldValue.value))
  const plainValue = computed(() => stripHtml(htmlValue.value))
  /** 源码模式的本地输入缓冲：未闭合标签在输入过程中不被清洗改写，回写值始终为清洗结果。 */
  const sourceDraft = ref(htmlValue.value)
  let lastEmitted: string | undefined

  function syncEditorSurface(): void {
    if (sourceMode.value) return
    if (options.editorRef.value && options.editorRef.value.innerHTML !== htmlValue.value) {
      options.editorRef.value.innerHTML = htmlValue.value
    }
  }

  function updateValue(value: string): void {
    const sanitized = sanitizeRichTextHtml(value)
    lastEmitted = sanitized
    options.emitUpdate(sanitized)
    options.syncValue(sanitized)
  }

  function handleSourceChange(value: string): void {
    sourceDraft.value = value
    updateValue(value)
  }

  function handleSurfaceInput(event: Event): void {
    if (!(event.target instanceof HTMLElement)) return
    const target = event.target
    updateValue(target.innerHTML)
  }

  function applyCommand(command: string): void {
    if (!options.editorRef.value || sourceMode.value || !options.isCurrentFieldEditable.value) return
    options.editorRef.value.focus()
    if (typeof document.execCommand === 'function') {
      document.execCommand(command, false)
      updateValue(options.editorRef.value.innerHTML)
    }
  }

  function toggleSourceMode(): void {
    sourceMode.value = !sourceMode.value
    if (sourceMode.value) sourceDraft.value = htmlValue.value
    void nextTick(() => syncEditorSurface())
  }

  /**
   * 选择图片后经宿主上传器取得持久地址再插入；上传期间与失败状态通过 imageUploadState 呈现，宿主据此阻止保存。
   * 上传返回前字段已切换或不可编辑时丢弃结果，不插入到其他值。
   */
  const imageUploadPending = ref(0)
  const imageUploadError = ref('')
  function reportImageState(): void {
    options.onImageUploadState?.({pending: imageUploadPending.value, error: imageUploadError.value})
  }
  function readEditable(): boolean {
    return options.isCurrentFieldEditable.value
  }
  async function insertImage(file: File): Promise<void> {
    const upload = options.readImageUploader?.()
    if (!upload || sourceMode.value || !options.isCurrentFieldEditable.value) return
    if (!/^image\/(?:gif|jpeg|png|webp)$/i.test(file.type) && !/\.(?:gif|jpe?g|png|webp)$/i.test(file.name)) {
      imageUploadError.value = '仅支持 png/jpg/gif/webp 图片'
      reportImageState()
      return
    }
    const baseline = htmlValue.value
    imageUploadPending.value++
    imageUploadError.value = ''
    reportImageState()
    try {
      const src = await upload(file)
      if (htmlValue.value !== baseline && lastEmitted !== htmlValue.value) throw new Error('字段内容已切换，图片未插入')
      const image = document.createElement('img')
      image.setAttribute('src', src)
      image.setAttribute('alt', file.name)
      const surface = options.editorRef.value
      // 上传期间字段可能已切换为只读；经函数读取最新值，避免沿用 await 前的类型收窄。
      if (!surface || !readEditable()) throw new Error('编辑器已不可编辑，图片未插入')
      surface.appendChild(image)
      const next = sanitizeRichTextHtml(surface.innerHTML)
      if (!next.includes('<img')) throw new Error('图片地址未通过富文本安全策略')
      updateValue(next)
    } catch (error) {
      imageUploadError.value = error instanceof Error ? error.message : String(error)
    } finally {
      imageUploadPending.value--
      reportImageState()
    }
  }

  function handleImageSelect(event: Event): void {
    const input = event.target
    if (!(input instanceof HTMLInputElement)) return
    const file = input.files?.[0]
    input.value = ''
    if (file) void insertImage(file)
  }

  function getPlainTableValue(row: DataRow): string {
    return stripHtml(options.getRowRawValue(row))
  }

  watch(htmlValue, value => {
    if (value !== lastEmitted) sourceDraft.value = value
    syncEditorSurface()
  })

  onMounted(() => {
    syncEditorSurface()
  })

  return {
    sourceMode,
    sourceDraft,
    htmlValue,
    plainValue,
    imageUploadPending,
    imageUploadError,
    handleSourceChange,
    handleSurfaceInput,
    handleImageSelect,
    insertImage,
    applyCommand,
    toggleSourceMode,
    getPlainTableValue,
  }
}
