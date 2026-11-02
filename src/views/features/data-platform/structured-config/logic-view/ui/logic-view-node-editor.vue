<!--
@module app:views/features/data-platform/structured-config/logic-view/ui/logic-view-node-editor
职责：按原设计字段的精确节点路径编排节点树、基础、字段及关联配置。
边界：标准FieldJson写回原DataView，不查询来源、不复制节点草稿、不单独保存。
-->
<template>
  <p v-if="commandError" role="alert">{{ commandError }}</p>
  <div class="node-workspace">
    <aside>
      <div class="node-actions">
        <RendererButton v-for="choice in sourceChoices" :key="choice.type" :data-view-key="viewKey" :label="choice.label" :disabled="!canEdit || pending.size>0 || !metadata" @click="openSource(choice.type)" />
        <RendererButton :data-view-key="viewKey" label="删除节点" :disabled="!canEdit || !path || pending.size>0" @click="requestDelete" />
      </div>
    <RendererForm :data-view-key="viewKey" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1" data-logic-node-outline>
      <FieldJson field="designJson" label="节点" mode="outline" outline-children-field="ChildTables" :children="nodeColumns" :selected-path="path"
        :on-selected-path-change="select" :height="500" />
    </RendererForm>
    </aside>
    <div data-logic-node-editor>
      <p v-if="nodeNotice" role="status">{{ nodeNotice }}</p>
      <p v-if="!path">请选择左侧节点后再编辑</p>
      <RendererTabs v-else :data-view-key="viewKey" :model-value="tab" @update:model-value="value => {if (!pending.size) tab=String(value)}">
        <RendererTabPane :index="0" name="basic" label="单项基本信息">
          <RendererForm :data-view-key="viewKey" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1">
            <FieldJson field="designJson" label="基础配置" mode="form" :value-path="path" :schema="basicSchema" :readonly="disabled" :on-editing-change="value=>editing('basic',value)" />
            <FieldJson field="designJson" label="条件" mode="properties" :value-path="path" :schema="filterSchema" :readonly="disabled" :on-editing-change="value=>editing('filter',value)" />
            <div v-if="hasFields" class="node-actions">
              <RendererButton v-for="action in outputActions" :key="action.operation" :data-view-key="viewKey" :label="action.label" :disabled="!canEdit || pending.size>0 || !hasOutputFields" @click="setOutput(action.operation)" />
            </div>
            <FieldJson v-if="hasFields" field="designJson" label="字段信息" mode="rows" :value-path="[...path,'Fields']" :children="fieldColumns" :row-adapter="logicFieldRowAdapter" :readonly="disabled" :on-editing-change="value=>editing('fields',value)" />
            <p v-else>此节点尚未定义 Fields 字段数组。</p>
          </RendererForm>
        </RendererTabPane>
        <RendererTabPane :index="1" name="join" label="联表设置">
          <p v-if="path.length===1">根节点无需配置联表设置</p>
          <RendererForm v-else :data-view-key="viewKey" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1">
            <FieldJson field="designJson" label="联表设置" mode="form" :value-path="path" :schema="joinSchema" :readonly="disabled" :on-editing-change="value=>editing('join',value)" />
            <FieldJson field="designJson" label="联表条件" mode="properties" :value-path="path" :schema="joinFilterSchema" :readonly="disabled" :on-editing-change="value=>editing('join-filter',value)" />
          </RendererForm>
        </RendererTabPane>
      </RendererTabs>
    </div>
  </div>
  <RendererDialog v-if="sourceOpen" :data-view-key="viewKey" :model-value="true" :title="sourceTitle" width="980px" @update:model-value="value=>{if(!value)closeSource()}">
    <div data-logic-source-dialog>
      <p v-if="sourceBusy" role="status">正在读取来源…</p><p v-if="sourceError" role="alert">{{ sourceError }}</p>
      <RendererTable v-if="sourceView" :data-view-key="sourceKey" :children="sourceColumns" :filter="sourceFilter" :show-data-view-meta="false" :max-height="460" />
      <RendererButton :data-view-key="viewKey" label="确认添加" :disabled="sourceBusy || !sourceView" @click="confirmSource" />
      <RendererButton :data-view-key="viewKey" label="取消" @click="closeSource" />
    </div>
  </RendererDialog>
  <RendererDialog v-if="deleteTarget" :data-view-key="viewKey" :model-value="true" title="删除节点" @update:model-value="value=>{if(!value)closeDelete()}">
    <p>确定删除选中节点及所有子节点？保存设计后才会持久化。</p>
    <RendererButton :data-view-key="viewKey" label="确认删除节点" :disabled="!canEdit" @click="confirmDelete" />
    <RendererButton :data-view-key="viewKey" label="取消" @click="closeDelete" />
  </RendererDialog>
