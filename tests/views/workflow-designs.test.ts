import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WorkflowDesigns from '@/views/app/WorkflowDesigns.vue'
import type { WorkflowDesignDocument } from '@/services/workflow-designs'

const mocks = vi.hoisted(() => ({
  listWorkflowDesigns: vi.fn(),
  readWorkflowDesign: vi.fn(),
  saveWorkflowDesign: vi.fn(),
  createAgentWorkflowDefinitionFromDesign: vi.fn(),
  parseAgentWorkflowDefinitionJson: vi.fn(),
  publishWorkflowDefinition: vi.fn(),
  readWorkflowDefinition: vi.fn(),
  saveWorkflowDefinition: vi.fn(),
  createWorkflowDesign: vi.fn(),
  deleteWorkflowDesign: vi.fn(),
  message: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
  messageBox: {
    confirm: vi.fn(),
  },
  classModelProvider: {
    query: vi.fn(),
    methodGuide: vi.fn(),
  },
  createWorkerDtsClassModelKnowledgeProvider: vi.fn(),
}))

vi.mock('element-plus', () => ({
  ElMessage: mocks.message,
  ElMessageBox: mocks.messageBox,
}))

vi.mock('@/services/workflow-designs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/workflow-designs')>()
  return {
    ...actual,
    listWorkflowDesigns: mocks.listWorkflowDesigns,
    readWorkflowDesign: mocks.readWorkflowDesign,
    saveWorkflowDesign: mocks.saveWorkflowDesign,
    createAgentWorkflowDefinitionFromDesign: mocks.createAgentWorkflowDefinitionFromDesign,
    parseAgentWorkflowDefinitionJson: mocks.parseAgentWorkflowDefinitionJson,
    publishWorkflowDefinition: mocks.publishWorkflowDefinition,
    readWorkflowDefinition: mocks.readWorkflowDefinition,
    saveWorkflowDefinition: mocks.saveWorkflowDefinition,
    createWorkflowDesign: mocks.createWorkflowDesign,
    deleteWorkflowDesign: mocks.deleteWorkflowDesign,
  }
})

vi.mock('@spark-appworks/spark-ai/class-model', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@spark-appworks/spark-ai/class-model')>()
  return {
    ...actual,
    createWorkerDtsClassModelKnowledgeProvider: mocks.createWorkerDtsClassModelKnowledgeProvider,
  }
})

const ButtonStub = defineComponent({
  props: {
    disabled: Boolean,
  },
  emits: ['click'],
  setup(props, { attrs, emit, slots }) {
    return () => h('button', {
      ...attrs,
      disabled: props.disabled,
      type: 'button',
      onClick: () => emit('click'),
    }, slots['default']?.())
  },
})

const InputStub = defineComponent({
  props: {
    modelValue: {
      type: [String, Number],
      default: '',
    },
    type: String,
  },
  emits: ['update:modelValue', 'input'],
  setup(props, { attrs, emit }) {
    return () => {
      const tag = props.type === 'textarea' ? 'textarea' : 'input'
      return h(tag, {
        ...attrs,
        value: props.modelValue,
        onInput: (event: Event) => {
          const target = event.target as HTMLInputElement | HTMLTextAreaElement
          emit('update:modelValue', target.value)
          emit('input', target.value)
        },
      })
    }
  },
})

const InputNumberStub = defineComponent({
  props: {
    modelValue: {
      type: Number,
      default: 0,
    },
  },
  emits: ['update:modelValue', 'change'],
  setup(props, { attrs, emit }) {
    return () => h('input', {
      ...attrs,
      type: 'number',
      value: props.modelValue,
      onInput: (event: Event) => {
        const target = event.target as HTMLInputElement
        const value = Number(target.value)
        emit('update:modelValue', value)
        emit('change', value)
      },
    })
  },
})

const PassthroughStub = defineComponent({
  setup(_props, { attrs, slots }) {
    return () => h('div', attrs, Object.values(slots).flatMap(slot => slot?.() ?? []))
  },
})

const DescriptionsItemStub = defineComponent({
  props: {
    label: String,
  },
  setup(props, { slots }) {
    return () => h('div', [
      h('span', props.label),
      h('span', slots['default']?.()),
    ])
  },
})

const HandleStub = defineComponent({
  props: {
    id: String,
    type: String,
    position: String,
  },
  setup(props, { attrs, slots }) {
    return () => h('button', {
      ...attrs,
      type: 'button',
      class: ['vue-flow__handle', attrs['class']],
      'data-handle-id': props.id,
      'data-handle-type': props.type,
      'data-handle-position': props.position,
    }, slots['default']?.())
  },
})

const BaseEdgeStub = defineComponent({
  props: {
    id: String,
    path: String,
  },
  setup(props) {
    return () => h('path', {
      class: 'vue-flow__edge-path',
      'data-edge-id': props.id,
      d: props.path,
    })
  },
})

