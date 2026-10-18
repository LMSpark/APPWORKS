<!--
@module @spark-appworks/spark-component:components/editors/SparkJsonEditor
职责：实现 SparkJsonEditor（json-editor）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 infrastructure/editor 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 spark json editor 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <div class="spark-json-editor" :style="rootStyle" @input.capture="inputStarted" @focusout.capture="flushPendingInput">
    <div v-if="initError" class="spark-json-editor__notice">
      {{ initError }}
    </div>
    <div v-else-if="schemaError" class="spark-json-editor__notice spark-json-editor__notice--warning">
      {{ schemaError }}
    </div>
    <textarea
      v-if="initError"
      :value="toEditorText(currentContent)"
      class="spark-json-editor__fallback"
      :readonly="readOnly"
      spellcheck="false"
      @input="handleFallbackInput"
    />
    <div v-else ref="containerRef" class="spark-json-editor__surface"></div>
  </div>
</template>

<script setup lang="ts">
/**
 * @description JSON 编辑器组件，基于 CodeMirror 集成 JSON Schema 校验和树形视图，用于配置数据编辑。
 */
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import type {
  AjvValidatorOptions,
  Content,
  ContentErrors,
  JSONEditorPropsOptional,
  JSONSchema,
  JSONSchemaDefinitions,
} from 'vanilla-jsoneditor'

/** JSON 编辑器支持的展示模式。 */
type SparkJsonEditorMode = 'text' | 'tree' | 'table'
type SparkJsonEditorModeValue = NonNullable<JSONEditorPropsOptional['mode']>
type SparkJsonEditorValidator = NonNullable<JSONEditorPropsOptional['validator']>
type SparkJsonEditorRenderValue = NonNullable<JSONEditorPropsOptional['onRenderValue']>
type SparkJsonEditorRenderValueProps = Parameters<SparkJsonEditorRenderValue>[0]
type SparkJsonEditorRenderValueResult = ReturnType<SparkJsonEditorRenderValue>

type SparkJsonEditorInstance = {
  updateProps: (props: JSONEditorPropsOptional) => void
  validate: () => ContentErrors | undefined
  destroy: () => Promise<void>}

type SparkJsonEditorModule = {
  createJSONEditor: (options: {
    target: HTMLDivElement
    props: JSONEditorPropsOptional
  }) => SparkJsonEditorInstance
  Mode: Record<SparkJsonEditorMode, SparkJsonEditorModeValue>
  createAjvValidator?: (options: AjvValidatorOptions) => SparkJsonEditorValidator
  renderJSONSchemaEnum?: (
    props: SparkJsonEditorRenderValueProps,
    schema: JSONSchema,
    schemaDefinitions?: JSONSchemaDefinitions,
  ) => SparkJsonEditorRenderValueResult | undefined
  renderValue?: SparkJsonEditorRenderValue}

/** SparkJsonEditor 组件属性，描述 JSON 内容、Schema 校验和编辑模式。 */
type Props = {
  /** JSON 字符串内容 */
  modelValue?: string
  /** 是否只读 */
  readOnly?: boolean
  /** 编辑器高度 */
  height?: number | string
  /** 编辑模式 */
  mode?: SparkJsonEditorMode
  /** 缩进空格数 */
  indentation?: number | string
  /** Tab 缩进空格数 */
  tabSize?: number
  /** 是否显示主菜单栏 */
  mainMenuBar?: boolean
  /** 是否显示导航栏 */
  navigationBar?: boolean
  /** 是否显示状态栏 */
  statusBar?: boolean
  /** 是否提示格式化 */
  askToFormat?: boolean
  /** JSON Schema 校验规则 */
  schema?: JSONSchema | null
  /** JSON Schema 定义引用 */
  schemaDefinitions?: JSONSchemaDefinitions | null
  /** 是否启用 Schema 校验 */
  enableSchemaValidation?: boolean
  /** 是否启用 Schema 枚举渲染 */
  enableSchemaEnumRenderer?: boolean}

