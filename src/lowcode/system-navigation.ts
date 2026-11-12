/**
 * @module app:lowcode/system-navigation
 * 职责：由 Vue 系统页登记生成平台级、企业级菜单及每个应用末尾的“应用设计”分组。
 * 边界：只投影登记的页面身份与分组，不读取后端菜单授权；页面数据权限仍由各页查询结果决定。
 */
import type {RuntimeNavigation, RuntimeNavigationItem} from '@spark-appworks/spark-app'
import {getVuePageOptions, type PageScope, type VuePageOption} from '@/registries/vue-page-registry'
import {APPLICATION_CATALOG_PROJECT_ID} from '@/services/application-scope'

type MenuScope = Exclude<PageScope, 'public'>

const APPLICATION_DESIGN_GROUP_ID = 'appworks-application-design'

function pageOrder(page: Readonly<{order?: number}>): number {
  return page.order ?? Number.MAX_SAFE_INTEGER
}

function systemPageItem(scope: MenuScope, page: VuePageOption): RuntimeNavigationItem {
  return {
    id: page.navigationId ?? page.dataSpaceId ?? `appworks-${scope}${page.path.replaceAll('/', '-')}`,
    title: page.title,
    itemKind: 'system-page',
    path: page.path,
    order: pageOrder(page),
    ...(page.icon === undefined ? {} : {icon: page.icon}),
    ...(page.description === undefined ? {} : {description: page.description}),
    ...(page.dataSpaceId === undefined ? {} : {blueprintScenarioId: page.dataSpaceId}),
  }
}

function sortItems(items: RuntimeNavigationItem[]): RuntimeNavigationItem[] {
  return items.sort((left, right) => (left.order ?? 0) - (right.order ?? 0) || left.title.localeCompare(right.title))
}

/** 某层登记且可见的系统页，按 group 收为模块，组与页均按 order 排序。 */
function buildSystemPageItems(scope: MenuScope): RuntimeNavigationItem[] {
  const pages = getVuePageOptions().filter(page => page.scope === scope && page.hidden !== true)
  const groups = new Map<string, RuntimeNavigationItem[]>()
  const items: RuntimeNavigationItem[] = []
  for (const page of pages) {
    const item = systemPageItem(scope, page)
    if (page.group === undefined) {items.push(item); continue}
    const members = groups.get(page.group) ?? []
    members.push(item)
    groups.set(page.group, members)
  }
  for (const [title, members] of groups) {
    items.push({id: `appworks-${scope}-group:${title}`, title, itemKind: 'module',
      order: Math.min(...members.map(member => member.order ?? Number.MAX_SAFE_INTEGER)), children: sortItems(members)})
  }
  return sortItems(items)
}

/** 未进入应用时的企业级菜单；执行作用域为应用目录。 */
export function lowcodeEnterpriseNavigation(): RuntimeNavigation {
  return {
    title: 'SPARK 应用工场',
    projectId: APPLICATION_CATALOG_PROJECT_ID,
    childPlacement: 'header',
    homePath: '/app-list',
    items: buildSystemPageItems('enterprise'),
  }
}

/** 平台级工作台菜单；路由由动态路由统一挂到平台前缀下。 */
export function lowcodePlatformNavigation(): RuntimeNavigation {
  const items = buildSystemPageItems('platform')
  const first = items.find(item => item.path !== undefined)
  return {
    title: 'SPARK 平台管理',
    childPlacement: 'header',
    ...(first?.path === undefined ? {} : {homePath: first.path}),
    items,
  }
}

/** 在应用业务导航末尾追加“应用设计”分组，设计目标即当前应用。 */
export function withApplicationDesign(businessItems: readonly RuntimeNavigationItem[]): RuntimeNavigationItem[] {
  const children = buildSystemPageItems('app')
  return children.length === 0 ? [...businessItems]
    : [...businessItems, {id: APPLICATION_DESIGN_GROUP_ID, title: '应用设计', itemKind: 'module', children}]
}

/** “应用设计”分组的子项；无业务页的应用以其首项（项目蓝图）为落点。 */
export function applicationDesignItems(items: readonly RuntimeNavigationItem[]): readonly RuntimeNavigationItem[] {
  return items.find(item => item.id === APPLICATION_DESIGN_GROUP_ID)?.children ?? []
}
