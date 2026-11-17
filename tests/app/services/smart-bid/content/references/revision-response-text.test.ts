import {expect,it} from 'vitest'
import {assertRevisionResponseText} from '@/services/smart-bid/content/references/revision-response-text'

it('preserves independent text, decimal strings, zero and false without expanding display values',()=>{
 const response={statement:'报价{{金额}}元，确认{{同意}}',data:{金额:{type:'number',number:'0.00',unit:'元'},同意:{type:'bool',bool:false}}}
 expect(()=>assertRevisionResponseText([response],[])).not.toThrow()
 expect(response.data.金额.number).toBe('0.00');expect(response.data.同意.bool).toBe(false)
})
it.each([{statement:'{{missing}}',data:{}},{statement:'plain',data:{unused:{type:'bool',bool:false}}},{statement:'{{half',data:{}}])(
 'rejects missing, unused and malformed placeholders %j',response=>{
 expect(()=>assertRevisionResponseText([response],[])).toThrow('SNAPSHOT_RESPONSE_PLACEHOLDER')
})
it('checks field reference shape and exact internal node membership',()=>{
 expect(()=>assertRevisionResponseText([{statement:'{{金额}}',data:{金额:{type:'number',number:10,unit:'元'}}}],[])).toThrow('SNAPSHOT_RESPONSE_REFERENCE')
 expect(()=>assertRevisionResponseText([{statement:'{{see}}',data:{see:{type:'xref',nodeId:'D',show:'title'}}}],['D'])).not.toThrow()
 expect(()=>assertRevisionResponseText([{statement:'{{see}}',data:{see:{type:'page',nodeId:'missing'}}}],['D'])).toThrow('SNAPSHOT_RESPONSE_LINK')
})
it('refuses a second editable body or binding source for chapter responses',()=>{
 expect(()=>assertRevisionResponseText([{chapterId:'C'}],[])).not.toThrow()
 expect(()=>assertRevisionResponseText([{chapterId:'C',statement:'',data:{}}],[])).not.toThrow()
 expect(()=>assertRevisionResponseText([{chapterId:'C',statement:'duplicate'}],[])).toThrow('SNAPSHOT_RESPONSE_BODY_COPY')
 expect(()=>assertRevisionResponseText([{chapterId:'C',data:{copy:{type:'bool',bool:false}}}],[])).toThrow('SNAPSHOT_RESPONSE_BODY_COPY')
})
it('rejects missing independent text/data, invalid Unicode and getters without executing them',()=>{
 for(const response of [{statement:'text'},{statement:1,data:{}},{statement:'\ud800',data:{}}])
  expect(()=>assertRevisionResponseText([response],[])).toThrow('SNAPSHOT_RESPONSE_TEXT')
 let invoked=false
 const response={statement:'text'};Object.defineProperty(response,'data',{enumerable:true,get(){invoked=true;return {}}})
 expect(()=>assertRevisionResponseText([response],[])).toThrow();expect(invoked).toBe(false)
})
