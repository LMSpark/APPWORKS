import {afterEach,expect,it,vi} from 'vitest'
import {type DataSet,RequestState} from '@spark-appworks/spark-data'
import {createSourceFixture} from '../../structured-config/data-code/source-picker/fixture'
import {excelDesignRuntime} from './excel-import-design.fixture'
import {ExcelFieldReference,ExcelDictionaryReferenceFields} from '@/lowcode/resources/semi-structured/excel-import/field-reference'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'
import {buildFormalModels} from '../../structured-config/catalog/structured-config-catalog.fixture'
import {ApiBackend} from '../../api-provider/api-provider.fixture'
import dictionaryText from '../../../../../config/pages/data-platform/data-dictionary/pagedata.json?raw'
const clean:Array<()=>void>=[]
afterEach(()=>clean.splice(0).forEach(dispose=>dispose()))
async function stored(f:Awaited<ReturnType<typeof fixture>>,values:Record<string,string|number>){
 Object.assign(f.target.http.records['Base_ImportData_Field']![0]!,values)
 await f.target.fields.refresh();f.target.fields.setCurrentRow(f.target.fields.rows[0]!)
 return new ExcelFieldReference({dataSet:f.target.ds,nodeId:'C1',fieldId:'M1',resolveSource:f.resolveSource,assertCurrent:()=>{}})
}
function loadSource(f:Awaited<ReturnType<typeof fixture>>){return async(id:string)=>{const source=f.resolveSource(id);if(!source)throw new Error('fixture source missing');return source}}
async function fixture(){
 const target=await excelDesignRuntime({Base_ImportData_Config:[{rowid:'C1',schemeid:'E1',pid:'E1',sheetName:'测试'}],Base_ImportData_Field:[{rowid:'M1',configid:'C1',name:'code',title:'编码',isDict:1,refDataid:'OLD_DICT',refTable:'_Base_DictData',filterField:'typeid',filterValue:'OLD_DICT'}],Base_Import_Transform_Rule:[],Base_Desensitization_Rule:[]})
 const source=await createSourceFixture();clean.push(()=>target.runtime.dispose(),()=>source.runtime.dispose())
 const choose=(model:string,id:string,viewId='default')=>{const view=source.dataSet.getView(model,viewId)!,row=view.rows.find(row=>view.getPkKey(row)===id)!;view.setCurrentRow(row);view.setSelectedRows([row])}
 await vi.waitFor(()=>expect(source.dataSet.getView('Base_AppSystemList')!.requestState).toBe(RequestState.Loaded));choose('Base_AppSystemList','A1')
 await vi.waitFor(()=>expect(source.dataSet.getView('Base_AppAndSource_Relation')!.rows.length).toBe(1));choose('Base_AppAndSource_Relation','R1')
 await vi.waitFor(()=>expect(source.dataSet.getView('_Base_TblList')!.rows.length).toBe(2));choose('_Base_TblList','T1')
 await vi.waitFor(()=>expect(source.dataSet.getView('Base_TblField','textFields')!.requestState).toBe(RequestState.Loaded))
 choose('Base_TblField','F2','textFields');choose('Base_TblField','F1','valueFields')
 target.fields.setCurrentRow(target.fields.rows[0]!);target.fields.setSelectedRows([target.fields.rows[0]!])
 const sources=new Map([[source.dataSet.scenarioId,source.dataSet]]),resolveSource=(id:string)=>sources.get(id)
 const command=new ExcelFieldReference({dataSet:target.ds,nodeId:'C1',fieldId:'M1',resolveSource,assertCurrent:()=>{}})
 return {target,source,choose,command,sources,resolveSource}
}
it('writes physical field names instead of selector row IDs and removes old dictionary filters',async()=>{
 const f=await fixture();await f.command.select({check:()=>{},scope:'browse',kind:'Table',source:f.source.dataSet})
 expect(f.target.fields.getEditingRow('M1')).toMatchObject({isDict:0,refDataid:'T1',refTable:'数据库一@table_one',refTableDesc:'table_one',textField:'name',valueField:'id',filterField:'',filterValue:''})
 expect(f.target.http.saves).toEqual([])
 await f.target.ds.saveChanges({views:[{tableName:'Base_ImportData_Field',viewId:'default'}]})
 expect(f.target.http.records['Base_ImportData_Field']![0]!).toMatchObject({textField:'name',valueField:'id',filterValue:''})
})
it('refuses a browsed table path that the backend can resolve to another table primary-key alias',async()=>{
 const f=await fixture();f.source.http.records['_Base_TblList']!.push({rowid:'table_one',dbid:'D1',tblname:'different'})
 await expect(f.command.select({scope:'browse',kind:'Table',source:f.source.dataSet,check:()=>{}})).rejects.toThrow('不唯一')
 expect(f.target.fields.hasEditingChanges()).toBe(false)
})
it('lets a new restore complete before an old temporary path query returns without replacing the new selection',async()=>{
 const f=await fixture(),command=await stored(f,{isDict:0,refDataid:'T1',refTable:'数据库一@table_one',textField:'name',valueField:'id',filterField:'',filterValue:''}),original=f.source.dataSet.getView('_Base_TblList')!,create=original.createQueryView.bind(original)
 let first=true,started=false,release=()=>{},generation=1;const barrier=new Promise<void>(resolve=>{release=resolve})
 const spy=vi.spyOn(original,'createQueryView').mockImplementation(id=>{const query=create(id);if(first){first=false;const refresh=query.refresh.bind(query);vi.spyOn(query,'refresh').mockImplementation(async()=>{started=true;await barrier;return refresh()})}return query})
 const before=original.dataTable!.viewList.length,pending=command.restoreStored({loadSource:loadSource(f),assertCurrent:()=>{if(generation!==1)throw new Error('old restore')}})
 await vi.waitFor(()=>expect(started).toBe(true));generation=2
 let secondError:unknown
 try{await command.restoreStored({loadSource:loadSource(f),assertCurrent:()=>{}})}catch(cause){secondError=cause}
 release();await expect(pending).rejects.toThrow('old restore');spy.mockRestore()
 expect(secondError).toBeUndefined()
 expect(f.source.dataSet.getView('Base_TblField','storedTableText')!.getSelectedValues()).toEqual(['F2'])
 expect(original.dataTable!.viewList.length).toBe(before)
 expect(f.target.fields.hasEditingChanges()).toBe(false)
})
it('restores an off-page saved table and physical field IDs without choosing an application relationship',async()=>{
 const f=await fixture(),browse=f.source.dataSet.getView('_Base_TblList')!,before=browse.readSnapshot()
 f.source.http.records['Base_AppAndSource_Relation']!.push({rowid:'OTHER_APP',sysid:'A2',conid:'D1',conName:'数据库一'})
 f.source.http.records['_Base_TblList']!.push({rowid:'LATE',dbid:'D1',tblname:'off_page',tbldesc:'当前标题'})
 f.source.http.records['Base_TblField']!.push({rowid:'LC',tblid:'LATE',enname:'code',cnname:'当前编码'},{rowid:'LN',tblid:'LATE',enname:'name',cnname:'当前名称'})
 const command=await stored(f,{isDict:0,refDataid:'LATE',refTable:'数据库一@off_page',textField:'name',valueField:'code',refTableDesc:'旧标题',filterField:'',filterValue:''})
 const result=await command.restoreStored({loadSource:loadSource(f),assertCurrent:()=>{}})
 expect(result?.kind).toBe('Table');expect(result?.databaseId).toBe('D1')
 expect(f.source.dataSet.getView('_Base_TblList','excelStoredObject')!.getSelectedValues()).toEqual(['LATE'])
 expect(f.source.dataSet.getView('Base_TblField','storedTableText')!.getSelectedValues()).toEqual(['LN'])
 expect(f.source.dataSet.getView('Base_TblField','storedTableValue')!.getSelectedValues()).toEqual(['LC'])
 expect(f.source.dataSet.getView('Base_AppAndSource_Relation','excelStoredDatabases')!.getSelectedValues()).toEqual([])
 expect(browse.readSnapshot()).toEqual(before)
 expect(f.target.fields.hasEditingChanges()).toBe(false)
 const writes=f.target.http.saves.length
 await command.select({check:()=>{},scope:'stored',kind:'Table',source:f.source.dataSet})
 expect(f.target.fields.hasEditingChanges()).toBe(false);expect(f.target.http.saves.length).toBe(writes)
 expect(f.target.fields.getEditingRow('M1')?.['refTableDesc']).toBe('旧标题')
})
it('restores saved dictionary fields from the exact definition without changing descriptions or browsing state',async()=>{
 const f=await fixture(),d=await dictionary();f.sources.set(d.ds.scenarioId,d.ds)
 const command=await stored(f,{isDict:1,refDataid:'D1',refTable:'_Base_DictData',filterField:'typeid',filterValue:'D1',textField:'txt',valueField:'val',refTableDesc:'历史字典标题',textFieldDesc:'历史文本标题'})
 const before=d.view.readSnapshot(),writes=f.target.http.saves.length,physicalReads=f.source.http.reads.length
 const restored=await command.restoreStored({loadSource:loadSource(f),assertCurrent:()=>{}})
 const fields=restored?.dictionaryFields;expect(fields).toBeDefined();if(!fields)throw new Error('Expected stored dictionary fields')
 clean.push(()=>fields.dispose())
 expect(fields.text.view.getSelectedValues()).toEqual(['txt']);expect(fields.value.view.getSelectedValues()).toEqual(['val'])
 expect(d.view.readSnapshot()).toEqual(before);expect(f.source.http.reads.length).toBe(physicalReads)
 await command.select({kind:'Dict',scope:'stored',source:d.ds,dictionaryFields:fields,check:()=>{}})
 expect(f.target.fields.hasEditingChanges()).toBe(false);expect(f.target.http.saves.length).toBe(writes)
 expect(f.target.fields.getEditingRow('M1')).toMatchObject({refTableDesc:'历史字典标题',textFieldDesc:'历史文本标题'})
 d.pick(fields.value,'exVal_1')
 await command.select({kind:'Dict',scope:'stored',source:d.ds,dictionaryFields:fields,check:()=>{}})
 expect(f.target.fields.getEditingRow('M1')).toMatchObject({refDataid:'D1',textField:'txt',valueField:'exVal_1',filterValue:'D1'})
})
it('restores a saved physical view with its original field IDs and refuses shadowed or changed paths',async()=>{
 const f=await viewFixture(),command=await stored(f,{isDict:0,refDataid:'V1',refTable:'数据库一@view_one',textField:'name',valueField:'id',filterField:'',filterValue:''})
 const result=await command.restoreStored({loadSource:loadSource(f),assertCurrent:()=>{}})
 expect(result?.kind).toBe('View')
 expect(f.source.dataSet.getView('Base_TblField','storedViewText')!.getSelectedValues()).toEqual(['VF2'])
 expect(f.source.dataSet.getView('Base_TblField','storedViewValue')!.getSelectedValues()).toEqual(['VF1'])
 await command.select({kind:'View',scope:'stored',source:f.source.dataSet,check:()=>{}})
 expect(f.target.fields.hasEditingChanges()).toBe(false)
 f.source.http.records['_Base_TblList']!.push({rowid:'SHADOW',dbid:'D1',tblname:'view_one'})
 await expect(command.restoreStored({loadSource:loadSource(f),assertCurrent:()=>{}})).rejects.toThrow('优先匹配')
 expect(f.target.fields.hasEditingChanges()).toBe(false)
})
it('leaves a missing field unresolved and never falls back to another registered object with the same name',async()=>{
 const f=await fixture(),command=await stored(f,{isDict:0,refDataid:'T1',refTable:'数据库一@table_one',textField:'deleted',valueField:'id',filterField:'',filterValue:''})
 await expect(command.restoreStored({loadSource:loadSource(f),assertCurrent:()=>{}})).rejects.toThrow('字段缺失')
 expect(f.target.fields.hasEditingChanges()).toBe(false)
 f.target.http.records['Base_ImportData_Field']![0]!['refDataid']='DELETED_ID'
 await f.target.fields.refresh();f.target.fields.setCurrentRow(f.target.fields.rows[0]!)
 const reopened=new ExcelFieldReference({dataSet:f.target.ds,nodeId:'C1',fieldId:'M1',resolveSource:f.resolveSource,assertCurrent:()=>{}})
 await expect(reopened.restoreStored({loadSource:loadSource(f),assertCurrent:()=>{}})).rejects.toThrow('对象不存在')
 expect(f.target.fields.hasEditingChanges()).toBe(false)
})
it('does not select stored objects or fields after an exact restore query completes for a cancelled dialog',async()=>{
 const f=await fixture(),command=await stored(f,{isDict:0,refDataid:'T1',refTable:'数据库一@table_one',textField:'name',valueField:'id',filterField:'',filterValue:''})
 let active=true,started=false,release=()=>{};const barrier=new Promise<void>(resolve=>{release=resolve})
 const record=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)
 f.source.http.interceptors.request.use({onRequest:async request=>{const body:unknown=request.data;if(record(body)&&Array.isArray(body['Table'])&&record(body['Table'][0])&&body['Table'][0]['Name']==='Base_AppAndSource_Relation'){started=true;await barrier}return request}})
 const pending=command.restoreStored({loadSource:loadSource(f),assertCurrent:()=>{if(!active)throw new Error('cancelled restore')}})
 await vi.waitFor(()=>expect(started).toBe(true));active=false;release()
 await expect(pending).rejects.toThrow('cancelled restore')
 expect(f.source.dataSet.getView('_Base_TblList','excelStoredObject')!.getSelectedValues()).toEqual([])
 expect(f.source.dataSet.getView('Base_TblField','storedTableText')!.getSelectedValues()).toEqual([])
 expect(f.target.fields.hasEditingChanges()).toBe(false)
})
it('proves a table database with exact queries when the same connection name belongs to different physical IDs',async()=>{
 const f=await fixture();f.source.http.records['Base_AppAndSource_Relation']!.push({rowid:'OTHER_DB',sysid:'A2',conid:'D3',conName:'数据库一'})
 const command=await stored(f,{isDict:0,refDataid:'T1',refTable:'数据库一@table_one',textField:'name',valueField:'id',filterField:'',filterValue:''})
 expect((await command.restoreStored({loadSource:loadSource(f),assertCurrent:()=>{}}))?.databaseId).toBe('D1')
 f.source.http.records['_Base_TblList']!.push({rowid:'T1',dbid:'D3',tblname:'table_one'})
 await expect(command.restoreStored({loadSource:loadSource(f),assertCurrent:()=>{}})).rejects.toThrow('身份不唯一')
 expect(f.target.fields.hasEditingChanges()).toBe(false)
})
it('refuses masked saved identities before querying metadata and keeps a changed draft after a late response',async()=>{
 const f=await fixture();restrict(f.target.http,{rowId:'M1',field:'refDataid',mode:'masked'})
 const command=await stored(f,{isDict:0,refDataid:'T1',refTable:'数据库一@table_one',textField:'name',valueField:'id',filterField:'',filterValue:''}),reads=f.source.http.reads.length
 await expect(command.restoreStored({loadSource:loadSource(f),assertCurrent:()=>{}})).rejects.toThrow('不可读')
 expect(f.source.http.reads.length).toBe(reads)
 const second=await fixture(),late=await stored(second,{isDict:0,refDataid:'T1',refTable:'数据库一@table_one',textField:'name',valueField:'id',filterField:'',filterValue:''})
 let started=false,release=()=>{};const barrier=new Promise<void>(resolve=>{release=resolve})
 const pending=late.restoreStored({loadSource:async id=>{started=true;await barrier;return loadSource(second)(id)},assertCurrent:()=>{}})
 await vi.waitFor(()=>expect(started).toBe(true));second.target.fields.updateEditingValue('M1','title','迟到期间修改');release()
 await expect(pending).rejects.toThrow('草稿已变化')
 expect(second.target.fields.getEditingRow('M1')?.['title']).toBe('迟到期间修改')
 expect(second.source.dataSet.getView('_Base_TblList','excelStoredObject')!.getSelectedValues()).toEqual([])
})
it('clears the complete group through the original view and supports native cancellation',async()=>{
 const f=await fixture();f.command.clear()
 expect(f.target.fields.getEditingRow('M1')).toMatchObject({isDict:0,refDataid:'',refTable:'',refTableDesc:'',textField:'',textFieldDesc:'',valueField:'',valueFieldDesc:'',filterField:'',filterValue:''})
 f.target.fields.discardPendingChanges()
 expect(f.target.fields.getEditingRow('M1')).toMatchObject({isDict:1,refDataid:'OLD_DICT',filterField:'typeid',filterValue:'OLD_DICT'})
 expect(f.target.http.saves).toEqual([])
})
it('rejects a selected column owned by another object without partial target edits',async()=>{
 const f=await fixture();f.source.dataSet.getView('Base_TblField','valueFields')!.rows[0]!['tblid']='FOREIGN'
 await expect(f.command.select({check:()=>{},scope:'browse',kind:'Table',source:f.source.dataSet})).rejects.toThrow('字段')
 expect(f.target.fields.hasEditingChanges()).toBe(false)
})
it('rejects an old dialog after its node context has changed',async()=>{
 const f=await fixture();f.target.nodes.setCurrentRow(null)
 await expect(f.command.select({check:()=>{},scope:'browse',kind:'Table',source:f.source.dataSet})).rejects.toThrow('失效')
 expect(f.target.fields.hasEditingChanges()).toBe(false)
})
async function viewFixture(){
 const f=await fixture(),view=f.source.dataSet.getView('_Base_ViewList')!
 f.source.http.records['_Base_ViewList']=[{rowid:'V1',dbid:'D1',vewname:'view_one',vewdesc:'视图一'}]
 f.source.http.records['Base_TblField']!.push({rowid:'VF1',tblid:'V1',enname:'id',cnname:'视图编码'},{rowid:'VF2',tblid:'V1',enname:'name',cnname:'视图标题'})
 await view.refresh();f.choose('_Base_ViewList','V1')
 await vi.waitFor(()=>expect(f.source.dataSet.getView('Base_TblField','viewTextFields')!.requestState).toBe(RequestState.Loaded))
 f.choose('Base_TblField','VF2','viewTextFields');f.choose('Base_TblField','VF1','viewValueFields')
 return f
}
it('uses independent registered view columns even while a table with the same column names remains selected',async()=>{
 const f=await viewFixture()
 await f.command.select({check:()=>{},scope:'browse',kind:'View',source:f.source.dataSet})
 expect(f.target.fields.getEditingRow('M1')).toMatchObject({refDataid:'V1',refTable:'数据库一@view_one',refTableDesc:'视图一',textField:'name',textFieldDesc:'视图标题',valueField:'id',valueFieldDesc:'视图编码',filterValue:''})
 expect(f.source.http.saves).toEqual([])
})
it.each([
 {rowid:'OTHER',tblname:'view_one',dbid:'D1'},
 {rowid:'V1',tblname:'view_one',dbid:'D1'},
 {rowid:'view_one',tblname:'other_name',dbid:'D1'},
])('rejects a view path shadowed by the backend table-first match $rowid',async collision=>{
 const f=await viewFixture();f.source.http.records['_Base_TblList']!.push(collision)
 const before=f.source.dataSet.getTable('_Base_TblList')!.viewList.length
 await expect(f.command.select({check:()=>{},scope:'browse',kind:'View',source:f.source.dataSet})).rejects.toThrow('优先匹配')
 expect(f.target.fields.hasEditingChanges()).toBe(false)
 expect(f.source.dataSet.getTable('_Base_TblList')!.viewList.length).toBe(before)
})
it('permits a same-name table in another database but refuses duplicate view paths in the selected database',async()=>{
 const f=await viewFixture();f.source.http.records['_Base_TblList']!.push({rowid:'OTHER',tblname:'view_one',dbid:'D2'})
 await f.command.select({check:()=>{},scope:'browse',kind:'View',source:f.source.dataSet})
 expect(f.target.fields.getEditingRow('M1')?.['refDataid']).toBe('V1')
 f.target.fields.discardPendingChanges()
 f.source.http.records['_Base_ViewList']!.push({rowid:'V2',dbid:'D1',vewname:'view_one',vewdesc:'同名视图'})
 const reopened=new ExcelFieldReference({dataSet:f.target.ds,nodeId:'C1',fieldId:'M1',resolveSource:f.resolveSource,assertCurrent:()=>{}})
 await expect(reopened.select({check:()=>{},scope:'browse',kind:'View',source:f.source.dataSet})).rejects.toThrow('不唯一')
 expect(f.target.fields.hasEditingChanges()).toBe(false)
})
it('does not edit a cancelled reference after its original exact route query returns',async()=>{
 const f=await viewFixture();let active=true,started=false,release=()=>{}
 const barrier=new Promise<void>(resolve=>{release=resolve})
 const record=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)
 f.source.http.interceptors.request.use({onRequest:async request=>{
  const body:unknown=request.data
  if(record(body)&&Array.isArray(body['Table'])&&record(body['Table'][0])&&body['Table'][0]['Name']==='_Base_TblList'){started=true;await barrier}
  return request
 }})
 const command=new ExcelFieldReference({dataSet:f.target.ds,nodeId:'C1',fieldId:'M1',resolveSource:f.resolveSource,assertCurrent:()=>{if(!active)throw new Error('cancelled reference')}})
 const pending=command.select({check:()=>{},scope:'browse',kind:'View',source:f.source.dataSet})
 await vi.waitFor(()=>expect(started).toBe(true));active=false;release()
 await expect(pending).rejects.toThrow('cancelled reference')
 expect(f.target.fields.hasEditingChanges()).toBe(false)
 expect(f.target.http.saves).toEqual([])
})
async function dictionary(){
 const http=new ApiBackend(),scene='69B79AB779DF4C12A5595DACDF3283F1'
 http.records['_Base_DictType']=[{rowid:'D1',TypeName:'状态',functiondesc:'状态选项',val:'状态码',txt:'状态名',secondValue:'扩展一',thirdValue:'',fourthvalue:'',fiveValue:''},{rowid:'D2',TypeName:'其他',val:'状态码',txt:'状态名'}]
 const models=buildFormalModels({_Base_DictType:['rowid','TypeName','functiondesc','val','txt','secondValue','thirdValue','fourthvalue','fiveValue'],_Base_DictData:['rowid','typeid','txt','val','ordIdx']}).map(model=>({...model,id:model.name==='_Base_DictType'?'69B79AB779DF4C12A5595DACDF3283F1p000':'FBC266CB81A3E3D1D6D67F9B9D7FFF04'}))
 const api=new DataSpaceRuntimeApi({http,readScope:()=>({token:'scope',headers:{'X-AppId':'APP'}})})
 const assembly=new LowcodeDataSpaceAssembler(api,http).assemble({config:new ScenarioViewConfig(scene,dictionaryText),space:{dataSpaceId:scene,name:'字典'},models,relations:[]})
 expect(assembly.diagnostics).toEqual([])
 const ds=assembly.dataSet,view=ds.getView('_Base_DictType','excelReferences')!;clean.push(()=>ds.destroy())
 await view.refresh();view.setCurrentRow(view.rows[0]!);view.setSelectedRows([view.rows[0]!])
 const fields=new ExcelDictionaryReferenceFields(ds,'excelReferences');clean.push(()=>fields.dispose());fields.refresh()
 const pick=(catalog:typeof fields.text,name:string)=>catalog.view.setSelectedRows([catalog.view.rows.find(row=>row['value']===name)!])
 return {ds,view,fields,pick,http}
}
it('derives six-field dictionary choices and keeps text and value selections independent',async()=>{
 const f=await fixture(),d=await dictionary();f.sources.set(d.ds.scenarioId,d.ds);d.pick(d.fields.text,'txt');d.pick(d.fields.value,'val')
 expect(d.fields.text.view.rows.map(row=>row['value'])).toEqual(['val','txt','exVal_1'])
 await f.command.select({check:()=>{},scope:'browse',kind:'Dict',source:d.ds,dictionaryFields:d.fields})
 expect(f.target.fields.getEditingRow('M1')).toMatchObject({isDict:1,refDataid:'D1',refTable:'_Base_DictData',filterField:'typeid',filterValue:'D1',textField:'txt',textFieldDesc:'状态名',valueField:'val',valueFieldDesc:'状态码'})
 await f.command.select({check:()=>{},scope:'browse',kind:'Table',source:f.source.dataSet})
 expect(f.target.fields.getEditingRow('M1')).toMatchObject({isDict:0,refDataid:'T1',filterField:'',filterValue:'',textField:'name',valueField:'id'})
 expect(d.http.reads.some(read=>read.table==='_Base_DictData')).toBe(false)
})
it('rejects stale dictionary choices after a same-shape definition switch',async()=>{
 const f=await fixture(),d=await dictionary();f.sources.set(d.ds.scenarioId,d.ds);d.pick(d.fields.text,'txt');d.pick(d.fields.value,'val')
 d.view.setCurrentRow(d.view.rows[1]!);d.view.setSelectedRows([d.view.rows[1]!])
 expect(d.fields.text.view.getSelectedValues()).toEqual([])
 expect(d.fields.value.view.getSelectedValues()).toEqual([])
 await expect(f.command.select({check:()=>{},scope:'browse',kind:'Dict',source:d.ds,dictionaryFields:d.fields})).rejects.toThrow('可读字典字段')
 expect(f.target.fields.hasEditingChanges()).toBe(false)
})
function restrict(http:ApiBackend,input:Readonly<{rowId:string;field:string;mode:'denyWrite'|'masked'}>):void{
 const record=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)
 http.interceptors.response.use({onResponse:response=>{
  const body:unknown=response.data
  if(record(body)&&record(body['Result'])&&record(body['Result']['data'])&&Array.isArray(body['Result']['data']['Items']))for(const row of body['Result']['data']['Items'])if(record(row)&&row['rowid']===input.rowId&&record(row['lingma_sys_params'])){
   const permissions=row['lingma_sys_params']
   if(input.mode==='masked')permissions['m']=[input.field]
   else if(Array.isArray(permissions['e']))permissions['e']=permissions['e'].filter((field:unknown)=>field!==input.field)
  }
  return response
 }})
}
it('checks the last group member permission before changing any reference while retaining unrelated drafts',async()=>{
 const f=await fixture();restrict(f.target.http,{rowId:'M1',field:'filterValue',mode:'denyWrite'})
 await f.target.fields.refresh();f.target.fields.setCurrentRow(f.target.fields.rows[0]!)
 f.target.fields.updateEditingValue('M1','title','保留标题')
 const command=new ExcelFieldReference({dataSet:f.target.ds,nodeId:'C1',fieldId:'M1',resolveSource:f.resolveSource,assertCurrent:()=>{}})
 await expect(command.select({check:()=>{},scope:'browse',kind:'Table',source:f.source.dataSet})).rejects.toThrow('成组')
 expect(f.target.fields.getEditingRow('M1')).toMatchObject({title:'保留标题',isDict:1,refDataid:'OLD_DICT',filterValue:'OLD_DICT'})
 expect(f.target.http.saves).toEqual([])
})
it('excludes masked dictionary titles and rejects a formerly selected field after permission refresh',async()=>{
 const f=await fixture(),d=await dictionary();f.sources.set(d.ds.scenarioId,d.ds);d.pick(d.fields.text,'exVal_1');d.pick(d.fields.value,'val')
 restrict(d.http,{rowId:'D1',field:'secondValue',mode:'masked'})
 await d.view.refresh();d.view.setCurrentRow(d.view.rows[0]!);d.view.setSelectedRows([d.view.rows[0]!])
 await expect(f.command.select({check:()=>{},scope:'browse',kind:'Dict',source:d.ds,dictionaryFields:d.fields})).rejects.toThrow('可读字典字段')
 expect(d.fields.text.view.rows.map(row=>row['value'])).not.toContain('exVal_1')
 expect(f.target.fields.hasEditingChanges()).toBe(false)
})
it('rejects a different same-scenario source instance before reading or editing its choices',async()=>{
 const f=await fixture(),other=await createSourceFixture();clean.push(()=>other.runtime.dispose())
 await expect(f.command.select({check:()=>{},scope:'browse',kind:'Table',source:other.dataSet})).rejects.toThrow('原页面运行实例')
 expect(f.target.fields.hasEditingChanges()).toBe(false)
})
it('rejects a retained physical view when a nonautomatic database cascade has changed its parent selection',async()=>{
 const f=await fixture(),databases=f.source.dataSet.getView('Base_AppAndSource_Relation')!,views=f.source.dataSet.getView('_Base_ViewList')!
 f.source.http.records['Base_AppAndSource_Relation']!.push({rowid:'R3',sysid:'A1',conid:'D3',conName:'数据库三'})
 await databases.refresh();f.choose('Base_AppAndSource_Relation','R1')
 f.source.http.records['_Base_ViewList']=[{rowid:'V1',dbid:'D1',vewname:'view_one',vewdesc:'视图一'}]
 f.source.http.records['Base_TblField']!.push({rowid:'VF1',tblid:'V1',enname:'id',cnname:'视图编码'})
 await views.refresh();f.choose('_Base_ViewList','V1')
 await vi.waitFor(()=>expect(f.source.dataSet.getView('Base_TblField','viewTextFields')!.requestState).toBe(RequestState.Loaded))
 f.choose('Base_TblField','VF1','viewTextFields');f.choose('Base_TblField','VF1','viewValueFields')
 f.choose('Base_AppAndSource_Relation','R3')
 expect(views.getSelectedValues()).toEqual(['V1'])
 await expect(f.command.select({check:()=>{},scope:'browse',kind:'View',source:f.source.dataSet})).rejects.toThrow('数据库')
 expect(f.target.fields.hasEditingChanges()).toBe(false)
})
