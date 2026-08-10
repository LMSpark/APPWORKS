/**
 * @module @spark-appworks/spark-project-model:page/runtime-page
 * 职责：提供项目模型和页面配置域中的 runtime page 能力，支撑 navigation、page content、project session 或远程 IO。
 * 边界：只描述配置和项目结构，不渲染 Vue 组件，也不直接操作 spark-data 运行态。
 * AI用途：读取、生成或同步项目页面配置时，用本模块确认项目模型字段和 IO 边界。
 */
/**
 * 运行态配置页：ConfigPageNode + PageContentLoader 绑定。
 */
import type { ProjectBlueprintTreeNodeData } from '../blueprint/project-blueprint-node'
import {
  ConfigPageNode,
  type PageNodeLike,
  type PageNodeLoadOptions,
} from '../page/config-page'
import {
  PAGE_NODE_FILE_NAMES,
  type PageNodeFileName,
} from '../page/page-file'
import type { PageContentLoader } from '../io/page-content-loader'

type LoadRuntimePageFileCommand = Readonly<{
  page: ConfigPageNode
  loader: PageContentLoader
  name: PageNodeFileName
  options?: PageNodeLoadOptions
}>

async function loadRuntimePageFile(command: LoadRuntimePageFileCommand): Promise<void> {
  const { page, loader, name, options = {} } = command
  const result = await loader.loadPageFileContent(page.pageId, name, {
    forceReload: options.forceReload === true,
  })
  if (!result.success) {
    throw new Error(result.error ?? result.reason ?? `${name} 加载失败`)
  }
  page.hydrateFileText(name, result.data ?? '')
}

async function loadRuntimePageFiles(
  page: ConfigPageNode,
  loader: PageContentLoader,
  options: PageNodeLoadOptions = {},
): Promise<void> {
  const forceReload = options.forceReload === true
  if (page.isLoaded && !forceReload) return
  await Promise.all(
    PAGE_NODE_FILE_NAMES.map(name => loadRuntimePageFile({ page, loader, name, options: { forceReload } })),
  )
  page.markLoaded()
}

export function createRuntimePageNode(
  pageId: string,
  loader: PageContentLoader,
  node?: ProjectBlueprintTreeNodeData,
): PageNodeLike {
  const normalized = pageId.trim()
  if (!normalized) {
    throw new Error('pageId 不能为空')
  }
  const navNode: ProjectBlueprintTreeNodeData = node ?? {
    id: normalized,
    title: normalized,
    nodeKind: 'page',
    path: `/${normalized}`,
    icon: 'Document',
  }
  const page = new ConfigPageNode({
    node: navNode,
    pid: '',
    pageId: normalized,
  })
  return {
    get pageId() { return page.pageId },
    get isLoaded() { return page.isLoaded },
    load: (options?: PageNodeLoadOptions) => loadRuntimePageFiles(page, loader, options),
    toRenderConfig: () => page.toRenderConfig(),
  }
}
