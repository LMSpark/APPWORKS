/**
 * @module app:views/features/application/smart-bid/response/model/original-form-reader
 * 职责：动作33在原基线固定招标记录上读取原表映射依据。
 */
import {findChangedOriginalFormFields,mapOriginalForm} from '@/services/smart-bid/content/references/response/original-form-mapping'
import {readTenderRecordReference} from '@/services/smart-bid/content/references/baseline-tender-records'
import {readContentBaselineTenderRecord} from '../../authoring/model/content-baseline-reader'
import {readContentTenderRecord} from '../../authoring/model/content-tender-record-reader'
import {originalRegistrationView,readOriginalRegistrationView} from '../../authority/original-registration-view'
import {snapshotReferenceFields,snapshotReferenceIdentity as identity,visitSnapshotReferences}
 from '@/services/smart-bid/content/references/snapshot-reference-values'

type FormInput=Parameters<typeof mapOriginalForm>[1]
type FormFields=Pick<Parameters<typeof mapOriginalForm>[0],'formRef'|'cells'>
const templateFields=['baselineId','stageRef','tenderRecordRef','formRef','fillerRef','mappings']
const templateKeys=['projectId','templateRef','templateVersion']
const templateView='originalFormMapping'
const priorTemplateView='previousFormMapping',priorBaselineView='previousFormBaseline',priorTenderView='previousFormTenderRecord'
const error='BID_ORIGINAL_FORM_RECORD'

export function originalFormMappingScenarioView(primaryKey:string){
 return originalRegistrationView(primaryKey,templateKeys,templateFields)
}

/** 对照版使用独立视图，刷新一侧不会撤销另一侧的原查询。 */
export function previousFormMappingScenarioViews(keys:Readonly<Record<'DocumentTemplate'|'Baseline'|'TenderRecord',string>>){
 return {
  DocumentTemplate:{[priorTemplateView]:originalFormMappingScenarioView(keys.DocumentTemplate)},
  Baseline:{[priorBaselineView]:{...originalRegistrationView(keys.Baseline,['projectId'],['id','stageRef','tenderRecords']),
   scopeFilter:{logic:'and' as const,filters:[
    {field:'projectId',operator:'eq' as const,value:{Type:'GetInputParam',ParamName:'projectId'}},
    {field:'id',operator:'eq' as const,value:{Type:'GetInputParam',ParamName:'baselineId'}},
   ]}}},
  TenderRecord:{[priorTenderView]:originalRegistrationView(keys.TenderRecord,
   ['projectId','runId','type','ordinal','recordVersion','recordHash'],['payload','sourceSpan','parseQuality','confirmStatus'])},
 }
}

function readLocatedForm(payload:unknown):FormFields{
 const {formRef,cells}=snapshotReferenceFields(payload,['formRef','cells'],error)
 if(!identity(formRef))throw Error(error)
 const items:Array<FormFields['cells'][number]>=[]
 visitSnapshotReferences(cells,item=>{
  const {cellRef,rowRef,columnRef,meaningRef,fillerRef,unit,displayRef}=snapshotReferenceFields(item,
   ['cellRef','rowRef','columnRef','meaningRef','fillerRef','unit','displayRef'],error)
  if(!identity(cellRef)||!identity(rowRef)||!identity(columnRef)||!identity(meaningRef)||!identity(fillerRef)||
   !identity(displayRef)||(unit!==null&&!identity(unit)))throw Error(error)
  items.push(Object.freeze({cellRef,rowRef,columnRef,meaningRef,fillerRef,unit,displayRef}))
 },error)
 return {formRef,cells:Object.freeze(items)}
}

