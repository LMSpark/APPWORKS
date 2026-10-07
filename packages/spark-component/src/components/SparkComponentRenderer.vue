<!--
@module @spark-appworks/spark-component:components/SparkComponentRenderer
职责：维护 @spark-appworks/spark-component 中 components/SparkComponentRenderer 的模块能力，围绕 RendererProps 提供稳定的公开契约。
边界：只覆盖当前模块职责，不把相邻包、运行时副作用或业务配置混入同一语义入口。
AI用途：需要定位 components/SparkComponentRenderer 的声明、导出和使用边界时，从本模块开始。
-->
<template>
  <!-- 已注册：SparkNode 运行时输入 + 事件处理器 → 统一作为 Vue Props 传递 -->
  <component
    v-if="renderBranch === 'registry'"
    v-bind="registryComponentProps"
    :is="registryComponent"
  >
    <template v-if="shouldRenderRegistryChildrenViaSlot" #default>
      <RecursiveChildrenBlock :children="renderableChildren" />
    </template>
  </component>
  <!-- 全局组件：放行 el-* 与脚本动态注册的 Render*，未知业务类型仍 fail-fast -->
  <component
    v-else-if="renderBranch === 'global-el'"
    v-bind="nodeForwardedProps"
    :is="globalElComponent"
  >
    <RecursiveChildrenBlock v-if="hasRenderableChildren" :children="renderableChildren" />
  </component>
  <!-- 原生 HTML 标签：允许直接渲染，避免配置里的 div/h2/h3/button 被误判成未注册组件 -->
  <component
    v-else-if="renderBranch === 'native'"
    v-bind="nativeNodeForwardedProps"
    :is="nativeHtmlTag"
  >
    <RecursiveChildrenBlock v-if="hasRenderableChildren" :children="renderableChildren" />
  </component>
  <!-- 未注册：降级渲染卡片负责提示外观与属性面板，子组件树仍继续递归 -->
  <UnregisteredNodeFallback
    v-else-if="renderBranch === 'fallback'"
    :node="effectiveNode"
    :title="fallbackTitle"
    :description="fallbackDescription"
  >
    <!-- 未注册时仍递归渲染子组件，父能力上下文由框架内部传递 -->
    <RecursiveChildrenBlock v-if="hasRenderableChildren" :children="renderableChildren" />
  </UnregisteredNodeFallback>
</template>

<script setup lang="ts">
/**
 * @description 通用组件渲染器，将 SparkNode 配置递归解析并动态渲染为已注册组件，是 SPARK 渲染引擎的核心入口。
 * @category internal
 */
/**
 * SparkComponentRenderer — SPARK 通用组件递归渲染引擎（无上下文版本）
 *
 * 职责：
 * 1. 从注册表解析 config.type → 组件实现
 * 2. 递归渲染子组件树
 * 3. 未注册组件降级显示警告（不抛出异常）
 *
 * 设计要点：
 * - **不创建自己的 ComponentContext**：渲染器是透明的路由层，不加入能力链
 * - 直接 inject(SPARK_REGISTRY_KEY) 获取注册表，不经过 useSparkComponent
 * - 父能力上下文通过运行时实例锚点表发现，不依赖 Vue provide/inject
 * - 根节点 / 测试场景通过 parentContext prop 显式挂载初始父上下文
 *
 * 上下文链对比：
 *   旧：rootContext → rendererContext → businessContext  ← 多一层噪声
 *   新：rootContext → businessContext                   ← 干净
 *
 * @example
 * ```vue
 * <!-- 根渲染器 -->
 * <SparkComponentRenderer :config="nodeConfig" />
 *
 * <!-- 测试时指定 rootContext -->
 * <SparkComponentRenderer :config="config" :parent-context="rootContext" />
 * ```
 */
