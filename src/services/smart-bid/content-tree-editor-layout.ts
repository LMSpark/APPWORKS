/**
 * @module app:services/smart-bid/content-tree-editor-layout
 * 职责：以标准表单和JSON字段配置表达人工内容树及选中正文。
 * 边界：只读取原视图决定呈现；不查询、不持有草稿、不保存，选择由宿主管理。
 */
import {parseDataViewKey, resolveDataViewKey, type DataView} from '@spark-appworks/spark-data'
import type {RFormProps} from '@spark-appworks/spark-component'
import type {JsonPath} from '@spark-appworks/spark-json-document'
import {isRecord} from '@spark-appworks/spark-utils'

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

/** 配置只编辑文本节点的value，节点身份、结构、引用和其他草稿成员始终保留。 */
export function contentTreeEditorLayout(input: ContentTreeEditorLayoutInput): RFormProps {
  const {view, dataViewKey, draftId, projectId, selectedPath} = input
  const descriptor = parseDataViewKey(dataViewKey), dataSet = view.dataSet
  if (!descriptor?.scope || !dataSet || resolveDataViewKey(dataViewKey, dataSet) !== view) throw Error('内容编辑必须绑定本次完整数据视图身份')
  const row = view.getEditingRow(draftId)
  if (!row || !projectId.trim() || row['projectId'] !== projectId
    || view.fieldAccess(row, 'projectId').read !== 'visible' || view.fieldAccess(row, 'draft').read !== 'visible') throw Error('当前项目草稿不可读取')
  const draft: unknown = row['draft']
  if (!isRecord(draft) || !Array.isArray(draft['nodes'])) throw Error('草稿内容结构无效')
  const selected: unknown = selectedPath?.length === 1 && typeof selectedPath[0] === 'number' ? draft['nodes'][selectedPath[0]] : undefined
  if (selectedPath !== null && !isRecord(selected)) throw Error('所选内容路径已失效')
  const editableText = isRecord(selected) && ['heading', 'paragraph', 'caption'].includes(String(selected['type']))
  return {dataViewKey, contextRowId: draftId, autoColumns: false, gridMinWidth: '360px', children: [
    {type: 'r-json', props: {field: 'draft', dataMember: 'currentRow', valueFormat: 'native', valuePath: ['nodes'],
      mode: 'outline', outlineIdField: 'nodeId', outlineParentField: 'parentId', outlineRootValue: projectId,
      selectedPath, onSelectedPathChange: input.onSelectedPathChange}, children: [
      {type: 'r-text', props: {field: 'type', label: '类型'}}, {type: 'r-text', props: {field: 'value', label: '内容'}},
    ]},
    ...(selectedPath === null ? [] : [{type: 'r-json', props: {field: 'draft', dataMember: 'currentRow', valueFormat: 'native',
      valuePath: ['nodes', ...selectedPath], mode: 'form', readonly: !editableText,
      schema: {type: 'object', required: ['value'], properties: {value: {type: 'string', title: '正文'}}},
      onEditingChange: input.onEditingChange}}]),
  ]}
}
