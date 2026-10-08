/**
 * Vite Plugin: SPARK 组件自动注册代码生成器
 *
 * ## 核心功能
 * - **编译时扫描**: 在构建时扫描所有 Vue 组件
 * - **智能分析**: 分析文件大小、命名规则、依赖关系
 * - **代码生成**: 生成静态的 TypeScript 注册代码
 * - **零运行时开销**: 所有逻辑在构建时完成
 * - **类型安全**: 生成的代码包含完整的 TypeScript 类型
 * - **HMR 支持**: 开发时自动重新生成
 *
 * ## 使用方式
 * ```typescript
 * // vite.config.ts
 * import { sparkComponentsPlugin } from './tools/vite-plugin-spark-components'
 *
 * export default defineConfig({
 *   plugins: [
 *     sparkComponentsPlugin({
 *       patterns: ['./features/**\/*.vue', './src/components/**\/*.vue'],
 *       syncComponents: ['PageRenderer', 'SparkComponentRenderer'],
   *       asyncComponents: ['*Demo'],
 *       sizeThreshold: 50 // KB
 *     })
 *   ]
 * })
 * ```
 *
 * ## 生成的代码
 * ```typescript
 * // virtual:spark-components
 * import { Spark } from '@spark-appworks/spark-component'
 * import PageRenderer from './components/PageRenderer.vue'
 *
 * export function registerComponents() {
 *   const registry = Spark.getRegistry()
 *   registry.register('page-renderer', PageRenderer)
 * }
 * ```
 *
 * @author SPARK Team
 * @since 1.1.0
 */

import type { Plugin, ResolvedConfig } from 'vite'
import { existsSync, statSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import { globSync } from 'glob'
import { toKebabCase } from '../packages/vite-plugin-spark-catalog/src/utils'

/* -----------------------------------------------------------------------------
 * 简单日志工具
 * -------------------------------------------------------------------------- */

function createLogger(namespace: string) {
  const prefix = `[${namespace}]`
  return {
    info: (...args: any[]) => console.log(prefix, ...args),
    warn: (...args: any[]) => console.warn(prefix, ...args),
    error: (...args: any[]) => console.error(prefix, ...args),
    debug: (...args: any[]) => console.debug(prefix, ...args)
  }
}

const logger = createLogger('SparkComponentsPlugin')

/* -----------------------------------------------------------------------------
 * 类型定义
 * -------------------------------------------------------------------------- */

/**
 * 加载策略
 */
export type LoadStrategy = 'sync' | 'async'

/**
 * 组件注册条目
 */
export type ComponentRegistrationEntry = {
  /** 组件名称（kebab-case） */
  name: string
  /** 文件路径（相对于 root） */
  path: string
  /** 绝对路径 */
  absolutePath: string
  /** 文件名（不含扩展名） */
  fileName: string
  /** 文件大小（KB） */
  size: number
  /** 加载策略 */
  strategy: LoadStrategy
  /** 导入语句 */
  importStatement: string
  /** 注册语句 */
  registerStatement: string}

/**
 * 插件配置
 */
export type SparkComponentsPluginOptions = {
  /**
   * 组件扫描模式（glob 模式）
   * @default ['./features/**\/*.vue', './src/components/**\/*.vue']
   */
  patterns?: string[]

  /**
   * 同步加载的组件列表（支持通配符）
   * @default ['PageRenderer', 'SparkComponentRenderer', 'ErrorFallback']
   */
  syncComponents?: string[]

  /**
   * 异步加载的组件列表（支持通配符）
   * @default ['*Demo', 'Capability*']
   */
  asyncComponents?: string[]

  /** Root-relative directory prefixes whose components load on demand. */
  asyncPathPrefixes?: string[]

  /**
   * 文件大小阈值（KB），超过此大小自动异步加载
   * @default 50
   */
  sizeThreshold?: number

  /**
   * 排除的组件（支持通配符）
   * @default `['App.vue', '**​/node_modules/**']`
   */
  exclude?: string[]

  /**
   * 生成的虚拟模块 ID
   * @default 'virtual:spark-components'
   */
  virtualModuleId?: string

  /**
   * 是否生成 TypeScript 类型定义
   * @default true
   */
  generateTypes?: boolean

  /**
   * 是否在控制台输出详细日志
   * @default false
   */
  verbose?: boolean}

/* -----------------------------------------------------------------------------
 * 默认配置
 * -------------------------------------------------------------------------- */

const DEFAULT_OPTIONS: Required<SparkComponentsPluginOptions> = {
  patterns: [
    './features/**/*.vue',
    './src/components/**/*.vue'
  ],
  syncComponents: [
    'PageRenderer',
    'SparkComponentRenderer',
    'ErrorFallback'
  ],
  asyncComponents: [
    '*Demo',
    'Capability*',
    'Tree*'
  ],
  asyncPathPrefixes: [],
  sizeThreshold: 50,
  exclude: [
    'App.vue',
    '**/node_modules/**',
    '**/dist/**',
    '**/*.test.vue',
    '**/*.spec.vue'
  ],
  virtualModuleId: 'virtual:spark-components',
  generateTypes: true,
  verbose: false
}

/* -----------------------------------------------------------------------------
 * 工具函数
 * -------------------------------------------------------------------------- */



/**
 * 通配符匹配
 */
function matchPattern(str: string, pattern: string): boolean {
  const regexPattern = pattern
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  return new RegExp(`^${regexPattern}$`, 'i').test(str)
}

/**
 * 检查是否匹配任一模式
 */
function matchAnyPattern(str: string, patterns: string[]): boolean {
  return patterns.some(pattern => matchPattern(str, pattern))
}

/**
 * 生成导入语句
 */
function generateImportStatement(
  componentName: string,
  path: string,
  strategy: LoadStrategy
): string {
  const varName = componentName
    .split('-')
    .map((part, i) => i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1))
    .join('')

  if (strategy === 'sync') {
    return `import ${varName} from '${path}'`
  } else {
    return `const ${varName} = () => import('${path}')`
  }
}