const VueFlowStub = defineComponent({
  props: {
    nodes: {
      type: Array,
      default: () => [],
    },
    edges: {
      type: Array,
      default: () => [],
    },
  },
  emits: ['nodesChange', 'nodeDragStop', 'edgesChange', 'edgeDoubleClick', 'edgeUpdate', 'connect', 'viewportChangeEnd'],
  setup(props, { emit, slots }) {
    const nodeTitle = (node: any) => String(node.data?.title ?? node.id)

    return () => {
      const renderedNodes = props.nodes.map((node: any) => h('div', {
        class: 'vue-flow__node',
        'data-node-id': node.id,
        onClick: () => emit('nodesChange', [{ type: 'select', id: node.id, selected: true }]),
      }, [
        slots['node-workflow']?.({
          data: node.data,
          selected: false,
          id: node.id,
        }),
        h('button', {
          type: 'button',
          class: 'workflow-flow-drag-node',
          title: `移动 ${nodeTitle(node)}`,
          onClick: (event: Event) => {
            event.stopPropagation()
            emit('nodeDragStop', {
              node: {
                ...node,
                position: { x: 70, y: 30 },
              },
              nodes: props.nodes,
            })
          },
        }),
      ]))

      const renderedLines = props.edges.map((line: any) => h('button', {
        type: 'button',
        class: 'vue-flow__line',
        'data-edge-type': line.type,
        'data-source-handle': line.sourceHandle,
        'data-target-handle': line.targetHandle,
        'data-line-type': line.data?.lineType,
        'data-runtime-status': line.data?.runtimeStatus,
        title: `选择连线 ${line.source} -> ${line.target}`,
        onClick: () => emit('edgesChange', [{ type: 'select', id: line.id, selected: true }]),
        onDblclick: () => emit('edgeDoubleClick', { edge: line }),
      }, `${line.source}->${line.target}`))

      const lineUpdateButtons = props.edges.map((line: any) => h('button', {
        type: 'button',
        class: 'workflow-flow-line-update',
        title: `改连线 ${line.source} -> ${line.target} 到 output`,
        onClick: () => emit('edgeUpdate', {
          edge: line,
          connection: {
            source: line.source,
            target: 'output',
            sourceHandle: 'source',
            targetHandle: 'target',
          },
        }),
      }))

      const customEdges = props.edges.flatMap((line: any) => slots['edge-workflow-control']?.({
        id: line.id,
        sourceX: 108,
        sourceY: 118,
        targetX: 388,
        targetY: 0,
        markerEnd: line.markerEnd,
        style: {},
        data: line.data,
      }) ?? [])

      return h('svg', { class: 'vue-flow-stub' }, [
        ...renderedLines,
        ...lineUpdateButtons,
        ...renderedNodes,
        ...customEdges,
      ])
    }
  },
})

