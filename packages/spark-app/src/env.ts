/**
 * @module @spark-appworks/spark-app:env
 * 职责：提供 spark-app 应用壳中的 env 能力，连接路由、导航、认证、插件、页面 UI 或 AI 桥接。
 * 边界：负责应用层编排，不下沉实现底层数据模型，也不直接改写组件包的渲染协议。
 * AI用途：排查页面打开、导航状态、权限上下文或应用侧 AI 接线时，用本模块确认 app 层入口。
 */
/**
 * 应用壳的最小环境检测入口。
 */

/**
 * 简单的环境类型
 */
export type SimpleEnvironment = 'client' | 'server'

/**
 * 环境信息接口
 */
export type SimpleEnvironmentInfo = {
  /** 环境类型 */
  type: SimpleEnvironment
  /** 是否为服务端 */
  isServer: boolean
  /** 是否为客户端 */
  isClient: boolean
  /** 是否为测试环境 */
  isTest: boolean}

/**
 * 简单环境适配器
 * 支持客户端、服务端和测试环境自动检测
 */
export const envAdapter = {
  /**
   * 获取环境信息（自动检测环境）
   */
  getEnvironment(): SimpleEnvironmentInfo {
    const isServer = typeof window === 'undefined'
    // 检测测试环境：Vitest (import.meta.env.VITEST) 或 MODE=test
    const vitestFlag: unknown = import.meta.env['VITEST']
    const isTest =
      vitestFlag === 'true' ||
      import.meta.env.MODE === 'test'
    return {
      type: isServer ? 'server' : 'client',
      isServer,
      isClient: !isServer,
      isTest: !!isTest
    }
  },

  /**
   * localStorage（浏览器环境）
   */
  get localStorage(): Storage | undefined {
    return typeof window !== 'undefined' ? window.localStorage : undefined
  },

  /**
   * sessionStorage（浏览器环境）
   */
  get sessionStorage(): Storage | undefined {
    return typeof window !== 'undefined' ? window.sessionStorage : undefined
  }
}