import {
  cloneVNode,
  computed,
  createTextVNode,
  defineComponent,
  getCurrentInstance,
  h,
  inject,
  markRaw,
  onUnmounted,
  watchEffect,
} from 'vue'
import { DataView, isDataRow, type DataRow, type SparkNode, type SparkNodeChildren, normalizeSparkNode, isSparkNode, nodeId } from '@spark-appworks/spark-data'
import UnregisteredNodeFallback from './support/UnregisteredNodeFallback.vue'
import { resolveHostTypeFromContext } from '../core/useSparkComponent.js'

import type { CapabilityContext } from '@spark-appworks/spark-utils'
import type { ComponentRegistry, ComponentChildrenMode } from '../core/types.js'
import { consumeSparkCapability, createSparkCapabilityContext, isRecord, sparkProvide, sparkRemove } from '@spark-appworks/spark-utils'
import { SPARK_REGISTRY_KEY } from '../core/system/keys.js'
import { DATA_ROW, DATA_SOURCE, PAGE_COMPONENT_REGISTRY } from '../core/capability-keys.js'
import { sparkBindContextOwner, sparkResolveParentContext, sparkUnbindContextOwner, type SparkRuntimeOwner } from '../core/capability-context.js'
import type { BeforeRenderContext } from './support/beforeRender.js'
import { mergeNodeBeforeRenderProps, resolveNodeBeforeRender } from './support/beforeRender.js'
import { resolvePlaceholderProps } from '../core/useSparkComponent.js'

// ── 常量与局部类型：渲染器内部约束、运行时局部类型 ───────────────────────────

// h() 模型下，以下字段属于渲染器/布局层语义，不直接透传到业务组件。
const FILTERED_PROP_KEYS = new Set(['colSpan', 'rowSpan', 'gridColSpan', 'gridRowSpan', 'span', 'on', 'onBeforeRender', 'order'])
const FILTERED_NATIVE_SCOPE_KEYS = new Set(['row', 'rowIndex', 'data', 'dataSource'])
const MODEL_VALUE_PROP_COMPONENT_TYPES = new Set([
  'r-text',
  'r-textarea',
  'r-number',
  'r-date',
  'r-select',
  'r-multi-select',
  'r-radio',
  'r-checkbox',
  'r-checkbox-group',
  'r-switch',
  'r-html-editor',
  'r-slider',
  'r-rate',
  'r-color',
  'r-icon',
  'r-image',
  'r-file-path',
  'r-file-browser',
  'r-upload',
  'r-entity-picker',
  'r-user-picker',
  'r-dept-picker',
  'r-product-picker',
  'r-cascader',
  'r-tree-select',
  'r-transfer',
  'r-segmented',
  'r-check-tag',
  'r-mention',
  'r-time-picker',
  'r-time-select',
  'r-autocomplete',
  'r-dialog',
  'r-drawer',
  'r-tabs',
  'r-collapse',
  'r-steps',
  'code-editor',
  'json-editor',
])

type RenderableChild = SparkNode | string | number
type NodeRuntimeProps = {
  [key: string]: unknown}
type RenderBranch = 'hidden' | 'registry' | 'global-el' | 'native' | 'fallback'

type ParentCapabilityContext = CapabilityContext | null
type HostTypeConstraintState = {
  matched: boolean
  expectedTypes: string[]
  actualTypes: string[]}
type ScopedRuntimeInput = {
  rawProps: NodeRuntimeProps
  parentContext: ParentCapabilityContext}
type ResolvedBeforeRenderContext = Omit<BeforeRenderContext, 'id' | 'type' | 'props' | 'children'>

// 复用空对象常量，避免多个 computed 在“无 props”场景反复制造新引用。
const EMPTY_RUNTIME_PROPS: NodeRuntimeProps = {}
let _rendererScopedContextId = 0

