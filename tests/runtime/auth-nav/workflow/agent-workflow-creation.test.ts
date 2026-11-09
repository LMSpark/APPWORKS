import {describe, expect, it, vi} from 'vitest'
import {DataSet, bindDataSetCommandSubmit, type DataView} from '@spark-appworks/spark-data'
import {LowcodeApiError} from '@spark-appworks/spark-lowcode-api'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import config from '../../../../config/pages/shared/agent-workflow-files/pagedata.json'
import {createAgentWorkflowCreationBindings, AGENT_WORKFLOW_CREATE_TABLE} from '@/lowcode/resources/repository/agent-workflow/creation'
import {projectWorkflowDesign, AGENT_WORKFLOW_DESIGN_TABLE, AGENT_WORKFLOW_NODE_TABLE, AGENT_WORKFLOW_LINE_TABLE} from '@/lowcode/resources/repository/agent-workflow/agent-workflow-design-projection'

function fixture(configure?: (view: DataView) => void) {
  const files = new Map<string, string>()
  let active = true, failReadback = false
  const api = {readTextFile: vi.fn(async (locator: {fileName: string}) => {
    const text = files.get(locator.fileName); if (text === undefined) throw new LowcodeApiError(404, 'missing')
    return text
  }), readFileBytes: vi.fn(async (locator: {fileName: string}) => {
    const text = files.get(locator.fileName); if (text === undefined) throw new LowcodeApiError(404, 'missing')
    return new TextEncoder().encode(text)
  })}
  const fileUpload = {uploadTextVersion: vi.fn(async (command: {customPath: string; fileName: string; text: string}) => {
    files.set(command.fileName, command.text)
    if (failReadback) throw new Error('ACK/readback unavailable')
    return {state: 'success', filePath: `/DesignFilePaths_publisher/${command.customPath}/${command.fileName}`}
  })}
  const scenario = new ScenarioViewConfig(config.scenarioId, JSON.stringify(config)), ds = DataSet.fromJson(scenario.toJSON())
  const bindings = createAgentWorkflowCreationBindings({config: scenario, applicationId: 'APP', api, fileUpload,
    assertCurrent: () => {if (!active) throw new Error('scope stale')}})
  const view = ds.getView(AGENT_WORKFLOW_CREATE_TABLE)
  if (!view) throw new Error('formal creation table missing')
  const factory = bindings.commandBindings?.[AGENT_WORKFLOW_CREATE_TABLE]
  if (!factory) throw new Error('creation binding missing')
  try {configure?.(view); bindDataSetCommandSubmit(view, factory(view))}
  catch (error) {ds.destroy(); throw error}
  const prepare = async (id = 'owned-workflow', fields: Record<string, unknown> = {title: '测试首稿'}) => {
    await view.loadFromServer()
    const row = await view.addRow({workflowId: id, ...fields})
    view.setCurrentRow(row)
    return row
  }
  const save = () => ds.saveChanges({views: [{tableName: view.tableName, viewId: view.viewId}]})
  return {ds, view, files, api, fileUpload, prepare, save, stale: () => {active = false}, fail: () => {failReadback = true}}
}

