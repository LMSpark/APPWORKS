/**
 * @module @spark-appworks/spark-component:components/fields/data-components/composables/state/useFileFieldState
 * 职责：提供 useFileFieldState（未注册组件类型）相关的组合式状态或行为封装，复用字段值、选项、权限、动作和交互控制逻辑。
 * 边界：只服务 field-level/data-field 的 setup/runtime 组合，不直接声明页面配置，也不替代组件 props。
 * AI用途：需要理解 use file field state 的响应式状态来源、值转换或事件副作用时，使用本模块定位实际运行规则。
 */
import { computed } from 'vue'
import type { PageSelectedFile, PageUploadedFile } from '../../../../internal'
import type {
  SparkFieldSemanticProps,
  SparkFileFieldProps,
  SparkFilePickerFieldProps,
  SparkFileUploadActionProps,
  SparkPrimaryActionTextProps,
  SparkReadonlyActionTextProps,
  ValueRef,
} from '../../../../shared-types.js'

type BrowseFilesCommand = {
  /** 文件选择窗口标题。 */
  title: string
  /** 文件过滤规则。 */
  accept: string
  /** 是否允许多选。 */
  multiple: boolean
  /** 打开对话框前字段中的当前值。 */
  currentValue: string
}

type UploadFilesCommand = {
  /** 上传动作地址或上传能力标识。 */
  action: NonNullable<SparkFileUploadActionProps['action']>
  /** 文件过滤规则。 */
  accept: string
  /** 是否允许多文件上传。 */
  multiple: boolean
  /** 上传表单字段名。 */
  fieldName: string
  /** 上传前字段中的当前值。 */
  currentValue: string
}

/** 同时支持本地浏览和远端上传的文件字段运行态输入。 */
type UploadBrowseFieldStateOptions = {
  /** 文件字段展示标题，用作文件选择对话框标题。 */
  displayLabel: ValueRef<string>
  /** 文件字段绑定的数据字段名，上传时作为默认表单字段名。 */
  fieldName: ValueRef<string>
  /** 当前字段原始字符串值，通常是文件名或 URL 串。 */
  currentRawStringValue: ValueRef<string>
  /** 当前字段是否允许写入。 */
  isCurrentFieldEditable: ValueRef<boolean>
  /** 当前页面运行时是否提供文件浏览能力。 */
  hasBrowseCapability: ValueRef<boolean>
  /** 当前页面运行时是否提供文件上传能力。 */
  hasUploadCapability: ValueRef<boolean>
  /** 主按钮优先执行上传还是浏览。 */
  primaryAction: ValueRef<'upload' | 'browse'>
  /** 可编辑态主按钮文本。 */
  buttonText: ValueRef<NonNullable<SparkPrimaryActionTextProps['buttonText']>>
  /** 只读态浏览按钮文本。 */
  readonlyButtonText: ValueRef<NonNullable<SparkReadonlyActionTextProps['readonlyButtonText']>>
  /** 是否允许清空字段值。 */
  canClear: ValueRef<NonNullable<SparkFieldSemanticProps['clearable']>>
  /** 文件上传接口地址或上传动作标识。 */
  action: ValueRef<NonNullable<SparkFileUploadActionProps['action']>>
  /** 文件 MIME 类型或扩展名过滤规则。 */
  accept: ValueRef<NonNullable<SparkFileFieldProps['accept']>>
  /** 是否允许一次选择或上传多个文件。 */
  multiple: ValueRef<NonNullable<SparkFilePickerFieldProps['multiple']>>
  /** 多文件值写回字段时使用的分隔符。 */
  separator: ValueRef<NonNullable<SparkFileFieldProps['separator']>>
  /** 打开文件浏览器并返回用户选择的文件。 */
  browseFiles: (options: BrowseFilesCommand) => Promise<PageSelectedFile[]>
  /** 上传用户选择的文件并返回上传结果。 */
  uploadFiles: (options: UploadFilesCommand) => Promise<PageUploadedFile[]>
  /** 将浏览或上传后的字符串值写回字段。 */
  updateValue: (value: string) => void | Promise<void>
  /** 浏览文件后是否把选择结果写回字段值。 */
  browseWritesValue?: boolean | undefined
  /** 将浏览得到的文件映射成字段值片段。 */
  getBrowseValue?: ((file: PageSelectedFile) => string) | undefined
  /** 将上传结果映射成字段值片段，默认优先使用 url。 */
  getUploadValue?: ((file: PageUploadedFile) => string) | undefined
}