/* REMOVED: Props 提取（extractInterfaceBody, parseInterfaceProperties, applyDefaultsFromWithDefaults, parseComponentProps）
 * Props 结构化提取由 vite-plugin-spark-catalog 负责，并由 ClassModelAgentAdapter 按需合并。
 */

/**
 * 生成注册语句
 */
function generateRegisterStatement(componentName: string, strategy: LoadStrategy): string {
  const varName = componentName
    .split('-')
    .map((part, i) => i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1))
    .join('')

  const componentRef = strategy === 'async'
    ? `defineAsyncComponent(${varName})`
    : varName

  return `  if (!registry.has('${componentName}')) registry.register('${componentName}', ${componentRef})`
}

/* -----------------------------------------------------------------------------
 * 组件分析器
 * -------------------------------------------------------------------------- */

class ComponentAnalyzer {
  private config: Required<SparkComponentsPluginOptions>
  private viteConfig: ResolvedConfig | null = null
  private components: ComponentRegistrationEntry[] = []

  constructor(options: SparkComponentsPluginOptions) {
    this.config = { ...DEFAULT_OPTIONS, ...options }
  }

  /**
   * 设置 Vite 配置
   */
  setViteConfig(config: ResolvedConfig): void {
    this.viteConfig = config
  }

  /**
   * 扫描组件
   */
  scan(): ComponentRegistrationEntry[] {
    if (!this.viteConfig) {
      throw new Error('Vite config not initialized')
    }

    const root = this.viteConfig.root
    const components: ComponentRegistrationEntry[] = []

    logger.info('🔍 开始扫描组件...')

    // 扫描所有匹配的文件
    for (const pattern of this.config.patterns) {
      const files = globSync(pattern, {
        cwd: root,
        absolute: false,
        ignore: this.config.exclude
      })

      if (this.config.verbose) {
        logger.debug(`  模式 ${pattern} 匹配到 ${files.length} 个文件`)
      }

      for (const file of files) {
        const absolutePath = resolve(root, file)

        // 检查文件是否存在
        if (!existsSync(absolutePath)) {
          continue
        }

        // 提取组件信息
        const fileName = basename(file, '.vue')
        const componentName = toKebabCase(fileName)

        // 检查是否排除
        if (matchAnyPattern(fileName, this.config.exclude)) {
          continue
        }

        // 获取文件大小
        const stats = statSync(absolutePath)
        const sizeKB = stats.size / 1024

        // 判断加载策略
        const strategy = this.determineStrategy(fileName, sizeKB, file)

        // 生成路径（相对于 root，用于 import 语句）
        const importPath = './' + file.replace(/\\/g, '/')

        // 生成导入和注册语句
        const importStatement = generateImportStatement(componentName, importPath, strategy)
        const registerStatement = generateRegisterStatement(componentName, strategy)

        components.push({
          name: componentName,
          path: file,
          absolutePath,
          fileName,
          size: Math.round(sizeKB * 100) / 100,
          strategy,
          importStatement,
          registerStatement,
        })
      }
    }

    // 排序：同步组件在前，异步组件在后
    components.sort((a, b) => {
      if (a.strategy === b.strategy) {
        return a.name.localeCompare(b.name)
      }
      return a.strategy === 'sync' ? -1 : 1
    })

    this.components = components

    // 统计信息
    const syncCount  = components.filter(c => c.strategy === 'sync').length
    const asyncCount = components.filter(c => c.strategy === 'async').length

    logger.info(`✅ 扫描完成: ${components.length} 个组件 (同步: ${syncCount}, 异步: ${asyncCount})`)

    if (this.config.verbose) {
      components.forEach(c => {
        logger.debug(`  ${c.strategy === 'sync' ? '📦' : '⏳'} ${c.name} (${c.size} KB)`)
      })
    }

    return components
  }