describe('formal Agent workflow creation command', () => {
  it('prepares and cancels input without resource IO', async () => {
    const f = fixture()
    try {await f.prepare(); f.view.discardPendingChanges(); expect(f.api.readTextFile).not.toHaveBeenCalled(); expect(f.fileUpload.uploadTextVersion).not.toHaveBeenCalled()}
    finally {f.ds.destroy()}
  })

  it('creates only design.json through the non-replacing SDK and returns an immutable receipt', async () => {
    const f = fixture()
    try {
      await f.prepare(); const row = f.view.currentRow; expect((await f.save()).success).toBe(true)
      expect(f.fileUpload.uploadTextVersion).toHaveBeenCalledOnce()
      expect(f.fileUpload.uploadTextVersion.mock.calls[0]?.[0]).toMatchObject({customPath: 'APP/workflow-designs/owned-workflow', fileName: 'design.json'})
      expect([...f.files.keys()]).toEqual(['design.json'])
      const document = JSON.parse(f.files.get('design.json') ?? '{}')
      expect(document).toMatchObject({id: 'owned-workflow', workflow: {id: 'owned-workflow'}, x_spark: {creation: {commandId: row?.['commandId']}}})
      const projected = projectWorkflowDesign(document, 'owned-workflow')
      expect(projected[AGENT_WORKFLOW_DESIGN_TABLE]).toHaveLength(1)
      expect(projected[AGENT_WORKFLOW_NODE_TABLE]).toHaveLength(3)
      expect(projected[AGENT_WORKFLOW_NODE_TABLE]?.find(node => node['id'] === 'output')?.['desc']).toBe('Workflow output')
      expect(projected[AGENT_WORKFLOW_LINE_TABLE]).toHaveLength(2)
      expect(f.view.fieldAccess(f.view.rows[0]!, 'workflowId').write).toBe('denied')
    } finally {f.ds.destroy()}
  })

  it('rejects an existing design before upload', async () => {
    const f = fixture(); f.files.set('design.json', '{}')
    try {await f.prepare(); await expect(f.save()).rejects.toThrow('已存在'); expect(f.fileUpload.uploadTextVersion).not.toHaveBeenCalled()}
    finally {f.ds.destroy()}
  })

  it('accepts the original optional title and uses the workflow ID as display title', async () => {
    const f = fixture()
    try {
      await f.prepare('untitled-workflow', {}); expect((await f.save()).success).toBe(true)
      expect(JSON.parse(f.files.get('design.json') ?? '{}').x_spark.designer.title).toBe('untitled-workflow')
    } finally {f.ds.destroy()}
  })

  it('rejects a wrong source primary key hidden by a view override', () => {
    expect(() => fixture(view => {
      view.primaryKey = 'commandId'
      const table = view.dataTable; if (!table) throw new Error('missing table')
      table.columns = table.columns.map(column => ({...column, isPrimaryKey: column.name === 'title'}))
    })).toThrow('命令键')
  })

  it('rejects an orphan published definition before upload', async () => {
    const f = fixture(); f.files.set('definition.json', '{}')
    try {await f.prepare(); await expect(f.save()).rejects.toThrow('已存在'); expect(f.fileUpload.uploadTextVersion).not.toHaveBeenCalled()}
    finally {f.ds.destroy()}
  })

  it('rejects scope invalidation during absence lookup before dispatch', async () => {
    const f = fixture()
    f.api.readTextFile.mockImplementation(async () => {f.stale(); throw new LowcodeApiError(404, 'missing')})
    try {await f.prepare(); await expect(f.save()).rejects.toThrow('scope stale'); expect(f.fileUpload.uploadTextVersion).not.toHaveBeenCalled()}
    finally {f.ds.destroy()}
  })

  it('rejects field mapping changed during the final absence lookup', async () => {
    const f = fixture()
    f.api.readTextFile.mockImplementation(async locator => {
      if (locator.fileName === 'definition.json') f.view.fieldProjection = ['commandId', 'workflowId', 'title', 'status'].map(name => ({
        fieldId: name, source: 'resource', resourceFieldId: name, resourceField: name === 'workflowId' ? 'title' : name,
        viewField: name, type: 'string', label: name, output: true, sortOrder: 0, sortDirection: null, group: 0,
        distinct: false, primaryKey: name === 'commandId', value: '', valueFunction: '', expression: '',
      }))
      throw new LowcodeApiError(404, 'missing')
    })
    try {await f.prepare(); await expect(f.save()).rejects.toThrow(); expect(f.fileUpload.uploadTextVersion).not.toHaveBeenCalled(); expect(f.view.hasUnconfirmedSave).toBe(false)}
    finally {f.ds.destroy()}
  })

  it('rejects changed command query declaration before IO', async () => {
    const f = fixture()
    try {await f.prepare(); f.view.queryContext = {other: 'changed'}; await expect(f.save()).rejects.toThrow(); expect(f.api.readTextFile).not.toHaveBeenCalled(); expect(f.fileUpload.uploadTextVersion).not.toHaveBeenCalled()}
    finally {f.ds.destroy()}
  })

  it('rejects an initially misdirected command projection', () => {
    expect(() => fixture(view => {view.fieldProjection = ['commandId', 'workflowId', 'title', 'status'].map(name => ({
      fieldId: name, source: 'resource', resourceFieldId: name, resourceField: name === 'workflowId' ? 'title' : name,
      viewField: name, type: 'string', label: name, output: true, sortOrder: 0, sortDirection: null, group: 0,
      distinct: false, primaryKey: name === 'commandId', value: '', valueFunction: '', expression: '',
    }))})).toThrow('字段')
  })

  it.each([1003, 403, 500])('does not treat business %s as target absence', async code => {
    const f = fixture(); f.api.readTextFile.mockRejectedValue(new LowcodeApiError(code, 'denied'))
    try {await f.prepare(); await expect(f.save()).rejects.toThrow(); expect(f.fileUpload.uploadTextVersion).not.toHaveBeenCalled(); expect(f.view.hasUnconfirmedSave).toBe(false)}
    finally {f.ds.destroy()}
  })

  it('verifies an uncertain attempt by its original command and bytes without a second upload', async () => {
    const f = fixture(); f.fail()
    try {
      await f.prepare(); await expect(f.save()).rejects.toThrow('unavailable')
      expect(f.view.hasUnconfirmedSave).toBe(true)
      expect((await f.save()).success).toBe(true)
      expect(f.fileUpload.uploadTextVersion).toHaveBeenCalledOnce()
      expect(f.view.hasUnconfirmedSave).toBe(false)
    } finally {f.ds.destroy()}
  })

  it('retains unknown when the original target is absent or has different content', async () => {
    const f = fixture(); f.fail()
    try {
      await f.prepare(); await expect(f.save()).rejects.toThrow()
      f.files.delete('design.json'); await expect(f.save()).rejects.toThrow(); expect(f.view.hasUnconfirmedSave).toBe(true)
      f.files.set('design.json', '{}'); await expect(f.save()).rejects.toThrow(); expect(f.view.hasUnconfirmedSave).toBe(true)
      expect(f.fileUpload.uploadTextVersion).toHaveBeenCalledOnce()
    } finally {f.ds.destroy()}
  })

  it.each(['bad.id', 'unknown', '../outside', '-foo', 'a b', 'a'.repeat(129)])('rejects unsupported exact IDs before any IO: %s', async id => {
    const f = fixture()
    try {await f.prepare(id); await expect(f.save()).rejects.toThrow(); expect(f.api.readTextFile).not.toHaveBeenCalled(); expect(f.fileUpload.uploadTextVersion).not.toHaveBeenCalled()}
    finally {f.ds.destroy()}
  })
})


