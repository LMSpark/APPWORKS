import { DataViewFilter, RequestState, type DataSet, type DataView, type DataRow } from '@spark-appworks/spark-data'
import type { PageDataSpaceModelSourceReader } from './lowcode-data-space-source-catalog'
import * as LowcodePlatform from '@spark-appworks/spark-lowcode-api'
import { lowcodeApi } from '@/lowcode/lowcode-runtime'
import { LowcodeDictionary } from '@/lowcode/resources/structured-config/dictionary/resource'

type PageDataSpaceModelSourceQuery = Parameters<PageDataSpaceModelSourceReader['query']>[0]
type PageDataSpaceModelSource = Parameters<PageDataSpaceModelSourceReader['prepare']>[0]
type PageDataSpaceModelSourcePrepared = Awaited<ReturnType<PageDataSpaceModelSourceReader['prepare']>>
type PageDataSpaceModelSourceField = PageDataSpaceModelSourcePrepared['fields'][number]
type PageDataSpaceModelSourceType = PageDataSpaceModelSource['type']
import {LowcodeDataSpaceSourceCatalog} from './lowcode-data-space-source-catalog'
function sameSource(first:PageDataSpaceModelSource,second:PageDataSpaceModelSource):boolean{
  return first.type===second.type&&first.id===second.id&&first.name===second.name&&first.description===second.description&&first.dbid===second.dbid&&first.databaseName===second.databaseName&&first.providerId===second.providerId
}
type VisibleField = Readonly<{context: DataView; row: DataRow; fieldName: string; optionalPresentation?: boolean}>
type SourceRead = Readonly<{metaName: string; dataSet: DataSet; filter: ReturnType<typeof DataViewFilter.condition> | undefined; page?: Readonly<{index: number; size: number}>}>
function scalar(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
    throw new Error('模型来源字段不是标量值')
  }
  return String(value).trim()
}

function visible({context, row, fieldName, optionalPresentation}: VisibleField): string {
  if (context.fieldAccess(row, fieldName).read !== 'visible') {
    if (!optionalPresentation) throw new Error(`模型来源字段 ${fieldName} 不可读`)
    return ''
  }
  return scalar(row[fieldName])
}


function field(values: Partial<PageDataSpaceModelSourceField> & Pick<PageDataSpaceModelSourceField, 'Name' | 'description' | 'FieldType'>): PageDataSpaceModelSourceField {
  return Object.freeze({ type: 'dataModel', IsPKey: 0, IsOutput: 1, AsName: '', ValueFun: '', Expression: '', allowAIAdd: 0,
    OrderType: '', Order: 0, Group: 0, ...values })
}

function sourceFields(context:DataView,id:string):PageDataSpaceModelSourceField[]{
 const ids=new Set<string>(),names=new Set<string>()
 return context.rows.map(row=>{
  const get=(fieldName:string,optionalPresentation=false)=>visible({context,row,fieldName,optionalPresentation})
  const fieldId=get('rowid'),name=get('enname'),fieldType=get('DataType'),pkey=get('IsPKey')
  if(!fieldId||ids.has(fieldId)||context.getPkKey(row)!==fieldId||get('tblid')!==id)throw Error('来源字段身份或归属不唯一')
  if(!name||!fieldType||names.has(name.toLowerCase()))throw Error('来源字段名称或类型缺失、重复')
  if(!['0','1','true','false'].includes(pkey))throw Error('来源字段主键标记无效')
  ids.add(fieldId);names.add(name.toLowerCase())
  const primary=pkey==='1'||pkey==='true'?1:0
  return field({Name:name,description:get('cnname',true)||get('description',true),FieldType:fieldType,IsPKey:primary,IsOutput:primary})
 })
}

const staticFields: Readonly<Partial<Record<PageDataSpaceModelSourceType, readonly PageDataSpaceModelSourceField[]>>> = {
  json: Object.freeze([
    field({ Name: 'id', description: '主键（记录路径）', FieldType: 'varchar' }),
    field({ Name: 'pid', description: '记录父级id', FieldType: 'varchar' }),
    field({ Name: 'name', description: '属性名称', FieldType: 'varchar' }),
    field({ Name: 'type', description: '属性类型', FieldType: 'varchar' }),
    field({ Name: 'haschild', description: '是否包含子项', FieldType: 'bool' }),
    field({ Name: 'value', description: '属性值（值函数）', FieldType: 'varchar' }),
  ]),
}