</template>
<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import {buildDataViewKey,type DataSet,type DataView, type SparkNode} from '@spark-appworks/spark-data'
import {getValueAtJsonPath,isJsonObject, parseJsonDocument, type JsonPath, type JsonSchemaObject} from '@spark-appworks/spark-json-document'
import {FieldJson, RendererButton,RendererDialog,RendererTable,RendererForm, RendererTabs, RendererTabPane,type RFilterProps} from '@spark-appworks/spark-component'
import {LogicViewSourceViews,type LogicViewSourceType} from '@/lowcode/resources/structured-config/logic-view/source-views'
import {LogicViewNodeCommands} from '@/lowcode/resources/structured-config/logic-view/node-commands'
import {logicFieldRowAdapter} from '@/lowcode/resources/structured-config/logic-view/field-row-adapter'
import {LowcodeDataSpaceSourceCatalog} from '@/lowcode/data-space/model-source/lowcode-data-space-source-catalog'
const props=defineProps<{viewKey:string;view:DataView;metadata?:DataSet|undefined;disabled:boolean}>()
const emit=defineEmits<{'editing-change':[value:boolean]}>()
const path=ref<JsonPath|null>(null),tab=ref('basic'),revision=ref(0),pending=ref(new Set<string>())
let active=true,sourceGeneration=0
const commandError=ref(''),sourceOpen=ref(false),sourceBusy=ref(false),sourceError=ref(''),sourceType=ref<LogicViewSourceType>('table'),sourceView=shallowRef<DataView>()
const deleteTarget=ref<{expected:string;path:JsonPath}>()
let sourceExpected='',sourceParent:JsonPath|null=null
const sourceChoices:ReadonlyArray<{type:LogicViewSourceType;label:string}>=[{type:'table',label:'表'},{type:'dict',label:'字典'},{type:'interface',label:'接口'},{type:'json',label:'JSON'}]
type OutputOperation='all-off'|'system-off'|'reverse'
const outputActions:ReadonlyArray<{operation:OutputOperation;label:string}>=[{operation:'all-off',label:'全部不输出'},{operation:'system-off',label:'系统字段不输出'},{operation:'reverse',label:'反转输出'}]
const sources=computed(()=>props.metadata?new LogicViewSourceViews(props.metadata):undefined)
const commands=computed(()=>{
  const view=props.view,workspace=sources.value
  return new LogicViewNodeCommands({view,assertCurrent:()=>{if(!active||props.view!==view||props.disabled||workspace!==sources.value)throw new Error('LOGIC_NODE_STALE: 节点工作区已变化');workspace?.assertCurrent()}})
})
const canEdit=computed(()=>{revision.value;const view=props.view,row=view.currentRow;return !props.disabled&&!view.destroyed&&!view.hasUnconfirmedSave&&!!row&&view.fieldAccess(row,'designJson').write==='allowed'})
const sourceKey=computed(()=>{const view=sourceView.value;if(!view)return props.viewKey
  const name=view.dataTable?.modelBinding?.modelName,scenarioId=view.dataSet?.scenarioId
  if(!name||!scenarioId)throw new Error('来源缺少完整模型绑定')
  return buildDataViewKey(name,view.viewId,scenarioId)})
