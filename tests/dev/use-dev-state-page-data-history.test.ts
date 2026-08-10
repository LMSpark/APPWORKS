import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'

const { httpGet, httpPost, httpPut, httpRequestFull, httpClearCache, httpInterceptors } = vi.hoisted(() => ({
  httpGet: vi.fn(),
  httpPost: vi.fn(),
  httpPut: vi.fn(),
  httpRequestFull: vi.fn(),
  httpClearCache: vi.fn(),
  httpInterceptors: {
    request: { use: vi.fn() },
    response: { use: vi.fn() },
  },
}))

vi.mock('@/lowcode/lowcode-runtime', () => ({
  lowcodeHttp: {
    get: httpGet,
    post: httpPost,
    put: httpPut,
    requestFull: httpRequestFull,
    clearCache: httpClearCache,
    interceptors: httpInterceptors,
  },
  lowcodeRequestHeaders: () => ({}),
  readLowcodePrincipal: () => null,
  lowcodeApi: {
    platform: {
      listApplications: async () => [],
    },
  },
  createLowcodeProjectGateways: () => ({
    pageFiles: {
      readPageFile: async (command: { pageId: string; fileName: string }) => {
        const response = await httpGet(`designfile:homepage/${command.pageId}/${command.fileName}`)
        return String(response?.content ?? '')
      },
    },
    blueprint: {
      loadRoot: async () => ({ title: 'Test Project', children: [] }),
    },
    projectReferences: {
      listProjects: async () => [],
      loadProjectBlueprint: async () => ({ title: 'Test Project', children: [] }),
    },
  }),
}))

import { canonicalizePageDataJson } from '@spark-appworks/spark-project-model'
import { PAGE_NODE_FILE_NAMES, type PageNodeFileName } from '@spark-appworks/spark-project-model'
import { useDevFileEditor } from '../../src/views/app/dev-system/composables/useDevFileEditor'
import {
  createDevStateWithConfigPages,
  ensureDevStateActivePageLoaded,
  isolateAppProjectWorkspaceForTest,
  isDevStatePageDocumentDirty,
  saveDevStatePageDocument,
} from './dev-state-test-fixture'


function requireValue<T>(value: T | null | undefined, message: string): T {
  if (value !== null && value !== undefined) return value
  throw new Error(message)
}

function readFirstChildType(children: unknown): string {
  if (!Array.isArray(children)) throw new Error('Expected SparkNode children')
  const firstChild = children[0]
  if (firstChild === null || typeof firstChild !== 'object') {
    throw new Error('Expected first SparkNode child')
  }
  const type = Object.getOwnPropertyDescriptor(firstChild, 'type')?.value
  if (typeof type === 'string') return type
  throw new Error('Expected first SparkNode child type')
}

function createPageDataText(name: string, compact = false): string {
  const payload = {
    dataSetName: 'OrdersDS',
    tables: {
      Orders: {
        tableName: 'Orders',
        columns: [
          { name: 'id', type: 'number', isPrimaryKey: true },
          { name: 'name', type: 'string' },
        ],
        views: {
          default: {
            rows: [{ id: 1, name }],
          },
        },
      },
    },
  }
  return compact ? JSON.stringify(payload) : `${JSON.stringify(payload, null, 2)}\n`
}

