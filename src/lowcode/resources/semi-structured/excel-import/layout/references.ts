/**
 * @module app:lowcode/resources/semi-structured/excel-import/layout/references
 * 职责：原节点保存链核对单组版式的正式节点、物理字段与删除引用。
 * 边界：精确当前方案及相关父子范围；只读预检，不应用草稿、不提交、不另建owner。
 */
import type {DataSet,DataRow,DataTableQuerySaveReferences,DataTableQueryReferenceChange} from '@spark-appworks/spark-data'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {isJsonObject,parseJsonDocument} from '@spark-appworks/spark-json-document'
import {readExcelTransformRows} from '../metadata/queries'
import {resolveExcelPhysicalObject} from '../metadata/physical-source'
import {readSingleExportLayout,validateSingleExportLayout} from './definition'
import {excelLayoutTableKey,hasExcelLayoutReferences as configured} from './routes'
const design='0F93B82141CF40852021D704B0E30BF4',sourceId='34BDBE645F461A3D83282A941D6037F4',table='Base_ImportData_Config'
const dependencies=['schemeid','pid','relatedappid','table','sheet_layout_json','exportType'],fields=['rowid',...dependencies]
/** 本次原设计实例及按需原宿主。 */
export type ExcelLayoutContext=Readonly<{
 /** 本次设计DataSet。 */
 dataSet:DataSet
 /** 页面原PageRuntime；无版式时不要求装配物理来源。 */
 getPage?:()=>PageRuntime
}>
function equal(a:unknown,b:unknown):boolean{return JSON.stringify(a)===JSON.stringify(b)}
function scope(context:ExcelLayoutContext){
 const ds=context.dataSet,nodes=ds.getView(table),page=context.getPage?.()
 if(ds.destroyed||ds.scenarioId!==design||!nodes||nodes.dataTable?.modelBinding?.modelName!==table)throw Error('版式引用缺少原节点模型')
 const scheme=nodes.queryContext['importConfigId'],query=JSON.stringify(nodes.queryContext)
 if(typeof scheme!=='string'||!scheme)throw Error('版式引用缺少当前方案')
 const check=()=>{if(ds.destroyed||nodes.destroyed||ds.getView(table)!==nodes||JSON.stringify(nodes.queryContext)!==query||context.getPage?.()!==page||page&&(page.destroyed||page.getDataSet(design)!==ds))throw Error('版式引用原实例已变化')}
 const read=async(filter:Parameters<typeof readExcelTransformRows>[0]['filter'],projection:readonly string[]=fields)=>readExcelTransformRows({dataSet:ds,table,fields:projection,filter,check})
 const exact=async(id:string,projection:readonly string[]=fields)=>{const rows=await read({logic:'and',filters:[{field:'rowid',operator:'eq',value:id},{field:'schemeid',operator:'eq',value:scheme}]},projection);if(rows.length!==1||rows[0]?.['rowid']!==id)throw Error('版式正式节点不存在或不唯一');return rows[0]}
 const identify=(change:DataTableQueryReferenceChange):string=>{
  const ids=new Set(nodes.dataTable?.viewList.flatMap(view=>[...view.rows,...[...view.dirtyTracking.pendingDeleteIds].flatMap(id=>{const row=view.dirtyTracking.getPendingDeleteSnapshot(id);return row?[row]:[]})].filter(row=>change.matchesKey(view.getPkKey(row))&&view.fieldAccess(row,'rowid').read==='visible'&&row['schemeid']===scheme).map(row=>row['rowid'])))
  const id=[...ids][0];if(ids.size!==1||typeof id!=='string'||!id)throw Error('版式变更未匹配原节点身份');return id
 }
 return {ds,nodes,page,scheme,check,read,exact,identify}
}
/** 只对真实版式、来源或层级修改核引用；普通名称/排序修改不扫描版式来源。 */
export function createExcelLayoutReferences(context:ExcelLayoutContext):DataTableQuerySaveReferences{
 return {fields:dependencies,triggerFields:dependencies,operations:['create','update'],validate:async({changes})=>{
  const current=scope(context),{scheme,exact,read,identify,check}=current,planned=new Map<string,DataRow>(),roots=new Set<string>()
  for(const change of changes){
   check();if(change.values['schemeid']!==scheme)throw Error('版式节点不属于当前方案')
   const id=identify(change),formal=change.kind==='create'?undefined:await exact(id)
   if(formal&&(!change.originalValues||dependencies.some(field=>!equal(formal[field],change.originalValues?.[field]))))throw Error('版式节点正式原值已变化，请重新读取')
   const row:DataRow={...formal,...change.values,rowid:id};planned.set(id,row)
   const parent=row['pid'];if(typeof parent!=='string'||!parent)throw Error('版式节点缺少正式父身份')
   if(configured(row['sheet_layout_json'])){if(parent!==scheme)throw Error('单组版式须保存在根配置');roots.add(id)}
   if(parent!==scheme)roots.add(parent)
   if(formal&&typeof formal['pid']==='string'&&formal['pid']!==scheme)roots.add(formal['pid'])
  }
  const starts=[...roots];roots.clear()
  for(const start of starts){let parent:unknown=start;const visited=new Set<string>()
   while(parent!==scheme){check();if(typeof parent!=='string'||!parent||visited.has(parent)||visited.size>=64)throw Error('版式修改的祖先链无法核定');visited.add(parent)
    const ancestor=planned.get(parent)??await exact(parent,['rowid','schemeid','pid','sheet_layout_json'])
    if(configured(ancestor['sheet_layout_json']))roots.add(parent)
    parent=ancestor['pid']
   }
  }
  for(const id of roots){
   let root=planned.get(id)??await exact(id,['rowid','schemeid','pid','sheet_layout_json'])
   if(!configured(root['sheet_layout_json']))continue
   if(!planned.has(id))root=await exact(id)
   validateSingleExportLayout(root['sheet_layout_json']);const layout=readSingleExportLayout(root['sheet_layout_json'])
   if(!layout)throw Error('版式定义缺失')
   const rootRoute=excelLayoutTableKey(layout.rootTable['table']),detailRoute=excelLayoutTableKey(layout.detailTable['table'])
   if(!rootRoute||!detailRoute||rootRoute===detailRoute||root['pid']!==scheme||root['exportType']!=='default'||excelLayoutTableKey(root['table'])!==rootRoute)throw Error('版式主表须匹配当前default根配置的正式来源')
   const subtree=new Map<string,DataRow>([[id,root]]);let frontier=[id]
   for(let depth=0;frontier.length;depth++){
    if(depth>=64)throw Error('版式子树层级无法核定')
    const originals=await read({logic:'and',filters:[{field:'schemeid',operator:'eq',value:scheme},{field:'pid',operator:'in',value:frontier}]},['rowid','schemeid','pid','table']),children=new Map(originals.map(row=>[String(row['rowid']),row]))
    for(const [key,row]of planned){if(frontier.includes(String(row['pid'])))children.set(key,row);else children.delete(key)}
    frontier=[]
    for(const [key,row]of children){if(!key||subtree.has(key))throw Error('版式子树身份重复或成环');subtree.set(key,row);frontier.push(key)}
   }
   const rootMatches=[...subtree.values()].filter(row=>excelLayoutTableKey(row['table'])===rootRoute),matches=[...subtree.values()].filter(row=>excelLayoutTableKey(row['table'])===detailRoute),matched=matches[0]
   if(rootMatches.length!==1||rootMatches[0]?.['rowid']!==id||matches.length!==1||matched?.['pid']!==id)throw Error('版式物理来源须在整棵配置子树中唯一，明细须为直接子配置')
   const detailId=String(matched['rowid']),detail=planned.get(detailId)??await exact(detailId,['rowid','schemeid','pid','table','relatedappid','exportType'])
   if(detail['schemeid']!==scheme||detail['pid']!==id||excelLayoutTableKey(detail['table'])!==detailRoute||detail['exportType']!=='default')throw Error('版式明细正式归属或来源已变化，须为直接default子配置')
   const page=current.page;if(!page)throw Error('版式物理引用缺少原页面宿主')
   await page.ensureScenarioLoaded(sourceId);check();const source=page.getDataSet(sourceId)
   if(!source)throw Error('版式物理引用缺少原来源空间')
   const guard=()=>{check();if(source.destroyed||page.getDataSet(sourceId)!==source)throw Error('版式物理来源实例已变化')}
   const link=layout.list['link'];if(!isJsonObject(link))throw Error('版式关联不是对象')
   for(const [node,regions,key]of [[root,[layout.form,layout.block],link['parentField']],[detail,[layout.list],link['foreignKeyField']]] as const){
    const app=node['relatedappid'],path=node['table'];if(typeof app!=='string'||typeof path!=='string')throw Error('版式来源缺少应用及物理路径')
    const selected=[key,...regions.flatMap(region=>Array.isArray(region['fields'])?region['fields'].map(field=>isJsonObject(field)?field['name']:undefined):[])]
    const namesToRead=selected.filter((name):name is string=>typeof name==='string'&&!!name)
    if(namesToRead.length!==selected.length)throw Error('版式物理字段未指定')
    const physical=await resolveExcelPhysicalObject({source,applicationId:app,path,allowView:false,check:guard})
    const metadata=await readExcelTransformRows({dataSet:source,table:'Base_TblField',viewId:'excelLayoutRootFields',fields:['rowid','tblid','enname'],filter:{logic:'and',filters:[{field:'tblid',operator:'eq',value:physical.objectId},{field:'enname',operator:'in',value:[...new Set(namesToRead)]}]},check:guard})
    const names=new Set(metadata.map(row=>row['enname'])),ids=new Set(metadata.map(row=>row['rowid']))
    if(metadata.some(row=>row['tblid']!==physical.objectId)||names.size!==metadata.length||ids.size!==metadata.length||selected.some(name=>!names.has(name)))throw Error('版式字段或关联键不属于对应物理来源')
   }
  }
 }}
}
/** 删除核对直接子引用和存活祖先版式；同批删除对象不要求读取其布局或排序。 */
export function createExcelLayoutDeleteReferences(context:ExcelLayoutContext):DataTableQuerySaveReferences{
 return {fields:['schemeid','pid'],triggerFields:[],operations:['delete'],validate:async({changes})=>{
  const {scheme,exact,identify,check,read}=scope(context)
  for(const change of changes){
   if(change.values['schemeid']!==scheme)throw Error('删除版式节点不属于当前方案')
   const targetParent=change.values['pid'];if(typeof targetParent!=='string'||!targetParent)throw Error('删除版式节点缺少父身份')
   const id=identify(change),fresh=await exact(id,['rowid','schemeid','pid'])
   if(fresh['pid']!==targetParent)throw Error('删除版式节点正式父身份已变化')
   const children=await read({field:'pid',operator:'eq',value:id},['rowid','schemeid','pid'])
   for(const child of children){
    if(child['schemeid']!==scheme)throw Error('存在跨方案子配置引用，不能删除')
    const removing=changes.find(item=>item.kind==='delete'&&item.matchesKey(child['rowid']))
    if(child['pid']!==id||removing?.values['schemeid'] !== scheme||removing.values['pid']!==id)throw Error('仍有未提交删除的子配置，不能删除父配置')
   }
   let parent:unknown=targetParent;const visited=new Set<string>()
   while(parent!==scheme){
    check();if(typeof parent!=='string'||!parent||visited.has(parent)||visited.size>=64)throw Error('删除版式节点的父链无法核定');visited.add(parent)
    const deleting=changes.find(item=>item.kind==='delete'&&item.matchesKey(parent))
    const ancestor=await exact(parent,deleting?['rowid','schemeid','pid']:['rowid','schemeid','pid','sheet_layout_json'])
    if(deleting){
     if(deleting.values['schemeid']!==scheme||deleting.values['pid']!==ancestor['pid'])throw Error('同批删除的版式祖先正式归属已变化')
     parent=ancestor['pid'];continue
    }
    const raw=ancestor['sheet_layout_json']
    if(configured(raw)){
     if(typeof raw!=='string')throw Error('版式删除引用无法核定');const layout=parseJsonDocument(raw)
     if(!isJsonObject(layout)||layout['version']!==3||!Array.isArray(layout['tables'])||layout['tables'].some(value=>!isJsonObject(value)||typeof value['table']!=='string'||!value['table']))throw Error('版式删除引用无法核定')
     const target=await exact(id,['rowid','schemeid','pid','table']),route=excelLayoutTableKey(target['table'])
     if(target['pid']!==targetParent||!route)throw Error('删除版式节点正式目标已变化或缺少来源')
     if(layout['tables'].some(value=>isJsonObject(value)&&excelLayoutTableKey(value['table'])===route))throw Error('祖先版式仍引用该明细物理来源，请先清除并保存版式引用')
    }
    parent=ancestor['pid']
   }
  }
 }}
}