const sourceTitle=computed(()=>`选择${LowcodeDataSpaceSourceCatalog.config(sourceType.value).label}来源`)
const sourceColumns=computed<SparkNode[]>(()=>{
  const spec=LowcodeDataSpaceSourceCatalog.config(sourceType.value)
  return [{field:spec.name,label:'名称'},...(spec.description?[{field:spec.description,label:'描述'}]:[]),...(spec.databaseName?[{field:spec.databaseName,label:'数据库名称'}]:[])]
    .map(item=>({type:'r-text',props:{...item,readonly:true}}))
})
const sourceFilter=computed<RFilterProps>(()=>({autoQuery:false,showDataViewMeta:false,children:sourceColumns.value.map(item=>({...item,props:{...item.props,readonly:false}}))}))
const nodeColumns:SparkNode[]=[{type:'r-text',props:{field:'Type',label:'类型'}},{type:'r-text',props:{field:'Name',label:'名称'}}]
const basicSchema:JsonSchemaObject={type:'object',properties:{Description:{type:'string',title:'描述'},PrimaryKeyFields:{type:'string',title:'主键字段'},OutputType:{type:'string',title:'输出类型'}}}
const filterSchema:JsonSchemaObject={type:'object',properties:{Filter:{title:'条件'}}}
const joinFilterSchema:JsonSchemaObject={type:'object',properties:{JoinFilter:{title:'联表条件'}}}
const joinSchema:JsonSchemaObject={type:'object',properties:{JoinType:{type:'string',title:'联表类型',oneOf:[{const:'LEFT',title:'左连接'},{const:'RIGHT',title:'右连接'},{const:'INNER',title:'内连接'},{const:'FULL',title:'全连接'}]},ForeignKeyFields:{type:'string',title:'外键字段'}}}
const textLabels:Record<string,string>={Name:'名称',Description:'描述',FieldType:'类型',AsName:'别名',Expression:'表达式',OrderType:'排序类型'}
const flagLabels:Record<string,string>={DISTINCT:'去重',IsOutput:'输出',IsPKey:'主键',Group:'分组'}
const fieldColumns:SparkNode[]=[...Object.entries(textLabels).map(([field,label])=>({type:'r-text',props:{field,label}})),
  {type:'r-json',props:{field:'ValueFun',label:'值函数',mode:'text',valueFormat:'native',height:120}},
  {type:'r-number',props:{field:'Order',label:'排序'}},
  ...Object.entries(flagLabels).map(([field,label])=>({type:'r-checkbox',props:{field,label,trueValue:1,falseValue:0}}))]
