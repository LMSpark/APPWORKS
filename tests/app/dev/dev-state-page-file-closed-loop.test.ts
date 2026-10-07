import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, watchEffect } from 'vue'
import { useDevState } from '@/views/app/dev-system/useDevState'
import {
  createDevStateWithConfigPages,
  DEMO_PAGE_FIXTURE,
  ensureDevStateActivePageLoaded,
  isolateAppProjectWorkspaceForTest,
  isDevStatePageDocumentDirty,
} from './dev-state-test-fixture'
import type { ProjectBlueprintTreeData, ProjectBlueprintTreeNodeData } from '@spark-appworks/spark-project-model'
import type { RuntimeNavigation } from '@spark-appworks/spark-app'
import { refreshRoutes } from '@spark-appworks/spark-app'
import { lowcodeHttp as http } from '@/lowcode/lowcode-runtime'

const httpFns = vi.hoisted(() => ({
  get: vi.fn(),
  requestFull: vi.fn(),
  put: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
  clearCache: vi.fn(),
  interceptors: {
    request: { use: vi.fn() },
    response: { use: vi.fn() },
  },
}))

const navTreeState = vi.hoisted(() => ({
  tree: null as ProjectBlueprintTreeData | null,
}))

vi.mock('@spark-appworks/spark-app', () => ({
  getNavTree: vi.fn(() => navTreeState.tree),
  refreshRoutes: vi.fn(async () => {
    if (navTreeState.tree) return navTreeState.tree
    throw new Error('refreshRoutes: no nav tree')
  }),
  createAiRunAdapter: vi.fn(() => ({
    isRunning: vi.fn(() => false),
    abort: vi.fn(),
    run: vi.fn(async () => 'completed' as const),
    subscribe: vi.fn(() => () => {}),
    snapshot: vi.fn(() => ({
      trace: { messages: [], entries: [], toolCalls: [] },
      agUiEvents: [],
      timeline: [],
    })),
  })),
  createAiToolApprovalBridge: vi.fn(() => ({
    beforeFunctionCall: vi.fn(async () => ({ status: 'allow' })),
    cancelPending: vi.fn(() => 0),
    decide: vi.fn(() => false),
    listPending: vi.fn(() => []),
    subscribe: vi.fn((listener: (snapshot: { pending: [] }) => void) => {
      listener({ pending: [] })
      return vi.fn()
    }),
  })),
}))

vi.mock('@/lowcode/lowcode-runtime', () => ({
  lowcodeHttp: httpFns,
  lowcodeRequestHeaders: () => ({}),
  readLowcodePrincipal: () => null,
  lowcodeApi: {
    platform: {
      listApplications: async () => httpFns.get('application-catalog:tenant-b'),
    },
  },
  createLowcodeProjectGateways: (projectId: string) => {
    const blueprintKey = `project-blueprint:${projectId}`
    const pageFileKey = `designfile:${projectId}`
    return {
      pageFiles: {
        readPageFile: async (command: { pageId: string; fileName: string }) => {
          const response = await httpFns.get(`${pageFileKey}/${command.pageId}/${command.fileName}`)
          return String(response?.content ?? '')
        },
        saveFileContent: async (pageId: string, fileName: string, content: string) => {
          await httpFns.put(`${pageFileKey}/${pageId}/${fileName}`, { content })
        },
        listVersions: async (pageId: string, fileName: string) => {
          const rows = await httpFns.get(`${pageFileKey}/${pageId}/${fileName}/versions`)
          return Array.isArray(rows)
            ? rows
            : []
        },
        restoreVersion: async (pageId: string, fileName: string, version: number) => {
          await httpFns.post(`${pageFileKey}/${pageId}/${fileName}/versions/${version}/restore`)
        },
      },
      blueprint: {
        loadRoot: async () => httpFns.get(blueprintKey),
        updateNode: async (id: string, patch: unknown) => {
          const response = await httpFns.put(`${blueprintKey}:nodes:${id}`, patch)
          return response.node ?? response
        },
      },
      projectReferences: {
        listProjects: async () => [],
        loadProjectBlueprint: async () => ({ children: [] }),
      },
    }
  },
}))