/** 六类来源的字段策划；字典val类型消费已保存设计，其余字段保留正式标题与存储类型。 */
export class LowcodeDataSpaceModelSourceReader implements PageDataSpaceModelSourceReader {
  /** 显式命令按数据库ID和表名核真实目标；私有查询不改来源控件的筛选、选择或草稿。 */
  public static async readTableTarget(dataSet:DataSet,target:Readonly<{dbid:string;name:string;databaseName:string}>,assertCurrent:()=>void):Promise<Pick<PageDataSpaceModelSourcePrepared,'source'|'fields'>>{
    if(!target.dbid.trim()||!target.name.trim()||!target.databaseName.trim())throw Error('数据库目标身份缺失')
    const owned:DataView[]=[]
    async function query(metaName:string,filter:NonNullable<SourceRead['filter']>):Promise<DataView>{
      assertCurrent()
      const template=dataSet.getView(metaName,'sourceDetails')
      if(!template||template.dataTable?.modelBinding?.modelName!==metaName)throw Error('数据库目标缺少正式来源视图')
      const view=template.createQueryView(`tableTarget_${crypto.randomUUID().replaceAll('-','')}`);owned.push(view)
      view.queryConfig={...view.queryConfig,allPages:true};view.filterExpression=filter.toJSON()
      await view.refresh();assertCurrent()
      if(dataSet.destroyed||view.destroyed||view.loadingError||view.requestState!==RequestState.Loaded||view.rows.length!==view.total||!view.countReported)throw Error('数据库目标来源未完整读取')
      return view
    }
    try{
      const tables=await query('View_TblList',DataViewFilter.group({logic:'and',filters:[{field:'dbid',operator:'eq',value:target.dbid},{field:'tblname',operator:'eq',value:target.name}]})),row=tables.rows[0]
      if(tables.rows.length!==1||!row)throw Error('数据库目标来源不存在或不唯一')
      const source=LowcodeDataSpaceSourceCatalog.source('table',tables,row)
      if(source.dbid!==target.dbid||source.name!==target.name||source.databaseName!==target.databaseName)throw Error('数据库目标来源身份或执行数据库名不符')
      const fields=await query('Base_TblField',DataViewFilter.condition({field:'tblid',operator:'eq',value:source.id}))
      return {source,fields:sourceFields(fields,source.id)}
    }finally{for(const view of owned)if(!dataSet.destroyed)view.dataTable?.destroyView(view.viewId)}
  }
  readonly #scopeToken: string
  readonly #scopeAppId: string | undefined
  readonly #metadata: DataSet | undefined
  readonly #metadataScene: string

  /** 显式宿主复用本次正式元数据实例（例如工作流）；省略时保留数据空间设计场景合同。绑定后不能借同场景的新实例继续查询。 */
  public constructor(metadata?:DataSet) {
    const scope=lowcodeApi.readRequestScope();this.#scopeToken=scope.token;this.#scopeAppId=scope.headers['X-AppId']
    this.#metadata=metadata;this.#metadataScene=metadata?.scenarioId??LowcodePlatform.DATA_SPACE_DESIGN_FORM_KEY
  }

  private assertCurrent(): void {
    const current=lowcodeApi.readRequestScope()
    if (current.token !== this.#scopeToken || current.headers['X-AppId'] !== this.#scopeAppId) {
      throw new Error('SPARK_EXECUTION_SCOPE_STALE: 模型来源读取身份已失效')
    }
  }

