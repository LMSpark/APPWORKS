<!--
@module @spark-appworks/spark-component:components/fields/data-components/text/FieldJson/JsonArrayOutline
职责：将JSON对象数组及其子数组呈现为标准子字段的只读树表，通知精确选择路径。
边界：局部DataView只呈现原字段可读值，不写JSON、不查询、不保存、不产生业务身份。
AI用途：复用嵌套子数组或平面父子身份的只读展示，选择路径直接交回原JSON编辑域。
-->
<template>
  <div class="json-array-outline">
  <p v-if="error" role="alert">{{ error }}；原始JSON保留。</p>
  <el-table v-else-if="view" :key="generation" :data="treeRows" :height="height" :row-key="rowKey" :tree-props="{children: childKey}" default-expand-all
    border highlight-current-row :current-row-key="selectedKey" empty-text="无记录可显示" @row-click="select">
    <el-table-column v-for="(child, index) in fields" :key="index" :label="String(child.props?.['label'] || child.props?.['field'])" :min-width="180">
      <template #default="{row}"><FieldTableCellScope :source="view" :row="originalRow(row)" display-only>
        <SparkComponentRenderer :config="{...child,props:{...child.props,field:alias(index),label:'',readonly:true}}" />
      </FieldTableCellScope></template>
    </el-table-column>
  </el-table>
  </div>
</template>
<script setup lang="ts">
import {computed, nextTick, onBeforeUnmount, onUnmounted, ref, shallowRef, useId, watch} from 'vue'
import {SparkData, getSparkNodeChildren, type DataRow, type DataSet, type SparkNodeChildren} from '@spark-appworks/spark-data'
import {isJsonObject, parseJsonDocument, type JsonObject, type JsonPath, type JsonValue} from '@spark-appworks/spark-json-document'
import {SparkComponentRenderer, DATA_SOURCE, useSparkComponent} from '../../../../internal'
import FieldTableCellScope from '../../../non-data-components/FieldTableCellScope.vue'
const props = defineProps<{modelValue:string; children?:SparkNodeChildren | undefined; childrenField?:string | undefined;
  idField?:string | undefined;parentField?:string | undefined;selectedPath?:JsonPath | null | undefined; height?:number|string | undefined}>()
