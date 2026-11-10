import {describe, expect, it, vi} from 'vitest'
import {DataSet, bindDataSetCommandSubmit} from '@spark-appworks/spark-data'
import {LowcodeApiError, type LowcodeDesignApi, type LowcodeDesignFileUpload} from '@spark-appworks/spark-lowcode-api'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import config from '../../../../config/pages/shared/agent-workflow-files/pagedata.json'
import {AGENT_WORKFLOW_PUBLICATION_TABLE, createAgentWorkflowPublicationBindings} from '@/lowcode/resources/repository/agent-workflow/publication'

type FileLocator = Parameters<LowcodeDesignApi['readTextFile']>[0]
type UploadText = Parameters<LowcodeDesignFileUpload['uploadTextVersion']>[0]

const designContent = JSON.stringify({kind: 'agent.workflow.design', version: 1, id: 'alpha', workflow: {id: 'alpha'}})
const definitionContent = JSON.stringify({kind: 'agent.workflow', version: 1, workflowId: 'alpha',
  source: {designKind: 'agent.workflow.design', designId: 'alpha', designVersion: 1}})

function fixture(options: Readonly<{existingDefinition?: string; afterUpload?: () => void | Promise<void>; assertCurrent?: () => void}> = {}) {
  const files = new Map<string, string>([['APP/workflow-designs/alpha/design.json', designContent]])
  if (options.existingDefinition !== undefined) files.set('APP/workflow-designs/alpha/definition.json', options.existingDefinition)
  const readTextFile = vi.fn(async (locator: FileLocator) => {
    const value = files.get(`${locator.customPath}/${locator.fileName}`)
    if (value === undefined) throw new LowcodeApiError(404, 'missing')
    return value
  })
  const readFileBytes = vi.fn(async (locator: FileLocator) => {
    const value = files.get(`${locator.customPath}/${locator.fileName}`)
    if (value === undefined) throw new LowcodeApiError(404, 'missing')
    return new TextEncoder().encode(value)
  })
  const uploadTextVersion = vi.fn(async (command: UploadText) => {
    files.set(`${command.customPath}/${command.fileName}`, command.text)
    await options.afterUpload?.()
    return {state: 'success', filePath: `/DesignFilePaths_publisher/${command.customPath}/${command.fileName}`}
  })
  const scenario = new ScenarioViewConfig(config.scenarioId, JSON.stringify(config))
  const dataSet = DataSet.fromJson(scenario.toJSON())
  const binding = createAgentWorkflowPublicationBindings({config: scenario, applicationId: 'APP',
    api: {readTextFile, readFileBytes}, fileUpload: {uploadTextVersion}, assertCurrent: options.assertCurrent ?? (() => undefined)})
  const view = dataSet.getView(AGENT_WORKFLOW_PUBLICATION_TABLE)
  const factory = binding.commandBindings?.[AGENT_WORKFLOW_PUBLICATION_TABLE]
  if (!view) throw new Error(`formal publication command view is missing: ${scenario.scenarioId}`)
  if (!factory) throw new Error(`formal publication command binding is missing: ${scenario.scenarioId}`)
  bindDataSetCommandSubmit(view, factory(view))
  const save = () => dataSet.saveChanges({views: [{tableName: view.tableName, viewId: view.viewId}]})
  const prepare = async (design = designContent, definition = definitionContent) => {
    await view.loadFromServer()
    const row = await view.addRow({workflowId: 'alpha', designContent: design, definitionContent: definition})
    view.setCurrentRow(row)
    return row
  }
  return {dataSet, view, files, readTextFile, readFileBytes, uploadTextVersion, save, prepare}
}

