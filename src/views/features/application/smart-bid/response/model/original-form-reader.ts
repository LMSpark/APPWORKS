/**
 * @module app:views/features/application/smart-bid/response/model/original-form-reader
 * 职责：动作33在原基线固定招标记录上读取原表映射依据。
 */
import {mapOriginalForm} from '@/services/smart-bid/content/references/response/original-form-mapping'
import {readTenderRecordReference} from '@/services/smart-bid/content/references/baseline-tender-records'
import {readContentBaselineTenderRecord} from '../../authoring/model/content-baseline-reader'
import {readContentTenderRecord} from '../../authoring/model/content-tender-record-reader'

type FormInput=Parameters<typeof mapOriginalForm>[1]
type FormFields=Pick<Parameters<typeof mapOriginalForm>[0],'formRef'|'cells'>

/** 行栏解释方消费原记录字段；正式原文位置与固定基线证明始终随结果。 */
export async function readBaselineOriginalForm(
 host:Parameters<typeof readContentBaselineTenderRecord>[0],
 input:Readonly<{basis:Parameters<typeof readContentBaselineTenderRecord>[1];reference:unknown
  mapping:Omit<FormInput,'projectId'|'formVersion'>}>,
 readCells:(payload:unknown,sourceSpan:unknown)=>FormFields,
){
 const reference=readTenderRecordReference(input.reference)
 const baseline=await readContentBaselineTenderRecord(host,input.basis,reference)
 const original=await readContentTenderRecord({...host,assertCurrent:baseline.assertCurrent},reference)
 original.assertCurrent()
 const row=host.runtime.resolveView(original.dataViewKey)?.rows[0]
 if(row?.['type']!=='FORMAT'||row['parseQuality']!=='LOCATED')throw Error('BID_ORIGINAL_FORM_RECORD')
 const fields=readCells(row['payload'],row['sourceSpan'])
 original.assertCurrent()
 return mapOriginalForm({...fields,projectId:host.projectId,formVersion:reference.recordVersion,assertCurrent:original.assertCurrent},
  {...input.mapping,projectId:host.projectId,formVersion:reference.recordVersion})
}
