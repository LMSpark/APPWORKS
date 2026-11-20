/**
 * @module app:services/smart-bid/content-tree-editor-layout
 * 职责：以标准表单和JSON字段配置表达人工内容树及选中正文。
 * 边界：只读取原视图决定呈现；不查询、不持有草稿、不保存，选择由宿主管理。
 */
import {parseDataViewKey, resolveDataViewKey, type DataView} from '@spark-appworks/spark-data'
import type {RFormProps} from '@spark-appworks/spark-component'
import type {JsonPath} from '@spark-appworks/spark-json-document'
import {isRecord} from '@spark-appworks/spark-utils'
import {ContentTreeDraftEditor} from './content-tree-draft-editor'
import {contentReferenceEditorSchema,contentTableEditorSchema} from './content/references/content-reference-editor-schema'
import {decodeContentDraftPayload} from './content-draft-save-rule'

/** 本次宿主的正式绑定及临时选择；结构操作后宿主须清除选择。 */
export type ContentTreeEditorLayoutInput = Readonly<{
  view: DataView
  dataViewKey: string
  draftId: string | number
  projectId: string
  selectedPath: JsonPath | null
  onSelectedPathChange: (path: JsonPath | null) => void
  onEditingChange: (editing: boolean) => void
}>

/** 解析本次原草稿与选择，不复制内容或移动视图行指针。 */
function selection(input: ContentTreeEditorLayoutInput) {
  const {view, dataViewKey, draftId, projectId, selectedPath} = input
  const descriptor = parseDataViewKey(dataViewKey), dataSet = view.dataSet
  if (!descriptor?.scope || !dataSet || resolveDataViewKey(dataViewKey, dataSet) !== view) throw Error('内容编辑必须绑定本次完整数据视图身份')
  const row = view.getEditingRow(draftId)
  if (!row || !projectId.trim() || row['projectId'] !== projectId
    || view.fieldAccess(row, 'projectId').read !== 'visible' || view.fieldAccess(row, 'draft').read !== 'visible') throw Error('当前项目草稿不可读取')
  const rawDraft = row['draft'], draft = decodeContentDraftPayload(rawDraft)
  if (!Array.isArray(draft['nodes'])) throw Error('草稿内容结构无效')
  const selected: unknown = selectedPath?.length === 1 && typeof selectedPath[0] === 'number' ? draft['nodes'][selectedPath[0]] : undefined
  if (selectedPath !== null && !isRecord(selected)) throw Error('所选内容路径已失效')
  const nodes:readonly unknown[]=draft['nodes']
  return {row,nodes,selected:isRecord(selected)?selected:undefined,valueFormat:typeof rawDraft==='string'?'text' as const:'native' as const}
}

/** 配置只编辑文本节点的value，节点身份、结构、引用和其他草稿成员始终保留。 */
export function contentTreeEditorLayout(input: ContentTreeEditorLayoutInput): RFormProps {
  const {dataViewKey,draftId,projectId,selectedPath}=input,{selected,valueFormat}=selection(input)
  const editableText = isRecord(selected) && ['heading', 'paragraph', 'caption'].includes(String(selected['type']))
  const tableNode=selected?.['type']==='table'
  const originalValue=input.view.rows.find(row=>input.view.getPkKey(row)===draftId)?.['draft']
  const originalDraft=originalValue===undefined?undefined:decodeContentDraftPayload(originalValue)
  const originalNode:unknown=Array.isArray(originalDraft?.['nodes'])
   ?originalDraft['nodes'].find((node:unknown)=>isRecord(node)&&node['nodeId']===selected?.['nodeId']):undefined
  const originalData=isRecord(originalNode)?originalNode['data']:undefined
  const originalGenerator=isRecord(originalData)&&Array.isArray(originalData['header'])&&originalData['header'].length===0
  const editableTable=tableNode&&!originalGenerator
  return {dataViewKey, contextRowId: draftId, autoColumns: false, gridMinWidth: '360px', children: [
    {type: 'r-json', props: {field: 'draft', dataMember: 'currentRow', valueFormat, valuePath: ['nodes'],
      mode: 'outline', outlineIdField: 'nodeId', outlineParentField: 'parentId', outlineRootValue: projectId,
      selectedPath, onSelectedPathChange: input.onSelectedPathChange}, children: [
      {type: 'r-text', props: {field: 'type', label: '类型'}}, {type: 'r-text', props: {field: 'value', label: '内容'}},
    ]},
    ...(selectedPath === null ? [] : [{type: 'r-json', props: {field: 'draft', dataMember: 'currentRow', valueFormat,
      valuePath: ['nodes', ...selectedPath], mode: 'form', readonly: !editableText&&!editableTable,
      schema:tableNode?contentTableEditorSchema():contentReferenceEditorSchema(typeof selected?.['value']==='string'?selected['value']:'',selected?.['data']),
      onEditingChange: input.onEditingChange}}]),
  ]}
}

