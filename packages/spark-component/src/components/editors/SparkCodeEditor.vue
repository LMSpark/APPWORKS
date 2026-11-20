<!--
@module @spark-appworks/spark-component:components/editors/SparkCodeEditor
职责：实现 SparkCodeEditor（code-editor）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 infrastructure/editor 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 spark code editor 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <div class="spark-code-editor" :style="rootStyle">
    <div v-if="initError" class="spark-code-editor__notice">
      {{ initError }}
    </div>
    <textarea
      v-if="initError"
      :value="modelValue"
      class="spark-code-editor__fallback"
      :readonly="readOnly"
      spellcheck="false"
      @input="handleFallbackInput"
    />
    <div v-else ref="containerRef" class="spark-code-editor__surface"></div>
  </div>
</template>

<script setup lang="ts">
/**
 * @description 代码编辑器组件，基于 CodeMirror 6 提供语法高亮编辑，加载失败时回退为 textarea。
 */
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import type { Extension } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import type { SparkCodeEditorProps } from './SparkCodeEditor.props'

const props = withDefaults(defineProps<SparkCodeEditorProps>(), {
  modelValue: '',
  language: 'javascript',
  readOnly: false,
  height: 360,
  tabSize: 2,
  lineWrapping: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const containerRef = ref<HTMLDivElement | null>(null)
const editorRef = shallowRef<EditorView | null>(null)
const initError = ref<string | null>(null)
const lastSyncedValue = ref(props.modelValue)

const rootStyle = computed(() => ({
  height: typeof props.height === 'number' ? `${props.height}px` : props.height,
}))

/**
 * 创建 CodeMirror 主题扩展。
 *
 * 主题只负责把编辑器视觉贴合 Element Plus 变量；编辑能力、快捷键和语言扩展
 * 在 mountEditor 中按初始化时序组装，避免样式和行为配置混在一起。
 */
function createEditorTheme(EditorViewCtor: typeof import('@codemirror/view').EditorView): Extension {
  return EditorViewCtor.theme({
    '&': {
      height: '100%',
      border: '1px solid var(--el-border-color)',
      borderRadius: '6px',
      backgroundColor: 'var(--el-fill-color-blank)',
      color: 'var(--el-text-color-primary)',
      fontSize: '13px',
    },
    '&.cm-focused': {
      outline: '1px solid var(--el-color-primary)',
      outlineOffset: '0',
      borderColor: 'var(--el-color-primary)',
    },
    '.cm-scroller': {
      overflow: 'auto',
      fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
      lineHeight: '1.6',
    },
    '.cm-content': {
      padding: '12px 0',
      caretColor: 'var(--el-color-primary)',
    },
    '.cm-line': {
      padding: '0 12px',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--el-fill-color-light)',
      color: 'var(--el-text-color-secondary)',
      border: 'none',
      borderRight: '1px solid var(--el-border-color-lighter)',
    },
    '.cm-activeLine': {
      backgroundColor: 'var(--el-fill-color-light)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'transparent',
    },
    '.cm-selectionBackground, ::selection': {
      backgroundColor: 'rgba(64, 158, 255, 0.24)',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'var(--el-color-primary)',
    },
    '.cm-panels': {
      backgroundColor: 'var(--el-fill-color-light)',
      color: 'var(--el-text-color-primary)',
    },
    '.cm-searchMatch': {
      backgroundColor: 'rgba(230, 162, 60, 0.18)',
      outline: '1px solid rgba(230, 162, 60, 0.38)',
    },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: 'rgba(64, 158, 255, 0.2)',
    },
  })
}

/** 根据 props.language 选择语言扩展；未知值由 props 类型在编译期挡住。 */
function resolveLanguageExtension(
  javascript: typeof import('@codemirror/lang-javascript').javascript,
  css: typeof import('@codemirror/lang-css').css,
): Extension {
  return props.language === 'css' ? css() : javascript()
}

