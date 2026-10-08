/**
 * @module @spark-appworks/spark-component:runtime/app-services
 * 职责：提供 app services 在 spark-component 渲染体系中的辅助能力，连接配置、上下文和组件运行时。
 * 边界：只服务 component-runtime，不绕过 DataViewKey/DataSet 管线，也不承担应用路由职责。
 * AI用途：排查组件配置、运行态上下文或渲染注册关系时，用本模块确认局部语义。
 */
/**
 * 页面运行时服务类型定义。
 *
 * 描述页面在运行时可调用的宿主能力：消息提示、对话框、文件选择/上传、
 * 实体选择器、路由导航等。
 *
 * ┌──────────────────────────────────────────────────────┐
 * │  类型分组（按页面运行时交互流程）                      │
 * │                                                      │
 * │  1. 枚举联合：PageMessageType / PageDialogResult      │
 * │  2. 消息/对话框：PageDialogOptions                    │
 * │  3. 文件操作：  PageBrowseFilesOptions                │
 * │                PageSelectedFile                       │
 * │                PageUploadFilesOptions                 │
 * │                PageUploadedFile                       │
 * │  4. 实体选择器：PageSelectorOption                    │
 * │                PageSelectEntitiesOptions              │
 * │                PageSelectorOption                     │
 * │  5. 服务契约：  PageServiceCapability                 │
 * │                PageRouterService                      │
 * │                PageRuntimeServicesCapability          │
 * │  6. 能力注册：  PAGE_RUNTIME_SERVICES                 │
 * └──────────────────────────────────────────────────────┘
 */

import { defineCapability, type LoggerApi, type Method } from '@spark-appworks/spark-utils'
import { isRecord } from '@spark-appworks/spark-utils'

// ═══════════════════════════════════════════════════════
// 1. 枚举联合
// ═══════════════════════════════════════════════════════

/** 消息类型：成功 / 错误 / 警告 / 信息 */
export type PageMessageType = 'success' | 'error' | 'warning' | 'info'

/** 对话框操作结果：确认 / 取消 / 关闭 */
export type PageDialogResult = 'confirm' | 'cancel' | 'close'
// 这里不再为 JS 基础类型保留导出别名，直接使用原生联合类型。

// ═══════════════════════════════════════════════════════
// 2. 消息 / 对话框
//
// 页面与用户交互的提示类能力。
// ═══════════════════════════════════════════════════════

/** 对话框配置选项 */
export type PageDialogOptions = {
  /** 对话框标题 */
  title?: string
  /** 对话框正文内容（纯文本） */
  message?: string
  /** 自定义内容（HTML 字符串，需配合 dangerouslyUseHTMLString） */
  content?: string
  /** 确认按钮文案 */
  confirmText?: string
  /** 取消按钮文案 */
  cancelText?: string
  /** 是否显示取消按钮 */
  showCancelButton?: boolean
  /** 是否允许渲染 HTML 字符串 */
  dangerouslyUseHTMLString?: boolean
  /** 消息类型（影响图标和配色） */
  type?: PageMessageType
  /** 对话框宽度 */
  width?: string
}

// ═══════════════════════════════════════════════════════
// 3. 文件操作
//
// 页面在运行时触发的文件浏览和上传能力。
// ═══════════════════════════════════════════════════════

/** 文件浏览配置 */
export type PageBrowseFilesOptions = {
  /** 浏览对话框标题 */
  title?: string
  /** 接受的文件类型（如 '.jpg,.png' 或 'image/*'） */
  accept?: string
  /** 是否允许多选 */
  multiple?: boolean
  /** 当前已选值（用于回显） */
  currentValue?: string
}

/** 已选择的文件信息 */
export type PageSelectedFile = {
  /** 文件名 */
  name: string
  /** 文件大小（字节） */
  size: number
  /** MIME 类型 */
  type: string
  /** 最后修改时间戳 */
  lastModified: number
  /** 原始 File 对象 */
  file: File
}

/** 文件上传配置（在浏览选项基础上增加上传端点信息） */
export type PageUploadFilesOptions = PageBrowseFilesOptions & {
  /** 上传目标 URL */
  action: string
  /** HTTP 方法 */
  method?: Extract<Method, 'POST' | 'PUT' | 'PATCH'>
  /** 文件字段名 */
  fieldName?: string
  /** 附加请求头 */
  headers?: Record<string, string>
  /** 附加表单数据 */
  data?: Record<string, string | Blob>
  /** 是否携带 Cookie / 认证信息 */
  withCredentials?: boolean
  /** 待上传的文件列表 */
  files?: File[]
}

/** 已上传的文件：在选择文件基础上增加服务端响应 */
export type PageUploadedFile = PageSelectedFile & {
  /** 服务端返回的响应体 */
  response: unknown
  /** 上传后可访问的文件 URL */
  url?: string
}

