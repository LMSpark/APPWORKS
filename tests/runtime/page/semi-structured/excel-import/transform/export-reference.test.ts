import {describe,it,expect} from 'vitest'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {DataViewFilterCodec} from '@spark-appworks/spark-data'
import {ApiBackend} from '../../../api-provider/api-provider.fixture'
import {createSourceDataSet,sourceRecords,SOURCE_SCENE} from '../../../structured-config/data-code/source-picker/fixture'
import {excelDesignRuntime,EXCEL_DESIGN} from '../excel-import-design.fixture'
import {LowcodeExcelImport} from '@/lowcode/resources/semi-structured/excel-import/resource'
async function fixture(mapped=true){
 const cfg={executionScope:'EXPORT',columns:[{sourceField:'name',key:0}],keyTargetField:'key',valueTargetField:'value',sourceFieldPolicy:'REMOVE'}
 const f=await excelDesignRuntime({Base_ImportData_Config:[{rowid:'C1',schemeid:'E1',pid:'E1',sheetName:'导出',exportType:'default',sheet_layout_json:'',relatedappid:'A1',table:'数据库一@table_one',parentField:'',foreignKeyField:''}],Base_ImportData_Field:mapped?['key','value'].map((name,i)=>({rowid:`F${i}`,configid:'C1',name,index:i?'B':'A',isReadOnly:0})):[],Base_Import_Transform_Rule:[{id:'R1',scheme_id:'E1',config_id:'C1',rule_name:'导出',rule_type:'UNPIVOT',source_field:'',target_field:'',sort_order:10,enabled:1,on_error:'FAIL_ROW',condition_json:'',config_json:JSON.stringify(cfg)}]})
 const http=new ApiBackend();http.records=sourceRecords();http.records['Base_TblField']!.push({rowid:'GATE',tblid:'T1',enname:'gate'})
 const source=await createSourceDataSet(http)
 const page=new PageRuntime({pageId:'export-reference',scenarioIds:[EXCEL_DESIGN,SOURCE_SCENE],deferredScenarioIds:[SOURCE_SCENE],scenarioInputs:{[EXCEL_DESIGN]:{importConfigId:'E1'}},loadScenario:async id=>id===EXCEL_DESIGN?f.ds:source})
 await page.load();LowcodeExcelImport.bindEditorModelRules(f.ds,()=>page)
 const save=()=>f.ds.saveChanges({views:[{tableName:f.rules.tableName,viewId:f.rules.viewId,ids:['R1']}]})
 const dispose=()=>{page.dispose();f.runtime.dispose()}
 f.rules.updateEditingValue('R1','config_json',JSON.stringify({...cfg,nullPolicy:'KEEP_NULL'}))
 return {...f,source,sourceHttp:http,save,dispose}
}
describe('Excel export reference actual query projection',()=>{
 it('resolves a same-named database and table only inside the node application',async()=>{
  const f=await fixture()
  try{
   f.sourceHttp.records['Base_AppAndSource_Relation']!.push({rowid:'OTHER_APP_DB',sysid:'A2',conid:'OTHER',conName:'数据库一'})
   f.sourceHttp.records['_Base_TblList']!.push({rowid:'OTHER_TABLE',dbid:'OTHER',tblname:'table_one'})
   f.sourceHttp.records['Base_TblField']!.push({rowid:'OTHER_FIELD',tblid:'OTHER_TABLE',enname:'wrong'})
   expect((await f.save()).success).toBe(true)
   expect(f.http.saves).toHaveLength(1)
   const request=f.sourceHttp.reads.find(read=>read.table==='Base_AppAndSource_Relation')?.data as {Table:Array<{Filter:unknown}>}
   expect(DataViewFilterCodec.decode(request.Table[0]!.Filter).toJSON()).toEqual({logic:'and',filters:[{field:'sysid',operator:'eq',value:'A1'},{field:'conName',operator:'eq',value:'数据库一'}]})
  }finally{f.dispose()}
 })
 it('does not borrow a source column available only in another application with the same database and table names',async()=>{
  const f=await fixture()
  try{
   f.sourceHttp.records['Base_AppAndSource_Relation']!.push({rowid:'OTHER_APP_DB',sysid:'A2',conid:'OTHER',conName:'数据库一'})
   f.sourceHttp.records['_Base_TblList']!.push({rowid:'OTHER_TABLE',dbid:'OTHER',tblname:'table_one'})
   f.sourceHttp.records['Base_TblField']=f.sourceHttp.records['Base_TblField']!.filter(row=>!(row['tblid']==='T1'&&row['enname']==='name'))
   f.sourceHttp.records['Base_TblField']!.push({rowid:'OTHER_FIELD',tblid:'OTHER_TABLE',enname:'name'})
   await expect(f.save()).rejects.toThrow('name');expect(f.http.saves).toEqual([])
  }finally{f.dispose()}
 })
 it('rejects two same-named tables inside the selected application database',async()=>{
  const f=await fixture()
  try{
   f.sourceHttp.records['_Base_TblList']!.push({rowid:'OTHER_TABLE',dbid:'D1',tblname:'table_one'})
   await expect(f.save()).rejects.toThrow('物理表不存在或不唯一');expect(f.http.saves).toEqual([])
  }finally{f.dispose()}
 })
 it.each(['application','database'])('rejects ambiguous or foreign physical scope: %s',async kind=>{
  const f=await fixture()
  try{
   if(kind==='application')f.sourceHttp.records['Base_AppAndSource_Relation']![0]!['sysid']='A2'
   else f.sourceHttp.records['Base_AppAndSource_Relation']!.push({rowid:'OTHER_DB',sysid:'A1',conid:'OTHER',conName:'数据库一'})
   await expect(f.save()).rejects.toThrow('归属或运行库名不唯一');expect(f.http.saves).toEqual([])
  }finally{f.dispose()}
 })
 it('rejects newly selected missing physical columns when a producer is disabled and another export rule survives',async()=>{
  const f=await fixture()
  try{
   f.rules.discardEditingRows(['R1'])
   const first=f.http.records['Base_Import_Transform_Rule']![0]!
   f.http.records['Base_Import_Transform_Rule']!.push({...first,id:'R2',sort_order:20,config_json:'{"executionScope":"EXPORT","columns":[{"sourceField":"id","key":0}],"keyTargetField":"key2","valueTargetField":"value2"}'})
   f.http.records['Base_ImportData_Field']!.push(...['key2','value2'].map((name,i)=>({rowid:`F_MORE_${i}`,configid:'C1',name,index:i?'D':'C',isReadOnly:0})))
   await f.rules.refresh();f.rules.updateEditingValue('R1','enabled',0)
   await expect(f.save()).rejects.toThrow('物理')
   expect(f.http.saves).toEqual([])
  }finally{f.dispose()}
 })
 it('rejects generated export targets without Excel output mappings',async()=>{
  const f=await fixture(false)
  try{await expect(f.save()).rejects.toThrow('输出列');expect(f.http.saves).toEqual([])}finally{f.dispose()}
 })
 it('rejects a physically present condition field not selected by the export query',async()=>{
  const f=await fixture()
  try{f.rules.updateEditingValue('R1','condition_json','{"field":"gate"}');await expect(f.save()).rejects.toThrow('gate');expect(f.http.saves).toEqual([])}finally{f.dispose()}
 })
 it('loads original metadata lazily and preserves the source picker filter while saving valid mapped outputs',async()=>{
  const f=await fixture()
  try{
   const picker=f.source.getView('_Base_TblList','storedObject')!
   picker.filterExpression={field:'rowid',operator:'eq',value:'T3'}
   const before=JSON.stringify(picker.toJson())
   expect((await f.save()).success).toBe(true);expect(f.http.saves).toHaveLength(1)
   expect(JSON.stringify(picker.toJson())).toBe(before)
  }finally{f.dispose()}
 })
})
