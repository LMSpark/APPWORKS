import type { PageToolFileName, ProjectBlueprintTreeData } from '@spark-appworks/spark-project-model'
import { useDevState } from '@/views/app/dev-system/useDevState'
import { resetAppProjectWorkspace } from '@/services/project/project-shell'

export type DevState = ReturnType<typeof useDevState>

export type DevStateTestPage = {
  pageId: string
  nodeId?: string
  title?: string
  path?: string
}

export const ORDERS_PAGE_FIXTURE: readonly DevStateTestPage[] = [
  { pageId: 'orders-page', nodeId: 'orders-page-node', title: 'Orders' },
  { pageId: 'orders-page-v2', nodeId: 'orders-page-v2-node', title: 'Orders V2' },
]

export const DEMO_PAGE_FIXTURE: readonly DevStateTestPage[] = [
  { pageId: 'demo', nodeId: 'demo-node', title: 'Demo' },
]

function buildTestNavRoot(pages: readonly DevStateTestPage[]): ProjectBlueprintTreeData {
  return {
    nodeId:'homepage_root',parentNodeId:'',projectId:'homepage',kind:'module',capability:{name:'Test Project'},source:{},
    children:pages.map(page=>({nodeId:page.nodeId ?? `${page.pageId}-node`,parentNodeId:'homepage_root',projectId:'homepage',kind:'page',capability:{name:page.title ?? page.pageId},navigation:{title:page.title ?? page.pageId,target:page.path ?? `cfg:${page.pageId}`,order:0,publishInMenu:true,showChildren:true,beginGroup:false},source:{}})),
  }
}

/** 在导航树挂载配置页节点（与登录后 ingest 同路径），供 selectPage 使用。 */
export function seedDevStateConfigPages(
  state: DevState,
  pages: readonly DevStateTestPage[] = ORDERS_PAGE_FIXTURE,
): void {
  state.project.replaceBlueprintTree(buildTestNavRoot(pages))
}

/** 每个用例重置 APP ProjectWorkspace 缓存，避免跨测试污染 editor.project。 */
export function isolateAppProjectWorkspaceForTest(): void {
  resetAppProjectWorkspace()
}

export function alignDevStateActivePage(state: DevState): boolean {
  const pageId = state.activePageId.value.trim()
  if (!pageId) return false
  if (state.project.getActivePage()?.pageId !== pageId) {
    state.project.setActivePage(pageId)
  }
  return true
}

export async function ensureDevStateActivePageLoaded(
  state: DevState,
  options?: { forceReload?: boolean },
): Promise<void> {
  if (!alignDevStateActivePage(state)) return
  await state.editor.ensureActivePageFilesLoaded(options)
}

export function isDevStatePageDocumentDirty(state: DevState, name: PageToolFileName): boolean {
  void state.projectRevision.value
  return state.project.readDirtyProjection().dirtyFiles.has(name)
}

export async function saveDevStatePageDocument(
  state: DevState,
  name: PageToolFileName,
): Promise<void> {
  if (!alignDevStateActivePage(state)) return
  await state.editor.savePageFile(name)
}

export function createDevStateWithConfigPages(
  pages: readonly DevStateTestPage[] = ORDERS_PAGE_FIXTURE,
  activePageId = 'orders-page',
): DevState {
  isolateAppProjectWorkspaceForTest()
  const state = useDevState()
  seedDevStateConfigPages(state, pages)
  if (activePageId) state.selectPage(activePageId)
  return state
}