// PAGE_DESIGN_REFACTOR_SOURCE[renderer-type-boundary]: 运行时真实分支是 registry/global-el/native/fallback；pageDesign 写入层应提前拦截目录外未知业务 type。
// 仅放行标准 HTML 标签；未知业务类型仍保留 fail-fast 告警分支。
const NATIVE_HTML_TAGS = new Set([
  'a', 'abbr', 'address', 'article', 'aside', 'audio', 'b', 'bdi', 'bdo', 'blockquote', 'br', 'button',
  'canvas', 'caption', 'cite', 'code', 'col', 'colgroup', 'data', 'datalist', 'dd', 'del', 'details',
  'dfn', 'dialog', 'div', 'dl', 'dt', 'em', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1',
  'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'i', 'iframe', 'img', 'input', 'ins', 'kbd', 'label',
  'legend', 'li', 'main', 'mark', 'menu', 'meter', 'nav', 'ol', 'optgroup', 'option', 'output', 'p',
  'picture', 'pre', 'progress', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'section', 'select', 'small',
  'source', 'span', 'strong', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'textarea', 'tfoot',
  'th', 'thead', 'time', 'tr', 'track', 'u', 'ul', 'var', 'video', 'wbr'
])

// ── 渲染器输入：外部只传节点本体与可选父上下文 ───────────────────────────────

/** SparkComponentRenderer 递归渲染入口属性。 */
type RendererProps = {
  /**
   * 被渲染的节点本体。
   *
   * 这里保留为整体 SparkNode，而不是把 type/props/children 平铺成渲染器自己的 props，
    * 目的是让“节点 AST”和“渲染器控制参数”分层，避免再次引入根级字段合并。
   */
  config: SparkNode
  /**
   * 显式父上下文（可选）。
   *
   * 仅用于根节点 / 测试场景：将其挂到当前 renderer 实例，子业务组件沿父实例链自动发现。
   * 普通递归渲染无需传递，子组件继承已有的 SparkContext 结构树。
   */
  parentContext?: CapabilityContext}

const rendererProps = defineProps<RendererProps>()
const currentInstance = getCurrentInstance()
const currentOwner: SparkRuntimeOwner | null = isSparkRuntimeOwner(currentInstance) ? currentInstance : null
// 保存当前渲染器组件类型，供本地递归块继续回到同一个渲染入口。
const currentRendererComponent = currentInstance?.type ?? null

// ── 基础工具：子节点归一与递归渲染 ───────────────────────────────────────────

/**
 * children 归一：
 * 1. 保留 SparkNode 子节点（结构化区域节点通常由容器显式消费，不会进入该列表）。
 * 2. 保留字符串和数字字面量，供统一 slot / fallback 路径直接渲染成文本节点。
 */
function normalizeRenderableChildren(children: SparkNodeChildren | undefined): RenderableChild[] {
  if (!Array.isArray(children) || children.length === 0) return []

  const normalized: RenderableChild[] = []
  for (const child of children) {
    if (isSparkNode(child)) {
      normalized.push(child)
      continue
    }
    if (typeof child === 'string' || typeof child === 'number') {
      normalized.push(child)
    }
  }
  return normalized
}

function normalizeRendererSparkNodeInput(node: SparkNode): SparkNode {
  return normalizeSparkNode(node)
}

function nodeKey(child: RenderableChild, index: number): string {
  if (!isSparkNode(child)) return `text-${index}`
  return nodeId(child) ?? `child-${index}`
}

function renderRecursiveChild(child: RenderableChild, index: number) {
  const key = nodeKey(child, index)
  if (!isSparkNode(child)) {
    return cloneVNode(createTextVNode(String(child)), { key })
  }

  // 理论上 currentRendererComponent 总是存在；这里保守兜底，避免异常环境下抛错。
  if (currentRendererComponent === null) {
    return null
  }
  return h(currentRendererComponent, { key, config: child })
}

function readRecursiveChildrenList(value: unknown): Array<RenderableChild> {
  if (!Array.isArray(value)) {
    throw new TypeError('[spark] RecursiveChildrenBlock.children must be an array')
  }
  const children: Array<RenderableChild> = []
  for (const child of value) {
    if (isSparkNode(child) || typeof child === 'string' || typeof child === 'number') {
      children.push(child)
      continue
    }
    throw new TypeError('[spark] RecursiveChildrenBlock.children must contain only SparkNode, string or number')
  }
  return children
}

