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
getRowRawValue: (row: DataRow) => unknown}

export function stripHtml(value: unknown): string {
  return String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

export function useHtmlEditorState(options: UseHtmlEditorStateOptions) {
  const sourceMode = ref(false)
  const htmlValue = computed(() => String(options.fieldValue.value ?? ''))
  const plainValue = computed(() => stripHtml(htmlValue.value))

  function syncEditorSurface(): void {
    if (sourceMode.value) return
    if (options.editorRef.value && options.editorRef.value.innerHTML !== htmlValue.value) {
      options.editorRef.value.innerHTML = htmlValue.value
    }
  }

  function updateValue(value: string): void {
    options.emitUpdate(value)
    options.syncValue(value)
  }

  function handleSourceChange(value: string): void {
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
    void nextTick(() => syncEditorSurface())
  }

  function getPlainTableValue(row: DataRow): string {
    return stripHtml(options.getRowRawValue(row))
  }

  watch(htmlValue, () => {
    syncEditorSurface()
  })

  onMounted(() => {
    syncEditorSurface()
  })

  return {
    sourceMode,
    htmlValue,
    plainValue,
    handleSourceChange,
    handleSurfaceInput,
    applyCommand,
    toggleSourceMode,
    getPlainTableValue,
  }
}
