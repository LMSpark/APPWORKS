import {afterEach, describe, expect, it} from 'vitest'
import {dataSpacePageFixture} from '../data-space-page.fixture'

const fixtures: ReturnType<typeof dataSpacePageFixture>[] = []
afterEach(() => fixtures.splice(0).forEach(f => f.dispose()))

describe('function configuration remains an independent business system', () => {
  it.each(['rename', 'remove'] as const)('allows model %s without requiring function configuration views', async kind => {
    const f = dataSpacePageFixture({missing: true, overviewOnly: true, allowDelete: true, allowModelRename: true,
      sourceFields: [{rowid: 'F1', dataModelId: 'M1', Name: 'rowid', type: 'dataModel'}]})
    fixtures.push(f)
    const session = await f.open('A', {deferDefinition: true}), data = session.metadataDataSet
    for (const name of ['_Base_FunctionNode', 'Base_FunctionDetail']) if (data.getTable(name)) data.removeTable(name)
    const command = kind === 'rename' ? session.getModelRename('M1') : session.getModelRemove('M1')
    if ('input' in command) command.input.updateEditingValue('rename', 'name', 'RenamedOrders')
    await command.preview(); await command.save()
    expect(f.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')).toHaveLength(1)
    expect(JSON.stringify(f.requests)).not.toMatch(/Base_FunctionDetail|_Base_FunctionNode/)
  })

  it.each(['rename', 'remove'] as const)('does not mutate or query independent function records during model %s', async kind => {
    const f = dataSpacePageFixture({missing: true, overviewOnly: true, allowDelete: true, allowModelRename: true,
      sourceFields: [{rowid: 'F1', dataModelId: 'M1', Name: 'rowid', type: 'dataModel'}]})
    fixtures.push(f)
    const session = await f.open('A', {deferDefinition: true}), data = session.metadataDataSet
    const name = 'Base_FunctionDetail'
    if (data.getTable(name)) data.removeTable(name)
    const table = data.addTable(name, ['rowid', 'FunId', 'ConName'].map(field => ({name: field, type: 'string', isPrimaryKey: field === 'rowid'})))
    table.resourceType = 'static-data'
    const view = table.getOrCreateView('default')
    view.replaceRows([{rowid: 'D1', FunId: 'TAG1', ConName: 'Orders'}])
    const before = JSON.stringify(view.rows)
    const command = kind === 'rename' ? session.getModelRename('M1') : session.getModelRemove('M1')
    if ('input' in command) command.input.updateEditingValue('rename', 'name', 'RenamedOrders')
    await command.preview(); await command.save()
    expect(JSON.stringify(view.rows)).toBe(before)
    expect(view.hasEditingChanges()).toBe(false)
    expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(JSON.stringify(f.requests)).not.toMatch(/Base_FunctionDetail|_Base_FunctionNode/)
  })
})
