import {createHash} from 'node:crypto'
import {BlobWriter,TextReader,ZipWriter} from '@zip.js/zip.js'
import {expect,it,vi} from 'vitest'
import {readFrozenDeliveryZipPackageMembers,readSubmissionZipPackageMembers} from '@/views/features/application/smart-bid/authoring/model/review/content-package-review'
import {computeDeliverySelectionDigests} from '@/services/smart-bid/content/review/delivery-selection-digest'

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
 const frozen={requestKey:'Q',requestDigest:'b'.repeat(64),selectionId:'SET',selectionVersion:'S2',expectedSelectionVersion:'S1',
  groupScope:{enterpriseId:'ORG',projectId:'P',lotId:'L',roundId:'R',stageId:'D',obligationGroupId:'G'},
  targetBasisRefs:['A2'],compatibilityRefs:['READBACK'],checkedStateRefs:['COVERAGE'],
  members:[{...record,manifestId:'M',manifestVersion:'V2'},{...record,position:'独立另封.txt',manifestId:'M2',manifestVersion:'V1'}]}
 const digests=await computeDeliverySelectionDigests(frozen)
 let current=true
 const original={record:{...frozen,...digests},assertCurrent:()=>{if(!current)throw Error('FROZEN_STALE')}}
 const reopen=vi.fn(source.reopen)
 const pack={...source,reopen,selectionId:'SET',selectionVersion:'S2',selectionHash:digests.selectionHash,requiredPositions:[position]}
 const linked=await readFrozenDeliveryZipPackageMembers(pack,original,limits)
 expect(linked).toMatchObject({selectionId:'SET',selectionVersion:'S2',membershipMatches:true})
 expect(linked.members).toHaveLength(1)
 await expect(readFrozenDeliveryZipPackageMembers({...pack,selectionVersion:'S1'},original,limits))
  .rejects.toThrow('SUBMISSION_FROZEN_SELECTION_SCOPE')
 await expect(readFrozenDeliveryZipPackageMembers(pack,{...original,record:{...original.record,targetBasisRefs:['A3']}},limits))
  .rejects.toThrow('DELIVERY_SELECTION_HASH_MISMATCH')
 expect(reopen).toHaveBeenCalledOnce()
 current=false
 expect(()=>linked.assertCurrent()).toThrow('FROZEN_STALE')
})
