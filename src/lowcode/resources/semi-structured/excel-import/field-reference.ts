/**
 * @module app:lowcode/resources/semi-structured/excel-import/field-reference
 * 职责：将本次正式表、物理视图或字典选择成组编辑到原Excel映射行。
 * 边界：视图确认仅精确核对物理路径路由；不保存、不持有业务草稿，派生字段只作选项。
 * AI用途：引用弹窗确认与清空复用原DataView检查点，不将选择器主键保存为物理字段名。
 */
import {DataViewOptionCatalog,RequestState,type DataSet,type DataView,type DataRow} from '@spark-appworks/spark-data'
import {DictionarySchema} from '@spark-appworks/spark-lowcode-api'
import {definitionTargetDraftSignature} from '@/lowcode/data-space/model-source/data-space-definition-save'
import {assertExcelReferencePath,restoreExcelStoredObject,type ExcelStoredReference,type ExcelStoredScope} from './stored-reference'
const sourceScene='34BDBE645F461A3D83282A941D6037F4',dictionaryScene='69B79AB779DF4C12A5595DACDF3283F1'
const dictionaryDefinitionViews=new Set<string>(['excelReferences','excelStoredReference'])
type Source=Readonly<{view:DataView;row:DataRow}>
function selected(dataSet:DataSet,table:string,viewId='default'):Source{
 const view=dataSet.getView(table,viewId)
 if(dataSet.destroyed||view?.requestState!==RequestState.Loaded||view.loadingError||view.hasUnconfirmedSave||view.mutating||view.hasEditingChanges()||view.dirtyTracking.hasPendingChanges()||view.dataTable?.modelBinding?.modelName!==table)throw new Error('引用来源查询未就绪或不是正式结果')
 view.readSnapshot()
 const ids=view.getSelectedValues(),row=view.rows.find(candidate=>view.getPkKey(candidate)===ids[0])
 if(ids.length!==1||!row)throw new Error('请选择唯一引用来源')
 return {view,row}
}
function text(source:Source,field:string,optional=false):string{
 const read=source.view.fieldAccess(source.row,field).read
 if(read==='masked'||read!=='visible'&&!optional)throw new Error(`引用字段不可读：${field}`)
 if(read!=='visible')return ''
 const value=source.row[field]
 if(typeof value==='string'&&value.trim())return value.trim()
 if(optional)return ''
 throw new Error(`引用字段缺少有效值：${field}`)
}
function dictionaryOptions(source:Source):Array<{value:string;label:string}>{
 return DictionarySchema.fields.flatMap(field=>{
  if(source.view.fieldAccess(source.row,field.titleField).read!=='visible')return []
  const label=text(source,field.titleField,true)
  if(!label&&field.name!=='val'&&field.name!=='txt')return []
  return [{value:field.name,label:label||field.defaultLabel}]
 })
}
/** 按已读取字典定义派生两份独立选项视图；不伪造正式字段模型或保存定义。 */
export class ExcelDictionaryReferenceFields{
 #definitionId:unknown
 readonly #release:()=>void
 /** 文本字段标准选择器。 */
 readonly text:DataViewOptionCatalog
 /** 值字段标准选择器。 */
 readonly value:DataViewOptionCatalog
 /** @param dataSet 本次宿主按需加载的正式字典空间。 @param definitionViewId 本次明确使用的浏览或已存引用定义视图。 */
 constructor(private readonly dataSet:DataSet,private readonly definitionViewId:'excelReferences'|'excelStoredReference'){
  if(dataSet.scenarioId!==dictionaryScene||dataSet.destroyed)throw new Error('字典来源空间身份不匹配')
  if(!dictionaryDefinitionViews.has(definitionViewId))throw new Error('字典字段必须明确指定引用定义视图')
  const definition=dataSet.getView('_Base_DictType',definitionViewId)
  if(!definition)throw new Error('字典引用定义视图缺失')
  this.text=new DataViewOptionCatalog(dataSet);this.value=new DataViewOptionCatalog(dataSet)
  const names=['rowsChanged','requestStateChanged','currentRowChanged','selectedRowsChanged','cleared'] as const
  const refresh=()=>{try{this.refresh()}catch{/* 查询或选择失效时refresh已经清空目录。 */}}
  for(const name of names)definition.events.on(name,refresh)
  this.#release=()=>{for(const name of names)definition.events.off(name,refresh)}
 }
 /** 从当前可读定义重算；定义切换时清空旧选择，不自动代选字段。 */
 refresh():void{
  this.text.view.clearSelectedRows();this.value.view.clearSelectedRows()
  this.#definitionId=undefined
  try{const definition=selected(this.dataSet,'_Base_DictType',this.definitionViewId),options=dictionaryOptions(definition);this.#definitionId=text(definition,'rowid');this.text.replace(options);this.value.replace(options)}
  catch(cause){this.text.replace([]);this.value.replace([]);throw cause}
 }
 /** @param source 原定义来源；确认时核对可读标题和所选字段，不相信旧目录内容。 */
 selection(source:DataSet,definitionViewId:'excelReferences'|'excelStoredReference'):Readonly<{textField:string;textFieldDesc:string;valueField:string;valueFieldDesc:string}>{
  if(source!==this.dataSet||definitionViewId!==this.definitionViewId)throw new Error('字典字段选项实例已失效')
  const definition=selected(source,'_Base_DictType',this.definitionViewId),options=dictionaryOptions(definition)
  if(text(definition,'rowid')!==this.#definitionId)throw new Error('字典字段选项的原定义已切换')
  const pick=(catalog:DataViewOptionCatalog)=>{const values=catalog.view.getSelectedValues(),option=options.find(candidate=>candidate.value===values[0]),displayed=catalog.view.rows.find(row=>row['value']===values[0]);if(values.length!==1||!option||displayed?.['label']!==option.label)throw new Error('请选择当前可读字典字段');return option}
  const textField=pick(this.text),valueField=pick(this.value)
  return {textField:textField.value,textFieldDesc:textField.label,valueField:valueField.value,valueFieldDesc:valueField.label}
 }
 /** 仅恢复原字段名称的选择；不写字典定义或原Excel映射。 */
 restore(input:Readonly<{textField:string;valueField:string;check():void}>):void{
  this.refresh()
  for(const [catalog,name] of [[this.text,input.textField],[this.value,input.valueField]] as const){
   const rows=catalog.view.rows.filter(row=>row['value']===name)
   if(rows.length!==1)throw new Error('已存字典字段不存在或不可读')
   input.check();catalog.view.setSelectedRows(rows);input.check()
  }
 }
 /** 释放派生选项，不修改原字典及Excel映射。 */
 dispose():void{this.#release();this.text.dispose();this.value.dispose()}
}
/** 本次原字段的不可变上下文；真实编辑、取消及提交始终属于原DataView。 */
type Target=Readonly<{
 /** 原Excel设计空间。 */
 dataSet:DataSet
 /** 原配置身份。 */
 nodeId:string
 /** 原映射身份。 */
 fieldId:string
 /** 宿主实例、目标和页面代次守卫。 */
 assertCurrent():void
 /** 由原PageRuntime按正式空间身份返回当前已装配的来源实例。 */
 resolveSource(scenarioId:string):DataSet|undefined
}>
/** 引用来源的业务种类，物理视图与DataView运行对象分别处理。 */
type Selection=Readonly<{
 /** 普通浏览与已存引用使用独立的命名视图。 */
 scope:'browse'|'stored'
 /** 弹窗代次、模式与取消状态守卫。 */
 check():void
 /** 实际选中的资源种类。 */
 kind:'Table'|'View'|'Dict'
 /** 原PageRuntime中的正式来源实例。 */
 source:DataSet
 /** 字典的两份独立派生选项；物理资源不使用。 */
 dictionaryFields?:ExcelDictionaryReferenceFields
}>
/** Excel引用成组编辑命令；不建立第二份草稿或保存通道。 */
export class ExcelFieldReference{
 #stored:(ExcelStoredScope&Readonly<{signature:string;referenceSignature:string}>)|undefined
 readonly #fields:DataView
 readonly #nodes:DataView
 readonly #row:DataRow
 readonly #scheme:unknown
 /** @param input 打开弹窗时的原实例、配置和字段。 */
 constructor(private readonly input:Target){
  const fields=input.dataSet.getView('Base_ImportData_Field'),nodes=input.dataSet.getView('Base_ImportData_Config')
  if(!fields?.currentRow||!nodes)throw new Error('原引用映射尚未就绪')
  this.#fields=fields;this.#nodes=nodes;this.#row=fields.currentRow;this.#scheme=nodes.queryContext['importConfigId'];this.current()
 }
 private current():void{
  this.input.assertCurrent()
  const node=this.#nodes.currentRow,row=this.#fields.currentRow
  if(this.input.dataSet.destroyed||this.input.dataSet.scenarioId!=='0F93B82141CF40852021D704B0E30BF4'||this.#fields.dataTable?.modelBinding?.modelName!=='Base_ImportData_Field'||row!==this.#row||this.#fields.getPkKey(row)!==this.input.fieldId||!node||this.#nodes.getPkKey(node)!==this.input.nodeId||this.#nodes.queryContext['importConfigId']!==this.#scheme||this.#nodes.fieldAccess(node,'schemeid').read!=='visible'||node['schemeid']!==this.#scheme||this.#fields.fieldAccess(row,'configid').read!=='visible'||row['configid']!==this.input.nodeId||this.#fields.hasUnconfirmedSave||this.#fields.mutating)throw new Error('原引用映射上下文已失效')
 }
 private apply(values:Readonly<Record<string,string|number>>,check:()=>void):void{
  this.current()
  const fields=Object.keys(values)
  if(fields.some(field=>{const access=this.#fields.fieldAccess(this.#row,field);return access.read!=='visible'||access.write!=='allowed'}))throw new Error('当前映射不允许成组修改引用字段')
  const checkpoint=this.#fields.createEditingCheckpoint(this.input.fieldId,fields)
  try{for(const [field,value] of Object.entries(values)){this.current();check();this.#fields.updateEditingValue(this.input.fieldId,field,value)}this.current();check()}
  catch(cause){checkpoint.restore();throw cause}
  finally{checkpoint.release()}
 }
 private storedReference():ExcelStoredReference|undefined{
  this.current();const row=this.#fields.getEditingRow(this.input.fieldId)
  if(!row)throw new Error('原引用映射已失效')
  const read=(field:string)=>{if(this.#fields.fieldAccess(this.#row,field).read!=='visible')throw new Error('已存引用身份不可读');const value=row[field];if(value===undefined||value===null)return '';if(typeof value!=='string')throw new Error('已存引用身份不是文本');return value}
  const refDataid=read('refDataid'),refTable=read('refTable'),textField=read('textField'),valueField=read('valueField'),filterField=read('filterField'),filterValue=read('filterValue'),flag=row['isDict']
  if(this.#fields.fieldAccess(this.#row,'isDict').read!=='visible')throw new Error('已存引用种类不可读')
  if(!refDataid&&!refTable&&!textField&&!valueField&&!filterField&&!filterValue&&(flag===undefined||flag===null||flag===0||flag==='0'))return undefined
  const isDict=flag===0||flag==='0'?0:flag===1||flag==='1'?1:undefined
  if(isDict===undefined||!refDataid||!refTable||!textField||!valueField)throw new Error('已存引用种类或身份不完整')
  return {isDict,refDataid,refTable,textField,valueField,filterField,filterValue}
 }
 /** 按原映射的正式身份恢复选择；不更改原值或保存。 */
 async restoreStored(input:Readonly<{loadSource(id:string):Promise<DataSet>;assertCurrent():void}>):Promise<(ExcelStoredScope&Readonly<{dictionaryFields?:ExcelDictionaryReferenceFields}>)|undefined>{
  input.assertCurrent();this.current();this.#stored=undefined;const reference=this.storedReference();if(!reference)return undefined
  const signature=definitionTargetDraftSignature(this.#fields,[this.input.fieldId]),referenceSignature=JSON.stringify(reference)
  const check=()=>{input.assertCurrent();this.current();if(definitionTargetDraftSignature(this.#fields,[this.input.fieldId])!==signature||JSON.stringify(this.storedReference())!==referenceSignature)throw new Error('引用回选期间原草稿已变化')}
  check();const source=await input.loadSource(reference.isDict===1?dictionaryScene:sourceScene);check()
  if(!source.scenarioId||source!==this.input.resolveSource(source.scenarioId))throw new Error('引用来源不属于原页面运行实例')
  const scope=await restoreExcelStoredObject({source,reference,check});check()
  if(scope.kind==='Dict'){
   const fields=new ExcelDictionaryReferenceFields(source,'excelStoredReference')
   try{fields.restore({textField:reference.textField,valueField:reference.valueField,check});check();this.#stored={...scope,signature,referenceSignature};return {...scope,dictionaryFields:fields}}catch(cause){fields.dispose();throw cause}
  }
  this.#stored={...scope,signature,referenceSignature};return scope
 }
 private assertStored(input:Selection,kind:ExcelStoredScope['kind']):ExcelStoredReference{
  this.current();input.check();const scope=this.#stored,reference=this.storedReference()
  if(scope?.kind!==kind||scope.source!==input.source||!reference||JSON.stringify(reference)!==scope.referenceSignature||definitionTargetDraftSignature(this.#fields,[this.input.fieldId])!==scope.signature)throw new Error('已存引用范围或原草稿已变化，请重新打开')
  return reference
 }
 private physicalFields(input:Readonly<{source:DataSet;kind:'Table'|'View';scope:'browse'|'stored';id:string}>){
  const witnesses:Source[]=[],views=input.scope==='stored'?(input.kind==='Table'?['storedTableText','storedTableValue'] as const:['storedViewText','storedViewValue'] as const):(input.kind==='Table'?['textFields','valueFields'] as const:['viewTextFields','viewValueFields'] as const)
  const field=(viewId:string)=>{
   const source=selected(input.source,'Base_TblField',viewId),names=new Set<string>();witnesses.push(source)
   if(!source.view.countReported||source.view.total!==source.view.rows.length)throw new Error('引用字段尚未完整读取')
   for(const row of source.view.rows){const candidate={view:source.view,row},name=text(candidate,'enname');if(text(candidate,'tblid')!==input.id||names.has(name.toLowerCase()))throw new Error('引用字段归属错误或名称重复');names.add(name.toLowerCase())}
   return {name:text(source,'enname'),label:text(source,'cnname',true)||text(source,'enname')}
  }
  const textField=field(views[0]),valueField=field(views[1])
  return {values:{textField:textField.name,textFieldDesc:textField.label,valueField:valueField.name,valueFieldDesc:valueField.label},witnesses}
 }
 private async selectStoredPhysical(input:Selection):Promise<void>{
  if(input.kind==='Dict')throw new Error('已存物理引用种类错误')
  const reference=this.assertStored(input,input.kind),scope=this.#stored,databaseId=scope?.databaseId,parts=reference.refTable.split('@'),name=parts[1]
  if(!databaseId||!name)throw new Error('已存引用物理库身份缺失')
  const object=selected(input.source,input.kind==='Table'?'_Base_TblList':'_Base_ViewList','storedObject')
  if(object.view.currentRow!==object.row||text(object,'rowid')!==reference.refDataid||text(object,input.kind==='Table'?'tblname':'vewname')!==name)throw new Error('已存引用对象已变化')
  const fields=this.physicalFields({source:input.source,kind:input.kind,scope:'stored',id:reference.refDataid})
  if(fields.values.textField===reference.textField&&fields.values.valueField===reference.valueField){input.check();return}
  const check=()=>{this.assertStored(input,input.kind);for(const source of [object,...fields.witnesses]){if(selected(input.source,source.view.tableName,source.view.viewId).row!==source.row)throw new Error('引用路径校验期间来源选择已变化')}}
  await assertExcelReferencePath({source:input.source,databaseId,name,id:reference.refDataid,kind:input.kind,check});check()
  this.apply({isDict:0,refDataid:reference.refDataid,refTable:reference.refTable,refTableDesc:text(object,input.kind==='Table'?'tbldesc':'vewdesc',true)||name,filterField:'',filterValue:'',...fields.values},input.check)
 }
 /** @param input 原正式来源中的选择；确认前不修改原映射，成功后仍未保存。 */
 async select(input:Selection):Promise<void>{
  this.current();input.check()
  if(!input.source.scenarioId||input.source!==this.input.resolveSource(input.source.scenarioId))throw new Error('引用来源不属于原页面运行实例')
  if(input.kind==='Dict'){
   if(input.source.scenarioId!==dictionaryScene||!input.dictionaryFields)throw new Error('字典引用来源身份不匹配')
   const definitionView=input.scope==='stored'?'excelStoredReference':'excelReferences',definition=selected(input.source,'_Base_DictType',definitionView),id=text(definition,'rowid'),fields=input.dictionaryFields.selection(input.source,definitionView)
   if(definition.view.currentRow!==definition.row)throw new Error('字典来源已切换')
   if(input.scope==='stored'){const saved=this.assertStored(input,'Dict');if(id!==saved.refDataid)throw new Error('已存字典对象已变化');if(fields.textField===saved.textField&&fields.valueField===saved.valueField){input.check();return}}
   this.apply({isDict:1,refDataid:id,refTable:'_Base_DictData',refTableDesc:text(definition,'TypeName'),filterField:'typeid',filterValue:id,...fields},input.check);return
  }
  if(input.source.scenarioId!==sourceScene)throw new Error('物理引用来源空间身份不匹配')
  if(input.scope==='stored'){await this.selectStoredPhysical(input);return}
  const app=selected(input.source,'Base_AppSystemList'),database=selected(input.source,'Base_AppAndSource_Relation'),object=selected(input.source,input.kind==='Table'?'_Base_TblList':'_Base_ViewList')
  const witnesses=[app,database,object]
  if(database.view.currentRow!==database.row||object.view.currentRow!==object.row||text(database,'sysid')!==text(app,'rowid'))throw new Error('引用数据库或对象已切换')
  if(input.kind==='View'&&text(object,'dbid')!==text(database,'conid'))throw new Error('引用视图不属于当前数据库')
  const cascades=input.source.getParentCascades(object.view.tableName,object.view.viewId),cascade=cascades[0],filter=cascade?input.source.resolveCascadeFilter(cascade):undefined
  if(cascades.length!==1||cascade?.parentTable!==database.view.tableName||cascade.parentViewId!==database.view.viewId||!filter||'logic' in filter||filter.field!=='dbid'||filter.operator!=='eq'||filter.value!==text(database,'conid'))throw new Error('引用对象不属于当前数据库查询')
  const id=text(object,'rowid'),fields=this.physicalFields({source:input.source,kind:input.kind,scope:'browse',id})
  witnesses.push(...fields.witnesses)
  const name=text(object,input.kind==='Table'?'tblname':'vewname'),path=`${text(database,'conName')}@${name}`,title=text(object,input.kind==='Table'?'tbldesc':'vewdesc',true)
  {
   const ids=[this.input.fieldId],draft=definitionTargetDraftSignature(this.#fields,ids)
   const check=()=>{
    this.current();input.check()
    if(input.source!==this.input.resolveSource(sourceScene)||definitionTargetDraftSignature(this.#fields,ids)!==draft)throw new Error('引用路径校验期间原目标或草稿已变化')
    for(const source of witnesses){const current=selected(input.source,source.view.tableName,source.view.viewId);if(current.row!==source.row)throw new Error('引用路径校验期间来源选择已变化')}
    if(database.view.currentRow!==database.row||object.view.currentRow!==object.row)throw new Error('引用路径校验期间来源选择已变化')
   }
   await assertExcelReferencePath({source:input.source,databaseId:text(database,'conid'),name,id,kind:input.kind,check});check()
  }
  this.apply({isDict:0,refDataid:id,refTable:path,refTableDesc:title||name,...fields.values,filterField:'',filterValue:''},input.check)
 }
 /** 明确清空引用的全部业务字段；取消仍由原DataView负责。 */
 clear():void{this.apply({isDict:0,refDataid:'',refTable:'',refTableDesc:'',textField:'',textFieldDesc:'',valueField:'',valueFieldDesc:'',filterField:'',filterValue:''},()=>{})}
}