/** 结构操作仅产生原草稿编辑；宿主核本次会话与未确认输入，失败由同一工作区展示。 */
export type ContentTreeDraftActionHooks=Readonly<{
 pending:boolean;beforeChange:()=>void;afterChange:()=>void;onError:(cause:unknown)=>void
}>
/** 标准表单固定原草稿行，按钮继承同一行权限；新增身份是本次本地节点UUID，不是资源模型身份。 */
export function contentTreeDraftActionLayout(input:ContentTreeEditorLayoutInput,hooks:ContentTreeDraftActionHooks):RFormProps {
 const {view,dataViewKey,draftId,projectId}=input,{row,nodes,selected}=selection(input)
 const assertResult=view.captureReadResult(),writable=view.fieldAccess(row,'draft').write==='allowed'
 const nodeId=typeof selected?.['nodeId']==='string'?selected['nodeId']:undefined,type=selected?.['type']
 const parentId=selected?.['parentId'],position=selected?.['index']
 const run=(change:(editor:ContentTreeDraftEditor)=>void)=>()=>{
  try{
   hooks.beforeChange();assertResult()
   const current=selection(input).selected
   if(current?.['nodeId']!==nodeId||current?.['type']!==type||current?.['parentId']!==parentId||current?.['index']!==position)
    throw Error('内容位置已变化，请重新选择后操作')
   change(new ContentTreeDraftEditor(view,draftId,projectId));hooks.afterChange()
  }catch(cause){hooks.onError(cause)}
 }
 const id=()=>globalThis.crypto.randomUUID()
 const disabled=hooks.pending||!writable
 const records=nodes.filter(isRecord),siblings=records.filter(node=>node['parentId']===parentId)
 const parent=records.find(node=>node['nodeId']===parentId),first=siblings.find(node=>node['index']===0)
 const minimum=parent?.['type']==='chapter'||parent?.['type']==='figure'||parent?.['type']==='document'&&first?.['type']==='toc'?1:0
 const canMove=(offset:number)=>!['heading','toc','image'].includes(String(type))&&typeof position==='number'&&Number.isSafeInteger(position)
  &&position+offset>=minimum&&position+offset<siblings.length
 const move=(offset:number)=>run(editor=>{
  if(!nodeId||typeof parentId!=='string'||typeof position!=='number'||!canMove(offset))throw Error('所选节点不能移至该位置')
  editor.move(nodeId,parentId,position+offset)
 })
 return {dataViewKey,contextRowId:draftId,autoColumns:false,gridColumns:3,children:[
  {type:'r-button',props:{label:'新增逻辑册',permAction:'edit',disabled,onClick:run(editor=>editor.addDocument({
   documentId:id(),chapterId:id(),headingId:id(),title:'新章节'}))}},
  {type:'r-button',props:{label:'新增章节',permAction:'edit',disabled:disabled||!nodeId||!['document','chapter'].includes(String(type)),
   onClick:run(editor=>{if(!nodeId)throw Error('请先选择逻辑册或章节');editor.addChapter(nodeId,{chapterId:id(),headingId:id(),title:'新章节'})})}},
  {type:'r-button',props:{label:'新增段落',permAction:'edit',disabled:disabled||!nodeId||!['chapter','item','quote'].includes(String(type)),
   onClick:run(editor=>{if(!nodeId)throw Error('请先选择章节、列表项或引文');editor.addParagraph(nodeId,{nodeId:id(),value:''})})}},
  ...[{label:'新增项目符号列表',ordered:false},{label:'新增编号列表',ordered:true}].map(({label,ordered})=>({type:'r-button',props:{
   label,permAction:'edit' as const,disabled:disabled||!nodeId||!['chapter','item'].includes(String(type)),
   onClick:run(editor=>{if(!nodeId)throw Error('请先选择章节或列表项');editor.addList(nodeId,{listId:id(),itemId:id(),paragraphId:id(),value:'',ordered})}),
  }})),
  {type:'r-button',props:{label:'新增列表项',permAction:'edit',disabled:disabled||!nodeId||type!=='list',
   onClick:run(editor=>{if(!nodeId)throw Error('请先选择列表');editor.addListItem(nodeId,{itemId:id(),paragraphId:id(),value:''})})}},
  {type:'r-button',props:{label:'新增引文',permAction:'edit',disabled:disabled||!nodeId||type!=='chapter',
   onClick:run(editor=>{if(!nodeId)throw Error('请先选择章节');editor.addQuote(nodeId,{quoteId:id(),paragraphId:id(),value:''})})}},
  {type:'r-button',props:{label:'新增普通表',permAction:'edit',disabled:disabled||!nodeId||!['chapter','item'].includes(String(type)),
   onClick:run(editor=>{if(!nodeId)throw Error('请先选择章节或列表项');editor.addTable(nodeId,{nodeId:id(),header:['说明'],rows:[]})})}},
  {type:'r-button',props:{label:'新增目录',permAction:'edit',disabled:disabled||!nodeId||type!=='document'
   ||records.some(node=>node['parentId']===nodeId&&node['type']==='toc'),
   onClick:run(editor=>{if(!nodeId)throw Error('请先选择逻辑册');editor.addTableOfContents(nodeId,id())})}},
  {type:'r-button',props:{label:'删除所选子树',permAction:'edit',disabled:disabled||!nodeId||type==='heading',
   onClick:run(editor=>{if(!nodeId)throw Error('请先选择内容节点');editor.remove(nodeId)})}},
  {type:'r-button',props:{label:'上移',permAction:'edit',disabled:disabled||!canMove(-1),onClick:move(-1)}},
  {type:'r-button',props:{label:'下移',permAction:'edit',disabled:disabled||!canMove(1),onClick:move(1)}},
 ]}
}