/** 只浏览本地文件、不执行上传的文件字段运行态输入。 */
type FileBrowserFieldStateOptions = {
  /** 文件字段展示标题，用作文件选择对话框标题。 */
  displayLabel: ValueRef<string>
  /** 当前字段原始字符串值。 */
  currentRawStringValue: ValueRef<string>
  /** 当前字段是否允许写入。 */
  isCurrentFieldEditable: ValueRef<boolean>
  /** 当前页面运行时是否提供文件浏览能力。 */
  hasBrowseCapability: ValueRef<boolean>
  /** 文件 MIME 类型或扩展名过滤规则。 */
  accept: ValueRef<NonNullable<SparkFileFieldProps['accept']>>
  /** 是否允许一次选择多个文件。 */
  multiple: ValueRef<NonNullable<SparkFilePickerFieldProps['multiple']>>
  /** 多文件值写回字段时使用的分隔符。 */
  separator: ValueRef<NonNullable<SparkFileFieldProps['separator']>>
  /** 是否允许清空字段值。 */
  canClear: ValueRef<NonNullable<SparkFieldSemanticProps['clearable']>>
  /** 打开文件浏览器并返回用户选择的文件。 */
  browseFiles: (options: BrowseFilesCommand) => Promise<PageSelectedFile[]>
  /** 将浏览后的文件名字符串写回字段。 */
  updateValue: (value: string) => void | Promise<void>
}

export function useUploadBrowseFieldState(options: UploadBrowseFieldStateOptions) {
  const canUpload = computed(() => options.hasUploadCapability.value && options.action.value.trim().length > 0 && options.action.value !== '#')
  const canPrimaryAction = computed(() => (options.primaryAction.value === 'upload' ? canUpload.value : options.hasBrowseCapability.value))
  const primaryActionText = computed(() => (options.primaryAction.value === 'upload' ? options.buttonText.value : options.readonlyButtonText.value))
  const showClearButton = computed(() => options.canClear.value && options.isCurrentFieldEditable.value && options.currentRawStringValue.value.length > 0)

  async function handleBrowse(): Promise<void> {
    const files = await options.browseFiles({
      title: options.displayLabel.value,
      accept: options.accept.value,
      multiple: options.multiple.value,
      currentValue: options.currentRawStringValue.value,
    })

    if (options.browseWritesValue !== true || !options.isCurrentFieldEditable.value) return
    const mapper = options.getBrowseValue ?? (file => file.name)
    const nextValue = files.map(mapper).join(options.separator.value)
    if (nextValue.length > 0) {
      await options.updateValue(nextValue)
    }
  }

  async function handleUpload(): Promise<void> {
    const files = await options.uploadFiles({
      action: options.action.value,
      accept: options.accept.value,
      multiple: options.multiple.value,
      fieldName: options.fieldName.value || 'file',
      currentValue: options.currentRawStringValue.value,
    })
    if (files.length === 0) return
    const mapper = options.getUploadValue ?? (file => file.url ?? file.name)
    const nextValue = files.map(mapper).join(options.separator.value)
    await options.updateValue(nextValue)
  }

  function handlePrimaryAction(): void {
    if (options.primaryAction.value === 'browse') {
      void handleBrowse()
      return
    }
    void handleUpload()
  }

  function clearValue(): void {
    void options.updateValue('')
  }

  return {
    canUpload,
    canPrimaryAction,
    primaryActionText,
    showClearButton,
    handleBrowse,
    handleUpload,
    handlePrimaryAction,
    clearValue,
  }
}

export function useFileBrowserFieldState(options: FileBrowserFieldStateOptions) {
  const showClearButton = computed(() => options.canClear.value && options.isCurrentFieldEditable.value && options.currentRawStringValue.value.length > 0)

  async function openFileDialog(): Promise<void> {
    const files = await options.browseFiles({
      title: options.displayLabel.value,
      accept: options.accept.value,
      multiple: options.multiple.value,
      currentValue: options.currentRawStringValue.value,
    })

    if (!options.isCurrentFieldEditable.value) return
    const nextValue = files.map(file => file.name).join(options.separator.value)
    if (nextValue.length > 0) {
      await options.updateValue(nextValue)
    }
  }

  function clearValue(): void {
    void options.updateValue('')
  }

  return {
    canBrowse: computed(() => options.hasBrowseCapability.value),
    showClearButton,
    openFileDialog,
    clearValue,
  }
}
