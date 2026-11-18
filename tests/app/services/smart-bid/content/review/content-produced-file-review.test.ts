import {expect,it,vi} from 'vitest'
import {createHash} from 'node:crypto'
import {readProducedFileReviewVersion} from '@/views/features/application/smart-bid/authoring/model/review/content-produced-file-review'

it('reopens exactly the fixed production output and independently verifies its bytes',async()=>{
 const selection={projectId:'P',producedFileId:'FILE',productionRequestRef:'REQUEST'}
 const bytes=new TextEncoder().encode('标书实件')
 const fileHash=createHash('sha256').update(bytes).digest('hex')
 let current=true
 const original={...selection,revisionId:'R',documentId:'D',fileHash,
  assertCurrent:()=>{if(!current)throw Error('PRODUCTION_STALE')},reopen:vi.fn(async()=>bytes.buffer)}
 const verified=await readProducedFileReviewVersion(selection,async input=>{expect(input).toEqual(selection);return original})
 expect(verified).toMatchObject({revisionId:'R',documentId:'D',versionHash:fileHash})
 await expect(readProducedFileReviewVersion(selection,async()=>({...original,productionRequestRef:'OTHER'})))
  .rejects.toThrow('CONTENT_PRODUCED_FILE_SCOPE')
 expect(original.reopen).toHaveBeenCalledOnce()
 await expect(readProducedFileReviewVersion(selection,async()=>({...original,reopen:async()=>new TextEncoder().encode('异版').buffer})))
  .rejects.toThrow('CONTENT_PRODUCED_FILE_HASH_MISMATCH')
 current=false
 expect(()=>verified.assertCurrent()).toThrow('PRODUCTION_STALE')
})
