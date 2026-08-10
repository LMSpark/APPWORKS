import type {
  ContextItem,
  NavigationContextConfig,
  NavigationLinkTarget,
  NavigationPlacement,
  NavigationRootPlacement,
  PermissionMode,
  RuntimeNavigationItemKind,
} from '@spark-appworks/spark-utils'
/**
 * 应用壳唯一可消费的运行导航合同。
 *
 * 它只表达后端授权后可见的菜单、路由和动作，不是项目蓝图的持久化形状。
 */
export type RuntimeNavigationContextState = {
  config: NavigationContextConfig
  nodeId: string
  selected: string | number | null
  items: ContextItem[]
  loading: boolean
  error: string | null
}

export type RuntimeNavigationItem = {
  id: string
  title: string
  description?: string
  icon?: string
  itemKind?: RuntimeNavigationItemKind
  childPlacement?: NavigationPlacement
  context?: string | readonly ContextItem[] | NavigationContextConfig
  order?: number
  hidden?: boolean
  disabled?: boolean
  dividerAfter?: boolean
  permissionMode?: PermissionMode
  children?: RuntimeNavigationItem[]
  path?: string
  formKey?: string
  dataSpaceId?: string
  modelId?: string
  linkTarget?: NavigationLinkTarget
  redirect?: string
  refId?: string
  refPath?: string
  refProjectId?: string
  refBroken?: boolean
}

export type RuntimeNavigation = {
  id?: string
  projectId?: string
  title: string
  childPlacement: NavigationRootPlacement
  items: RuntimeNavigationItem[]
  homePath?: string
}

export type RuntimeNavigationRegionItems = {
  header: RuntimeNavigationItem[]
  sidebar: RuntimeNavigationItem[]
  toolbar: RuntimeNavigationItem[]
  userMenu: RuntimeNavigationItem[]
}

export type RuntimeNavigationRegionVisibility = Readonly<{
  header: boolean
  sidebar: boolean
  toolbar: boolean
  userMenu: boolean
}>
