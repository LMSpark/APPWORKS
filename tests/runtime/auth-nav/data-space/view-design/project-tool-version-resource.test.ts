import {describe, expect, it, vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {LOWCODE_APPLICATION_CATALOG_FORM_KEY} from '@spark-appworks/spark-lowcode-api'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {LOWCODE_FILE_RESOURCE_REGISTRY} from '@/lowcode/resources/shared/agent-workflow-file-resource'

describe('registered ProjectToolVersion resource', () => {
  it('is offered by the formal file resource registry with a complete readonly view contract', () => {
    const definition = LOWCODE_FILE_RESOURCE_REGISTRY.find(item => item.tableName === 'ProjectToolVersion')
    expect(definition).toBeDefined()
    expect(definition).toMatchObject({
      resourceId: 'project:tool-version',
      views: {default: {queryContext: {pageId: '', fileName: 'rule.json'}}},
      queryParameters: {default: [
        {name: 'pageId', type: 'string', required: true},
        {name: 'fileName', type: 'string', required: true},
      ]},
    })
    expect(definition?.columns.map(column => column.name)).toEqual([
      'versionKey', 'pageId', 'fileName', 'version', 'snapshotFileName', 'lastModified',
    ])
  })

  it('binds and queries the formally declared view under the exact 7AB target identity', async () => {
    const definition = LOWCODE_FILE_RESOURCE_REGISTRY.find(item => item.tableName === 'ProjectToolVersion')
    expect(definition).toBeDefined()
    const api = {listFileVersions: vi.fn().mockResolvedValue([
      {version: 8, fileName: '8__script.js', lastModified: 123},
    ])}
    const dataSet = DataSet.fromJson({scenarioId: LOWCODE_APPLICATION_CATALOG_FORM_KEY, dataSetName: 'application catalog', tables: {
      ProjectToolVersion: {resourceType: 'file', resourceId: 'project:tool-version', columns: definition!.columns, views: definition!.views},
    }})
    const runtime = new PageRuntime({pageId: '7AB-project-tool-versions', scenarioIds: [LOWCODE_APPLICATION_CATALOG_FORM_KEY],
      mainScenarioId: LOWCODE_APPLICATION_CATALOG_FORM_KEY, loadScenario: async () => dataSet})
    await runtime.load()
    const runtimeDataSet = runtime.getDataSet(LOWCODE_APPLICATION_CATALOG_FORM_KEY)!
    const view = runtimeDataSet.getView('ProjectToolVersion', 'default')!
    view.queryContext = {pageId: 'PAGE-1', fileName: 'script.js'}
    view.bindQueryExecutor(definition!.createExecutor({applicationId: 'APP-1', api: api as never, assertCurrent: () => {}}),
      {resource: {resourceType: 'file', resourceId: 'project:tool-version'}})
    await view.refresh()
    expect(runtime.resolveView(`${LOWCODE_APPLICATION_CATALOG_FORM_KEY}@ProjectToolVersion@default`)).toBe(view)
    expect(view.rows).toMatchObject([{pageId: 'PAGE-1', fileName: 'script.js', version: 8, lastModified: 123}])
    expect(view.deleteActionState(view.rows[0]!)).toBe('disabled')
    expect(api.listFileVersions).toHaveBeenCalledWith({appType: 'designfile', customPath: 'APP-1/PAGE-1', fileName: 'script.js'})
    runtime.dispose()
  })

  it('fails closed when the 7AB PageRuntime has no formal ProjectToolVersion binding', async () => {
    const dataSet = DataSet.fromJson({scenarioId: LOWCODE_APPLICATION_CATALOG_FORM_KEY, dataSetName: 'application catalog', tables: {}})
    const runtime = new PageRuntime({pageId: '7AB-project-tool-versions-missing-binding', scenarioIds: [LOWCODE_APPLICATION_CATALOG_FORM_KEY],
      mainScenarioId: LOWCODE_APPLICATION_CATALOG_FORM_KEY, loadScenario: async () => dataSet})
    await runtime.load()
    expect(runtime.resolveView(`${LOWCODE_APPLICATION_CATALOG_FORM_KEY}@ProjectToolVersion@default`)).toBeUndefined()
    expect(Object.keys(runtime.getDataSet(LOWCODE_APPLICATION_CATALOG_FORM_KEY)!.tables)).toEqual([])
    runtime.dispose()
  })
})
