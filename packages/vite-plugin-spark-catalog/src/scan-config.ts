/**
 * SPARK 组件注册扫描配置。
 *
 * - sparkComponentsPlugin（编译时注册）
 * - AutoLoader（运行时注册）
 *
 */

/* ==========================================================================
 * 扫描模式（Glob 格式，相对于项目 root）
 * ========================================================================== */

/**
 * 组件扫描模式（glob 格式）
 *
 * 改动说明：
 * - features/ 扫描所有 Vue 组件（自定义 feature 等）
 * - packages/ 扫描各包内的 components 目录
 * - src/components/ 扫描应用层自有组件
 * - src/views/ 扫描页面级组件
 */
export const COMPONENT_SCAN_PATTERNS = [
  './features/**/*.vue',
  './src/components/**/*.vue',
  './src/views/**/*.vue',
  './packages/*/src/components/**/*.vue',
] as const

/**
 * 排除的文件模式（glob 格式）
 */
export const COMPONENT_EXCLUDE_PATTERNS = [
  'App.vue',
  '**/node_modules/**',
  '**/dist/**',
  '**/*.test.vue',
  '**/*.spec.vue',
  '**/__tests__/**',
  // dev-system 是设计器内部工具，不参与运行时自动注册扫描。
  '**/src/views/app/dev-system/**/*.vue',
] as const

/* ==========================================================================
 * 组件加载策略
 * ========================================================================== */

/**
 * 同步加载的核心组件
 *
 * 同步组件会被打包进主 chunk，用于：
 * - 首屏渲染必需的骨架组件
 * - 被多处引用的高频基础组件
 * - 体积小（< sizeThreshold）的轻量组件
 */
export const SYNC_COMPONENTS = [
  'PageRenderer',
  'SparkComponentRenderer',
  'ErrorFallback',
] as const

/**
 * 异步加载的组件（支持通配符）
 *
 * 异步组件在运行时按需加载，用于：
 * - 大型第三方组件（Charts 等）
 * - 低频访问的演示/设置页面
 * - 体积大（> sizeThreshold）的组件
 */
export const ASYNC_COMPONENTS = [
  '*Demo', // 演示组件
  'Capability*', // 能力展示
  'Tree*', // 树形组件
] as const

/** Root-relative view directories use on-demand component loading. */
export const ASYNC_PATH_PREFIXES = ['src/views/'] as const

/**
 * 文件大小阈值（KB）
 * 超过此大小的组件自动标记为异步加载
 */
export const SIZE_THRESHOLD = 50
