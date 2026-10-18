/**
 * @module app:lowcode/data-space/model-source/array/lowcode-data-space-array-configuration
 * 职责：按正式字段身份同时迁移数组模型在场景配置中的输出引用。
 * 边界：只变换定义，不保存；常量、显式别名和内部表键保持，不猜测表达式。
 * AI用途：数组表头保存复用原场景文件owner，名称交换不串行替换。
 */
import {buildDataViewKey, DataViewFilter, parseDataViewKey} from '@spark-appworks/spark-data'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {isRecord} from '@spark-appworks/spark-utils'
import type {ArrayDefinitionChange} from './lowcode-data-space-array-edit'

/** 一次已确认表头变更的场景投影；不持有运行状态或数据权限。 */
export class LowcodeDataSpaceArrayConfiguration {
  /** 将原输出名映射到相同正式字段的最终输出名；显式别名未变时不迁移。 */
  static names(change:ArrayDefinitionChange):ReadonlyMap<string,string> {
    return new Map(change.original.fields.flatMap(field=>{
      const next=change.candidate.fields.find(item=>item.id===field.id)
      return field.output&&next?.output&&field.canonicalName!==next.canonicalName?[[field.canonicalName,next.canonicalName]]:[]
    }))
  }

  /** 对原文件一次性生成候选，不对已迁移文件重新执行名称交换。 */
  static rewrite(config:ScenarioViewConfig,change:ArrayDefinitionChange):ScenarioViewConfig {
    const data=structuredClone(config.toJSON()),tables=data['tables'],names=this.names(change),bound=new Set<string>()
    if(!isRecord(tables))throw new Error('数组关联场景缺少模型定义')
    for(const [key,table]of Object.entries(tables))if(isRecord(table)&&isRecord(table['modelBinding'])&&table['modelBinding']['modelId']===change.original.id){
      if(![change.original.name,change.candidate.name].includes(String(table['modelBinding']['modelName'])))throw new Error('数组场景模型身份不一致')
      bound.add(key)
    }
    const reference=(value:unknown,owner:unknown):unknown=>{
      if(typeof value!=='string')return value
      if(typeof owner==='string'&&bound.has(owner)&&names.has(value))return names.get(value)
      const matches=[...bound].filter(name=>value.startsWith(`${name}.`)&&names.has(value.slice(name.length+1)))
      if(matches.length>1)throw new Error(`数组场景字段引用歧义：${value}`)
      const table=matches[0];return table?`${table}.${names.get(value.slice(table.length+1))}`:value
    }
    const property=(value:Record<string,unknown>,key:string,owner:unknown):void=>{
      if(Object.hasOwn(value,key))value[key]=reference(value[key],owner)
    }
    const filter=(value:unknown,child:unknown,parent:unknown):unknown=>{
      if(value===undefined||value===null||value==='')return value
      const parsed=DataViewFilter.parse(value)
      if(!parsed.ok)throw new Error('数组场景过滤定义无法解析')
      const walk=(node:unknown):void=>{
        if(!isRecord(node))return
        const children=node['filters']??node['Filters']
        if(Array.isArray(children)){children.forEach(walk);return}
        property(node,Object.hasOwn(node,'field')?'field':'Field',child)
        const fn=node['value']??node['ValueFun']
        if(!isRecord(fn))return
        if(fn['Type']==='GetTableField')property(fn,'Field',parent)
        else if(fn['Type']==='GetRefData')for(const key of ['RefFieldName','FkFieldName'])property(fn,key,fn['RefTableName'])
        else if(fn['Type']==='GetGroupData')for(const key of ['GroupField','Field'])property(fn,key,fn['GroupTableName'])
        else if(!['GetConstValue','GetInputParam','SystemData','GetUserMasterId'].includes(String(fn['Type']))&&names.size)throw new Error('数组场景包含不透明值函数，须先核查引用')
      }
      const raw:unknown=typeof value==='string'?JSON.parse(value):value,before=JSON.stringify(raw)
      walk(raw)
      return typeof value==='string'&&JSON.stringify(raw)!==before?JSON.stringify(raw):value
    }
    for(const [tableName,table]of Object.entries(tables)) {
      if(!isRecord(table))continue
      if(bound.has(tableName)&&names.size&&(table['api']!==undefined||table['crudConfig']!==undefined))throw new Error('数组自定义请求配置须先核查字段引用')
      if(Array.isArray(table['columns']))for(const column of table['columns'])if(isRecord(column)){
        if(names.size&&typeof column['computeExpression']==='string'&&column['computeExpression']!=='')throw new Error('数组场景含计算表达式，须先核查字段引用')
        if(!Object.hasOwn(column,'computeExpression'))property(column,'name',tableName)
      }
      if(!isRecord(table['views']))continue
      for(const view of Object.values(table['views']))if(isRecord(view)){
        for(const key of ['valueField','labelField']){
          if(Array.isArray(view[key]))view[key]=view[key].map(value=>reference(value,tableName))
          else property(view,key,tableName)
        }
        if(isRecord(view['treeConfig']))for(const key of ['idField','parentIdField','textField'])property(view['treeConfig'],key,tableName)
        const query=view['queryConfig']
        if(isRecord(query)&&Array.isArray(query['fields']))query['fields']=query['fields'].map(value=>reference(value,tableName))
        if(isRecord(query)&&Array.isArray(query['filterLookups']))for(const lookup of query['filterLookups'])if(isRecord(lookup)){
          property(lookup,'field',tableName)
          const source=typeof lookup['sourceViewKey']==='string'?parseDataViewKey(lookup['sourceViewKey']):undefined
          if(source&&source.scope===data['scenarioId']&&source.tableName===change.original.name){
            for(const key of ['matchField','valueField']){const name=lookup[key];if(typeof name==='string'&&names.has(name))lookup[key]=names.get(name)}
            if(change.original.name!==change.candidate.name)lookup['sourceViewKey']=buildDataViewKey(change.candidate.name,source.viewId,source.scope)
          }
        }
        if(isRecord(query)&&isRecord(query['tree']))for(const key of ['keyField','parentField','hasChildrenField'])property(query['tree'],key,tableName)
        if(Array.isArray(view['sortExpression']))for(const sort of view['sortExpression'])if(isRecord(sort))property(sort,'field',tableName)
        if(isRecord(view['aggregates']))for(const [key,aggregate]of Object.entries(view['aggregates']))if(isRecord(aggregate)){
          const next=reference(aggregate['field']??key,tableName)
          if(next!==(aggregate['field']??key))aggregate['field']=next
        }
        if(bound.has(tableName)&&Array.isArray(view['fieldProjection']))for(const projection of view['fieldProjection'])if(isRecord(projection)){
          const before=change.original.fields.find(field=>field.id===projection['fieldId']),after=change.candidate.fields.find(field=>field.id===projection['fieldId'])
          if(!before||!after)throw new Error('数组字段投影身份已删除或不能确认')
          if(projection['resourceField']!==before.name||projection['viewField']!==before.canonicalName)throw new Error('数组字段投影与正式定义不一致')
          projection['resourceField']=after.name;projection['viewField']=after.canonicalName;projection['primaryKey']=after.primaryKey
          if(after.primaryKey)projection['output']=true
        }
        if(names.size&&Object.hasOwn(view,'filterExpression'))view['filterExpression']=filter(view['filterExpression'],tableName,tableName)
      }
    }
    if(names.size&&Array.isArray(data['resourceRelations']))for(const relation of data['resourceRelations'])if(isRecord(relation)&&Object.hasOwn(relation,'filterExpression'))relation['filterExpression']=filter(relation['filterExpression'],relation['childTable'],relation['parentTable'])
    if(Array.isArray(data['viewCascades']))for(const cascade of data['viewCascades'])if(isRecord(cascade)){
      if(cascade['kind']==='field'){
        property(cascade,'targetField',cascade['tableName'])
        if(Array.isArray(cascade['parents']))for(const parent of cascade['parents'])if(isRecord(parent))property(parent,'field',parent['tableName'])
      }else{
        if(Array.isArray(cascade['filterBindings']))for(const binding of cascade['filterBindings'])if(isRecord(binding)){
          property(binding,'sourceField',cascade['parentTable']);property(binding,'targetField',cascade['childTable'])
        }
        if(Array.isArray(cascade['inputBindings']))for(const binding of cascade['inputBindings'])if(isRecord(binding)){
          property(binding,'sourceField',cascade['parentTable']);if(isRecord(binding['when']))property(binding['when'],'field',cascade['parentTable'])
        }
        if(Array.isArray(cascade['when']))for(const condition of cascade['when'])if(isRecord(condition))property(condition,'field',cascade['parentTable'])
      }
    }
    return new ScenarioViewConfig(String(data['scenarioId']),JSON.stringify(data))
  }
}
