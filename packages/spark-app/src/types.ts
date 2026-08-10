/**
 * @module @spark-appworks/spark-app:types
 * 职责：提供 spark-app 应用壳中的 types 能力，连接路由、导航、认证、插件、页面 UI 或 AI 桥接。
 * 边界：负责应用层编排，不下沉实现底层数据模型，也不直接改写组件包的渲染协议。
 * AI用途：排查页面打开、导航状态、权限上下文或应用侧 AI 接线时，用本模块确认 app 层入口。
 */
/**
 * SPARK Application Layer Types
 * 应用层类型定义
 */

/**
 * 日志级别（从 spark-utils 统一导入）
 */
import type { LogLevel } from '@spark-appworks/spark-utils'
import type { App } from 'vue'
import type { Router } from 'vue-router'
import type { ThemeCapability } from './theme'
export type { LogLevel }

/**
 * 应用环境
 */
export type AppEnvironment = 'development' | 'production' | 'test'

export function isAppEnvironment(value: unknown): value is AppEnvironment {
  return value === 'development' || value === 'production' || value === 'test'
}

/**
 * 用户信息
 */
export type UserInfo = {
    /** user Id 标识。 */
userId: string
    /** username 字段。 */
username: string
    /** display Name 名称。 */
displayName?: string
    /** email 字段。 */
email?: string
    /** avatar 字段。 */
avatar?: string
    /** roles 字段。 */
readonly roles: string[]        // ['admin', 'sales', 'manager']
    /** permissions 字段。 */
readonly permissions: string[]}

/**
 * 租户信息
 */
export type TenantInfo = {
    /** tenant Id 标识。 */
tenantId: string
    /** tenant Name 名称。 */
tenantName: string
    /** tenant Code 字段。 */
tenantCode?: string
    /** 配置对象。 */
config?: Record<string, unknown>
    /** features 字段。 */
features?: string[]}

/**
 * 环境信息
 */
export type EnvironmentInfo = {
    /** mode 字段。 */
mode: AppEnvironment
    /** api Base Url 地址。 */
apiBaseUrl: string
    /** version 字段。 */
version: string
    /** build Time 字段。 */
buildTime?: string}

/**
 * 应用全局上下文接口
 *
 * 作用域：整个 SPA 应用
 * 生命周期：应用启动时创建，应用关闭时销毁（单例）
 *
 * 用途：
 * - 存储应用级全局信息（用户、租户、环境）
 * - 提供跨页面共享的配置和状态
 * - 支持 SSR/CSR 环境检测
 *
 * 注意：
 * - 此 Context 是应用级单例，所有页面共享
 * - 不应存储页面级状态，避免内存泄漏
 * - 通过依赖注入（DI）在需要时注入到组件中
 *
 * 典型使用场景：
 * - 权限校验（基于 user/tenant）
 * - 环境判断（SSR vs CSR）
 * - 全局配置读取
 */
export type AppContext = {
  /** 用户信息 */
  user: UserInfo
  /** 租户信息 */
  tenant: TenantInfo
  /** 环境信息 */
  env: EnvironmentInfo
  /** 全局配置 */
  config: Record<string, unknown>
  /** 初始化时间 */
  initializedAt: string}

/**
 * 应用配置
 */
export type AppConfig = {
  /** API 基础地址 */
  apiBaseUrl: string
  /** 日志级别 */
  logLevel?: LogLevel
  /** 是否启用 Mock */
  enableMock?: boolean
  /** 是否启用远程配置加载 */
  enableRemoteConfig?: boolean
  /** 应用版本 */
  version?: string
  /** 功能开关 */
  features?: {
    enableExport?: boolean
    enableOffline?: boolean
  }}

/** 应用宿主提供的认证上下文解析器。认证协议由宿主拥有，spark-app 不绑定后端端点。 */
export type BootstrapAuthenticate = (
  config: AppConfig,
) => AppContext | null | Promise<AppContext | null>

/**
 * Bootstrap Context - 扩展 AppContext，包含 Vue 应用实例和路由
 */
export type BootstrapContext = AppContext & {
  /** Vue 应用实例 */
    app: App
    /** Vue Router 实例 */
    router: Router
    /** 主题服务（仅在启用 theme 选项时存在） */
    theme?: ThemeCapability}

/**
 * 初始化选项
 */
export type BootstrapOptions = {
  /** Vue 应用实例 */
  app: App
  /** Vue Router 实例 */
  router: Router
  /** 应用配置 */
  config: AppConfig
  /** 认证上下文解析器；生产环境必须由应用宿主显式提供。 */
  authenticate?: BootstrapAuthenticate
  /** 挂载目标元素选择器（默认 '#app'） */
  mountTarget?: string
  /** 主题服务实例（由 start() 创建并传入，或手动传入） */
  themeService?: ThemeCapability
  /** 挂载前钩子 */
  beforeMount?: (context: BootstrapContext) => void | Promise<void>
  /** 挂载后钩子 */
  afterMount?: (context: BootstrapContext) => void | Promise<void>}

/**
 * 路由守卫选项
 */
export type RouterGuardOptions = {
  /** 自定义权限检查 */
  checkPermission?: (permissions: string[], required: string[]) => boolean}

/**
 * 错误处理选项
 */
export type ErrorHandlerOptions = {
  /** 错误回调 */
  onError?: (error: Error, context: ErrorContext) => void
  /** 自定义错误分类 */
  errorClassifier?: (error: Error) => ErrorType
  /** 错误类型处理回调（消费层实现 UI 交互） */
  onErrorByType?: (type: ErrorType, error: Error) => void}

/**
 * 错误上下文接口
 *
 * 作用域：单次错误发生时的临时上下文
 * 生命周期：错误捕获时创建，用于错误日志记录和上报
 *
 * 用途：
 * - 记录错误发生的位置和时间
 * - 为错误监控和追踪提供结构化信息
 * - 支持错误日志聚合和分析
 *
 * 典型使用场景：
 * - 组件渲染失败时记录 source
 * - API 请求错误时记录 info 和 timestamp
 * - 用户操作异常时进行错误上报
 */
export type ErrorContext = {
  /** 错误来源（组件名） */
  source?: string
  /** 组件文件路径（Vue SFC __file） */
  file?: string
  /** 错误信息 */
  info: string
  /** 时间戳 */
  timestamp: number}

/**
 * 错误类型
 */
export enum ErrorType {
    /** Auth 字段。 */
Auth = 'AUTH',
    /** Permission 字段。 */
Permission = 'PERMISSION',
    /** Network 字段。 */
Network = 'NETWORK',
    /** Validation 字段。 */
Validation = 'VALIDATION',
    /** Unknown 字段。 */
Unknown = 'UNKNOWN'
}