  private async dictionaryFields(source: PageDataSpaceModelSource): Promise<readonly PageDataSpaceModelSourceField[]> {
    const dataSet = await LowcodeDictionary.loadDefinition(source.id)
    try {
      this.assertCurrent()
      const view = dataSet.getView('_Base_DictType', 'default')
      const row = view?.rows[0]
      if (!view || !row || view.rows.length !== 1 || view.total !== 1
        || visible({context: view, row, fieldName: 'rowid'}) !== source.id
        || visible({context: view, row, fieldName: 'TypeName'}) !== source.name) {
        throw new Error('字典来源身份已变化，请重新选择')
      }
      visible({context: view, row, fieldName: 'dictionaryType'})
      if (!view.getColumn('dictionaryType') || row['dictionaryType'] === undefined) throw new Error('字典编码类型字段 dictionaryType 缺失')
      // 对齐GetDictData的精确分支；存量空值沿字符分支，不清洗或改写设计。
      const valueType = row['dictionaryType'] === '1' ? 'double' : 'varchar'
      return [field({Name: 'rowid', description: '唯一值（ID）', FieldType: 'varchar'}),
        ...LowcodePlatform.DictionarySchema.fields.map(({name, titleField, defaultLabel}) => {
          const title = visible({context: view, row, fieldName: titleField})
          if (!view.getColumn(titleField) || row[titleField] === undefined) throw new Error(`字典标题字段 ${titleField} 缺失`)
          return field({Name: name, description: title || defaultLabel, FieldType: name === 'val' ? valueType : 'varchar'})
        }),
        field({Name: 'ordIdx', description: '排序字段', FieldType: 'int', OrderType: 'ascending', Order: 1}),
      ]
    } finally {dataSet.destroy()}
  }

  private async read({metaName, dataSet, filter, page}: SourceRead): Promise<DataView> {
    this.assertCurrent()
    const viewId = page ? 'sourceCandidates' : 'sourceDetails'
    const view = dataSet.getView(metaName, viewId)
    const assertView = (): void => {
      this.assertCurrent()
      if (dataSet.destroyed || dataSet.scenarioId !== this.#metadataScene || this.#metadata!==undefined&&dataSet!==this.#metadata
        || !view || view.destroyed || dataSet.getView(metaName, viewId) !== view
        || view.dataTable?.modelBinding?.modelName !== metaName || view.dataSet !== dataSet) {
        throw new Error('模型来源元数据空间或命名视图已失效')
      }
    }
    assertView()
    if (!view) throw new Error('模型来源元数据空间缺少命名视图')
    view.filterExpression = filter?.toJSON()
    view.page = page?.index ?? 1
    if (page) view.pageSize = page.size
    const signature = (): string => JSON.stringify([view.filterExpression, view.page, view.pageSize, view.queryConfig])
    const expected = signature()
    await view.refresh()
    assertView()
    if (view.requestState !== RequestState.Loaded || signature() !== expected) throw new Error('模型来源查询已失效，请重新查询')
    if (!page && (!view.queryConfig.allPages || view.rows.length !== view.total)) {
      throw new Error(`${metaName} 模型来源查询未返回完整服务端结果`)
    }
    return view
  }

