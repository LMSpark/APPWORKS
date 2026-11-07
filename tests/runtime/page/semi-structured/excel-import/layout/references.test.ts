import {describe,it,expect,vi} from 'vitest'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {LowcodeExcelImport} from '@/lowcode/resources/semi-structured/excel-import/resource'
import {createSingleExportLayout,readSingleExportLayout} from '@/lowcode/resources/semi-structured/excel-import/layout/definition'
import {excelDesignRuntime,EXCEL_DESIGN} from '../excel-import-design.fixture'
import {ApiBackend} from '../../../api-provider/api-provider.fixture'
import {createSourceDataSet,sourceRecords,SOURCE_SCENE} from '../../../structured-config/data-code/source-picker/fixture'
function layout(){const p=readSingleExportLayout(JSON.stringify(createSingleExportLayout('数据库一@table_one','数据库一@table_three')))!
 p.form['bounds']={sheet:0,from:'B2',to:'B2'};p.form['fields']=[{name:'name',locate:{mode:'cell',cell:'B2'}}]
 p.list['bounds']={sheet:0,from:'A4',to:'A6'};p.list['scan']={headerRow:4,dataStartOffset:1};p.list['fields']=[{name:'code',locate:{mode:'listColumn',column:'A'}}];p.list['link']={fromTableId:p.rootTable['id']!,fromRegionId:p.form['id']!,parentField:'id',foreignKeyField:'code'}
 p.block['bounds']={sheet:0,from:'B6',to:'B7'};p.block['fields']=[{name:'id',locate:{mode:'afterList',rowOffset:1,column:'B'}}];return p.document}