describe('Agent workflow first publication command', () => {
  it('creates a missing Definition through one non-replacing command and confirms its exact bytes', async () => {
    const state = fixture()
    try {
      await state.prepare()
      expect((await state.save()).success).toBe(true)
      expect(state.uploadTextVersion).toHaveBeenCalledOnce()
      expect(state.uploadTextVersion).toHaveBeenCalledWith({customPath: 'APP/workflow-designs/alpha', fileName: 'definition.json', text: definitionContent})
      expect(state.view.rows).toEqual(expect.arrayContaining([expect.objectContaining({workflowId: 'alpha', status: 'published'})]))
      expect(state.view.hasUnconfirmedSave).toBe(false)
    } finally {state.dataSet.destroy()}
  })

  it('keeps the directory key separate from design and workflow document identities', async () => {
    const state = fixture()
    const design = JSON.stringify({kind: 'agent.workflow.design', version: 7, id: 'design-internal-id', workflow: {id: 'runtime-workflow-id'}})
    const definition = JSON.stringify({kind: 'agent.workflow', version: 1, workflowId: 'runtime-workflow-id',
      source: {designKind: 'agent.workflow.design', designId: 'design-internal-id', designVersion: 7}})
    try {
      state.files.set('APP/workflow-designs/alpha/design.json', design)
      await state.prepare(design, definition)
      expect((await state.save()).success).toBe(true)
      expect(state.uploadTextVersion).toHaveBeenCalledWith({customPath: 'APP/workflow-designs/alpha', fileName: 'definition.json', text: definition})
    } finally {state.dataSet.destroy()}
  })

  it('refuses to overwrite an existing Definition before upload', async () => {
    const state = fixture({existingDefinition: '{"kind":"existing"}'})
    try {
      await state.prepare()
      await expect(state.save()).rejects.toThrow('已存在')
      expect(state.uploadTextVersion).not.toHaveBeenCalled()
      expect(state.files.get('APP/workflow-designs/alpha/definition.json')).toBe('{"kind":"existing"}')
    } finally {state.dataSet.destroy()}
  })

  it('rejects a design that changed after the publication input was captured', async () => {
    const state = fixture()
    try {
      await state.prepare()
      state.files.set('APP/workflow-designs/alpha/design.json', '{"kind":"changed"}')
      await expect(state.save()).rejects.toThrow('设计与发布捕获不同')
      expect(state.uploadTextVersion).not.toHaveBeenCalled()
    } finally {state.dataSet.destroy()}
  })

  it('retains the original command and verifies unknown upload without replay', async () => {
    let active = true
    const state = fixture({afterUpload: () => {throw new Error('response lost')}, assertCurrent: () => {if (!active) throw new Error('scope stale')}})
    try {
      await state.prepare()
      await expect(state.save()).rejects.toThrow('response lost')
      expect(state.view.hasUnconfirmedSave).toBe(true)
      active = false
      await expect(state.save()).rejects.toThrow('scope stale')
      active = true
      await expect(state.save()).resolves.toMatchObject({success: true})
      expect(state.uploadTextVersion).toHaveBeenCalledOnce()
      expect(state.view.hasUnconfirmedSave).toBe(false)
    } finally {state.dataSet.destroy()}
  })

  it.each(['legacy.workflow', 'unknown', 'a b', '-lead'])('rejects an unsupported workflow ID before any IO: %s', async id => {
    const state = fixture()
    try {
      await state.view.loadFromServer()
      const row = await state.view.addRow({workflowId: id, designContent, definitionContent})
      state.view.setCurrentRow(row)
      await expect(state.save()).rejects.toThrow('AGENT_WORKFLOW_ID_UNSUPPORTED')
      expect(state.readTextFile).not.toHaveBeenCalled()
      expect(state.uploadTextVersion).not.toHaveBeenCalled()
    } finally {state.dataSet.destroy()}
  })

  it('keeps unknown when the original Definition bytes differ and does not upload again', async () => {
    const state = fixture({afterUpload: () => {state.files.set('APP/workflow-designs/alpha/definition.json', '{}'); throw new Error('response lost')}})
    try {
      await state.prepare()
      await expect(state.save()).rejects.toThrow('response lost')
      await expect(state.save()).rejects.toThrow('字节仍未确认')
      expect(state.view.hasUnconfirmedSave).toBe(true)
      expect(state.uploadTextVersion).toHaveBeenCalledOnce()
    } finally {state.dataSet.destroy()}
  })
})