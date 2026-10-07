import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectWorkspace, type PageToolFileName } from '@spark-appworks/spark-project-model'
import { AiAgentRegistration, createAiAgentHost, createSimpleInputContract, DefaultAiAgentSessionStore, AiAgentToolResult } from '@spark-appworks/spark-ai/agent'
import type {
  AiAgentHost,
  AiAgentHostDryRunResult,
  AiAgentHostRunResult,
} from '@spark-appworks/spark-ai/agent'
import type { JsonParams } from '@spark-appworks/spark-json-document'
import { createPageDesignInlineDeliveryPort, preparePageDesignAgentRun } from '@/services/page-design/page-design-agent-run-provider'
import type { AiAgentRunTarget } from '@/services/ai/ai-agent-run'
import type { ActivatePageDesignAgentWorkflowOptions } from '@/services/ai/agent-workflow-bindings'
import { readAiDeliveryErrorExtras } from '@/services/ai/ai-delivery-port'
import { resolvePageDesignProject } from '@/services/page-design/page-design-agent-workflow-binding'
import { readPageDesignRunContext } from '@/services/page-design/page-design-gates'

type PageDesignTestActivationOptions = Pick<ActivatePageDesignAgentWorkflowOptions, 'host' | 'getPageDesignEditor'>
type PageDesignTestActivation = (options: PageDesignTestActivationOptions) => Promise<AiAgentRunTarget>

const mocks = vi.hoisted(() => {
  const createHeadlessPageDesignEditor = vi.fn()
  const delegateHost = {
    has: vi.fn(() => true),
    dryRun: vi.fn(),
    run: vi.fn(),
  }
  return {
    createHeadlessPageDesignEditor,
    delegateHost,
    activatePageDesignAgentWorkflow: vi.fn<PageDesignTestActivation>(async () => delegateHost),
  }
})

vi.mock('@/services/page-design/page-design-headless', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/page-design/page-design-headless')>()
  return {
    ...actual,
    createHeadlessPageDesignEditor: mocks.createHeadlessPageDesignEditor,
  }
})

vi.mock('@/services/ai/agent-workflow-bindings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/ai/agent-workflow-bindings')>()
  return {
    ...actual,
    activatePageDesignAgentWorkflow: mocks.activatePageDesignAgentWorkflow,
  }
})

function createEditor(dirtyFileNames: readonly PageToolFileName[] = ['rule.json']): ProjectWorkspace {
  const editor = new ProjectWorkspace({
    projectId: 'demo',
    pageFiles: { readPageFile: async () => '' },
    blueprint: { loadRoot: async () => ({ nodeId: 'root', parentNodeId: '', projectId: 'demo', kind: 'module', capability: { name: 'Root', description: '需求' }, source: {}, children: [{ nodeId: 'orders', parentNodeId: 'root', projectId: 'demo', kind: 'page', capability: { name: 'Orders', description: '订单页' }, navigation: { title: 'Orders', target: 'cfg:orders', order: 0, publishInMenu: true, showChildren: false, beginGroup: false }, source: { implGate: 'open', upstreamContractsSatisfied: true } }] }) },
  })
  editor.project.openPageDesign('orders')
  editor.project.setActivePage('orders')
  vi.spyOn(editor, 'selectPage').mockResolvedValue()
  vi.spyOn(editor, 'savePageFile').mockResolvedValue()
  vi.spyOn(editor.project, 'readDirtyProjection').mockReturnValue({
    dirtyFiles: new Set(dirtyFileNames),
    hasAnyFileDirty: dirtyFileNames.length > 0,
    blueprintDirty: false,
    hasAnyDirty: dirtyFileNames.length > 0,
  })
  return editor
}

function createRunResult(): AiAgentHostRunResult {
  return {
    task: { toChatRequest: () => ({ messages: [] }) } as never,
    session: {
      sessionId: 'session-1',
      scope: {
        businessRegistrationId: 'pageDesign',
        businessInstanceId: 'orders',
      },
    } as never,
  }
}

function createDryRunResult(): AiAgentHostDryRunResult {
  return {
    ok: true,
    alias: 'pageDesign',
    moduleId: 'pageDesign',
    normalizedInput: {},
    scope: {} as never,
    orchestration: { userMessage: '需求', systemPrompt: '' },
    orchestrationSummary: { userMessageLength: 2, systemPromptLength: 0, readonlyStepCount: 0 },
    tools: [],
    inspectReport: {} as never,
    diagnostics: [],
  }
}

