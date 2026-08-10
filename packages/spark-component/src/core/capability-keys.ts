/**
 * @module @spark-appworks/spark-component:core/capability-keys
 * 职责：提供 capability keys 在 spark-component 渲染体系中的辅助能力，连接配置、上下文和组件运行时。
 * 边界：只服务 component-runtime，不绕过 DataViewKey/DataSet 管线，也不承担应用路由职责。
 * AI用途：排查组件配置、运行态上下文或渲染注册关系时，用本模块确认局部语义。
 */
/**
 * spark-component 能力键定义。
 *
 * ## 三类键：
 * 1. 数据层键（依赖 @spark-appworks/spark-data 类型）：PAGE_DATASET / DATA_SOURCE / DATA_ROW
 * 2. 渲染层键（原在 spark-utils 中但属于 spark-component 语义）：
 *    MODULE_CONTEXT / PAGE_COMPONENT_REGISTRY / CSS_SCOPE
 * 3. 页面 UI 服务与权限键（从 spark-utils 迁入）：
 *    PAGE_SERVICE / PAGE_PERMISSION_MODE / PagePermissionMode
 * 4. 字段渲染局部策略：
 *    SUBTREE_FIELD_POLICY
 *
 * 注：PageServiceCapability 等运行时服务契约以
 * @spark-appworks/spark-component/runtime 为 SSOT。
 */

import { defineCapability, isCallable, isRecord } from '@spark-appworks/spark-utils'
import { DataView, isDataRow, type DataRow, type DataSetContract } from '@spark-appworks/spark-data'
import type {
  PageServiceCapability,
} from '../runtime'

/** 页面组件在完整后端权限快照改造完成前使用的三态过渡模式。 */
export type PagePermissionMode = 'none' | 'masked' | 'invisible'

/** 子树级字段输入策略 — 仅描述子树内字段输入行为，不改变全局 permissionMode。 */
export type SubtreeFieldPolicy = 'unrestricted'

export type {
  PageMessageType,
  PageDialogResult,
  PageDialogOptions,
  PageBrowseFilesOptions,
  PageSelectedFile,
  PageUploadFilesOptions,
  PageUploadedFile,
  PageSelectorOption,
  PageSelectEntitiesOptions,
  PageSelectedEntity,
  PageServiceCapability,
} from '../runtime'

function hasCallable(record: Record<string, unknown>, key: string): boolean {
  return isCallable(record[key])
}

// ── 主题类型（spark-component 为 SSOT；spark-app 通过 extends 扩展）──────

/** 主题模式 */
export type ThemeMode = 'light' | 'dark' | 'auto'

/** 主题服务能力接口（最小契约，不含 Vue 响应式） */
export type ThemeCapability = {
  /** 当前生效的主题模式（light 或 dark）。 */
  readonly current: 'light' | 'dark'
  /** 用户选择的主题模式（含 auto）。 */
  readonly mode: ThemeMode
  /** 设置主题模式。 */
  setMode(mode: ThemeMode): void
  /** 当前是否为暗色主题。 */
  readonly isDark: boolean
  /** 在 light/dark 之间切换主题。 */
  toggle(): void
}

// ── 模块上下文能力 ────────────────────────────────────────────────────────

/** 模块列表项 */
export type ModuleContextItem = {
    /** 唯一标识。 */
id: string | number
    /** 显示标题。 */
title: string}

/** 当前模块上下文快照 */
export type ModuleContext = {
    /** selected 字段。 */
selected: string | number | null
    /** items 字段。 */
items: readonly ModuleContextItem[]
    /** node Id 标识。 */
nodeId: string}

/** MODULE_CONTEXT 能力接口 */
export type ModuleContextCapability = {
  /** 获取当前模块上下文快照。 */
  getCurrent(): ModuleContext | null
  /** 订阅模块上下文变更，返回取消订阅函数。 */
  subscribe(handler: (next: ModuleContext | null, prev: ModuleContext | null) => void): () => void
}

// ── 页面组件注册表能力 ─────────────────────────────────────────────────────

/** Page Component Instance Entry 的语义模型。 */
export type PageComponentInstanceEntry = {
    /** 唯一标识。 */
id: string
    /** 类型标识。 */
type: string
    /** 组件属性集合。 */
props?: Record<string, unknown>}

/** Page Component Api Entry 的语义模型。 */
export type PageComponentApiEntry = {
    /** 唯一标识。 */
id: string
    /** 类型标识。 */
type: string
    /** api 字段。 */
api: unknown}

/** 页面内组件实例/API 注册表能力接口 */
export type PageComponentRegistry = {
  /** 注册组件实例元数据。 */
  registerInstance(entry: PageComponentInstanceEntry): void
  /** 注销指定 id 的组件实例。 */
  unregisterInstance(id: string): void
  /** 列出已注册实例，可按 type 过滤。 */
  listInstances(type?: string): PageComponentInstanceEntry[]
  /** 按 id 获取组件实例元数据。 */
  getInstance(id: string): PageComponentInstanceEntry | null

  /** 注册组件暴露的运行时 API。 */
  registerApi(entry: PageComponentApiEntry): void
  /** 注销指定 id 的组件 API。 */
  unregisterApi(id: string): void
  /** 列出已注册 API，可按 type 过滤。 */
  listApis(type?: string): PageComponentApiEntry[]
  /** 按 id 获取组件 API 对象。 */
  getApi<T = unknown>(id: string): T | null
  /** 按 type 获取同类组件 API 列表。 */
  getApisByType<T = unknown>(type: string): T[]
}

