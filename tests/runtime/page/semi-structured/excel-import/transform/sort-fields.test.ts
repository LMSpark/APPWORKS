import {describe,it,expect,vi} from 'vitest'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {ApiBackend} from '../../../api-provider/api-provider.fixture'
import {createSourceDataSet,sourceRecords,SOURCE_SCENE} from '../../../structured-config/data-code/source-picker/fixture'
import {excelDesignRuntime,EXCEL_DESIGN} from '../excel-import-design.fixture'
import {LowcodeExcelImport} from '@/lowcode/resources/semi-structured/excel-import/resource'
import {ExcelSortFieldDirectory,readExcelSortFields} from '@/lowcode/resources/semi-structured/excel-import/transform/sort-fields'
async function fixture(onStateChange?:()=>void){
 const f=await excelDesignRuntime({Base_ImportData_Config:[{rowid:'C1',schemeid:'E1',pid:'E1',sheetName:'节点',relatedappid:'A1',table:'数据库一@table_one',sorted:''}],Base_ImportData_Field:[],Base_Import_Transform_Rule:[]})
 const sourceHttp=new ApiBackend();sourceHttp.records=sourceRecords();const source=await createSourceDataSet(sourceHttp)
 const page=new PageRuntime({pageId:'sort-fields',scenarioIds:[EXCEL_DESIGN,SOURCE_SCENE],deferredScenarioIds:[SOURCE_SCENE],scenarioInputs:{[EXCEL_DESIGN]:{importConfigId:'E1'}},loadScenario:async id=>id===EXCEL_DESIGN?f.ds:source})
 await page.load();LowcodeExcelImport.bindEditorModelRules(f.ds,()=>page)
 const directory=new ExcelSortFieldDirectory({dataSet:f.ds,getPage:()=>page},onStateChange)
 const dispose=()=>{directory.dispose();page.dispose();f.runtime.dispose()}
 const save=()=>f.ds.saveChanges({views:[{tableName:'Base_ImportData_Config',viewId:'default',ids:['C1']}]})
 return {...f,source,sourceHttp,page,directory,dispose,save}
}
describe('Excel sort physical directory and original model save',()=>{
 it('does not adopt a directory narrowed synchronously by a configuration listener',async()=>{
  const f=await fixture();await f.page.ensureScenarioLoaded(SOURCE_SCENE)
  const view=f.source.getView('Base_TblField','excelSortFields')!
  let changed=false
  const narrow=()=>{if(!changed){changed=true;view.filterExpression={logic:'and',filters:[{field:'tblid',operator:'eq',value:'T1'},{field:'enname',operator:'eq',value:'id'}]}}}
  view.events.on('configChanged',narrow)
  try{await f.directory.load();expect(f.directory.ready).toBe(false);expect(f.directory.error).toMatch(/查询身份/)}
  finally{view.events.off('configChanged',narrow);f.dispose()}
 })
 it('does not clear a replacement directory when an older load fails its identity check',async()=>{
  const f=await fixture();await f.page.ensureScenarioLoaded(SOURCE_SCENE)
  const old=f.source.getView('Base_TblField','excelSortFields')!,refresh=old.refresh.bind(old)
  let release=()=>{},arrived=false
  const gate=new Promise<void>(resolve=>{release=resolve})
  const delayed=vi.spyOn(old,'refresh').mockImplementationOnce(async()=>{await refresh();arrived=true;await gate})
  try{
   const loading=f.directory.load();await vi.waitFor(()=>expect(arrived).toBe(true))
   const replacement=old.createQueryView('replacementSortDirectory'),model=old.dataTable!
   model.destroyView('excelSortFields');model.views['excelSortFields']=replacement
   await replacement.refresh();expect(replacement.rows).toHaveLength(2)
   release();await loading
   expect(f.directory.ready).toBe(false);expect(replacement.rows).toHaveLength(2)
  }finally{release();delayed.mockRestore();f.dispose()}
 })
 it('does not adopt an externally narrowed directory while its original load is completing',async()=>{
  const f=await fixture();await f.page.ensureScenarioLoaded(SOURCE_SCENE)
  const view=f.source.getView('Base_TblField','excelSortFields')!,refresh=view.refresh.bind(view)
  let release=()=>{},arrived=false
  const gate=new Promise<void>(resolve=>{release=resolve})
  const delayed=vi.spyOn(view,'refresh').mockImplementationOnce(async()=>{await refresh();arrived=true;await gate})
  try{
   const loading=f.directory.load();await vi.waitFor(()=>expect(arrived).toBe(true))
   view.filterExpression={logic:'and',filters:[{field:'tblid',operator:'eq',value:'T1'},{field:'enname',operator:'eq',value:'id'}]}
   await refresh();release();await loading
   expect(f.directory.ready).toBe(false);expect(f.directory.error).toMatch(/查询身份/)
  }finally{release();delayed.mockRestore();f.dispose()}
 })
 it('notifies the bound page immediately while the original directory is being disposed',async()=>{
  const changed=vi.fn(),f=await fixture(changed)
  try{
   await f.directory.load();expect(f.directory.ready).toBe(true);changed.mockClear()
   f.source.getView('Base_TblField','excelSortFields')!.destroy()
   expect(changed).toHaveBeenCalledOnce();expect(f.directory.ready).toBe(false)
  }finally{f.dispose()}
 })
 it('does not query a physical directory for a newly created unsaved node',async()=>{
  const f=await fixture()
  try{
   await f.nodes.addRowWithIdentity({field:'rowid',value:'C2'},{schemeid:'E1',pid:'E1',sheetName:'新节点',relatedappid:'A1',table:'数据库一@table_one',sorted:''})
   f.nodes.setCurrentRowById('C2');await f.directory.load()
   expect(f.directory.ready).toBe(false);expect(f.directory.error).toMatch(/未保存/)
   expect(f.sourceHttp.reads).toEqual([]);expect(f.http.saves).toEqual([])
  }finally{f.dispose()}
 })
 it('rejects applied unsaved source changes but permits unrelated node name changes',async()=>{
  const f=await fixture()
  try{
   f.nodes.editRowById('C1',{sheetName:'本地名称'});await f.directory.load();expect(f.directory.ready).toBe(true)
   f.nodes.editRowById('C1',{table:'数据库一@unsaved'});await f.directory.load()
   expect(f.directory.ready).toBe(false);expect(f.directory.error).toMatch(/未保存/)
  }finally{f.dispose()}
 })
 it('revokes readiness immediately when the original dedicated directory is retargeted or cleared',async()=>{
  const f=await fixture()
  try{
   await f.directory.load();expect(f.directory.ready).toBe(true)
   const view=f.source.getView('Base_TblField','excelSortFields')!
   view.filterExpression={field:'tblid',operator:'eq',value:'foreign'}
   expect(f.directory.ready).toBe(false)
   await f.directory.load();expect(f.directory.ready).toBe(true)
   view.clearAll();expect(f.directory.ready).toBe(false)
  }finally{f.dispose()}
 })
 it('binds the dedicated complete physical field view even when there are no Excel mapping rows',async()=>{
  const f=await fixture()
  try{
   await f.directory.load();expect(f.directory.error).toBe('');expect(f.directory.ready).toBe(true)
   const view=f.source.getView('Base_TblField','excelSortFields')!
   expect(f.directory.dataViewKey).toBe(`${SOURCE_SCENE}@Base_TblField@excelSortFields`)
   expect(view.rows.map(row=>row['enname'])).toEqual(['id','name']);expect(f.fields.rows).toEqual([])
   f.directory.invalidate();expect(view.rows).toEqual([]);expect(f.directory.ready).toBe(false)
   expect(f.http.saves).toEqual([]);expect(f.sourceHttp.saves).toEqual([])
  }finally{f.dispose()}
 })
 it('saves the original Field/Type JSON and preserves unknown members through the same node DataSet',async()=>{
  const f=await fixture(),value='[{"Field":"name","Type":"descending","extra":{"zero":0,"flag":false}}]'
  try{
   f.nodes.updateEditingValue('C1','sorted',value);expect((await f.save()).success).toBe(true)
   expect(f.http.records['Base_ImportData_Config']![0]!['sorted']).toBe(value)
   expect(f.http.saves).toHaveLength(1);expect(f.sourceHttp.saves).toEqual([])
  }finally{f.dispose()}
 })
 it.each(['[{"Field":"foreign","Type":"ascending"}]','[{"Field":"name","Type":"ASC"}]','[{}]'])('rejects nonphysical or malformed changed sorting without committing: %s',async value=>{
  const f=await fixture()
  try{f.nodes.updateEditingValue('C1','sorted',value);await expect(f.save()).rejects.toThrow();expect(f.http.saves).toEqual([])}finally{f.dispose()}
 })
 it('does not scan physical metadata for a plain node name change or a cleared sort',async()=>{
  const f=await fixture()
  try{
   f.nodes.updateEditingValue('C1','sheetName','改名');expect((await f.save()).success).toBe(true)
   expect(f.sourceHttp.reads).toEqual([])
   f.nodes.updateEditingValue('C1','sorted','[]');expect((await f.save()).success).toBe(true)
   expect(f.sourceHttp.reads).toEqual([])
  }finally{f.dispose()}
 })
 it('does not require a readable sort definition to delete an otherwise deletable node',async()=>{
  const f=await fixture(),original=f.nodes.fieldAccess.bind(f.nodes),access=vi.spyOn(f.nodes,'fieldAccess').mockImplementation((row,field)=>field==='sorted'?{...original(row,field),read:'masked'}:original(row,field))
  try{
   await f.nodes.removeRow('C1');expect((await f.save()).success).toBe(true)
   expect(f.http.saves).toHaveLength(1);expect(f.sourceHttp.reads).toEqual([])
  }finally{access.mockRestore();f.dispose()}
 })
 it('does not normalize native zero, invalid directions or object-shaped historical definitions',()=>{
  for(const value of [0,'{}','[{"Field":"name","Type":0}]'])expect(()=>readExcelSortFields(value)).toThrow()
  expect(readExcelSortFields('')).toEqual([])
 })
})