describe('pageDesign actual working-file delivery', () => {
  it.each(['script.js', 'style.css'] as const)('preserves successful receipts when %s fails', async (failedName) => {
    const remoteFiles = new Map<string, string>()
    const editor = new ProjectWorkspace({ projectId: 'demo',
      pageFiles: { readPageFile: async () => '', saveFileContent: async (_pageId, fileName, text) => {
        if (fileName === failedName) throw new Error(`write rejected: ${fileName}`)
        remoteFiles.set(fileName, text)
      } }, blueprint: { loadRoot: async () => ({ nodeId: 'root', parentNodeId: '', projectId: 'demo', kind: 'module', capability: { name: 'Root', description: '需求' }, source: {}, children: [{ nodeId: 'orders', parentNodeId: 'root', projectId: 'demo', kind: 'page', capability: { name: 'Orders', description: '订单页' }, navigation: { title: 'Orders', target: 'cfg:orders', order: 0, publishInMenu: true, showChildren: false, beginGroup: false }, source: { implGate: 'open', upstreamContractsSatisfied: true } }] }) } })
    const page = editor.project.openPageDesign('orders')
    editor.project.setActivePage('orders')
    page.setFileText('script.js', 'script A')
    page.setFileText('style.css', 'style A')
    const result = await createPageDesignInlineDeliveryPort({ autoSave: true }).save({ editor, pageId: 'orders' })

    expect(result).toEqual({ mode: 'auto', status: 'failed', message: `write rejected: ${failedName}`,
      artifacts: ['script.js', 'style.css'].map(name => ({ kind: 'page-file', name,
        status: name === failedName ? 'dirty' : 'saved' })) })
    expect(Array.from(editor.project.readDirtyProjection().dirtyFiles)).toEqual([failedName])
    expect(remoteFiles.size).toBe(1)
  })

  it('waits for a successful file after another fails and retains edits made during its save', async () => {
    let finishSave: () => void = () => { throw new Error('save has not started') }
    const saved: string[] = []
    const editor = new ProjectWorkspace({ projectId: 'demo', pageFiles: { readPageFile: async () => '',
      saveFileContent: async (_pageId, fileName, text) => {
        if (fileName === 'style.css') throw new Error('style rejected')
        saved.push(text)
        await new Promise<void>((resolve) => { finishSave = resolve })
      } }, blueprint: { loadRoot: async () => ({ nodeId: 'root', parentNodeId: '', projectId: 'demo', kind: 'module', capability: { name: 'Root', description: '需求' }, source: {}, children: [{ nodeId: 'orders', parentNodeId: 'root', projectId: 'demo', kind: 'page', capability: { name: 'Orders', description: '订单页' }, navigation: { title: 'Orders', target: 'cfg:orders', order: 0, publishInMenu: true, showChildren: false, beginGroup: false }, source: { implGate: 'open', upstreamContractsSatisfied: true } }] }) } })
    const page = editor.project.openPageDesign('orders')
    editor.project.setActivePage('orders')
    page.setFileText('script.js', 'script A')
    page.setFileText('style.css', 'style A')
    const saving = createPageDesignInlineDeliveryPort({ autoSave: true }).save({ editor, pageId: 'orders' })
    let settled = false
    void saving.then(() => { settled = true })
    await new Promise<void>((resolve) => { setTimeout(resolve, 0) })
    const settledBeforeCompletion = settled
    page.setFileText('script.js', 'script B')
    finishSave()
    const result = await saving

    expect(settledBeforeCompletion).toBe(false)
    expect(result.artifacts).toEqual([{ kind: 'page-file', name: 'script.js', status: 'saved' },
      { kind: 'page-file', name: 'style.css', status: 'dirty' }])
    expect(saved).toEqual(['script A'])
    expect(page.script.text).toBe('script B')
    expect(page.script.isDirty).toBe(true)
  })
})

