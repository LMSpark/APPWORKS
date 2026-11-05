import {describe,it,expect} from 'vitest'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {ApiBackend} from '../../../api-provider/api-provider.fixture'
import {createSourceDataSet,sourceRecords,SOURCE_SCENE} from '../../../structured-config/data-code/source-picker/fixture'
import {excelDesignRuntime,EXCEL_DESIGN} from '../excel-import-design.fixture'
import {ExcelPhysicalFieldDirectory} from '@/lowcode/resources/semi-structured/excel-import/transform/physical-fields'
describe('original independent physical field directories',()=>{
 it('binds root and detail physical fields independently without changing the selected node',async()=>{
  const f=await excelDesignRuntime({Base_ImportData_Config:[{rowid:'C1',schemeid:'E1',pid:'E1',relatedappid:'A1',table:'数据库一@table_one'},{rowid:'C2',schemeid:'E1',pid:'C1',relatedappid:'A2',table:'数据库二@table_two'}],Base_ImportData_Field:[],Base_Import_Transform_Rule:[]})
  const http=new ApiBackend();http.records=sourceRecords();const source=await createSourceDataSet(http)
  const page=new PageRuntime({pageId:'layout-fields',scenarioIds:[EXCEL_DESIGN,SOURCE_SCENE],deferredScenarioIds:[SOURCE_SCENE],scenarioInputs:{[EXCEL_DESIGN]:{importConfigId:'E1'}},loadScenario:async id=>id===EXCEL_DESIGN?f.ds:source})
  await page.load();f.nodes.setCurrentRowById('C1')
  const root=new ExcelPhysicalFieldDirectory({dataSet:f.ds,getPage:()=>page,viewId:'excelLayoutRootFields',recordId:()=> 'C1',allowView:false})
  const detail=new ExcelPhysicalFieldDirectory({dataSet:f.ds,getPage:()=>page,viewId:'excelLayoutDetailFields',recordId:()=> 'C2',allowView:false})
  try{
   await Promise.all([root.load(),detail.load()]);expect(root.ready).toBe(true);expect(detail.ready).toBe(true)
   expect(root.dataViewKey).toBe(`${SOURCE_SCENE}@Base_TblField@excelLayoutRootFields`)
   expect(detail.dataViewKey).toBe(`${SOURCE_SCENE}@Base_TblField@excelLayoutDetailFields`)
   expect(source.getView('Base_TblField','excelLayoutRootFields')!.rows.map(row=>row['enname'])).toEqual(['id','name'])
   expect(source.getView('Base_TblField','excelLayoutDetailFields')!.rows.map(row=>row['enname'])).toEqual(['other'])
   expect(f.nodes.currentRow?.['rowid']).toBe('C1')
   f.nodes.editRowById('C2',{table:'数据库一@table_one'});expect(detail.ready).toBe(false);expect(root.ready).toBe(true)
   expect(f.http.saves).toEqual([]);expect(http.saves).toEqual([])
  }finally{root.dispose();detail.dispose();page.dispose();f.runtime.dispose()}
 })
})