  public async query(input: PageDataSpaceModelSourceQuery, dataSet: DataSet): Promise<Readonly<{rows: readonly PageDataSpaceModelSource[]; total: number}>> {
    const spec = LowcodeDataSpaceSourceCatalog.config(input.type)
    const page = input.page ?? 1
    const pageSize = input.pageSize ?? 10
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new Error('模型来源页码或页大小无效')
    }
    if (scalar(input.description) && !spec.description) throw new Error('此来源模型未定义描述字段，不能按描述筛选')
    const filters = [
      scalar(input.keyword) ? {field: spec.name, operator: 'contains' as const, value: scalar(input.keyword)} : undefined,
      scalar(input.description) && spec.description ? {field: spec.description, operator: 'contains' as const, value: scalar(input.description)} : undefined,
      scalar(input.databaseName) && spec.databaseName
        ? {field: spec.databaseName, operator: 'contains' as const, value: scalar(input.databaseName)} : undefined,
    ].filter(item => item !== undefined)
    const filter = filters.length > 1 ? DataViewFilter.group({logic: 'and', filters})
      : filters[0] ? DataViewFilter.condition(filters[0]) : undefined
    const context = await this.read({metaName: spec.metaName, dataSet, filter, page: {index: page, size: pageSize}})
    const rows = context.rows.map(row => LowcodeDataSpaceSourceCatalog.source(input.type, context, row))
    if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('模型来源列表身份重复')
    return Object.freeze({rows: Object.freeze(rows), total: context.total})
  }

  public async prepare(source: PageDataSpaceModelSource, dataSet: DataSet, options:NonNullable<Parameters<PageDataSpaceModelSourceReader['prepare']>[2]>={}): Promise<PageDataSpaceModelSourcePrepared> {
    const spec = LowcodeDataSpaceSourceCatalog.config(source.type)
    const id = scalar(source.id)
    if (!id) throw new Error('模型来源身份缺失')
    const context = await this.read({metaName: spec.metaName,
      dataSet,
      filter: DataViewFilter.condition({field: 'rowid', operator: 'eq', value: id})})
    if (context.rows.length !== 1 || context.total !== 1) throw new Error('模型来源身份不存在或不唯一')
    const selected = context.rows[0]
    if (!selected) throw new Error('模型来源身份不存在或不唯一')
    const current = LowcodeDataSpaceSourceCatalog.source(source.type, context, selected)
    if (!sameSource(current,source)) {
      throw new Error('模型来源已变化，请重新选择')
    }
    if (spec.dbid && (!current.dbid || !current.databaseName)) {
      throw new Error('数据库来源缺少数据库身份（dbid/DbName），无法创建模型')
    }
    const target=options.purpose==='operation-target'?await (async()=>{
      if(current.type!=='table')throw Error('操作目标只承接数据库表')
      const verified=await LowcodeDataSpaceModelSourceReader.readTableTarget(dataSet,{dbid:current.dbid,name:current.name,databaseName:current.databaseName},()=>this.assertCurrent())
      if(!sameSource(current,verified.source))throw Error('操作目标目录身份已变化，请重新选择')
      return verified
    })():undefined
    const fields: PageDataSpaceModelSourceField[] = [...(target?target.fields:source.type === 'dict'
      ? await this.dictionaryFields(current) : staticFields[source.type] ?? [])]
    if (!target && source.type !== 'dict' && !staticFields[source.type]) {
      const fieldContext = await this.read({metaName: 'Base_TblField',
        dataSet,
        filter: DataViewFilter.condition({field: 'tblid', operator: 'eq', value: id})})
      fields.push(...sourceFields(fieldContext,id))
    }
    if (source.type === 'interface' || source.type === 'logicView') {
      const params = await this.read({metaName: '_Base_ParamList', dataSet,
        filter: DataViewFilter.condition({field: 'pid', operator: 'eq', value: id})})
      const ids = new Set<string>()
      const names = new Set<string>()
      for (const row of params.rows) {
        const paramId = visible({context: params, row, fieldName: 'parid'})
        if (!paramId || ids.has(paramId) || visible({context: params, row, fieldName: 'pid'}) !== id) throw new Error('来源参数身份或归属不唯一')
        ids.add(paramId)
        const name = visible({context: params, row, fieldName: 'parname'})
        if (!name || names.has(name)) throw new Error('来源参数名缺失或重复')
        names.add(name)
        let fieldType=''
        if(params.getColumn('parzdtype')&&(options.missingInputType!=='preserve'||params.fieldAccess(row,'parzdtype').read!=='invisible'))
          fieldType=visible({context:params,row,fieldName:'parzdtype'})
        if(!fieldType&&options.missingInputType!=='preserve')fieldType='varchar'
        fields.push(field({type: 'inputParams', Name: name,
          description: visible({context: params, row, fieldName: 'pardesc', optionalPresentation: true}),
          FieldType: fieldType,
          IsPKey: 0, IsOutput: 0}))
      }
    }
    this.assertCurrent()
    return Object.freeze({ source: current, model: Object.freeze({ Type: spec.label, MetaName: current.name,
      description: current.description, DbId: spec.dbid ? current.dbid : source.type === 'interface' ? current.providerId || id : id,
      DbName: current.databaseName, JoinType: '', ForeignKeyFields: '', JoinFilter: '', PId: '' }),
    fields: Object.freeze(fields) })
  }
}
