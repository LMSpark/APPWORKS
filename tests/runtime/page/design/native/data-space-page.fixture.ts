import {withDefinitionResources} from '../../../auth-nav/data-space/view-design/definition-resource.fixture'
import {DataSpaceRuntimeApi, DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {ProjectWorkspace, ScenarioViewConfig, type ProjectWorkspaceOptions} from '@spark-appworks/spark-project-model'
import {HttpClientBase, isRecord, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'
import {LowcodeModelRelationAdapter} from '@/lowcode/data-space/lowcode-model-relation-adapter'
import {LowcodeDataSpaceViewDesign, type LowcodeDataSpaceDesignSession} from '@/lowcode/data-space/view-design/lowcode-data-space-view-design'
import {DataViewFilterLocal} from '../../../../../packages/spark-data/src/query/filter/data-view-filter-local'
import {LowcodeDataSpaceSourceCatalog} from '@/lowcode/data-space/model-source/lowcode-data-space-source-catalog'
import metadataConfig from '../../../../../config/pages/data-platform/data-space-design/pagedata.json'
import type {DataViewFilterTree} from '@spark-appworks/spark-data'
import {defineComponent, h, type Component} from 'vue'
import {useRoute} from 'vue-router'

/** 测试宿主：把路由 scenarioId 作为唯一 targetId 传入设计页（生产由数据空间目录对话框传入）。 */
export function designPageHost(page: Component): Component {
  return defineComponent({name: 'DesignPageTestHost', setup() {
    const route = useRoute()
    return () => {const id = route.query['scenarioId']; return h(page, {targetId: typeof id === 'string' ? id : ''})}
  }})
}

type FormalModel = Awaited<ReturnType<DataSpaceDesignApi['readModel']>>
function formal(name: string, fields: string[]): FormalModel {
  return {id: name, name, metaName: name, sourceName: name, sourceId: 'DB', sourceType: 'table',
    primaryKey: 'rowid', businessMain: false, raw: {}, fields: fields.map((field, order) => ({
      id: `${name}-${field}`, modelId: name, name: field, canonicalName: field, type: ['IsBusiness', 'IsBusinessMain', 'IsPKey', 'IsOutput', 'allowAIAdd', 'Order', 'Group'].includes(field) ? 'number' : 'string',
      primaryKey: field === 'rowid', description: field, output: true, computed: false, order, orderType: '', raw: {},
    }))}
}
const models = [formal('Base_DataSet', ['rowid', 'Name', 'description', 'inputParams']),
  formal('Base_DataModel', ['rowid', 'dataSetId', 'Name', 'MetaName', 'ShortName', 'Type', 'description', 'Filter', 'RequestComplete', 'OutputType', 'parentField', 'PrimaryKeyFields', 'hasChildField', 'selfType', 'topValue', 'cacheType', 'IsBusiness', 'IsBusinessMain', 'DbId', 'DbName', 'JoinType', 'ForeignKeyFields', 'JoinFilter', 'PId', 'addApi', 'updateApi', 'deleteApi', 'items', 'updatetime', 'updateuser']),
  formal('Base_DataModel_Field', ['rowid', 'dataSetId', 'dataModelId', 'Name', 'type', 'FieldType', 'ValueFun', 'description', 'IsPKey', 'IsOutput', 'AsName', 'Expression', 'allowAIAdd', 'OrderType', 'Order', 'Group']),
  formal('Base_DataModel_Relation', ['rowid', 'dataSetId', 'parentModId', 'childModId', 'parentTable', 'childTable', 'filter', 'depType', 'cascadeDel', 'updatetime', 'updateuser'])]

export function dataSpacePageFixture(options: {missing?: boolean; readOnly?: boolean; hidden?: boolean; broken?: boolean; hiddenFieldOwner?: boolean; unmatchedFieldOwner?: boolean; sourceInput?: boolean;
  deferDefinition?: boolean; assemblyGate?: Promise<void>; sharedWorkspace?: boolean; formalSourceInputs?: boolean;
  readLegacyLayout?: (id: string) => Promise<string | null>; formalProjection?: boolean; sourceFieldPermissions?: {h?: string[]; m?: string[]}; overviewOnly?: boolean;
  pageFiles?: ProjectWorkspaceOptions['pageFiles']; blueprint?: ProjectWorkspaceOptions['blueprint'];
  modelSources?: NonNullable<ConstructorParameters<typeof LowcodeDataSpaceViewDesign>[0]['modelSources']>; allowModelAdd?: boolean; allowFieldAdd?: boolean; omitFieldReceipt?: boolean; omitFieldWrite?: boolean;
  allowSourceEdit?: boolean; allowModelRename?: boolean; allowFieldEdit?: boolean; allowRelationEdit?: boolean; omitRelationWrite?: boolean; omitRelationReceipt?: boolean;
  sourceFields?: Record<string, unknown>[]; hiddenFieldProperties?: string[]; hiddenModelProperties?: string[]; editableFieldProperties?: string[]; relationRows?: Record<string, unknown>[]; omitModelProperties?: string[]; omitFieldProperties?: string[]; partialFieldWriteId?: string; omitModelWrite?: boolean; omitAllFieldChanges?: boolean;
  businessRows?: Record<string, Record<string, unknown>[]>; queryEndpoint?: string; formalPrimaryKey?: string; inputParameters?: string; deniedFieldOutputIds?: string[];
  desensitizationRules?: Record<string, unknown>[]; allowDataProcess?: boolean; allowArrayEdit?: boolean;
  allowDelete?: boolean; denyDeleteIds?: string[]; omitDeleteWrite?: string; omitDeleteReceipt?: string} = {}) {
  const sessions: LowcodeDataSpaceDesignSession[] = []
  const workspaces: ProjectWorkspace[] = []
  const stored = new Map<string, string>()
  const requests: RequestConfig[] = []
  const modelReads: {scenarioId: string; modelId: string; modelName: string}[] = []
  const assemblyScopes: string[][] = []
  const fileWrites: {targetId: string; text: string}[] = []
  const created = new Map<string, Record<string, unknown>[]>()
  const deleted = new Set<string>()
  let scope = 'SCOPE'
  let loseResponse = false
  let loseFileResponse = false
  let fileResponse: Promise<void> | undefined
  let sourceResponse: Promise<void> | undefined
  let failFieldRead = false
  let failQuery = false
  let failQueryAfterGate = false
  let nextQueryGate: Promise<void> | null = null
  const sourceTargets = new Map<string, string>()
  const modelTargets = new Map<string, string>()
  const modelValues = new Map<string, Record<string, unknown>>()
  const fieldValues = new Map<string, Record<string, unknown>>()
  const fieldTargets = new Map<string, string>()
  const relationValues = new Map<string, Record<string, unknown>>()
  const relationTargets = new Map<string, string>()
  let relationWritable = options.allowRelationEdit === true
  const deniedModelFields = new Set<string>()
  const deniedFieldProperties = new Set<string>()
  let modelResponse: Promise<void> | undefined
  let definitionResponse: Promise<void> | undefined
  let failModelRead = false
  const modelRows = [{rowid: 'M1', dataSetId: 'A', Name: 'Orders', MetaName: 'OrderSource', Type: options.sourceInput ? '接口' : '数据库'},
    {rowid: 'M2', dataSetId: 'A', Name: 'Customers', MetaName: 'CustomerSource', Type: '数据库'}]
  const sourceValues = new Map<string, string>()
  const modelRow = (id = 'M1', target = 'A') => ({...modelRows.find(row => row.rowid === id), dataSetId: target,
    description: '', Filter: '', RequestComplete: '', OutputType: 'Table', parentField: '', hasChildField: '', selfType: '', topValue: '', cacheType: '', IsBusiness: 0, IsBusinessMain: 0,
    ...(options.allowSourceEdit ? {Type: '数据库表', DbId: 'DB', DbName: 'old-database', JoinType: '', ForeignKeyFields: '', JoinFilter: '', PId: ''} : {}),
    ...modelValues.get(`${target}:${id}`)})
  const sourceValue = (targetId = 'A') => sourceValues.get(targetId) ?? ' { "Type": "SystemData", "ParamName": "customer", "Extra": false } '
  let sourceWritable = !options.readOnly
  let fieldAddAllowed = options.allowFieldAdd === true
  let parameters = options.inputParameters ?? ' [{"rowid":"P1","Name":"customer","Description":"客户","IsBusParam":true,"extra":7}] '
  const wireRows = (name: string, targetId: string): Record<string, unknown>[] => {
    const rows: Record<string, unknown>[] = name === 'Base_DataSet' ? [{rowid: targetId, Name: `空间 ${targetId}`, description: `空间说明 ${targetId}`, inputParams: parameters}]
      : name === 'Base_DataModel' ? modelRows.map(row => modelRow(row.rowid, targetId))
      : name === 'Base_DataModel_Field' ? options.sourceFields?.map(row => ({...row, ...fieldValues.get(`${targetId}:${String(row['rowid'])}`), dataSetId: targetId})) ?? [{rowid: 'F1', dataSetId: targetId, dataModelId: options.unmatchedFieldOwner ? 'MISSING' : 'M1', Name: '订单编号', type: 'field', FieldType: 'string', ValueFun: ''}]
      : options.relationRows?.map(row => ({...row, ...relationValues.get(`${targetId}:${String(row['rowid'])}`), dataSetId: targetId})) ?? []
    if (name === 'Base_DataModel_Field' && options.sourceInput) rows.push({rowid: 'F2', dataSetId: targetId, dataModelId: 'M1', Name: 'customerArg', type: 'inputParams', ValueFun: sourceValue(targetId)})
    sourceTargets.set(`token-${targetId}-F2`, targetId)
    for (const row of modelRows) modelTargets.set(`token-${targetId}-${row.rowid}`, targetId)
    rows.push(...(created.get(name) ?? []).filter(row => row['dataSetId'] === targetId).map(row => ({...row,
      ...name === 'Base_DataModel_Field' ? fieldValues.get(`${targetId}:${String(row['rowid'])}`) : modelValues.get(`${targetId}:${String(row['rowid'])}`)})))
    if (options.allowDataProcess && name === 'Base_DataModel') for (const row of rows) {
      for (const key of ['addApi', 'updateApi', 'deleteApi', 'items']) row[key] ??= ''
      modelTargets.set(`token-${targetId}-${String(row['rowid'])}`, targetId)
    }
    if (name === 'Base_DataModel_Field') for (const row of rows) fieldTargets.set(`token-${targetId}-${String(row['rowid'])}`, targetId)
    if (name === 'Base_DataModel_Relation') for (const row of rows) relationTargets.set(`token-${targetId}-${String(row['rowid'])}`, targetId)
    return rows.filter(row => !deleted.has(`${targetId}:${name}:${String(row['rowid'])}`)).map(row => ({...row, lingma_sys_key: row['rowid'] === 'F2' || name === 'Base_DataModel' || name === 'Base_DataModel_Relation' || name === 'Base_DataModel_Field' && options.sourceFields ? `token-${targetId}-${String(row['rowid'])}` : `token-${String(row['rowid'])}`,
      lingma_sys_params: {r: [], e: name === 'Base_DataModel_Field' ? sourceWritable ? ['ValueFun', ...(options.allowFieldEdit ? ['Name', 'AsName'] : []), ...options.editableFieldProperties ?? []]
        .filter(field => !deniedFieldProperties.has(field) && !(field === 'IsOutput' && options.deniedFieldOutputIds?.includes(String(row['rowid'])))) : [] : options.readOnly ? []
        : name === 'Base_DataModel' ? ['description', 'Filter', 'RequestComplete', 'OutputType', 'parentField', 'PrimaryKeyFields', 'hasChildField', 'selfType', 'topValue', 'cacheType', 'IsBusiness', 'IsBusinessMain', ...(options.allowArrayEdit ? ['items'] : []), ...(options.allowDataProcess ? ['addApi', 'updateApi', 'deleteApi'] : []), ...(options.allowModelRename ? ['Name', 'JoinFilter'] : []), ...(options.allowSourceEdit ? ['Type', 'MetaName', 'DbId', 'DbName', 'JoinFilter', 'ForeignKeyFields'] : [])].filter(field => !deniedModelFields.has(field))
          : name === 'Base_DataModel_Relation' ? relationWritable ? ['filter'] : [] : ['inputParams'],
        h: [...options.hidden ? ['inputParams', 'ValueFun', 'description'] : [], ...name === 'Base_DataModel' ? options.hiddenModelProperties ?? [] : [],
          ...name === 'Base_DataModel_Field' ? [...options.hiddenFieldOwner ? ['dataModelId'] : [], ...options.hiddenFieldProperties ?? []] : []], m: [], d: options.allowDelete === true && !options.denyDeleteIds?.includes(String(row['rowid']))}}))
  }
  class FixtureHttp extends HttpClientBase {
    protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
      requests.push(config)
      let result: unknown
      if (config.url === '/api/DataOperation/BatchTableOperateRequestByCRUD') {
        if (!Array.isArray(config.data) || !isRecord(config.data[0]) || !isRecord(config.data[0]['CrudModel'])) throw new Error('missing batch')
        if (options.allowDataProcess) {
          const adds: Record<string, unknown[]>[] = [], edits: Record<string, unknown[]>[] = []
          for (const command of config.data) {
            if (!isRecord(command) || !isRecord(command['CrudModel'])) throw new Error('invalid process batch')
            const name = String(command['TableName']), crud = command['CrudModel']
            if (!['Base_DataModel', 'Base_DataModel_Field'].includes(name) || !Array.isArray(crud['Added']) || !Array.isArray(crud['Changed']) || !Array.isArray(crud['Deleted']) || crud['Deleted'].length) throw new Error('invalid process tables or deletion')
            for (const row of crud['Added']) {
              if (!isRecord(row) || typeof row['rowid'] !== 'string' || row['dataSetId'] !== 'A'
                || (name === 'Base_DataModel' ? !options.allowModelAdd : !options.allowFieldAdd)) throw new Error('invalid process addition')
            }
            if (!(name === 'Base_DataModel_Field' && options.omitFieldWrite)) created.set(name, [...created.get(name) ?? [], ...crud['Added'].filter(isRecord)])
            const changes = []
            for (const row of crud['Changed']) {
              if (!isRecord(row)) throw new Error('invalid process change')
              const queryRow = wireRows(name, 'A').find(item => item['rowid'] === row['rowid'])
              const patch = Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'rowid' && !key.startsWith('lingma_sys_')))
              const permission = queryRow?.['lingma_sys_params']
              const allowed = isRecord(permission) && Array.isArray(permission['e']) ? permission['e'] : []
              if (!queryRow || queryRow['lingma_sys_key'] !== row['lingma_sys_key'] || options.readOnly || Object.keys(patch).some(key => !allowed.includes(key))) throw new Error('process change has no query identity or permission')
              const values = name === 'Base_DataModel' ? modelValues : fieldValues, key = `A:${String(row['rowid'])}`
              values.set(key, {...values.get(key), ...patch}); changes.push(row)
            }
            if (crud['Added'].length && !(name === 'Base_DataModel_Field' && options.omitFieldReceipt)) adds.push({[name]: crud['Added']})
            if (changes.length) edits.push({[name]: changes})
          }
          await modelResponse
          if (loseResponse) {loseResponse = false; throw new Error('response lost after write')}
          return {data: {Code: 200, Result: {maplistadd: adds, maplistedit: edits}}, status: 200, statusText: 'OK', headers: {}}
        }
        if (config.data.every(command => isRecord(command) && isRecord(command['CrudModel']) && Array.isArray(command['CrudModel']['Added']) && !command['CrudModel']['Added'].length && Array.isArray(command['CrudModel']['Changed']) && !command['CrudModel']['Changed'].length)
          && config.data.some(command => isRecord(command) && isRecord(command['CrudModel']) && Array.isArray(command['CrudModel']['Deleted']) && command['CrudModel']['Deleted'].length)) {
          const receipts: Record<string, unknown[]>[] = []
          for (const command of config.data) {
            if (!isRecord(command) || !isRecord(command['CrudModel'])) throw new Error('invalid delete batch')
            const crud = command['CrudModel'], name = String(command['TableName'])
            if (!Array.isArray(crud['Deleted']) || !Array.isArray(crud['Added']) || crud['Added'].length || !Array.isArray(crud['Changed']) || crud['Changed'].length) throw new Error('delete mixed with other mutations')
            for (const item of crud['Deleted']) {
              if (!isRecord(item) || !options.allowDelete || options.denyDeleteIds?.includes(String(item['rowid']))) throw new Error('delete denied')
              const targets = name === 'Base_DataModel' ? modelTargets : name === 'Base_DataModel_Field' ? fieldTargets : relationTargets
              const target = targets.get(String(item['lingma_sys_key']))
              if (!target || !wireRows(name, target).some(row => row['rowid'] === item['rowid'])) throw new Error('delete has no current query identity')
              if (options.omitDeleteWrite !== name && options.omitDeleteWrite !== '*') deleted.add(`${target}:${name}:${String(item['rowid'])}`)
            }
            if (options.omitDeleteReceipt !== name) receipts.push({[name]: crud['Deleted'].map(item => ({rowid: isRecord(item) ? item['rowid'] : undefined}))})
          }
          await modelResponse
          if (loseResponse) {loseResponse = false; throw new Error('response lost after write')}
          return {data: {Code: 200, Result: {maplistdelete: receipts}}, status: 200, statusText: 'OK', headers: {}}
        }
        const combinedModelAndFieldChanges = options.allowFieldEdit === true
          && config.data.some(command => isRecord(command) && command['TableName'] === 'Base_DataModel'
            && isRecord(command['CrudModel']) && Array.isArray(command['CrudModel']['Changed']) && command['CrudModel']['Changed'].length > 0)
          && config.data.some(command => isRecord(command) && command['TableName'] === 'Base_DataModel_Field'
            && isRecord(command['CrudModel']) && Array.isArray(command['CrudModel']['Changed']) && command['CrudModel']['Changed'].length > 0)
        if (combinedModelAndFieldChanges || (options.allowSourceEdit || options.allowModelRename || options.allowArrayEdit || options.allowDelete && config.data.some(command => isRecord(command) && isRecord(command['CrudModel']) && Array.isArray(command['CrudModel']['Deleted']) && command['CrudModel']['Deleted'].length)
          || options.allowFieldAdd && options.editableFieldProperties
          && config.data.some(command => isRecord(command) && isRecord(command['CrudModel']) && Array.isArray(command['CrudModel']['Added'])
            && command['CrudModel']['Added'].length)
          && config.data.some(command => isRecord(command) && isRecord(command['CrudModel']) && Array.isArray(command['CrudModel']['Changed']) && command['CrudModel']['Changed'].length)) && config.data.some(command => isRecord(command) && (command['TableName'] === 'Base_DataModel_Field' || command['TableName'] === 'Base_DataModel_Relation'
          || isRecord(command['CrudModel']) && Array.isArray(command['CrudModel']['Changed']) && command['CrudModel']['Changed'].length > 1))) {
          const added: Record<string, unknown>[] = [], changed: Record<string, unknown>[] = [], removed: Record<string, unknown>[] = []
          const modelChanges: Record<string, unknown>[] = [], relationChanges: Record<string, unknown>[] = []
          for (const command of config.data) {
            if (!isRecord(command) || !isRecord(command['CrudModel'])) throw new Error('invalid field batch')
            const crud = command['CrudModel']
            if (!Array.isArray(crud['Added']) || !Array.isArray(crud['Changed']) || !Array.isArray(crud['Deleted'])) throw new Error('invalid field migration')
            if (command['TableName'] === 'Base_DataModel') {
              for (const change of crud['Changed']) {
                if (!isRecord(change)) throw new Error('invalid model change')
                const target = modelTargets.get(String(change['lingma_sys_key']))
                if (!target || Object.keys(change).some(key => deniedModelFields.has(key))) throw new Error('model save has no query identity or permission')
                const patch = Object.fromEntries(Object.entries(change).filter(([key]) => key !== 'rowid' && !key.startsWith('lingma_sys_')))
                const key = `${target}:${String(change['rowid'])}`
                const storedPatch = Object.fromEntries(Object.entries(patch).filter(([property]) => !options.omitModelProperties?.includes(property)))
                if (!options.omitModelWrite) modelValues.set(key, {...modelValues.get(key), ...storedPatch, updatetime: '2026-10-09T19:30:00', updateuser: 'CURRENT_USER'})
                modelChanges.push({rowid: change['rowid'], ...patch})
              }
              continue
            }
            if (command['TableName'] === 'Base_DataModel_Relation') {
              for (const change of crud['Changed']) {
                if (!isRecord(change)) throw new Error('invalid relation change')
                const target = relationTargets.get(String(change['lingma_sys_key']))
                if (!target || !relationWritable || !options.relationRows?.some(row => row['rowid'] === change['rowid'])
                  || Object.keys(change).some(key => !['rowid', 'filter'].includes(key) && !key.startsWith('lingma_sys_'))) throw new Error('relation save has no query identity or permission')
                if (!options.omitRelationWrite) relationValues.set(`${target}:${String(change['rowid'])}`, {filter: change['filter'], updatetime: 'after-write', updateuser: 'CURRENT_USER'})
                relationChanges.push({rowid: change['rowid'], filter: change['filter']})
              }
              continue
            }
            if (command['TableName'] !== 'Base_DataModel_Field') throw new Error('unexpected migration table')
            for (const item of crud['Deleted']) {
              if (!isRecord(item) || !options.allowDelete || options.denyDeleteIds?.includes(String(item['rowid']))) throw new Error('delete denied')
              const target = fieldTargets.get(String(item['lingma_sys_key']))
              if (!target || !wireRows('Base_DataModel_Field', target).some(row => row['rowid'] === item['rowid'])) throw new Error('delete has no current query identity')
              if (options.omitDeleteWrite !== 'Base_DataModel_Field' && options.omitDeleteWrite !== '*') deleted.add(`${target}:Base_DataModel_Field:${String(item['rowid'])}`)
              removed.push({rowid: item['rowid']})
            }
            for (const change of crud['Changed']) {
              if (!isRecord(change)) throw new Error('invalid field change')
              const target = fieldTargets.get(String(change['lingma_sys_key']))
              if (!target || !wireRows('Base_DataModel_Field', target).some(row => row['rowid'] === change['rowid'])) throw new Error('field save has no query identity')
              const patch = Object.fromEntries(Object.entries(change).filter(([key]) => key !== 'rowid' && !key.startsWith('lingma_sys_')))
              if (options.allowArrayEdit || options.editableFieldProperties) {
                const row = wireRows('Base_DataModel_Field', target).find(row => row['rowid'] === change['rowid'])!, permission = row['lingma_sys_params']
                const editable = isRecord(permission) && Array.isArray(permission['e']) ? permission['e'] : []
                if (Object.keys(patch).some(key => !editable.includes(key))) throw new Error('array field write denied')
              }
              const key = `${target}:${String(change['rowid'])}`
              const storedPatch = Object.fromEntries(Object.entries(patch).filter(([property]) => !options.omitFieldProperties?.includes(property)))
              if (!options.omitAllFieldChanges && (options.partialFieldWriteId === undefined || change['rowid'] === options.partialFieldWriteId)) {
                fieldValues.set(key, {...fieldValues.get(key), ...storedPatch})
              }
              changed.push({rowid: change['rowid'], ...patch})
            }
            for (const row of crud['Added']) {
              if (!isRecord(row) || typeof row['dataSetId'] !== 'string' || row['dataModelId'] !== 'M1' || !options.allowFieldAdd) throw new Error('invalid field addition')
              added.push(row)
            }
          }
          if (!options.omitFieldWrite) created.set('Base_DataModel_Field', [...created.get('Base_DataModel_Field') ?? [], ...added])
          await modelResponse
          if (loseResponse) {loseResponse = false; throw new Error('response lost after write')}
          // 后端按每个请求项输出动作桶；同名模型的不同视图仍分别返回，不能按模型合桶。
          const commands = config.data
          const receipts = (action: string, records: Record<string, Record<string, unknown>[]>) => commands.flatMap(command => {
            if (!isRecord(command) || !isRecord(command['CrudModel'])) throw new Error('invalid receipt command')
            const name = String(command['TableName']), submitted = command['CrudModel'][action]
            if (!Array.isArray(submitted) || !submitted.length) return []
            const rows = (records[name] ?? []).filter(row => submitted.some(item => isRecord(item) && item['rowid'] === row['rowid']))
            return rows.length ? [{[name]: rows}] : []
          })
          return {data: {Code: 200, Result: {
            maplistedit: receipts('Changed', {Base_DataModel: modelChanges, Base_DataModel_Field: changed,
              Base_DataModel_Relation: options.omitRelationReceipt ? [] : relationChanges}),
            maplistadd: receipts('Added', {Base_DataModel_Field: options.omitFieldReceipt ? [] : added}),
            maplistdelete: receipts('Deleted', {Base_DataModel_Field: options.omitDeleteReceipt === 'Base_DataModel_Field' ? [] : removed}),
          }}, status: 200, statusText: 'OK', headers: {}}
        }
        if (Array.isArray(config.data[0]['CrudModel']['Added']) && config.data[0]['CrudModel']['Added'].length) {
          const receipts: Record<string, Record<string, unknown>[]>[] = []
          for (const command of config.data) {
            if (!isRecord(command) || !isRecord(command['CrudModel']) || !Array.isArray(command['CrudModel']['Added'])) throw new Error('invalid create')
            const table = String(command['TableName'])
            const rows = command['CrudModel']['Added'].filter(isRecord)
            if (table === 'Base_DataModel_Field' && (!fieldAddAllowed || rows.some(row => typeof row['dataSetId'] !== 'string'
              || !wireRows('Base_DataModel', row['dataSetId']).some(model => model['rowid'] === row['dataModelId'])))) throw new Error('field addition lacks permission or model ownership')
            if (!(table === 'Base_DataModel_Field' && options.omitFieldWrite)
              && !(table === 'Base_DataModel' && options.omitModelWrite)) created.set(table, [...created.get(table) ?? [], ...rows])
            if (!(table === 'Base_DataModel_Field' && options.omitFieldReceipt)) receipts.push({[table]: rows})
          }
          await modelResponse
          if (loseResponse) {loseResponse = false; throw new Error('response lost after write')}
          return {data: {Code: 200, Result: {maplistadd: receipts}}, status: 200, statusText: 'OK', headers: {}}
        }
        const changed = config.data[0]['CrudModel']['Changed']
        const table = config.data[0]['TableName']
        if (!Array.isArray(changed) || !isRecord(changed[0]) || (table !== 'Base_DataModel_Field' || !options.editableFieldProperties) && changed.length !== 1) throw new Error('missing change')
        if (table === 'Base_DataSet' && typeof changed[0]['inputParams'] === 'string') {
          parameters = changed[0]['inputParams']
          result = {maplistedit: [{Base_DataSet: [{rowid: changed[0]['rowid'], inputParams: parameters}]}]}
        } else if (options.sourceInput && table === 'Base_DataModel_Field' && changed.length === 1 && changed[0]['rowid'] === 'F2' && typeof changed[0]['ValueFun'] === 'string') {
          const targetId = sourceTargets.get(String(changed[0]['lingma_sys_key']))
          if (!targetId) throw new Error('source save has no query identity')
          sourceValues.set(targetId, changed[0]['ValueFun'])
          result = {maplistedit: [{Base_DataModel_Field: [{rowid: 'F2', ValueFun: changed[0]['ValueFun']}]}]}
          await sourceResponse
        } else if (table === 'Base_DataModel_Field' && options.editableFieldProperties) {
          const receipts: Record<string, unknown>[] = []
          for (const change of changed) {
            if (!isRecord(change)) throw new Error('invalid field change')
            const target = fieldTargets.get(String(change['lingma_sys_key']))
            const patch = Object.fromEntries(Object.entries(change).filter(([key]) => key !== 'rowid' && !key.startsWith('lingma_sys_')))
            if (!target || !options.sourceFields?.some(row => row['rowid'] === change['rowid']) || Object.keys(patch).some(key => !options.editableFieldProperties?.includes(key)
              || deniedFieldProperties.has(key) || key === 'IsOutput' && options.deniedFieldOutputIds?.includes(String(change['rowid'])))) throw new Error('field save has no query identity or permission')
            const key = `${target}:${String(change['rowid'])}`
            fieldValues.set(key, {...fieldValues.get(key), ...Object.fromEntries(Object.entries(patch).filter(([property]) => !options.omitFieldProperties?.includes(property)))})
            receipts.push({rowid: change['rowid'], ...patch})
          }
          result = {maplistedit: options.omitFieldReceipt ? [] : [{Base_DataModel_Field: receipts}]}
          await modelResponse
        } else if (table === 'Base_DataModel') {
          const change = changed[0]
          const targetId = modelTargets.get(String(change['lingma_sys_key']))
          if (!targetId) throw new Error('model save has no query identity')
          const patch = Object.fromEntries(Object.entries(change).filter(([key]) => key !== 'rowid' && !key.startsWith('lingma_sys_')))
          const key = `${targetId}:${String(change['rowid'])}`
          if (!options.omitModelWrite) modelValues.set(key, {...modelValues.get(key), ...Object.fromEntries(Object.entries(patch).filter(([property]) => !options.omitModelProperties?.includes(property))), updatetime: '2026-10-09T19:30:00', updateuser: 'CURRENT_USER'})
          result = {maplistedit: [{Base_DataModel: [{rowid: change['rowid'], ...patch}]}]}
          await modelResponse
        } else throw new Error('wrong save model or fields')
        if (loseResponse) {loseResponse = false; throw new Error('response lost after write')}
      } else {
        if (config.url !== '/api/DataOperation/GetData' && config.url !== options.queryEndpoint || !isRecord(config.data) || !Array.isArray(config.data['Table'])
          || !isRecord(config.data['Table'][0])) throw new Error('unexpected query')
        if (failQuery) {failQuery = false; throw new Error('query unavailable')}
        const queryGate = nextQueryGate
        nextQueryGate = null
        if (queryGate) await queryGate
        if (failQueryAfterGate) {failQueryAfterGate = false; throw new Error('query unavailable after hold')}
        const query = config.data['Table'][0]
        if (query['Name'] === 'Base_Desensitization_Rule') {
          const rows = (options.desensitizationRules ?? []).map(row => ({...row, lingma_sys_key: row['rowid'], lingma_sys_params: {r: [], e: [], h: [], m: [], d: false}}))
          return {status: 200, statusText: 'OK', headers: {}, data: {Code: 200, Result: {primaryKeyField: 'rowid', allowAdd: false, data: {Items: rows, Count: rows.length}}}}
        }
        const sourceType = LowcodeDataSpaceSourceCatalog.types.find(type => LowcodeDataSpaceSourceCatalog.config(type.value).metaName === query['Name'])
        if (sourceType) {
          const spec = LowcodeDataSpaceSourceCatalog.config(sourceType.value)
          const parsed = query['Filter'] ? DataSpaceDesignApi.parseFilter(JSON.stringify(query['Filter']))?.toJSON() : undefined
          const leaves = (tree: typeof parsed): Array<{field: string; value: unknown}> => tree === undefined ? []
            : 'logic' in tree ? tree.filters.flatMap(child => leaves(child)) : [{field: tree.field, value: tree.value}]
          const filters = leaves(parsed), page = config.data['PageParam']
          const text = (field?: string) => String(filters.find(item => item.field === field)?.value ?? '')
          const result = await options.modelSources?.query({type: sourceType.value, keyword: text(spec.name), description: text(spec.description),
            ...(spec.databaseName ? {databaseName: text(spec.databaseName)} : {}),
            page: isRecord(page) ? Number(page['index']) : 1, pageSize: isRecord(page) ? Number(page['size']) : 10}, sessions.at(-1)!.metadataDataSet)
          const rows = (result?.rows ?? []).map(source => ({rowid: source.id, [spec.name]: source.name,
            lingma_sys_params: {r: [], e: [], h: options.sourceFieldPermissions?.h ?? [], m: options.sourceFieldPermissions?.m ?? [], d: false},
            ...(spec.description ? {[spec.description]: source.description} : {}), ...(spec.dbid ? {[spec.dbid]: source.dbid} : {}),
            ...(spec.databaseName ? {[spec.databaseName]: source.databaseName} : {}), ...(spec.providerId ? {[spec.providerId]: source.providerId} : {})}))
          return {data: {Code: 200, Result: {primaryKeyField: 'rowid', allowAdd: false, data: {Items: rows, Count: result?.total ?? 0}}}, status: 200, statusText: 'OK', headers: {}}
        }
        if (query['Name'] === 'Base_DataModel_Field' && failFieldRead) {failFieldRead = false; throw new Error('field read unavailable')}
        if (query['Name'] === 'Base_DataModel' && failModelRead) {failModelRead = false; throw new Error('model read unavailable')}
        const inputs = query['inputParams']
        let target = Array.isArray(inputs) ? inputs.find(item => isRecord(item) && item['Name'] === 'dataSpaceId') : undefined
        if (!target && options.formalSourceInputs && ['Base_DataModel', 'Base_DataModel_Field'].includes(String(query['Name']))) {
          const tree = DataSpaceDesignApi.parseFilter(JSON.stringify(query['Filter']))?.toJSON()
          const values = (filter: DataViewFilterTree): unknown[] => 'logic' in filter
            ? filter.logic === 'and' ? filter.filters.flatMap(values) : []
            : filter.field === 'dataSetId' && filter.operator === 'eq' ? [filter.value] : []
          const targets = new Set(tree ? values(tree) : [])
          if (targets.size === 1 && typeof [...targets][0] === 'string') target = {Value: [...targets][0]}
        }
        if (!target && query['Name'] === 'Base_DataModel_Relation') {
          const filter = DataSpaceDesignApi.parseFilter(JSON.stringify(query['Filter']))?.toJSON()
          if (filter && !('logic' in filter) && filter.field === 'dataSetId' && filter.operator === 'eq' && typeof filter.value === 'string') target = {Value: filter.value}
        }
        const name = String(query['Name'])
        const business = name === 'Orders' || Object.hasOwn(options.businessRows ?? {}, name)
        if (!business && (!isRecord(target) || typeof target['Value'] !== 'string')) throw new Error('missing dataSpaceId')
        let rows = business ? (options.businessRows?.[name] ?? []).map(row => ({...row,
          lingma_sys_key: `business-${name}-${String(row['rowid'])}`, lingma_sys_params: {r: [], e: [], h: [], m: [], d: false}}))
          : wireRows(name, isRecord(target) ? String(target['Value']) : '')
        if (query['Filter'] !== undefined && query['Filter'] !== null) {
          const filter = DataSpaceDesignApi.parseFilter(JSON.stringify(query['Filter']))
          if (filter) {
            const evaluator = new DataViewFilterLocal(filter)
            rows = rows.filter(row => evaluator.matches(row))
          }
        }
        if (business && Array.isArray(query['Fields'])) {
          const selected = query['Fields'].filter(isRecord)
          const scenarioId = String(config.headers?.['x-FormKey'] ?? '')
          const model = wireRows('Base_DataModel', scenarioId).find(row => row['Name'] === name)
          const fields = wireRows('Base_DataModel_Field', scenarioId).filter(row => row['dataModelId'] === model?.['rowid'] && row['type'] === 'dataModel')
          const canonical = (fieldName: string) => String(fields.find(field => field['Name'] === fieldName)?.['AsName'] || fieldName)
          const sorts = selected.filter(field => ['ascending', 'descending'].includes(String(field['OrderType'])) && Number(field['Order']) > 0)
            .sort((a, b) => Number(b['Order']) - Number(a['Order']))
          if (sorts.length) rows.sort((a, b) => {
            for (const sort of sorts) {
              const field = canonical(String(sort['Name'])), left = a[field], right = b[field]
              const order = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right))
              if (order) return sort['OrderType'] === 'descending' ? -order : order
            }
            return 0
          })
          if (config.data['OutputFieldMode'] === 'REQUEST') {
            const names = new Set(selected.map(field => canonical(String(field['Name']))))
            rows = rows.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => key.startsWith('lingma_sys_') || names.has(key))))
          }
        }
        if (name === 'Base_DataSet' && config.data['OutputFieldMode'] === 'REQUEST' && Array.isArray(query['Fields'])) {
          const names = new Set(query['Fields'].filter(isRecord).map(field => String(field['Name'])))
          rows = rows.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => key.startsWith('lingma_sys_') || names.has(key))))
        }
        const createdModel = business && (created.get('Base_DataModel') ?? []).find(row => row['Name'] === name)
        const businessKey = options.formalProjection && business && name === modelRow().Name ? sourceModel('A', 'M1').primaryKey
          : createdModel && (created.get('Base_DataModel_Field') ?? []).find(row => row['dataModelId'] === createdModel['rowid'] && row['IsPKey'] === 1)?.['Name']
        const page = config.data['PageParam']
        const items = isRecord(page) && typeof page['index'] === 'number' && typeof page['size'] === 'number'
          ? rows.slice((page['index'] - 1) * page['size'], page['index'] * page['size']) : rows
        result = {primaryKeyField: typeof businessKey === 'string' ? businessKey : 'rowid', allowAdd: query['Name'] === 'Base_DataModel' ? options.allowModelAdd === true
          : query['Name'] === 'Base_DataModel_Field' && fieldAddAllowed,
          data: query['OutputType'] === 'SelfRefData' ? items : {Items: items, Count: rows.length}}
      }
      return {data: {Code: 200, Result: result}, status: 200, statusText: 'OK', headers: {}}
    }
  }
  const http = new FixtureHttp()
  const runtime = new DataSpaceRuntimeApi({http, readScope: () => ({token: scope, headers: {'X-AppId': 'APP'}})})
  const design = new DataSpaceDesignApi({http, runtime, readScope: () => ({token: scope, headers: {'X-AppId': 'APP'}})})
  const assembler = new LowcodeDataSpaceAssembler(runtime, http)
  const sourceModel = (targetId: string, modelId: string): FormalModel => {
    const row = modelRow(modelId, targetId)
    if (deleted.has(`${targetId}:Base_DataModel:${modelId}`)) throw new Error('model was deleted')
    const model = {...formal(String(row.Name), ['rowid', 'parentId']), id: modelId, sourceName: String(row.MetaName), businessMain: row.IsBusinessMain === 1}
    if (!options.sourceFields || modelId !== 'M1') return model
    const rows = wireRows('Base_DataModel_Field', targetId).filter(field => field['dataModelId'] === modelId && field['type'] === 'dataModel')
    if (options.formalProjection) return DataSpaceDesignApi.projectModel(row, rows, options.formalPrimaryKey ?? '')
    return {...model, raw: row, primaryKey: String(rows.find(field => field['Name'] === (options.formalPrimaryKey ?? 'rowid'))?.['AsName'] || (options.formalPrimaryKey ?? 'rowid')),
      fields: rows.map((field, order) => ({id: String(field['rowid']), modelId, name: String(field['Name']), canonicalName: String(field['AsName'] || field['Name']),
      type: String(field['FieldType']), primaryKey: options.formalPrimaryKey ? field['Name'] === options.formalPrimaryKey : Number(field['IsPKey']) === 1, description: String(field['description'] ?? ''), output: Number(field['IsOutput']) === 1,
      computed: false, order: typeof field['Order'] === 'number' ? field['Order'] : order, orderType: typeof field['OrderType'] === 'string' ? field['OrderType'] : '', raw: field}))}
  }
  const createdModels = (targetId: string): FormalModel[] => (created.get('Base_DataModel') ?? []).filter(row => row['dataSetId'] === targetId).map(row => {
    const fields = (created.get('Base_DataModel_Field') ?? []).filter(field => field['dataSetId'] === targetId && field['dataModelId'] === row['rowid'] && field['IsOutput'] === 1)
    if (options.formalProjection || row['Type'] === '数组') return DataSpaceDesignApi.projectModel(row, fields, '')
    const model = formal(String(row['Name']), fields.map(field => String(field['Name'])))
    return {...model, id: String(row['rowid']), sourceName: String(row['MetaName']), primaryKey: String(fields.find(field => field['IsPKey'] === 1)?.['Name'] ?? 'rowid'),
      fields: model.fields.map(field => ({...field, primaryKey: fields.find(item => item['Name'] === field.name)?.['IsPKey'] === 1}))}
  })
  const open = async (targetId: string, loading: Parameters<LowcodeDataSpaceViewDesign['openDesignSession']>[1] = {}) => {
    const token = scope
    const assertScope = () => {if (scope !== token) throw new Error('SPARK_EXECUTION_SCOPE_STALE')}
    if (!options.missing && !stored.has(targetId)) stored.set(targetId, JSON.stringify({scenarioId: targetId, tables: {
      OrdersAlias: {modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {default: {}, shared: {pageSize: 12,
        ...(!options.sourceFields || options.sourceFields.some(field => field['dataModelId'] === 'M1' && (field['AsName'] || field['Name']) === 'parentId' && field['IsOutput'] !== 0)
          ? {treeConfig: {idField: 'rowid', parentIdField: 'parentId'}} : {})}}},
      CustomersAlias: {modelBinding: {modelId: 'M2', modelName: 'Customers'}, views: {default: {}, shared: {pageSize: 24}}},
    }}))
    const workspace = (options.sharedWorkspace ? workspaces.at(-1) : undefined) ?? new ProjectWorkspace({projectId: 'APP',
      pageFiles: options.pageFiles ?? {readPageFile: async () => {throw new Error('not page files')}},
      blueprint: options.blueprint ?? {loadRoot: async () => ({nodeId: 'ROOT', parentNodeId: '', projectId: 'APP', kind: 'module', capability: {name: 'Application'}, source: {}, children: []})}, scenarioViews: {
        readScope: () => scope, readText: async id => stored.get(id) ?? null,
        writeText: async (id, text) => {
          stored.set(id, text); fileWrites.push({targetId: id, text})
          await fileResponse
          if (loseFileResponse) {loseFileResponse = false; throw new Error('file response lost after write')}
        },
      }})
    const service = new LowcodeDataSpaceViewDesign({workspace, assertScope, readLegacyLayout: options.readLegacyLayout ?? (async () => null), ...(options.modelSources ? {modelSources: options.modelSources} : {}),
      readModel: async input => {
        modelReads.push({...input})
        await definitionResponse
        if (options.formalSourceInputs && ['接口', '视图'].includes(String(modelRow(input.modelId, input.scenarioId).Type))) return design.readModel({designScenarioId: 'META', dataSpaceId: input.scenarioId,
          metaName: input.modelName, assertCurrent: assertScope})
        const added = createdModels(input.scenarioId).find(row => row.id === input.modelId && row.metaName === input.modelName)
        if (added) return added
        const row = modelRows.map(item => modelRow(item.rowid, input.scenarioId)).find(item => item.rowid === input.modelId && item.Name === input.modelName)
        if (!row || typeof row.rowid !== 'string') throw new Error('model identity mismatch')
        return sourceModel(input.scenarioId, row.rowid)
      },
      loadMetadata: withDefinitionResources(async id => {
        const configuredColumns = new Map(Object.entries(metadataConfig.tables).map(([name, config]) => [name, 'columns' in config ? config.columns : undefined]))
        const configuredDefaults = new Map(Object.entries(metadataConfig.tables).map(([name, config]) => [name, config.views.default]))
        const catalogs = LowcodeDataSpaceSourceCatalog.types.map(type => {
          const spec = LowcodeDataSpaceSourceCatalog.config(type.value)
          return formal(spec.metaName, ['rowid', spec.name, spec.description, spec.dbid, spec.databaseName, spec.providerId].filter((name): name is string => name !== undefined))
        })
        if (options.desensitizationRules) catalogs.push(formal('Base_Desensitization_Rule', ['rowid', 'name']))
        const config = new ScenarioViewConfig('META', JSON.stringify({scenarioId: 'META', tables: Object.fromEntries([...models, ...catalogs].map(model => [model.name,
          {modelBinding: {modelId: model.id, modelName: model.name}, columns: configuredColumns.get(model.name), views: {default: {...configuredDefaults.get(model.name), autoLoad: false},
            ...(model.name === 'Base_DataModel_Field' ? {modelFields: metadataConfig.tables.Base_DataModel_Field.views.modelFields,
              modelInputFields: metadataConfig.tables.Base_DataModel_Field.views.modelInputFields,
              sourceInputFields: metadataConfig.tables.Base_DataModel_Field.views.sourceInputFields} : {}),
            ...(catalogs.includes(model) ? {sourceCandidates: {autoLoad: false, autoCurrentFirst: false, autoSelectFirst: false, pageSize: 10}} : {})}}]))}))
        const metadata = assembler.assemble({config, space: {dataSpaceId: 'META', name: '元空间'}, models: [...models, ...catalogs], relations: []}).dataSet
        for (const table of Object.values(metadata.tables)) {
          if (catalogs.some(model => model.name === table.tableName)) continue
          const view = table.getView('default')!
          view.queryContext = {dataSpaceId: id}
          if (options.overviewOnly && ['Base_DataModel_Field', 'Base_DataModel_Relation'].includes(table.tableName)) continue
          const loaded = await view.loadFromServer({allPages: true})
          if (!loaded.success) throw new Error('metadata load failed')
        }
        return metadata
      }),
      assemble: async ({scenarioId: id, config, fileExecutors, modelScope}) => {
        await options.assemblyGate
        if (options.broken) throw new Error('SCENARIO_ASSEMBLY: 模型关系无法装配')
        const relations = !config.usesNativeResourceRelations && options.relationRows?.length ? await design.readRelations({designScenarioId: 'META', dataSpaceId: id}) : []
        if (modelScope !== undefined) {
          const bindings = new Map<string, {id: string; name: string}>()
          for (const [key, table] of Object.entries(config.toJSON()['tables'] as Record<string, Record<string, unknown>>)) {
            const binding = table['modelBinding']
            if (isRecord(binding)) bindings.set(key, {id: String(binding['modelId']), name: String(binding['modelName'])})
          }
          config = config.selectModelScope(modelScope, new LowcodeModelRelationAdapter().scopeDependencies(relations, bindings))
        }
        assemblyScopes.push(Object.keys(config.toJSON()['tables'] as object))
        const selectedIds = new Set(Object.values(config.toJSON()['tables'] as Record<string, Record<string, unknown>>)
          .flatMap(table => isRecord(table['modelBinding']) ? [table['modelBinding']['modelId']] : []))
        const targetModels = await Promise.all(modelRows.filter(row => selectedIds.has(row.rowid) && !deleted.has(`${id}:Base_DataModel:${row.rowid}`)).map(async row => {
          if (options.formalSourceInputs && ['接口', '视图'].includes(String(modelRow(row.rowid, id).Type))) return design.readModel({designScenarioId: 'META', dataSpaceId: id,
            metaName: row.Name, assertCurrent: assertScope})
          const valueFunction = DataSpaceDesignApi.parseValueFunction(sourceValue(id))
          return {...sourceModel(id, row.rowid),
            ...(options.sourceInput && row.rowid === 'M1' ? {sourceType: '接口', sourceInputBindings: [{id: 'F2', name: 'customerArg', ...(valueFunction ? {valueFunction} : {})}]} : {})}
        }))
        return assembler.assemble({config, space: {dataSpaceId: id, name: `空间 ${id}`}, models: [...targetModels, ...createdModels(id)], relations, ...(fileExecutors ? {fileExecutors} : {})})
      },
    })
    const session = await service.openDesignSession(targetId, {deferDefinition: loading.deferDefinition ?? options.deferDefinition ?? false})
    sessions.push(session)
    workspaces.push(workspace)
    return session
  }
  return {open, sessions, workspaces, requests, stored, fileWrites, created, sourceValue, modelRow, modelReads, assemblyScopes, get parameters() {return parameters},
    setParameters(value: string) {parameters = value},
    setModelValues(values: Record<string, unknown>, target = 'A', id = 'M1') {modelValues.set(`${target}:${id}`, {...modelValues.get(`${target}:${id}`), ...values})},
    denyModelField(field: string) {deniedModelFields.add(field)},
    denyFieldProperty(field: string) {deniedFieldProperties.add(field)},
    denyRelationWrite() {relationWritable = false},
    setRelationValues(values: Record<string, unknown>, target = 'A', id = 'R') {relationValues.set(`${target}:${id}`, {...relationValues.get(`${target}:${id}`), ...values})},
    failNextModelRead() {failModelRead = true},
    holdModelResponse() {let release = () => {}; modelResponse = new Promise<void>(resolve => {release = resolve}); return release},
    holdDefinitionRead() {let release = () => {}; definitionResponse = new Promise<void>(resolve => {release = resolve}); return release},
    denySourceWrite() {sourceWritable = false},
    denyFieldAdd() {fieldAddAllowed = false},
    failNextFieldRead() {failFieldRead = true},
    failNextQuery() {failQuery = true},
    holdNextQuery(failAfterRelease = false) {
      let release = () => {}
      nextQueryGate = new Promise<void>(resolve => {release = resolve})
      failQueryAfterGate = failAfterRelease
      return release
    },
    holdSourceResponse() {
      let release = () => {}
      sourceResponse = new Promise<void>(resolve => {release = resolve})
      return release
    },
    loseNextFileResponse() {loseFileResponse = true},
    holdFileResponse() {let release = () => {}; fileResponse = new Promise<void>(resolve => {release = resolve}); return release},
    loseNextResponse() {loseResponse = true}, invalidate() {scope = 'OTHER'},
    dispose() {sessions.forEach(session => session.dispose())}}
}
