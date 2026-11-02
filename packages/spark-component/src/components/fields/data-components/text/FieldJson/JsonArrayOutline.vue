<!--
@module @spark-appworks/spark-component:components/fields/data-components/text/FieldJson/JsonArrayOutline
职责：将JSON对象数组及其子数组呈现为标准子字段的只读树表，通知精确选择路径。
边界：局部DataView只呈现原字段可读值，不写JSON、不查询、不保存、不产生业务身份。
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
import {isJsonObject, parseJsonDocument, type JsonPath, type JsonValue} from '@spark-appworks/spark-json-document'
import {SparkComponentRenderer, DATA_SOURCE, useSparkComponent} from '../../../../internal'
import FieldTableCellScope from '../../../non-data-components/FieldTableCellScope.vue'
const props = defineProps<{modelValue:string; children?:SparkNodeChildren | undefined; childrenField?:string | undefined;
  selectedPath?:JsonPath | null | undefined; height?:number|string | undefined}>()
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
function rebuild():void {
  const previous=dataSet.value
  dataSet.value=undefined;treeRows.value=[];paths.clear();error.value='';generation.value++
  void nextTick(()=>previous?.destroy())
  try {
    if(!props.childrenField?.trim())throw new Error('JSON节点树缺少子数组字段')
    if(fields.value.some(node=>node.props?.['dataViewKey']!==undefined||node.props?.['dataMember']!==undefined||node.props?.['dataField']!==undefined))throw new Error('JSON子字段只绑定对象成员field')
    const roots=parseJsonDocument(props.modelValue),flat:DataRow[]=[]
    const visit=(value:JsonValue,path:JsonPath):DataRow[]=>{
      if(!Array.isArray(value))throw new Error('JSON节点必须是对象数组')
      return value.map((item,index)=>{
        if(!isJsonObject(item)||Array.isArray(item))throw new Error('JSON节点必须是对象')
        const ownPath=[...path,index],id=JSON.stringify(ownPath)
        paths.set(id,ownPath)
        const row:DataRow={[rowKey]:id,...Object.fromEntries(fields.value.map((child,i)=>[alias(i),item[String(child.props?.['field'])]]))}
        flat.push(row)
        const children=item[props.childrenField!]
        return {...row,[childKey]:children===undefined?[]:visit(children,[...ownPath,props.childrenField!])}
      })
    }
    const tree=visit(roots,[])
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
watch([()=>props.modelValue,()=>props.childrenField,()=>JSON.stringify(fields.value)],rebuild,{immediate:true})
onBeforeUnmount(()=>{if(props.selectedPath)emit('select-path',null)})
onUnmounted(()=>dataSet.value?.destroy())
</script>
<style scoped>
.json-array-outline {width:100%;min-width:0;}
</style>
