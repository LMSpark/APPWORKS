/**
 * @module app:registries/vue-page-registry
 * 职责：提供 src 应用层的 vue page registry 能力，连接运行时上下文、视图组件和服务。
 * 边界：只服务应用入口和组合层，不修改基础包协议，也不承担服务端职责。
 * AI用途：排查应用启动、运行时上下文或局部 UI 接线时，用本模块确认源码入口。
 */
/**
 * Vue system-page registry.
 *
 * JSON config only declares pages. This registry binds those declarations to
 * Vite component loaders and exposes the derived route/navigation helpers.
 */
import type { Component } from 'vue'
import type { RuntimeNavigation } from '@spark-appworks/spark-app'
import vuePagesDocument from '../../config/navigation/vue-pages.json'

const VUE_PAGES_PROTOCOL = 'spark-appworks.vue-pages'
const VUE_PAGES_SCHEMA_VERSION = 1

/** Page Scope 的语义模型。 */
export type PageScope = 'public' | 'tenant' | 'app'

/** Vue Page Config Entry 的语义模型。 */
type VuePageConfigEntry = Readonly<{
  /** 页面路由路径；必须以 / 开头，作为 URL 路由和注册表键。 */
  path: string
  /** 页面标题；显示在导航树和浏览器标签页。 */
  title: string
  /** 页面图标名；对应图标组件的标识，省略时导航树不显示图标。 */
  icon?: string
  /** 页面描述；用于导航提示和 AI 理解页面功能。 */
  description?: string
  /** 页面可见范围；public 表示无需登录即可访问，tenant/app 需登录后按权限显示。 */
  scope: PageScope
  /** Vue 组件文件路径；必须位于 src/views/ 下且以 .vue 结尾，用于 Vite 动态 import。 */
  source: string
  /** 是否在导航树中隐藏；隐藏页面仍可路由访问，但不显示在菜单中。 */
  hidden?: boolean
  /** 是否投影到应用壳层的 SPARK 工具组；业务导航别名应设为 false。 */
  shellTool?: boolean
}>

type VuePagesConfig = Readonly<{
  $schema?: string
  protocol: typeof VUE_PAGES_PROTOCOL
  schemaVersion: typeof VUE_PAGES_SCHEMA_VERSION
  pages: readonly VuePageConfigEntry[]
}>

/** Vue Page Entry 的语义模型。 */
type VuePageEntry = Readonly<Omit<VuePageConfigEntry, 'path'> & {
  /** 懒加载 Vue 组件；通过 Vite import.meta.glob 绑定，首次调用时按需加载。 */
  load: () => Promise<{ default: Component }>
}>

const PAGE_SCOPE_VALUES: ReadonlySet<string> = new Set(['public', 'tenant', 'app'])

const vuePageModules = import.meta.glob<{ default: Component }>('../views/**/*.vue')
const vuePagesConfig = parseVuePagesConfig(vuePagesDocument)

/**
 * 路径 -> Vue 组件页面注册表。
 *
 * key 是不含租户前缀的应用内路径；entry.load 由 source 绑定到 Vite 动态 import。
 */
const VUE_PAGE_REGISTRY: Readonly<Record<string, VuePageEntry>> = Object.fromEntries(
  vuePagesConfig.pages.map(page => [page.path, createVuePageEntry(page)]),
)

export function getVuePageEntry(path: string): VuePageEntry | undefined {
  return VUE_PAGE_REGISTRY[path]
}

export function hasVuePage(path: string): boolean {
  return getVuePageEntry(path) !== undefined
}

/**
 * 构建 componentMap（路径 -> Vue 组件实例）。
 *
 * 在 main.ts 启动阶段调用，并行加载所有组件模块后返回扁平映射。
 */
export async function buildComponentMap(): Promise<Record<string, Component>> {
  const entries = Object.entries(VUE_PAGE_REGISTRY)
  const modules = await Promise.all(
    entries.map(async ([path, entry]) => {
      const mod = await entry.load()
      return [path, mod.default] as const
    }),
  )
  return Object.fromEntries(modules)
}

/**
 * 公共路径集合（用于路由守卫：未登录时只允许这些路径）。
 */
export function getPublicPaths(): Set<string> {
  return new Set(
    Object.entries(VUE_PAGE_REGISTRY)
      .filter(([, entry]) => entry.scope === 'public')
      .map(([path]) => path),
  )
}

/**
 * 从 public 页面声明自动构建登录前导航树。
 */
export function buildPreAuthNavTree(): RuntimeNavigation {
  const items = Object.entries(VUE_PAGE_REGISTRY)
    .filter(([, entry]) => entry.scope === 'public')
    .map(([path, entry]) => ({
      id: `platform-${path === '/' ? 'home' : path.slice(1)}`,
      title: entry.title,
      ...(entry.icon === undefined ? {} : { icon: entry.icon }),
      path,
      itemKind: 'system-page' as const,
      ...(entry.hidden === true ? { hidden: true } : {}),
    }))

  return { title: '', childPlacement: 'header' as const, homePath: '/', items }
}

/**
 * 组件页面选项列表（纯元数据，不含组件引用）。
 */
