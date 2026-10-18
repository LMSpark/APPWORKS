import {expect} from 'vitest'
import {DATA_SPACE_DESIGN_FORM_KEY} from '@spark-appworks/spark-lowcode-api'
import {ProjectWorkspace} from '@spark-appworks/spark-project-model'
import {isRecord, type RequestConfig} from '@spark-appworks/spark-utils'
import metadataConfig from '../../../../../../config/pages/data-platform/data-space-design/pagedata.json'

type Row = Record<string, unknown>

function record(value: unknown): Row {
  if (!isRecord(value)) throw new Error('fixture expected object')
  return value
}

function matches(row: Row, filter: unknown): boolean {
  if (filter === null || filter === undefined) return true
  const node = record(filter)
  if (node['Type'] === 'and' || node['Type'] === 'or') {
    if (!Array.isArray(node['Filters'])) throw new Error('fixture expected filter group')
    return node['Type'] === 'and' ? node['Filters'].every(item => matches(row, item)) : node['Filters'].some(item => matches(row, item))
  }
  expect(node['Type']).toBe('cond')
  const value = record(node['ValueFun'])
  expect(value['Type']).toBe('GetConstValue')
  const actual = row[String(node['Field'])]
  if (node['Operator'] === 'equal') return actual === value['Value']
  if (node['Operator'] === 'in') return Array.isArray(value['Value']) && value['Value'].includes(actual)
  if (node['Operator'] === 'greaterthanorequal') return typeof actual === 'number' && typeof value['Value'] === 'number' && actual >= value['Value']
  throw new Error(`fixture unexpected operator ${String(node['Operator'])}`)
}

