/**
 * @module @spark-appworks/spark-data:core/tree-field
 * 职责：复用字段成员读取，将原行投影为树种子并按同父数值顺序排列。
 * 边界：不查询、不维护行副本真源；调用方须核源字段权限，树ID不代表正式记录主键。
 */
import {DataFieldMember} from './data-field-member'
import {isRecord} from '@spark-appworks/spark-utils'
import type {DataRow,FlatTreeNode,TreeConfig,TreeFieldSelector} from '../types'

const TREE_ORDER = Symbol('spark-tree-order')

/** 树字段的定位和本地投影；字符串从不隐式解释为JSON路径。 */
export class DataTreeField {
  /** 校验显式字段定位；保留点号字面字段，路径不隐式推断。 */
  static parse(value:unknown):TreeFieldSelector {
    if(typeof value==='string'&&value.length>0)return value
    if(!isRecord(value)||Object.keys(value).some(key=>!['field','path','format'].includes(key))
      ||typeof value['field']!=='string'||!value['field']||!Array.isArray(value['path'])||!value['path'].length
      ||(value['format']!==undefined&&value['format']!=='text'&&value['format']!=='native'))throw Error('TREE_FIELD: 字段成员定位无效')
    const path:Array<string|number>=[]
    for(let i=0;i<value['path'].length;i++){
      const key:unknown=value['path'][i]
      if(!Object.hasOwn(value['path'],i)||(typeof key!=='string'&&!(typeof key==='number'&&Number.isSafeInteger(key)&&key>=0)))throw Error('TREE_FIELD: 成员路径无效')
      path.push(key)
    }
    return {field:value['field'],path,...(value['format']===undefined?{}:{format:value['format']})}
  }
  /** 返回顶层源字段名，供正式输出、字段权限和定义引用检查；不返回成员值。 */
  static source(selector:TreeFieldSelector):string {return typeof selector==='string'?selector:selector.field}

  /** 纯字段读取，成员复用DataFieldMember；不查询或授予权限，调用方先核源字段可见。 */
  static read(row:DataRow,selector:TreeFieldSelector):unknown {
    return typeof selector==='string'?row[selector]:DataFieldMember.read(row[selector.field],selector)
  }

  /** 仅投影树寻址字段；原行、原主键及JSON成员保持不变。调用方先核源字段读取权限。 */
  static project(row:DataRow,config:TreeConfig):FlatTreeNode|null {
    const read=(field:TreeFieldSelector)=>DataTreeField.read(row,field)
    const id=read(config.idField??'id')
    if(typeof id!=='string'&&typeof id!=='number')return null
    const parent=read(config.parentIdField??'parentId')
    if(typeof config.parentIdField==='object'&&parent!==null&&parent!==undefined
      &&typeof parent!=='string'&&!(typeof parent==='number'&&Number.isFinite(parent)))throw Error('TREE_PARENT_FIELD: 父成员必须是字符串、有限number或空值')
    const text=read(config.textField??'name')
    const name=typeof text==='string'?text:typeof row['name']==='string'?row['name']:typeof row['label']==='string'?row['label']:String(id)
    const node:FlatTreeNode={...row,id,parentId:typeof parent==='string'||typeof parent==='number'?parent:parent===null||parent===undefined?null:String(parent),
      name}
    if(config.orderField!==undefined){
      const order=read(config.orderField)
      if(typeof order!=='number'||!Number.isFinite(order))throw Error('TREE_ORDER_FIELD: 同父排序字段必须是有限number')
      Object.defineProperty(node,TREE_ORDER,{value:order,enumerable:true})
    }
    return node
  }

  /** 调用方传入同一父节点的集合；排序不修改缓存或原行，未配置时保持既有顺序。 */
  static sort<T extends DataRow>(nodes:T[],selector:TreeFieldSelector|undefined):T[] {
    if(selector===undefined)return nodes
    return nodes.map(node=>{
      const order=Object.hasOwn(node,TREE_ORDER)?Reflect.get(node,TREE_ORDER):DataTreeField.read(node,selector)
      if(typeof order!=='number'||!Number.isFinite(order))throw Error('TREE_ORDER_FIELD: 同父排序字段必须是有限number')
      return {node,order}
    }).sort((left,right)=>left.order-right.order).map(entry=>entry.node)
  }
}