  /**
   * 判断加载策略
   */
  private determineStrategy(fileName: string, sizeKB: number, rootRelativePath: string): LoadStrategy {
    // 1. 检查显式同步配置
    if (matchAnyPattern(fileName, this.config.syncComponents)) {
      return 'sync'
    }

    // 2. 页面目录始终按需加载，除非已被显式标记为同步
    const normalizedPath = rootRelativePath.replace(/\\/g, '/').replace(/^(\.\/)+/u, '')
    if (this.config.asyncPathPrefixes.some(prefix => {
      const normalizedPrefix = prefix.replace(/\\/g, '/').replace(/^(\.\/)+/u, '').replace(/\/*$/u, '/')
      return normalizedPath.startsWith(normalizedPrefix)
    })) {
      return 'async'
    }

    // 3. 检查显式异步配置
    if (matchAnyPattern(fileName, this.config.asyncComponents)) {
      return 'async'
    }

    // 4. 根据文件大小判断
    if (sizeKB > this.config.sizeThreshold) {
      return 'async'
    }

    // 5. 默认同步加载
    return 'sync'
  }

  /**
   * 生成注册代码
   */
  generateCode(): string {
    // 确保在每次生成前都执行一次扫描，这样即便某些组件被删除或者
    // HMR 未能触发也能保持最新状态。
    this.scan()

    const syncComponents = this.components.filter(c => c.strategy === 'sync')
    const asyncComponents = this.components.filter(c => c.strategy === 'async')

    const code = `/**
 * SPARK 组件自动注册代码
 *
 * ⚠️ 此文件由 vite-plugin-spark-components 自动生成
 * ⚠️ 请勿手动修改，所有更改将在下次构建时被覆盖
 *
 * 生成时间: ${new Date().toISOString()}
 * 组件总数: ${this.components.length} (同步: ${syncComponents.length}, 异步: ${asyncComponents.length})
 */

import { Spark } from '@spark-appworks/spark-component'
${asyncComponents.length > 0 ? "import { defineAsyncComponent } from 'vue'\n" : ''}

/* -----------------------------------------------------------------------------
 * 同步加载组件 (${syncComponents.length} 个)
 * 这些组件会在应用启动时立即加载
 * -------------------------------------------------------------------------- */

${syncComponents.map(c => c.importStatement).join('\n')}

/* -----------------------------------------------------------------------------
 * 异步加载组件 (${asyncComponents.length} 个)
 * 这些组件会在首次使用时按需加载
 * -------------------------------------------------------------------------- */

${asyncComponents.map(c => c.importStatement).join('\n')}

/* -----------------------------------------------------------------------------
 * 注册函数
 * -------------------------------------------------------------------------- */

/**
 * 注册所有组件到 SPARK Registry
 *
 * @param {import('vue').App} [app] - Vue 应用实例（可选）
 * @returns {{ total: number, sync: number, async: number, components: Map }} 组件统计信息
 */
export function registerComponents(app) {
  const registry = Spark.getRegistry()

  // 注册同步组件
${syncComponents.map(c => c.registerStatement).join('\n')}

  // 注册异步组件
${asyncComponents.map(c => c.registerStatement).join('\n')}

  return {
    total: ${this.components.length},
    sync: ${syncComponents.length},
    async: ${asyncComponents.length},
    components: registry.getAll()
  }
}

/**
 * 默认导出
 */
export default registerComponents
`

    return code
  }

  /**
   * 生成类型声明虚拟模块代码
   */
  generateTypes(): string {
    const componentNames = this.components
      .map(c => `'${c.name}'`)
      .join(' | ')

    return `import type { App } from 'vue'

export type ComponentName = ${componentNames || 'string'}

export type ComponentStats = {
  total: number
  sync: number
  async: number
  components: Map<string, Component>
}

export function registerComponents(app?: App): ComponentStats

export default registerComponents
`
  }

}

/**
 * SPARK 组件自动注册 Vite 插件
 */
export function sparkComponentsPlugin(
  options: SparkComponentsPluginOptions = {}
): Plugin {
  const analyzer = new ComponentAnalyzer(options)
  const config = { ...DEFAULT_OPTIONS, ...options }
  const virtualModuleId = config.virtualModuleId
  const resolvedVirtualModuleId = '\0' + virtualModuleId
  const resolvedVirtualTypeModuleId = '\0' + virtualModuleId + '.d.ts'

  return {
    name: 'vite-plugin-spark-components',

    /**
     * 配置解析完成
     */
    configResolved(resolvedConfig) {
      analyzer.setViteConfig(resolvedConfig)

      // 初始扫描
      analyzer.scan()
    },

    /**
     * 解析虚拟模块 ID
     */
    resolveId(id) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId
      }
      if (id === virtualModuleId + '.d.ts') {
        return resolvedVirtualTypeModuleId
      }
      return null
    },

    /**
     * 加载虚拟模块
     */
    load(id) {
      if (id === resolvedVirtualModuleId) {
        return analyzer.generateCode()
      }
      if (id === resolvedVirtualTypeModuleId && config.generateTypes) {
        return analyzer.generateTypes()
      }
      return null
    },

    /**
     * HMR 热更新（仅开发模式）
     */
    handleHotUpdate({ file, server }) {
      // 如果是 Vue 组件文件变更/新增/删除，重新扫描
      // Vite 在删除文件时也会触发此 hook，虽然文件已不存在，
      // scan() 内部会跳过 missing paths。
      if (file.endsWith('.vue')) {
        logger.debug('🔄 检测到组件变更或删除，重新扫描...')
        analyzer.scan()

        const modules = [server.moduleGraph.getModuleById(resolvedVirtualModuleId)].filter(Boolean)

        for (const mod of modules) {
          if (mod) server.moduleGraph.invalidateModule(mod)
        }

        if (modules.length > 0) {
          server.ws.send({ type: 'full-reload', path: '*' })
        }
      }
    }
  }
}

/**
 * 默认导出
 */
export default sparkComponentsPlugin