/** Only the transport and file store are replaced; formal readers and runtime remain real. */
export function dataSpaceChainFixture(options: {metadataCreate?: boolean} = {}) {
  const meta = DATA_SPACE_DESIGN_FORM_KEY
  const target = 'CHAIN-TARGET'
  const requests: RequestConfig[] = []
  const fileWrites: string[] = []
  const files = new Map([[target, JSON.stringify({scenarioId: target, tables: {
    OrderTable: {modelBinding: {modelId: 'ORDER-MODEL', modelName: 'Orders'},
      columns: [{name: 'doubleMinimum', type: 'number', computeExpression: 'minimum * 2'}], views: {default: {autoLoad: false}}},
    ChoiceTable: {modelBinding: {modelId: 'CHOICE-MODEL', modelName: 'Choices'}, views: {default: {autoLoad: false}}},
  }})]])
  files.set(meta, JSON.stringify(metadataConfig))
  const records = new Map<string, Row[]>([
    ['Base_DataSet', [{rowid: meta, Name: '元数据空间', inputParams: '[{"rowid":"META-PARAM","Name":"dataSpaceId"}]'},
      {rowid: target, Name: '贯穿验收空间', inputParams: '[]'}, {rowid: 'OTHER', Name: '其他空间', inputParams: '[]'}]],
    ['Base_DataModel', []], ['Base_DataModel_Field', []], ['Base_DataModel_Relation', []], ['View_TblList', []], ['Base_TblField', []],
    ['Orders', [{rowid: 'ORDER-1', region: 'east', category: 1, choice: 'OLD|EAST', minimum: 10}]],
    ['Choices', [
      {rowid: 'OPT-E', orderId: 'ORDER-1', region: 'east', category: 1, code: 'EAST', title: '东区', amount: 12, kind: 'normal'},
      {rowid: 'OPT-W', orderId: 'ORDER-1', region: 'west', category: 1, code: 'WEST', title: '西区', amount: 3, kind: 'bonus'},
      {rowid: 'OPT-LOW', orderId: 'ORDER-1', region: 'east', category: 2, code: 'LOW', title: '其他类别', amount: 5, kind: 'normal'},
      {rowid: 'OPT-OTHER', orderId: 'OTHER', region: 'south', category: 2, code: 'OTHER', title: '其他订单', amount: 100, kind: 'bonus'},
    ]],
  ])
  const addModel = (space: string, id: string, name: string, fields: string[]) => {
    const source = name.startsWith('Base_') ? name : `${space === 'OTHER' ? 'Other' : ''}${name}Records`
    const primaryKey = fields[0]!
    if (!records.has(name)) records.set(name, [])
    records.get('Base_DataModel')!.push({rowid: id, dataSetId: space, Name: name, MetaName: source,
      Type: '数据库表', DbId: 'DB', PrimaryKeyFields: primaryKey})
    records.get('Base_DataModel_Field')!.push(...fields.map((field, index) => ({rowid: `${id}-FIELD-${index}`,
      dataSetId: space, dataModelId: id, Name: field, type: 'dataModel', FieldType: ['category', 'minimum', 'amount', 'IsPKey', 'IsOutput', 'allowAIAdd', 'Order', 'Group'].includes(field) ? 'number' : 'string',
      IsPKey: field === primaryKey ? 1 : 0, IsOutput: 1, ValueFun: '', Expression: '', AsName: ''})))
    const catalog = records.get('View_TblList')!, sourceFields = records.get('Base_TblField')!
    const sourceId = catalog.find(row => row['tblname'] === source && row['dbid'] === 'DB')?.['rowid'] ?? `${id}-SOURCE`
    if (!catalog.some(row => row['rowid'] === sourceId)) catalog.push({rowid: sourceId, tblname: source, dbid: 'DB', DbName: 'main', primarykey: primaryKey})
    sourceFields.push(...fields.filter(field => !sourceFields.some(row => row['tblid'] === sourceId && row['enname'] === field))
      .map((field, index) => ({rowid: `${id}-SOURCE-FIELD-${index}`, tblid: sourceId, enname: field,
        DataType: 'varchar', IsPKey: field === primaryKey ? 1 : 0})))
  }
  const metadataFields: Record<string, string[]> = {
    Base_Desensitization_Rule: ['rowid', 'name'],
    View_TblList: ['rowid', 'tblname', 'tbldesc', 'dbid', 'DbName'],
    _Base_DictType: ['rowid', 'TypeName', 'functiondesc'],
    Base_DataServiceInterface: ['rowid', 'Name', 'Desc', 'ProviderID'],
    Base_JsonData: ['rowid', 'name'], Base_DataViewList: ['rowid', 'name'],
    View_ViewList: ['rowid', 'vewname', 'vewdesc', 'dbid', 'DbName'],
    Base_TblField: ['rowid', 'tblid', 'enname', 'cnname', 'description', 'DataType', 'IsPKey'],
    _Base_ParamList: ['parid', 'pid', 'parname', 'pardesc'],
    Base_DataSet: ['rowid', 'Name', 'inputParams'],
    Base_DataModel: ['rowid', 'dataSetId', 'Name', 'MetaName', 'Type', 'DbId', 'PrimaryKeyFields', 'description', 'DbName', 'JoinType', 'ForeignKeyFields', 'JoinFilter', 'PId'],
    Base_DataModel_Field: ['rowid', 'dataSetId', 'dataModelId', 'Name', 'type', 'FieldType', 'IsPKey', 'IsOutput', 'ValueFun', 'Expression', 'AsName', 'description', 'allowAIAdd', 'OrderType', 'Order', 'Group'],
    Base_DataModel_Relation: ['rowid', 'dataSetId', 'parentModId', 'childModId', 'parentTable', 'childTable', 'filter', 'depType', 'cascadeDel'],
  }
  for (const [name, table] of Object.entries(metadataConfig.tables)) if ('modelBinding' in table) addModel(meta, table.modelBinding.modelId, name, metadataFields[name]!)
  addModel(target, 'ORDER-MODEL', 'Orders', ['rowid', 'region', 'category', 'choice', 'minimum'])
  addModel(target, 'CHOICE-MODEL', 'Choices', ['rowid', 'orderId', 'region', 'category', 'code', 'title', 'amount', 'kind'])
  addModel('OTHER', 'OTHER-MODEL', 'Orders', ['rowid', 'privateField'])
  let scope = 'CHAIN-SCOPE'
  let writable = true
  const readScope = () => ({token: scope, headers: {'X-AppId': 'CHAIN-APP'}})
  const fileGateway = {readScope: () => scope, readText: async (id: string) => files.get(id) ?? null,
    writeText: async (id: string, text: string) => {expect([target, meta]).toContain(id); files.set(id, text); fileWrites.push(text)}}
  const workspace = () => new ProjectWorkspace({projectId: 'CHAIN-APP',
    pageFiles: {readPageFile: async () => {throw new Error('unexpected page file read')}},
    blueprint: {loadRoot: async () => ({children: []})}, scenarioViews: fileGateway})
  const signed = (name: string, row: Row) => ({...structuredClone(row), lingma_sys_key: `signature:${name}:${String(row['rowid'])}`,
    lingma_sys_params: {r: [], e: name === 'Base_DataSet' ? ['inputParams'] : name === 'Orders' && writable ? ['region', 'category', 'choice'] : [], h: [], m: [], d: false}})
  const request = async (config: RequestConfig) => {
    requests.push(config)
    const formKey = Object.entries(config.headers ?? {}).find(([key]) => key.toLowerCase() === 'x-formkey')?.[1]
    if (config.url === '/api/DataOperation/BatchTableOperateRequestByCRUD') {
      if (options.metadataCreate && Array.isArray(config.data) && config.data.some(group => {
        const added = record(record(group)['CrudModel'])['Added']
        return Array.isArray(added) && added.length > 0
      })) {
        expect(formKey).toBe(meta)
        const receipts = config.data.map(input => {
          const group = record(input), name = String(group['TableName']), crud = record(group['CrudModel'])
          expect(['Base_DataModel', 'Base_DataModel_Field']).toContain(name)
          expect(crud['Changed']).toEqual([]); expect(crud['Deleted']).toEqual([])
          if (!Array.isArray(crud['Added'])) throw new Error('missing metadata additions')
          const added = crud['Added'].map(record)
          for (const row of added) {
            expect(row['dataSetId']).toBe(target)
            expect(records.get(name)!.some(existing => existing['rowid'] === row['rowid'])).toBe(false)
            if (name === 'Base_DataModel_Field') expect(records.get('Base_DataModel')!.some(model => model['rowid'] === row['dataModelId'])).toBe(true)
          }
          records.get(name)!.push(...structuredClone(added))
          return {[name]: added}
        })
        return {Code: 200, Result: {maplistadd: receipts}}
      }
      if (!Array.isArray(config.data) || config.data.length !== 1) throw new Error('expected one explicit save group')
      const group = record(config.data[0]), name = String(group['TableName']), crud = record(group['CrudModel'])
      expect(crud['Added']).toEqual([]); expect(crud['Deleted']).toEqual([])
      expect(formKey).toBe(name === 'Base_DataSet' ? meta : target)
      if (!Array.isArray(crud['Changed']) || crud['Changed'].length !== 1) throw new Error('expected one explicit row')
      const change = record(crud['Changed'][0])
      const row = records.get(name)?.find(candidate => candidate['rowid'] === change['rowid'])
      if (!row) throw new Error('unknown saved row')
      expect(change['lingma_sys_key']).toBe(`signature:${name}:${String(row['rowid'])}`)
      const patch = Object.fromEntries(Object.entries(change).filter(([key]) => key !== 'rowid' && !key.startsWith('lingma_sys_')))
      expect(Object.keys(patch).every(key => name === 'Base_DataSet' ? key === 'inputParams' : writable && ['region', 'category', 'choice'].includes(key))).toBe(true)
      Object.assign(row, structuredClone(patch))
      return {Code: 200, Result: {maplistedit: [{[name === 'Orders' ? 'OrdersRecords' : name]: [{rowid: row['rowid'], ...patch}]}]}}
    }
    expect(config.url).toBe('/api/DataOperation/GetData')
    const body = record(config.data)
    if (!Array.isArray(body['Table']) || body['Table'].length !== 1) throw new Error('unexpected query group')
    const table = record(body['Table'][0]), name = String(table['Name'])
    const model = records.get('Base_DataModel')!.find(row => row['Name'] === name && row['dataSetId'] === formKey)
    expect(model, `registered query ${String(formKey)}@${name}`).toBeDefined()
    if (!records.has(name)) throw new Error(`unexpected model ${name}`)
    const all = records.get(name)!.filter(row => matches(row, table['Filter']))
    if (Array.isArray(table['Fields']) && table['Fields'].some(field => record(field)['ValueFun'] !== undefined)) {
      expect(name).toBe('Choices')
      expect(body['OutputFieldMode']).toBe('REQUEST')
      expect(table['Fields']).toHaveLength(1)
      expect(table['Fields']).toMatchObject([{Name: 'amount', IsOutput: true, Group: 0, ValueFun: {Type: 'GetGroupData', ValType: 'SUM'}}])
      // This is the simulated server: aggregate the filtered source, never a DataView's loaded page.
      return {Code: 200, Result: {primaryKeyField: 'rowid', allowAdd: false,
        data: {Items: [{amount: all.reduce((total, row) => total + Number(row['amount']), 0),
          lingma_sys_params: {r: [], e: [], h: [], m: [], d: false}}], Count: 1}}}
    }
    const page = body['PageParam'] === undefined ? {} : record(body['PageParam'])
    const index = Number(page['index'] ?? 1), size = Number(page['size'] ?? 500)
    const key = model?.['PrimaryKeyFields'] || records.get('Base_DataModel_Field')!
      .find(field => field['dataModelId'] === model?.['rowid'] && field['IsPKey'] === 1)?.['Name'] || null
    return {Code: 200, Result: {primaryKeyField: key,
      allowAdd: options.metadataCreate === true && ['Base_DataModel', 'Base_DataModel_Field'].includes(name),
      data: {Items: all.slice((index - 1) * size, index * size).map(row => signed(name, row)), Count: all.length}}}
  }
  return {meta, target, requests, records, files, fileWrites, request, workspace, fileGateway, readScope, addModel,
    denyWrite: () => {writable = false}, expire: () => {scope = 'EXPIRED'}}
}
