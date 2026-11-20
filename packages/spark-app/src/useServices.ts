/**
 * @module @spark-appworks/spark-app:useServices
 * 职责：提供 spark-app 应用壳中的 use Services 能力，连接路由、导航、认证、插件、页面 UI 或 AI 桥接。
 * 边界：负责应用层编排，不下沉实现底层数据模型，也不直接改写组件包的渲染协议。
 * AI用途：排查页面打开、导航状态、权限上下文或应用侧 AI 接线时，用本模块确认 app 层入口。
 */
/**
 * 服务访问 Composables
 * 
 * 📌 DI 架构统一说明：
 * 
 * SPARK 项目采用单一 DI 管道（管道 B - SPARK 能力系统）：
 * - ✅ 推荐：使用 PAGE_RUNTIME_SERVICES 能力获取页面运行时服务
 *   ```ts
 *   const { sparkConsume } = useSparkComponent({ type: 'my-comp' })
 *   const services = sparkConsume(PAGE_RUNTIME_SERVICES)
 *   services?.router?.push('/home')
 *   services?.logger?.info('Action')
 *   ```
 * 
 * - ✅ Router：直接使用 vue-router
 *   ```ts
 *   import { useRouter } from 'vue-router'
 *   const router = useRouter()
 *   ```
 * 
 * - ✅ Logger：使用工厂函数
 *   ```ts
 *   import { Logger } from '@spark-appworks/spark-utils'
 *   const logger = Logger('MyModule')
 *   ```
 */

import { inject } from 'vue'
import { SPARK_REGISTRY_KEY } from '@spark-appworks/spark-component'
import type { ComponentRegistry as SparkRegistry } from '@spark-appworks/spark-component'

// ============================================================================
// 核心基础设施 Composables（仅保留 SPARK 组件系统必需）
// ============================================================================

/**
 * 使用 SPARK 组件注册表
 * 
 * ⚠️ 注意：此为 SPARK 组件系统核心基础设施，保留 Vue DI 机制
 * 
 * @example
 * ```ts
 * const registry = useSparkRegistry()
 * registry.register('my-component', MyComponent)
 * ```
 */
export function useSparkRegistry(): SparkRegistry {
  const registry = inject<SparkRegistry>(SPARK_REGISTRY_KEY)
  if (!registry) {
    throw new Error('SparkRegistry not provided. Make sure Spark.createPlugin() is installed.')
  }
  return registry
}