/**
 * 初始化或重建 CodeMirror 实例。
 *
 * 时序：
 * 1. 清理旧实例，避免语言/只读状态切换后残留旧扩展。
 * 2. 并行加载 CodeMirror 核心、视图、语言包和命令包，降低首开等待。
 * 3. 按基础能力 → 行为配置 → 主题 → 语言 → 更新监听的顺序组装 extensions。
 * 4. 任意加载失败都降级到 textarea，保证配置编辑功能仍可用。
 */
async function mountEditor(): Promise<void> {
  if (!containerRef.value || typeof window === 'undefined') return

  const host = containerRef.value
  editorRef.value?.destroy()
  editorRef.value = null

  try {
    const [
      { basicSetup },
      { EditorState },
      { EditorView, keymap },
      { syntaxHighlighting, defaultHighlightStyle },
      { javascript },
      { css },
      { indentWithTab },
    ] = await Promise.all([
      import('codemirror'),
      import('@codemirror/state'),
      import('@codemirror/view'),
      import('@codemirror/language'),
      import('@codemirror/lang-javascript'),
      import('@codemirror/lang-css'),
      import('@codemirror/commands'),
    ])

    const extensions: Extension[] = [
      basicSetup,
      keymap.of([indentWithTab]),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      EditorState.tabSize.of(props.tabSize),
      EditorState.readOnly.of(props.readOnly),
      EditorView.editable.of(!props.readOnly),
      createEditorTheme(EditorView),
      resolveLanguageExtension(javascript, css),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return
        const nextValue = update.state.doc.toString()
        lastSyncedValue.value = nextValue
        if (nextValue !== props.modelValue) {
          emit('update:modelValue', nextValue)
        }
      }),
    ]

    if (props.lineWrapping) {
      extensions.push(EditorView.lineWrapping)
    }

    editorRef.value = new EditorView({
      state: EditorState.create({
        doc: props.modelValue ?? '',
        extensions,
      }),
      parent: host,
    })

    lastSyncedValue.value = props.modelValue
    initError.value = null
  } catch (error) {
    initError.value = error instanceof Error
      ? `代码编辑器初始化失败: ${error.message}`
      : `代码编辑器初始化失败: ${String(error)}`
  }
}

/** textarea 降级模式的输入同步路径。 */
function handleFallbackInput(event: Event): void {
  if (!(event.target instanceof HTMLTextAreaElement)) return
  const target = event.target
  lastSyncedValue.value = target.value
  emit('update:modelValue', target.value)
}

// 外部 modelValue 变化时同步到编辑器；本地输入已同步过的值直接跳过，避免循环派发。
watch(() => props.modelValue, (value) => {
  if (value === lastSyncedValue.value) return
  lastSyncedValue.value = value
  const editor = editorRef.value
  if (!editor) return
  const currentValue = editor.state.doc.toString()
  if (currentValue === value) return
  editor.dispatch({
    changes: {
      from: 0,
      to: editor.state.doc.length,
      insert: value ?? '',
    },
  })
})

// 语言、只读、缩进或换行策略变化会影响扩展集合，直接重建编辑器实例。
watch(
  () => [props.language, props.readOnly, props.tabSize, props.lineWrapping] as const,
  () => {
    if (!editorRef.value) return
    void mountEditor()
  },
)

onMounted(() => {
  void mountEditor()
})

onBeforeUnmount(() => {
  editorRef.value?.destroy()
  editorRef.value = null
})
</script>

<style scoped>
.spark-code-editor {
  width: 100%;
  min-width: 0;
}

.spark-code-editor__notice {
  margin-bottom: 8px;
  padding: 8px 10px;
  border: 1px solid var(--el-color-warning-light-7);
  border-radius: 6px;
  background: var(--el-color-warning-light-9);
  color: var(--el-color-warning-dark-2);
  font-size: 12px;
  line-height: 1.5;
}

.spark-code-editor__surface {
  width: 100%;
  height: 100%;
  min-height: 0;
}

.spark-code-editor__surface :deep(.cm-editor) {
  height: 100%;
}

.spark-code-editor__fallback {
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

.spark-code-editor__fallback:focus {
  outline: none;
  border-color: var(--el-color-primary);
}
</style>
