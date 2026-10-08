import {describe, expect, it} from 'vitest'
import {DataViewFilter, extractColumnRules} from '@spark-appworks/spark-data'
import {DataSpaceRuntimeApi, type DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {ProjectWorkspace, type ScenarioViewFile} from '@spark-appworks/spark-project-model'
import {HttpClientBase, isRecord, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {LowcodeDataSpaceAssembler} from '../../../../../src/lowcode/data-space/lowcode-data-space-assembler'
import {LowcodeDataSpaceViewDesign} from '../../../../../src/lowcode/data-space/view-design/lowcode-data-space-view-design'

type FormalModel = Awaited<ReturnType<DataSpaceDesignApi['readModel']>>
type FormalRelations = Awaited<ReturnType<DataSpaceDesignApi['readRelations']>>

function model(id: string, sourceName: string, fields: readonly string[], numericFields: readonly string[] = []): FormalModel {
  return {id, name: id, metaName: id, sourceName, sourceId: 'DB', sourceType: 'table',
    primaryKey: 'id', businessMain: false, raw: {}, fields: fields.map((name, order) => ({
      id: `${id}-${name}`, modelId: id, name, canonicalName: name,
      type: numericFields.includes(name) ? 'number' : 'string',
      primaryKey: name === 'id', description: '', output: true, computed: false,
      order, orderType: '', raw: {},
    }))}
}

const relationFilter = DataViewFilter.condition({field: 'ChildSource.parentId', operator: 'eq',
  value: {Type: 'GetTableField', Field: 'ParentSource.id'}})
const relations: FormalRelations = [{sourceRelationId: 'REL', dataSpaceId: 'SPACE',
  parentModelId: 'ParentModel', childModelId: 'ChildModel',
  parentResourceName: 'ParentSource', childResourceName: 'ChildSource',
  filterExpression: relationFilter, dependencyType: 'currentRow', cascadeDelete: false}]
const cascade = {cascadeId: 'EXPLICIT', parentTable: 'Parents', parentViewId: 'shared',
  childTable: 'Children', childViewId: 'shared', filterBindings: [{sourceField: 'id', targetField: 'parentId'}],
  dependencyType: 'currentRow', autoLoad: false}
const initial = JSON.stringify({scenarioId: 'SPACE', tables: {
  Parents: {modelBinding: {modelId: 'ParentModel', modelName: 'ParentModel'},
    views: {default: {}, shared: {}, detail: {}}},
  Children: {modelBinding: {modelId: 'ChildModel', modelName: 'ChildModel'},
    views: {default: {}, shared: {}, detail: {}}},
}, viewCascades: [cascade]})

class QueryHttp extends HttpClientBase {
  readonly requests: RequestConfig[] = []
  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requests.push(config)
    return {data: {Code: 200, Result: {primaryKeyField: 'id', allowAdd: false,
      data: {Items: [], Count: 0}}}, status: 200, statusText: 'OK', headers: {}}
  }
}

function fixture(text: string | null = initial) {
  const stored = new Map<string, string>()
  if (text !== null) stored.set('SPACE', text)
  let models = [model('ParentModel', 'ParentSource', ['id', 'title']),
    model('ChildModel', 'ChildSource', ['id', 'parentId', 'title'])]
  const openOwner = () => {
    const workspace = new ProjectWorkspace({projectId: 'APP',
      pageFiles: {readPageFile: async () => {throw new Error('unexpected page read')}},
      blueprint: {loadRoot: async () => ({children: []})},
      scenarioViews: {readScope: () => 'SCOPE',
        readText: async scenarioId => stored.get(scenarioId) ?? null,
        writeText: async (scenarioId, content) => {stored.set(scenarioId, content)}},
    })
    const http = new QueryHttp()
    const runtime = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'SCOPE', headers: {}})})
    const assembler = new LowcodeDataSpaceAssembler(runtime, http)
    const assemble = async (scenarioId: string, file: ScenarioViewFile) => {
      if (file.scenarioId !== scenarioId) throw new Error('scenario identity mismatch')
      return assembler.assemble({config: file.value, models, relations})
    }
    const service = new LowcodeDataSpaceViewDesign({workspace, assemble, assertScope: () => undefined,
      readModel: async input => {
        const found = models.find(candidate => candidate.id === input.modelId)
        if (!found) throw new Error('formal model missing')
        return found
      }})
    return {workspace, service, assemble, assembler, http}
  }
  return {stored, openOwner, setModels: (next: FormalModel[]) => {models = next}}
}

