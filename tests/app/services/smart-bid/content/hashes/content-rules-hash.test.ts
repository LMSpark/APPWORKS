import {expect,it} from 'vitest'
import {hashContentRules} from '@/services/smart-bid/content/hashes/content-rules-hash'

const node={nodeId:'N',documentId:'D',role:'RESPONSE',deliverable:true}
const document={documentId:'D',restrictions:[{kind:'page-limit',maximum:30}]}
const input={scope:[{nodeId:'N',documentId:'D'}],nodes:[node],documents:[document]}

it('includes role, deliverability and fixed document restrictions independently',async()=>{
 const hashes=await Promise.all([
  hashContentRules(input),
  hashContentRules({...input,nodes:[{...node,role:'GENERAL'}]}),
  hashContentRules({...input,nodes:[{...node,deliverable:false}]}),
  hashContentRules({...input,documents:[{...document,restrictions:[{kind:'page-limit',maximum:25}]}]}),
 ])
 expect(new Set(hashes).size).toBe(4)
})

it('requires all applicable rules and excludes style fields from the contract',async()=>{
 await expect(hashContentRules({...input,documents:[]})).rejects.toThrow('CONTENT_RULES_SCOPE')
 await expect(hashContentRules({...input,nodes:[{...node,documentId:'OTHER'}]})).rejects.toThrow('CONTENT_RULES_SCOPE')
 await expect(hashContentRules({...input,scope:[...input.scope,{nodeId:'M',documentId:'OTHER'}],
  nodes:[{...node,documentId:'OTHER'},{...node,nodeId:'M',documentId:'D'}],
  documents:[document,{...document,documentId:'OTHER'}]})).rejects.toThrow('CONTENT_RULES_SCOPE')
 await expect(hashContentRules({...input,nodes:[{...node,style:{fontSize:14}}]})).rejects.toThrow('CONTENT_RULES_MODEL')
})
