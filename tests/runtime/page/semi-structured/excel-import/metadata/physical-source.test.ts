import {describe,it,expect} from 'vitest'
import {ApiBackend} from '../../../api-provider/api-provider.fixture'
import {createSourceDataSet,sourceRecords} from '../../../structured-config/data-code/source-picker/fixture'
import {resolveExcelPhysicalObject} from '@/lowcode/resources/semi-structured/excel-import/metadata/physical-source'
describe('Excel physical metadata identity',()=>{
 it('resolves within the specified application even when another application has the same database and table names',async()=>{
  const http=new ApiBackend();http.records=sourceRecords()
  http.records['Base_AppAndSource_Relation']!.push({rowid:'FOREIGN',sysid:'A2',conid:'FOREIGN_DB',conName:'数据库一'})
  http.records['_Base_TblList']!.push({rowid:'FOREIGN_TABLE',dbid:'FOREIGN_DB',tblname:'table_one'})
  const source=await createSourceDataSet(http)
  try{expect(await resolveExcelPhysicalObject({source,applicationId:'A1',path:'数据库一@table_one',check:()=>{}})).toEqual({kind:'Table',databaseId:'D1',objectId:'T1'});expect(http.saves).toEqual([])}finally{source.destroy()}
 })
 it('only falls back to a uniquely registered view when the selected database has no table of that name',async()=>{
  const http=new ApiBackend();http.records=sourceRecords()
  http.records['_Base_TblList']=http.records['_Base_TblList']!.filter(row=>row['rowid']!=='T1')
  http.records['_Base_ViewList']=[{rowid:'V1',dbid:'D1',vewname:'table_one'}]
  const source=await createSourceDataSet(http)
  try{
   await expect(resolveExcelPhysicalObject({source,applicationId:'A1',path:'数据库一@table_one',check:()=>{}})).rejects.toThrow('物理表')
   expect(await resolveExcelPhysicalObject({source,applicationId:'A1',path:'数据库一@table_one',allowView:true,check:()=>{}})).toEqual({kind:'View',databaseId:'D1',objectId:'V1'})
   expect(http.saves).toEqual([])
  }finally{source.destroy()}
 })
 it('rejects ambiguous tables without choosing a same-named view',async()=>{
  const http=new ApiBackend();http.records=sourceRecords();http.records['_Base_TblList']!.push({rowid:'DUP',dbid:'D1',tblname:'table_one'})
  http.records['_Base_ViewList']=[{rowid:'V1',dbid:'D1',vewname:'table_one'}]
  const source=await createSourceDataSet(http)
  try{await expect(resolveExcelPhysicalObject({source,applicationId:'A1',path:'数据库一@table_one',allowView:true,check:()=>{}})).rejects.toThrow('物理表');expect(http.reads.some(read=>read.table==='_Base_ViewList')).toBe(false)}finally{source.destroy()}
 })
})
