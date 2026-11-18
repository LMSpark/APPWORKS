/**
 * @module app:services/smart-bid/content/review/submission-zip-inventory
 * 职责：在内存中读取递交原包的 ZIP 成员，按调用方批准的核验预算限制枚举。
 */
import {Uint8ArrayReader,ZipReader} from '@zip.js/zip.js'

type ZipInventoryLimits=Readonly<{maxEntries:number;maxExpandedBytes:number}>

/** 保留原成员路径，仅在完整读取并校验 ZIP 后交回成员。 */
export async function readSubmissionZipInventory(bytes:ArrayBuffer,limits:ZipInventoryLimits){
 const {maxEntries,maxExpandedBytes}=limits
 if(![maxEntries,maxExpandedBytes].every(value=>Number.isSafeInteger(value)&&value>0))
  throw Error('SUBMISSION_ZIP_LIMIT')
 const reader=new ZipReader(new Uint8ArrayReader(new Uint8Array(bytes)),{
  strictness:'strict',checkCrc32:true,checkOverlappingEntry:true,useWebWorkers:false,
 })
 let count=0,expandedBytes=0
 const paths=new Set<string>()
 const members:Array<Readonly<{position:string;bytes:ArrayBuffer}>>=[]
 try{
  for await(const entry of reader.getEntriesGenerator()){
   count+=1
   if(count>maxEntries)throw Error('SUBMISSION_ZIP_LIMIT')
   const position=entry.filename
   const path=entry.directory?position.replace(/\/$/u,''):position
   if(paths.has(path)||path.includes('\\')||path.includes('\0')||
    path.split('/').some(part=>part===''||part==='.'||part==='..'))
    throw Error('SUBMISSION_ZIP_PATH')
   paths.add(path)
   if(entry.encrypted)throw Error('SUBMISSION_ZIP_ENCRYPTED')
   if(!Number.isSafeInteger(entry.uncompressedSize)||entry.uncompressedSize<0||
    entry.uncompressedSize>maxExpandedBytes-expandedBytes)
    throw Error('SUBMISSION_ZIP_LIMIT')
   if(entry.directory){
    if(entry.uncompressedSize!==0)throw Error('SUBMISSION_ZIP_SIZE')
    continue
   }
   const chunks:Array<Uint8Array<ArrayBuffer>>=[]
   let memberBytes=0
   await entry.getData(new WritableStream<Uint8Array>({
    write(chunk){
     memberBytes+=chunk.byteLength
     expandedBytes+=chunk.byteLength
     if(memberBytes>entry.uncompressedSize||expandedBytes>maxExpandedBytes)
      throw Error('SUBMISSION_ZIP_LIMIT')
     chunks.push(Uint8Array.from(chunk))
    },
   }))
   if(memberBytes!==entry.uncompressedSize)throw Error('SUBMISSION_ZIP_SIZE')
   members.push(Object.freeze({position,bytes:await new Blob(chunks).arrayBuffer()}))
  }
  return Object.freeze({complete:true,members:Object.freeze(members)})
 }finally{
  await reader.close()
 }
}
