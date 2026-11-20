import {afterEach,expect,it} from 'vitest'
import {DataSet} from '../../../dataset'
const dataSets:DataSet[]=[]
afterEach(()=>dataSets.splice(0).forEach(dataSet=>dataSet.destroy()))
function fixture(){
 const dataSet=DataSet.fromJson({scenarioId:'SPACE',tables:{Rows:{resourceType:'paged-test',resourceId:'page-test',columns:[{name:'name',type:'string'}],views:{default:{pageSize:1}}}}});dataSets.push(dataSet)
 const view=dataSet.getView('Rows')!
 let next:unknown=true,name='original'
 view.bindQueryExecutor({executeQuery:async()=>{
  const result={rows:[{name}],total:1,countReported:false,resultPrimaryKey:'',assertIdentity:()=>undefined,rowKey:()=>undefined,
   fieldAccess:()=>({read:'visible' as const,write:'denied' as const,component:'readonly' as const,required:false,writeMode:'readonly' as const}),
   readFieldAccess:()=> 'visible' as const,addActionState:()=> 'hidden' as const,editActionState:()=> 'hidden' as const,
   deleteActionState:()=> 'hidden' as const,createChildActionState:()=> 'hidden' as const,viewActionState:()=> 'enabled' as const}
  if(next!==undefined)Object.defineProperty(result,'nextPageAvailable',{value:next,enumerable:true})
  return result
 }},{resource:{resourceType:'paged-test',resourceId:'page-test'}})
 return{view,remote:(value:unknown)=>{next=value;name='remote'}}
}
it('exposes only the current confirmed next-page state through the original result and snapshot',async()=>{
 const f=fixture();expect(f.view.nextPageAvailable).toBeUndefined()
 await f.view.refresh();expect(f.view.nextPageAvailable).toBe(true);expect(f.view.readSnapshot()).toMatchObject({countReported:false,nextPageAvailable:true,total:1})
 f.remote(false);await f.view.refresh();expect(f.view.nextPageAvailable).toBe(false);expect(f.view.readSnapshot()).toMatchObject({nextPageAvailable:false})
 f.remote(undefined);await f.view.refresh();expect(f.view.nextPageAvailable).toBeUndefined();expect(f.view.readSnapshot()).not.toHaveProperty('nextPageAvailable')
})
it.each([null,0,1,'true',{},[]])('rejects malformed next-page state %j before replacing the original result',async value=>{
 const f=fixture();await f.view.refresh();const row=f.view.rows[0]
 f.remote(value);await expect(f.view.loadFromServer()).rejects.toThrow('DATA_VIEW_NEXT_PAGE')
 expect(f.view.rows[0]).toBe(row);expect(f.view.rows[0]?.['name']).toBe('original');expect(f.view.nextPageAvailable).toBe(true)
})