describe('preparePageDesignAgentRun', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.delegateHost.has.mockReturnValue(true)
    mocks.delegateHost.dryRun.mockReturnValue(createDryRunResult())
    mocks.delegateHost.run.mockResolvedValue(createRunResult())
  })

  it('keeps confirmed page writes when scenario save fails and reports the remaining scene dirty', async () => {
    let remote = JSON.stringify({ scenarioId: 'SCENE-A', tables: {} })
    const editor = new ProjectWorkspace({ projectId: 'demo',
      pageFiles: { readPageFile: async () => '', saveFileContent: async () => {} },
      blueprint: { loadRoot: async () => ({ nodeId: 'root', parentNodeId: '', projectId: 'demo', kind: 'module', capability: { name: 'Root' }, source: {}, children: [] }) },
      scenarioViews: { readScope: () => 'tenant-A', readText: async () => remote,
        writeText: async (_id, text) => { remote = text; throw new Error('scene write unconfirmed') } },
    })
    await editor.selectPage('orders')
    const scene = await editor.loadScenarioViews({ scenarioId: 'SCENE-A' })
    scene.setText(JSON.stringify({ scenarioId: 'SCENE-A', tables: {} }, null, 2))
    editor.project.writePageFile({ fileName: 'script.js', text: 'script A' })
    const result = await createPageDesignInlineDeliveryPort({ autoSave: true }).save({ editor, pageId: 'orders', requestId: 'A', scenarioId: 'SCENE-A' })
    expect(result.status).toBe('failed')
    expect(result.artifacts).toEqual([{ kind: 'page-file', name: 'script.js', status: 'saved' }, { kind: 'scenario-view', name: 'SCENE-A', status: 'dirty' }])
    expect(scene.isDirty).toBe(true)
    expect(editor.project.getActivePage()?.script.isDirty).toBe(false)
  })

  it('confirms explicit scenario delivery by real Workspace preimage and byte readback', async () => {
    let remote = JSON.stringify({ scenarioId: 'SCENE-A', tables: {} })
    const writes: string[] = []
    const editor = new ProjectWorkspace({ projectId: 'demo', pageFiles: { readPageFile: async () => '' },
      blueprint: { loadRoot: async () => ({ nodeId: 'root', parentNodeId: '', projectId: 'demo', kind: 'module', capability: { name: 'Root' }, source: {}, children: [] }) },
      scenarioViews: { readScope: () => 'tenant-A', readText: async () => remote,
        writeText: async (_id, text) => { writes.push(text); remote = text } },
    })
    await editor.selectPage('orders')
    const scene = await editor.loadScenarioViews({ scenarioId: 'SCENE-A' })
    scene.setText(JSON.stringify({ scenarioId: 'SCENE-A', tables: {} }, null, 2))
    const submitted = scene.getText()
    const result = await createPageDesignInlineDeliveryPort({ autoSave: true }).save({ editor, pageId: 'orders', scenarioId: 'SCENE-A' })
    expect(result).toEqual({ mode: 'auto', status: 'saved', artifacts: [{ kind: 'scenario-view', name: 'SCENE-A', status: 'saved' }] })
    expect(writes).toEqual([submitted])
    expect(remote).toBe(submitted)
    expect(scene.isDirty).toBe(false)
  })

  it('isolates real Host.ensure factories, same-page editors, request contexts and A/B release', async () => {
    const editorA = createEditor(['script.js'])
    const editorB = createEditor(['style.css'])
    mocks.createHeadlessPageDesignEditor.mockReturnValueOnce(editorA).mockReturnValueOnce(editorB)
    const getters: Array<(id: string) => ProjectWorkspace> = []
    const factoryCalls: string[] = []
    const hosts: AiAgentHost[] = []
    let releaseA = () => {}
    let releaseB = () => {}
    const doneA = new Promise<void>(resolve => { releaseA = resolve })
    const doneB = new Promise<void>(resolve => { releaseB = resolve })
    const activation: PageDesignTestActivation = async options => {
      const index = hosts.length
      hosts.push(options.host)
      getters.push(id => options.getPageDesignEditor({ moduleInstanceId: id }))
      const registered = options.host.ensure('pageDesign', { moduleId: 'pageDesign', create: () => {
        factoryCalls.push(index === 0 ? 'A' : 'B')
        return new AiAgentRegistration({ moduleId: 'pageDesign', name: 'Page Design', description: 'test request owner',
          runtime: { getTools: () => [], executeTool: async () => AiAgentToolResult.ok({}),
            projectKnowledge: () => ({ promptSnapshot: '' }), inspect: () => ({ status: 'ok', rootKinds: ['ProjectWorkspace'], moduleCount: 1, findings: [] }) },
          inputContract: createSimpleInputContract({ businessId: 'pageDesign', identityField: 'requestId', messageField: 'description',
            paramsSchema: { type: 'object', properties: { requestId: { type: 'string' }, pageId: { type: 'string' }, description: { type: 'string' } }, required: ['requestId', 'pageId', 'description'], additionalProperties: true }, systemPrompt: '' }),
          sessionStore: new DefaultAiAgentSessionStore(),
        })
      } })
      return { has: (alias: string) => registered.has(alias), dryRun: (alias: string, args: unknown) => registered.dryRun(alias, args),
        run: async (_alias: string, input: JsonParams) => {
          const requestId = input['requestId']
          if (typeof requestId !== 'string') throw new Error('requestId missing')
          const editor = resolvePageDesignProject(options, { moduleId: 'pageDesign', moduleInstanceId: requestId, instanceId: requestId })
          expect(editor).toBe(index === 0 ? editorA : editorB)
          await (index === 0 ? doneA : doneB)
          expect(resolvePageDesignProject(options, { moduleId: 'pageDesign', moduleInstanceId: requestId, instanceId: requestId })).toBe(editor)
          return createRunResult()
        },
      }
    }
    mocks.activatePageDesignAgentWorkflow.mockImplementationOnce(activation).mockImplementationOnce(activation)
    const sharedHost = createAiAgentHost({ turnCallbacks: { executeTurn: async () => ({ text: '', toolCalls: [] }), appendMessages: async () => {} } })
    const a = await preparePageDesignAgentRun({ requestId: 'A', alias: 'pageDesign', args: { pageId: 'orders', description: 'A' } }, sharedHost)
    const b = await preparePageDesignAgentRun({ requestId: 'B', alias: 'pageDesign', args: { pageId: 'orders', description: 'B' } }, sharedHost)
    expect(hosts[0]).not.toBe(hosts[1])
    expect(hosts.every(host => host !== sharedHost)).toBe(true)
    expect(factoryCalls).toEqual(['A', 'B'])
    const runA = a.run('pageDesign', {})
    const runB = b.run('pageDesign', {})
    expect(readPageDesignRunContext('A')?.pageId).toBe('orders')
    expect(readPageDesignRunContext('B')?.pageId).toBe('orders')
    await expect(a.run('pageDesign', {})).rejects.toThrow('PAGE_DESIGN_REQUEST_RUNNING')
    releaseA()
    expect((await runA).resultExtras?.['pageDesign']).toEqual({ requestId: 'A', pageId: 'orders' })
    expect(readPageDesignRunContext('A')).toBeUndefined()
    expect(() => getters[0]?.('A')).toThrow('not prepared')
    expect(getters[1]?.('B')).toBe(editorB)
    expect(readPageDesignRunContext('B')?.pageId).toBe('orders')
    expect(editorB.savePageFile).not.toHaveBeenCalled()
    releaseB()
    expect((await runB).resultExtras?.['pageDesign']).toEqual({ requestId: 'B', pageId: 'orders' })
    expect(editorA.savePageFile).toHaveBeenCalledExactlyOnceWith('script.js')
    expect(editorB.savePageFile).toHaveBeenCalledExactlyOnceWith('style.css')
    expect(readPageDesignRunContext('B')).toBeUndefined()
    expect(() => getters[1]?.('B')).toThrow('not prepared')
  })

  it('saves dirty page files and returns delivery artifacts after Agent Run succeeds', async () => {
    const editor = createEditor(['rule.json', 'script.js'])
    mocks.createHeadlessPageDesignEditor.mockReturnValue(editor)

    const host = await preparePageDesignAgentRun({
      requestId: 'request-1',
      alias: 'pageDesign',
      args: { pageId: 'orders', description: '生成订单页' },
    }, {} as AiAgentHost)

    const result = await host.run('pageDesign', {} as JsonParams)

    expect(editor.selectPage).toHaveBeenCalledWith('orders', { forceReload: true })
    expect(editor.savePageFile).toHaveBeenCalledTimes(2)
    expect(editor.savePageFile).toHaveBeenCalledWith('rule.json')
    expect(editor.savePageFile).toHaveBeenCalledWith('script.js')
    expect(result.resultExtras?.['delivery']).toEqual({
      requestId: 'request-1', pageId: 'orders',
      mode: 'auto',
      status: 'saved',
      artifacts: [
        { kind: 'page-file', name: 'rule.json', status: 'saved' },
        { kind: 'page-file', name: 'script.js', status: 'saved' },
      ],
    })
  })

  it.each([[], ['unknown.json'], ['script.js', 'unknown.json'], [17], ['script.js', null],
    null, 'script.js', { file: 'script.js' }].map(value => ({ value })))('rejects invalid save scope $value before running or writing', async ({ value }) => {
    const editor = createEditor(['rule.json', 'script.js'])
    mocks.createHeadlessPageDesignEditor.mockReturnValue(editor)
    const host = await preparePageDesignAgentRun({ requestId: 'invalid-scope', alias: 'pageDesign',
      args: { pageId: 'orders' } }, {} as AiAgentHost)
    await expect(host.run('pageDesign', { deliverySaveFileNames: value })).rejects.toThrow('PAGE_DESIGN_SAVE_SCOPE_INVALID')
    expect(mocks.delegateHost.run).not.toHaveBeenCalled()
    expect(editor.savePageFile).not.toHaveBeenCalled()
    expect(readPageDesignRunContext('orders')).toBeUndefined()
  })

  it('saves only explicitly selected dirty files for a valid scope', async () => {
    const editor = createEditor(['rule.json', 'script.js'])
    mocks.createHeadlessPageDesignEditor.mockReturnValue(editor)
    const host = await preparePageDesignAgentRun({ requestId: 'valid-scope', alias: 'pageDesign',
      args: { pageId: 'orders' } }, {} as AiAgentHost)
    const result = await host.run('pageDesign', { deliverySaveFileNames: ['script.js'] })
    expect(editor.savePageFile).toHaveBeenCalledExactlyOnceWith('script.js')
    expect(result.resultExtras?.['delivery']).toMatchObject({ status: 'saved',
      artifacts: [{ kind: 'page-file', name: 'script.js', status: 'saved' }] })
  })

  it('rejects an explicit empty inline delivery scope without writing', async () => {
    const editor = createEditor(['rule.json', 'script.js'])
    const port = createPageDesignInlineDeliveryPort({ autoSave: true, saveFileNames: [] })
    await expect(port.save({ editor, pageId: 'orders' })).rejects.toThrow('PAGE_DESIGN_SAVE_SCOPE_INVALID')
    expect(editor.savePageFile).not.toHaveBeenCalled()
  })

  it('does not save and reports dirty artifacts when Agent Run fails', async () => {
    const editor = createEditor(['rule.json'])
    mocks.createHeadlessPageDesignEditor.mockReturnValue(editor)
    mocks.delegateHost.run.mockRejectedValueOnce(new Error('run failed'))

    const host = await preparePageDesignAgentRun({
      requestId: 'request-2',
      alias: 'pageDesign',
      args: { pageId: 'orders', description: '生成订单页' },
    }, {} as AiAgentHost)

    let thrown: unknown
    try {
      await host.run('pageDesign', {} as JsonParams)
    } catch (error: unknown) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(Error)
    expect(editor.savePageFile).not.toHaveBeenCalled()
    expect(readAiDeliveryErrorExtras(thrown)?.delivery).toMatchObject({
      mode: 'auto',
      status: 'skipped',
      artifacts: [{ kind: 'page-file', name: 'rule.json', status: 'dirty' }],
      message: 'run failed',
    })

    await expect(host.run('pageDesign', {})).rejects.toThrow('PAGE_DESIGN_REQUEST_RELEASED')
  })

  it('retains actual edits and the original error without claiming a rollback', async () => {
    const writes: string[] = []
    const editor = new ProjectWorkspace({ projectId: 'demo', pageFiles: {
      readPageFile: async ({ fileName }) => fileName === 'script.js' ? 'script A' : '',
      saveFileContent: async (_pageId, _fileName, text) => { writes.push(text) },
    }, blueprint: { loadRoot: async () => ({ nodeId: 'root', parentNodeId: '', projectId: 'demo', kind: 'module', capability: { name: 'Root', description: '需求' }, source: {}, children: [{ nodeId: 'orders', parentNodeId: 'root', projectId: 'demo', kind: 'page', capability: { name: 'Orders', description: '订单页' }, navigation: { title: 'Orders', target: 'cfg:orders', order: 0, publishInMenu: true, showChildren: false, beginGroup: false }, source: { implGate: 'open', upstreamContractsSatisfied: true } }] }) } })
    const failure = new Error('run rejected')
    mocks.createHeadlessPageDesignEditor.mockReturnValue(editor)
    mocks.delegateHost.run.mockImplementationOnce(async () => {
      editor.project.writePageFile({ fileName: 'script.js', text: 'script B' })
      throw failure
    })
    const host = await preparePageDesignAgentRun({ requestId: 'actual-failure', alias: 'pageDesign',
      args: { pageId: 'orders' } }, {} as AiAgentHost)
    let caught: unknown
    try { await host.run('pageDesign', {}) } catch (error: unknown) { caught = error }

    expect(caught).toBe(failure)
    expect(readAiDeliveryErrorExtras(caught)?.delivery).toMatchObject({ mode: 'auto', status: 'skipped',
      artifacts: [{ kind: 'page-file', name: 'script.js', status: 'dirty' }], message: 'run rejected' })
    expect(editor.project.getActivePage()?.script.text).toBe('script B')
    expect(editor.project.getActivePage()?.script.isDirty).toBe(true)
    expect(writes).toEqual([])
  })
})
