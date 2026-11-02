/**
 * @module @spark-appworks/spark-data:query/data-view-option-catalog
 * 职责：为标准组件提供本次实例的派生选项目录视图，不复制正式业务记录或保存草稿。
 * 边界：调用方从当次可读定义投影value/label；失效时清空，释放仅删除自有目录。
 */
import type {DataSet} from '../dataset'
import type {DataView} from '../data-view'
import {buildDataViewKey} from '../core/data-view-key'

/** 输入与函数候选的临时目录；不参与正式模型身份、权限生成或持久化。 */
export class DataViewOptionCatalog{
  readonly view:DataView
  readonly dataViewKey:string
  readonly #tableName=`optionCatalog_${crypto.randomUUID().replaceAll('-','')}`
  constructor(private readonly dataSet:DataSet){
    if(dataSet.destroyed)throw Error('选项目录所属实例已释放')
    const table=dataSet.addTable(this.#tableName,[{name:'value',type:'string',isPrimaryKey:true},{name:'label',type:'string'}])
    table.resourceType='static-data'
    this.view=table.getOrCreateView('default')
    this.view.configure({valueField:'value',labelField:'label',selectionDelimiter:'',allowDelete:false})
    this.dataViewKey=buildDataViewKey(this.#tableName,'default',dataSet.scenarioId)
  }
  /** 候选未变时不替换视图，避免使标准编辑器会话无故失效；只接受字符串身份与标题。 */
  replace(options:ReadonlyArray<Readonly<{value:string;label:string}>>):void{
    const values=new Set<string>()
    for(const item of options)if(typeof item.value!=='string'||!item.value||typeof item.label!=='string'||values.has(item.value))throw Error('选项目录身份为空或重复');else values.add(item.value)
    const current=this.view.rows
    if(current.length===options.length&&options.every((item,index)=>current[index]?.['value']===item.value&&current[index]['label']===item.label))return
    this.view.replaceRows(options.map(({value,label})=>({value,label})))
  }
  /** 释放本次自有目录，保留原模型、视图和所有业务草稿。 */
  dispose():void{if(!this.dataSet.destroyed&&this.dataSet.getTable(this.#tableName))this.dataSet.removeTable(this.#tableName)}
}