// ── CSS 作用域注入能力 ─────────────────────────────────────────────────────

/** 页面作用域 CSS 注入能力（由 SparkPageRenderer 提供） */
export type PageCssScopeCapability = {
  /** 向当前页面作用域注入 CSS 文本。 */
  inject(css: string): void
}

// ── CapabilityTypeMap 扩展（数据层键 + 渲染层键 + 页面 UI/权限键） ────────

declare module '@spark-appworks/spark-utils' {
  interface CapabilityTypeMap {
    'spark:capability:page-dataset': DataSetContract
    'spark:capability:data-source': DataView
    'spark:capability:data-row': DataRow
    'spark:capability:page-component-registry': PageComponentRegistry
    'spark:capability:module-context': ModuleContextCapability
    'spark:capability:css-scope': PageCssScopeCapability
    'spark:capability:page-service': PageServiceCapability
    'spark:capability:permission-mode': PagePermissionMode
    'spark:capability:subtree-field-policy': SubtreeFieldPolicy
  }
}

function isDataSetContract(value: unknown): value is DataSetContract {
  if (!isRecord(value)) return false
  return typeof value['dataSetName'] === 'string'
    && isRecord(value['tables'])
    && hasCallable(value, 'getChildRelations')
    && hasCallable(value, 'getParentRelations')
    && hasCallable(value, 'getTableChildRelations')
    && hasCallable(value, 'getTableParentRelations')
    && hasCallable(value, 'addTable')
    && hasCallable(value, 'removeTable')
    && hasCallable(value, 'getTable')
    && hasCallable(value, 'getView')
    && hasCallable(value, 'saveChanges')
    && hasCallable(value, 'setAppServices')
    && hasCallable(value, 'setPageRoute')
    && hasCallable(value, 'getRequestTemplateParams')
    && hasCallable(value, 'toJson')
    && hasCallable(value, 'on')
    && hasCallable(value, 'onAnyViewChange')
    && hasCallable(value, 'triggerAutoLoad')
    && hasCallable(value, 'destroy')
}

function isDataView(value: unknown): value is DataView {
  return value instanceof DataView
}

function isModuleContextCapability(value: unknown): value is ModuleContextCapability {
  if (!isRecord(value)) return false
  return hasCallable(value, 'getCurrent') && hasCallable(value, 'subscribe')
}

function isPageComponentRegistry(value: unknown): value is PageComponentRegistry {
  if (!isRecord(value)) return false
  return hasCallable(value, 'registerInstance')
    && hasCallable(value, 'unregisterInstance')
    && hasCallable(value, 'listInstances')
    && hasCallable(value, 'getInstance')
    && hasCallable(value, 'registerApi')
    && hasCallable(value, 'unregisterApi')
    && hasCallable(value, 'listApis')
    && hasCallable(value, 'getApi')
    && hasCallable(value, 'getApisByType')
}

function isPageCssScopeCapability(value: unknown): value is PageCssScopeCapability {
  return isRecord(value) && hasCallable(value, 'inject')
}

function isPageServiceCapability(value: unknown): value is PageServiceCapability {
  if (!isRecord(value)) return false
  return hasCallable(value, 'showMessage')
    && hasCallable(value, 'showConfirm')
    && hasCallable(value, 'showPrompt')
    && hasCallable(value, 'showAlert')
    && hasCallable(value, 'showDialog')
    && hasCallable(value, 'selectEntities')
    && hasCallable(value, 'browseFiles')
    && hasCallable(value, 'uploadFiles')
    && hasCallable(value, 'showLoading')
    && hasCallable(value, 'navigate')
}

function isPagePermissionMode(value: unknown): value is PagePermissionMode {
  return value === 'none' || value === 'masked' || value === 'invisible'
}

function isSubtreeFieldPolicy(value: unknown): value is SubtreeFieldPolicy {
  return value === 'unrestricted'
}

// ── 能力键 ────────────────────────────────────────────────────────────────

export const PAGE_DATASET = defineCapability<DataSetContract>('spark:capability:page-dataset', isDataSetContract)
export const DATA_SOURCE = defineCapability<DataView>('spark:capability:data-source', isDataView)
export const DATA_ROW = defineCapability<DataRow>('spark:capability:data-row', isDataRow)

export const MODULE_CONTEXT = defineCapability<ModuleContextCapability>('spark:capability:module-context', isModuleContextCapability)
export const PAGE_COMPONENT_REGISTRY = defineCapability<PageComponentRegistry>('spark:capability:page-component-registry', isPageComponentRegistry)
export const CSS_SCOPE = defineCapability<PageCssScopeCapability>('spark:capability:css-scope', isPageCssScopeCapability)

export const PAGE_SERVICE = defineCapability<PageServiceCapability>('spark:capability:page-service', isPageServiceCapability)
export const PAGE_PERMISSION_MODE = defineCapability<PagePermissionMode>('spark:capability:permission-mode', isPagePermissionMode)
export const SUBTREE_FIELD_POLICY = defineCapability<SubtreeFieldPolicy>('spark:capability:subtree-field-policy', isSubtreeFieldPolicy)
