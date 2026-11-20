import {expect,it} from 'vitest'
import {PdfInspectionRecoveryJournal} from './recovery-journal'

function fixture(){
 const values=new Map<string,string>(),flags={writeThenFailRead:false,failRead:false,failRemoveRead:false},calls={writes:0}
 const storage={get length(){return values.size},key:(index:number)=>[...values.keys()][index]??null,
  getItem:(key:string)=>{if(flags.failRead)throw Error('read unavailable');return values.get(key)??null},
  setItem:(key:string,value:string)=>{calls.writes++;values.set(key,value);if(flags.writeThenFailRead)flags.failRead=true},
  removeItem:(key:string)=>{values.delete(key);if(flags.failRemoveRead)flags.failRead=true}}
 const owner={enterpriseId:'TENANT',enterpriseShortName:'tenant',actorId:'ACTOR',applicationId:'APP',scenarioId:'PDF'}
 const journal=new PdfInspectionRecoveryJournal({storage,owner,resolveUrl:requestId=>`/app/pdf?pdfInspectionRequestId=${requestId}`})
 return{journal,values,flags,calls,storage,owner}
}

it('keeps only minimal original request pointers and isolates each owner and request',()=>{
 const f=fixture(),first=f.journal.begin('REQ_A'),second=f.journal.begin('REQ_B')
 expect(first).toEqual({version:1,requestId:'REQ_A',recoveryUrl:'/app/pdf?pdfInspectionRequestId=REQ_A'})
 expect(f.journal.pending()).toEqual([first,second]);expect(f.values.size).toBe(2)
 const other=new PdfInspectionRecoveryJournal({storage:f.storage,owner:{...f.owner,actorId:'OTHER'},resolveUrl:id=>`/app/pdf?pdfInspectionRequestId=${id}`})
 expect(other.pending()).toEqual([])
})
it('retains the original capture after a successful write followed by a failed read',()=>{
 const f=fixture();f.flags.writeThenFailRead=true
 const capture=f.journal.begin('REQ')
 expect(capture.requestId).toBe('REQ');expect(f.calls.writes).toBe(1)
 expect(()=>f.journal.assertCurrent(capture)).toThrow('read unavailable')
 f.flags.failRead=false;f.journal.assertCurrent(capture)
 expect(f.calls.writes).toBe(1)
})
it('never overwrites a prior original request or removes a changed pointer',()=>{
 const f=fixture(),capture=f.journal.begin('REQ'),key=[...f.values.keys()][0]!
 expect(()=>f.journal.begin('REQ')).toThrow('PDF_RECOVERY_PENDING')
 f.values.set(key,JSON.stringify({...capture,recoveryUrl:'/app/changed?pdfInspectionRequestId=REQ'}))
 expect(()=>f.journal.settle(capture)).toThrow('PDF_RECOVERY_CHANGED')
 expect(f.values.has(key)).toBe(true);expect(f.calls.writes).toBe(1)
})
it('allows a read-only cleanup confirmation after removal succeeded but its read failed',()=>{
 const f=fixture(),capture=f.journal.begin('REQ');f.flags.failRemoveRead=true
 expect(()=>f.journal.settle(capture)).toThrow('read unavailable')
 expect(f.values.size).toBe(0)
 f.flags.failRead=false;f.journal.settle(capture)
 expect(f.calls.writes).toBe(1)
})
it.each(['/app/pdf?pdfInspectionRequestId=OTHER','//other.example/pdf?pdfInspectionRequestId=REQ','https://other.example/pdf?pdfInspectionRequestId=REQ','/app/pdf?pdfInspectionRequestId=REQ&token=secret'])('rejects an unsafe or mismatched recovery URL before storage (%s)',recoveryUrl=>{
 const f=fixture(),journal=new PdfInspectionRecoveryJournal({storage:f.storage,owner:f.owner,resolveUrl:()=>recoveryUrl})
 expect(()=>journal.begin('REQ')).toThrow('PDF_RECOVERY_URL')
 expect(f.calls.writes).toBe(0)
})
