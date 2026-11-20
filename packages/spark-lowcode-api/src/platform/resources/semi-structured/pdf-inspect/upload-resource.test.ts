import {afterEach,expect,it,vi} from 'vitest'
import {DataSet,bindDataSetCommandSubmit} from '@spark-appworks/spark-data'
import {PdfInspectionUploadResource} from './upload-resource'
const sets:DataSet[]=[]
afterEach(()=>sets.splice(0).forEach(ds=>ds.destroy()))
async function fixture(){
 const ds=DataSet.fromJson({scenarioId:'PDF',tables:{InspectionUpload:{resourceType:'command',resourceId:PdfInspectionUploadResource.resourceId,
  columns:[{name:'uploadId',type:'string',isPrimaryKey:true},{name:'originalName',type:'string'},{name:'size',type:'number'},{name:'filePath',type:'string'}],views:{default:{commitMode:'staged',autoLoad:false}}}}});sets.push(ds)
 const view=ds.getView('InspectionUpload')!,file=new File(['%PDF-fixture'],'original.pdf'),state={ready:true}
 const upload={uploadBinaryVersion:vi.fn(async()=>({templatePath:'/tenant/filedata/actual.pdf',locator:{appType:'filedata' as const,customPath:'',fileName:'actual.pdf'}})),verifyBinaryVersion:vi.fn(async()=>{})}
 const resource=new PdfInspectionUploadResource({upload,assertCurrent:()=>{},prepare:()=>({scenarioId:'PDF',file,assertReady:()=>{if(!state.ready)throw Error('not ready')}})})
 bindDataSetCommandSubmit(view,resource.binding(view));await view.refresh();await view.addRow({uploadId:'FILE',originalName:file.name,size:file.size})
 return{ds,view,file,state,upload,resource,save:()=>ds.saveChanges({views:[{tableName:'InspectionUpload',viewId:'default',ids:['FILE']}]})}
}
it('does not upload a cancelled input',async()=>{const f=await fixture();f.view.discardPendingChanges(['FILE']);expect(f.upload.uploadBinaryVersion).not.toHaveBeenCalled()})
it('returns only the byte-confirmed original ACK as the task file path',async()=>{
 const f=await fixture();expect(()=>f.resource.fileInput(f.view,'FILE')).toThrow()
 await f.save();expect(f.resource.fileInput(f.view,'FILE').input).toEqual({fileId:'FILE',appType:'filedata',filePath:'/tenant/filedata/actual.pdf'})
 expect(f.upload.uploadBinaryVersion).toHaveBeenCalledWith(expect.objectContaining({file:f.file,appType:'filedata',customPath:''}))
})
it('verifies the original bytes after unknown without uploading again',async()=>{
 const f=await fixture();f.upload.verifyBinaryVersion.mockRejectedValueOnce(Error('read lost'))
 await expect(f.save()).rejects.toThrow();f.state.ready=false;await f.save()
 expect(f.upload.uploadBinaryVersion).toHaveBeenCalledTimes(1);expect(f.upload.verifyBinaryVersion).toHaveBeenCalledTimes(2)
})
it('keeps a lost ACK unknown rather than guessing a path or retrying',async()=>{
 const f=await fixture();f.upload.uploadBinaryVersion.mockRejectedValueOnce(Object.assign(Error('ACK lost'),{fileResourceMutationMayHaveApplied:true}))
 await expect(f.save()).rejects.toThrow();await expect(f.save()).rejects.toThrow()
 expect(f.upload.uploadBinaryVersion).toHaveBeenCalledTimes(1);expect(()=>f.resource.fileInput(f.view,'FILE')).toThrow()
})
it('releases only a cancelled, undispatched file',async()=>{
 const f=await fixture();expect(()=>f.resource.releaseCancelled(f.view,'FILE')).toThrow()
 f.view.discardPendingChanges(['FILE']);f.resource.releaseCancelled(f.view,'FILE')
 expect(f.upload.uploadBinaryVersion).not.toHaveBeenCalled()
})
it('withdraws an ACK proof when its original receipt row is replaced',async()=>{
 const f=await fixture();await f.save();const proof=f.resource.fileInput(f.view,'FILE')
 await f.view.refresh();expect(proof.assertCurrent).toThrow()
})
