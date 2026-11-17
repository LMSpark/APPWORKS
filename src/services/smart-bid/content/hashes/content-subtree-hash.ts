/**
 * @module app:services/smart-bid/content/hashes/content-subtree-hash
 * 职责：按本版完整树的同级index组合已核nodeHash，计算可重建的子树摘要。
 * 边界：不证明输入nodeHash载荷，不计算rootHash/effectiveHash、不保存投影或授权。
 * AI用途：原完整节点读取器验证载荷后调用；摘要仅随原视图证明有效。
 */
import {validateContentTreeStructure,type ContentStructureNode} from '../../content-tree-structure'

/** 新派生投影的明确编码版本；无版本历史摘要不自动重算覆盖。 */
export const SUBTREE_HASH_CONTRACT='spark-bid.content-subtree/1' as const
/** 固定结构与已由调用方核对的节点摘要，不携带正文或样式。 */
export type ContentSubtreeInput=Readonly<{projectId:string;nodes:ReadonlyArray<ContentStructureNode&{nodeHash:string}>}>
/** 可重建摘要索引；原数据和查询证明仍归所属DataView。 */
export type ContentSubtreeHash=Readonly<{nodeId:string;subtreeHash:string}>
async function hash(nodeHash:string,children:readonly string[]):Promise<string>{
 const bytes=new TextEncoder().encode(JSON.stringify([SUBTREE_HASH_CONTRACT,nodeHash,children]))
 const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes)
 return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('')
}
/** 全部位置和摘要在await前捕获；逐层从叶到根计算，不把返回行序当同级顺序。 */
export async function hashContentSubtrees(input:ContentSubtreeInput):Promise<readonly ContentSubtreeHash[]>{
 const nodes=input.nodes.map(node=>({nodeId:node.nodeId,parentId:node.parentId,index:node.index,type:node.type,nodeHash:node.nodeHash}))
 const errors=validateContentTreeStructure({projectId:input.projectId,nodes})
 if(errors.length)throw Error(`CONTENT_SUBTREE_STRUCTURE:${errors.join(';')}`)
 if(nodes.some(node=>typeof node.nodeHash!=='string'||!/^[a-f0-9]{64}$/u.test(node.nodeHash)))throw Error('CONTENT_SUBTREE_NODE_HASH')
 const byId=new Map(nodes.map(node=>[node.nodeId,node])),children=new Map<string,typeof nodes>()
 for(const node of nodes){const siblings=children.get(node.parentId)??[];siblings.push(node);children.set(node.parentId,siblings)}
 children.forEach(siblings=>siblings.sort((a,b)=>a.index-b.index))
 const pending=new Map(nodes.map(node=>[node.nodeId,children.get(node.nodeId)?.length??0])),hashes=new Map<string,string>()
 let queue=nodes.filter(node=>pending.get(node.nodeId)===0).map(node=>node.nodeId)
 while(queue.length){
  const level=await Promise.all(queue.map(async nodeId=>{
   const node=byId.get(nodeId)
   if(!node)throw Error('CONTENT_SUBTREE_STRUCTURE')
   const childHashes=(children.get(nodeId)??[]).map(child=>{
    const value=hashes.get(child.nodeId)
    if(value===undefined)throw Error('CONTENT_SUBTREE_DEPENDENCY')
    return value
   })
   return {node,parentId:node.parentId,hash:await hash(node.nodeHash,childHashes)}
  }))
  queue=[]
  for(const result of level){
   hashes.set(result.node.nodeId,result.hash)
   const count=pending.get(result.parentId)
   if(count!==undefined){pending.set(result.parentId,count-1);if(count===1)queue.push(result.parentId)}
  }
 }
 if(hashes.size!==nodes.length)throw Error('CONTENT_SUBTREE_DEPENDENCY')
 return Object.freeze([...hashes].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([nodeId,subtreeHash])=>Object.freeze({nodeId,subtreeHash})))
}
