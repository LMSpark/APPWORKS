import {expect,it,vi} from 'vitest'
import {hashContentBytes} from '@/services/smart-bid/content/revision-snapshot-hash'
import {verifyResourceOriginalFile} from '@/services/smart-bid/content/references/resource-use/resource-original-file'

it('presents only the registered original and keeps the file authorization current',async()=>{
 const bytes=Uint8Array.of(1,2,3).buffer
 const target={resourceId:'RESOURCE',resourceVersionId:'RESOURCE-V1',fileVersionId:'FILE-V1'}
 let authorized=true
 const assertCurrent=()=>{if(!authorized)throw Error('DENIED')}
 const registered={...target,byteLength:3,fileHash:await hashContentBytes(bytes),assertCurrent:()=>{}}
 const opened={...target,bytes,assertCurrent}
 const open=vi.fn(async()=>opened)
 const result=await verifyResourceOriginalFile(registered,open)
 expect(open).toHaveBeenCalledExactlyOnceWith(target)
 new Uint8Array(result.readBytes()).fill(0)
 expect([...new Uint8Array(result.readBytes())]).toEqual([1,2,3])
 await expect(verifyResourceOriginalFile(registered,async()=>({...opened,fileVersionId:'FILE-V2'})))
  .rejects.toThrow('BID_RESOURCE_ORIGINAL_VERSION')
 await expect(verifyResourceOriginalFile({...registered,byteLength:4},open)).rejects.toThrow('BID_RESOURCE_ORIGINAL_LENGTH')
 await expect(verifyResourceOriginalFile(registered,async()=>({...opened,bytes:Uint8Array.of(1,2,4).buffer})))
  .rejects.toThrow('BID_RESOURCE_ORIGINAL_HASH')
 authorized=false
 expect(()=>result.readBytes()).toThrow('DENIED')
})
