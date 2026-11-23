// @vitest-environment node
import {afterEach,expect,it,vi} from 'vitest'
import {DataSet,bindDataSetCommandSubmit} from '@spark-appworks/spark-data'
import {PdfInspectionInitResource} from './init-resource'
import {PdfInspectionRecoveryJournal} from './recovery-journal'
import type {PdfInspectionInitInput} from './task-api'
const sets:DataSet[]=[]
afterEach(()=>sets.splice(0).forEach(ds=>ds.destroy()))
async function fixture(options:Readonly<{writeThenFailRead?:boolean}>={}){
 const ds=DataSet.fromJson({scenarioId:'PDF',tables:{InspectionInit:{resourceType:'command',resourceId:PdfInspectionInitResource.resourceId,
  columns:[{name:'requestId',type:'string',isPrimaryKey:true},{name:'configId',type:'string'},{name:'files',type:'array'},{name:'inspectJobId',type:'string'},{name:'status',type:'string'},{name:'fileCount',type:'number'}],views:{default:{commitMode:'staged',autoLoad:false}}}}});sets.push(ds)
 const view=ds.getView('InspectionInit')!,state={ready:true},files=[{fileId:'F',appType:'filedata',filePath:'exact/ack.pdf'}]
 const api={init:vi.fn(async(_input:PdfInspectionInitInput)=>({protocolVersion:'2.0' as const,inspectJobId:'JOB',status:'PENDING',fileCount:1})),recover:vi.fn(async()=>({protocolVersion:'2.0' as const,inspectJobId:'JOB',requestId:'REQ',status:'COMPLETED',progress:{total:1,finished:1},files:[]}))}
 const stored=new Map<string,string>(),storageState={failRead:false,failRemoveRead:false,writes:0}
 const storage={get length(){return stored.size},key:(index:number)=>[...stored.keys()][index]??null,
  getItem:(key:string)=>{if(storageState.failRead)throw Error('pointer read unavailable');return stored.get(key)??null},
  setItem:(key:string,value:string)=>{storageState.writes++;stored.set(key,value);if(options.writeThenFailRead)storageState.failRead=true},
  removeItem:(key:string)=>{stored.delete(key);if(storageState.failRemoveRead)storageState.failRead=true}}
 const recovery=new PdfInspectionRecoveryJournal({storage,owner:{enterpriseId:'TENANT',enterpriseShortName:'tenant',actorId:'ACTOR',applicationId:'APP',scenarioId:'PDF'},resolveUrl:requestId=>`/pdf?pdfInspectionRequestId=${requestId}`})
 const resource=new PdfInspectionInitResource({api,recovery,assertCurrent:()=>{},prepare:(_view,row)=>{
  if(typeof row['requestId']!=='string')throw Error('missing requestId')
  return{input:{requestId:row['requestId'],configId:'RULE',files},assertReady:()=>{if(!state.ready)throw Error('rule no longer ready')}}
 }})
 bindDataSetCommandSubmit(view,resource.binding(view));await view.refresh();await view.addRow({requestId:'REQ',configId:'RULE',files})
 return{ds,view,state,api,resource,recovery,storageState,stored,save:()=>ds.saveChanges({views:[{tableName:'InspectionInit',viewId:'default',ids:['REQ']}]})}
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
it('retains the same native pending request after pointer write succeeded but its read failed',async()=>{
 const f=await fixture({writeThenFailRead:true})
 expect(f.storageState.writes).toBe(1);expect([...f.view.dirtyTracking.pendingCreateIds]).toEqual(['REQ'])
 await expect(f.save()).rejects.toThrow('pointer read unavailable')
 expect(f.api.init).not.toHaveBeenCalled();expect(f.view.hasUnconfirmedSave).toBe(false)
 f.storageState.failRead=false
 await f.save()
 expect(f.api.init).toHaveBeenCalledOnce();expect(f.api.init.mock.calls[0]?.[0]).toMatchObject({requestId:'REQ'})
 expect(f.storageState.writes).toBe(1);expect(f.recovery.pending()).toHaveLength(1)
 f.resource.settleConfirmed(f.view,'REQ');expect(f.recovery.pending()).toEqual([])
})
it('releases a recovery pointer only after the original never-dispatched row was cancelled',async()=>{
 const f=await fixture()
 expect(()=>f.resource.releaseCancelled(f.view,'REQ')).toThrow('PDF_INSPECTION_CANCEL')
 f.view.discardPendingChanges(['REQ']);f.resource.releaseCancelled(f.view,'REQ')
 expect(f.recovery.pending()).toEqual([]);expect(f.api.init).not.toHaveBeenCalled()
})
it('refuses cancellation once init may have been dispatched',async()=>{
 const f=await fixture();f.api.init.mockRejectedValueOnce(Error('lost receipt'))
 await expect(f.save()).rejects.toThrow()
 expect(()=>f.resource.releaseCancelled(f.view,'REQ')).toThrow('PDF_INSPECTION_CANCEL')
 expect(f.recovery.pending()).toHaveLength(1)
})
it('keeps the pointer until an original admitted command receipt is present and unchanged',async()=>{
 const f=await fixture()
 expect(()=>f.resource.settleConfirmed(f.view,'REQ')).toThrow('PDF_INSPECTION_RECEIPT')
 await f.save();f.view.rows[0]!['inspectJobId']='OTHER'
 expect(()=>f.resource.settleConfirmed(f.view,'REQ')).toThrow('PDF_INSPECTION_RECEIPT')
 expect(f.recovery.pending()).toHaveLength(1)
})
it('does not reinit when accepted task pointer cleanup became uncertain',async()=>{
 const f=await fixture();await f.save();f.storageState.failRemoveRead=true
 expect(()=>f.resource.settleConfirmed(f.view,'REQ')).toThrow('pointer read unavailable')
 expect(f.view.hasUnconfirmedSave).toBe(false)
 f.storageState.failRead=false;await f.save();f.resource.settleConfirmed(f.view,'REQ')
 expect(f.api.init).toHaveBeenCalledOnce();expect(f.recovery.pending()).toEqual([])
})