function node(nodeId:string,title:string,target:string,projectId='homepage',description=''):ProjectBlueprintTreeNodeData { return {nodeId,parentNodeId:`${projectId}_root`,projectId,kind:'page',capability:{name:title,description},navigation:{title,target,icon:'Document',order:0,publishInMenu:true,showChildren:true,beginGroup:false},source:{}} }
function blueprintRoot(children:ProjectBlueprintTreeNodeData[],projectId='homepage'):ProjectBlueprintTreeData { return {nodeId:`${projectId}_root`,parentNodeId:'',projectId,kind:'module',capability:{name:projectId},navigation:{title:projectId,order:0,publishInMenu:true,showChildren:true,beginGroup:false},source:{},children} }

const httpMock = vi.mocked(http)

function notFound(): Error & { response: { status: number } } {
  return Object.assign(new Error('not found'), { response: { status: 404 } })
}

function pageFileResponse(url: string): Record<string, unknown> {
  if (url.endsWith('/rule.json')) return { content: '[]' }
  if (url.endsWith('/pagedata.json')) return { content: '{"dataSetName":"TestDS","tables":{}}' }
  if (url.endsWith('/script.js')) return { content: 'console.log("restored")' }
  if (url.endsWith('/style.css')) return { content: '.restored { color: red; }' }
  return { content: '' }
}

async function requestFullFromGet(config: { url: string }): Promise<Record<string, unknown>> {
  try {
    const data = await httpFns.get(config.url)
    const content = data !== null && typeof data === 'object'
      ? Object.getOwnPropertyDescriptor(data, 'content')?.value
      : ''
    return {
      data: {
        protocolVersion: 4,
        ok: true,
        data: {
          content: String(content ?? ''),
          timestamp: '1',
        },
      },
      status: 200,
      statusText: 'OK',
      headers: {},
    }
  } catch (error) {
    if (
      isErrorLike(error) &&
      error.status === undefined &&
      typeof error.response?.status === 'number'
    ) {
      error.status = error.response.status
    }
    throw error
  }
}

function isErrorLike(value: unknown): value is { status?: unknown; response?: { status?: unknown } } {
  return value !== null && typeof value === 'object'
}

