/**
 * @module @spark-appworks/spark-data:query/data-view-option-catalog
 * 职责：为标准组件提供本次实例的派生选项目录视图，不复制正式业务记录或保存草稿。
 * 边界：调用方从当次可读定义或代码登记的常量投影value/label及附加文本列；失效时清空，释放仅删除自有目录。
 */
import type {DataSet} from '../dataset'
import type {DataView} from '../data-view'
import {buildDataViewKey} from '../core/data-view-key'

/**
 * 目录声明：tableName 省略时生成实例私有名；声明时供 pagedata 列或视图 optionsView 按名引用，同一 DataSet 内不得已存在。
 * fields 是 value/label 之外的文本列，可作为 optionsView.fill 的来源字段。
 */
export type DataViewOptionCatalogOptions = Readonly<{tableName?: string; fields?: readonly string[]}>

/** 一条目录项；value 为唯一身份，附加列须为声明的文本字段。 */
export type DataViewOptionCatalogItem = Readonly<{value: string; label: string} & Record<string, string>>

/** 输入、函数及代码登记常量的临时目录；不参与正式模型身份、权限生成或持久化。 */
export class DataViewOptionCatalog{
  readonly view:DataView
  readonly dataViewKey:string
  readonly #tableName:string
  readonly #fields:readonly string[]
  constructor(private readonly dataSet:DataSet,options:DataViewOptionCatalogOptions={}){
    if(dataSet.destroyed)throw Error('选项目录所属实例已释放')
    this.#tableName=options.tableName??`optionCatalog_${crypto.randomUUID().replaceAll('-','')}`
    const fields=options.fields??[]
    if(new Set(fields).size!==fields.length||fields.some(field=>!field||field==='value'||field==='label'||field==='_pk'))throw Error('选项目录附加列为空、重复或与身份列冲突')
    if(dataSet.getTable(this.#tableName))throw Error(`选项目录表已存在 ${this.#tableName}`)
    this.#fields=[...fields]
    const table=dataSet.addTable(this.#tableName,[{name:'value',type:'string',isPrimaryKey:true},{name:'label',type:'string'},
      ...this.#fields.map(name=>({name,type:'string' as const}))])
    table.resourceType='static-data'
    this.view=table.getOrCreateView('default')
    this.view.configure({valueField:'value',labelField:'label',selectionDelimiter:'',allowDelete:false})
    this.dataViewKey=buildDataViewKey(this.#tableName,'default',dataSet.scenarioId)
  }
  /** 候选未变时不替换视图，避免使标准编辑器会话无故失效；只接受字符串身份、标题及声明的附加列。 */
  replace(options:readonly DataViewOptionCatalogItem[]):void{
    const values=new Set<string>()
    const columns=['value','label',...this.#fields]
    for(const item of options){
      if(typeof item.value!=='string'||!item.value||values.has(item.value))throw Error('选项目录身份为空或重复')
      if(Object.keys(item).some(key=>!columns.includes(key))||columns.some(key=>typeof item[key]!=='string'))throw Error('选项目录列须为声明的文本字段')
      values.add(item.value)
    }
    const current=this.view.rows
    if(current.length===options.length&&options.every((item,index)=>columns.every(key=>current[index]?.[key]===item[key])))return
    const rows=options.map(item=>Object.fromEntries(columns.map(key=>[key,item[key]])))
    const table=this.view.dataTable
    if(!table)throw Error('选项目录表已释放')
    table.rows=rows.map(row=>({...row}))
    this.view.replaceRows(rows)
  }
  /** 释放本次自有目录，保留原模型、视图和所有业务草稿。 */
  dispose():void{if(!this.dataSet.destroyed&&this.dataSet.getTable(this.#tableName))this.dataSet.removeTable(this.#tableName)}
}
