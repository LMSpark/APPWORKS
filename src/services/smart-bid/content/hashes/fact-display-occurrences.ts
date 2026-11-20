/**
 * @module app:services/smart-bid/content/hashes/fact-display-occurrences
 * 职责：将同版事实显示摘要关联到原正文及表格中的每一次使用。
 */
import {readContentFactOccurrences} from '../content-node-links'
import type {IndependentResponseFactOccurrence} from '../references/revision-response-text'

type DisplayFacts=ReadonlyArray<Readonly<{factId:string;displayHash:string}>>
function displayLookup(facts:DisplayFacts){
 const byId=new Map(facts.map(fact=>[fact.factId,fact.displayHash]))
 if(byId.size!==facts.length)throw Error('CONTENT_FACT_DISPLAY_DUPLICATE')
 return (factId:string)=>{
  const displayHash=byId.get(factId)
  if(displayHash===undefined)throw Error('CONTENT_FACT_DISPLAY_MISSING')
  return displayHash
 }
}

export function projectFactDisplayOccurrences(nodes:readonly unknown[],facts:DisplayFacts){
 const displayHash=displayLookup(facts)
 return Object.freeze(nodes.flatMap(node=>readContentFactOccurrences(node).map(({nodeId,factId,occurrence})=>
  Object.freeze({nodeId,occurrence,displayHash:displayHash(factId)}))))
}

export function projectResponseFactDisplayOccurrences(occurrences:readonly IndependentResponseFactOccurrence[],facts:DisplayFacts){
 const displayHash=displayLookup(facts)
 return Object.freeze(occurrences.map(({responseId,assignmentId,factId,occurrence})=>
  Object.freeze({responseId,assignmentId,occurrence,displayHash:displayHash(factId)})))
}
