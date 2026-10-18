import {describe, expect, it, vi} from 'vitest'
import {DataSet} from '../../dataset'
import {RequestState} from '../../types'

const columns = [{name: 'id', type: 'number' as const, isPrimaryKey: true}]
const configuration = {dataSetName: 'Lifecycle', tables: {
  Models: {tableName: 'Models', columns, views: {default: {}}},
  Choices: {tableName: 'Choices', columns, views: {default: {}}},
}}

describe('DataSet subscription lifecycle', () => {
  it.each(['view', 'direct-view', 'table', 'direct-table'] as const)(
    'releases the destroyed %s subscription without rebinding retained views', mode => {
      const dataSet = DataSet.fromJson(configuration)
      const retained = dataSet.getView('Models')!, table = dataSet.getTable('Choices')!
      const released = table.getOrCreateView('picker')
      const changed = vi.fn(), loaded = vi.fn()
      const attached = vi.spyOn(released.events, 'on')
      const stopChanges = dataSet.onAnyViewChange({currentRowChanged: changed})
      const stopLoads = dataSet.on('loadSuccess', loaded)
      const registered = [...attached.mock.calls]
      const releaseEvents = vi.spyOn(released.events, 'off')
      const retainEvents = vi.spyOn(retained.events, 'on')
      const detachRetained = vi.spyOn(retained.events, 'off')
      try {
        if (mode === 'view') table.destroyView('picker')
        else if (mode === 'direct-view') released.destroy()
        else if (mode === 'table') dataSet.removeTable('Choices')
        else table.destroy()
        for (const [event, callback] of registered) expect(releaseEvents).toHaveBeenCalledWith(event, callback)
        expect(retainEvents).not.toHaveBeenCalled()
        expect(detachRetained).not.toHaveBeenCalled()
        released.events.emit('currentRowChanged', {id: 0})
        released.events.emit('requestStateChanged', RequestState.Loaded)
        expect(changed).not.toHaveBeenCalled(); expect(loaded).not.toHaveBeenCalled()
        retained.replaceRows([{id: 1}]); retained.setCurrentRowById(1)
        retained.events.emit('requestStateChanged', RequestState.Loaded)
        expect(changed).toHaveBeenCalledTimes(1)
        expect(loaded).toHaveBeenCalledExactlyOnceWith({tableName: 'Models', viewId: 'default'})
        releaseEvents.mockClear()
        stopChanges(); stopLoads(); stopChanges(); stopLoads()
        // A disposed view must no longer be retained by the DataSet's cleanup closures.
        expect(releaseEvents).not.toHaveBeenCalled()
      } finally {dataSet.destroy()}
    },
  )

  it('subscribes each replacement view once and drops old cleanup callbacks immediately', () => {
    const dataSet = DataSet.fromJson(configuration), table = dataSet.getTable('Choices')!
    const changed = vi.fn(), loaded = vi.fn(), failed = vi.fn()
    const stops = [dataSet.onAnyViewChange({currentRowChanged: changed}),
      dataSet.on('loadSuccess', loaded), dataSet.on('loadError', failed)]
    const cleanupSpies: ReturnType<typeof vi.spyOn>[] = []
    try {
      for (let i = 0; i < 12; i++) {
        const view = table.getOrCreateView('picker')
        const cleanup = vi.spyOn(view.events, 'off'); cleanupSpies.push(cleanup)
        view.replaceRows([{id: i}]); view.setCurrentRowById(i)
        view.events.emit('requestStateChanged', RequestState.Loaded)
        expect(changed).toHaveBeenCalledTimes(i + 1); expect(loaded).toHaveBeenCalledTimes(i + 1)
        expect(failed).not.toHaveBeenCalled()
        table.destroyView('picker')
        expect(cleanup.mock.calls.filter(([event]) => event === 'requestStateChanged').length).toBeGreaterThanOrEqual(2)
        expect(cleanup.mock.calls.filter(([event]) => event === 'currentRowChanged').length).toBeGreaterThanOrEqual(1)
        cleanup.mockClear()
      }
      stops.forEach(stop => stop()); dataSet.destroy()
      for (const cleanup of cleanupSpies) expect(cleanup).not.toHaveBeenCalled()
    } finally {dataSet.destroy()}
  })

  it('preserves subscriptions after definition replacement without retaining the old view', () => {
    const dataSet = DataSet.fromJson(configuration), old = dataSet.getView('Models')!
    const changed = vi.fn(), loaded = vi.fn()
    const stopChanges = dataSet.onAnyViewChange({currentRowChanged: changed})
    const stopLoads = dataSet.on('loadSuccess', loaded)
    const cleanup = vi.spyOn(old.events, 'off')
    try {
      dataSet.replaceFromJson(configuration)
      expect(old.isDestroyed()).toBe(true)
      expect(cleanup.mock.calls.length).toBeGreaterThanOrEqual(2)
      cleanup.mockClear()
      const current = dataSet.getView('Models')!
      current.replaceRows([{id: 2}]); current.setCurrentRowById(2)
      current.events.emit('requestStateChanged', RequestState.Loaded)
      expect(changed).toHaveBeenCalledTimes(1); expect(loaded).toHaveBeenCalledTimes(1)
      stopChanges(); stopLoads()
      expect(cleanup).not.toHaveBeenCalled()
    } finally {dataSet.destroy()}
  })
})
