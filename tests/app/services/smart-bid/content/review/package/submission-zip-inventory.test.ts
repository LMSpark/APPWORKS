import {createHash} from 'node:crypto'
import {BlobWriter,TextReader,ZipWriter} from '@zip.js/zip.js'
import {expect,it} from 'vitest'
import {readSubmissionZipPackageMembers} from '@/views/features/application/smart-bid/authoring/model/review/content-package-review'

it('checks the original ZIP and its exact member paths within the requested reading budget',async()=>{
 const writer=new ZipWriter(new BlobWriter(),{useWebWorkers:false})
 const position='商务/投标函.txt'
 const content='投标函'
 await writer.add('商务/',undefined,{directory:true})
 await writer.add(position,new TextReader(content))
 const bytes=await (await writer.close()).arrayBuffer()
 const fileHash=createHash('sha256').update(content).digest('hex')
 const record={position,fileVersionId:'V1',fileHash}
 const source={projectId:'P',packageId:'PKG',packageHash:createHash('sha256').update(new Uint8Array(bytes)).digest('hex'),
  expected:[record],packed:[record],reopen:async()=>bytes,assertCurrent:()=>{}}
 const limits={maxEntries:2,maxExpandedBytes:128}
 const result=await readSubmissionZipPackageMembers(source,limits)
 expect(result.membershipMatches).toBe(true)
 expect(result.members).toMatchObject([{position,observedHash:fileHash}])
 await expect(readSubmissionZipPackageMembers(source,{...limits,maxEntries:1})).rejects.toThrow('SUBMISSION_ZIP_LIMIT')
 await expect(readSubmissionZipPackageMembers(source,{...limits,maxExpandedBytes:1})).rejects.toThrow('SUBMISSION_ZIP_LIMIT')
})
