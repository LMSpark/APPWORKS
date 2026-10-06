/**
 * @module @spark-appworks/spark-component:page/context/types
 * 职责：定义 types 相关的内部类型契约，支撑渲染器、props、zero-code 和运行时状态协作。
 * 边界：只描述 component-runtime 的类型结构，不直接渲染界面，也不发起数据请求。
 * AI用途：跨文件修改 types 行为或补齐配置类型时，用本模块确认共享类型边界。
 */
/**
 * 渲染器类型定义 — 脚本沙箱上下文与组件访问 API（执行层）
 *
 * 页面渲染器 Props（编排层）已迁移至 SparkPageRenderer.vue <script> 块。
 */

import type { SparkData } from '@spark-appworks/spark-data'
import type { ComponentInstanceSnapshot } from '@spark-appworks/spark-utils'
import type { ScriptContext } from '../../runtime'
import type { h } from 'vue'

// ── 分区 C：脚本沙箱能力（页面运行时访问面） ─────────────────────────────────

/** 页面脚本组件访问 API（由渲染器根节点注入） */
export type PageComponentAccessApi = {
  /** 按组件 id 获取实例快照（只读元数据，不返回组件 API 对象） */
  get(id: string): ComponentInstanceSnapshot | null
  /** 列出页面组件实例（可按 type 过滤，只读元数据） */
  list(type?: string): ComponentInstanceSnapshot[]
  /** 按组件 id 获取组件暴露 API（用于脚本调用组件能力） */
  getApi<T = unknown>(id: string): T | null
  /** 按 type 获取同类组件 API 列表 */
  getApisByType<T = unknown>(type: string): T[]}

/**
 * 页面脚本运行时上下文。
 *
 * 继承 `ScriptContext`（spark-project-model，框架无关契约），
 * 在此基础上添加 spark-component 层具体注入字段：
 * - `$page.getDataSet(scenarioId)` — 当前调用的指定场景数据
 * - `$components` — 覆盖为更完整的 `PageComponentAccessApi`
 * - `SparkData` — 数据工具命名空间
 * - `h` — 渲染函数（Render* 专用）
 * - Timer API — 沙箱白名单
 */
export type PageContext = ScriptContext & {
    /** 组件访问 API（覆盖 ScriptContext 基类，提供更丰富方法） */
    $components: PageComponentAccessApi
    /** SPARK 数据空间工具命名空间（createTreeManager 等，Render* 函数用） */
    SparkData: typeof SparkData
    /** 渲染函数（运行时由渲染层注入，Render* 函数专用） */
    h: typeof h

    // Timer API（沙箱白名单）
        /** set Timeout 回调。 */
setTimeout: (handler: (...args: unknown[]) => void, timeout?: number) => number
        /** clear Timeout 回调。 */
clearTimeout: (id?: number) => void
        /** set Interval 回调。 */
setInterval: (handler: (...args: unknown[]) => void, timeout?: number) => number
        /** clear Interval 回调。 */
clearInterval: (id?: number) => void}