const props = withDefaults(defineProps<Props>(), {
  value: '',
  readOnly: false,
  height: 360,
  mode: 'text',
  indentation: 2,
  tabSize: 2,
  mainMenuBar: true,
  navigationBar: true,
  statusBar: true,
  askToFormat: false,
  schema: null,
  schemaDefinitions: null,
  enableSchemaValidation: true,
  enableSchemaEnumRenderer: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  /** 底层编辑器有尚未发出的输入通知；原字段接纳由宿主负责。 */
  'editing-change': [value: boolean]
}>()
let active = true

const containerRef = ref<HTMLDivElement | null>(null)
const editorRef = shallowRef<SparkJsonEditorInstance | null>(null)
const editorModuleRef = shallowRef<SparkJsonEditorModule | null>(null)
const initError = ref<string | null>(null)
const schemaError = ref<string | null>(null)
const currentContent = shallowRef<Content>(toEditorContent(props.modelValue ?? ''))
const lastSerializedValue = ref(props.modelValue)
const editorExtensionProps = shallowRef<Pick<JSONEditorPropsOptional, 'validator' | 'onRenderValue'>>({})

const rootStyle = computed(() => ({
  height: typeof props.height === 'number' ? `${props.height}px` : props.height,
}))

function toEditorContent(rawText: string): Content {
  try {
    return { json: JSON.parse(rawText) }
  } catch {
    return { text: rawText }
  }
}

function toEditorText(content: Content): string {
  if ('text' in content) return content.text
  return JSON.stringify(content.json, null, props.indentation) ?? ''
}

function resolveEditorMode(module: SparkJsonEditorModule | null, mode: SparkJsonEditorMode): SparkJsonEditorModeValue | undefined {
  return module?.Mode[mode]
}

function refreshSchemaExtensions(): void {
  const module = editorModuleRef.value
  const schema = props.schema
  schemaError.value = null

  if (!module || !schema) {
    editorExtensionProps.value = {}
    return
  }

  let validator: SparkJsonEditorValidator | undefined
  if (props.enableSchemaValidation && module.createAjvValidator) {
    try {
      validator = module.createAjvValidator({
        schema,
        ...(props.schemaDefinitions ? { schemaDefinitions: props.schemaDefinitions } : {}),
      })
    } catch (error) {
      schemaError.value = error instanceof Error
        ? `JSON Schema 校验器初始化失败: ${error.message}`
        : `JSON Schema 校验器初始化失败: ${String(error)}`
    }
  }

  let onRenderValue: SparkJsonEditorRenderValue | undefined
  if (
    props.enableSchemaEnumRenderer
    && props.mode !== 'text'
    && module.renderJSONSchemaEnum
    && module.renderValue
  ) {
    onRenderValue = (renderProps) => {
      return module.renderJSONSchemaEnum?.(
        renderProps,
        schema,
        props.schemaDefinitions ?? undefined,
      ) ?? module.renderValue?.(renderProps) ?? []
    }
  }

  editorExtensionProps.value = {
    ...(validator ? { validator } : {}),
    ...(onRenderValue ? { onRenderValue } : {}),
  }
}

function buildEditorProps(): JSONEditorPropsOptional {
  const mode = resolveEditorMode(editorModuleRef.value, props.mode)
  return {
    content: currentContent.value,
    readOnly: props.readOnly,
    ...(mode !== undefined ? { mode } : {}),
    indentation: props.indentation,
    tabSize: props.tabSize,
    mainMenuBar: props.mainMenuBar,
    navigationBar: props.navigationBar,
    statusBar: props.statusBar,
    askToFormat: props.askToFormat,
    ...editorExtensionProps.value,
    onChange: (updatedContent) => {
      if (!active || props.readOnly) return
      currentContent.value = updatedContent
      const nextValue = toEditorText(updatedContent)
      lastSerializedValue.value = nextValue
      if (nextValue !== props.modelValue) {
        emit('update:modelValue', nextValue)
      }
      emit('editing-change', false)
    },
  }
}

async function mountEditor(): Promise<void> {
  if (!containerRef.value || typeof window === 'undefined') return

  if (typeof ResizeObserver === 'undefined') {
    initError.value = '当前环境缺少 ResizeObserver，JSON 编辑器未初始化，已切换为文本编辑模式。'
    return
  }

  try {
    const editorModule: SparkJsonEditorModule = await import('vanilla-jsoneditor')
    editorModuleRef.value = editorModule
    refreshSchemaExtensions()
    editorRef.value = editorModule.createJSONEditor({
      target: containerRef.value,
      props: buildEditorProps(),
    })
    initError.value = null
  } catch (error) {
    initError.value = error instanceof Error
      ? `JSON 编辑器初始化失败: ${error.message}`
      : `JSON 编辑器初始化失败: ${String(error)}`
  }
}

function flushPendingInput(): void {
  // TextMode.validate会同步排空其延迟的文本通知，外部应用/保存动作才能消费最新内容。
  editorRef.value?.validate()
}

function inputStarted(event: Event): void {
  // 编辑内容与搜索/筛选输入分开；底层文本和表格值编辑器均使用contenteditable。
  if (active && !props.readOnly && event.target instanceof HTMLElement
    && event.target.closest('[contenteditable="true"], .spark-json-editor__fallback')) emit('editing-change', true)
}

function handleFallbackInput(event: Event): void {
  if (!active || props.readOnly || !(event.target instanceof HTMLTextAreaElement)) return
  const target = event.target
  currentContent.value = { text: target.value }
  lastSerializedValue.value = target.value
  emit('update:modelValue', target.value)
  emit('editing-change', false)
}

watch(() => props.modelValue, (value) => {
  if (value === undefined) return
  if (value === lastSerializedValue.value) return
  currentContent.value = toEditorContent(value)
  lastSerializedValue.value = value
  emit('editing-change', false)
  editorRef.value?.updateProps(buildEditorProps())
})

watch(
  () => [
    props.readOnly,
    props.mode,
    props.indentation,
    props.tabSize,
    props.mainMenuBar,
    props.navigationBar,
    props.statusBar,
    props.askToFormat,
  ] as const,
  () => {
    if (props.readOnly) emit('editing-change', false)
    editorRef.value?.updateProps(buildEditorProps())
  },
)

watch(
  () => [
    props.schema,
    props.schemaDefinitions,
    props.enableSchemaValidation,
    props.enableSchemaEnumRenderer,
    props.mode,
  ] as const,
  () => {
    refreshSchemaExtensions()
    editorRef.value?.updateProps(buildEditorProps())
  },
)

onMounted(() => {
  void mountEditor()
})

onBeforeUnmount(() => {
  active = false; emit('editing-change', false)
  const editor = editorRef.value
  editorRef.value = null
  editorModuleRef.value = null
  if (editor) {
    void editor.destroy()
  }
})
</script>

<style scoped>
.spark-json-editor {
  width: 100%;
  min-width: 0;
}

.spark-json-editor__notice {
  margin-bottom: 8px;
  padding: 8px 10px;
  border: 1px solid var(--el-color-warning-light-7);
  border-radius: 6px;
  background: var(--el-color-warning-light-9);
  color: var(--el-color-warning-dark-2);
  font-size: 12px;
  line-height: 1.5;
}

.spark-json-editor__notice--warning {
  border-color: var(--el-color-danger-light-7);
  background: var(--el-color-danger-light-9);
  color: var(--el-color-danger-dark-2);
}

.spark-json-editor__surface {
  width: 100%;
  height: 100%;
  min-height: 0;
}

.spark-json-editor__surface :deep(.jse-main) {
  height: 100%;
}

.spark-json-editor__fallback {
  display: block;
  width: 100%;
  height: calc(100% - 40px);
  min-height: 220px;
  padding: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  background: var(--el-fill-color-blank);
  color: var(--el-text-color-primary);
  box-sizing: border-box;
  resize: vertical;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.6;
}

.spark-json-editor__fallback:focus {
  outline: none;
  border-color: var(--el-color-primary);
}
</style>