const parentShared = {scenarioId: 'SPACE', tableName: 'Parents', modelId: 'ParentModel',
  modelName: 'ParentModel', viewId: 'shared'}
const childShared = {scenarioId: 'SPACE', tableName: 'Children', modelId: 'ChildModel',
  modelName: 'ChildModel', viewId: 'shared'}
const projection = {fieldId: 'ParentModel-title', source: 'resource' as const,
  resourceFieldId: 'ParentModel-title', resourceField: 'title', viewField: 'title', type: 'string',
  label: 'Title', output: true, sortOrder: 0, sortDirection: null, group: 0,
  distinct: false, primaryKey: false, value: '', valueFunction: '', expression: ''}

describe('scenario view persistence and formal model assembly', () => {
  it('rejects a structural impostor before it can serialize away undefined validation values', () => {
    const owner = fixture().openOwner()
    let serialized = false
    const fake = {scenarioId: 'SPACE', toJSON: () => {
      serialized = true
      return {scenarioId: 'SPACE', tables: {Parents: {columns: [{name: 'title', required: undefined}]}}}
    }}
    expect(() => Reflect.apply(owner.assembler.assemble, owner.assembler,
      [{config: fake, models: [], relations: []}])).toThrow('SCENARIO_VIEW_CONFIG_INSTANCE')
    expect(serialized).toBe(false)
  })
  it('restores native validation rules from the file with formal column identity intact', async () => {
    const storage = fixture()
    storage.setModels([model('ParentModel', 'ParentSource', ['id', 'title', 'amount'], ['amount']),
      model('ChildModel', 'ChildSource', ['id', 'parentId', 'title'])])
    const first = storage.openOwner()
    const opened = await first.service.open('SPACE')
    const config = structuredClone(opened.state.config)
    const tables = config['tables']
    if (!isRecord(tables) || !isRecord(tables['Parents']) || !isRecord(tables['Children'])) {
      throw new Error('missing fixture tables')
    }
    tables['Parents']['columns'] = [{name: 'title', required: true, minLength: 2,
      maxLength: 6, pattern: '^A', patternMessage: 'must start A'},
    {name: 'amount', min: 0, max: 10}]
    tables['Children']['columns'] = [{name: 'title', required: false, minLength: 0}]
    opened.dirtySource.setText(JSON.stringify(config))
    const saved = await first.service.save('SPACE')
    expect(saved.dirty).toBe(false)
    expect(saved.text).not.toMatch(/"type"|"label"|"isPrimaryKey"|"rows"|"token"/)
    const reopened = storage.openOwner()
    const read = await reopened.service.open('SPACE')
    const assembled = await reopened.assemble('SPACE', read.dirtySource)
    const dataSet = assembled.dataSet
    const parent = dataSet.getTable('Parents')!.columns.find(column => column.name === 'title')!
    const child = dataSet.getTable('Children')!.columns.find(column => column.name === 'title')!
    const amount = dataSet.getTable('Parents')!.columns.find(column => column.name === 'amount')!
    expect(parent).toMatchObject({name: 'title', type: 'string', label: 'title', isPrimaryKey: false,
      required: true, minLength: 2, maxLength: 6, pattern: '^A'})
    expect(child.required).toBe(false)
    expect(child.maxLength).toBeUndefined()
    expect(amount).toMatchObject({name: 'amount', type: 'number', min: 0, max: 10})
    expect(extractColumnRules(parent).map(rule => rule.type)).toEqual(['required', 'minLength', 'maxLength', 'pattern'])
    expect(extractColumnRules(amount).map(rule => rule.type)).toEqual(['min', 'max'])
    expect(dataSet.getView('Parents', 'default')?.validator?.validate({title: 'B'}).errors.map(error => error.code))
      .toEqual(['MIN_LENGTH', 'PATTERN'])
    expect(dataSet.getView('Children', 'default')?.validator?.validate({title: 'B'}).valid).toBe(true)
    const validator = dataSet.getView('Parents', 'default')?.validator
    expect(validator?.validate({title: 'Alex', amount: -1}).errors.map(error => error.code)).toContain('MIN_VALUE')
    expect(validator?.validate({title: 'Alex', amount: 11}).errors.map(error => error.code)).toContain('MAX_VALUE')
    expect(validator?.validate({title: 'Alex', amount: 0}).valid).toBe(true)
    expect(validator?.validate({title: 'Alex', amount: 5}).valid).toBe(true)
    dataSet.destroy()
    const clearedConfig = structuredClone(read.state.config)
    const clearedTables = clearedConfig['tables']
    if (!isRecord(clearedTables) || !isRecord(clearedTables['Parents'])) throw new Error('missing fixture table')
    clearedTables['Parents']['columns'] = []
    read.dirtySource.setText(JSON.stringify(clearedConfig))
    const cleared = await reopened.service.save('SPACE')
    const clearOwner = storage.openOwner()
    const clearRead = await clearOwner.service.open('SPACE')
    const clearAssembly = await clearOwner.assemble('SPACE', clearRead.dirtySource)
    expect(extractColumnRules(clearAssembly.dataSet.getTable('Parents')!.columns.find(column => column.name === 'title')!))
      .toEqual([])
    clearAssembly.dataSet.destroy()
    expect(cleared.text).not.toContain('"required":true')
    read.dirtySource.setText(saved.text)
    await reopened.service.save('SPACE')
    storage.setModels([model('ParentModel', 'ParentSource', ['id']),
      model('ChildModel', 'ChildSource', ['id', 'parentId', 'title'])])
    const changed = storage.openOwner()
    const stale = await changed.service.open('SPACE')
    await expect(changed.assemble('SPACE', stale.dirtySource)).rejects.toThrow('未解析到唯一正式输出字段')
    expect(storage.stored.get('SPACE')).toBe(saved.text)
  })
  it('stages two model-owned views, saves and reopens native configuration with database columns', async () => {
    const storage = fixture()
    const first = storage.openOwner()
    const opened = await first.service.open('SPACE')
    const parentConfig = {fieldProjection: [projection], queryContext: {formid: 'PARENT'},
      filterExpression: {logic: 'or' as const, filters: [
        {field: 'title', operator: 'eq' as const, value: 'one'},
        {field: 'title', operator: 'eq' as const, value: 'two'}]},
      sortExpression: [{field: 'title', direction: 'asc' as const}],
      autoCurrentFirst: false, autoSelectFirst: false, page: 2, pageSize: 15,
      treeConfig: {idField: 'id', textField: 'title', treeMode: 'flat' as const},
      valueField: 'id', labelField: 'title', selectionDelimiter: '|',
      autoLoad: false, commitMode: 'staged' as const,
      aggregates: {title: {type: 'count' as const}}}
    const stagedParent = await first.service.stage({...parentShared,
      expectedText: opened.state.text, configuration: parentConfig})
    const childConfig = {queryContext: {formid: 'CHILD'}, page: 3, pageSize: 7,
      filterExpression: {field: 'parentId', operator: 'eq' as const, value: 'P'},
      valueField: 'parentId', labelField: 'title', autoLoad: false}
    const stagedChild = await first.service.stage({...childShared,
      expectedText: stagedParent.text, configuration: childConfig})
    expect(stagedChild.dirty).toBe(true)
    const saved = await first.service.save('SPACE')
    expect(saved).toMatchObject({dirty: false, persisted: true})
    expect(storage.stored.get('SPACE')).toBe(saved.text)
    expect(saved.text).not.toMatch(/"columns"|"rows"|"lingma_sys_/)
    expect(saved.config).toMatchObject({tables: {
      Parents: {views: {default: {}, shared: parentConfig, detail: {}}},
      Children: {views: {default: {}, shared: childConfig, detail: {}}},
    }, viewCascades: [cascade]})

    const reopened = storage.openOwner()
    const reread = await reopened.service.open('SPACE')
    expect(reread.state.text).toBe(saved.text)
    const assembly = await reopened.assemble('SPACE', reread.dirtySource)
    const dataSet = assembly.dataSet
    expect(assembly.diagnostics).toEqual([])
    expect(dataSet.scenarioId).toBe('SPACE')
    expect(dataSet.getTable('Parents')?.columns.map(column => column.name).filter(name => name !== '_pk'))
      .toEqual(['id', 'title'])
    expect(dataSet.getTable('Children')?.columns.map(column => column.name).filter(name => name !== '_pk'))
      .toEqual(['id', 'parentId', 'title'])
    expect(dataSet.getView('Parents', 'shared')).not.toBe(dataSet.getView('Children', 'shared'))
    expect(dataSet.getView('Parents', 'default')).toBeDefined()
    expect(dataSet.getView('Children', 'default')).toBeDefined()
    expect(dataSet.getView('Parents', 'detail')).toBeDefined()
    expect(dataSet.getView('Children', 'detail')).toBeDefined()
    expect(dataSet.getView('Parents', 'shared')?.queryContext).toEqual({formid: 'PARENT'})
    expect(dataSet.getView('Children', 'shared')?.queryContext).toEqual({formid: 'CHILD'})
    expect(dataSet.getView('Parents', 'shared')?.pageSize).toBe(15)
    expect(dataSet.getView('Children', 'shared')?.pageSize).toBe(7)
    expect(dataSet.getView('Parents', 'shared')?.fieldProjection).toEqual([projection])
    const {autoLoad: parentAutoLoad, ...parentSerialized} = parentConfig
    const {autoLoad: childAutoLoad, ...childSerialized} = childConfig
    expect(dataSet.getView('Parents', 'shared')?.autoLoad).toBe(parentAutoLoad)
    expect(dataSet.getView('Children', 'shared')?.autoLoad).toBe(childAutoLoad)
    expect(dataSet.getView('Parents', 'shared')?.toJson()).toMatchObject(parentSerialized)
    expect(dataSet.getView('Children', 'shared')?.toJson()).toMatchObject(childSerialized)
    expect(dataSet.resourceRelations).toMatchObject([{sourceRelationId: 'REL',
      parentTable: 'Parents', childTable: 'Children'}])
    expect(dataSet.viewCascades).toMatchObject([cascade])
    await expect(dataSet.getView('Children', 'detail')?.loadFromServer()).resolves.toMatchObject({success: true})
    expect(reopened.http.requests[0]?.data).toMatchObject({Table: [{Name: 'ChildModel'}]})
    dataSet.destroy()

    storage.setModels([model('ParentModel', 'ParentSource', ['id', 'title', 'newColumn']),
      model('ChildModel', 'ChildSource', ['id', 'parentId', 'title'])])
    const third = storage.openOwner()
    const latest = await third.service.open('SPACE')
    const updated = await third.assemble('SPACE', latest.dirtySource)
    expect(updated.dataSet.getTable('Parents')?.columns.map(column => column.name).filter(name => name !== '_pk'))
      .toEqual(['id', 'title', 'newColumn'])
    expect(storage.stored.get('SPACE')).toBe(saved.text)
    updated.dataSet.destroy()
  })

  it('keeps missing, damaged and wrong-bound files as distinct failures', async () => {
    const missing = fixture(null).openOwner()
    await expect(missing.service.open('SPACE')).rejects.toThrow('SCENARIO_VIEW_FILE_MISSING')
    const damaged = fixture('{broken').openOwner()
    await expect(damaged.service.open('SPACE')).rejects.toThrow()
    const wrong = initial.replace('"modelId":"ParentModel"', '"modelId":"OTHER"')
    const wrongOwner = fixture(wrong).openOwner()
    const opened = await wrongOwner.service.open('SPACE')
    await expect(wrongOwner.assemble('SPACE', opened.dirtySource)).rejects.toThrow('唯一正式模型')
  })
})
