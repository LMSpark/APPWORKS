import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {describe, expect, it} from 'vitest'
import {
  AGENT_WORKFLOW_DESIGN_TABLE,
  AGENT_WORKFLOW_LINE_TABLE,
  AGENT_WORKFLOW_NODE_TABLE,
  AGENT_WORKFLOW_VARIABLE_TABLE,
  applyWorkflowDesignChanges,
  composeWorkflowDesign,
  projectWorkflowDesign,
} from '@/lowcode/resources/repository/agent-workflow/agent-workflow-design-projection'

const sample = (name: string): unknown => JSON.parse(readFileSync(resolve(process.cwd(),
  `config/agent-workflows/lmspark/homepage/${name}/design.json`), 'utf8'))

const nested = {
  kind: 'agent.workflow.design', version: 1, id: 'demo', custom: {keep: true},
  workflow: {
    id: 'demo', version: 2, variables: [{name: 'goal', title: '目标', defaultValue: null, tag: 'x'}],
    graph: {id: 'main', viewport: {zoom: 1}, nodes: [
      {id: 'start', type: 'custom', position: {x: 1, y: 2, locked: true}, data: {type: 'start', title: '开始', note: 'n'}},
      {id: 'loop', type: 'custom', data: {type: 'loop', title: null, loop: {mode: 'count', maxLoopCount: 3, subGraph: {id: 'sub', nodes: [
        {id: 'inner', type: 'custom', data: {type: 'task'}},
      ], lines: []}}}},
      {id: 'bare', type: 'custom'},
    ], lines: [
      {from: {nodeId: 'start', modelId: 'm', memberName: 'out', dock: 1, side: 'r'}, to: {nodeId: 'loop', modelId: 'm', memberName: 'in'},
        type: 'custom', data: {relation: 'next', branch: {label: 'default'}, visual: {lineType: 'bezier', controlPoints: [{x: 3, y: 4}], color: 'red'}}},
    ]},
  },
  x_spark: {designer: {title: '演示', layout: 'lr'}, draft: {status: 'saved'}},
}

describe('Agent workflow design projection', () => {
  it.each(['agent.workflow.pageDesign', 'agent.workflow.projectPlanning'])('round-trips the %s sample without loss', name => {
    const document = sample(name)
    expect(composeWorkflowDesign(projectWorkflowDesign(document, name))).toEqual(document)
  })

  it('expands nested sub-graphs by graphPath and keeps nulls, extras and id-less lines', () => {
    const rows = projectWorkflowDesign(nested, 'demo')
    expect(rows[AGENT_WORKFLOW_NODE_TABLE].map(row => row['nodeKey'])).toEqual([
      'workflow.graph#start', 'workflow.graph.loop.loop.subGraph#inner', 'workflow.graph#loop', 'workflow.graph#bare'])
    expect(rows[AGENT_WORKFLOW_NODE_TABLE][0]).toMatchObject({x: 1, y: 2, title: '开始', dataType: 'start'})
    expect(rows[AGENT_WORKFLOW_LINE_TABLE][0]).toMatchObject({lineKey: 'workflow.graph#@0', fromDock: 1, lineType: 'bezier',
      controlPoints: [{x: 3, y: 4}], relation: 'next'})
    expect(rows[AGENT_WORKFLOW_DESIGN_TABLE][0]).toMatchObject({workflowId: 'demo', title: '演示', version: 2})
    expect(composeWorkflowDesign(rows)).toEqual(nested)
  })

  it('applies one batch of node, line and variable changes to the baseline document', () => {
    const rows = projectWorkflowDesign(nested, 'demo')
    const start = rows[AGENT_WORKFLOW_NODE_TABLE][0]
    const inner = rows[AGENT_WORKFLOW_NODE_TABLE][1]
    const line = rows[AGENT_WORKFLOW_LINE_TABLE][0]
    const next = applyWorkflowDesignChanges(nested, 'demo', {
      [AGENT_WORKFLOW_NODE_TABLE]: {
        changed: [{...start, title: '起点', x: 10}],
        added: [{nodeKey: 'workflow.graph.loop.loop.subGraph#added', graphPath: 'workflow.graph.loop.loop.subGraph', id: 'added',
          order: null, type: 'custom', dataType: 'task', title: '新增'}],
        deleted: [inner!],
      },
      [AGENT_WORKFLOW_LINE_TABLE]: {deleted: [line!]},
      [AGENT_WORKFLOW_VARIABLE_TABLE]: {added: [{name: 'extra', order: null, title: '附加'}]},
    })
    const graph = (next['workflow'] as typeof nested.workflow).graph
    expect(graph.nodes[0]).toEqual({id: 'start', type: 'custom', position: {x: 10, y: 2, locked: true}, data: {type: 'start', title: '起点', note: 'n'}})
    expect(graph.lines).toEqual([])
    expect(graph.nodes[1]?.data?.loop?.subGraph?.nodes).toEqual([{id: 'added', type: 'custom', data: {type: 'task', title: '新增'}}])
    expect((next['workflow'] as typeof nested.workflow).variables.map(item => item.name)).toEqual(['goal', 'extra'])
  })

  it('rejects changes to rows that are not in the baseline and duplicate identities', () => {
    expect(() => applyWorkflowDesignChanges(nested, 'demo', {[AGENT_WORKFLOW_NODE_TABLE]: {changed: [{nodeKey: 'workflow.graph#missing'}]}}))
      .toThrow('不在基线中')
    const duplicated = structuredClone(nested)
    duplicated.workflow.graph.nodes.push({id: 'start', type: 'custom'})
    expect(() => projectWorkflowDesign(duplicated, 'demo')).toThrow('节点 id 重复')
  })
})
