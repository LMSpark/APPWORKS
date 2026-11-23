import {describe, expect, it, vi} from 'vitest'
import {DataSet, bindDataSetCommandSubmit, type DataView} from '@spark-appworks/spark-data'
import { LowcodeApiError } from '@/platform-adapters/api'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import config from '../../../../config/pages/shared/agent-workflow-files/pagedata.json'
import {createAgentWorkflowDeletionBindings, AGENT_WORKFLOW_DELETION_TABLE} from '@/platform-adapters/resources/repository/agent-workflow/deletion'

function fixture(configure?: (view: DataView) => void) {
  const files = new Map<string, string>()
  const listings = new Map<string, string[]>([['APP/workflow-designs', ['keep-me', 'delete-me']]])
  let active = true
  const syncListing = (workflowId: string, present: boolean) => {
    const key = 'APP/workflow-designs'
    const current = new Set(listings.get(key) ?? [])
    if (present) current.add(workflowId)
    else current.delete(workflowId)
    listings.set(key, [...current])
  }
  const api = {
    listFiles: vi.fn(async ({folderPath}: {folderPath: string}) => {
      const names = listings.get(folderPath) ?? []
      return names.map(name => ({name, lastModified: 1}))
    }),
    readTextFile: vi.fn(async (locator: {customPath: string; fileName: string}) => {
      const key = `${locator.customPath}/${locator.fileName}`
      const text = files.get(key)
      if (text === undefined) throw new LowcodeApiError(404, 'missing')
      return text
    }),
    removeFile: vi.fn(async (locator: {customPath: string; fileName: string}) => {
      const key = `${locator.customPath}/${locator.fileName}`
      if (!files.has(key)) throw new LowcodeApiError(404, 'missing')
      files.delete(key)
      const workflowId = locator.customPath.split('/').at(-1)
      if (workflowId && ![...files.keys()].some(path => path.startsWith(`${locator.customPath}/`))) {
        syncListing(workflowId, false)
      }
    }),
  }
  files.set('APP/workflow-designs/delete-me/design.json', '{}')
  files.set('APP/workflow-designs/delete-me/definition.json', '{}')
  files.set('APP/workflow-designs/keep-me/design.json', '{}')
  const scenario = new ScenarioViewConfig(config.scenarioId, JSON.stringify(config)), ds = DataSet.fromJson(scenario.toJSON())
  const bindings = createAgentWorkflowDeletionBindings({config: scenario, applicationId: 'APP', api, assertCurrent: () => {
    if (!active) throw new Error('scope stale')
  }})
  const view = ds.getView(AGENT_WORKFLOW_DELETION_TABLE)
  if (!view) throw new Error('formal deletion table missing')
  const factory = bindings.commandBindings?.[AGENT_WORKFLOW_DELETION_TABLE]
  if (!factory) throw new Error('deletion binding missing')
  try {
    configure?.(view)
    bindDataSetCommandSubmit(view, factory(view))
  } catch (error) {
    ds.destroy()
    throw error
  }
  const prepare = async (workflowId = 'delete-me') => {
    await view.loadFromServer()
    const row = await view.addRow({workflowId})
    view.setCurrentRow(row)
    return row
  }
  const save = () => ds.saveChanges({views: [{tableName: view.tableName, viewId: view.viewId}]})
  return {ds, view, files, api, prepare, save, stale: () => {active = false}, syncListing}
}

describe('formal Agent workflow deletion command', () => {
  it('rejects missing workflow in directory listing', async () => {
    const f = fixture()
    try {
      await f.prepare('ghost-workflow')
      await expect(f.save()).rejects.toThrow('不存在')
      expect(f.api.removeFile).not.toHaveBeenCalled()
    } finally {f.ds.destroy()}
  })

  it('deletes definition then design and removes directory entry', async () => {
    const f = fixture()
    try {
      await f.prepare()
      expect((await f.save()).success).toBe(true)
      expect(f.api.removeFile).toHaveBeenCalledTimes(2)
      expect(f.api.removeFile.mock.calls.map(call => call[0]?.fileName)).toEqual(['definition.json', 'design.json'])
      expect(f.files.has('APP/workflow-designs/delete-me/design.json')).toBe(false)
      expect(f.files.has('APP/workflow-designs/delete-me/definition.json')).toBe(false)
    } finally {f.ds.destroy()}
  })

  it('verifies a lost deletion receipt without dispatching the delete again', async () => {
    const f = fixture()
    f.files.delete('APP/workflow-designs/delete-me/definition.json')
    const remove = f.api.removeFile.getMockImplementation()
    if (!remove) throw new Error('missing remove fixture')
    f.api.removeFile.mockImplementation(async locator => {
      await remove(locator)
      throw new Error('lost receipt')
    })
    try {
      await f.prepare()
      await expect(f.save()).rejects.toThrow('lost receipt')
      expect(f.view.hasUnconfirmedSave).toBe(true)
      expect((await f.save()).success).toBe(true)
      expect(f.api.removeFile).toHaveBeenCalledOnce()
    } finally {f.ds.destroy()}
  })

  it('retains a partial deletion for verification when a later read fails', async () => {
    const f = fixture()
    const read = f.api.readTextFile.getMockImplementation()
    if (!read) throw new Error('missing read fixture')
    f.api.readTextFile.mockImplementation(async locator => {
      if (locator.fileName === 'design.json') throw new Error('design read unavailable')
      return read(locator)
    })
    try {
      await f.prepare()
      await expect(f.save()).rejects.toThrow('design read unavailable')
      expect(f.view.hasUnconfirmedSave).toBe(true)
      await expect(f.save()).rejects.toThrow()
      expect(f.view.hasUnconfirmedSave).toBe(true)
      expect(f.api.removeFile).toHaveBeenCalledOnce()
    } finally {f.ds.destroy()}
  })

  it('does not confirm a partial deletion when the directory omits a remaining file', async () => {
    const f = fixture()
    const read = f.api.readTextFile.getMockImplementation()
    if (!read) throw new Error('missing read fixture')
    let fail = true
    f.api.readTextFile.mockImplementation(async locator => {
      if (fail && locator.fileName === 'design.json') throw new Error('design read unavailable')
      return read(locator)
    })
    try {
      await f.prepare()
      await expect(f.save()).rejects.toThrow('design read unavailable')
      fail = false
      f.syncListing('delete-me', false)
      await expect(f.save()).rejects.toThrow('文件仍存在')
      expect(f.view.hasUnconfirmedSave).toBe(true)
      expect(f.api.removeFile).toHaveBeenCalledOnce()
    } finally {f.ds.destroy()}
  })

  it('verifies the original deletion after final directory readback fails', async () => {
    const f = fixture()
    const list = f.api.listFiles.getMockImplementation()
    if (!list) throw new Error('missing list fixture')
    let calls = 0
    f.api.listFiles.mockImplementation(async input => {
      if (++calls === 2) throw new Error('directory readback unavailable')
      return list(input)
    })
    try {
      await f.prepare()
      await expect(f.save()).rejects.toThrow('directory readback unavailable')
      expect(f.view.hasUnconfirmedSave).toBe(true)
      expect((await f.save()).success).toBe(true)
      expect(f.api.removeFile).toHaveBeenCalledTimes(2)
    } finally {f.ds.destroy()}
  })

  it('rejects dotted workflow ids before IO', async () => {
    const f = fixture()
    try {
      await f.prepare('bad.workflow.id')
      await expect(f.save()).rejects.toThrow('AGENT_WORKFLOW_ID_UNSUPPORTED')
      expect(f.api.listFiles).not.toHaveBeenCalled()
    } finally {f.ds.destroy()}
  })
})