async function fixture(persisted=false){
 const text=JSON.stringify(layout()),f=await excelDesignRuntime({Base_ImportData_Config:[{rowid:'C1',schemeid:'E1',pid:'E1',sheetName:'主表',relatedappid:'A1',table:'数据库一@table_one',exportType:'default',sorted:'',sheet_layout_json:persisted?text:''},{rowid:'C2',schemeid:'E1',pid:'C1',sheetName:'明细',relatedappid:'A1',table:'数据库一@table_three',exportType:'default',sorted:'',sheet_layout_json:''}],Base_ImportData_Field:[],Base_Import_Transform_Rule:[]})
 const http=new ApiBackend();http.records=sourceRecords();const source=await createSourceDataSet(http)
 const page=new PageRuntime({pageId:'layout-save',scenarioIds:[EXCEL_DESIGN,SOURCE_SCENE],deferredScenarioIds:[SOURCE_SCENE],scenarioInputs:{[EXCEL_DESIGN]:{importConfigId:'E1'}},loadScenario:async id=>id===EXCEL_DESIGN?f.ds:source});await page.load();LowcodeExcelImport.bindEditorModelRules(f.ds,()=>page)
 return {...f,httpSource:http,text,save:(id='C1')=>f.ds.saveChanges({views:[{tableName:'Base_ImportData_Config',viewId:'default',ids:[id]}]}),dispose:()=>{page.dispose();f.runtime.dispose()}}
}
describe('layout validation along the original model save capture',()=>{
 it('allows an internal layout reference only when its original ancestor is deleted in the same captured batch',async()=>{const f=await fixture(true);try{
  await f.nodes.removeRow('C2');await f.nodes.removeRow('C1')
  const result=await f.ds.saveChanges({views:[{tableName:f.nodes.tableName,viewId:f.nodes.viewId,ids:['C2','C1']}]})
  expect(result.success).toBe(true);expect(f.http.records['Base_ImportData_Config']).toEqual([]);expect(f.http.saves).toHaveLength(1)
 }finally{f.dispose()}})
 it('does not treat an ancestor staged outside the submitted IDs as a deleted layout reference',async()=>{const f=await fixture(true);try{
  await f.nodes.removeRow('C2');await f.nodes.removeRow('C1');await expect(f.save('C2')).rejects.toThrow(/版式/);expect(f.http.saves).toEqual([])
 }finally{f.dispose()}})
 it('does not require reading the layout or sorting of ancestors deleted in the same batch',async()=>{const f=await fixture(true);try{
  f.http.maskedFields['Base_ImportData_Config']=['sheet_layout_json','sorted'];await f.nodes.refresh();await f.nodes.removeRow('C2');await f.nodes.removeRow('C1')
  expect((await f.ds.saveChanges({views:[{tableName:f.nodes.tableName,viewId:f.nodes.viewId,ids:['C2','C1']}]})).success).toBe(true);expect(f.http.records['Base_ImportData_Config']).toEqual([])
 }finally{f.dispose()}})
 it('rejects a formally moved ancestor even if it was included in the original delete batch',async()=>{const f=await fixture(true);try{
  await f.nodes.removeRow('C2');await f.nodes.removeRow('C1');f.http.records['Base_ImportData_Config']![0]!['pid']='OTHER'
  await expect(f.ds.saveChanges({views:[{tableName:f.nodes.tableName,viewId:f.nodes.viewId,ids:['C2','C1']}]})).rejects.toThrow(/归属已变化|父身份已变化/);expect(f.http.saves).toEqual([])
 }finally{f.dispose()}})
 it('rejects a parent-only native delete while an unsubmitted child survives',async()=>{const f=await fixture();try{
  await f.nodes.removeRow('C1');await expect(f.save('C1')).rejects.toThrow(/子配置/);expect(f.http.saves).toEqual([])
 }finally{f.dispose()}})
 it('rejects a foreign-scheme child through the same native model delete guard',async()=>{const f=await fixture();try{
  f.http.records['Base_ImportData_Config']!.push({rowid:'FOREIGN',schemeid:'OTHER',pid:'C2',sheetName:'外部配置'});await f.nodes.removeRow('C2')
  await expect(f.save('C2')).rejects.toThrow(/跨方案/);expect(f.http.saves).toEqual([])
 }finally{f.dispose()}})
 it('rejects a nested route that would shadow the direct layout detail',async()=>{const f=await fixture(true);try{
  f.http.records['Base_ImportData_Config']!.push({rowid:'P',schemeid:'E1',pid:'C1',sorted:'',table:'数据库一@other',relatedappid:'A1',exportType:'default',sheet_layout_json:''},{rowid:'G',schemeid:'E1',pid:'P',sorted:'',table:'数据库一@other_detail',relatedappid:'A1',exportType:'default',sheet_layout_json:''})
  await f.nodes.refresh();f.nodes.updateEditingValue('G','table','数据库一@table_three')
  await expect(f.save('G')).rejects.toThrow(/版式.*唯一|版式.*重复/);expect(f.http.saves).toEqual([])
 }finally{f.dispose()}})
 it('protects an existing detail route using the service case and whitespace matching',async()=>{const f=await fixture(true);try{
  const value=layout(),parts=readSingleExportLayout(JSON.stringify(value))!;parts.detailTable['table']=' 数据库一@TABLE_THREE '
  f.http.records['Base_ImportData_Config']![0]!['sheet_layout_json']=JSON.stringify(parts.document)
  await f.nodes.refresh();await f.nodes.removeRow('C2');await expect(f.save('C2')).rejects.toThrow(/版式/);expect(f.http.saves).toEqual([])
 }finally{f.dispose()}})
 it('rejects deletion if the captured root was formally moved into a layout subtree',async()=>{const f=await fixture(true);try{
  f.http.records['Base_ImportData_Config']![1]!['pid']='E1';await f.nodes.refresh();await f.nodes.removeRow('C2')
  f.http.records['Base_ImportData_Config']![1]!['pid']='C1'
  await expect(f.save('C2')).rejects.toThrow(/父身份已变化/);expect(f.http.saves).toEqual([])
 }finally{f.dispose()}})
 it('rechecks detail ownership on the independent physical-source read',async()=>{const f=await fixture(),request=f.http.request.bind(f.http);let moved=false
  const spy=vi.spyOn(f.http,'request').mockImplementation(async config=>{const body=JSON.stringify(config.data);if(!moved&&config.url==='/api/DataOperation/GetData'&&body.includes('"C2"')&&body.includes('"relatedappid"')){moved=true;f.http.records['Base_ImportData_Config']![1]!['pid']='OTHER'}return request(config)})
  try{f.nodes.updateEditingValue('C1','sheet_layout_json',f.text);await expect(f.save()).rejects.toThrow(/版式明细正式归属/);expect(moved).toBe(true);expect(f.http.saves).toEqual([])}finally{spy.mockRestore();f.dispose()}
 })
 it('rejects incomplete layout geometry before any node write',async()=>{const f=await fixture();try{f.nodes.updateEditingValue('C1','sheet_layout_json',JSON.stringify(createSingleExportLayout('数据库一@table_one','数据库一@table_three')));await expect(f.save()).rejects.toThrow();expect(f.http.saves).toEqual([])}finally{f.dispose()}})
 it('rejects a physical field from the wrong source before any node write',async()=>{const f=await fixture();try{const p=readSingleExportLayout(f.text)!;p.form['fields']=[{name:'code',locate:{mode:'cell',cell:'B2'}}];f.nodes.updateEditingValue('C1','sheet_layout_json',JSON.stringify(p.document));await expect(f.save()).rejects.toThrow();expect(f.http.saves).toEqual([])}finally{f.dispose()}})
 it('saves a valid definition unchanged through the original DataSet',async()=>{const f=await fixture();try{f.nodes.updateEditingValue('C1','sheet_layout_json',f.text);expect((await f.save()).success).toBe(true);expect(f.http.records['Base_ImportData_Config']![0]!['sheet_layout_json']).toBe(f.text);expect(f.httpSource.saves).toEqual([])}finally{f.dispose()}})
 it('protects a detail referenced by a saved layout without reading its own masked layout or sorting',async()=>{const f=await fixture(true),access=f.nodes.fieldAccess.bind(f.nodes),spy=vi.spyOn(f.nodes,'fieldAccess').mockImplementation((row,field)=>row?.['rowid']==='C2'&&['sorted','sheet_layout_json'].includes(field)?{...access(row,field),read:'masked'}:access(row,field));try{await f.nodes.removeRow('C2');await expect(f.save('C2')).rejects.toThrow(/版式|布局/);expect(f.http.saves).toEqual([])}finally{spy.mockRestore();f.dispose()}})
 it('does not read unrelated layout dependencies when saving a plain name change',async()=>{const f=await fixture();try{f.nodes.updateEditingValue('C1','sheetName','只改名称');expect((await f.save()).success).toBe(true);expect(f.httpSource.reads).toEqual([])}finally{f.dispose()}})
})