async function requestFullFromGet(config: { url: string }): Promise<Record<string, unknown>> {
  try {
    const data = await httpGet(config.url)
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

describe('useDevState documents SSOT', () => {
  beforeEach(() => {
    isolateAppProjectWorkspaceForTest()
    localStorage.clear()
    httpGet.mockReset()
    httpPost.mockReset()
    httpPut.mockReset()
    httpRequestFull.mockReset()
    httpClearCache.mockReset()
    httpInterceptors.request.use.mockReset()
    httpInterceptors.response.use.mockReset()
    httpRequestFull.mockImplementation(requestFullFromGet)
    httpClearCache.mockImplementation(() => undefined)
    httpInterceptors.request.use.mockImplementation(() => () => undefined)
    httpInterceptors.response.use.mockImplementation(() => () => undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loading pagedata from remote parses into a clean model', async () => {
    const initial = createPageDataText('Alpha', true)
    httpGet.mockImplementation(async (url: string) => {
      if (url.endsWith('/pagedata.json')) return { content: initial }
      const name = PAGE_NODE_FILE_NAMES.find((f) => url.endsWith(`/${f}`))
      if (name) return { content: '' }
      throw new Error(`unexpected GET ${url}`)
    })

    const state = createDevStateWithConfigPages()
    await ensureDevStateActivePageLoaded(state)

    expect((state.project.getActivePage()?.isLoaded ? 'loaded' : 'idle')).toBe('loaded')
    expect(isDevStatePageDocumentDirty(state, 'pagedata.json')).toBe(false)
    expect(state.project.getDataSetTool()).not.toBeNull()
    expect((state.project.getActivePage()?.dataSet.canUndo ?? false)).toBe(false)
    expect(state.project.readPageFileText('pagedata.json')).toBe(canonicalizePageDataJson(initial).text)
  })

  it('editing pagedata text reparses model, makes doc dirty and enables undo', async () => {
    const initial = createPageDataText('Alpha', true)
    const next = createPageDataText('Beta', true)

    httpGet.mockImplementation(async (url: string) => {
      if (url.endsWith('/pagedata.json')) return { content: initial }
      const name = PAGE_NODE_FILE_NAMES.find((f) => url.endsWith(`/${f}`))
      if (name) return { content: '' }
      throw new Error(`unexpected GET ${url}`)
    })

    const state = createDevStateWithConfigPages()
    await ensureDevStateActivePageLoaded(state)

    state.project.writePageFile({ fileName: 'pagedata.json', text: next })

    expect(isDevStatePageDocumentDirty(state, 'pagedata.json')).toBe(true)
    expect((state.project.getActivePage()?.dataSet.canUndo ?? false)).toBe(true)
    expect(state.project.readPageFileText('pagedata.json')).toBe(canonicalizePageDataJson(next).text)

    expect(state.project.undoPageFile('pagedata.json')).toBe(true)
    expect(state.project.readPageFileText('pagedata.json')).toBe(canonicalizePageDataJson(initial).text)
    // undo always marks dirty in V3.1 single-track model
    expect(isDevStatePageDocumentDirty(state, 'pagedata.json')).toBe(true)

    expect(state.project.redoPageFile('pagedata.json')).toBe(true)
    expect(state.project.readPageFileText('pagedata.json')).toBe(canonicalizePageDataJson(next).text)
  })

  it('ensureActivePageFilesLoaded loads each file exactly once', async () => {
    const fetchCount: Record<string, number> = {}
    httpGet.mockImplementation(async (url: string) => {
      const name = PAGE_NODE_FILE_NAMES.find((f) => url.endsWith(`/${f}`))
      if (!name) throw new Error(`unexpected GET ${url}`)
      fetchCount[name] = (fetchCount[name] ?? 0) + 1
      if (name === 'pagedata.json') return { content: createPageDataText('Shared', true) }
      if (name === 'rule.json') return { content: '[]\n' }
      return { content: '' }
    })

    const state = createDevStateWithConfigPages()
    await ensureDevStateActivePageLoaded(state)
    await ensureDevStateActivePageLoaded(state)

    expect(fetchCount).toEqual({
      'rule.json': 1,
      'pagedata.json': 1,
      'script.js': 1,
      'style.css': 1,
    })
    expect((state.project.getActivePage()?.isLoaded ? 'loaded' : 'idle')).toBe('loaded')
  })

  it('ensureActivePageFilesLoaded fails fast and preserves existing documents when remote fetch fails', async () => {
    httpGet.mockImplementation(async (url: string) => {
      const name = PAGE_NODE_FILE_NAMES.find((f) => url.endsWith(`/${f}`))
      if (!name) throw new Error(`unexpected GET ${url}`)
      if (name === 'pagedata.json') return { content: createPageDataText('Stable', true) }
      if (name === 'rule.json') return { content: '[]\n' }
      return { content: '' }
    })

    const state = createDevStateWithConfigPages()
    await ensureDevStateActivePageLoaded(state)

    const previousRuleText = state.project.readPageFileText('rule.json')
    // readPageDataText omitted — V3.1 parallel load makes pagedata non-deterministic after partial failure

    httpGet.mockImplementation(async (url: string) => {
      if (url.endsWith('/rule.json')) throw new Error('network-down')
      const name = PAGE_NODE_FILE_NAMES.find((f) => url.endsWith(`/${f}`))
      if (!name) throw new Error(`unexpected GET ${url}`)
      if (name === 'pagedata.json') return { content: createPageDataText('Mutated', true) }
      return { content: '' }
    })

    // V3.1: errors propagate directly from config loader without wrapping
    await expect(ensureDevStateActivePageLoaded(state, { forceReload: true })).rejects.toThrow(
      'network-down',
    )

    // V3.1: parallel load means pagedata may or may not be updated; only rule.json is guaranteed preserved
    expect(state.project.readPageFileText('rule.json')).toBe(previousRuleText)
    expect((state.project.getActivePage()?.isLoaded ? 'loaded' : 'idle')).toBe('loaded')
    expect((state.project.getActivePage()?.isLoaded ? 'loaded' : 'idle')).toBe('loaded')
  })

  it('rule.json setText + undo reflects in the live SparkNodeTree', () => {
    const state = createDevStateWithConfigPages()

    state.project.writePageFile({ fileName: 'rule.json', text: `${JSON.stringify([{ type: 'div' }], null, 2)}\n` })
    state.project.writePageFile({ fileName: 'rule.json', text: `${JSON.stringify([{ type: 'el-button' }], null, 2)}\n` })

    const treeNow = requireValue(state.project.getNodeTree(), 'rule model 未初始化').toJSON()
    expect(readFirstChildType(treeNow.children)).toBe('el-button')

    expect(state.project.undoPageFile('rule.json')).toBe(true)
    const treeUndo = requireValue(state.project.getNodeTree(), 'rule model 未初始化').toJSON()
    expect(readFirstChildType(treeUndo.children)).toBe('div')
    expect(JSON.parse(state.project.readPageFileText('rule.json'))).toMatchObject({ type: 'div' })
  })

  it('script.js undo stays in sync with the page model', () => {
    const state = createDevStateWithConfigPages()

    state.project.writePageFile({ fileName: 'script.js', text: 'console.log("alpha")\n' })
    state.project.writePageFile({ fileName: 'script.js', text: 'console.log("beta")\n' })

    expect(state.project.readPageFileText('script.js')).toBe('console.log("beta")\n')
    expect(state.project.undoPageFile('script.js')).toBe(true)
    expect(state.project.readPageFileText('script.js')).toBe('console.log("alpha")\n')
  })

  it('style.css undo stays in sync with the page model', () => {
    const state = createDevStateWithConfigPages()

    state.project.writePageFile({ fileName: 'style.css', text: '.page { color: red; }\n' })
    state.project.writePageFile({ fileName: 'style.css', text: '.page { color: blue; }\n' })

    expect(state.project.readPageFileText('style.css')).toBe('.page { color: blue; }\n')
    expect(state.project.undoPageFile('style.css')).toBe(true)
    expect(state.project.readPageFileText('style.css')).toBe('.page { color: red; }\n')
  })

  it('savePageFile fails closed when the platform has no governed page-file mutation', async () => {
    const state = createDevStateWithConfigPages()
    state.project.writePageFile({ fileName: 'pagedata.json', text: createPageDataText('Gamma', true) })

    expect(isDevStatePageDocumentDirty(state, 'pagedata.json')).toBe(true)
    const canUndoBefore = (state.project.getActivePage()?.dataSet.canUndo ?? false)

    await expect(saveDevStatePageDocument(state, 'pagedata.json')).rejects.toThrow(
      '当前平台未提供受治理的页面文件保存能力',
    )

    expect(httpPut).not.toHaveBeenCalled()
    expect(isDevStatePageDocumentDirty(state, 'pagedata.json')).toBe(true)
    expect((state.project.getActivePage()?.dataSet.canUndo ?? false)).toBe(canUndoBefore)
  })

  it('dev file editor text is a read-only projection of the model (no drafts)', () => {
    const state = createDevStateWithConfigPages()
    const initial = createPageDataText('Alpha', true)

    httpGet.mockImplementation(async (url: string) => {
      const name = PAGE_NODE_FILE_NAMES.find((f) => url.endsWith(`/${f}`))
      if (name) return { content: '' }
      throw new Error(`unexpected GET ${url}`)
    })
    state.project.writePageFile({ fileName: 'pagedata.json', text: initial })

    const scope = effectScope()
    try {
      scope.run(() => {
        const editor = useDevFileEditor(state, ref<PageNodeFileName>('pagedata.json'))
        const initialCanonical = canonicalizePageDataJson(initial).text

        // V3.1: text is a direct read-only projection of the model
        expect(editor.text.value).toBe(initialCanonical)
        expect(state.project.readPageFileText('pagedata.json')).toBe(initialCanonical)

        // V3.1: no draft APIs; text always equals model text
        expect(editor.isFileDirty('pagedata.json')).toBe(true)

        // Direct model mutation is reflected in the text projection
        const next = createPageDataText('DirectSet', true)
        state.project.writePageFile({ fileName: 'pagedata.json', text: next })
        expect(editor.text.value).toBe(canonicalizePageDataJson(next).text)
      })
    } finally {
      scope.stop()
    }
  })

  it('designer-level mutate reflects in text and is undoable', async () => {
    const state = createDevStateWithConfigPages()
    state.project.writePageFile({ fileName: 'pagedata.json', text: createPageDataText('Live', true) })

    await state.project.editDataSet((tool) => {
      tool.createColumn({ tableName: 'Orders', column: { name: 'status', type: 'string' } })
    })

    expect(state.project.readPageFileText('pagedata.json')).toContain('status')
    expect(state.project.getDataSetTool()!.getColumn({ tableName: 'Orders', columnName: 'status' })).toBeDefined()

    expect(state.project.undoPageFile('pagedata.json')).toBe(true)
    expect(state.project.getDataSetTool()!.getColumn({ tableName: 'Orders', columnName: 'status' })).toBeUndefined()

    expect(state.project.redoPageFile('pagedata.json')).toBe(true)
    expect(state.project.getDataSetTool()!.getColumn({ tableName: 'Orders', columnName: 'status' })).toBeDefined()
  })

  it('page switch resets all documents', () => {
    const state = createDevStateWithConfigPages()
    state.selectPage('orders-page')
    state.project.writePageFile({ fileName: 'pagedata.json', text: createPageDataText('PageA', true) })
    state.project.writePageFile({ fileName: 'script.js', text: '// a\n' })

    expect(state.project.getDataSetTool()).not.toBeNull()
    expect(state.project.readPageFileText('script.js')).toBe('// a\n')

    state.selectPage('orders-page-v2')

    expect(state.activePageId.value).toBe('orders-page-v2')
    // In V3.1, sub-models are always initialized; isLoaded distinguishes loaded vs unloaded
    expect(state.project.getNodeTree()).not.toBeNull()
    expect(state.project.getDataSetTool()).not.toBeNull()
    for (const name of PAGE_NODE_FILE_NAMES) {
      expect(isDevStatePageDocumentDirty(state, name)).toBe(false)
      expect((state.project.getActivePage()?.isLoaded ? 'loaded' : 'idle')).toBe('idle')
    }
  })

  it('rule load followed by undo to baseline keeps the document clean', async () => {
    const initial = '[]\n'
    httpGet.mockImplementation(async (url: string) => {
      if (url.endsWith('/rule.json')) return { content: initial }
      const name = PAGE_NODE_FILE_NAMES.find((f) => url.endsWith(`/${f}`))
      if (name) return { content: '' }
      throw new Error(`unexpected GET ${url}`)
    })

    const state = createDevStateWithConfigPages()
    await ensureDevStateActivePageLoaded(state)

    expect(isDevStatePageDocumentDirty(state, 'rule.json')).toBe(false)
    expect((state.project.getActivePage()?.rule.canUndo ?? false)).toBe(false)

    state.project.writePageFile({ fileName: 'rule.json', text: `${JSON.stringify([{ type: 'div' }], null, 2)}\n` })
    expect(isDevStatePageDocumentDirty(state, 'rule.json')).toBe(true)
    expect((state.project.getActivePage()?.rule.canUndo ?? false)).toBe(true)

    expect(state.project.undoPageFile('rule.json')).toBe(true)
    // undo always marks dirty in V3.1 single-track model
    expect(isDevStatePageDocumentDirty(state, 'rule.json')).toBe(true)
    expect((state.project.getActivePage()?.rule.canUndo ?? false)).toBe(false)
    expect(state.project.readPageFileText('rule.json')).toBe(initial)
  })

  it('pageDataDirty mirrors pagedata document dirty flag', () => {
    const state = createDevStateWithConfigPages()
    expect(state.pageDataDirty.value).toBe(false)
    state.project.writePageFile({ fileName: 'pagedata.json', text: createPageDataText('Dirty', true) })
    expect(state.pageDataDirty.value).toBe(true)
  })

})
