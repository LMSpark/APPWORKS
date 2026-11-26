/**
 * @module @spark-appworks/spark-data:query/data-view-local-query
 * 职责：在资源已读取的记录上执行同一DataView过滤、排序、分页和输出投影。
 * 边界：不读取来源，不维护编辑态，不决定读写授权。
 * AI用途：数组及文件资源适配器共享查询算法，业务页面不实现另一套查询。
 */
import type {DataRow, QueryParams} from '../types'
import type {DataView} from '../data-view'
import {DataViewFilter} from './filter/data-view-filter'
import {DataViewFilterLocal} from './filter/data-view-filter-local'
import {DataViewQuery} from './data-view-query'

type DataViewQueryResult=Awaited<ReturnType<Parameters<DataView['bindQueryExecutor']>[0]['executeQuery']>>
type DataViewLocalReadonlyIdentity=Readonly<{scenarioId:string;metaName:string}>
export type DataViewLocalReadonlyResultOptions=Readonly<{
 view:DataView
 rows:readonly DataRow[]
 fields:ReadonlySet<string>
 primaryKey:string
 params:QueryParams
 guard:()=>void
 assertIdentity?:(identity:DataViewLocalReadonlyIdentity)=>void
 guardConsumers?:boolean
 serverTotal?:number
}>

/** 已加载资源的查询执行器；结果仍由DataView接纳，行值保持原生类型。 */
export class DataViewLocalQuery {
  /** 本地已读取集合支持的输出模式；SelfRefData读取完整集合，不执行服务器节点查询。 */
  static readonly outputTypes: ReadonlyArray<Readonly<{value: string; label: string}>> = Object.freeze([
    Object.freeze({value: 'Table', label: '列表查询'}),
    Object.freeze({value: 'SelfRefData', label: '完整集合（不分页）'}),
  ])

  /** 在来源读取前捕获并校验本次参数；viewConfig为元信息引用，其余输入隔离原地修改。 */
  static captureParams(input: Readonly<{fields: ReadonlySet<string>; primaryKeys: readonly string[]; params: QueryParams}>): QueryParams {
    const {viewConfig, ...query} = input.params
    const params: QueryParams = {...structuredClone(query), ...(viewConfig ? {viewConfig} : {})}
    if (input.primaryKeys.some(key => !input.fields.has(key))) throw new Error('LOCAL_QUERY_PRIMARY_KEY: 主键不在本次来源字段范围')
    this.select({...input, rows: [], params})
    return params
  }