/** 原册模板登记固定原表版及填写决定，基线与原表分别按原视图重验。 */
export async function readRegisteredOriginalForm(host:Parameters<typeof readBaselineOriginalForm>[0],
 selection:Readonly<{templateRef:string;templateVersion:string}>,side:'current'|'previous'='current'){
 const {templateRef,templateVersion}=selection
 if(!identity(templateRef)||!identity(templateVersion))throw Error(error)
 const previous=side==='previous'
 const read=await readOriginalRegistrationView(host,{model:'DocumentTemplate',viewName:previous?priorTemplateView:templateView},
  {projectId:host.projectId,templateRef,templateVersion})
 if(!read.row)return Object.freeze({state:'UNKNOWN' as const,assertCurrent:read.assertCurrent})
 const assertCurrent=read.captureFields(templateFields)
 assertCurrent()
 const {baselineId,stageRef,tenderRecordRef,formRef,fillerRef,mappings}=read.row
 if(!identity(baselineId)||!identity(formRef)||!identity(fillerRef))throw Error(error)
 const fields:Array<FormInput['mappings'][number]>=[]
 visitSnapshotReferences(mappings,value=>{
  const {fieldRef,cellRef,meaningRef}=snapshotReferenceFields(value,['fieldRef','cellRef','meaningRef'],error)
  if(!identity(fieldRef)||!identity(cellRef)||!identity(meaningRef))throw Error(error)
  fields.push(Object.freeze({fieldRef,cellRef,meaningRef}))
 },error)
 const reference=readTenderRecordReference(tenderRecordRef)
 const form=await readBaselineOriginalForm({...host,assertCurrent},
  {basis:{baselineId,stageRef,...(previous?{viewName:priorBaselineView}:{})},reference,
   mapping:{formRef,fillerRef,mappings:fields}},readLocatedForm,previous?priorTenderView:undefined)
 return Object.freeze({state:'MATCHED' as const,...form,baselineId,templateRef,templateVersion,tenderRecordRef:reference})
}

export async function compareRegisteredOriginalForms(host:Parameters<typeof readRegisteredOriginalForm>[0],input:Readonly<{
 templateRef:string;previousVersion:string;currentVersion:string
}>){
 const {templateRef,previousVersion,currentVersion}=input
 if(previousVersion===currentVersion)throw Error(error)
 const [before,after]=await Promise.all([
  readRegisteredOriginalForm(host,{templateRef,templateVersion:previousVersion},'previous'),
  readRegisteredOriginalForm(host,{templateRef,templateVersion:currentVersion}),
 ])
 const assertCurrent=()=>{before.assertCurrent();after.assertCurrent()}
 assertCurrent()
 if(before.state!=='MATCHED'||after.state!=='MATCHED')return Object.freeze({state:'UNKNOWN' as const,assertCurrent})
 const changedFields=before.formRef===after.formRef?findChangedOriginalFormFields(before,after):
  Object.freeze(before.mappings.map(item=>item.fieldRef).sort())
 const oldFields=new Set(before.mappings.map(item=>item.fieldRef))
 const addedFields=Object.freeze(after.mappings.filter(item=>!oldFields.has(item.fieldRef)).map(item=>item.fieldRef).sort())
 return Object.freeze({state:'COMPARED' as const,previousFormVersion:before.formVersion,currentFormVersion:after.formVersion,
  changedFields,addedFields,assertCurrent})
}

/** 行栏解释方消费原记录字段；正式原文位置与固定基线证明始终随结果。 */
export async function readBaselineOriginalForm(
 host:Parameters<typeof readContentBaselineTenderRecord>[0],
 input:Readonly<{basis:Parameters<typeof readContentBaselineTenderRecord>[1];reference:unknown
  mapping:Omit<FormInput,'projectId'|'formVersion'>}>,
 readCells:(payload:unknown,sourceSpan:unknown)=>FormFields,tenderViewName?:string,
){
 const reference=readTenderRecordReference(input.reference)
 const baseline=await readContentBaselineTenderRecord(host,input.basis,reference)
 const original=await readContentTenderRecord({...host,assertCurrent:baseline.assertCurrent},reference,tenderViewName)
 original.assertCurrent()
 const row=host.runtime.resolveView(original.dataViewKey)?.rows[0]
 if(row?.['type']!=='FORMAT'||row['parseQuality']!=='LOCATED')throw Error('BID_ORIGINAL_FORM_RECORD')
 const fields=readCells(row['payload'],row['sourceSpan'])
 original.assertCurrent()
 return mapOriginalForm({...fields,projectId:host.projectId,formVersion:reference.recordVersion,assertCurrent:original.assertCurrent},
  {...input.mapping,projectId:host.projectId,formVersion:reference.recordVersion})
}
