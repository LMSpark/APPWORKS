/**
 * @module @spark-appworks/spark-component:components/containers/filter/expression/RendererFilterExpression/useFilterColumnView
 * 职责：从本次PageRuntime的正式字段目录视图投影过滤字段。
 * 边界：不查询或缓存业务数据，不改候选视图；目录状态变化由同一DataView事件桥驱动。
 */
import {computed,ref} from 'vue'
import type {DataColumn} from '@spark-appworks/spark-data'
import {parseDataViewKey} from '@spark-appworks/spark-data'
import {PAGE_RUNTIME,useSparkConsume} from '../../../../internal'
import {useDataViewEventBridge} from '../../../runtime/useDataViewEventBridge'
import type {RFilterExpressionProps} from './RendererFilterExpression.props'
import type {FieldComposableProps} from '../../../../fields/context/field-composable-props'
/** Vue字段props投影；不消费页面的业务状态。 */
type Input=FieldComposableProps<Pick<RFilterExpressionProps,'columns'|'columnDataViewKey'|'columnTypeField'|'columnTypeMap'>>
/** 目录更新保留编辑器草稿，返回错误时消费者只禁止应用，不将错误当空目录。 */
export function useFilterColumnView(props:Input){
 const {sparkConsume}=useSparkConsume(),runtime=sparkConsume(PAGE_RUNTIME),tick=ref(0)
 const resolveSource=()=>{
  if(props.columnDataViewKey===undefined)return null
  if(!parseDataViewKey(props.columnDataViewKey)?.scope)throw Error('过滤字段目录必须使用完整数据视图键')
  return runtime?.resolveView(props.columnDataViewKey)??null
 }
 const source=computed(()=>{try{return resolveSource()}catch{return null}})
 const refresh=()=>{tick.value++}
 useDataViewEventBridge({resolvedView:source,onRowsChanged:refresh,onCleared:refresh,onRequestStateChanged:refresh,onConfigChanged:refresh,onEditingChanged:refresh,onMutatingChanged:refresh})
 const readCurrent=()=>{
  tick.value
  try{
   if(props.columnDataViewKey===undefined)return {columns:props.columns??[],error:props.columns===undefined?'过滤编辑器须声明字段元信息或字段目录视图':''}
   if(props.columns!==undefined)throw Error('过滤字段元信息与字段目录视图不能同时配置')
   const view=resolveSource()
   if(!runtime||!view||view.destroyed)throw Error('过滤字段目录未绑定原运行实例的有效视图')
   if(view.mutating||view.hasEditingChanges()||view.dirtyTracking.hasPendingChanges())throw Error('过滤字段目录尚有未确认的编辑，请先保存或取消')
   const snapshot=view.readSnapshot()
   if(view.loadingError)throw view.loadingError
   if(view.dataTable?.resourceType!=='static-data'&&(snapshot.countReported!==true||snapshot.total!==snapshot.rows.length))throw Error('过滤字段目录查询结果不完整')
   const nameField=view.valueField,labelField=view.labelField,typeField=props.columnTypeField
   if(typeof nameField!=='string'||!nameField||!view.columns.some(column=>column.name===nameField))throw Error('过滤字段目录缺少单字段valueField')
   if(typeField!==undefined&&(!view.columns.some(column=>column.name===typeField)||props.columnTypeMap===undefined))throw Error('过滤字段目录类型须声明有效成员及类型映射')
   const columns:DataColumn[]=[],names=new Set<string>()
   for(const row of view.rows){
    if(view.fieldAccess(row,nameField).read!=='visible'||typeField!==undefined&&view.fieldAccess(row,typeField).read!=='visible')throw Error('过滤字段目录的名称或类型不可读')
    const name=row[nameField]
    if(typeof name!=='string'||!name.trim()||names.has(name))throw Error('过滤字段目录的字段名为空或不唯一')
    names.add(name)
    const label=labelField&&view.fieldAccess(row,labelField).read==='visible'&&typeof row[labelField]==='string'&&row[labelField]?row[labelField]:name
    const rawType=typeField===undefined?undefined:row[typeField]
    const type=typeField===undefined?'string':(typeof rawType==='string'||typeof rawType==='number')&&props.columnTypeMap&&Object.hasOwn(props.columnTypeMap,String(rawType))?props.columnTypeMap[String(rawType)]:undefined
    if(type===undefined)throw Error('过滤字段目录包含未声明映射的类型')
    columns.push({name,label:typeof label==='string'?label:name,type})
   }
   return {columns,error:''}
  }catch(cause){return {columns:[],error:cause instanceof Error?cause.message:String(cause)}}
 }
 return Object.assign(computed(readCurrent),{readCurrent,resolveSource})
}
