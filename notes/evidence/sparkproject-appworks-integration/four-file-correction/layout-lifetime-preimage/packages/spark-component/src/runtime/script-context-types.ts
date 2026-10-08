/**
 * @module @spark-appworks/spark-component:runtime/script-context-types
 * 职责：提供 script context types 在 spark-component 渲染体系中的辅助能力，连接配置、上下文和组件运行时。
 * 边界：只服务 component-runtime，不绕过 DataViewKey/DataSet 管线，也不承担应用路由职责。
 * AI用途：排查组件配置、运行态上下文或渲染注册关系时，用本模块确认局部语义。
 */
/**
 * SPARK 页面沙箱上下文类型
 * =====================================================
 *
 * ## 设计意图：跨前端框架的业务脚本层
 *
 * `script.js` 沙箱的核心目标是**让业务逻辑与具体前端框架解耦**：
 * - 业务脚本只能看到此文件定义的**框架无关抽象接口**（`$page / $route`）
 * - 底层实现（Vue Router / Element Plus）由**渲染层**注入，脚本不感知
 * - 同一份 `script.js` 理论上可在任何实现了 `ScriptContext` 的渲染层上运行
 *
 * 这是 `$page` 替代 `ElMessage`、`$route` 替代 Vue Router 的根本原因——**接口是契约，实现可替换**。
 *
 * ## 约束
 * - ✅ 与前端框架完全无关：无 Vue / Element Plus / Vue Router 依赖
 * - ✅ 可独立测试：不依赖任何渲染层或 DOM 框架
 * - ✅ 稳定边界：变更此文件需同步更新脚本文档
 *
 * ⚠️ **禁止将此文件改名为 `script-api.ts`**，脚本沙箱契约依赖当前模块边界。
 */

import type { PageRuntime } from '@spark-appworks/spark-project-model'
import type {
  ComponentInstanceSnapshot,
  ContextSnapshot,
} from '@spark-appworks/spark-utils'
import type {
  PageServiceCapability,
  PageDataSpaceLayoutReader,
  PageDataSpaceLayoutWriter,
  PageDataSpaceDesignReader,
} from './app-services'

// ==================== 路由快照 ====================

/**
 * 框架无关的路由信息快照。
 *
 * 替代 Vue Router 的 `RouteLocationNormalizedLoaded`，业务脚本通过 `$route` 访问，
 * 无 Vue Router 依赖。
 *
 * @example
 * ```js
 * // script.js
 * const orderId = $route.params.id
 * const tab = $route.query.tab
 * ```
 */
export type PageRoute = {
  /** 当前路径，如 `/users/123` */
  path: string
  /** 含 search/hash 的完整 URL，如 `/users/123?tab=info#detail` */
  fullPath: string
  /** 路由名称（若有） */
  name: string | null | symbol
  /** 路径参数，如 `{ id: '123' }` */
  params: Record<string, string | string[]>
  /** Query 参数，如 `{ tab: 'info' }` */
  query: Record<string, string | ReadonlyArray<string | null> | null>
  /** Hash 片段，如 `#detail` */
  hash: string
}

// ==================== 脚本沙箱上下文（核心契约）====================

/**
 * 业务脚本沙箱上下文 — 完整 API 契约。
 *
 * 此接口是 `script.js` 可访问的所有变量的类型声明。
 * 脚本在 `with (__ctx)` 沙箱内执行，所有变量均通过此接口注入。
 *
 * **稳定 API（核心框架契约）**：
 * - `$route` — 路由快照（只读，不依赖 Vue Router）
 * - `$el` — 当前页面容器元素
 * - `$query` / `$queryAll` — DOM 查询（谨慎使用）
 * - `$page.resolveView(binding).requestData()` — 刷新明确绑定的视图
 * - `$page` — UI 交互服务（消息 / 确认 / 导航）
 *
 * **渲染层附加（非核心契约，实现层注入）**：
 * - `$page.getDataSet(scenarioId)` — 指定场景 DataSet
 * - 数据权限由实际原查询上下文经 DataView 集中消费
 * - `SparkData` — SPARK 数据工具命名空间（在 ScriptContext 外单独注入）
 * - `h` — Vue 渲染函数（仅供 Render* 渲染函数，非业务逻辑）
 *
 * @example
 * ```js
 * // script.js（沙箱内所有变量直接可用，无需 this.xxx）
 *
 * // 读取路由参数
 * const id = $route.params.id
 *
 * // UI 交互（框架无关）
 * await $page.showConfirm('是否确认提交？')
 * $page.showMessage('保存成功', 'success')
 * $page.navigate('/orders')
 * ```
 */