// ═══════════════════════════════════════════════════════
// 4. 实体选择器
//
// 页面在运行时从候选列表中选择业务实体（如字典项、用户等）。
// ═══════════════════════════════════════════════════════

/** 选择器候选项 */
export type PageSelectorOption = {
  /** 展示文本 */
  label: string
  /** 选中值 */
  value: string | number | boolean
  /** 描述信息 */
  description?: string
  /** 是否禁用 */
  disabled?: boolean
  /** 原始数据（未加工的选项数据） */
  raw?: unknown
}

/** 实体选择器配置 */
export type PageSelectEntitiesOptions = {
  /** 选择器标题 */
  title?: string
  /** 实体名称（用于空状态提示等） */
  entityName?: string
  /** 搜索框占位符 */
  placeholder?: string
  /** 是否允许多选 */
  multiple?: boolean
  /** 是否可搜索 */
  searchable?: boolean
  /** 确认按钮文案 */
  confirmText?: string
  /** 取消按钮文案 */
  cancelText?: string
  /** 空状态文案 */
  emptyText?: string
  /** 当前已选值 */
  currentValue?: string | number | boolean | Array<string | number | boolean>
  /** 静态选项列表（不传则动态加载） */
  options?: PageSelectorOption[]
}

/** 已选中的实体项与候选项同形（统一用 PageSelectorOption，禁止 PageSelectedEntity 别名） */

// ═══════════════════════════════════════════════════════
// 5. 服务契约
//
// 页面运行时可调用的宿主服务接口。
// ═══════════════════════════════════════════════════════

/**
 * 页面服务：消息提示、对话框、文件操作、实体选择、导航等。
 *
 * 所有方法由宿主（如 Vue Router、Element Plus 等）实现，
 * 页面通过 ScriptContext 调用。
 */
export type PageServiceCapability = {
  /** 写入剪贴板文本；仅在宿主确认写入成功后完成。 */
  copyText(text: string): Promise<void>
  /** 显示提示消息 */
  showMessage(message: string, type?: PageMessageType): void
  /** 显示确认对话框，返回用户操作结果 */
  showConfirm(message: string, title?: string, options?: { confirmText?: string; cancelText?: string; type?: PageMessageType }): Promise<boolean>
  /** 显示输入弹窗 */
  showPrompt(message: string, title?: string, options?: { placeholder?: string; defaultValue?: string }): Promise<string | null>
  /** 显示提示框（无取消操作） */
  showAlert(message: string, title?: string, options?: { type?: PageMessageType }): Promise<void>
  /** 显示自定义对话框 */
  showDialog(options: PageDialogOptions): Promise<PageDialogResult>
  /** 打开实体选择器 */
  selectEntities(options: PageSelectEntitiesOptions): Promise<PageSelectorOption[]>
  /** 打开文件浏览对话框 */
  browseFiles(options?: PageBrowseFilesOptions): Promise<PageSelectedFile[]>
  /** 上传文件 */
  uploadFiles(options: PageUploadFilesOptions): Promise<PageUploadedFile[]>
  /** 显示 / 隐藏全局 Loading */
  showLoading(show: boolean, text?: string): void
  /** 路由跳转 */
  navigate(path: string, params?: Record<string, unknown>): void
}

/** Read-only reader bound by the host to one application and design scope. */
export type PageDataSpaceLayoutReader = Readonly<{
  readDataSpaceLayout(dataSpaceId: string): Promise<string | null>
}>

export type PageDataSpaceLayoutWriteCommand = Readonly<{ dataSpaceId: string; content: string; expectedContent: string }>
export type PageDataSpaceLayoutCreateCommand = Readonly<{ dataSpaceId: string; content: string }>
export type PageDataSpaceLayoutContentState = Readonly<{baseline: string | null | undefined; draft: string | undefined;
  status: 'idle' | 'pending' | 'unknown'; submitted: string | undefined; revision: number}>