  /** 使用视图请求快照查询完整来源；主键始终保留，总数在分页之前计算。 */
  static select(input: Readonly<{rows: readonly DataRow[]; fields: ReadonlySet<string>;
    primaryKeys: readonly string[]; params: QueryParams}>): Readonly<{rows: DataRow[]; total: number; output: ReadonlySet<string>}> {
    const {fields, params, primaryKeys} = input
    if (params.tree || params.outputType && !this.outputTypes.some(item => item.value === params.outputType)) {
      throw new Error('本地资源支持Table或完整SelfRefData，不执行服务器节点/关联查询')
    }
    if (params.distinct === true || (params.children?.length ?? 0) > 0 || params.sourceInputMode !== undefined
      || params.search !== undefined && params.search !== '' || (params.include?.length ?? 0) > 0
      || params.parentId !== undefined || params.rootId !== undefined || params.depthLimit !== undefined
      || params.limit !== undefined || params.treeMode === 'nested') {
      throw new Error('本地资源不支持去重、子查询、来源模式、搜索或节点范围参数')
    }
    if (params.projection?.some(field => field.group !== 0 || field.distinct || field.expression !== '' || field.valueFunction !== '')) {
      throw new Error('本地资源只支持基本字段输出，不执行分组、表达式或函数投影')
    }
    let rows = input.rows.slice()
    if (params.filter) {
      const parsed = DataViewFilter.parse(params.filter)
      if (!parsed.ok) throw new Error('本地资源过滤表达式无效')
      const local = new DataViewFilterLocal(parsed.value.bindInputParams(params.context ?? {}))
      local.validateFields(fields)
      rows = rows.filter(row => local.matches(row))
    }
    if (params.sort) {
      const sort = params.sort.split(',').map(part => {
        const [field, direction] = part.split(':')
        if (!field || !fields.has(field) || direction !== 'asc' && direction !== 'desc') throw new Error('本地资源排序字段或方向无效')
        return {field, direction}
      })
      rows.sort((left, right) => {
        for (const {field, direction} of sort) {
          const a = left[field], b = right[field]
          const compared = typeof a === 'number' && typeof b === 'number' ? a - b : String(a ?? '').localeCompare(String(b ?? ''))
          if (compared) return direction === 'asc' ? compared : -compared
        }
        return 0
      })
    }
    const total = rows.length, max = params.maxRows ?? 50000
    if (!Number.isSafeInteger(max) || max < 1) throw new Error('本地资源集合上限必须是正整数')
    if (DataViewQuery.isPaginated(params)) {
      const page = params.page ?? 1, size = params.pageSize ?? 20
      if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(size) || size < 1) throw new Error('本地资源分页参数必须是正整数')
      rows = rows.slice((page - 1) * size, page * size)
    } else if (total > max) throw new Error('本地资源完整集合超过配置上限')
    const requested = params.fields ?? (params.projection?.length
      ? params.projection.filter(field => field.output).map(field => field.viewField) : [...fields])
    if (requested.some(field => !fields.has(field))) throw new Error('本地资源输出投影引用未知字段')
    const output = new Set([...requested, ...primaryKeys])
    return {total, output, rows: structuredClone(rows.map(row => Object.fromEntries(Object.entries(row).filter(([field]) => output.has(field)))))}
  }

  /** 将本地查询结果接纳为只读 DataView result；查询、身份和字段权限只在一处维护。 */
  static readonlyResult(input:DataViewLocalReadonlyResultOptions):DataViewQueryResult{
    const {view,rows,guard,fields,primaryKey,params}=input
    const assertCurrent=()=>{
      guard()
      if(view.primaryKey!==primaryKey)throw Error('DATA_SET_READONLY_QUERY_IDENTITY: 本次查询主键已变化')
    }
    const assertIdentity=(identity:DataViewLocalReadonlyIdentity)=>{
      assertCurrent()
      input.assertIdentity?.(identity)
    }
    assertCurrent()
    if(input.serverTotal!==undefined&&(!Number.isSafeInteger(input.serverTotal)||input.serverTotal<rows.length))
      throw Error('DATA_SET_READONLY_PAGE: 服务总数无效')
    if(primaryKey&&!fields.has(primaryKey))throw Error('DATA_SET_READONLY_QUERY_FIELDS: 主键不在本次来源字段范围')
    const selected=this.select({
      rows:[...rows],fields,primaryKeys:primaryKey?[primaryKey]:[],
      params:input.serverTotal===undefined?params:{...(params.fields?{fields:params.fields}:{}),allPages:true,treeMode:'flat'},
    })
    const guardConsumer=()=>{if(input.guardConsumers)assertCurrent()}
    const rowKey=(row:Readonly<DataRow>)=>{assertCurrent();return primaryKey?row[primaryKey]:undefined}
    const keys=new Set(selected.rows.map(rowKey))
    const allowed=(key:unknown,field:string)=>key!==undefined&&keys.has(key)&&selected.output.has(field)
    return {
      rows:selected.rows,
      total:input.serverTotal??selected.total,
      ...(input.serverTotal === undefined ? {} : {countReported: true}),
      rowKey,
      assertIdentity,
      fieldAccess:(key,field)=>{
        guardConsumer()
        return {
          read:allowed(key,field)?'visible':'invisible',
          write:'denied',
          component:allowed(key,field)?'readonly':'hidden',
          required:false,
          writeMode:'readonly',
        }
      },
      readFieldAccess:(row,field)=>{
        guardConsumer()
        return selected.rows.includes(row)&&selected.output.has(field)?'visible':'invisible'
      },
      addActionState:()=>{guardConsumer();return 'hidden'},
      editActionState:()=>{guardConsumer();return 'hidden'},
      deleteActionState:()=>{guardConsumer();return 'hidden'},
      createChildActionState:()=>{guardConsumer();return 'hidden'},
      viewActionState:(key,available=true)=>{guardConsumer();return keys.has(key)?(available?'enabled':'disabled'):'hidden'},
    }
  }
}
