import {describe, expect, it, vi} from 'vitest'
import {DataSet} from '../../dataset'
import {RequestState} from '../../types'

const columns = [{name: 'id', type: 'number' as const, isPrimaryKey: true}]
const configuration = {dataSetName: 'Lifecycle', tables: {
  Models: {tableName: 'Models', columns, views: {default: {}}},
  Choices: {tableName: 'Choices', columns, views: {default: {}}},
}}

describe('DataSet subscription lifecycle', () => {

  it.each(['addRelation', 'updateRelation', 'removeRelation', 'addCascade', 'updateCascade', 'removeCascade', 'removeTable'] as const)(
    'rejects %s after release before mutating configuration or rebuilding the cascade runtime', mode => {
      const dataSet = DataSet.fromJson(configuration)
      const relation = {relationId: 'R', parentTable: 'Models', childTable: 'Choices', parentField: 'id', childField: 'id'}
      const cascade = {cascadeId: 'C', parentTable: 'Models', parentViewId: 'default', childTable: 'Choices', childViewId: 'default', filterBindings: [{sourceField: 'id', targetField: 'id'}]}
      dataSet.addResourceRelation(relation); dataSet.addCascade(cascade)
      dataSet.getTable('Choices')!.getOrCreateView('next')
      const unrelated = dataSet.addTable('Unrelated', columns)
      const relations = dataSet.resourceRelations, cascades = dataSet.viewCascades, table = dataSet.getTable('Models')
      dataSet.destroy()
      try {
        expect(() => {
          if (mode === 'addRelation') dataSet.addResourceRelation({...relation, relationId: 'Next'})
          else if (mode === 'updateRelation') dataSet.updateResourceRelation(relation, {relationName: 'changed'})
          else if (mode === 'removeRelation') dataSet.removeResourceRelation(relation)
          else if (mode === 'addCascade') dataSet.addCascade({...cascade, cascadeId: 'Next', childViewId: 'next'})
          else if (mode === 'updateCascade') dataSet.updateCascade({cascadeId: 'C'}, {autoLoad: true})
          else if (mode === 'removeCascade') dataSet.removeCascade({cascadeId: 'C'})
          else dataSet.removeTable('Unrelated')
        }).toThrow('has been destroyed')
        expect(dataSet.resourceRelations).toBe(relations)
        expect(dataSet.viewCascades).toBe(cascades)
        expect(dataSet.getTable('Models')).toBe(table)
        expect(dataSet.getTable('Unrelated')).toBe(unrelated)
        expect(() => dataSet.onFieldCascadeChange(() => {})).toThrow('FIELD_CASCADE_RUNTIME')
      } finally {for (const item of Object.values(dataSet.tables)) item.destroy()}
    },
  )


  it.each(['addView', 'getOrCreateView', 'existing'] as const)('rejects table %s after its DataSet release without reviving views', mode => {
    const dataSet = DataSet.fromJson(configuration), table = dataSet.getTable('Models')!, original = table.getView('default')!
    dataSet.destroy()
    try {
      expect(() => mode === 'addView' ? table.addView('Late') : table.getOrCreateView(mode === 'existing' ? 'default' : 'Late'))
        .toThrow('has been destroyed')
      expect(dataSet.getView('Models', 'Late')).toBeUndefined()
      expect(table.getView('default')).toBe(original)
      expect(original.destroyed).toBe(true)
    } finally {table.destroy()}
  })


  it.each(['addTable', 'addTableFromJson', 'replaceFromJson'] as const)('rejects %s after release without replacing retained tables or creating live views', mode => {
    const dataSet = DataSet.fromJson(configuration), original = dataSet.getTable('Models')!, originalView = dataSet.getView('Models')!
    dataSet.destroy()
    try {
      expect(() => {
        if (mode === 'addTable') dataSet.addTable('Late', columns)
        else if (mode === 'addTableFromJson') dataSet.addTableFromJson({tableName: 'Late', columns, views: {default: {}}})
        else dataSet.replaceFromJson(configuration)
      }).toThrow('has been destroyed')
      expect(dataSet.getTable('Late')).toBeUndefined()
      expect(dataSet.getTable('Models')).toBe(original)
      expect(dataSet.getView('Models')).toBe(originalView)
      expect(originalView.destroyed).toBe(true)
    } finally {for (const table of Object.values(dataSet.tables)) table.destroy()}
  })

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