export type ScriptContext = {
  /**
   * 页面级组件访问 API。
   *
   * 可用于按组件 id / type 获取实例快照与容器组件暴露的包装 API。
   */
  $components: PageComponentAccessInScript

  /**
   * 当前路由快照（底层 Vue Router 实现，只读，framework-agnostic）。
   * 创建页面调用时冻结的路由快照，接口类型不依赖 Vue Router。
   */
  $route: PageRoute

  /** 当前页面容器 DOM 元素（可用于 focus、scroll 等操作） */
  $el: () => HTMLElement | null

  /** 通过 CSS 选择器查询页面内单个元素 */
  $query: (selector: string) => HTMLElement | null

  /** 通过 CSS 选择器查询页面内所有匹配元素 */
  $queryAll: (selector: string) => NodeListOf<Element>

  /**
   * UI 交互服务（框架无关，替代 ElMessage / ElMessageBox）。
   *
   * ✅ 推荐：所有消息提示、确认框、输入框、导航均通过此接口调用。
   *
   * 类型直接来自 page-config 的 runtime service contract，渲染层注入对应实现。
   */
  $page: PageServiceCapability & Pick<PageRuntime, 'getDataSet' | 'resolveView'>
    & PageDataSpaceLayoutReader & PageDataSpaceLayoutWriter
    & Readonly<{ readDataSpaceRelationDependencyOptions(): ReturnType<PageDataSpaceDesignReader['readRelationDependencyOptions']> }>

  /**
   * 脚本日志接口（已桥接到框架 Logger 传输链）。
   *
   * 在 script.js 中调用 `console.log/info/warn/error/debug`，
   * 会同时进入浏览器控制台与统一日志采集（AI 面板可见）。
   */
  console: Pick<Console, 'log' | 'info' | 'warn' | 'error' | 'debug'>

  /**
   * 模块级上下文（导航系统注入，当前模块无上下文时为 `null`）。
   *
   * 提供当前模块选择器的选中值和可选项，脚本可据此实现按项目/租户/环境加载数据等逻辑。
   *
   * @example
   * ```js
   * // script.js
   * const projectId = $moduleContext?.selected
   * if (projectId) {
   *   view?.loadFromServer({ projectId })
   * }
   * ```
   */
  $moduleContext: ContextSnapshot | null
}

/** 页面级组件访问 API（脚本可用） */
export type PageComponentAccessInScript = {
  /** 按组件 id 获取实例快照（只读元数据，不返回组件 API 对象） */
  get(id: string): ComponentInstanceSnapshot | null
  /** 列出页面组件实例（可按 type 过滤，只读元数据） */
  list(type?: string): ComponentInstanceSnapshot[]
  /** 按组件 id 获取组件暴露 API（运行时实现可返回任意结构） */
  getApi<T = unknown>(id: string): T | null
  /** 按 type 获取同类组件 API 列表 */
  getApisByType<T = unknown>(type: string): T[]
}

// ==================== 模块上下文 ====================
//
// ContextItem / ContextSnapshot SSOT：@spark-appworks/spark-utils
// MODULE_CONTEXT 能力接口仍在 capability-keys（ModuleContextCapability）。
