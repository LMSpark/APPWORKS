import {describe, expect, it, vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {ProjectWorkspace} from '@spark-appworks/spark-project-model'

describe('workspace definition DataSet lifetime', () => {
  it('releases owned definitions and rejects pending returns when the workspace is disposed', async () => {
    const loaded = DataSet.fromJson({scenarioId: 'C', tables: {}}), late = DataSet.fromJson({scenarioId: 'C', tables: {}})
    let release!: (dataSet: DataSet) => void
    const waiting = new Promise<DataSet>(resolve => {release = resolve})
    const workspace = new ProjectWorkspace({projectId: 'APP', blueprint: {}, scenarioViews: {readScope: () => 'scope', readText: async () => null},
      scenarioDefinitions: async (_workspace, id) => id === 'T' ? loaded : waiting})
    await workspace.loadScenarioDefinitions({scenarioId: 'T'})
    const pending = workspace.loadScenarioDefinitions({scenarioId: 'OTHER'})
    await Promise.resolve()
    workspace.dispose()
    release(late)
    await expect(pending).rejects.toThrow('DISPOSED')
    expect(loaded.destroyed).toBe(true); expect(late.destroyed).toBe(true)
    await expect(workspace.loadScenarioDefinitions({scenarioId: 'T'})).rejects.toThrow('DISPOSED')
  })

  it('rejects a cached return across a request scope switch and releases its old DataSet', async () => {
    let scope = 'A'
    const loaded = DataSet.fromJson({scenarioId: 'FORMAL-C', tables: {}})
    const workspace = new ProjectWorkspace({projectId: 'APP', blueprint: {}, scenarioViews: {readScope: () => scope, readText: async () => null},
      scenarioDefinitions: async () => loaded})
    expect(await workspace.loadScenarioDefinitions({scenarioId: 'T'})).toBe(loaded)
    const returning = workspace.loadScenarioDefinitions({scenarioId: 'T'})
    scope = 'B'
    await expect(returning).rejects.toThrow('SCOPE_STALE')
    expect(workspace.getScenarioDefinitions('T')).toBeNull()
    expect(loaded.destroyed).toBe(true)
  })

  it('deduplicates an in-flight load and never registers a late result from another scope', async () => {
    let scope = 'A', release!: (dataSet: DataSet) => void
    const pending = new Promise<DataSet>(resolve => {release = resolve})
    const loader = vi.fn(async () => pending)
    const workspace = new ProjectWorkspace({projectId: 'APP', blueprint: {}, scenarioViews: {readScope: () => scope, readText: async () => null},
      scenarioDefinitions: loader})
    const calls = [workspace.loadScenarioDefinitions({scenarioId: 'T'}), workspace.loadScenarioDefinitions({scenarioId: 'T'})]
    await Promise.resolve(); expect(loader).toHaveBeenCalledOnce()
    const loaded = DataSet.fromJson({scenarioId: 'FORMAL-C', tables: {}})
    scope = 'B'; release(loaded)
    const results = await Promise.allSettled(calls)
    expect(results.every(result => result.status === 'rejected')).toBe(true)
    expect(loaded.destroyed).toBe(true)
    expect(workspace.getScenarioDefinitions('T')).toBeNull()
  })
})