/**
 * 递归 child 渲染块：
 * - 把模板里重复的 SparkNode / 文本子节点渲染逻辑集中到一处。
 * - SparkNode 子节点会重新交回 SparkComponentRenderer 处理，确保注册表解析、beforeRender、权限逻辑继续生效。
 * - 文本子节点输出为 text vnode，保持“无额外包裹标签”的渲染结果。
 */
const RecursiveChildrenBlock = defineComponent({
  name: 'RecursiveChildrenBlock',
  props: {
    children: {
      type: Array,
      required: true,
    },
  },
  setup(props) {
    // 本地小组件本身不持有业务上下文，只负责把子节点重新路由回渲染器入口。
    return () => readRecursiveChildrenList(props.children).map(renderRecursiveChild)
  },
})

// ── 基础工具：组件声明识别与 registry 协商 ─────────────────────────────────

// 判断目标组件是否显式声明某个 prop，用于 children prop / slot 协商。
function declaresProp(component: unknown, propName: string): boolean {
  if (!isObjectLike(component)) return false
  const declared = Reflect.get(component, 'props')
  if (declared === null || declared === undefined) return false
  if (Array.isArray(declared)) return declared.includes(propName)
  if (typeof declared !== 'object' && typeof declared !== 'function') return false
  return Object.prototype.hasOwnProperty.call(declared, propName)
}

// 渲染器内部统一的诊断输出入口，避免 beforeRender / 未注册分支各自散落 console.warn。
function warnRendererIssue(message: string, error?: unknown): void {
  if (import.meta.env.DEV) console.warn(`[SparkComponentRenderer] ${message}`, ...(error !== undefined ? [error] : []))
}

// registry 元信息允许显式指定 children 协商模式；未指定时回退到自动探测。
function resolveChildrenMode(meta: NodeRuntimeProps | undefined): ComponentChildrenMode {
  const value = meta?.['childrenMode']
  return value === 'prop' || value === 'slot' ? value : 'auto'
}

function readHostTypeConstraints(meta: NodeRuntimeProps | undefined): string[] {
  const rawValue = meta?.['hostTypes']
  if (typeof rawValue === 'string') {
    return rawValue.length > 0 ? [rawValue] : []
  }

  if (!Array.isArray(rawValue)) return []

  return rawValue.filter((value): value is string => typeof value === 'string' && value.length > 0)
}

function collectHostTypeChain(parentContext: ParentCapabilityContext): string[] {
  const chain: string[] = []
  let currentContext = parentContext

  while (currentContext !== null) {
    if (typeof currentContext.type === 'string' && currentContext.type.length > 0) {
      chain.push(currentContext.type)
    }
    currentContext = currentContext.parent ?? null
  }

  return chain
}

function resolveHostTypeConstraintState(
  meta: NodeRuntimeProps | undefined,
  parentContext: ParentCapabilityContext,
): HostTypeConstraintState {
  const expectedTypes = readHostTypeConstraints(meta)
  if (expectedTypes.length === 0) {
    return {
      matched: true,
      expectedTypes: [],
      actualTypes: [],
    }
  }

  const resolvedHost = resolveHostTypeFromContext(parentContext, {
    hostTypes: expectedTypes,
  })

  return {
    matched: resolvedHost.hostType !== null,
    expectedTypes,
    actualTypes: collectHostTypeChain(parentContext),
  }
}

// ── 基础工具：渲染时作用域数据解析 ─────────────────────────────────────────

function isObjectLike(value: unknown): value is object {
  return (typeof value === 'object' && value !== null) || typeof value === 'function'
}

function isSparkRuntimeOwner(value: unknown): value is SparkRuntimeOwner {
  return isObjectLike(value)
}

function isDataView(value: unknown): value is DataView {
  return value instanceof DataView
}

