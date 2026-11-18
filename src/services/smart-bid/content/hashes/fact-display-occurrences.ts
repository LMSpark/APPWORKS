/**
 * @module app:services/smart-bid/content/hashes/fact-display-occurrences
 * 职责：将同版事实显示摘要关联到原正文及表格中的每一次使用。
 */
import {readContentFactOccurrences} from '../content-node-links'

export function projectFactDisplayOccurrences(nodes:readonly unknown[],facts:ReadonlyArray<Readonly<{factId:string;displayHash:string}>>){
 const byId=new Map(facts.map(fact=>[fact.factId,fact.displayHash]))
 if(byId.size!==facts.length)throw Error('CONTENT_FACT_DISPLAY_DUPLICATE')
 return Object.freeze(nodes.flatMap(node=>readContentFactOccurrences(node).map(({nodeId,factId,occurrence})=>{
  const displayHash=byId.get(factId)
  if(displayHash===undefined)throw Error('CONTENT_FACT_DISPLAY_MISSING')
  return Object.freeze({nodeId,occurrence,displayHash})
 })))
}
