import {afterEach,expect,it,vi} from 'vitest'
import {defineComponent,h,ref} from 'vue'
import {mount,type VueWrapper} from '@vue/test-utils'
import * as Components from '@spark-appworks/spark-component'
import {PageRuntime,ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import type {HttpResponse,RequestConfig} from '@spark-appworks/spark-utils'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'
import {ApiBackend} from '../page/api-provider/api-provider.fixture'
import {buildFormalModels} from '../page/structured-config/catalog/structured-config-catalog.fixture'
class Backend extends ApiBackend{
 rejectNext=false
 protected override async executeRequest(request:RequestConfig):Promise<HttpResponse<unknown>>{
  if(this.rejectNext&&request.url==='/api/DataOperation/BatchTableOperateRequestByCRUD'){
   this.rejectNext=false;return{data:{Code:500,Message:'Rejected before write',Result:null},status:200,statusText:'OK',headers:{}}
  }
  return super.executeRequest(request)
 }
}
const dispose:Array<()=>void>=[]
afterEach(()=>dispose.splice(0).reverse().forEach(fn=>fn()))
async function fixture(){
 const http=new Backend();http.records={Records:[{rowid:'A',caption:'base',extra:'original'},{rowid:'B',caption:'other',extra:'other'}]}
 const models=buildFormalModels({Records:['rowid','caption','extra']})
 const config=new ScenarioViewConfig('EDIT',JSON.stringify({scenarioId:'EDIT',tables:{Records:{modelBinding:{modelId:'Records-model',modelName:'Records'},views:{default:{commitMode:'staged',queryConfig:{fields:['rowid','caption','extra'],allPages:true}}}}}}))
 const api=new DataSpaceRuntimeApi({http,readScope:()=>({token:'scope',headers:{'X-AppId':'APP'}})})
 const ds=new LowcodeDataSpaceAssembler(api,http).assemble({config,space:{dataSpaceId:'EDIT',name:'Edit'},models,relations:[]}).dataSet
 const runtime=new PageRuntime({pageId:'record-edit-test',scenarioIds:['EDIT'],loadScenario:async()=>ds});await runtime.load()
 const view=ds.getView('Records')!;await view.refresh();dispose.push(()=>runtime.dispose())
 return{http,ds,runtime,view}
}
function editor(f:Awaited<ReturnType<typeof fixture>>,created=false,initialId='A'){
 const id=ref<string|number>(initialId),key=ref('EDIT@Records@default'),pending=ref(false),finished:string[]=[]
 let state!:ReturnType<typeof Components.useDataViewRecordEditing>
 const Host=defineComponent({setup(){state=Components.useDataViewRecordEditing({mode:'edit',runtime:()=>f.runtime,dataViewKey:()=>key.value,recordId:()=>id.value,editableFields:['caption'],created:()=>created,pendingInputs:()=>pending.value,onFinish:result=>finished.push(result)});return()=>h('div')}})
 const wrapper:VueWrapper=mount(Host);dispose.push(()=>wrapper.unmount())
 return{state,wrapper,id,key,pending,finished}
}
function operation(f:Awaited<ReturnType<typeof fixture>>,mode:'pending'|'delete'){
 let state!:ReturnType<typeof Components.useDataViewRecordEditing>;const finished:string[]=[]
 const Host=defineComponent({setup(){state=Components.useDataViewRecordEditing({mode,runtime:()=>f.runtime,dataViewKey:()=> 'EDIT@Records@default',recordId:()=> 'A',onFinish:result=>finished.push(result)});return()=>h('div')}})
 const wrapper=mount(Host);dispose.push(()=>wrapper.unmount());return{state,finished}
}
it('cancels a delete confirmation with zero writes and no staged deletion',async()=>{
 const f=await fixture(),e=operation(f,'delete');e.state.cancel()
 expect(e.finished).toEqual(['cancelled']);expect(f.http.saves).toHaveLength(0);expect(f.view.rows).toHaveLength(2)
})
it('retries the same known failed delete without staging a second removal',async()=>{
 const f=await fixture(),remove=vi.spyOn(f.view,'removeRow'),e=operation(f,'delete');f.http.rejectNext=true
 await e.state.save();expect(remove).toHaveBeenCalledTimes(1);expect(f.view.dirtyTracking.isPendingDelete('A')).toBe(true)
 await e.state.save();expect(remove).toHaveBeenCalledTimes(1);expect(f.http.saves[0]?.deleted).toMatchObject([{rowid:'A'}]);expect(e.finished).toEqual(['saved'])
})
it('explicitly discards only the chosen original pending row',async()=>{
 const f=await fixture();await f.view.editRowById('A',{caption:'pending A'});await f.view.editRowById('B',{caption:'pending B'})
 const e=operation(f,'pending');e.state.discard()
 expect(f.view.dirtyTracking.hasPendingChanges('A')).toBe(false);expect(f.view.dirtyTracking.hasPendingChanges('B')).toBe(true);expect(f.http.saves).toHaveLength(0)
})
it('refuses pending submission after a new editing patch appears',async()=>{
 const f=await fixture();await f.view.editRowById('A',{caption:'pending'});const e=operation(f,'pending')
 f.view.updateEditingValue('A','extra','new patch');await e.state.save();e.state.discard()
 expect(f.http.saves).toHaveLength(0);expect(f.view.dirtyTracking.hasPendingChanges('A')).toBe(true);expect(f.view.hasEditingChanges('A')).toBe(true)
})
it('saves only the expressly chosen pending row without applying another editing patch',async()=>{
 const f=await fixture();await f.view.editRowById('A',{caption:'pending A'});f.view.updateEditingValue('B','caption','keep B')
 const e=operation(f,'pending');await e.state.save()
 expect(e.finished).toEqual(['saved']);expect(f.http.saves).toHaveLength(1)
 expect(f.http.saves[0]?.changed).toMatchObject([{rowid:'A',caption:'pending A'}]);expect(f.view.hasEditingChanges('B')).toBe(true)
})
it('refuses a replacement deletion snapshot with the same primary key',async()=>{
 const f=await fixture(),e=operation(f,'delete');f.http.rejectNext=true;await e.state.save()
 f.view.discardPendingChanges(['A']);await f.view.removeRow('A');await e.state.save();e.state.cancel()
 expect(f.http.saves).toHaveLength(0);expect(f.view.dirtyTracking.isPendingDelete('A')).toBe(true);expect(e.finished).toEqual(['preserved'])
})
it('does not adopt a restaged update even when its visible values are identical',async()=>{
 const f=await fixture();await f.view.editRowById('A',{caption:'same'});const e=operation(f,'pending')
 f.view.discardPendingChanges(['A']);await f.view.editRowById('A',{caption:'same'});await e.state.save();e.state.discard()
 expect(f.http.saves).toHaveLength(0);expect(f.view.dirtyTracking.hasPendingChanges('A')).toBe(true);expect(e.finished).toEqual([])
})
it('distinguishes a missing property from an explicitly undefined native value',async()=>{
 const f=await fixture();await f.view.editRowById('A',{caption:'pending'});const raw=f.view.rows.find(row=>row['rowid']==='A')!
 delete raw['extra'];const e=operation(f,'pending');raw['extra']=undefined
 await e.state.save();e.state.discard()
 expect(f.http.saves).toHaveLength(0);expect(f.view.dirtyTracking.hasPendingChanges('A')).toBe(true);expect(e.finished).toEqual([])
})
it('distinguishes NaN from null when checking original pending values',async()=>{
 const f=await fixture();await f.view.editRowById('A',{caption:'pending'});const raw=f.view.rows.find(row=>row['rowid']==='A')!
 raw['extra']=NaN;const e=operation(f,'pending');raw['extra']=null
 await e.state.save();e.state.discard()
 expect(f.http.saves).toHaveLength(0);expect(f.view.dirtyTracking.hasPendingChanges('A')).toBe(true)
})
it('refuses a field that becomes persistent after the pending operation opened',async()=>{
 const f=await fixture(),columns=f.view.columns;let computed=true
 vi.spyOn(f.view,'columns','get').mockImplementation(()=>columns.map(column=>column.name==='extra'?{...column,isComputed:computed}:column))
 await f.view.editRowById('A',{caption:'pending'});const e=operation(f,'pending');computed=false
 await e.state.save();e.state.discard()
 expect(f.http.saves).toHaveLength(0);expect(f.view.dirtyTracking.hasPendingChanges('A')).toBe(true);expect(e.finished).toEqual([])
})
it('verifies its original delete once without replaying the deletion',async()=>{
 const f=await fixture(),e=operation(f,'delete');f.http.failAfterWrite=true;await e.state.save()
 expect(e.state.ownUnconfirmed.value).toBe(true);e.state.cancel();expect(e.finished).toEqual([])
 await e.state.save();expect(e.finished).toEqual(['saved']);expect(f.http.saves).toHaveLength(1)
})
it('restores the original staged deletion when a known failed delete is explicitly cancelled',async()=>{
 const f=await fixture(),e=operation(f,'delete');f.http.rejectNext=true;await e.state.save();e.state.cancel()
 expect(e.finished).toEqual(['cancelled']);expect(f.view.rows.map(row=>row['rowid'])).toContain('A');expect(f.view.dirtyTracking.hasPendingChanges('A')).toBe(false)
})
it('restores only checkpoint fields and keeps edits outside its scope without writing',async()=>{
 const f=await fixture();f.view.updateEditingValue('A','caption','opening draft');const e=editor(f)
 f.view.updateEditingValue('A','caption','changed');f.view.updateEditingValue('A','extra','keep')
 e.state.cancel();expect(e.finished).toEqual(['cancelled'])
 expect(f.view.getEditingRow('A')).toMatchObject({caption:'opening draft',extra:'keep'});expect(f.http.saves).toHaveLength(0)
})
it('submits only its original ID and leaves another row editing untouched',async()=>{
 const f=await fixture(),e=editor(f);f.view.updateEditingValue('A','caption','saved');f.view.updateEditingValue('B','caption','not submitted')
 await e.state.save();expect(e.finished).toEqual(['saved']);expect(f.http.saves).toHaveLength(1)
 expect(f.http.saves[0]?.changed).toMatchObject([{rowid:'A',caption:'saved'}]);expect(f.view.hasEditingChanges('B')).toBe(true)
})
it('saves all original row changes rather than treating checkpoint fields as a write whitelist',async()=>{
 const f=await fixture(),e=editor(f)
 f.view.updateEditingValue('A','caption','saved');f.view.updateEditingValue('A','extra','also saved')
 await e.state.save()
 expect(e.finished).toEqual(['saved']);expect(f.http.saves).toHaveLength(1)
 expect(f.http.saves[0]?.changed).toMatchObject([{rowid:'A',caption:'saved',extra:'also saved'}])
})
it('verifies its own unknown capture without applying later edits or replaying writes',async()=>{
 const f=await fixture(),e=editor(f);f.view.updateEditingValue('A','caption','once');f.http.failAfterWrite=true
 await e.state.save();expect(e.state.ownUnconfirmed.value).toBe(true);e.state.cancel();expect(e.finished).toEqual([])
 await e.state.save();expect(f.http.saves).toHaveLength(1);expect(e.finished).toEqual(['saved'])
})
it('does not take over another ID unknown and closes preserving its own draft',async()=>{
 const f=await fixture(),e=editor(f);f.view.updateEditingValue('A','caption','keep');f.view.updateEditingValue('B','caption','other once');f.http.failAfterWrite=true
 await expect(f.ds.saveChanges({views:[{tableName:'Records',viewId:'default',ids:['B']}]})).rejects.toThrow()
 expect(e.state.foreignRecovery.value).toBe(true);await e.state.save();e.state.cancel()
 expect(e.finished).toEqual(['preserved']);expect(f.view.hasUnconfirmedSaveFor(['B'])).toBe(true);expect(f.http.saves).toHaveLength(1)
 expect(f.view.getEditingRow('A')?.['caption']).toBe('keep')
})
it('does not verify its original unknown after the caller changes record identity',async()=>{
 const f=await fixture(),e=editor(f);f.view.updateEditingValue('A','caption','once');f.http.failAfterWrite=true
 await e.state.save();expect(e.state.ownUnconfirmed.value).toBe(true)
 const reads=f.http.reads.length;e.id.value='B';await e.state.save()
 expect(f.http.reads).toHaveLength(reads);expect(f.http.saves).toHaveLength(1)
 expect(f.view.hasUnconfirmedSaveFor(['A'])).toBe(true);expect(e.finished).toEqual([])
})
it('does not read saved creation permissions after its original query context changes',async()=>{
 const f=await fixture();await f.view.addRowWithIdentity({field:'rowid',value:'C'},{caption:'new',extra:'original'})
 const e=editor(f,true,'C')
 f.http.interceptors.request.use({onRequest:request=>{
  if(request.url==='/api/DataOperation/GetData'&&JSON.stringify(request.data).includes('"C"'))request.data=JSON.parse(JSON.stringify(request.data).replaceAll('"C"','"ABSENT"'))
  return request
 }})
 await e.state.save();expect(e.state.permissionsPending.value).toBe(true);expect(f.http.saves).toHaveLength(1)
 const reads=f.http.reads.length;f.view.queryContext={target:'changed'};await e.state.save()
 expect(f.http.reads).toHaveLength(reads);expect(f.http.saves).toHaveLength(1)
 expect(f.view.hasPendingSavedRowPermissions).toBe(true);expect(e.finished).toEqual([])
})
it('invalidates a same-ID replacement and does not restore its old checkpoint onto it',async()=>{
 const f=await fixture(),e=editor(f);f.view.discardEditingRows(['A']);await f.view.refresh();f.view.updateEditingValue('A','caption','new row draft')
 expect(e.state.current.value).toBe(false);await e.state.save();e.state.cancel()
 expect(f.http.saves).toHaveLength(0);expect(e.finished).toEqual(['preserved']);expect(f.view.getEditingRow('A')?.['caption']).toBe('new row draft')
})
it('invalidates changed input identity without following the new record',async()=>{
 const f=await fixture(),e=editor(f);e.id.value='B';await e.state.save()
 expect(e.state.current.value).toBe(false);expect(f.http.saves).toHaveLength(0)
})
it('keeps known applied failure pending until the original host explicitly handles it',async()=>{
 const f=await fixture(),e=editor(f);f.view.updateEditingValue('A','caption','pending');f.http.rejectNext=true
 await e.state.save();expect(f.view.hasUnconfirmedSave).toBe(false);expect(f.view.dirtyTracking.hasPendingChanges('A')).toBe(true)
 e.state.cancel();expect(e.finished).toEqual(['preserved']);e.wrapper.unmount()
 expect(()=>editor(f)).toThrow('RECORD_EDIT_PENDING')
 f.view.discardPendingChanges(['A']);const reopened=editor(f);expect(reopened.state.current.value).toBe(true)
})
it('does not save an unfinished control input',async()=>{
 const f=await fixture(),e=editor(f);e.pending.value=true;f.view.updateEditingValue('A','caption','held')
 await e.state.save();expect(f.http.saves).toHaveLength(0);expect(e.finished).toEqual([])
})
it('releases UI listeners without cancelling an already dispatched original save',async()=>{
 const f=await fixture(),e=editor(f);let entered=false,release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve})
 f.http.beforeSave=async()=>{entered=true;await gate};f.view.updateEditingValue('A','caption','late confirmed')
 const saving=e.state.save();await vi.waitFor(()=>expect(entered).toBe(true));e.wrapper.unmount();release();await saving
 expect(f.http.saves).toHaveLength(1);expect(e.finished).toEqual([]);expect(f.http.records['Records']![0]?.['caption']).toBe('late confirmed')
})
