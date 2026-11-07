import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import type {HttpClientBase} from '@spark-appworks/spark-utils'
import {createWorkflowScenarioBindings} from '@/lowcode/resources/structured-config/workflow-definition/execution/runtime-bindings'
import {readFileSync} from 'node:fs'
import {buildFormalModels} from '../catalog/structured-config-catalog.fixture'
export const WORKFLOW_DESIGN='0DD8D28D462F51C5790AA6FBFAE39366'
export const workflowDesignText=readFileSync('config/pages/structured-config/workflow-editor/pagedata.json','utf8')
export function workflowDesignModels(ownerOutput=true){
  const raw=JSON.parse(workflowDesignText) as {tables:Record<string,{modelBinding?:{modelId:string};views:Record<string,{queryConfig:{fields:string[]}}>}>}
  // Formal 0DD8 field metadata repaired against the physical table and design scene on 2026-11-03.
  const integerFields=new Set(['IsOutput','IsPKey','allowAIAdd','Order','Group','aiSort','DISTINCT','flowstate'])
  // Live physical Base_DataModel contract, repaired in the 0DD8 model on 2026-11-03.
  const modelIntegers=new Set(['DISTINCT','flowstate','IsBusiness','IsBusinessMain'])
    return Object.entries(raw.tables).filter(([,table])=>table.modelBinding!==undefined).flatMap(([name,table])=>buildFormalModels({[name]:[...new Set([...Object.values(table.views).flatMap(v=>v.queryConfig.fields),...(name==='Base_WorkflowNodeDefinition'?['workflow_id']:name==='Base_DataModel'?['DISTINCT','flowstate']:[])])]}).map(model=>({...model,id:table.modelBinding!.modelId,fields:model.fields.map(f=>({...f,modelId:table.modelBinding!.modelId,type:name==='Base_DataModel_Field'&&integerFields.has(f.name)||name==='Base_DataModel'&&modelIntegers.has(f.name)||name==='Base_DataModel_Relation'&&f.name==='cascadeDel'||name==='Base_WorkflowNodeDefinition'&&f.name==='position_type'?'INT':f.type,output:ownerOutput||!(name==='Base_WorkflowNodeDefinition'&&f.name==='workflow_id')}))})))
}

/** Direct assembly fixtures use the same declared command factory as the production loader. */
export function workflowDesignCommandBindings(text:string,http:HttpClientBase){
 return createWorkflowScenarioBindings({config:new ScenarioViewConfig(WORKFLOW_DESIGN,text),http,readScope:()=>({token:'scope',headers:{'X-AppId':'APP'}}),assertCurrent:()=>undefined})
}
