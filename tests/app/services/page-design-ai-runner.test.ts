import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectWorkspace } from '@spark-appworks/spark-project-model'
import type { AiRunAdapterState, AiRunSnapshot } from '@spark-appworks/spark-app'
import type { AiAgentHost, AiAgentTurnCallbacks } from '@spark-appworks/spark-ai/agent'
import { createAiAgentHost } from '@spark-appworks/spark-ai/agent'
import { runPageDesignAiSession } from '@/services/page-design/page-design-ai-runner'

const mocks = vi.hoisted(() => ({
  activatePageDesignAgentWorkflow: vi.fn(async (options: { host: AiAgentHost }) => options.host),
}))

vi.mock('@/services/ai/agent-workflow-bindings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/ai/agent-workflow-bindings')>()
  return {
    ...actual,
    activatePageDesignAgentWorkflow: mocks.activatePageDesignAgentWorkflow,
  }
})

function createEditor(): ProjectWorkspace {
  const editor = new ProjectWorkspace({
    projectId: 'demo',
    pageFiles: { readPageFile: async () => '' },
    blueprint: { loadRoot: async () => ({ nodeId: 'root', parentNodeId: '', projectId: 'demo', kind: 'module', capability: { name: 'Root', description: '需求' }, source: {}, children: [{ nodeId: 'orders', parentNodeId: 'root', projectId: 'demo', kind: 'page', capability: { name: 'Orders', description: '订单页' }, navigation: { title: 'Orders', target: 'cfg:orders', order: 0, publishInMenu: true, showChildren: false, beginGroup: false }, source: { implGate: 'open', upstreamContractsSatisfied: true } }] }) },
  })
  editor.project.replaceBlueprintTree({
    nodeId: 'root', parentNodeId: '', projectId: 'demo', kind: 'module', capability: { name: 'Root', description: '项目需求' }, source: {},
    children: [{ nodeId: 'orders', parentNodeId: 'root', projectId: 'demo', kind: 'page',
      capability: { name: '订单', description: '订单列表页面' },
      navigation: { title: '订单', target: 'cfg:orders', order: 0, publishInMenu: true, showChildren: false, beginGroup: false },
      source: { implGate: 'open', upstreamContractsSatisfied: true } }],
  })
  editor.project.openPageDesign('orders')
  editor.project.setActivePage('orders')
  editor.project.markPageLoadedChanged('orders', true)
  return editor
}

function createAiHost(): AiAgentHost {
  const turnCallbacks: AiAgentTurnCallbacks = {
    executeTurn: async () => ({ text: '', toolCalls: [] }),
    appendMessages: async () => undefined,
  }
  return createAiAgentHost({ turnCallbacks })
}

function emptyAiRunSnapshot(): AiRunSnapshot {
  return {
    trace: {
      streamText: '',
      reasoningText: '',
      isStreaming: false,
      isReasoning: false,
      entries: [],
      toolCalls: [],
    },
    agUiEvents: [],
    timeline: [],
  }
}

function createAdapter(run: AiRunAdapterState['run']): AiRunAdapterState {
  return {
    isRunning: vi.fn(() => false),
    abort: vi.fn(),
    snapshot: vi.fn(emptyAiRunSnapshot),
    subscribe: vi.fn(() => () => {}),
    run,
  }
}

describe('runPageDesignAiSession delivery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps dirty page files unsaved by default', async () => {
    const editor = createEditor()
    const saveDirtyPageFiles = vi.spyOn(editor, 'saveDirtyPageFiles').mockResolvedValue()
    const adapter = createAdapter(vi.fn(async () => {
      editor.project.writePageFile({ fileName: 'script.js', text: 'export default {}' })
      return 'completed' as const
    }))

    const result = await runPageDesignAiSession({
      pageId: 'orders',
      description: '生成订单页',
      editor,
      adapter,
    })

    expect(saveDirtyPageFiles).not.toHaveBeenCalled()
    expect(result.dirtyFileNames).toEqual(['script.js'])
    expect(result.savedDirtyFileNames).toEqual([])
  })

  it('saves dirty page files when saveDirtyFilesAfterRun is true', async () => {
    const editor = createEditor()
    const savePageFile = vi.spyOn(editor, 'savePageFile').mockResolvedValue()
    const adapter = createAdapter(vi.fn(async () => {
      editor.project.writePageFile({ fileName: 'script.js', text: 'export default {}' })
      return 'completed' as const
    }))

    const result = await runPageDesignAiSession({
      pageId: 'orders',
      description: '生成订单页',
      editor,
      adapter,
      saveDirtyFilesAfterRun: true,
    })

    expect(savePageFile).toHaveBeenCalledOnce()
    expect(savePageFile).toHaveBeenCalledWith('script.js')
    expect(result.savedDirtyFileNames).toEqual(['script.js'])
  })

  it('keeps dirty state for manual inspection when the inline run fails', async () => {
    const editor = createEditor()
    const saveDirtyPageFiles = vi.spyOn(editor, 'saveDirtyPageFiles').mockResolvedValue()
    const adapter = createAdapter(vi.fn(async () => {
      editor.project.writePageFile({ fileName: 'script.js', text: 'export default {}' })
      throw new Error('run failed')
    }))

    await expect(runPageDesignAiSession({
      pageId: 'orders',
      description: '生成订单页',
      editor,
      adapter,
    })).rejects.toThrow(/run failed/u)

    expect(saveDirtyPageFiles).not.toHaveBeenCalled()
    expect(Array.from(editor.project.readDirtyProjection().dirtyFiles)).toEqual(['script.js'])
  })
})