function resolveScopedRowIndex(rawProps: NodeRuntimeProps): number | undefined {
  return typeof rawProps['rowIndex'] === 'number' ? rawProps['rowIndex'] : undefined
}

// dataSource 优先取节点显式注入，其次沿父能力链回溯 DATA_SOURCE。
function resolveScopedDataSource({ rawProps, parentContext }: ScopedRuntimeInput): DataView | null {
  const propDataSource = rawProps['dataSource']
  if (isDataView(propDataSource)) return propDataSource
  return consumeSparkCapability(parentContext, DATA_SOURCE)
}

// row 优先取节点局部作用域，其次退回 data，再次沿父能力链回溯 DATA_ROW。
function resolveScopedRow({ rawProps, parentContext }: ScopedRuntimeInput): DataRow | null {
  const row = rawProps['row']
  if (isDataRow(row)) return row
  const data = rawProps['data']
  if (isDataRow(data)) return data
  return consumeSparkCapability(parentContext, DATA_ROW)
}

/**
 * 构造 beforeRender 所需的上下文快照。
 *
 * 这里把作用域数据解析集中到一个 helper 里，避免 computed 主体里既做状态流转又做上下文拼装。
 */
function buildBeforeRenderContext({ rawProps, parentContext }: ScopedRuntimeInput): ResolvedBeforeRenderContext {
  const dataSource = resolveScopedDataSource({ rawProps, parentContext })
  const row = resolveScopedRow({ rawProps, parentContext })

  return {
    row,
    data: rawProps['data'] ?? row,
    index: resolveScopedRowIndex(rawProps),
    dataSource,
    host: {
      type: parentContext?.type ?? null,
    },
  }
}

// ── 基础工具：props 透传与事件映射 ──────────────────────────────────────────

/**
 * 把 SparkNode.props 转成真正要下发给目标组件的 props：
 * - 过滤渲染器内部保留键
 * - 把 on.xxx 映射成 Vue listener props
 * - 保留 fast-path，尽量复用原始对象引用
 */
function normalizeConfigValuePropForVueModel(nodeType: string | null, rawProps: NodeRuntimeProps): NodeRuntimeProps {
  if (
    nodeType === null ||
    !MODEL_VALUE_PROP_COMPONENT_TYPES.has(nodeType) ||
    !Object.prototype.hasOwnProperty.call(rawProps, 'value')
  ) {
    return rawProps
  }

  const { value, ...rest } = rawProps
  if (
    Object.prototype.hasOwnProperty.call(rest, 'modelValue') ||
    Object.prototype.hasOwnProperty.call(rest, 'model-value')
  ) {
    return rest
  }

  return {
    ...rest,
    modelValue: value,
  }
}

function buildNodeForwardedProps(rawProps: NodeRuntimeProps, nodeType: string | null): NodeRuntimeProps {
  const normalizedProps = normalizeConfigValuePropForVueModel(nodeType, rawProps)
  const onMap = normalizedProps['on']
  const hasEvents = isNonEmptyRecord(onMap)

  // fast-path：叶子节点通常无事件且无框架保留键，直接复用原引用即可。
  if (!hasEvents && !hasFilteredKeys(normalizedProps)) return normalizedProps

  const filteredProps = filterForwardableProps(normalizedProps)
  if (!hasEvents) return filteredProps

  return {
    ...filteredProps,
    ...buildForwardedEventProps(onMap),
  }
}

// 已注册组件额外收到的结构字段，只在 registry 分支透传。
// SparkNode 三字段（type / props / children）严格 h() 三段式。
function buildRegistryStructuralProps(
  node: SparkNode,
  consumesChildrenProp: boolean,
): NodeRuntimeProps {
  const structuralProps: NodeRuntimeProps = {
    type: node.type,
  }
  if (node.id !== undefined) {
    structuralProps['id'] = node.id
  }

  if (consumesChildrenProp && Array.isArray(node.children) && node.children.length > 0) {
    structuralProps['children'] = node.children
  }

  return structuralProps
}

