<!--
@module app:views/features/data-platform/structured-config/logic-view/ui/logic-view-node-editor
职责：按原设计字段的精确节点路径编排节点树、基础、字段及关联配置。
边界：标准FieldJson写回原DataView，不查询来源、不复制节点草稿、不单独保存。
-->
<template>
  <div class="node-workspace">
    <RendererForm :data-view-key="viewKey" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1" data-logic-node-outline>
      <FieldJson field="designJson" label="节点" mode="outline" outline-children-field="ChildTables" :children="nodeColumns" :selected-path="path"
        :on-selected-path-change="select" :height="500" />
    </RendererForm>
    <div data-logic-node-editor>
      <p v-if="!path">请选择左侧节点后再编辑</p>
      <RendererTabs v-else :data-view-key="viewKey" :model-value="tab" @update:model-value="value => {if (!pending.size) tab=String(value)}">
        <RendererTabPane :index="0" name="basic" label="单项基本信息">
          <RendererForm :data-view-key="viewKey" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1">
            <FieldJson field="designJson" label="基础配置" mode="form" :value-path="path" :schema="basicSchema" :readonly="disabled" :on-editing-change="value=>editing('basic',value)" />
            <FieldJson field="designJson" label="条件" mode="properties" :value-path="path" :schema="filterSchema" :readonly="disabled" :on-editing-change="value=>editing('filter',value)" />
            <FieldJson v-if="hasFields" field="designJson" label="字段信息" mode="rows" :value-path="[...path,'Fields']" :children="fieldColumns" :readonly="disabled" :on-editing-change="value=>editing('fields',value)" />
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
</template>
<script setup lang="ts">
import {computed, onBeforeUnmount, ref, watch} from 'vue'
import {type DataView, type SparkNode} from '@spark-appworks/spark-data'
import {getValueAtJsonPath, parseJsonDocument, type JsonPath, type JsonSchemaObject} from '@spark-appworks/spark-json-document'
import {FieldJson, RendererForm, RendererTabs, RendererTabPane} from '@spark-appworks/spark-component'
const props=defineProps<{viewKey:string;view:DataView;disabled:boolean}>()
const emit=defineEmits<{'editing-change':[value:boolean]}>()
const path=ref<JsonPath|null>(null),tab=ref('basic'),revision=ref(0),pending=ref(new Set<string>())
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
watch(()=>props.view,(view,_,cleanup)=>{
  path.value=null;pending.value.clear();emit('editing-change',false)
  const changed=()=>revision.value++
  view.events.on('editingChanged',changed);view.events.on('rowsChanged',changed)
  cleanup(()=>{view.events.off('editingChanged',changed);view.events.off('rowsChanged',changed)})
},{immediate:true})
const hasFields=computed(()=>{
  revision.value
  const row=props.view.currentRow
  if(!row||!path.value||props.view.fieldAccess(row,'designJson').read!=='visible')return false
  try {const id=props.view.getPkKey(row),value=id===undefined?row:props.view.getEditingRow(id)??row
    const node=getValueAtJsonPath(parseJsonDocument(String(value['designJson'])),path.value)
    return !!node&&typeof node==='object'&&!Array.isArray(node)&&Array.isArray(node['Fields'])
  }catch{return false}
})
onBeforeUnmount(()=>emit('editing-change',false))
</script>
<style scoped>
.node-workspace {display:grid;grid-template-columns:minmax(280px, 1fr) minmax(0, 2fr);gap:16px;}
@media(max-width:900px){.node-workspace{grid-template-columns:1fr;}}
</style>