export type PageDataSpaceLayoutRemoteRead = Readonly<{content: string | null; revision: number}>
export type PageLocalDraftState = Readonly<{content: string | undefined; revision: number}>
export type PageLocalDraftCommand = Readonly<{name: string; expectedRevision: number}>
export type PageLocalDraftWriteCommand = PageLocalDraftCommand & Readonly<{content: string}>
export type PageLocalDraftAccess = Readonly<{
  getLocalDraft(name: string): PageLocalDraftState
  setLocalDraft(command: PageLocalDraftWriteCommand): void
  discardLocalDraft(command: PageLocalDraftCommand): void
}>
export type PageDataSpaceLayoutContent = Readonly<{
  getDataSpaceLayoutContent(dataSpaceId: string): PageDataSpaceLayoutContentState
  setDataSpaceLayoutDraft(command: PageDataSpaceLayoutCreateCommand): void
  discardDataSpaceLayoutDraft(dataSpaceId: string): void
  readDataSpaceLayoutForAdoption(dataSpaceId: string): Promise<PageDataSpaceLayoutRemoteRead>
  adoptDataSpaceLayoutRead(dataSpaceId: string, read: PageDataSpaceLayoutRemoteRead): void
}>
export type PageDataSpaceLayoutWriter = Readonly<{
  saveDataSpaceLayout(command: PageDataSpaceLayoutWriteCommand): Promise<void>
  createDataSpaceLayout(command: PageDataSpaceLayoutCreateCommand): Promise<void>
}>
export type PageDataSpaceRelationDependencyOption = Readonly<{ label: string; value: string }>
export type PageDataSpaceModelSourceType = 'table' | 'dict' | 'interface' | 'json' | 'logicView' | 'databaseView'
export type PageDataSpaceModelSource = Readonly<{
  type: PageDataSpaceModelSourceType; id: string; name: string; description: string
  dbid: string; databaseName: string; providerId: string
}>
export type PageDataSpaceModelSourceQuery = Readonly<{
  type: PageDataSpaceModelSourceType; keyword?: string; description?: string
  databaseName?: string; page?: number; pageSize?: number
}>
export type PageDataSpaceModelSourceField = Readonly<{
  type: 'dataModel' | 'inputParams'; Name: string; description: string; FieldType: string
  IsPKey: number; IsOutput: number; AsName: string; ValueFun: string
  Expression: string; allowAIAdd: number; OrderType: string; Order: number; Group: number
}>
export type PageDataSpaceModelSourcePrepared = Readonly<{
  source: PageDataSpaceModelSource
  model: Readonly<{ Type: string; MetaName: string; description: string; DbId: string; DbName: string;
    JoinType: string; ForeignKeyFields: string; JoinFilter: string; PId: string }>
  fields: readonly PageDataSpaceModelSourceField[]
}>
export type PageDataSpaceModelSourceReader = Readonly<{
  query(input: PageDataSpaceModelSourceQuery): Promise<Readonly<{rows: readonly PageDataSpaceModelSource[]; total: number}>>
  prepare(source: PageDataSpaceModelSource): Promise<PageDataSpaceModelSourcePrepared>
}>
export type PageDataSpaceDesignReader = Readonly<{
  readRelationDependencyOptions(): Promise<readonly PageDataSpaceRelationDependencyOption[]>
  modelSources?: PageDataSpaceModelSourceReader
}>

/** 路由服务：SPA 内的 push / replace / back 操作 */
export type PageRouterService = {
  /** 导航到目标（字符串路径或路由对象） */
  push(to: string | { path: string; query?: Record<string, unknown> }): Promise<unknown>
  /** 替换当前路由 */
  replace(to: string | { path: string; query?: Record<string, unknown> }): Promise<unknown>
  /** 后退 */
  back(): void
  /** 当前路由信息 */
  currentRoute: unknown
}

/**
 * 页面运行时能力集合。
 *
 * 由宿主环境提供，ScriptContext 中通过 capability 查询获取。
 * 各字段均为可选，由消费方在使用前判断是否存在。
 */
export type PageRuntimeServicesCapability = {
  /** 路由服务 */
  router?: PageRouterService
  /** 日志 API */
  logger?: LoggerApi
  /** 租户上下文 */
  tenant?: { tenantId: string; tenantName?: string; [key: string]: unknown }
  /** 认证服务 */
  authService?: unknown
  /** 页面服务（部分实现） */
  pageService?: Partial<PageServiceCapability>
  /** Restricted layout-file reader for the declared data-space design scenario. */
  dataSpaceLayout?: Readonly<{
    scenarioId: string
    createReader(): PageDataSpaceLayoutReader
    createWriter?(): PageDataSpaceLayoutWriter
  }>
  /** Restricted relation dictionary reader for the declared data-space design scenario. */
  dataSpaceDesign?: Readonly<{ scenarioId: string; createReader(): PageDataSpaceDesignReader }>
}

// ═══════════════════════════════════════════════════════
// 6. 能力注册
//
// 将 PageRuntimeServicesCapability 注册到全局 capability 系统。
// ═══════════════════════════════════════════════════════

function isPageRuntimeServicesCapability(value: unknown): value is PageRuntimeServicesCapability {
  return isRecord(value)
}

/** 页面运行时服务能力定义符 */
export const PAGE_RUNTIME_SERVICES = defineCapability<PageRuntimeServicesCapability>(
  'spark:capability:page-runtime-services',
  isPageRuntimeServicesCapability,
)
