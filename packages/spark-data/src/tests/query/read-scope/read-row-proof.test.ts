import {afterEach,expect,it} from 'vitest'
import {DataSet} from '../../../dataset'
const sets:DataSet[]=[]
afterEach(()=>sets.splice(0).forEach(ds=>ds.destroy()))
async function fixture(value:unknown=0,assertIdentity:()=>void=()=>undefined){
 const ds=DataSet.fromJson({scenarioId:'SPACE',tables:{Rows:{resourceType:'read-proof-test',resourceId:'source',columns:[{name:'key',type:'string'},{name:'value',type:'number'},{name:'optional',type:'string'},{name:'hidden',type:'string'},{name:'computed',type:'number',computeExpression:'1'}],views:{default:{queryConfig:{pagination:'none'}}}}}});sets.push(ds)
 const view=ds.getView('Rows')!
 view.bindQueryExecutor({executeQuery:async()=>({rows:[Object.freeze({key:'A',value,optional:undefined,hidden:'private'})],total:1,resultPrimaryKey:'',assertIdentity,rowKey:()=>undefined,
  fieldAccess:()=>({read:'visible' as const,write:'denied' as const,component:'readonly' as const,required:false,writeMode:'readonly' as const}),readFieldAccess:(_row,field)=>field==='hidden'?'invisible':'visible',addActionState:()=> 'hidden',editActionState:()=> 'hidden',deleteActionState:()=> 'hidden',createChildActionState:()=> 'hidden',viewActionState:()=> 'enabled'})},{resource:{resourceType:'read-proof-test',resourceId:'source'}})
 await view.refresh();return{view,row:view.rows[0]!}
}
it('captures only original visible formal values without exposing the private query context',async()=>{
 const f=await fixture(),proof=f.view.captureReadRow(f.row,['key','value','optional'])
 expect(typeof proof).toBe('function');expect(()=>proof()).not.toThrow();f.view.setCurrentRow(null);expect(()=>proof()).not.toThrow()
})
it.each(['input','value','replacement','presence'] as const)('refuses a changed %s before initial capture',async mode=>{
 const f=await fixture()
 if(mode==='input')f.view.queryContext={prefix:'different'}
 if(mode==='value')f.row['key']='B'
 if(mode==='replacement')f.view.rows.splice(0,1,{...f.row})
 if(mode==='presence')delete f.row['optional']
 await expect(async()=>f.view.captureReadRow(mode==='replacement'?f.view.rows[0]!:f.row,['key','optional'])).rejects.toThrow('DATA_VIEW_READ_ROW')
})
it('keeps the original proof after a new query replaces same-valued rows',async()=>{
 const f=await fixture(),proof=f.view.captureReadRow(f.row,['key'])
 await f.view.refresh();expect(()=>proof()).toThrow('DATA_VIEW_READ_ROW')
})
it.each(['hidden','missing','computed'])('refuses unreadable or local-derived field %s',async field=>{
 const f=await fixture();expect(()=>f.view.captureReadRow(f.row,[field])).toThrow('DATA_VIEW_READ_ROW')
})
it.each([{before:NaN,after:null},{before:{kept:undefined},after:{}}])('distinguishes native values that JSON serialization conflates',async({before,after})=>{
 const f=await fixture(before),proof=f.view.captureReadRow(f.row,['value'])
 f.row['value']=after;expect(()=>proof()).toThrow('DATA_VIEW_READ_ROW')
})
it('rejects a source field becoming a local computation',async()=>{
 const f=await fixture(),proof=f.view.captureReadRow(f.row,['key'])
 f.view.dataTable!.updateColumn('key',{computeExpression:'"derived"'});expect(()=>proof()).toThrow('DATA_VIEW_READ_ROW')
})
it('rechecks the original resource identity without acquiring a replacement query',async()=>{
 let current=true
 const f=await fixture(0,()=>{if(!current)throw Error('ORIGINAL_RESOURCE_STALE')})
 const proof=f.view.captureReadRow(f.row,['key']);current=false
 expect(()=>proof()).toThrow('ORIGINAL_RESOURCE_STALE')
 expect(()=>f.view.captureReadRow(f.row,['key'])).toThrow('ORIGINAL_RESOURCE_STALE')
})
