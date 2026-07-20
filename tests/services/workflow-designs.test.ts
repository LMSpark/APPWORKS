import { beforeEach, describe, expect, it, vi } from 'vitest'

const httpMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('@/services/http', () => ({
  http: httpMock,
}))

vi.mock('@/services/auth', () => ({
  getUser: () => ({
    tenantId: 'tenant-a',
    defaultProjectId: 'project-a',
    roles: [],
  }),
  isPlatformAdminUser: () => false,
}))

import {
  addWorkflowDesignLine,
  autoLayoutWorkflowDesignGraphs,
  collectWorkflowDesignLines,
  collectWorkflowDesignGraphs,
  collectWorkflowDesignNodes,
  createAgentWorkflowDefinitionFromDesign,
  createWorkflowDesignNode,
  markWorkflowDesignDirty,
  normalizeWorkflowDesignLineState,
  parseAgentWorkflowDefinitionJson,
  publishWorkflowDefinition,
  readWorkflowDefinition,
  removeWorkflowDesignLine,
  removeWorkflowDesignNode,
  saveWorkflowDefinition,
  updateWorkflowDesignLine,
  workflowDesignLineControlPoints,
  workflowDesignLineType,
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

function findRootGraphNode(design: WorkflowDesignDocument, nodeId: string) {
  const node = design.workflow.graph.nodes.find(item => item.id === nodeId)
  if (node === undefined) throw new Error(`missing graph node: ${nodeId}`)
  return node
}

describe('workflow design helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('collects business nodes from the workflow graph', () => {
    const nodes = collectWorkflowDesignNodes(createDesign())
    const businessNode = nodes.find(node => node.id === 'node.model')

    expect(nodes.map(node => node.id)).toEqual(['start', 'node.model', 'output'])
    expect(businessNode?.isBusinessNode).toBe(true)
    expect(businessNode?.isBoundaryNode).toBe(false)
    expect(businessNode?.depth).toBe(0)
  })

  it('marks workflow design dirty paths', () => {
    const design = createDesign()

    markWorkflowDesignDirty(design, 'workflow.graph.nodes')

    expect(design.x_spark.draft?.['status']).toBe('dirty')
    expect(design.x_spark.draft?.['dirtyPaths']).toContain('workflow.graph.nodes')
  })

  it('collects graph and line views', () => {
    const design = createDesign()
    const graphs = collectWorkflowDesignGraphs(design)
    const lines = collectWorkflowDesignLines(design)

    expect(graphs.map(graph => graph.scopePath)).toEqual(['workflow.graph'])
    expect(graphs[0]?.carrier).toBe('root')
    expect(lines.map(line => line.id)).toEqual(['line.start.node', 'line.node.output'])
  })

  it('auto-layouts all graphs vertically from upper-left by workflow order', () => {
    const design = createDesign()
    design.workflow.graph.nodes = [
      { id: 'start', type: 'start', position: { x: 999, y: 999 }, data: { type: 'start', title: 'Start' } },
      { id: 'output', type: 'output', position: { x: 999, y: 999 }, data: { type: 'output', title: 'Output' } },
      {
        id: 'node.a',
        type: 'node',
        position: { x: 999, y: 999 },
        data: {
          type: 'node',
          title: 'A',
          loop: {
            subGraph: {
              nodes: [
                { id: 'loop.start', type: 'start', position: { x: 8, y: 8 }, data: { type: 'start' } },
                { id: 'loop.node', type: 'node', position: { x: 8, y: 8 }, data: { type: 'node' } },
                { id: 'loop.output', type: 'output', position: { x: 8, y: 8 }, data: { type: 'output' } },
              ],
              lines: [
                {
                  id: 'line.loop.start.node',
                  from: { nodeId: 'loop.start', modelId: '$workflow', memberName: 'out' },
                  to: { nodeId: 'loop.node', modelId: 'node', memberName: 'in' },
                },
                {
                  id: 'line.loop.node.output',
                  from: { nodeId: 'loop.node', modelId: 'node', memberName: 'out' },
                  to: { nodeId: 'loop.output', modelId: '$workflow', memberName: 'in' },
                },
              ],
              viewport: { x: 20, y: 30, zoom: 0.5 },
            },
          },
        },
      },
      { id: 'node.b', type: 'node', position: { x: 999, y: 999 }, data: { type: 'node', title: 'B' } },
      { id: 'node.c', type: 'node', position: { x: 999, y: 999 }, data: { type: 'node', title: 'C' } },
      { id: 'node.d', type: 'node', position: { x: 999, y: 999 }, data: { type: 'node', title: 'D' } },
      { id: 'node.e', type: 'node', position: { x: 999, y: 999 }, data: { type: 'node', title: 'E' } },
    ]
    design.workflow.graph.lines = [
      {
        id: 'line.start.a',
        from: { nodeId: 'start', modelId: '$workflow', memberName: 'out' },
        to: { nodeId: 'node.a', modelId: 'node.a', memberName: 'in' },
      },
      {
        id: 'line.a.b',
        from: { nodeId: 'node.a', modelId: 'node.a', memberName: 'out' },
        to: { nodeId: 'node.b', modelId: 'node.b', memberName: 'in' },
      },
      {
        id: 'line.b.c',
        from: { nodeId: 'node.b', modelId: 'node.b', memberName: 'out' },
        to: { nodeId: 'node.c', modelId: 'node.c', memberName: 'in' },
      },
      {
        id: 'line.c.d',
        from: { nodeId: 'node.c', modelId: 'node.c', memberName: 'out' },
        to: { nodeId: 'node.d', modelId: 'node.d', memberName: 'in' },
      },
      {
        id: 'line.d.e',
        from: { nodeId: 'node.d', modelId: 'node.d', memberName: 'out' },
        to: { nodeId: 'node.e', modelId: 'node.e', memberName: 'in' },
      },
      {
        id: 'line.e.output',
        from: { nodeId: 'node.e', modelId: 'node.e', memberName: 'out' },
        to: { nodeId: 'output', modelId: '$workflow', memberName: 'in' },
      },
    ]
    design.workflow.graph.viewport = { x: 100, y: 100, zoom: 0.75 }

    const result = autoLayoutWorkflowDesignGraphs(design)
    const nestedGraph = findRootGraphNode(design, 'node.a').data?.loop?.subGraph
    if (nestedGraph === undefined) throw new Error('missing nested graph')

    expect(result.changed).toBe(true)
    expect(result.graphs.map(graph => graph.scopePath)).toEqual([
      'workflow.graph',
      'workflow.graph.node.a.loop.subGraph',
    ])
    expect(findRootGraphNode(design, 'start').position).toEqual({ x: 40, y: 40 })
    expect(findRootGraphNode(design, 'node.a').position).toEqual({ x: 40, y: 250 })
    expect(findRootGraphNode(design, 'node.b').position).toEqual({ x: 40, y: 460 })
    expect(findRootGraphNode(design, 'node.c').position).toEqual({ x: 40, y: 670 })
    expect(findRootGraphNode(design, 'node.d').position).toEqual({ x: 40, y: 880 })
    expect(findRootGraphNode(design, 'node.e').position).toEqual({ x: 40, y: 1090 })
    expect(findRootGraphNode(design, 'output').position).toEqual({ x: 40, y: 1300 })
    expect(design.workflow.graph.viewport).toEqual({ x: 0, y: 0, zoom: 1 })
    expect(nestedGraph.nodes.map(node => node.position)).toEqual([
      { x: 40, y: 40 },
      { x: 40, y: 250 },
      { x: 40, y: 460 },
    ])
    expect(nestedGraph.viewport).toEqual({ x: 0, y: 0, zoom: 1 })
  })

  it('auto-layouts workflow branches on both sides until the output node', () => {
    const design = createDesign()
    design.workflow.graph.nodes = [
      { id: 'start', type: 'start', position: { x: 999, y: 999 }, data: { type: 'start', title: 'Start' } },
      { id: 'node.entry', type: 'node', position: { x: 999, y: 999 }, data: { type: 'node', title: 'Entry' } },
      { id: 'node.left', type: 'node', position: { x: 999, y: 999 }, data: { type: 'node', title: 'Left' } },
      { id: 'node.right', type: 'node', position: { x: 999, y: 999 }, data: { type: 'node', title: 'Right' } },
      { id: 'output', type: 'output', position: { x: 999, y: 999 }, data: { type: 'output', title: 'Output' } },
    ]
    design.workflow.graph.lines = [
      {
        id: 'line.start.entry',
        from: { nodeId: 'start', modelId: '$workflow', memberName: 'out' },
        to: { nodeId: 'node.entry', modelId: 'node.entry', memberName: 'in' },
      },
      {
        id: 'line.entry.left',
        from: { nodeId: 'node.entry', modelId: 'node.entry', memberName: 'out' },
        to: { nodeId: 'node.left', modelId: 'node.left', memberName: 'in' },
      },
      {
        id: 'line.entry.right',
        from: { nodeId: 'node.entry', modelId: 'node.entry', memberName: 'out' },
        to: { nodeId: 'node.right', modelId: 'node.right', memberName: 'in' },
      },
      {
        id: 'line.left.output',
        from: { nodeId: 'node.left', modelId: 'node.left', memberName: 'out' },
        to: { nodeId: 'output', modelId: '$workflow', memberName: 'in' },
      },
      {
        id: 'line.right.output',
        from: { nodeId: 'node.right', modelId: 'node.right', memberName: 'out' },
        to: { nodeId: 'output', modelId: '$workflow', memberName: 'in' },
      },
    ]

    autoLayoutWorkflowDesignGraphs(design)

    expect(findRootGraphNode(design, 'start').position).toEqual({ x: 210, y: 40 })
    expect(findRootGraphNode(design, 'node.entry').position).toEqual({ x: 210, y: 250 })
    expect(findRootGraphNode(design, 'node.left').position?.y).toBe(460)
    expect(findRootGraphNode(design, 'node.right').position?.y).toBe(460)
    expect(new Set([
      findRootGraphNode(design, 'node.left').position?.x,
      findRootGraphNode(design, 'node.right').position?.x,
    ])).toEqual(new Set([40, 380]))
    expect(findRootGraphNode(design, 'output').position).toEqual({ x: 210, y: 670 })
  })

  it('keeps the main branch before loop-back lines when auto-layouting', () => {
    const design = createDesign()
    design.workflow.graph.nodes = [
      { id: 'start', type: 'start', position: { x: 999, y: 999 }, data: { type: 'start' } },
      { id: 'node.a', type: 'node', position: { x: 999, y: 999 }, data: { type: 'node' } },
      { id: 'node.b', type: 'node', position: { x: 999, y: 999 }, data: { type: 'node' } },
      { id: 'output', type: 'output', position: { x: 999, y: 999 }, data: { type: 'output' } },
    ]
    design.workflow.graph.lines = [
      {
        id: 'line.start.a',
        from: { nodeId: 'start', modelId: '$workflow', memberName: 'out' },
        to: { nodeId: 'node.a', modelId: 'node.a', memberName: 'in' },
      },
      {
        id: 'line.b.a.retry',
        from: { nodeId: 'node.b', modelId: 'node.b', memberName: 'retry' },
        to: { nodeId: 'node.a', modelId: 'node.a', memberName: 'in' },
      },
      {
        id: 'line.a.b',
        from: { nodeId: 'node.a', modelId: 'node.a', memberName: 'out' },
        to: { nodeId: 'node.b', modelId: 'node.b', memberName: 'in' },
      },
      {
        id: 'line.b.output',
        from: { nodeId: 'node.b', modelId: 'node.b', memberName: 'out' },
        to: { nodeId: 'output', modelId: '$workflow', memberName: 'in' },
      },
    ]

    autoLayoutWorkflowDesignGraphs(design)

    expect(findRootGraphNode(design, 'start').position).toEqual({ x: 40, y: 40 })
    expect(findRootGraphNode(design, 'node.a').position).toEqual({ x: 40, y: 250 })
    expect(findRootGraphNode(design, 'node.b').position).toEqual({ x: 40, y: 460 })
    expect(findRootGraphNode(design, 'output').position).toEqual({ x: 40, y: 670 })
  })

  it('places the join after the longest parallel branch when auto-layouting', () => {
    const design = createDesign()
    design.workflow.graph.nodes = [
      { id: 'start', type: 'start', position: { x: 999, y: 999 }, data: { type: 'start' } },
      { id: 'node.a', type: 'node', position: { x: 999, y: 999 }, data: { type: 'node' } },
      { id: 'node.b', type: 'node', position: { x: 999, y: 999 }, data: { type: 'node' } },
      { id: 'node.c', type: 'node', position: { x: 999, y: 999 }, data: { type: 'node' } },
      { id: 'output', type: 'output', position: { x: 999, y: 999 }, data: { type: 'output' } },
    ]
    design.workflow.graph.lines = [
      {
        id: 'line.start.a',
        from: { nodeId: 'start', modelId: '$workflow', memberName: 'out' },
        to: { nodeId: 'node.a', modelId: 'node.a', memberName: 'in' },
      },
      {
        id: 'line.a.b',
        from: { nodeId: 'node.a', modelId: 'node.a', memberName: 'out' },
        to: { nodeId: 'node.b', modelId: 'node.b', memberName: 'in' },
      },
      {
        id: 'line.b.output',
        from: { nodeId: 'node.b', modelId: 'node.b', memberName: 'out' },
        to: { nodeId: 'output', modelId: '$workflow', memberName: 'in' },
      },
      {
        id: 'line.start.c',
        from: { nodeId: 'start', modelId: '$workflow', memberName: 'out' },
        to: { nodeId: 'node.c', modelId: 'node.c', memberName: 'in' },
      },
      {
        id: 'line.c.output',
        from: { nodeId: 'node.c', modelId: 'node.c', memberName: 'out' },
        to: { nodeId: 'output', modelId: '$workflow', memberName: 'in' },
      },
    ]

    autoLayoutWorkflowDesignGraphs(design)

    expect(findRootGraphNode(design, 'start').position).toEqual({ x: 210, y: 40 })
    expect(findRootGraphNode(design, 'node.a').position).toEqual({ x: 40, y: 250 })
    expect(findRootGraphNode(design, 'node.b').position).toEqual({ x: 40, y: 460 })
    expect(findRootGraphNode(design, 'node.c').position).toEqual({ x: 380, y: 250 })
    expect(findRootGraphNode(design, 'output').position).toEqual({ x: 210, y: 670 })
    expect(findRootGraphNode(design, 'node.a').position?.y).toBeLessThan(findRootGraphNode(design, 'output').position?.y ?? 0)
    expect(findRootGraphNode(design, 'node.b').position?.y).toBeLessThan(findRootGraphNode(design, 'output').position?.y ?? 0)
    expect(findRootGraphNode(design, 'node.c').position?.y).toBeLessThan(findRootGraphNode(design, 'output').position?.y ?? 0)
  })

  it('adds and removes lines in a selected graph', () => {
    const design = createDesign()
    const graph = design.workflow.graph

    const line = addWorkflowDesignLine(graph, 'start', 'output')
    expect(line.id).toBe('line.start.output')
    expect(line.from.dock).toBe(0)
    expect(line.to.dock).toBe(0)
    expect(workflowDesignLineType(line)).toBe('orthogonal')
    expect(workflowDesignLineControlPoints(line)).toEqual([])
    expect(graph.lines.some(item => item === line)).toBe(true)

    expect(removeWorkflowDesignLine(graph, line)).toBe(true)
    expect(graph.lines.some(item => item === line)).toBe(false)
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

  it('removes a node and all related lines in the same graph', () => {
    const design = createDesign()
    const rootGraph = design.workflow.graph

    const result = removeWorkflowDesignNode(rootGraph, 'node.model')

    expect(result.removed).toBe(true)
    expect(result.removedLines.map(line => line.id)).toEqual(['line.start.node', 'line.node.output'])
    expect(rootGraph.nodes.map(node => node.id)).toEqual(['start', 'output'])
    expect(rootGraph.lines).toEqual([])
  })

  it('updates line endpoints and metadata', () => {
    const design = createDesign()
    const line = design.workflow.graph.lines[0]
    if (line === undefined) throw new Error('missing line')

    updateWorkflowDesignLine(line, {
      from: { nodeId: 'node.model', modelId: 'node.model.model', memberName: 'result', dock: 1 },
      to: { nodeId: 'output', modelId: '$workflow', memberName: 'result', dock: 2 },
      type: 'custom',
      relation: 'fallback',
      lineType: 'bezier',
      controlPoints: [{ x: 120, y: 180 }],
    })

    expect(line).toEqual(expect.objectContaining({
      from: { nodeId: 'node.model', modelId: 'node.model.model', memberName: 'result', dock: 1 },
      to: { nodeId: 'output', modelId: '$workflow', memberName: 'result', dock: 2 },
      type: 'custom',
      data: expect.objectContaining({ relation: 'fallback' }),
    }))
    expect(workflowDesignLineType(line)).toBe('bezier')
    expect(workflowDesignLineControlPoints(line)).toEqual([{ x: 120, y: 180 }])
  })

  it('normalizes legacy line docks and visual defaults across nested graphs', () => {
    const design = createDesign()
    const rootLine = design.workflow.graph.lines[0]
    if (rootLine === undefined) throw new Error('missing root line')
    rootLine.from.dock = 99
    rootLine.data = { relation: 'default' }
    design.workflow.graph.nodes[1]!.data!.loop = {
      subGraph: {
        nodes: [],
        lines: [{
          from: { nodeId: 'nested.start', modelId: '$workflow', memberName: 'out' },
          to: { nodeId: 'nested.output', modelId: '$workflow', memberName: 'in' },
        }],
      },
    }

    normalizeWorkflowDesignLineState(design)

    expect(rootLine.from.dock).toBe(0)
    expect(rootLine.to.dock).toBe(0)
    expect(rootLine.data?.visual).toEqual({ lineType: 'orthogonal', controlPoints: [] })
    expect(design.workflow.graph.nodes[1]!.data!.loop!.subGraph!.lines[0]).toMatchObject({
      from: { dock: 0 },
      to: { dock: 0 },
      data: { visual: { lineType: 'orthogonal', controlPoints: [] } },
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

  it('posts a generated definition to the publish endpoint', async () => {
    const definition = createAgentWorkflowDefinitionFromDesign(createDesign())
    httpMock.post.mockResolvedValue({
      ok: true,
      workflowId: 'agent.workflow.test',
      filename: 'definition.json',
      timestamp: '1',
    })

    const result = await publishWorkflowDefinition('agent.workflow.test', definition)

    expect(result.filename).toBe('definition.json')
    expect(httpMock.post).toHaveBeenCalledWith(
      '/api/tenants/tenant-a/projects/project-a/workflow-designs/agent.workflow.test/__publish',
      definition,
    )
  })

  it('reads and saves definition.json through the document endpoint', async () => {
    const definition = createAgentWorkflowDefinitionFromDesign(createDesign())
    httpMock.get.mockResolvedValue({
      workflowId: 'agent.workflow.test',
      filename: 'definition.json',
      timestamp: '2',
      definition,
    })
    httpMock.put.mockResolvedValue({
      ok: true,
      workflowId: 'agent.workflow.test',
      filename: 'definition.json',
      timestamp: '3',
    })

    const readResult = await readWorkflowDefinition('agent.workflow.test', '1')
    const saveResult = await saveWorkflowDefinition('agent.workflow.test', definition)

    expect(readResult.definition).toBe(definition)
    expect(saveResult.timestamp).toBe('3')
    expect(httpMock.get).toHaveBeenCalledWith(
      '/api/tenants/tenant-a/projects/project-a/workflow-designs/agent.workflow.test/definition.json',
      { timestamp: '1' },
    )
    expect(httpMock.put).toHaveBeenCalledWith(
      '/api/tenants/tenant-a/projects/project-a/workflow-designs/agent.workflow.test/definition.json',
      definition,
    )
  })

  it('falls back to publish when the definition document endpoint is missing', async () => {
    const definition = createAgentWorkflowDefinitionFromDesign(createDesign())
    httpMock.put.mockRejectedValue(new Error(
      'No static resource api/tenants/tenant-a/projects/project-a/workflow-designs/agent.workflow.test/definition.json.',
    ))
    httpMock.post.mockResolvedValue({
      ok: true,
      workflowId: 'agent.workflow.test',
      filename: 'definition.json',
      timestamp: '4',
    })

    const result = await saveWorkflowDefinition('agent.workflow.test', definition)

    expect(result.timestamp).toBe('4')
    expect(httpMock.post).toHaveBeenCalledWith(
      '/api/tenants/tenant-a/projects/project-a/workflow-designs/agent.workflow.test/__publish',
      definition,
    )
  })

  it('parses definition JSON with AgentWorkflowDefinition validation', () => {
    const definition = createAgentWorkflowDefinitionFromDesign(createDesign())

    expect(parseAgentWorkflowDefinitionJson(JSON.stringify(definition))).toEqual(definition)
    expect(() => parseAgentWorkflowDefinitionJson('{"kind":"agent.workflow"}')).toThrow()
  })
})