export function getVuePageOptions(): Array<{
  path: string
  title: string
  scope: PageScope
  source: string
  icon?: string
  description?: string
  shellTool?: boolean
}> {
  return Object.entries(VUE_PAGE_REGISTRY).map(([path, entry]) => ({
    path,
    title: entry.title,
    scope: entry.scope,
    source: entry.source,
    ...(entry.icon === undefined ? {} : { icon: entry.icon }),
    ...(entry.description === undefined ? {} : { description: entry.description }),
    ...(entry.shellTool === undefined ? {} : { shellTool: entry.shellTool }),
  }))
}

function createVuePageEntry(page: VuePageConfigEntry): VuePageEntry {
  const moduleKey = toVuePageModuleKey(page.source)
  const load = vuePageModules[moduleKey]
  if (load === undefined) {
    throw new Error(`Vue page source is not importable: ${page.source}`)
  }
  return {
    title: page.title,
    scope: page.scope,
    source: page.source,
    load,
    ...(page.icon === undefined ? {} : { icon: page.icon }),
    ...(page.description === undefined ? {} : { description: page.description }),
    ...(page.hidden === undefined ? {} : { hidden: page.hidden }),
    ...(page.shellTool === undefined ? {} : { shellTool: page.shellTool }),
  }
}

function toVuePageModuleKey(source: string): string {
  const prefix = 'src/views/'
  if (!source.startsWith(prefix)) {
    throw new Error(`Vue page source must start with ${prefix}: ${source}`)
  }
  return `../views/${source.slice(prefix.length)}`
}

function parseVuePagesConfig(document: unknown): VuePagesConfig {
  const root = requireRecord(document, 'config/navigation/vue-pages.json')
  const schema = optionalString(root, '$schema', 'config/navigation/vue-pages.json')
  if (root['protocol'] !== VUE_PAGES_PROTOCOL) {
    throw new Error(`config/navigation/vue-pages.json: protocol must be "${VUE_PAGES_PROTOCOL}".`)
  }
  if (root['schemaVersion'] !== VUE_PAGES_SCHEMA_VERSION) {
    throw new Error(`config/navigation/vue-pages.json: schemaVersion must be ${String(VUE_PAGES_SCHEMA_VERSION)}.`)
  }
  const pagesValue = root['pages']
  if (!Array.isArray(pagesValue) || pagesValue.length === 0) {
    throw new Error('config/navigation/vue-pages.json: pages must be a non-empty array.')
  }
  const pages = pagesValue.map((page, index) => parseVuePage(page, `config/navigation/vue-pages.json:pages[${String(index)}]`))
  assertUniquePaths(pages)
  return {
    ...(schema === undefined ? {} : { $schema: schema }),
    protocol: VUE_PAGES_PROTOCOL,
    schemaVersion: VUE_PAGES_SCHEMA_VERSION,
    pages,
  }
}

function parseVuePage(value: unknown, path: string): VuePageConfigEntry {
  const page = requireRecord(value, path)
  const routePath = requiredString(page, 'path', path)
  if (!routePath.startsWith('/')) {
    throw new Error(`${path}.path must start with "/".`)
  }
  const source = requiredString(page, 'source', path)
  if (!source.startsWith('src/views/') || !source.endsWith('.vue')) {
    throw new Error(`${path}.source must point to a Vue file under src/views/.`)
  }
  const scope = requiredString(page, 'scope', path)
  if (!PAGE_SCOPE_VALUES.has(scope)) {
    throw new Error(`${path}.scope must be one of public, tenant, app.`)
  }
  const hidden = optionalBoolean(page, 'hidden', path)
  const shellTool = optionalBoolean(page, 'shellTool', path)
  const icon = optionalString(page, 'icon', path)
  const description = optionalString(page, 'description', path)
  return {
    path: routePath,
    title: requiredString(page, 'title', path),
    scope: readPageScope(scope, path),
    source,
    ...(icon === undefined ? {} : { icon }),
    ...(description === undefined ? {} : { description }),
    ...(hidden === undefined ? {} : { hidden }),
    ...(shellTool === undefined ? {} : { shellTool }),
  }
}

function assertUniquePaths(pages: readonly VuePageConfigEntry[]): void {
  const seen = new Set<string>()
  for (const page of pages) {
    if (seen.has(page.path)) {
      throw new Error(`config/navigation/vue-pages.json: duplicated page path "${page.path}".`)
    }
    seen.add(page.path)
  }
}

function requireRecord(value: unknown, path: string): Readonly<Record<string, unknown>> {
  if (isPlainRecord(value)) return value
  throw new Error(`${path}: expected an object.`)
}

function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readPageScope(value: string, path: string): PageScope {
  if (value === 'public' || value === 'tenant' || value === 'app') return value
  throw new Error(`${path}.scope must be one of public, tenant, app.`)
}

function requiredString(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
): string {
  const value = record[key]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${path}.${key} must be a non-empty string.`)
  }
  return value.trim()
}

function optionalString(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
): string | undefined {
  const value = record[key]
  if (value === undefined) return undefined
  if (typeof value !== 'string') {
    throw new Error(`${path}.${key} must be a string when provided.`)
  }
  const trimmed = value.trim()
  return trimmed.length === 0 ? undefined : trimmed
}

function optionalBoolean(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
): boolean | undefined {
  const value = record[key]
  if (value === undefined) return undefined
  if (typeof value !== 'boolean') {
    throw new Error(`${path}.${key} must be a boolean when provided.`)
  }
  return value
}
