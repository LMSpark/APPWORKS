import {expect,it} from 'vitest'
import {assertRevisionTemplateBindings} from '@/services/smart-bid/content/revision-template-bindings'

const nodes=[{nodeId:'D',type:'document'},{nodeId:'OTHER',type:'document'},{nodeId:'H',type:'heading'}]
const reference={documentId:'D',key:'enterprise-template',version:'v1',hash:'a'.repeat(64)}
it('allows no selected template during editing and shared fixed templates on separate documents',()=>{
 expect(()=>assertRevisionTemplateBindings([],nodes)).not.toThrow()
 expect(()=>assertRevisionTemplateBindings([reference,{...reference,documentId:'OTHER'}],nodes)).not.toThrow()
})
it.each([{documentId:'H'},{documentId:'missing'},{documentId:' D'}])('rejects a template target outside exact document identity: %j',change=>{
 expect(()=>assertRevisionTemplateBindings([{...reference,...change}],nodes)).toThrow('SNAPSHOT_TEMPLATE_DOCUMENT')
})
it.each([{key:''},{version:1},{version:' latest '},{hash:'A'.repeat(64)},{format:'docx'},{style:{font:'Arial'}}])(
 'rejects incomplete or format-contaminated reference shape: %j',change=>{
 expect(()=>assertRevisionTemplateBindings([{...reference,...change}],nodes)).toThrow('SNAPSHOT_TEMPLATE_MODEL')
})
it('rejects two bindings for one document and conflicting hashes for one key/version',()=>{
 expect(()=>assertRevisionTemplateBindings([reference,{...reference}],nodes)).toThrow('SNAPSHOT_TEMPLATE_DUPLICATE')
 expect(()=>assertRevisionTemplateBindings([reference,{...reference,documentId:'OTHER',hash:'b'.repeat(64)}],nodes)).toThrow('SNAPSHOT_TEMPLATE_VERSION')
})
it('keeps exact reference identities without Unicode normalization or version-number comparison',()=>{
 const exact={...reference,documentId:'e\u0301',key:'e\u0301',version:'release-A'}
 expect(()=>assertRevisionTemplateBindings([exact],[{nodeId:'e\u0301',type:'document'}])).not.toThrow()
 expect(()=>assertRevisionTemplateBindings([exact],[{nodeId:'é',type:'document'}])).toThrow('SNAPSHOT_TEMPLATE_DOCUMENT')
})
it('rejects accessors without invoking them and sparse arrays without filling gaps',()=>{
 let invoked=false
 const invalid={...reference};Object.defineProperty(invalid,'key',{enumerable:true,get(){invoked=true;return 'key'}})
 expect(()=>assertRevisionTemplateBindings([invalid],nodes)).toThrow('SNAPSHOT_TEMPLATE_MODEL');expect(invoked).toBe(false)
 expect(()=>assertRevisionTemplateBindings(new Array(1),nodes)).toThrow('SNAPSHOT_TEMPLATE_MODEL')
})