// props 透传辅助：过滤框架保留键，并把事件映射为 Vue listener props。

// 判断 props 中是否存在任何渲染器保留字段，用于 fast-path 复用原始对象。
function hasFilteredKeys(obj: NodeRuntimeProps): boolean {
  for (const key of Object.keys(obj)) {
    if (FILTERED_PROP_KEYS.has(key) || key.startsWith('$')) return true
  }
  return false
}

// 仅把“非空对象”视为事件 map，避免把 null / 原始值误判成可展开对象。
function isNonEmptyRecord(value: unknown): value is NodeRuntimeProps {
  return isRecord(value) && Object.keys(value).length > 0
}

const _listenerNameCache = new Map<string, string>()

// 把脚本事件名转换为 Vue listener prop 名，例如 click -> onClick、row-click -> onRowClick。
function toListenerPropName(eventName: string): string {
  let cached = _listenerNameCache.get(eventName)
  if (cached !== undefined) return cached

  const normalized = eventName.replace(/[:\-]([a-zA-Z])/g, (_, char: string) => char.toUpperCase())
  cached = `on${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`
  _listenerNameCache.set(eventName, cached)
  return cached
}

// 统一把 on.xxx 映射成真正的 Vue listener props 对象。
function buildForwardedEventProps(eventMap: NodeRuntimeProps): NodeRuntimeProps {
  return Object.fromEntries(
    Object.entries(eventMap).map(([eventName, handler]) => [toListenerPropName(eventName), handler])
  )
}

// 过滤渲染器保留字段，得到可以直接透传给组件的业务 props。
function filterForwardableProps(rawProps: NodeRuntimeProps): NodeRuntimeProps {
  return Object.fromEntries(
    Object.entries(rawProps).filter(([key]) => !FILTERED_PROP_KEYS.has(key) && !key.startsWith('$'))
  )
}

function filterNativeForwardableProps(rawProps: NodeRuntimeProps): NodeRuntimeProps {
  return Object.fromEntries(
    Object.entries(rawProps).filter(([key]) => {
      if (FILTERED_PROP_KEYS.has(key) || FILTERED_NATIVE_SCOPE_KEYS.has(key)) return false
      return !key.startsWith('$')
    })
  )
}

// ── 渲染器运行时锚点：父能力上下文与注册表入口 ──────────────────────────────

// 渲染器只直接消费注册表，不创建自己的业务能力上下文。
const registry = inject<ComponentRegistry | undefined>(SPARK_REGISTRY_KEY, undefined)

// ── SparkNode 处理管线：输入节点 → beforeRender → 生效节点 ───────────────────

// 归一化后的输入节点：校验 type 并补齐 children。
const normalizedNode = computed<SparkNode>(() => normalizeRendererSparkNodeInput(rendererProps.config))

// 通过运行时实例锚点表解析父能力上下文，不走 Vue provide/inject。
const parentCapabilityContext = computed(() =>
  sparkResolveParentContext(currentOwner, rendererProps.parentContext)
)

/**
 * beforeRender 状态：
 * - 只针对当前节点执行一次
 * - 产出 visible 与 propsPatch
 * - 所有后续分支都基于这份结果继续工作
 */
const beforeRenderState = computed(() => {
  const node = normalizedNode.value
  const rawProps = node.props ?? EMPTY_RUNTIME_PROPS

  return resolveNodeBeforeRender(
    node,
    buildBeforeRenderContext({
      rawProps,
      parentContext: parentCapabilityContext.value,
    }),
    warnRendererIssue,
  )
})

// 生效节点：把 beforeRender 的 patch 合并回 SparkNode，后续解析都基于它。
const effectiveNodeBeforePlaceholder = computed<SparkNode>(() =>
  mergeNodeBeforeRenderProps(normalizedNode.value, beforeRenderState.value.propsPatch)
)

