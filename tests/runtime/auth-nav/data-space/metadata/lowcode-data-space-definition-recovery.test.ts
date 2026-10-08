import {describe, expect, it} from 'vitest'
import {DataSpaceDesignApi, DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {ProjectWorkspace, ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {HttpClientBase, isRecord, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {LowcodeDataSpaceAssembler} from '../../../../../src/lowcode/data-space/lowcode-data-space-assembler'
import {LowcodeDataSpaceViewDesign} from '../../../../../src/lowcode/data-space/view-design/lowcode-data-space-view-design'

type FormalModel = Awaited<ReturnType<DataSpaceDesignApi['readModel']>>
type Row = Record<string, unknown>
const targetId = 'SPACE'
const metadataId = 'META'
const metaTables = ['Base_DataSet', 'Base_DataModel', 'Base_DataModel_Field', 'Base_DataModel_Relation']
const readScope = () => ({token: 'SCOPE', headers: {'X-AppId': 'APP'}})

function record(value: unknown): Row {
  if (!isRecord(value)) throw new Error('expected wire object')
  return value
}

function records(value: unknown): Row[] {
  if (!Array.isArray(value)) throw new Error('expected wire array')
  return value.map(record)
}

function matches(row: Row, input: unknown): boolean {
  if (input === null || input === undefined) return true
  const filter = record(input)
  if (filter['Type'] === 'and') return records(filter['Filters']).every(child => matches(row, child))
  expect(filter).toMatchObject({Type: 'cond', Operator: 'equal', ValueFun: {Type: 'GetConstValue'}})
  return row[String(filter['Field'])] === record(filter['ValueFun'])['Value']
}

function definition(field: string): string {
  return JSON.stringify({scenarioId: targetId, tables: {Orders: {
    modelBinding: {modelId: 'MODEL', modelName: 'Orders'}, columns: [{name: field, required: true}],
    views: {default: {}, editor: {labelField: field, pageSize: 10}},
  }}})
}

class RecoveryHttp extends HttpClientBase {
  readonly requests: RequestConfig[] = []
  readonly writes: RequestConfig[] = []
  readonly rows = new Map<string, Row[]>([
    ['Base_DataSet', [{rowid: targetId, Name: 'Orders space'}]],
    ['Base_DataModel', [{rowid: 'MODEL', dataSetId: targetId, Name: 'Orders', MetaName: 'PhysicalOrders',
      DbId: 'DB', Type: 'table', PrimaryKeyFields: 'id'}]],
    ['Base_DataModel_Field', ['id', 'title'].map(name => ({rowid: `FIELD-${name}`, dataSetId: targetId,
      dataModelId: 'MODEL', type: 'dataModel', Name: name, AsName: '', FieldType: 'string',
      IsOutput: 1, IsPKey: name === 'id' ? 1 : 0}))],
    ['Base_DataModel_Relation', []],
    ['View_TblList', [{rowid: 'SOURCE', tblname: 'PhysicalOrders', dbid: 'DB'}]],
    ['Base_TblField', [{rowid: 'SOURCE-id', tblid: 'SOURCE', enname: 'id', IsPKey: 1}]],
  ])
  title = 'Before'

  private field(name: string): Row {
    const field = this.rows.get('Base_DataModel_Field')?.find(row => row['Name'] === name)
    if (!field) throw new Error('missing saved field')
    return field
  }

  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requests.push(config)
    let result: unknown
    if (config.url === '/api/DataOperation/GetData') {
      const body = record(config.data)
      const table = records(body['Table'])[0]!
      const name = String(table['Name'])
      expect(config.headers?.['x-FormKey']).toBe(name === 'Orders' ? targetId : metadataId)
      const primaryKeyField = name === 'Orders' ? 'id' : 'rowid'
      let rows: Row[]
      let editable: string[] = []
      if (name === 'Orders') {
        expect(body['OutputFieldMode']).toBe('REQUEST')
        const requested = records(table['Fields']).map(field => field['Name'])
        const alias = String(this.field('title')['AsName'] || 'title')
        rows = [{...(requested.includes('id') ? {id: 'ORDER'} : {}),
          ...(requested.includes('title') ? {[alias]: this.title} : {})}]
        editable = [alias]
      } else {
        const source = this.rows.get(name)
        if (!source) throw new Error(`unexpected query ${name}`)
        rows = source.filter(row => matches(row, table['Filter'])).map(row => structuredClone(row))
        if (name === 'Base_DataModel_Field') editable = ['AsName']
      }
      const items = rows.map(row => ({...row, lingma_sys_key: `${name}:${String(row[primaryKeyField])}`,
        lingma_sys_params: {r: [], e: editable, h: [], m: [], d: false}}))
      result = {primaryKeyField, allowAdd: false, data: {Items: items, Count: items.length}}
    } else {
      expect(config.url).toBe('/api/DataOperation/BatchTableOperateRequestByCRUD')
      this.writes.push(config)
      const group = records(config.data)[0]!
      const name = String(group['TableName'])
      const crud = record(group['CrudModel'])
      expect(crud['Added']).toEqual([])
      expect(crud['Deleted']).toEqual([])
      const changes = records(crud['Changed'])
      expect(changes).toHaveLength(1)
      const row = changes[0]!
      if (name === 'Base_DataModel_Field') {
        expect(config.headers?.['x-FormKey']).toBe(metadataId)
        expect(row).toMatchObject({rowid: 'FIELD-title', AsName: 'caption',
          lingma_sys_key: 'Base_DataModel_Field:FIELD-title'})
        this.field('title')['AsName'] = row['AsName']
        result = {maplistedit: [{Base_DataModel_Field: [structuredClone(this.field('title'))]}]}
      } else {
        expect(name).toBe('Orders')
        expect(config.headers?.['x-FormKey']).toBe(targetId)
        expect(row).toMatchObject({id: 'ORDER', title: 'After', lingma_sys_key: 'Orders:ORDER'})
        expect(row).not.toHaveProperty('caption')
        this.title = String(row['title'])
        result = {maplistedit: [{PhysicalOrders: [{id: 'ORDER', title: this.title}]}]}
      }
    }
    return {status: 200, statusText: 'OK', headers: {}, data: {Code: 200, Result: result}}
  }
}

function fixture() {
  const http = new RecoveryHttp()
  let stored = definition('title')
  let fileWrites = 0
  let loseFileResponse = false
  const open = async () => {
    const workspace = new ProjectWorkspace({projectId: 'APP',
      pageFiles: {readPageFile: async () => {throw new Error('unexpected page read')}},
      blueprint: {loadRoot: async () => ({children: []})},
      scenarioViews: {readScope: () => readScope().token,
        readText: async id => {expect(id).toBe(targetId); return stored},
        writeText: async (id, text) => {
          expect(id).toBe(targetId)
          stored = text
          fileWrites++
          if (loseFileResponse) {loseFileResponse = false; throw new Error('file response lost')}
        }},
    })
    const runtime = new DataSpaceRuntimeApi({http, readScope})
    const design = new DataSpaceDesignApi({http, runtime, readScope})
    const assembler = new LowcodeDataSpaceAssembler(runtime, http)
    const formalInput = {designScenarioId: metadataId, dataSpaceId: targetId}
    const service = new LowcodeDataSpaceViewDesign({workspace, assertScope: () => undefined,
      readModel: input => design.readModel({...formalInput, metaName: input.modelName}),
      assemble: async (id, file) => {
        expect(id).toBe(targetId)
        return assembler.assemble({config: file.value,
          space: await design.readSpaceDefinition(formalInput),
          models: [await design.readModel({...formalInput, metaName: 'Orders'})],
          relations: await design.readRelations(formalInput)})
      },
      loadMetadata: async id => {
        expect(id).toBe(targetId)
        const models: FormalModel[] = metaTables.map(name => ({id: `META-${name}`, name, metaName: name,
          sourceName: name, sourceId: 'DB', sourceType: 'table', primaryKey: 'rowid', businessMain: false, raw: {},
          fields: Object.keys(http.rows.get(name)?.[0] ?? {rowid: '', dataSetId: ''}).map(field => ({
            id: `${name}-${field}`, modelId: `META-${name}`, name: field, canonicalName: field, type: 'string',
            primaryKey: field === 'rowid', description: '', output: true, computed: false, order: 0, orderType: '', raw: {},
          }))}))
        const config = new ScenarioViewConfig(metadataId, JSON.stringify({scenarioId: metadataId,
          tables: Object.fromEntries(models.map(model => [model.metaName, {
            modelBinding: {modelId: model.id, modelName: model.metaName}, views: {default: {
              queryContext: {formid: id}, filterExpression: {
                field: model.metaName === 'Base_DataSet' ? 'rowid' : 'dataSetId', operator: 'eq',
                value: {Type: 'GetInputParam', ParamName: 'formid'},
              }},
            },
          }]))}))
        const {dataSet} = assembler.assemble({config, space: {dataSpaceId: metadataId, name: 'Metadata'}, models, relations: []})
        for (const name of metaTables) {
          const view = dataSet.getView(name, 'default')!
          const result = await view.loadFromServer({allPages: true})
          if (!result.success) {dataSet.destroy(); throw new Error('metadata query failed')}
        }
        return dataSet
      },
    })
    return service.openDesignSession(targetId)
  }
  return {http, open, get stored() {return stored}, get fileWrites() {return fileWrites},
    failFileResponse: () => {loseFileResponse = true}}
}

describe('definition editing across database and scenario file persistence', () => {
  it.each([false, true])('recovers a saved field alias, reopens and submits business rows (lost file response: %s)', async lostResponse => {
    const storage = fixture()
    const first = await storage.open()
    const fields = first.metadataDataSet.getView('Base_DataModel_Field', 'default')!
    expect(await fields.editRowById('FIELD-title', {AsName: 'caption'})).toBe(true)
    expect(first.definitionDataSet?.getTable('Orders')?.columns.map(column => column.name)).toContain('title')
    expect(storage.http.writes).toHaveLength(0)
    await expect(first.metadataDataSet.saveChanges()).resolves.toMatchObject({success: true, data: {savedCount: 1}})
    expect(fields.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(storage.http.writes).toHaveLength(1)
    await expect(first.refresh()).rejects.toThrow('未解析到唯一正式输出字段: title')
    expect(first.viewState).toMatchObject({text: definition('title'), dirty: false})
    expect(first.metadataDataSet.destroyed).toBe(false)
    first.dispose()

    const repair = await storage.open()
    expect(repair.definitionError?.message).toContain('未解析到唯一正式输出字段: title')
    expect(repair.metadataDataSet.getView('Base_DataModel_Field', 'default')?.rows
      .find(row => row['rowid'] === 'FIELD-title')?.['AsName']).toBe('caption')
    await expect(repair.saveViews()).rejects.toThrow('未解析到唯一正式输出字段')
    await expect(repair.stageDefinition({expectedText: definition('title'), text: definition('absent')}))
      .rejects.toThrow('未解析到唯一正式输出字段: absent')
    expect(storage.stored).toBe(definition('title'))
    expect(storage.fileWrites).toBe(0)
    await repair.stageDefinition({expectedText: definition('title'), text: definition('caption')})
    expect(repair.definitionError).toBeNull()
    expect(repair.viewState?.dirty).toBe(true)
    expect(repair.definitionDataSet?.getTable('Orders')?.columns.find(column => column.name === 'caption')?.required).toBe(true)
    if (lostResponse) {
      storage.failFileResponse()
      await expect(repair.saveViews()).rejects.toThrow('file response lost')
      expect(repair.viewState?.saveStatus).toBe('unknown')
      await expect(repair.saveViews()).rejects.toThrow('SAVE_PENDING')
      await expect(repair.verifyViews()).resolves.toMatchObject({outcome: 'confirmed', state: {dirty: false}})
    } else await repair.saveViews()
    expect(storage.fileWrites).toBe(1)
    expect(storage.http.writes).toHaveLength(1)
    expect(storage.stored).toBe(definition('caption'))
    repair.dispose()

    const reopened = await storage.open()
    const view = reopened.definitionDataSet?.getView('Orders', 'editor')!
    expect(reopened.viewState).toMatchObject({persisted: true, dirty: false})
    expect(view.labelField).toBe('caption')
    expect(view.dataTable).toBe(reopened.definitionDataSet?.getView('Orders', 'default')?.dataTable)
    await expect(view.loadFromServer()).resolves.toMatchObject({success: true})
    expect(view.rows[0]).toMatchObject({id: 'ORDER', caption: 'Before'})
    expect(view.fieldAccess(view.rows[0]!, 'caption').write).toBe('allowed')
    expect(await view.editRowById('ORDER', {caption: 'After'})).toBe(true)
    await expect(view.saveChanges()).resolves.toMatchObject({success: true, data: {savedCount: 1}})
    expect(view.rows[0]).toMatchObject({id: 'ORDER', caption: 'After'})
    expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
    await view.loadFromServer()
    expect(view.rows[0]?.['caption']).toBe('After')
    expect(storage.http.writes).toHaveLength(2)
    expect(storage.fileWrites).toBe(1)
    expect(storage.stored).not.toMatch(/lingma_sys_|"rows"/)
    reopened.dispose()
    expect(view.destroyed).toBe(true)
    expect(reopened.metadataDataSet.destroyed).toBe(true)
  })
})
