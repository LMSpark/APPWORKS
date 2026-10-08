import {describe, expect, it, vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {DataSpaceRuntimeApi, type DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {ProjectWorkspace, type ScenarioViewFile} from '@spark-appworks/spark-project-model'
import {HttpClientBase, isRecord, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {LowcodeDataSpaceAssembler} from '../../../../../src/lowcode/data-space/lowcode-data-space-assembler'
import {LowcodeDataSpaceViewDesign} from '../../../../../src/lowcode/data-space/view-design/lowcode-data-space-view-design'

type FormalModel = Awaited<ReturnType<DataSpaceDesignApi['readModel']>>
const targetId = 'SPACE'
const initial = JSON.stringify({scenarioId: targetId, tables: {
  Parents: {modelBinding: {modelId: 'ParentModel', modelName: 'ParentModel'},
    views: {default: {}, shared: {pageSize: 10}}},
  Children: {modelBinding: {modelId: 'ChildModel', modelName: 'ChildModel'},
    views: {default: {}, shared: {pageSize: 15}}},
}, viewCascades: []})

function model(id: string): FormalModel {
  return {id, name: id, metaName: id, sourceName: id, sourceId: 'DB', sourceType: 'table',
    primaryKey: 'id', businessMain: false, raw: {}, fields: [{id: `${id}-id`, modelId: id,
      name: 'id', canonicalName: 'id', type: 'string', primaryKey: true, description: '',
      output: true, computed: false, order: 0, orderType: '', raw: {}}]}
}

class QueryHttp extends HttpClientBase {
  protected override async executeRequest(_config: RequestConfig): Promise<HttpResponse<unknown>> {
    throw new Error('definition projection must not query rows')
  }
}

function fixture(text: string | null = initial) {
  const stored = new Map<string, string>()
  if (text !== null) stored.set(targetId, text)
  let scope = 'SCOPE'
  let assembleGate: Promise<void> | null = null
  let candidateReady: (() => void) | null = null
  let writes = 0
  let failAfterWrite = false
  let models = [model('ParentModel'), model('ChildModel')]
  const openOwner = () => {
    const workspace = new ProjectWorkspace({projectId: 'APP',
      pageFiles: {readPageFile: async () => {throw new Error('unexpected page read')}},
      blueprint: {loadRoot: async () => ({children: []})},
      scenarioViews: {readScope: () => scope,
        readText: async scenarioId => stored.get(scenarioId) ?? null,
        writeText: async (scenarioId, value) => {
          writes++
          stored.set(scenarioId, value)
          if (failAfterWrite) {failAfterWrite = false; throw new Error('response lost after write')}
        }},
    })
    const http = new QueryHttp()
    const runtime = new DataSpaceRuntimeApi({http, readScope: () => ({token: scope, headers: {}})})
    const assembler = new LowcodeDataSpaceAssembler(runtime, http)
    const produced: DataSet[] = []
    const metadata: DataSet[] = []
    const service = new LowcodeDataSpaceViewDesign({workspace,
      assertScope: () => {if (scope !== 'SCOPE') throw new Error('STALE_SCOPE')},
      loadMetadata: async id => {
        expect(id).toBe(targetId)
        const dataSet = DataSet.fromJson({scenarioId: 'META', dataSetName: 'META', tables: {}})
        metadata.push(dataSet)
        return dataSet
      },
      readModel: async input => {
        const found = models.find(candidate => candidate.id === input.modelId)
        if (!found) throw new Error('formal model missing')
        return found
      },
      assemble: async (id: string, file: ScenarioViewFile) => {
        if (id !== file.scenarioId) throw new Error('wrong target')
        const result = assembler.assemble({config: file.value, space: {dataSpaceId: id, name: '正式空间名称'}, models, relations: []})
        produced.push(result.dataSet)
        candidateReady?.()
        await assembleGate
        return result
      },
    })
    return {workspace, service, produced, metadata}
  }
  return {stored, openOwner, setScope: (value: string) => {scope = value},
    setModels: (next: FormalModel[]) => {models = next},
    setRemote: (value: string | null) => {if (value === null) stored.delete(targetId); else stored.set(targetId, value)},
    failNextWrite: () => {failAfterWrite = true}, get writes() {return writes},
    holdAssembly: (gate: Promise<void> | null) => {
      assembleGate = gate
      return new Promise<void>(resolve => {candidateReady = resolve})
    }}
}

const parent = {tableName: 'Parents', modelId: 'ParentModel', modelName: 'ParentModel', viewId: 'shared'}

describe('single-target data-space design session', () => {
  it('persists table categories through definition and view edits, and clears only the selected table', async () => {
    const storage = fixture()
    const owner = storage.openOwner()
    const session = await owner.service.openDesignSession(targetId)
    const draft = JSON.parse(session.viewState!.text)
    draft.tables.Parents.businessCategory = 'master'
    draft.tables.Children.businessCategory = '  partner-specific  '
    await session.stageDefinition({expectedText: session.viewState!.text, text: JSON.stringify(draft)})
    expect(session.definitionDataSet?.getTable('Parents')?.businessCategory).toBe('master')
    expect(session.definitionDataSet?.getTable('Children')?.businessCategory).toBe('  partner-specific  ')
    await session.stageView({...parent, expectedText: session.viewState!.text, configuration: {pageSize: 22}})
    expect(session.definitionDataSet?.getTable('Parents')?.businessCategory).toBe('master')
    const stagedText = session.viewState!.text
    const invalid = JSON.parse(stagedText)
    invalid.tables.Parents.businessCategory = null
    const projection = session.definitionDataSet
    await expect(session.stageDefinition({expectedText: stagedText, text: JSON.stringify(invalid)}))
      .rejects.toThrow('businessCategory')
    expect(session.viewState!.text).toBe(stagedText)
    expect(session.definitionDataSet).toBe(projection)
    await session.saveViews()
    expect(storage.stored.get(targetId)).toBe(stagedText)
    session.dispose()

    const reopened = storage.openOwner()
    const again = await reopened.service.openDesignSession(targetId)
    expect(again.definitionDataSet?.getTable('Parents')?.businessCategory).toBe('master')
    expect(again.definitionDataSet?.getTable('Children')?.businessCategory).toBe('  partner-specific  ')
    const table = again.definitionDataSet?.getTable('Parents')
    if (!table) throw new Error('missing projection table')
    table.businessCategory = 'reference'
    await expect(again.saveViews()).rejects.toThrow('PROJECTION_EDIT')
    await again.refresh()
    const cleared = JSON.parse(again.viewState!.text)
    delete cleared.tables.Parents.businessCategory
    await again.stageDefinition({expectedText: again.viewState!.text, text: JSON.stringify(cleared)})
    await again.saveViews()
    again.dispose()

    const last = storage.openOwner()
    const verified = await last.service.openDesignSession(targetId)
    expect(verified.definitionDataSet?.getTable('Parents')?.businessCategory).toBeUndefined()
    expect(verified.definitionDataSet?.getTable('Children')?.businessCategory).toBe('  partner-specific  ')
    expect(verified.definitionDataSet?.getView('Parents', 'shared')?.pageSize).toBe(22)
    verified.dispose()
  })
  it('stages local display references but rejects remote computed references before changing the draft', async () => {
    const config: unknown = JSON.parse(initial)
    if (!isRecord(config) || !isRecord(config['tables']) || !isRecord(config['tables']['Parents'])) {
      throw new Error('missing fixture table')
    }
    config['tables']['Parents']['columns'] = [{name: 'display', type: 'string', computeExpression: 'id + "!"'}]
    const storage = fixture(JSON.stringify(config))
    const owner = storage.openOwner()
    const session = await owner.service.openDesignSession(targetId)
    const staged = await session.stageView({...parent, expectedText: session.viewState!.text,
      configuration: {labelField: 'display', valueField: 'display',
        aggregates: {displayCount: {type: 'count', field: 'display'}},
        treeConfig: {idField: 'id', textField: 'display'}}})
    expect(staged.dirty).toBe(true)
    expect(session.definitionDataSet?.getView('Parents', 'shared')?.labelField).toBe('display')
    const before = session.viewState!.text
    for (const view of [
      {sortExpression: [{field: 'display', direction: 'asc'}]},
      {filterExpression: {field: 'display', operator: 'eq', value: 'x'}},
      {treeConfig: {idField: 'display', textField: 'display'}},
    ]) {
      const next: unknown = JSON.parse(before)
      if (!isRecord(next) || !isRecord(next['tables']) || !isRecord(next['tables']['Parents'])
        || !isRecord(next['tables']['Parents']['views'])) throw new Error('missing view')
      const views = next['tables']['Parents']['views']
      if (!isRecord(views['shared'])) throw new Error('missing shared view')
      views['shared'] = {...views['shared'], ...view}
      await expect(session.stageDefinition({expectedText: before, text: JSON.stringify(next)}))
        .rejects.toThrow('本地计算列不能用于远端查询')
      expect(session.viewState!.text).toBe(before)
    }
    const invalid: unknown = JSON.parse(before)
    if (!isRecord(invalid) || !isRecord(invalid['tables']) || !isRecord(invalid['tables']['Parents'])) {
      throw new Error('missing invalid candidate')
    }
    invalid['tables']['Parents']['columns'] = [{name: 'display', type: 'string', computeExpression: 'id + ('}]
    await expect(session.stageDefinition({expectedText: before, text: JSON.stringify(invalid)})).rejects.toThrow()
    expect(session.viewState!.text).toBe(before)
    storage.setModels([{...model('ParentModel'), fields: [...model('ParentModel').fields,
      {id: 'DISPLAY', modelId: 'ParentModel', name: 'display', canonicalName: 'display', type: 'string',
        primaryKey: false, description: '', output: true, computed: false, order: 1, orderType: '', raw: {}}]},
    model('ChildModel')])
    await expect(session.stageView({...parent, expectedText: before, configuration: {pageSize: 42}}))
      .rejects.toThrow('本地计算列与正式输出字段重名')
    expect(session.viewState!.text).toBe(before)
    session.dispose()
  })
  it('rejects stageView before editing when a retained column loses its formal output', async () => {
    const withColumn: unknown = JSON.parse(initial)
    if (!isRecord(withColumn) || !isRecord(withColumn['tables'])
      || !isRecord(withColumn['tables']['Parents'])) throw new Error('missing fixture table')
    withColumn['tables']['Parents']['columns'] = [{name: 'id', required: true}]
    const storage = fixture(JSON.stringify(withColumn))
    const owner = storage.openOwner()
    const session = await owner.service.openDesignSession(targetId)
    const before = session.viewState!.text
    const projection = session.definitionDataSet
    storage.setModels([{...model('ParentModel'), fields: []}, model('ChildModel')])
    await expect(session.stageView({...parent, expectedText: before,
      configuration: {pageSize: 42}})).rejects.toThrow('SCENARIO_VIEW_FIELD')
    expect(session.viewState!.text).toBe(before)
    expect(session.definitionDataSet).toBe(projection)
    expect(session.definitionDataSet?.getView('Parents', 'shared')?.pageSize).toBe(10)
    session.dispose()
  })
  it('stages a complete native definition, saves it and keeps rejected candidates out of the draft', async () => {
    const storage = fixture()
    const owner = storage.openOwner()
    const session = await owner.service.openDesignSession(targetId)
    const original = session.viewState!.text
    const draft: unknown = JSON.parse(original)
    if (!isRecord(draft) || !isRecord(draft['tables']) || !isRecord(draft['tables']['Parents'])) {
      throw new Error('missing fixture table')
    }
    draft['tables']['Parents']['columns'] = [{name: 'id', required: true, minLength: 2}]
    const text = JSON.stringify(draft)
    const projection = session.definitionDataSet!
    const bad: unknown = JSON.parse(text)
    if (!isRecord(bad) || !isRecord(bad['tables']) || !isRecord(bad['tables']['Parents'])) {
      throw new Error('missing fixture table')
    }
    bad['tables']['Parents']['columns'] = [{name: 'absent', required: true}]
    await expect(session.stageDefinition({expectedText: original, text: JSON.stringify(bad)}))
      .rejects.toThrow('未解析到唯一正式输出字段')
    expect(session.viewState!.text).toBe(original)
    expect(session.definitionDataSet).toBe(projection)
    const staged = await session.stageDefinition({expectedText: original, text})
    expect(staged.text).toBe(text)
    expect(session.definitionDataSet?.getTable('Parents')?.columns.find(column => column.name === 'id')?.required).toBe(true)
    expect(session.definitionDataSet?.getTable('Children')?.columns.find(column => column.name === 'id')?.required).toBeUndefined()
    await session.stageView({...parent, expectedText: staged.text, configuration: {pageSize: 31}})
    expect(session.definitionDataSet?.getTable('Parents')?.columns.find(column => column.name === 'id')?.required).toBe(true)
    const persistedText = session.viewState!.text
    await session.saveViews()
    session.dispose()
    const reopened = storage.openOwner()
    const again = await reopened.service.openDesignSession(targetId)
    expect(again.definitionDataSet?.getTable('Parents')?.columns.find(column => column.name === 'id')?.minLength).toBe(2)
    expect(storage.stored.get(targetId)).toBe(persistedText)
    again.dispose()
  })

  it('rejects a late definition candidate after the shared draft changes and disposes it', async () => {
    const storage = fixture()
    const owner = storage.openOwner()
    const session = await owner.service.openDesignSession(targetId)
    let release!: () => void
    const produced = storage.holdAssembly(new Promise<void>(resolve => {release = resolve}))
    const text = initial.replace('"pageSize":10', '"pageSize":40')
    const pending = session.stageDefinition({expectedText: initial, text})
    await produced
    const candidate = owner.produced.at(-1)!
    owner.workspace.getScenarioViews(targetId)!.setText(initial.replace('"pageSize":10', '"pageSize":25'))
    release()
    await expect(pending).rejects.toThrow('STALE')
    expect(candidate.destroyed).toBe(true)
    expect(owner.workspace.getScenarioViews(targetId)!.getText()).not.toBe(text)
    session.dispose()
  })

  it('disposes a late definition candidate when scope expires or the session is released', async () => {
    for (const reason of ['scope', 'dispose'] as const) {
      const storage = fixture()
      const owner = storage.openOwner()
      const session = await owner.service.openDesignSession(targetId)
      const file = owner.workspace.getScenarioViews(targetId)!
      let release!: () => void
      const produced = storage.holdAssembly(new Promise<void>(resolve => {release = resolve}))
      const pending = session.stageDefinition({expectedText: initial,
        text: initial.replace('"pageSize":10', '"pageSize":40')})
      await produced
      const candidate = owner.produced.at(-1)!
      if (reason === 'scope') storage.setScope('OTHER')
      else session.dispose()
      release()
      await expect(pending).rejects.toThrow(reason === 'scope' ? 'STALE_SCOPE' : 'DISPOSED')
      expect(candidate.destroyed).toBe(true)
      expect(file.getText()).toBe(initial)
      session.dispose()
    }
  })

  it('applies only the definition text validated before asynchronous assembly', async () => {
    const storage = fixture()
    const owner = storage.openOwner()
    const session = await owner.service.openDesignSession(targetId)
    let release!: () => void
    const produced = storage.holdAssembly(new Promise<void>(resolve => {release = resolve}))
    const verified = initial.replace('"pageSize":10', '"pageSize":40')
    const input = {expectedText: initial, text: verified}
    const pending = session.stageDefinition(input)
    await produced
    input.text = initial.replace('"pageSize":10', '"pageSize":99')
    release()
    const staged = await pending
    expect(staged.text).toBe(verified)
    expect(session.definitionDataSet?.getView('Parents', 'shared')?.pageSize).toBe(40)
    session.dispose()
  })
  it('opens model-owned native views, stages, saves and reopens through the same file owner', async () => {
    const storage = fixture()
    const first = storage.openOwner()
    const session = await first.service.openDesignSession(targetId)
    expect(session.targetId).toBe(targetId)
    expect(session.metadataDataSet.scenarioId).toBe('META')
    expect(session.definitionDataSet?.scenarioId).toBe(targetId)
    expect(session.definitionDataSet?.getView('Parents', 'shared')?.pageSize).toBe(10)
    expect(session.definitionDataSet?.getView('Children', 'shared')?.pageSize).toBe(15)
    expect(session.definitionDataSet?.getTable('Parents')?.columns.map(column => column.name)).toContain('id')
    const oldProjection = session.definitionDataSet!
    const destroy = vi.spyOn(oldProjection, 'destroy')
    const staged = await session.stageView({...parent, expectedText: session.viewState!.text,
      configuration: {pageSize: 30, queryContext: {formid: 'PARENT'}}})
    expect(destroy).toHaveBeenCalledOnce()
    expect(staged.dirty).toBe(true)
    expect(session.definitionDataSet?.getView('Parents', 'shared')?.pageSize).toBe(30)
    expect(session.definitionDataSet?.getView('Children', 'shared')?.pageSize).toBe(15)
    const saved = await session.saveViews()
    expect(saved).toMatchObject({persisted: true, dirty: false})
    expect(storage.stored.get(targetId)).toBe(saved.text)
    expect(saved.text).not.toMatch(/"columns"|"rows"|"lingma_sys_/)
    session.dispose()
    const reopened = storage.openOwner()
    const again = await reopened.service.openDesignSession(targetId)
    expect(again.definitionDataSet?.getView('Parents', 'shared')?.pageSize).toBe(30)
    expect(again.definitionDataSet?.getView('Children', 'shared')?.pageSize).toBe(15)
    expect(again.definitionDataSet?.getView('Parents', 'shared')?.queryContext).toEqual({formid: 'PARENT'})
    again.dispose()
  })

  it('keeps formal metadata available when the file is absent and creates only on explicit command', async () => {
    const storage = fixture(null)
    const owner = storage.openOwner()
    const session = await owner.service.openDesignSession(targetId)
    expect(session.metadataDataSet.scenarioId).toBe('META')
    expect(session.viewState).toBeNull()
    expect(session.definitionDataSet).toBeNull()
    expect(storage.stored.has(targetId)).toBe(false)
    const created = await session.createView({...parent, viewId: 'first'})
    expect(created).toMatchObject({persisted: false, dirty: true})
    expect(session.definitionDataSet?.getView('Parents', 'first')).toBeDefined()
    expect(storage.stored.has(targetId)).toBe(false)
    await session.saveViews()
    expect(storage.stored.has(targetId)).toBe(true)
    session.dispose()
  })

  it('rejects malformed and wrong-bound files without treating them as absent', async () => {
    for (const text of ['{broken', initial.replace('"modelId":"ParentModel"', '"modelId":"OTHER"')]) {
      const owner = fixture(text).openOwner()
      await expect(owner.service.openDesignSession(targetId)).rejects.toThrow()
      expect(owner.metadata).toHaveLength(1)
    }
  })

  it('invalidates projections after external edits and undo without losing the shared draft', async () => {
    const owner = fixture().openOwner()
    const session = await owner.service.openDesignSession(targetId)
    const second = await owner.service.openDesignSession(targetId)
    const old = session.definitionDataSet!
    const destroy = vi.spyOn(old, 'destroy')
    const file = owner.workspace.getScenarioViews(targetId)!
    file.setText(initial.replace('"pageSize":10', '"pageSize":25'))
    expect(destroy).toHaveBeenCalledOnce()
    expect(() => session.definitionDataSet).toThrow('STALE')
    expect(() => second.definitionDataSet).toThrow('STALE')
    await session.refresh()
    expect(session.definitionDataSet?.getView('Parents', 'shared')?.pageSize).toBe(25)
    file.undo()
    expect(() => session.definitionDataSet).toThrow('STALE')
    await second.refresh()
    expect(second.definitionDataSet?.getView('Parents', 'shared')?.pageSize).toBe(10)
    session.dispose()
    expect(second.definitionDataSet?.getView('Parents', 'shared')).toBeDefined()
    second.dispose()
  })

  it('rejects stale scope and destroys a late assembly after disposal', async () => {
    const storage = fixture()
    const owner = storage.openOwner()
    const session = await owner.service.openDesignSession(targetId)
    const accepted = session.definitionDataSet!
    storage.setScope('OTHER')
    expect(() => session.definitionDataSet).toThrow('STALE_SCOPE')
    expect(accepted.destroyed).toBe(true)
    expect(session.metadataDataSet.destroyed).toBe(true)

    const late = fixture()
    const lateOwner = late.openOwner()
    const opened = await lateOwner.service.openDesignSession(targetId)
    let release!: () => void
    const produced = late.holdAssembly(new Promise<void>(resolve => {release = resolve}))
    const refreshing = opened.refresh()
    await produced
    const candidate = lateOwner.produced.at(-1)!
    opened.dispose()
    release()
    await expect(refreshing).rejects.toThrow('DISPOSED')
    expect(candidate.destroyed).toBe(true)
    expect(() => opened.definitionDataSet).toThrow('DISPOSED')
  })

  it('disposes metadata and the produced candidate when scope expires during assembly', async () => {
    const storage = fixture()
    const owner = storage.openOwner()
    let release!: () => void
    const produced = storage.holdAssembly(new Promise<void>(resolve => {release = resolve}))
    const pending = owner.service.openDesignSession(targetId)
    await produced
    const candidate = owner.produced.at(-1)!
    storage.setScope('OTHER')
    release()
    await expect(pending).rejects.toThrow('STALE_SCOPE')
    expect(candidate.destroyed).toBe(true)
    expect(owner.metadata[0]?.destroyed).toBe(true)
  })

  it('releases an accepted projection when the shared file owner is removed', async () => {
    const storage = fixture()
    const owner = storage.openOwner()
    const session = await owner.service.openDesignSession(targetId)
    const accepted = session.definitionDataSet!
    const revision = session.viewState!.revision
    storage.setRemote(null)
    await owner.workspace.adoptScenarioViews({scenarioId: targetId, expectedRevision: revision,
      previewText: null})
    expect(() => session.definitionDataSet).toThrow('STALE')
    expect(accepted.destroyed).toBe(true)
    await session.refresh()
    expect(session.definitionDataSet).toBeNull()
    expect(session.metadataDataSet.destroyed).toBe(false)
    session.dispose()
  })

  it('verifies an unknown save in the same target without replaying the write', async () => {
    const storage = fixture()
    const owner = storage.openOwner()
    const session = await owner.service.openDesignSession(targetId)
    await session.stageView({...parent, expectedText: session.viewState!.text,
      configuration: {pageSize: 33}})
    storage.failNextWrite()
    await expect(session.saveViews()).rejects.toThrow('response lost after write')
    expect(session.viewState?.saveStatus).toBe('unknown')
    await expect(session.saveViews()).rejects.toThrow('SAVE_PENDING')
    expect(storage.writes).toBe(1)
    const verified = await session.verifyViews()
    expect(verified).toMatchObject({outcome: 'confirmed', state: {saveStatus: 'idle', dirty: false}})
    expect(storage.writes).toBe(1)
    expect(session.definitionDataSet?.getView('Parents', 'shared')?.pageSize).toBe(33)
    session.dispose()
  })

  it('previews and adopts a conflicting remote file in the same target', async () => {
    const storage = fixture()
    const owner = storage.openOwner()
    const session = await owner.service.openDesignSession(targetId)
    await session.stageView({...parent, expectedText: session.viewState!.text,
      configuration: {pageSize: 22}})
    const remote = initial.replace('"pageSize":10', '"pageSize":44')
    storage.setRemote(remote)
    await expect(session.saveViews()).rejects.toThrow('CONFLICT')
    expect(storage.writes).toBe(0)
    expect(await session.previewRemoteViews()).toBe(remote)
    const adopted = await session.adoptViews({expectedRevision: session.viewState!.revision, previewText: remote})
    expect(adopted?.text).toBe(remote)
    expect(session.definitionDataSet?.getView('Parents', 'shared')?.pageSize).toBe(44)
    session.dispose()
  })

  it('rejects direct projection edits before staging or saving', async () => {
    const owner = fixture().openOwner()
    const session = await owner.service.openDesignSession(targetId)
    const view = session.definitionDataSet?.getView('Parents', 'shared')
    if (!view) throw new Error('missing projection view')
    view.pageSize = 99
    await expect(session.saveViews()).rejects.toThrow('PROJECTION_EDIT')
    await expect(session.stageView({...parent, expectedText: session.viewState!.text,
      configuration: {pageSize: 20}})).rejects.toThrow('PROJECTION_EDIT')
    await session.refresh()
    expect(session.definitionDataSet?.getView('Parents', 'shared')?.pageSize).toBe(10)
    session.dispose()
  })

  it('rejects direct table-column edits in the native definition projection', async () => {
    const owner = fixture().openOwner()
    const session = await owner.service.openDesignSession(targetId)
    const table = session.definitionDataSet?.getTable('Parents')
    if (!table) throw new Error('missing projection table')
    table.columns.push({name: 'injected', type: 'string'})
    await expect(session.saveViews()).rejects.toThrow('PROJECTION_EDIT')
    await session.refresh()
    expect(session.definitionDataSet?.getTable('Parents')?.columns.map(column => column.name))
      .not.toContain('injected')
    session.dispose()
  })
})
