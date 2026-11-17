import {afterEach,expect,it,vi} from 'vitest'
import {DataSet,bindDataSetCommandSubmit} from '@spark-appworks/spark-data'
import {PdfInspectionInitResource} from './init-resource'
const sets:DataSet[]=[]
afterEach(()=>sets.splice(0).forEach(ds=>ds.destroy()))
async function fixture(){
 const ds=DataSet.fromJson({scenarioId:'PDF',tables:{InspectionInit:{resourceType:'command',resourceId:PdfInspectionInitResource.resourceId,
  columns:[{name:'requestId',type:'string',isPrimaryKey:true},{name:'configId',type:'string'},{name:'files',type:'array'},{name:'inspectJobId',type:'string'},{name:'status',type:'string'},{name:'fileCount',type:'number'}],views:{default:{commitMode:'staged',autoLoad:false}}}}});sets.push(ds)
 const view=ds.getView('InspectionInit')!,state={ready:true},files=[{fileId:'F',appType:'filedata',filePath:'exact/ack.pdf'}]
 const api={init:vi.fn(async()=>({protocolVersion:'2.0' as const,inspectJobId:'JOB',status:'PENDING',fileCount:1})),recover:vi.fn(async()=>({protocolVersion:'2.0' as const,inspectJobId:'JOB',requestId:'REQ',status:'COMPLETED',progress:{total:1,finished:1},files:[]}))}
 const resource=new PdfInspectionInitResource({api,assertCurrent:()=>{},prepare:(_view,row)=>{
  if(typeof row['requestId']!=='string')throw Error('missing requestId')
  return{input:{requestId:row['requestId'],configId:'RULE',files},assertReady:()=>{if(!state.ready)throw Error('rule no longer ready')}}
 }})
 bindDataSetCommandSubmit(view,resource.binding(view));await view.refresh();await view.addRow({requestId:'REQ',configId:'RULE',files})
 return{ds,view,state,api,save:()=>ds.saveChanges({views:[{tableName:'InspectionInit',viewId:'default',ids:['REQ']}]})}
}
it('cancels an unsubmitted native command without calling init',async()=>{const f=await fixture();f.view.discardPendingChanges(['REQ']);expect(f.api.init).not.toHaveBeenCalled()})
it('rejects a changed rule before dispatch without an unknown write',async()=>{const f=await fixture();f.state.ready=false;await expect(f.save()).rejects.toThrow();expect(f.api.init).not.toHaveBeenCalled();expect(f.view.hasUnconfirmedSave).toBe(false)})
it('recovers a lost init receipt even if the original rule was later disabled',async()=>{
 const f=await fixture();f.api.init.mockRejectedValueOnce(Error('lost receipt'))
 await expect(f.save()).rejects.toThrow();expect(f.view.hasUnconfirmedSave).toBe(true)
 f.state.ready=false;await f.save()
 expect(f.api.init).toHaveBeenCalledTimes(1);expect(f.api.recover).toHaveBeenCalledWith('REQ')
 expect(f.view.rows[0]).toMatchObject({requestId:'REQ',inspectJobId:'JOB',status:'COMPLETED'})
})
it('keeps a recovery miss unknown and never calls init again',async()=>{
 const f=await fixture();f.api.init.mockRejectedValueOnce(Error('lost'));f.api.recover.mockRejectedValue(Error('404'))
 await expect(f.save()).rejects.toThrow();await expect(f.save()).rejects.toThrow()
 expect(f.api.init).toHaveBeenCalledTimes(1);expect(f.view.hasUnconfirmedSave).toBe(true)
})
