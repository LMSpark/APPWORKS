/**
 * @module @spark-appworks/spark-app:config/index
 * 职责：提供 spark-app 应用壳中的 index 能力，连接路由、导航、认证、插件、页面 UI 或 AI 桥接。
 * 边界：负责应用层编排，不下沉实现底层数据模型，也不直接改写组件包的渲染协议。
 * AI用途：排查页面打开、导航状态、权限上下文或应用侧 AI 接线时，用本模块确认 app 层入口。
 */
/**
 * Configuration helpers for an explicit application composition root.
 */

import type { AppConfig } from '../../types'

const DEFAULT_CONFIG: AppConfig = {
  apiBaseUrl: '/api',
  logLevel: 'info',
  enableMock: false,
  enableRemoteConfig: false,
  version: '1.0.0',
  features: {
    enableExport: true,
    enableOffline: false,
  },
}

/** 合并调用方显式提供的宿主配置，不读取本地文件或远程端点。 */
export function loadConfig(config: Partial<AppConfig> = {}): Promise<AppConfig> {
  return Promise.resolve({ ...DEFAULT_CONFIG, ...config })
}

/**
 * 获取功能开关
 */
export function isFeatureEnabled(config: AppConfig, feature: keyof AppConfig['features']): boolean {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- features 可选，?. 结果可能为 undefined
  return config.features?.[feature] ?? false
}
