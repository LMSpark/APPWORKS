import {createHash} from 'node:crypto'
import {expect,it} from 'vitest'
import {verifyContentTextSpan} from '@/services/smart-bid/content/content-text-span'

const digest=(value:string)=>createHash('sha256').update(value,'utf8').digest('hex')
const owner={kind:'NODE' as const,nodeId:'N'}
const object=(value:string,data:Record<string,unknown>={})=>({nodeId:'N',parentId:'P',index:0,type:'paragraph',class:[],value,data})
const ref=(text:string,start=0,end=text.length)=>({schemaVersion:2,projectId:'P',revisionId:'R',owner,path:'/value',start,end,unit:'utf16',textDigest:digest(text.slice(start,end))})
const command=(value:string)=>({projectId:'P',revisionId:'R',owner,object:object(value),reference:ref(value),mode:'TEXT' as const})
it('hashes exact original whitespace, line endings and decomposed Unicode',async()=>{
 const value=' e\u0301\r\n😀 '
 const result=await verifyContentTextSpan(command(value))
 expect(result.text).toBe(value)
 expect(result.reference.textDigest).toBe(digest(value))
 expect(result.requiresCurrentAuthorityChecks).toBe(true)
 await expect(verifyContentTextSpan({...command(value),reference:{...ref(value),textDigest:digest(value.normalize('NFC'))}})).rejects.toThrow('DIGEST')
})
it('preserves explicit coordinates when identical sentences occur twice',async()=>{
 const value='相同。相同。'
 const result=await verifyContentTextSpan({...command(value),reference:ref(value,3,6)})
 expect(result.reference.start).toBe(3)
 expect(result.text).toBe('相同。')
})
it('rejects stale revision, project or owner rather than searching another object',async()=>{
 for(const patch of [{revisionId:'OLD'},{projectId:'OTHER'},{owner:{kind:'NODE',nodeId:'other'}}]){
  await expect(verifyContentTextSpan({...command('文字'),reference:{...ref('文字'),...patch}})).rejects.toThrow()
 }
})
it('rejects split surrogate pairs and invalid original Unicode',async()=>{
 const value='甲😀乙'
 await expect(verifyContentTextSpan({...command(value),reference:ref(value,1,2)})).rejects.toThrow('BOUNDARY')
 await expect(verifyContentTextSpan(command('\uD800'))).rejects.toThrow('UNICODE')
})
it('distinguishes an explicit zero-width insertion from an ordinary empty selection',async()=>{
 const c={...command('文字'),reference:ref('文字',1,1)}
 await expect(verifyContentTextSpan(c)).rejects.toThrow('RANGE')
 expect((await verifyContentTextSpan({...c,mode:'INSERTION'})).text).toBe('')
})
it('rejects half placeholders and flags complete placeholders for binding checks',async()=>{
 const value='工期{{工期}}天',c={...command(value),object:object(value,{工期:{type:'fact',factId:'F'}})}
 await expect(verifyContentTextSpan({...c,reference:ref(value,3,6)})).rejects.toThrow('PLACEHOLDER_BOUNDARY')
 const result=await verifyContentTextSpan({...c,reference:ref(value,2,8)})
 expect(result.containsPlaceholders).toBe(true)
 expect(result.requiresFieldBindingChecks).toBe(true)
})
it('reads only canonical existing table cell paths',async()=>{
 const table={...object(''),type:'table',data:{header:['列'],rows:[[{value:'单元格',data:{}}]]}}
 const c={...command('单元格'),object:table,reference:{...ref('单元格'),path:'/data/rows/0/0/value'}}
 expect((await verifyContentTextSpan(c)).text).toBe('单元格')
 for(const path of ['/data/rows/00/0/value','/data/rows/1/0/value','/data/rows/0/0/data','/data/__proto__/value']){
  await expect(verifyContentTextSpan({...c,reference:{...c.reference,path}})).rejects.toThrow()
 }
})
it('supports independent responses without inventing a node',async()=>{
 const responseOwner={kind:'RESPONSE' as const,assignmentId:'A',responseId:'V'}
 const c={...command('答复'),owner:responseOwner,object:{assignmentId:'A',responseId:'V',statement:'答复',data:{}},
  reference:{...ref('答复'),owner:responseOwner,path:'/statement'}}
 expect((await verifyContentTextSpan(c)).text).toBe('答复')
 await expect(verifyContentTextSpan({...c,reference:{...c.reference,path:'/value'}})).rejects.toThrow('PATH')
})
it('does not execute reference accessors',async()=>{
 let reads=0
 const reference=ref('文字')
 Object.defineProperty(reference,'start',{enumerable:true,get(){reads++;return 0}})
 await expect(verifyContentTextSpan({...command('文字'),reference})).rejects.toThrow()
 expect(reads).toBe(0)
})
it('uses UTF16 positions for mixed Chinese, emoji and whole field references',async()=>{
 const value='我方💰报价{{总价}}元',c={...command(value),object:object(value,{总价:{type:'number',number:'0',unit:'元'}})}
 expect((await verifyContentTextSpan({...c,reference:ref(value,4,6)})).text).toBe('报价')
 await expect(verifyContentTextSpan({...c,reference:ref(value,2,3)})).rejects.toThrow('BOUNDARY')
})
it('keeps the captured reference and original string while hashing asynchronously',async()=>{
 const c=command('原文'),pending=verifyContentTextSpan(c)
 c.object.value='改后'
 c.reference.revisionId='OTHER'
 c.reference.start=1
 const result=await pending
 expect(result.text).toBe('原文')
 expect(result.reference.revisionId).toBe('R')
 expect(result.reference.start).toBe(0)
})
it('creates a V2 reference directly from a fixed text selection',async()=>{
 const {captureContentTextSpan}=await import('@/services/smart-bid/content/content-text-span')
 const payload={nodeId:'N',parentId:'C',index:1,type:'paragraph',value:'甲😀乙',class:[],data:{}}
 const selection={projectId:'P',revisionId:'V',owner:{kind:'NODE' as const,nodeId:'N'},object:payload,path:'/value',start:1,end:3,mode:'TEXT' as const}
 const result=await captureContentTextSpan(selection)
 expect(result.text).toBe('😀')
 expect(result.reference).toMatchObject({start:1,end:3,unit:'utf16',revisionId:'V'})
 await expect(captureContentTextSpan({...selection,end:2})).rejects.toThrow('CONTENT_SPAN_BOUNDARY')
})