describe('DevState 页面文件闭环', () => {
  beforeEach(() => {
    isolateAppProjectWorkspaceForTest()
    vi.clearAllMocks()
    httpFns.requestFull.mockImplementation(requestFullFromGet)
    httpFns.clearCache.mockImplementation(() => undefined)
    httpFns.interceptors.request.use.mockImplementation(() => () => undefined)
    httpFns.interceptors.response.use.mockImplementation(() => () => undefined)
  })

  it('缺失 script/style 时 fail-fast，不静默写入空文档', async () => {
    const state = createDevStateWithConfigPages(DEMO_PAGE_FIXTURE, 'demo')
    httpMock.get.mockImplementation(async (url: string) => {
      if (url.endsWith('/script.js') || url.endsWith('/style.css')) throw notFound()
      return pageFileResponse(url)
    })

    await expect(ensureDevStateActivePageLoaded(state, { forceReload: true })).rejects.toThrow('not found')

    expect(state.project.getActivePage()?.isLoaded).toBe(false)
  })

  it('缺失 rule/pagedata 时 fail-fast，不创建占位模型', async () => {
    const state = createDevStateWithConfigPages(DEMO_PAGE_FIXTURE, 'demo')
    httpMock.get.mockImplementation(async (url: string) => {
      if (url.endsWith('/rule.json')) throw notFound()
      if (url.endsWith('/pagedata.json')) throw notFound()
      return pageFileResponse(url)
    })

    await expect(ensureDevStateActivePageLoaded(state)).rejects.toThrow('not found')

    expect(state.project.getActivePage()?.isLoaded).toBe(false)
  })

  it('版本摘要保留编号文件名和可空修改时间', async () => {
    const state = createDevStateWithConfigPages(DEMO_PAGE_FIXTURE, 'demo')
    httpMock.get.mockResolvedValueOnce([
      {version:1,fileName:'1__script.js',lastModified:1710000000000},
    ])

    state.project.setActivePage(state.activePageId.value)
    const versions = await state.editor.listRemotePageVersions('script.js')

    expect(versions).toEqual([
      {
        version: 1,
        fileName:'1__script.js',
        lastModified:1710000000000,
      },
    ])
  })

  it('restore 后立即强制重读并回填文档模型', async () => {
    const state = createDevStateWithConfigPages(DEMO_PAGE_FIXTURE, 'demo')
    state.project.getActivePage()?.hydrateFileText('script.js', 'console.log("old")')
    httpMock.post.mockResolvedValueOnce({ ok: true })
    httpMock.get.mockImplementation(async (url: string) => pageFileResponse(url))

    state.project.setActivePage('demo')
    await state.editor.restoreRemotePageVersion(1, 'script.js')
    expect(state.project.readPageFileText('script.js')).toBe('console.log("restored")')
    expect(isDevStatePageDocumentDirty(state, 'script.js')).toBe(false)
    expect(state.projectRevision.value).toBeGreaterThan(0)
  })

  it('切换左侧节点时触发右侧 blueprintDraft 订阅刷新', async () => {
    const state = useDevState()
    httpMock.get.mockImplementation(async (url: string) => {
      if (url === 'project-blueprint:homepage') {
        return {
          ...blueprintRoot([]),
          children: [
            node('alpha-node','Alpha','cfg:alpha'),
            node('beta-node','Beta','cfg:beta'),
          ],
        }
      }
      return pageFileResponse(url)
    })

    await state.loadBlueprint()
    const observedEditDtoIds: string[] = []
    const stop = watchEffect(() => {
      observedEditDtoIds.push(state.blueprintDraft.nodeId)
    })

    await state.selectNode(state.treeData.value[1]!)
    await nextTick()
    stop()

    expect(state.selectedNode.value?.nodeId).toBe('beta-node')
    expect(state.activePageId.value).toBe('beta')
    expect(observedEditDtoIds.at(-1)).toBe('beta-node')
  })

  it('初始化页面列表从项目蓝图派生，不请求页面文件清单', async () => {
    const state = useDevState()
    httpMock.get.mockImplementation(async (url: string) => {
      if (url === 'project-blueprint:homepage') {
        return {
          ...blueprintRoot([]),
          children: [
            node('alpha-node','Alpha','cfg:alpha','homepage','Alpha 页面需求'),
            node('sys-node','System','/system'),
          ],
        }
      }
      if (url.includes(':__list')) {
        throw new Error(`unexpected GET ${url}`)
      }
      return pageFileResponse(url)
    })

    await state.initialize()

    expect(state.pageList.value).toEqual([
      expect.objectContaining({
        pageId: 'alpha',
        path: 'cfg:alpha',
        title: 'Alpha',
        nodeId: 'alpha-node',
        description: 'Alpha 页面需求',
        designSurface: 'config-files',
      }),
      expect.objectContaining({
        pageId: 'system',
        path: '/system',
        title: 'System',
        nodeId: 'sys-node',
        designSurface: 'system-page',
      }),
    ])
    expect(httpMock.get).not.toHaveBeenCalledWith('designfile:homepage/__list')
  })

  it('header 保存蓝图属性时只提交选中节点 patch，不整树保存', async () => {
    const state = useDevState()
    const root: ProjectBlueprintTreeData = {
      ...blueprintRoot([]),
      children: [
        node('alpha-node','Alpha','cfg:alpha'),
      ],
    }
    navTreeState.tree = root
    httpMock.get.mockImplementation(async (url: string) => {
      if (url === 'project-blueprint:homepage') return root
      return pageFileResponse(url)
    })
    httpMock.put.mockResolvedValueOnce({
      node: {...node('alpha-node','Alpha updated','cfg:alpha'),capability:{name:'Alpha',description:''}},
    })

    vi.mocked(refreshRoutes).mockImplementation(async (): Promise<RuntimeNavigation> => {
      const updated: ProjectBlueprintTreeData = {
        ...root,
        children: [
          node('alpha-node','Alpha updated','cfg:alpha'),
        ],
      }
      navTreeState.tree = updated
      return {
        title: updated.capability.name,
        childPlacement:'header',
        items: [{ id: 'alpha-node', title: 'Alpha updated', itemKind: 'page', path: '/alpha' }],
      }
    })

    await state.loadBlueprint()
    state.blueprintDraft.navigation!.title = 'Alpha updated'
    const refreshCallsBeforeSave = vi.mocked(refreshRoutes).mock.calls.length

    await state.saveAll()

    expect(vi.mocked(refreshRoutes).mock.calls.length - refreshCallsBeforeSave).toBe(1)
    expect(navTreeState.tree?.children?.[0]?.navigation?.title).toBe('Alpha updated')
    expect(state.project.readBlueprintProjection().tree[0]?.navigation?.title).toBe('Alpha updated')

    expect(httpMock.put).toHaveBeenCalledWith(
      'project-blueprint:homepage:nodes:alpha-node',
      expect.objectContaining({navigation:expect.objectContaining({title:'Alpha updated',order:0})}),
    )
    expect(httpMock.put).not.toHaveBeenCalledWith('project-blueprint:homepage:nodes:alpha-node:move', expect.anything())
    expect(httpMock.put).not.toHaveBeenCalledWith('project-blueprint:homepage', expect.anything())
    expect(httpMock.post).not.toHaveBeenCalledWith('project-blueprint:homepage', expect.anything())
  })

  it('可打开其他租户项目模型编辑，保存时不刷新当前 APP 导航', async () => {
    const state = useDevState()
    const delegatedRoot: ProjectBlueprintTreeData = {
      ...blueprintRoot([], 'delegated-app'),
      children: [
        node('delegated-node','Delegated','cfg:delegated-page','delegated-app'),
      ],
    }
    httpMock.get.mockImplementation(async (url: string) => {
      if (url === 'application-catalog:tenant-b') {
        return [
          { projectId: 'delegated-app', name: 'Delegated App', icon: 'Box', description: '' },
        ]
      }
      if (url === 'project-blueprint:delegated-app') {
        return delegatedRoot
      }
      return pageFileResponse(url)
    })
    httpMock.put.mockResolvedValueOnce({
      node: {...node('delegated-node','Delegated updated','cfg:delegated-page','delegated-app'),capability:{name:'Delegated',description:''}},
    })

    await state.loadEditableProjects('tenant-b')
    state.projectPicker.tenantId = 'tenant-b'
    state.projectPicker.projectId = 'delegated-app'

    await expect(state.openProjectPickerScope()).resolves.toBe(true)

    expect(state.tenantId).toBe('tenant-b')
    expect(state.projectId).toBe('delegated-app')
    expect(state.treeData.value[0]?.nodeId).toBe('delegated-node')
    expect(state.activePageId.value).toBe('delegated-page')

    state.blueprintDraft.navigation!.title = 'Delegated updated'
    const refreshCallsBeforeSave = vi.mocked(refreshRoutes).mock.calls.length
    await state.saveAll()

    expect(httpMock.put).toHaveBeenCalledWith(
      'project-blueprint:delegated-app:nodes:delegated-node',
      expect.objectContaining({navigation:expect.objectContaining({title:'Delegated updated'})}),
    )
    expect(vi.mocked(refreshRoutes).mock.calls.length).toBe(refreshCallsBeforeSave)
  })
})
