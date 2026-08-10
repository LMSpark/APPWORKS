import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectWorkspace } from '@spark-appworks/spark-project-model'
import {
  createAiAgentHost,
  type AiAgentHost,
  type AiAgentTurnCallbacks,
} from '@spark-appworks/spark-ai/agent'
import type { SparkCapabilityConsumer } from '@spark-appworks/spark-utils'
import type { AiRunAdapterState, AiRunSnapshot } from '@spark-appworks/spark-app'
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
    blueprint: { loadRoot: async () => ({ children: [] }) },
  })
  editor.project.replaceBlueprintTree({
    id: 'root',
    title: 'Root',
    nodeKind: 'module',
    childPlacement: 'header',
    description: '项目需求',
    children: [
      {
        id: 'orders',
        title: '订单',
        nodeKind: 'page',
        path: '/orders',
        description: '订单列表页面',
        implGate: 'open',
      },
    ],
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

function createCapabilityConsumer(host: AiAgentHost): SparkCapabilityConsumer {
  return name => name.read(host)
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
      consumeCapability: createCapabilityConsumer(createAiHost()),
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
      consumeCapability: createCapabilityConsumer(createAiHost()),
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
      consumeCapability: createCapabilityConsumer(createAiHost()),
      adapter,
    })).rejects.toThrow(/run failed/u)

    expect(saveDirtyPageFiles).not.toHaveBeenCalled()
    expect(Array.from(editor.project.readDirtyProjection().dirtyFiles)).toEqual(['script.js'])
  })
})