function select(value:JsonPath|null):void {if(value===null||!pending.value.size)path.value=value}
function editing(key:string,value:boolean):void {if(value)pending.value.add(key);else pending.value.delete(key);emit('editing-change',pending.value.size>0)}
function closeSource():void {sourceGeneration++;sourceOpen.value=false;sourceView.value=undefined;sourceBusy.value=false;editing('source',false)}
async function openSource(type:LogicViewSourceType):Promise<void>{
  if(!canEdit.value||pending.value.size)return
  let own=sourceGeneration
  try {
    const workspace=sources.value;if(!workspace)throw new Error('来源元数据空间未装配')
    sourceExpected=commands.value.capture();sourceParent=path.value?[...path.value]:null
    sourceType.value=type;sourceError.value='';commandError.value='';sourceOpen.value=true;sourceBusy.value=true;editing('source',true)
    own=++sourceGeneration
    const view=await workspace.candidate(type)
    if(!active||own!==sourceGeneration)return
    view.filterExpression=undefined;view.page=1;view.clearSelectedRows()
    await view.refresh();workspace.assertCurrent()
    if(!active||own!==sourceGeneration)return
    if(view.loadingError)throw view.loadingError
    sourceView.value=view;sourceBusy.value=false
  }catch(cause){if(!active||own!==sourceGeneration)return;if(sourceOpen.value){sourceError.value=cause instanceof Error?cause.message:String(cause);sourceBusy.value=false}else commandError.value=String(cause)}
}
async function confirmSource():Promise<void>{
  const view=sourceView.value,workspace=sources.value;if(!view||!workspace||sourceBusy.value)return
  const own=sourceGeneration
  try {sourceBusy.value=true;sourceError.value=''
    const source=LowcodeDataSpaceSourceCatalog.selected(sourceType.value,view),prepared=await workspace.prepare(source)
    if(!active||own!==sourceGeneration||!sourceOpen.value)return
    const selected=commands.value.append({expected:sourceExpected,parentPath:sourceParent,prepared})
    closeSource();path.value=selected;tab.value='basic'
  }catch(cause){if(active&&own===sourceGeneration){sourceError.value=cause instanceof Error?cause.message:String(cause);sourceBusy.value=false}}
}
function closeDelete():void {deleteTarget.value=undefined;editing('delete',false)}
function requestDelete():void {if(!path.value||!canEdit.value||pending.value.size)return;try{deleteTarget.value={expected:commands.value.capture(),path:[...path.value]};editing('delete',true)}catch(cause){commandError.value=String(cause)}}
function confirmDelete():void {const target=deleteTarget.value;if(!target)return;try{path.value=commands.value.remove(target);closeDelete()}catch(cause){commandError.value=String(cause)}}
function setOutput(operation:OutputOperation):void {
  if(!path.value||!canEdit.value||pending.value.size)return
  try{commands.value.setFieldOutput({expected:commands.value.capture(),path:[...path.value],operation});commandError.value=''}catch(cause){commandError.value=String(cause)}
}
watch(()=>props.view,(view,_,cleanup)=>{
  closeSource();closeDelete();path.value=null;pending.value.clear();emit('editing-change',false)
  const changed=()=>revision.value++
  view.events.on('editingChanged',changed);view.events.on('rowsChanged',changed)
  cleanup(()=>{view.events.off('editingChanged',changed);view.events.off('rowsChanged',changed)})
},{immediate:true})
const selectedNode=computed(()=>{
  revision.value
  const row=props.view.currentRow
  if(!row||!path.value||props.view.fieldAccess(row,'designJson').read!=='visible')return undefined
  try {const id=props.view.getPkKey(row),value=id===undefined?row:props.view.getEditingRow(id)??row
    const node=getValueAtJsonPath(parseJsonDocument(String(value['designJson'])),path.value)
    return isJsonObject(node)&&!Array.isArray(node)?node:undefined
  }catch{return undefined}
})
const hasFields=computed(()=>Array.isArray(selectedNode.value?.['Fields']))
const hasOutputFields=computed(()=>{const fields=selectedNode.value?.['Fields'];return Array.isArray(fields)&&fields.length>0})
const nodeNotice=computed(()=>{
  const node=selectedNode.value;if(!node)return ''
  const fields=Array.isArray(node['Fields'])?node['Fields'].filter(isJsonObject):[]
  const inputs=Array.isArray(node['inputParams'])?node['inputParams'].filter(isJsonObject):[]
  const messages:string[]=[]
  if(fields.filter(field=>field['IsPKey']===1||field['IsPKey']===true||field['IsPKey']==='1').length>1&&!node['PrimaryKeyFields'])messages.push('来源含多个主键标记，未自动指定单字段联表或去重键。')
  if(inputs.some(field=>field['FieldType']===undefined||field['FieldType']===null||field['FieldType']===''))messages.push('部分入参类型未指定，运行参数校验尚未验证。')
  return messages.join(' ')
})
onBeforeUnmount(()=>{active=false;sourceGeneration++;emit('editing-change',false)})
</script>
<style scoped>
.node-workspace {display:grid;grid-template-columns:minmax(280px, 1fr) minmax(0, 2fr);gap:16px;}
.node-workspace>aside {min-width:0;}
.node-actions {display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;}
@media(max-width:900px){.node-workspace{grid-template-columns:1fr;}}
</style>