// 占位符解析：将 $[fieldName] 替换为当前行数据字段值。
const effectiveNode = computed<SparkNode>(() => {
  const node = effectiveNodeBeforePlaceholder.value
  const props = node.props
  if (!props) return node
  const row = resolveScopedRow({ rawProps: props, parentContext: parentCapabilityContext.value })
  const resolved = resolvePlaceholderProps(props, row)
  if (resolved === props) return node
  return { ...node, props: resolved }
})

const rendererScopedRow = computed(() => {
  return resolveScopedRow({
    rawProps: effectiveNode.value.props ?? EMPTY_RUNTIME_PROPS,
    parentContext: parentCapabilityContext.value,
  })
})

const rendererRowCapabilityContext = createSparkCapabilityContext({
  id: `spark-renderer-row-${++_rendererScopedContextId}`,
  type: 'r-renderer-row-scope',
})

let boundCapabilityContext: CapabilityContext | null = null

watchEffect(() => {
  const row = rendererScopedRow.value
  const parentContext = parentCapabilityContext.value

  if (parentContext !== null) {
    rendererRowCapabilityContext.parent = parentContext
  } else {
    delete rendererRowCapabilityContext.parent
  }

  if (row === null) {
    sparkRemove(rendererRowCapabilityContext, DATA_ROW)
  } else {
    sparkProvide(rendererRowCapabilityContext, DATA_ROW, row)
  }

  if (currentInstance === null) return

  const nextBoundContext = row !== null
    ? rendererRowCapabilityContext
    : (rendererProps.parentContext ?? null)

  if (boundCapabilityContext === nextBoundContext) return

  if (boundCapabilityContext !== null) {
    sparkUnbindContextOwner(currentInstance)
  }

  if (nextBoundContext !== null) {
    sparkBindContextOwner(currentInstance, nextBoundContext)
  }

  boundCapabilityContext = nextBoundContext
})

onUnmounted(() => {
  if (currentInstance !== null && boundCapabilityContext !== null) {
    sparkUnbindContextOwner(currentInstance)
  }
  boundCapabilityContext = null
})

// ── 组件解析：registry 组件 / 未注册降级 ────────────────

// 当前节点 type 最终来源于 beforeRender 合并后的 effectiveNode。
const resolvedNodeType = computed(() => {
  const type = effectiveNode.value.type
  return typeof type === 'string' && type.length > 0 ? type : null
})

// 先看 registry；renderer 的第一职责是把 SparkNode.type 解析成真实组件。
const registryDefinition = computed(() => {
  const type = resolvedNodeType.value
  return type !== null ? (registry?.get(type) ?? null) : null
})

const registryHostTypeState = computed<HostTypeConstraintState>(() => {
  return resolveHostTypeConstraintState(registryDefinition.value?.meta, parentCapabilityContext.value)
})

const registryComponent = computed(() => {
  const definition = registryDefinition.value
  if (!definition) return null
  if (!registryHostTypeState.value.matched) return null
  return resolveRenderableComponent(definition.component)
})

function resolveRenderableComponent(component: unknown): object | null {
  return isObjectLike(component) ? markRaw(component) : null
}

function isNativeHtmlTag(type: string | null): type is string {
  return type !== null && NATIVE_HTML_TAGS.has(type)
}

