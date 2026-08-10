/**
 * @module @spark-appworks/spark-app:navigation/nav-access
 * 职责：提供 spark-app 应用壳中的 nav access 能力，连接路由、导航、认证、插件、页面 UI 或 AI 桥接。
 * 边界：负责应用层编排，不下沉实现底层数据模型，也不直接改写组件包的渲染协议。
 * AI用途：排查页面打开、导航状态、权限上下文或应用侧 AI 接线时，用本模块确认 app 层入口。
 */
/**
 * DynamicRouter 导航访问模块（基础设施层）
 *
 * 提供对 DynamicRouter 实例的模块级同步访问，用于非组件上下文（路由守卫、登录跳转等）。
 * start.ts 在启动时通过 setDynamicRouter() 注入实例，后续通过导出函数读取。
 *
 * 与 useNavigation.ts 的关系：
 * - nav-access：同步、无 Vue 依赖、用于基础设施层（main.ts 路由守卫、LoginView 跳转）
 * - useNavigation：响应式 Vue composable、用于组件树内 UI 渲染和导航操作
 */
import type { RuntimeNavigation } from './runtime-navigation'

/** DynamicRouter 公共 API 子集（仅导航相关） */
type DynamicRouterAccess = {
  /** 清除路由缓存并重新注册，返回刷新后的导航树；DynamicRouter 未注入时由调用方处理 */
  refreshRoutes(): Promise<RuntimeNavigation | null>
  /** 同步读取当前已加载的导航树（不发 HTTP），未加载或未注入时返回 null */
  getNavTree(): RuntimeNavigation | null}

/** 初始化选项 */
type NavAccessOptions = {
  /** 导航树未加载时的回退首页路径（默认 '/dashboard'） */
  defaultHomePath?: string}

/** DynamicRouter 实例引用，由 start.ts 通过 setDynamicRouter 注入 */
let _dynamicRouter: DynamicRouterAccess | null = null
let _defaultHomePath = '/dashboard'

/** 注册 DynamicRouter 实例（start.ts 中调用） */
export function setDynamicRouter(router: DynamicRouterAccess, options?: NavAccessOptions): void {
  _dynamicRouter = router
  if (options?.defaultHomePath !== undefined) {
    _defaultHomePath = options.defaultHomePath
  }
}

/** 刷新动态路由（清缓存 + 重新注册），返回加载后的导航树 */
export async function refreshRoutes(): Promise<RuntimeNavigation | null> {
  if (!_dynamicRouter) return null
  return _dynamicRouter.refreshRoutes()
}

/** 获取 DynamicRouter 已加载的导航树（同步读取，不发起 HTTP 请求） */
export function getNavTree(): RuntimeNavigation | null {
  return _dynamicRouter?.getNavTree() ?? null
}

/** 获取导航树声明的应用首页路径（未设置时回退到配置的 defaultHomePath） */
export function getNavHomePath(): string {
  return _dynamicRouter?.getNavTree()?.homePath ?? _defaultHomePath
}
