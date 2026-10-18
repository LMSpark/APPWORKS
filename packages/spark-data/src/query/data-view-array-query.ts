/**
 * @module @spark-appworks/spark-data:query/data-view-array-query
 * 职责：把已获准读取的静态对象数组接入DataView的只读查询合同。
 * 边界：调用方负责来源读取与执行域；本类不授予数据库写权限、不保存原定义。
 * AI用途：正式数组来源复用过滤表达式、视图分页排序、绑定和选中，不在页面另写查询。
 */
import type {DataView} from '../data-view'
import type {DataColumn, DataRow, QueryParams} from '../types'
import {DataViewLocalQuery} from './data-view-local-query'

type QueryResult=Awaited<ReturnType<Parameters<DataView['bindQueryExecutor']>[0]['executeQuery']>>

/** 数组定义的只读查询快照；每个命名视图独立分页、过滤和选择。 */
export class DataViewArrayQuery {
  readonly #rows:DataRow[]
  readonly #fields:Set<string>
  readonly #identity:{scenarioId:string;metaName:string}
  /** 调用方须先核定来源可读性和输出投影；guard在查询和消费结果时持续核生命周期。 */
  constructor(private readonly view:DataView,rows:readonly DataRow[],private readonly guard:()=>void) {
    const binding=view.dataTable?.modelBinding,scenarioId=view.dataSet?.scenarioId
    if(view.dataTable?.resourceType!=='static-data' || !binding || !scenarioId)throw new Error('数组查询缺少正式静态模型身份')
    this.#identity={scenarioId,metaName:binding.modelName}
    this.#fields=new Set(view.columns.filter(column=>column.name!=='_pk' && !column.computeExpression).map(column=>column.name))
    this.#rows=structuredClone([...rows])
    const key=view.primaryKey
    if(key) {
      const keys=new Set<string>()
      for(const row of this.#rows) {
        const value=row[key]
        if(typeof value!=='string' && typeof value!=='number' || value==='' || keys.has(String(value)))throw new Error('数组主键必须是非空唯一标量')
        keys.add(String(value))
      }
    }
  }
  private assertCurrent():void {
    this.guard()
    if(this.view.destroyed || this.view.dataSet?.destroyed!==false || this.view.dataSet.scenarioId!==this.#identity.scenarioId
      || this.view.dataTable?.modelBinding?.modelName!==this.#identity.metaName)throw new Error('数组查询身份已失效')
  }
  /** 复用本查询来源已核定的字段集合；不把完整模型列或后续输出投影当作新来源合同。 */
  queryColumns(view: DataView): readonly DataColumn[] {
    this.assertCurrent()
    const table = view.dataTable
    if (!table || table !== this.view.dataTable || view.destroyed) throw new Error('数组字段目录不属于此模型')
    return table.columns.filter(column => this.#fields.has(column.name))
  }
  /** 同一查询配置反复消费完整原数组；结果只读，编辑正式items须回到定义的原查询。 */
  executeQuery(view:DataView,params:QueryParams):Promise<QueryResult> {
    this.assertCurrent()
    if(view.dataTable!==this.view.dataTable || view.destroyed)throw new Error('数组查询不属于此模型')
    const {rows,total,output}=DataViewLocalQuery.select({rows:this.#rows,fields:this.#fields,
      primaryKeys:view.primaryKey?[view.primaryKey]:[],params})
    const rowKey=(row:Readonly<DataRow>)=>view.primaryKey?row[view.primaryKey]:undefined
    const keys=new Set(rows.map(rowKey))
    const allowed=(key:unknown,field:string)=>{this.assertCurrent();return key!==undefined && keys.has(key) && output.has(field)}
    const result:QueryResult={rows,total,rowKey,
      assertIdentity:identity=>{this.assertCurrent();if(identity.scenarioId!==this.#identity.scenarioId||identity.metaName!==this.#identity.metaName)throw new Error('数组结果身份不匹配')},
      fieldAccess:(key,field)=>({read:allowed(key,field)?'visible':'invisible',write:'denied',component:allowed(key,field)?'readonly':'hidden',required:false,writeMode:'readonly'}),
      readFieldAccess:(row,field)=>{this.assertCurrent();return rows.includes(row) && output.has(field)?'visible':'invisible'},
      addActionState:()=>{this.assertCurrent();return 'hidden'},editActionState:()=>{this.assertCurrent();return 'hidden'},
      deleteActionState:()=>{this.assertCurrent();return 'hidden'},createChildActionState:()=>{this.assertCurrent();return 'hidden'},
      viewActionState:(key,available=true)=>{this.assertCurrent();return keys.has(key)?available?'enabled':'disabled':'hidden'},
    }
    return Promise.resolve(result)
  }
}
