/**
 * 应用壳唯一可消费的运行导航合同。
 *
 * 它只表达后端授权后可见的菜单、路由和动作，不是项目蓝图的持久化形状。
 */
export type RuntimeNavigationItemKind =
  | 'system-directory'
  | 'module'
  | 'system-page'
  | 'system-action'
  | 'page'
  | 'link'
  | 'ref'

export type RuntimeNavigationPlacement =
  | 'header'
  | 'sidebar'
  | 'toolbar'
  | 'user-menu'
  | 'parent'
  | 'flat'

export type RuntimeNavigationPermissionMode = 'none' | 'masked' | 'invisible'

export type RuntimeNavigationContextItem = Readonly<{
  id: string | number
  title: string
}>

export type RuntimeNavigationContextConfig = Readonly<{
  source: string | readonly RuntimeNavigationContextItem[]
  placeholder?: string
  defaultValue?: string | number
  paramName?: string
}>

export type RuntimeNavigationContextState = {
  config: RuntimeNavigationContextConfig
  nodeId: string
  selected: string | number | null
  items: RuntimeNavigationContextItem[]
  loading: boolean
  error: string | null
}

export type RuntimeNavigationItem = {
  id: string
  title: string
  description?: string
  icon?: string
  itemKind?: RuntimeNavigationItemKind
  childPlacement?: RuntimeNavigationPlacement
  context?: string | readonly RuntimeNavigationContextItem[] | RuntimeNavigationContextConfig
  order?: number
  hidden?: boolean
  disabled?: boolean
  dividerAfter?: boolean
  permissionMode?: RuntimeNavigationPermissionMode
  children?: RuntimeNavigationItem[]
  path?: string
  formKey?: string
  dataSpaceId?: string
  modelId?: string
  linkTarget?: 'iframe' | 'new-tab' | 'self'
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
  childPlacement: 'header' | 'sidebar'
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