function createWorkflowDesignDocument(workflowId = 'agent.workflow.demo'): WorkflowDesignDocument {
  return {
    kind: 'agent.workflow.design',
    version: 1,
    id: workflowId,
    workflow: {
      id: workflowId,
      version: 1,
      variables: [
        { name: 'prompt', title: 'Prompt', jsdoc: 'Prompt variable JSDoc.', required: true, schema: { type: 'string', description: 'Prompt' } },
      ],
      capabilities: [
        {
          id: 'demo.workflow',
          title: 'Demo Workflow',
          scope: 'workflow',
          description: 'Run the demo workflow.',
          constraints: [],
        },
      ],
      runtimeBinding: {
        registration: {
          alias: 'demo',
          moduleId: 'demo',
          businessId: 'demo',
        },
        inputContract: {
          identityField: 'prompt',
          messageField: 'prompt',
          paramsSchema: {
            type: 'object',
            properties: {
              prompt: { type: 'string' },
            },
            required: ['prompt'],
            additionalProperties: false,
          },
          readonlySteps: [],
        },
        systemPrompt: {
          template: 'Demo prompt: {{ prompt }}',
          conditionalHints: [],
        },
        modelProjectionRef: {
          kind: 'dts-class-model',
          rootClassName: 'ProjectModel',
          manifestUrlRef: 'dts-class-model',
        },
        executableRef: {
          kind: 'js-module',
          moduleSpecifier: './project-model.js',
          exportName: 'ProjectModel',
        },
        resolveInstance: {
          editorSource: 'demo',
          identityField: 'prompt',
        },
        beforeFunctionCall: {
          gateRules: [],
        },
        executionToolNames: ['model_script'],
        planWithoutToolMarkers: ['openPageDesign'],
        agentCompleteMethodName: 'completePageDesign',
      },
      graph: {
        nodes: [
          {
            id: 'start',
            type: 'start',
            position: { x: 0, y: 160 },
            data: { type: 'start', title: 'Start' },
          },
          {
            id: 'node.model',
            type: 'node',
            position: { x: 280, y: 160 },
            data: {
              type: 'node',
              title: 'Business Node',
              desc: 'Run model context work',
              models: [
                {
                  id: 'node.model.project',
                  rootClassName: 'ProjectModel',
                  className: 'ProjectModel',
                  sourceRef: '$',
                  completion: {
                    memberName: 'completePageDesign',
                    returnContract: 'boolean-or-reason',
                  },
                },
              ],
              inputs: {
                prompt: 'initial',
              },
              outputs: {
                result: '$.result',
              },
              llm: {
                task: {
                  goal: 'Run page design work.',
                  requirements: {
                    prompt: 'initial',
                  },
                  contextInputs: {},
                },
                knowledge: {
                  rootClassName: 'ProjectModel',
                  className: 'ProjectModel',
                  allowedActions: ['openPageDesign', 'agent_complete'],
                  readableAttributes: ['activePage'],
                },
                functionCalling: {
                  mode: 'freeWithinModelContext',
                  constraints: [],
                },
                output: {
                  structuredResult: {
                    result: '$.result',
                  },
                  handoffToValidation: true,
                },
              },
              validation: {
                action: {
                  className: 'ProjectModel',
                  actionName: 'agent_complete',
                  inputProjection: {
                    summary: '$.result',
                  },
                  expectedResult: {
                    completed: true,
                  },
                },
                status: 'draft',
                issues: [],
              },
              capabilities: [
                {
                  id: 'page-design.execute',
                  title: 'Execute Page Design',
                  scope: 'node',
                  description: 'Let the pageDesign module plan and apply page design changes.',
                  inputs: {
                    prompt: 'initial',
                  },
                  outputs: {
                    result: '$.result',
                  },
                  constraints: [],
                },
              ],
            },
          },
          {
            id: 'output',
            type: 'output',
            position: { x: 560, y: 160 },
            data: {
              type: 'output',
              title: 'Output',
              outputs: {
                result: '{{ node.model.result }}',
              },
              capabilities: [],
            },
          },
        ],
        lines: [
          {
            id: 'line.start.node',
            from: { nodeId: 'start', modelId: '$workflow', memberName: 'prompt' },
            to: { nodeId: 'node.model', modelId: 'node.model.project', memberName: 'prompt' },
          },
          {
            id: 'line.node.output',
            from: { nodeId: 'node.model', modelId: 'node.model.project', memberName: 'result' },
            to: { nodeId: 'output', modelId: '$workflow', memberName: 'result' },
          },
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    },
    x_spark: {
      schema: 'spark.agent.workflow.design.v1',
      designer: { title: 'Demo Workflow', createdBy: 'tester', createdAt: '2026-01-01T00:00:00.000Z' },
      draft: { status: 'draft', dirtyPaths: [] },
      validation: { status: 'unknown', issues: [] },
    },
  }
}

function createDefinition() {
  return {
    kind: 'agent.workflow',
    version: 1,
    workflowId: 'agent.workflow.demo',
    workflow: {
      variables: [],
      capabilities: [],
      graph: {
        nodes: [],
        lines: [],
      },
    },
    x_spark: {
      validation: {
        status: 'valid',
        issues: [],
      },
    },
  }
}

function mountWorkflowDesigns() {
  return mount(WorkflowDesigns, {
    global: {
      mocks: {
        $router: { go: vi.fn() },
      },
      stubs: {
        ElAlert: PassthroughStub,
        ElButton: ButtonStub,
        ElCol: PassthroughStub,
        ElDescriptions: PassthroughStub,
        ElDescriptionsItem: DescriptionsItemStub,
        ElDialog: PassthroughStub,
        ElDrawer: PassthroughStub,
        ElEmpty: true,
        ElForm: PassthroughStub,
        ElFormItem: PassthroughStub,
        ElIcon: PassthroughStub,
        ElInput: InputStub,
        ElInputNumber: InputNumberStub,
        ElPageHeader: PassthroughStub,
        ElRow: PassthroughStub,
        ElSkeleton: true,
        ElTag: PassthroughStub,
        Background: true,
        BaseEdge: BaseEdgeStub,
        Controls: true,
        Handle: HandleStub,
        MiniMap: true,
        VueFlow: VueFlowStub,
      },
    },
  })
}

function findButton(wrapper: ReturnType<typeof mountWorkflowDesigns>, label: string) {
  const button = wrapper.findAll('button').find(item => item.text().includes(label))
  if (button === undefined) throw new Error(`missing button: ${label}`)
  return button
}

describe('WorkflowDesigns visual editor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    mocks.messageBox.confirm.mockResolvedValue(undefined)
    mocks.classModelProvider.query.mockResolvedValue({
      rootKind: 'ProjectModel',
      models: [
        {
          kind: 'ProjectModel',
          name: 'ProjectModel',
          jsdoc: 'ProjectModel full JSDoc.',
          summary: 'ProjectModel summary.',
          constructorSignature: {
            jsdoc: 'ProjectModel constructor JSDoc.',
            summary: 'ProjectModel constructor.',
            signature: 'constructor(options: ProjectModelInitOptions)',
          },
          attributes: [
            {
              name: 'activePage',
              jsdoc: 'Active page JSDoc.',
              summary: 'Active page.',
              typeText: 'ConfigPageNode',
            },
          ],
          methods: [
            {
              name: 'agent_complete',
              jsdoc: 'Agent completion JSDoc.',
              summary: 'Complete the agent run.',
              signature: 'agent_complete(summary: string): boolean',
            },
            {
              name: 'completePageDesign',
              jsdoc: 'Complete page design JSDoc.',
              summary: 'Complete page design.',
              signature: 'completePageDesign(): boolean',
            },
          ],
        },
      ],
    })
    mocks.classModelProvider.methodGuide.mockResolvedValue('Action guide text')
    mocks.createWorkerDtsClassModelKnowledgeProvider.mockReturnValue(mocks.classModelProvider)
    mocks.listWorkflowDesigns.mockResolvedValue([
      {
        workflowId: 'agent.workflow.demo',
        filename: 'design.json',
        timestamp: '1',
        title: 'Demo Workflow',
        version: 1,
        status: 'draft',
      },
    ])
    mocks.readWorkflowDesign.mockResolvedValue({
      workflowId: 'agent.workflow.demo',
      filename: 'design.json',
      timestamp: '1',
      document: createWorkflowDesignDocument(),
    })
    mocks.saveWorkflowDesign.mockResolvedValue({
      ok: true,
      workflowId: 'agent.workflow.demo',
      filename: 'design.json',
      timestamp: '2',
    })
    mocks.createAgentWorkflowDefinitionFromDesign.mockReturnValue(createDefinition())
    mocks.parseAgentWorkflowDefinitionJson.mockReturnValue(createDefinition())
    mocks.publishWorkflowDefinition.mockResolvedValue({
      ok: true,
      workflowId: 'agent.workflow.demo',
      filename: 'definition.json',
      timestamp: '3',
    })
    mocks.readWorkflowDefinition.mockResolvedValue({
      workflowId: 'agent.workflow.demo',
      filename: 'definition.json',
      timestamp: '3',
      definition: createDefinition(),
    })
    mocks.saveWorkflowDefinition.mockResolvedValue({
      ok: true,
      workflowId: 'agent.workflow.demo',
      filename: 'definition.json',
      timestamp: '4',
    })
  })

  it('auto-opens the first readable design and skips unreadable summaries', async () => {
    mocks.listWorkflowDesigns.mockResolvedValueOnce([
      {
        workflowId: 'agent.workflow.legacy',
        filename: 'design.json',
        timestamp: '1',
        title: 'Legacy Workflow',
        version: 1,
        status: 'unreadable',
        error: 'forbidden field: app',
      },
      {
        workflowId: 'agent.workflow.next',
        filename: 'design.json',
        timestamp: '2',
        title: 'Next Workflow',
        version: 1,
        status: 'draft',
      },
    ])
    mocks.readWorkflowDesign.mockResolvedValueOnce({
      workflowId: 'agent.workflow.next',
      filename: 'design.json',
      timestamp: '2',
      document: createWorkflowDesignDocument('agent.workflow.next'),
    })

    const wrapper = mountWorkflowDesigns()
    await flushPromises()

    expect(mocks.readWorkflowDesign).toHaveBeenCalledOnce()
    expect(mocks.readWorkflowDesign).toHaveBeenCalledWith('agent.workflow.next')
    expect(wrapper.text()).toContain('agent.workflow.next')
    expect(mocks.message.warning).not.toHaveBeenCalled()
  })

  it('blocks opening an unreadable design without requesting design.json', async () => {
    mocks.listWorkflowDesigns.mockResolvedValueOnce([
      {
        workflowId: 'agent.workflow.legacy',
        filename: 'design.json',
        timestamp: '1',
        title: 'Legacy Workflow',
        version: 1,
        status: 'unreadable',
        error: 'forbidden field: app',
      },
      {
        workflowId: 'agent.workflow.demo',
        filename: 'design.json',
        timestamp: '2',
        title: 'Demo Workflow',
        version: 1,
        status: 'draft',
      },
    ])

    const wrapper = mountWorkflowDesigns()
    await flushPromises()

    const legacyItem = wrapper.findAll('.workflow-list-item')
      .find(item => item.text().includes('Legacy Workflow'))
    if (legacyItem === undefined) throw new Error('missing legacy workflow item')
    await legacyItem.trigger('click')
    await flushPromises()

    expect(mocks.readWorkflowDesign).toHaveBeenCalledOnce()
    expect(mocks.readWorkflowDesign).toHaveBeenCalledWith('agent.workflow.demo')
    expect(mocks.message.error).toHaveBeenCalledWith('设计稿不可打开: forbidden field: app')
  })

  it('keeps the empty state and warns when every design is unreadable', async () => {
    mocks.listWorkflowDesigns.mockResolvedValueOnce([
      {
        workflowId: 'agent.workflow.legacy',
        filename: 'design.json',
        timestamp: '1',
        title: 'Legacy Workflow',
        version: 1,
        status: 'unreadable',
        error: 'forbidden field: app',
      },
    ])

    mountWorkflowDesigns()
    await flushPromises()

    expect(mocks.readWorkflowDesign).not.toHaveBeenCalled()
    expect(mocks.message.warning).toHaveBeenCalledWith('当前设计稿均不可打开，请新建工作流或删除旧设计稿')
    expect(mocks.message.error).not.toHaveBeenCalled()
  })

  it('opens, edits, and saves a business node config', async () => {
    const wrapper = mountWorkflowDesigns()
    await flushPromises()

    expect(mocks.listWorkflowDesigns).toHaveBeenCalledOnce()
    expect(mocks.readWorkflowDesign).toHaveBeenCalledWith('agent.workflow.demo')
    expect(wrapper.text()).toContain('Business Node')

    expect(wrapper.find('textarea.model-json-input').exists()).toBe(false)
    const inputValue = wrapper.find('.structured-field-row--inputs .structured-field-value')
    expect(inputValue.exists()).toBe(true)
    await inputValue.setValue('edited')
    await findButton(wrapper, '保存').trigger('click')
    await flushPromises()

    expect(mocks.saveWorkflowDesign).toHaveBeenCalledOnce()
    const [workflowId, savedDocument] = mocks.saveWorkflowDesign.mock.calls[0] as [string, WorkflowDesignDocument]
    expect(workflowId).toBe('agent.workflow.demo')
    expect(savedDocument.workflow.graph.nodes[1]?.data?.inputs?.['prompt']).toBe('edited')
    expect(savedDocument.x_spark.draft?.['status']).toBe('saved')
  })

  it('opens, edits, and saves workflow-level properties', async () => {
    const wrapper = mountWorkflowDesigns()
    await flushPromises()

    await findButton(wrapper, '流程属性').trigger('click')
    expect(wrapper.text()).toContain('创建人')
    expect(wrapper.text()).toContain('tester')
    expect(wrapper.text()).toContain('Prompt variable JSDoc.')
    expect(wrapper.text()).toContain('ProjectModel full JSDoc.')

    const titleInput = wrapper.find('.workflow-title-input')
    expect(titleInput.exists()).toBe(true)
    await titleInput.setValue('Edited Workflow')
    await findButton(wrapper, '保存').trigger('click')
    await flushPromises()

    const [, savedDocument] = mocks.saveWorkflowDesign.mock.calls[0] as [string, WorkflowDesignDocument]
    expect(savedDocument.x_spark.designer?.['title']).toBe('Edited Workflow')
    expect(savedDocument.workflow.runtimeBinding?.registration.alias).toBe('demo')
    expect(savedDocument.workflow.runtimeBinding?.inputContract.paramsSchema.properties).toHaveProperty('prompt')
  })

  it('shows ClassModel pins and JSDoc at each extracted level', async () => {
    const wrapper = mountWorkflowDesigns()
    await flushPromises()
    await flushPromises()

    expect(mocks.createWorkerDtsClassModelKnowledgeProvider).toHaveBeenCalled()
    expect(wrapper.findAll('.class-model-pin').length).toBeGreaterThan(0)
    expect(wrapper.findAll('.doc-hint').length).toBeGreaterThan(0)
    expect(wrapper.text()).toContain('ProjectModel full JSDoc.')
    expect(wrapper.text()).toContain('ProjectModel constructor JSDoc.')
    expect(wrapper.text()).toContain('Active page JSDoc.')
    expect(wrapper.text()).toContain('Agent completion JSDoc.')
    expect(wrapper.text()).toContain('Complete page design JSDoc.')
  })

  it('drags a graph node and saves its new position', async () => {
    const wrapper = mountWorkflowDesigns()
    await flushPromises()

    const dragButton = wrapper.find('[title="移动 Business Node"]')
    expect(dragButton.exists()).toBe(true)
    await dragButton.trigger('click')
    await findButton(wrapper, '保存').trigger('click')
    await flushPromises()

    const [, savedDocument] = mocks.saveWorkflowDesign.mock.calls[0] as [string, WorkflowDesignDocument]
    expect(savedDocument.workflow.graph.nodes[1]?.position).toEqual({ x: 70, y: 30 })
  })

  it('moves the selected graph node with arrow keys', async () => {
    const wrapper = mountWorkflowDesigns()
    await flushPromises()

    await findButton(wrapper, '打开属性').trigger('click')
    expect(wrapper.text()).not.toContain('位置')

    window.document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    window.document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true }))
    await findButton(wrapper, '保存').trigger('click')
    await flushPromises()

    const [, savedDocument] = mocks.saveWorkflowDesign.mock.calls[0] as [string, WorkflowDesignDocument]
    expect(savedDocument.workflow.graph.nodes[1]?.position).toEqual({ x: 300, y: 260 })
  })

  it('auto-layouts the workflow graph and saves immediately', async () => {
    const wrapper = mountWorkflowDesigns()
    await flushPromises()

    await findButton(wrapper, '自动排版').trigger('click')
    await flushPromises()

    expect(mocks.saveWorkflowDesign).toHaveBeenCalledOnce()
    const [, savedDocument] = mocks.saveWorkflowDesign.mock.calls[0] as [string, WorkflowDesignDocument]
    expect(savedDocument.workflow.graph.nodes.map(node => node.position)).toEqual([
      { x: 40, y: 40 },
      { x: 40, y: 250 },
      { x: 40, y: 460 },
    ])
    expect(savedDocument.workflow.graph.viewport).toEqual({ x: 0, y: 0, zoom: 1 })
    expect(savedDocument.x_spark.draft?.['status']).toBe('saved')
    expect(mocks.message.success).toHaveBeenCalledWith('设计稿已保存')
  })

  it('creates a business node in the workflow graph', async () => {
    const wrapper = mountWorkflowDesigns()
    await flushPromises()

    await findButton(wrapper, 'Add business node').trigger('click')
    await findButton(wrapper, '创建节点').trigger('click')
    await findButton(wrapper, '保存').trigger('click')
    await flushPromises()

    const [, savedDocument] = mocks.saveWorkflowDesign.mock.calls[0] as [string, WorkflowDesignDocument]
    expect(savedDocument.workflow.graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'node.model-2',
          data: expect.objectContaining({
            type: 'node',
            models: [
              expect.objectContaining({
                className: 'spark.placeholder.Model',
              }),
            ],
          }),
        }),
      ]),
    )
  })

  it('keeps start and output nodes protected while allowing business node deletion', async () => {
    const wrapper = mountWorkflowDesigns()
    await flushPromises()

    await findButton(wrapper, '删除节点').trigger('click')
    await flushPromises()
    await findButton(wrapper, '保存').trigger('click')
    await flushPromises()

    const [, savedDocument] = mocks.saveWorkflowDesign.mock.calls[0] as [string, WorkflowDesignDocument]
    expect(savedDocument.workflow.graph.nodes.map(node => node.id)).toEqual(['start', 'output'])
    expect(savedDocument.workflow.graph.lines).toHaveLength(0)
  })

  it('updates a line endpoint from the line editor and saves it', async () => {
    const wrapper = mountWorkflowDesigns()
    await flushPromises()

    const firstLine = wrapper.find('.vue-flow__line')
    expect(firstLine.exists()).toBe(true)
    await firstLine.trigger('dblclick')
    await flushPromises()

    expect(wrapper.findAll('.doc-hint').length).toBeGreaterThan(0)
    expect(wrapper.text()).toContain('Prompt variable JSDoc.')
    expect(wrapper.text()).toContain('ProjectModel full JSDoc.')

    const toNodeSelect = wrapper.find('select.line-to-node-select')
    expect(toNodeSelect.exists()).toBe(true)
    await toNodeSelect.setValue('output')
    await findButton(wrapper, '保存').trigger('click')
    await flushPromises()

    const [, savedDocument] = mocks.saveWorkflowDesign.mock.calls[0] as [string, WorkflowDesignDocument]
    expect(savedDocument.workflow.graph.lines[0]).toEqual(expect.objectContaining({
      from: expect.objectContaining({ nodeId: 'start' }),
      to: expect.objectContaining({ nodeId: 'output' }),
    }))
  })

  it('rewires a line target from Vue Flow line update', async () => {
    const wrapper = mountWorkflowDesigns()
    await flushPromises()

    const lineUpdateButton = wrapper.find('[title="改连线 start -> node.model 到 output"]')
    expect(lineUpdateButton.exists()).toBe(true)
    await lineUpdateButton.trigger('click')
    await findButton(wrapper, '保存').trigger('click')
    await flushPromises()

    const [, savedDocument] = mocks.saveWorkflowDesign.mock.calls[0] as [string, WorkflowDesignDocument]
    expect(savedDocument.workflow.graph.lines[0]).toEqual(expect.objectContaining({
      from: expect.objectContaining({ nodeId: 'start' }),
      to: expect.objectContaining({ nodeId: 'output' }),
    }))
  })

  it('renders twelve numbered docks and resolves legacy automatic endpoints', async () => {
    const wrapper = mountWorkflowDesigns()
    await flushPromises()

    const businessNode = wrapper.find('[data-node-id="node.model"]')
    expect(businessNode.findAll('.vue-flow__handle')).toHaveLength(12)
    expect(businessNode.findAll('[data-handle-type="target"]').map(handle => handle.attributes('data-handle-id')))
      .toEqual(['dock-1', 'dock-2', 'dock-3', 'dock-10', 'dock-11', 'dock-12'])
    expect(businessNode.findAll('[data-handle-type="source"]').map(handle => handle.attributes('data-handle-id')))
      .toEqual(['dock-4', 'dock-5', 'dock-6', 'dock-7', 'dock-8', 'dock-9'])

    const firstLine = wrapper.find('.vue-flow__line')
    expect(firstLine.attributes('data-edge-type')).toBe('workflow-control')
    expect(firstLine.attributes('data-source-handle')).toMatch(/^dock-(4|5|6|7|8|9)$/u)
    expect(firstLine.attributes('data-target-handle')).toMatch(/^dock-(1|2|3|10|11|12)$/u)
    expect(firstLine.attributes('data-line-type')).toBe('orthogonal')
    expect(firstLine.attributes('data-runtime-status')).toBe('idle')
  })

  it('changes and persists the selected line visual type', async () => {
    const wrapper = mountWorkflowDesigns()
    await flushPromises()

    await wrapper.find('.vue-flow__line').trigger('dblclick')
    const lineTypeSelect = wrapper.find('select.line-visual-type-select')
    expect(lineTypeSelect.exists()).toBe(true)
    await lineTypeSelect.setValue('straight')
    await findButton(wrapper, '保存').trigger('click')
    await flushPromises()

    const [, savedDocument] = mocks.saveWorkflowDesign.mock.calls[0] as [string, WorkflowDesignDocument]
    expect(savedDocument.workflow.graph.lines[0]?.data?.visual).toMatchObject({
      lineType: 'straight',
      controlPoints: [],
    })
  })

  it('accepts explicit runtime line states without persisting them', async () => {
    const wrapper = mountWorkflowDesigns()
    await flushPromises()

    expect(wrapper.vm.setWorkflowLineRuntimeStatus('line.start.node', 'running')).toBe(true)
    await flushPromises()
    expect(wrapper.find('.vue-flow__line').attributes('data-runtime-status')).toBe('running')

    await findButton(wrapper, '保存').trigger('click')
    await flushPromises()
    const [, savedDocument] = mocks.saveWorkflowDesign.mock.calls[0] as [string, WorkflowDesignDocument]
    expect(savedDocument.workflow.graph.lines[0]?.data).not.toHaveProperty('runtimeStatus')
  })

  it('adds, drags, deletes, and clears persisted line control points', async () => {
    const wrapper = mountWorkflowDesigns()
    await flushPromises()

    const edgeGroup = wrapper.find('.workflow-control-edge')
    expect(edgeGroup.exists()).toBe(true)
    await edgeGroup.trigger('dblclick', { clientX: 220, clientY: 80 })
    await flushPromises()
    let controlPoint = wrapper.find('.workflow-edge-control-point')
    expect(controlPoint.exists()).toBe(true)

    controlPoint.element.dispatchEvent(new PointerEvent('pointerdown', { clientX: 220, clientY: 80, bubbles: true }))
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 250, clientY: 110 }))
    window.dispatchEvent(new PointerEvent('pointerup'))
    await flushPromises()
    controlPoint = wrapper.find('.workflow-edge-control-point')
    await controlPoint.trigger('dblclick')
    await flushPromises()
    expect(wrapper.find('.workflow-edge-control-point').exists()).toBe(false)

    await wrapper.find('.workflow-control-edge').trigger('dblclick', { clientX: 200, clientY: 70 })
    await flushPromises()
    await findButton(wrapper, '清空控制点').trigger('click')
    await findButton(wrapper, '保存').trigger('click')
    await flushPromises()

    const [, savedDocument] = mocks.saveWorkflowDesign.mock.calls[0] as [string, WorkflowDesignDocument]
    expect(savedDocument.workflow.graph.lines[0]?.data?.visual?.controlPoints).toEqual([])
  })

  it('publishes the current design as definition.json', async () => {
    const wrapper = mountWorkflowDesigns()
    await flushPromises()

    await findButton(wrapper, '发布').trigger('click')
    await flushPromises()

    expect(mocks.createAgentWorkflowDefinitionFromDesign).toHaveBeenCalledOnce()
    expect(mocks.publishWorkflowDefinition).toHaveBeenCalledWith(
      'agent.workflow.demo',
      expect.objectContaining({
        kind: 'agent.workflow',
        workflowId: 'agent.workflow.demo',
      }),
    )
    expect(mocks.message.success).toHaveBeenCalledWith('definition.json 已发布')
  })

  it('marks ClassModel schema refs as legacy when creating a definition', async () => {
    const actual = await vi.importActual<typeof import('@/services/workflow-designs')>('@/services/workflow-designs')
    const document = createWorkflowDesignDocument()
    Object.assign(document.workflow as unknown as Record<string, unknown>, {
      features: {
        file_upload: { enabled: false },
      },
      environment_variables: [],
      conversation_variables: [],
    })
    const nodeData = document.workflow.graph.nodes[1]?.data
    if (nodeData === undefined) throw new Error('missing business node data')
    nodeData.x_spark = {
      classModel: {
        manifestPath: 'generated/dts-class-model/manifest.json',
        sourcePath: 'packages/spark-project-model/src/project/project-model.ts',
        rootClassName: 'ProjectModel',
        actionName: 'replaceNavigationChildren',
        schemaRefs: {
          params: {
            $ref: 'project-model.ts.json#/$defs/ProjectModel/$defs/method.replaceNavigationChildren.params',
          },
        },
      },
    }

    const definition = actual.createAgentWorkflowDefinitionFromDesign(document, {
      publishedAt: '2026-06-19T00:00:00.000Z',
    })

    expect(definition.workflow.graph.nodes[1]?.data).toMatchObject({
      type: 'node',
      models: [
        expect.objectContaining({
          rootClassName: 'ProjectModel',
          className: 'ProjectModel',
        }),
      ],
    })
    expect(definition.workflow.graph.nodes[1]?.data).not.toHaveProperty('x_spark')
    expect(definition.x_spark.validation).toMatchObject({
      status: 'invalid',
      issues: expect.arrayContaining([
        expect.objectContaining({
          code: 'AGENT_WORKFLOW_LEGACY_CLASS_MODEL_META',
          nodeId: 'node.model',
        }),
      ]),
    })
    expect(definition.workflow as unknown as Record<string, unknown>).toMatchObject({
      features: {
        file_upload: { enabled: false },
      },
      environment_variables: [],
      conversation_variables: [],
    })
  })

  it('opens, edits, and saves definition.json', async () => {
    const wrapper = mountWorkflowDesigns()
    await flushPromises()

    await findButton(wrapper, 'Definition').trigger('click')
    await flushPromises()

    expect(mocks.readWorkflowDefinition).toHaveBeenCalledWith('agent.workflow.demo', '')
    const definitionEditor = wrapper.find('textarea.definition-json-input')
    expect(definitionEditor.exists()).toBe(true)
    expect((definitionEditor.element as HTMLTextAreaElement).value).toContain('"kind": "agent.workflow"')

    await definitionEditor.setValue('{"kind":"agent.workflow"}')
    await findButton(wrapper, '保存 Definition').trigger('click')
    await flushPromises()

    expect(mocks.parseAgentWorkflowDefinitionJson).toHaveBeenCalledWith('{"kind":"agent.workflow"}')
    expect(mocks.saveWorkflowDefinition).toHaveBeenCalledWith(
      'agent.workflow.demo',
      expect.objectContaining({
        kind: 'agent.workflow',
        workflowId: 'agent.workflow.demo',
      }),
    )
    expect(mocks.message.success).toHaveBeenCalledWith('definition.json 已保存')
  })

  it('creates a local definition draft when the backend definition endpoint is missing', async () => {
    mocks.readWorkflowDefinition.mockRejectedValueOnce(new Error(
      'No static resource api/tenants/lmspark/projects/homepage/workflow-designs/agent.workflow.20260615095755/definition.json.',
    ))
    const wrapper = mountWorkflowDesigns()
    await flushPromises()

    await findButton(wrapper, 'Definition').trigger('click')
    await flushPromises()

    expect(mocks.createAgentWorkflowDefinitionFromDesign).toHaveBeenCalled()
    const definitionEditor = wrapper.find('textarea.definition-json-input')
    expect(definitionEditor.exists()).toBe(true)
    expect((definitionEditor.element as HTMLTextAreaElement).value).toContain('"kind": "agent.workflow"')
    expect(mocks.message.info).toHaveBeenCalledWith('definition.json 不存在，已根据当前设计生成本地草稿')
    expect(mocks.message.error).not.toHaveBeenCalled()
  })
})
