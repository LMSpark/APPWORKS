import {describe, expect, it, vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {createAgentWorkflowFileDataViewOwner} from '@/lowcode/resources/repository/agent-workflow/agent-workflow-file-owner'
import {
  AGENT_WORKFLOW_DESIGN_TABLE,
  AGENT_WORKFLOW_LINE_TABLE,
  AGENT_WORKFLOW_NODE_TABLE,
  AGENT_WORKFLOW_VARIABLE_TABLE,
} from '@/lowcode/resources/repository/agent-workflow/agent-workflow-design-projection'
import {agentWorkflowDesignTables} from './agent-workflow-design-fixture'

const design = {
  kind: 'agent.workflow.design', version: 1, id: 'alpha',
  workflow: {id: 'alpha', version: 1, variables: [{name: 'goal', title: '目标'}], graph: {nodes: [
    {id: 'start', type: 'custom', position: {x: 0, y: 0}, data: {type: 'start', title: '开始'}},
    {id: 'loop', type: 'custom', position: {x: 300, y: 0}, data: {type: 'loop', title: '循环', loop: {mode: 'count', subGraph: {nodes: [
      {id: 'inner', type: 'custom', data: {type: 'task', title: '内层'}},
    ], lines: []}}}},
  ], lines: [{id: 'l1', from: {nodeId: 'start', modelId: '', memberName: ''}, to: {nodeId: 'loop', modelId: '', memberName: ''}}]}},
  x_spark: {designer: {title: 'Alpha'}},
}

function catalogSet() {
  const rows = [{rowid: 'SPACE-1', Name: 'Agent工作流文件资源'}]
  const dataSet = DataSet.fromJson({scenarioId: 'CATALOG', tables: {Base_DataSet: {
    modelBinding: {modelId: 'M', modelName: 'Base_DataSet'},
    columns: [{name: 'rowid', type: 'string', isPrimaryKey: true}, {name: 'Name', type: 'string'}], views: {default: {}, catalog: {}},
  }}})
  dataSet.getView('Base_DataSet', 'catalog')!.bindQueryExecutor({executeQuery: async () => ({rows, total: rows.length, rowKey: row => row['rowid'],
    assertIdentity: () => undefined, fieldAccess: () => ({read: 'visible', write: 'denied', component: 'readonly', required: false, writeMode: 'readonly'}),
    readFieldAccess: () => 'visible', addActionState: () => 'disabled', editActionState: () => 'disabled', deleteActionState: () => 'disabled',
    createChildActionState: () => 'disabled', viewActionState: () => 'enabled'})})
  return dataSet
}

async function fixture(options: Readonly<{readback?: (text: string) => string}> = {}) {
  const files = new Map([['design.json', JSON.stringify(design, null, 2)]])
  const fileUpload = {uploadWorkingText: vi.fn(async (command: {fileName: string; text: string}) => {
    files.set(command.fileName, command.text)
    return {fileName: command.fileName, state: 'success' as const}
  })}
  const owner = await createAgentWorkflowFileDataViewOwner({applicationId: 'APP', readScope: () => ({token: 'scope', headers: {'X-AppId': 'APP'}}),
    api: {listFiles: async () => [{name: 'alpha', lastModified: 1}], readTextFile: async input => files.get(input.fileName) ?? '',
      readFileBytes: async input => new TextEncoder().encode((options.readback ?? (text => text))(files.get(input.fileName) ?? ''))},
    fileUpload, catalogScenarioId: 'CATALOG',
    loadScenario: async ({scenarioId}) => scenarioId === 'CATALOG' ? catalogSet() : DataSet.fromJson({scenarioId, tables: {
      AgentWorkflowFiles: {resourceType: 'file', resourceId: 'agent-workflow-files', columns: [
        {name: 'workflowId', type: 'string', isPrimaryKey: true}, {name: 'fileName', type: 'string'},
        {name: 'timestamp', type: 'string'}, {name: 'content', type: 'string'}], views: {default: {}, directory: {}, design: {}, definition: {}}},
      ...agentWorkflowDesignTables(),
    }})})
  await owner.loadDesign('alpha')
  const saveAll = () => owner.dataSet.saveChanges({views: [
    {tableName: AGENT_WORKFLOW_DESIGN_TABLE, viewId: 'design'}, {tableName: AGENT_WORKFLOW_NODE_TABLE, viewId: 'graph'},
    {tableName: AGENT_WORKFLOW_LINE_TABLE, viewId: 'graph'}, {tableName: AGENT_WORKFLOW_NODE_TABLE, viewId: 'child'},
    {tableName: AGENT_WORKFLOW_LINE_TABLE, viewId: 'child'}, {tableName: AGENT_WORKFLOW_VARIABLE_TABLE, viewId: 'design'},
  ]})
  return {owner, files, fileUpload, saveAll, saved: () => JSON.parse(files.get('design.json') ?? '{}')}
}

describe('Agent workflow design projection DataViews', () => {
  it('loads the workflow, main graph and variables as rows and keeps the child graph empty until selected', async () => {
    const {owner} = await fixture()
    try {
      expect(owner.design.workflow.rows).toMatchObject([{workflowId: 'alpha', title: 'Alpha', version: 1}])
      expect(owner.design.nodes.rows.map(row => row['id'])).toEqual(['start', 'loop'])
      expect(owner.design.lines.rows.map(row => row['lineKey'])).toEqual(['workflow.graph#l1'])
      expect(owner.design.variables.rows).toMatchObject([{name: 'goal', title: '目标'}])
      expect(owner.design.childNodes.rows).toEqual([])
      const start = owner.design.nodes.rows[0]!
      expect(owner.design.nodes.fieldAccess(start, 'title')).toMatchObject({read: 'visible', write: 'allowed'})
      expect(owner.design.nodes.fieldAccess(start, 'graphPath')).toMatchObject({write: 'denied'})
      await owner.loadChildGraph('workflow.graph.loop.loop.subGraph')
      expect(owner.design.childNodes.rows.map(row => row['id'])).toEqual(['inner'])
    } finally {owner.dispose()}
  })

  it('writes edits from several tables and both graph views as one design.json upload', async () => {
    const {owner, fileUpload, saveAll, saved} = await fixture()
    try {
      await owner.loadChildGraph('workflow.graph.loop.loop.subGraph')
      const nodes = owner.design.nodes
      nodes.updateEditingValue(nodes.getPkKey(nodes.rows[0]!)!, 'title', '起点')
      const child = owner.design.childNodes
      child.updateEditingValue(child.getPkKey(child.rows[0]!)!, 'x', 40)
      const workflow = owner.design.workflow
      workflow.updateEditingValue(workflow.getPkKey(workflow.rows[0]!)!, 'title', 'Alpha 2')
      await owner.design.lines.removeRow(owner.design.lines.getPkKey(owner.design.lines.rows[0]!)!)

      const result = await saveAll()

      expect(result.success).toBe(true)
      expect(fileUpload.uploadWorkingText).toHaveBeenCalledOnce()
      const document = saved()
      expect(document.workflow.graph.nodes[0].data.title).toBe('起点')
      expect(document.workflow.graph.nodes[1].data.loop.subGraph.nodes[0].position).toEqual({x: 40})
      expect(document.workflow.graph.lines).toEqual([])
      expect(document.x_spark.designer.title).toBe('Alpha 2')
      expect(nodes.rows[0]?.['title']).toBe('起点')
      expect(nodes.dirtyTracking.hasPendingChanges()).toBe(false)
      expect(owner.design.lines.rows).toEqual([])
    } finally {owner.dispose()}
  })

  it('rejects a save when design.json changed after the views were read and keeps the edits', async () => {
    const {owner, files, fileUpload, saveAll} = await fixture()
    try {
      const nodes = owner.design.nodes
      const id = nodes.getPkKey(nodes.rows[0]!)!
      nodes.updateEditingValue(id, 'title', '起点')
      files.set('design.json', JSON.stringify({...design, id: 'changed-elsewhere'}))
      await expect(saveAll()).rejects.toThrow('AGENT_WORKFLOW_FILE_CONFLICT')
      expect(fileUpload.uploadWorkingText).not.toHaveBeenCalled()
      expect(nodes.dirtyTracking.hasPendingChanges(id)).toBe(true)
    } finally {owner.dispose()}
  })

  it('keeps a readback mismatch pending and confirms it on resubmit without a second upload', async () => {
    let corrupt = true
    const {owner, fileUpload, saveAll, saved} = await fixture({readback: text => corrupt ? `${text} ` : text})
    try {
      const nodes = owner.design.nodes
      nodes.updateEditingValue(nodes.getPkKey(nodes.rows[0]!)!, 'title', '起点')
      await expect(saveAll()).rejects.toThrow('AGENT_WORKFLOW_FILE_READBACK')
      expect(nodes.hasUnconfirmedSave).toBe(true)
      corrupt = false
      expect((await saveAll()).success).toBe(true)
      expect(fileUpload.uploadWorkingText).toHaveBeenCalledOnce()
      expect(nodes.hasUnconfirmedSave).toBe(false)
      expect(saved().workflow.graph.nodes[0].data.title).toBe('起点')
    } finally {owner.dispose()}
  })

  it('adds a node to the main graph through the graph view with the projection key', async () => {
    const {owner, saveAll, saved} = await fixture()
    try {
      await owner.design.nodes.addRow({id: 'task', type: 'custom',
        dataType: 'task', title: '任务', x: 600, y: 0})
      expect((await saveAll()).success).toBe(true)
      expect(saved().workflow.graph.nodes.map((node: {id: string}) => node.id)).toEqual(['start', 'loop', 'task'])
      expect(owner.design.nodes.rows.find(row => row['id'] === 'task')).toMatchObject({order: 2, title: '任务'})
    } finally {owner.dispose()}
  })
})