const emit=defineEmits<{'select-path':[path:JsonPath|null]}>()
const {sparkProvide}=useSparkComponent({type:'r-json-outline'})
const dataSet=shallowRef<DataSet>(), treeRows=shallowRef<DataRow[]>([]), error=ref('')
const generation=ref(0)
const rowKey=`_outline_${useId()}`,childKey=`${rowKey}_children`
const paths=new Map<string,JsonPath>()
const fields=computed(()=>getSparkNodeChildren(props.children).filter(node=>typeof node.props?.['field']==='string'))
const view=computed(()=>dataSet.value?.getView('Outline'))
const selectedKey=computed(()=>props.selectedPath ? JSON.stringify(props.selectedPath) : undefined)
function alias(index:number):string{return `field_${index}`}
function originalRow(row:DataRow):DataRow{return view.value?.rows.find(item=>item[rowKey]===row[rowKey]) ?? row}
function flatTree(value:JsonValue,project:(item:JsonObject,path:JsonPath)=>DataRow):DataRow[]{
  const idField=props.idField,parentField=props.parentField
  if(!idField?.trim()||!parentField?.trim())throw new Error('JSON平面节点树须同时配置身份及父项字段')
  if(props.childrenField!==undefined)throw new Error('JSON节点树不能同时配置子数组和平面父项字段')
  if(!Array.isArray(value))throw new Error('JSON节点必须是对象数组')
  const entries=new Map<string|number,{row:DataRow;parent:JsonValue|undefined;children:DataRow[]}>()
  const identity=(id:unknown)=>typeof id==='string'&&Boolean(id.trim())||typeof id==='number'&&Number.isFinite(id)
  for(const [index,item] of value.entries()){
    if(!isJsonObject(item)||Array.isArray(item))throw new Error('JSON节点必须是对象')
    const id=Object.hasOwn(item,idField)?item[idField]:undefined
    if(!identity(id)||typeof id!=='string'&&typeof id!=='number')throw new Error('JSON平面节点身份无效')
    if(entries.has(id))throw new Error('JSON平面节点身份重复')
    const children:DataRow[]=[],parent=Object.hasOwn(item,parentField)?item[parentField]:undefined
    entries.set(id,{row:{...project(item,[index]),[childKey]:children},parent,children})
  }
  const roots:DataRow[]=[],parents=new Map<string|number,string|number>()
  for(const [id,entry] of entries){
    const parent=entry.parent
    if(parent===undefined||parent===null||parent===''){roots.push(entry.row);continue}
    if(!identity(parent)||typeof parent!=='string'&&typeof parent!=='number')throw new Error('JSON平面节点父项身份无效')
    const target=entries.get(parent);if(!target)throw new Error('JSON平面节点父项不存在')
    parents.set(id,parent);target.children.push(entry.row)
  }
  const done=new Set<string|number>()
  for(const id of entries.keys()){
    const visiting=new Set<string|number>();let current:string|number|undefined=id
    while(current!==undefined&&!done.has(current)){
      if(visiting.has(current))throw new Error('JSON平面节点存在循环父项')
      visiting.add(current);current=parents.get(current)
    }
    for(const visited of visiting)done.add(visited)
  }
  return roots
}
function rebuild():void {
  const previous=dataSet.value
  dataSet.value=undefined;treeRows.value=[];paths.clear();error.value='';generation.value++
  void nextTick(()=>previous?.destroy())
  try {
    const flatMode=props.idField!==undefined||props.parentField!==undefined
    if(!flatMode&&!props.childrenField?.trim())throw new Error('JSON节点树缺少子数组字段')
    if(fields.value.some(node=>node.props?.['dataViewKey']!==undefined||node.props?.['dataMember']!==undefined||node.props?.['dataField']!==undefined))throw new Error('JSON子字段只绑定对象成员field')
    const roots=parseJsonDocument(props.modelValue),flat:DataRow[]=[]
    const project=(item:JsonObject,ownPath:JsonPath):DataRow=>{
      const id=JSON.stringify(ownPath);paths.set(id,ownPath)
      const row:DataRow={[rowKey]:id,...Object.fromEntries(fields.value.map((child,i)=>[alias(i),item[String(child.props?.['field'])]]))}
      flat.push(row);return row
    }
    const visit=(value:JsonValue,path:JsonPath):DataRow[]=>{
      if(!Array.isArray(value))throw new Error('JSON节点必须是对象数组')
      return value.map((item,index)=>{
        if(!isJsonObject(item)||Array.isArray(item))throw new Error('JSON节点必须是对象')
        const ownPath=[...path,index],row=project(item,ownPath)
        const children=item[props.childrenField!]
        return {...row,[childKey]:children===undefined?[]:visit(children,[...ownPath,props.childrenField!])}
      })
    }
    const tree=flatMode?flatTree(roots,project):visit(roots,[])
    dataSet.value=SparkData.fromJson({tables:{Outline:{resourceType:'static-data',columns:[{name:rowKey,type:'string',isPrimaryKey:true},
      ...fields.value.map((_,i)=>({name:alias(i),type:'object'}))],views:{default:{rows:flat}}}}})
    sparkProvide(DATA_SOURCE,dataSet.value.getView('Outline')!)
    treeRows.value=tree
    if(selectedKey.value&&!paths.has(selectedKey.value))emit('select-path',null)
  }catch(cause){error.value=cause instanceof Error?cause.message:String(cause);if(props.selectedPath)emit('select-path',null)}
}
function select(row:DataRow):void {
  const path=paths.get(String(row[rowKey]))
  if(path)emit('select-path',[...path])
}
watch([()=>props.modelValue,()=>props.childrenField,()=>props.idField,()=>props.parentField,()=>JSON.stringify(fields.value)],rebuild,{immediate:true})
onBeforeUnmount(()=>{if(props.selectedPath)emit('select-path',null)})
onUnmounted(()=>dataSet.value?.destroy())
</script>
<style scoped>
.json-array-outline {width:100%;min-width:0;}
.json-array-outline :deep(.field-display) {display:block;}
.json-array-outline :deep(.field-label) {display:none;}
.json-array-outline :deep(.field-value) {white-space:nowrap;}
</style>
