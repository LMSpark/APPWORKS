/**
 * @module app:services/smart-bid/content/references/response/original-form-mapping
 * 职责：动作33核原表版本、填写方与业务字段到行栏的映射。
 */
import {snapshotReferenceIdentity as identity} from '../snapshot-reference-values'
import {canonicalSnapshotValue} from '../../revision-snapshot-hash'

type Cell=Readonly<{cellRef:string;rowRef:string;columnRef:string;meaningRef:string;fillerRef:string;unit:string|null;displayRef:string}>
type Mapping=Readonly<{fieldRef:string;cellRef:string;meaningRef:string}>
type Original=Readonly<{projectId:string;formRef:string;formVersion:string;cells:readonly Cell[];assertCurrent:()=>void}>

/** 按已核原表版和业务栏意匹配，映射只传显示规则和单位。 */
export function mapOriginalForm(original:Original,input:Readonly<{
 projectId:string;formRef:string;formVersion:string;fillerRef:string;mappings:readonly Mapping[]
}>){
 original.assertCurrent()
 if(![input.projectId,input.formRef,input.formVersion,input.fillerRef].every(identity)||
  input.projectId!==original.projectId||input.formRef!==original.formRef||input.formVersion!==original.formVersion)
  throw Error('BID_ORIGINAL_FORM_SCOPE')
 const cells=new Map(original.cells.map(cell=>[cell.cellRef,cell]))
 if(cells.size!==original.cells.length||new Set(original.cells.map(cell=>JSON.stringify([cell.rowRef,cell.columnRef]))).size!==cells.size||
  original.cells.some(cell=>![cell.cellRef,cell.rowRef,cell.columnRef,cell.meaningRef,cell.fillerRef,cell.displayRef].every(identity)||
   (cell.unit!==null&&!identity(cell.unit))))throw Error('BID_ORIGINAL_FORM_CELLS')
 const usedFields=new Set<string>(),usedCells=new Set<string>()
 const mappings=Object.freeze(input.mappings.map(item=>{
  const cell=cells.get(item.cellRef)
  if(cell?.fillerRef!==input.fillerRef||cell.meaningRef!==item.meaningRef||!identity(item.fieldRef)||
   usedFields.has(item.fieldRef)||usedCells.has(item.cellRef))throw Error('BID_ORIGINAL_FORM_MAPPING')
  usedFields.add(item.fieldRef);usedCells.add(item.cellRef)
  return Object.freeze({fieldRef:item.fieldRef,cell:Object.freeze({...cell})})
 }))
 if(!mappings.length)throw Error('BID_ORIGINAL_FORM_MAPPING')
 return Object.freeze({projectId:original.projectId,formRef:original.formRef,formVersion:original.formVersion,mappings,
  assertCurrent:original.assertCurrent})
}

/** 版本更换后逐项找缺栏和语义差异，坐标相同不免重新匹配。 */
export function findChangedOriginalFormFields(before:ReturnType<typeof mapOriginalForm>,after:ReturnType<typeof mapOriginalForm>){
 before.assertCurrent();after.assertCurrent()
 if(before.projectId!==after.projectId||before.formRef!==after.formRef)throw Error('BID_ORIGINAL_FORM_SCOPE')
 const current=new Map(after.mappings.map(item=>[item.fieldRef,canonicalSnapshotValue(item.cell)]))
 return Object.freeze(before.mappings.filter(item=>current.get(item.fieldRef)!==canonicalSnapshotValue(item.cell))
  .map(item=>item.fieldRef).sort())
}
