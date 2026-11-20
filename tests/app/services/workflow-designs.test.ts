import { beforeEach, describe, expect, it, vi } from 'vitest'

const lowcodeRuntimeMock = vi.hoisted(() => ({
  fileOwner: {readDocument: vi.fn(), dispose: vi.fn()},
  createFileOwner: vi.fn(),
}))

vi.mock('@/lowcode/resources/repository/agent-workflow/agent-workflow-file-owner', () => ({
  createAgentWorkflowFileDataViewOwner: lowcodeRuntimeMock.createFileOwner,
}))

import {
  addWorkflowDesignLine,
  createAgentWorkflowDefinitionFromDesign,
  createWorkflowDesignNode,
  readWorkflowDefinition,
  type WorkflowDesignDocument,
} from '@/services/workflow-designs'

function createDesign(): WorkflowDesignDocument {
  return {
    kind: 'agent.workflow.design',
    version: 1,
    id: 'agent.workflow.test',
    workflow: {
      id: 'agent.workflow.test',
      version: 1,
      variables: [
        { name: 'requirement', required: true },
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
          identityField: 'requirement',
          messageField: 'requirement',
          paramsSchema: {
            type: 'object',
            properties: {
              requirement: { type: 'string' },
            },
            required: ['requirement'],
            additionalProperties: false,
          },
          readonlySteps: [],
        },
        systemPrompt: {
          template: 'Demo prompt: {{ requirement }}',
          conditionalHints: [],
        },
        modelProjectionRef: {
          kind: 'dts-class-model',
          rootClassName: 'DemoModel',
          manifestUrlRef: 'dts-class-model',
        },
        executableRef: {
          kind: 'js-module',
          moduleSpecifier: './demo-model.js',
          exportName: 'DemoModel',
        },
        resolveInstance: {
          editorSource: 'demo',
          identityField: 'requirement',
        },
        beforeFunctionCall: {
          gateRules: [
            { kind: 'demoGate' },
          ],
        },
        executionToolNames: ['model_script'],
        planWithoutToolMarkers: ['runDemo'],
        agentCompleteMethodName: 'validateDemo',
      },
      graph: {
        nodes: [
          {
            id: 'start',
            type: 'start',
            data: { type: 'start', title: 'Start' },
          },
          {
            id: 'node.model',
            type: 'node',
            data: {
              type: 'node',
              title: 'Business Node',
              models: [
                {
                  id: 'node.model.model',
                  rootClassName: 'DemoModel',
                  className: 'DemoModel',
                  sourceRef: '$',
                  completion: {
                    memberName: 'validateDemo',
                    returnContract: 'boolean-or-reason',
                  },
                },
              ],
              inputs: {
                requirement: '{{ start.requirement }}',
              },
              outputs: {
                result: 'node.result',
              },
              llm: {
                task: {
                  goal: 'Run demo requirement.',
                  requirements: {
                    requirement: '{{ start.requirement }}',
                  },
                  contextInputs: {},
                },
                knowledge: {
                  rootClassName: 'DemoModel',
                  className: 'DemoModel',
                  allowedActions: ['runDemo', 'validateDemo'],
                  readableAttributes: ['result'],
                },
                functionCalling: {
                  mode: 'freeWithinModelContext',
                  constraints: [],
                },
                output: {
                  structuredResult: {
                    result: 'node.result',
                  },
                  handoffToValidation: true,
                },
              },
              validation: {
                action: {
                  className: 'DemoModel',
                  actionName: 'validateDemo',
                  inputProjection: {
                    result: 'node.result',
                  },
                  expectedResult: {
                    ok: true,
                  },
                },
                status: 'draft',
                issues: [],
              },
              capabilities: [
                {
                  id: 'demo.execute',
                  title: 'Execute Demo',
                  scope: 'node',
                  description: 'Execute the demo module with the supplied requirement.',
                  inputs: {
                    requirement: '{{ start.requirement }}',
                  },
                  outputs: {
                    result: 'node.result',
                  },
                  constraints: [],
                },
              ],
            },
          },
          {
            id: 'output',
            type: 'output',
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
            from: { nodeId: 'start', modelId: '$workflow', memberName: 'requirement' },
            to: { nodeId: 'node.model', modelId: 'node.model.model', memberName: 'requirement' },
          },
          {
            id: 'line.node.output',
            from: { nodeId: 'node.model', modelId: 'node.model.model', memberName: 'result' },
            to: { nodeId: 'output', modelId: '$workflow', memberName: 'result' },
          },
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    },
    x_spark: {
      schema: 'spark.agent.workflow.design.v1',
      designer: { title: 'Agent Workflow' },
      draft: { status: 'draft', dirtyPaths: [] },
      validation: { status: 'unknown', issues: [] },
    },
  }
}

describe('workflow design helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    lowcodeRuntimeMock.createFileOwner.mockResolvedValue(lowcodeRuntimeMock.fileOwner)
  })

  it('adds a default line in a selected graph', () => {
    const design = createDesign()
    const graph = design.workflow.graph

    const line = addWorkflowDesignLine(graph, 'start', 'output')
    expect(line.id).toBe('line.start.output')
    expect(line.from.dock).toBe(0)
    expect(line.to.dock).toBe(0)
    expect(graph.lines.some(item => item === line)).toBe(true)
  })

  it('creates business and boundary nodes in the selected graph', () => {
    const design = createDesign()
    const graph = design.workflow.graph

    const node = createWorkflowDesignNode(graph, {
      nodeKind: 'node',
      id: 'node.next',
      title: 'Next Business Node',
    })
    const output = createWorkflowDesignNode(graph, {
      nodeKind: 'output',
      id: 'output.next',
      title: 'Next Output',
    })

    expect(node.type).toBe('node')
    expect(node.data).toMatchObject({
      type: 'node',
      models: [
        expect.objectContaining({
          rootClassName: 'spark.placeholder.RootModel',
          className: 'spark.placeholder.Model',
        }),
      ],
      inputs: {},
      outputs: {},
      llm: expect.objectContaining({
        functionCalling: expect.objectContaining({
          mode: 'freeWithinModelContext',
        }),
      }),
      validation: expect.objectContaining({
        action: expect.objectContaining({
          actionName: 'spark.placeholder.validate',
        }),
      }),
      capabilities: [],
    })
    expect(output.type).toBe('output')
    expect(output.data).toMatchObject({
      type: 'output',
      outputs: {},
      capabilities: [],
    })
  })

  it('keeps design-only line visuals out of the published definition', () => {
    const design = createDesign()
    const line = design.workflow.graph.lines[0]
    if (line === undefined) throw new Error('missing line')
    line.data = {
      relation: 'default',
      visual: {
        lineType: 'straight',
        controlPoints: [{ x: 10, y: 20 }],
      },
    }

    const definition = createAgentWorkflowDefinitionFromDesign(design)

    expect(definition.workflow.graph.lines[0]?.data).toEqual({ relation: 'default' })
  })

  it('publishes workflow graph into an AgentWorkflowDefinition', () => {
    const definition = createAgentWorkflowDefinitionFromDesign(createDesign(), {
      publishedAt: '2026-06-16T00:00:00.000Z',
    })

    expect(definition).toMatchObject({
      kind: 'agent.workflow',
      version: 1,
      workflowId: 'agent.workflow.test',
      source: {
        designKind: 'agent.workflow.design',
        designId: 'agent.workflow.test',
        designVersion: 1,
      },
      workflow: {
        runtimeBinding: expect.objectContaining({
          registration: expect.objectContaining({
            alias: 'demo',
            moduleId: 'demo',
          }),
          modelProjectionRef: expect.objectContaining({
            rootClassName: 'DemoModel',
          }),
        }),
        variables: [
          { name: 'requirement', required: true },
        ],
        capabilities: [
          expect.objectContaining({
            id: 'demo.workflow',
            scope: 'workflow',
          }),
        ],
        graph: {
          nodes: [
            expect.objectContaining({ id: 'start', type: 'start' }),
            expect.objectContaining({
              id: 'node.model',
              type: 'node',
              data: expect.objectContaining({
                models: [
                  expect.objectContaining({
                    rootClassName: 'DemoModel',
                    className: 'DemoModel',
                    completion: {
                      memberName: 'validateDemo',
                      returnContract: 'boolean-or-reason',
                    },
                  }),
                ],
                inputs: {
                  requirement: '{{ start.requirement }}',
                },
                outputs: {
                  result: 'node.result',
                },
                llm: expect.objectContaining({
                  functionCalling: expect.objectContaining({
                    mode: 'freeWithinModelContext',
                  }),
                }),
                validation: expect.objectContaining({
                  action: expect.objectContaining({
                    className: 'DemoModel',
                    actionName: 'validateDemo',
                  }),
                }),
              }),
            }),
            expect.objectContaining({ id: 'output', type: 'output' }),
          ],
          lines: [
            expect.objectContaining({
              id: 'line.start.node',
              from: { nodeId: 'start', modelId: '$workflow', memberName: 'requirement' },
              to: { nodeId: 'node.model', modelId: 'node.model.model', memberName: 'requirement' },
            }),
            expect.objectContaining({
              id: 'line.node.output',
              from: { nodeId: 'node.model', modelId: 'node.model.model', memberName: 'result' },
              to: { nodeId: 'output', modelId: '$workflow', memberName: 'result' },
            }),
          ],
        },
      },
      x_spark: {
        schema: 'spark.agent.workflow.definition.v1',
        publishedAt: '2026-06-16T00:00:00.000Z',
        validation: {
          status: 'valid',
          issues: [],
        },
      },
    })
    expect('factory' in definition).toBe(false)
    expect('process' in definition).toBe(false)
  })

  it('marks legacy design fields as invalid during publish', () => {
    const design = createDesign() as WorkflowDesignDocument & { app?: unknown; factory?: unknown }
    design.app = { mode: 'workflow' }
    design.workflow.graph.nodes[1]!.data = {
      type: 'tool',
      title: 'Legacy',
      tool_name: 'single_model_edit',
    }

    const definition = createAgentWorkflowDefinitionFromDesign(design)

    expect(definition.x_spark.validation.status).toBe('invalid')
    expect(definition.x_spark.validation.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'error',
        code: 'AGENT_WORKFLOW_LEGACY_DESIGN_FIELD',
        path: 'design.app',
      }),
      expect.objectContaining({
        severity: 'error',
        code: 'AGENT_WORKFLOW_LEGACY_NODE',
        nodeId: 'node.model',
      }),
    ]))
  })

  it('marks business nodes without projected completion members as invalid during publish', () => {
    const design = createDesign()
    const models = design.workflow.graph.nodes[1]!.data!.models as Array<Record<string, unknown>>
    delete models[0]!['completion']

    const definition = createAgentWorkflowDefinitionFromDesign(design)

    expect(definition.x_spark.validation.status).toBe('invalid')
    expect(definition.x_spark.validation.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'error',
        code: 'AGENT_WORKFLOW_MODEL_COMPLETION_MISSING',
        nodeId: 'node.model',
        path: 'workflow.graph.node.model.data.models[0].completion.memberName',
      }),
    ]))
  })

  it('validates nodes inside loop sub-graphs with their nested scope path', () => {
    const design = createDesign()
    design.workflow.graph.nodes[1]!.data!.loop = {subGraph: {nodes: [{id: 'inner', type: 'custom', data: {type: 'task'}}], lines: []}}

    const definition = createAgentWorkflowDefinitionFromDesign(design)

    expect(definition.x_spark.validation.issues).toEqual(expect.arrayContaining([expect.objectContaining({
      code: 'AGENT_WORKFLOW_LEGACY_NODE_TYPE',
      nodeId: 'inner',
      path: 'workflow.graph.node.model.loop.subGraph.inner.type',
    })]))
  })

  it('reads definition.json through the registered DataView owner', async () => {
    const definition = createAgentWorkflowDefinitionFromDesign(createDesign())
    lowcodeRuntimeMock.fileOwner.readDocument.mockResolvedValue(JSON.stringify(definition))

    const readResult = await readWorkflowDefinition('agent.workflow.test')

    expect(readResult.definition).toStrictEqual(definition)
    expect(lowcodeRuntimeMock.createFileOwner).toHaveBeenCalledOnce()
    expect(lowcodeRuntimeMock.fileOwner.readDocument).toHaveBeenCalledWith('agent.workflow.test', 'definition.json')
    expect(lowcodeRuntimeMock.fileOwner.dispose).toHaveBeenCalledOnce()
  })
})