function kebabToPascalCase(value: string): string {
  return value
    .split('-')
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

function resolveGlobalElComponent(type: string | null) {
  if (type === null) return null
  const appComponents = currentInstance?.appContext.components
  if (appComponents === undefined) return null

  const pageRegistry = consumeSparkCapability(parentCapabilityContext.value, PAGE_COMPONENT_REGISTRY)
  const pageRender = pageRegistry?.getRender(type)
  if (pageRender) return resolveRenderableComponent(pageRender)

  if (!type.startsWith('el-')) return null

  const direct = appComponents[type]
  if (direct !== undefined) return resolveRenderableComponent(direct)

  const pascal = kebabToPascalCase(type)
  const byPascal = appComponents[pascal]
  if (byPascal !== undefined) return resolveRenderableComponent(byPascal)

  return null
}

const globalElComponent = computed(() => {
  if (registryComponent.value !== null) return null
  return resolveGlobalElComponent(resolvedNodeType.value)
})

const nativeHtmlTag = computed(() => {
  const type = resolvedNodeType.value
  if (registryComponent.value !== null || globalElComponent.value !== null) return null
  return isNativeHtmlTag(type) ? type : null
})

// ── 渲染分支：统一收敛成单一分支枚举 ────────────────────────────────────────

// 分支集中判定，模板直接消费 renderBranch，而不再包裹独立的 shouldRenderXxx computed。
const renderBranch = computed<RenderBranch>(() => {
  if (!beforeRenderState.value.visible) return 'hidden'
  if (registryComponent.value !== null) return 'registry'
  if (globalElComponent.value !== null) return 'global-el'
  if (nativeHtmlTag.value !== null) return 'native'
  return 'fallback'
})

const fallbackTitle = computed(() => {
  return registryDefinition.value !== null && !registryHostTypeState.value.matched
    ? '宿主类型不匹配'
    : '未注册的组件类型'
})

const fallbackDescription = computed(() => {
  if (registryDefinition.value === null || registryHostTypeState.value.matched) return ''

  const expected = registryHostTypeState.value.expectedTypes.join(' / ')
  const actual = registryHostTypeState.value.actualTypes.join(' / ')
  return `期望宿主链类型: ${expected}；当前宿主链类型: ${actual || '无'}`
})

// ── 子节点策略：哪些 child 继续递归，哪些 child 透传给目标组件 ──────────────

// 先把当前节点的 children 归一成 renderer 可消费的字面量 / SparkNode 列表。
const renderableChildren = computed<RenderableChild[]>(() =>
  normalizeRenderableChildren(effectiveNode.value.children)
)

// 模板里是否需要继续挂 RecursiveChildrenBlock。
const hasRenderableChildren = computed(() => renderableChildren.value.length > 0)

// childrenMode 是 registry 对 renderer 的显式协议，优先级高于组件 props 声明推断。
const registryChildrenMode = computed<ComponentChildrenMode>(() =>
  resolveChildrenMode(registryDefinition.value?.meta)
)

// registry 组件到底是吃 children prop，还是走默认 slot。
const registryConsumesChildrenProp = computed(() => {
  const component = registryComponent.value
  if (registryChildrenMode.value === 'prop') return true
  if (registryChildrenMode.value === 'slot') return false
  return component !== null && declaresProp(component, 'children')
})

// 只有 registry 组件才需要决定“children 走 prop 还是走 slot”。
const shouldRenderRegistryChildrenViaSlot = computed(() =>
  hasRenderableChildren.value && !registryConsumesChildrenProp.value
)

// ── props 透传：SparkNode.props → 目标组件运行时 props ───────────────────────

// 所有组件共享的基础 props：从 SparkNode.props 过滤并规范化后得到。
const nodeForwardedProps = computed(() =>
  buildNodeForwardedProps(effectiveNode.value.props ?? EMPTY_RUNTIME_PROPS, resolvedNodeType.value)
)

const nativeNodeForwardedProps = computed(() =>
  filterNativeForwardableProps(nodeForwardedProps.value)
)

/**
 * 已注册组件的完整 Props = forwardedProps + 必要的 SparkNode 结构字段。
 *
 * 对齐运行时约束：
 *   - 业务输入 → config.props
 *   - 结构输入 → type / id / children
 *
 * 命名区域通过结构化 props 声明；
 * 这里仅做统一 props 透传，并保留对 `order` 残余输入的过滤。
 *
 * 仅用于 registry 组件分支。
 */
const registryComponentProps = computed(() => ({
  ...nodeForwardedProps.value,
  ...buildRegistryStructuralProps(effectiveNode.value, registryConsumesChildrenProp.value),
}))
</script>
