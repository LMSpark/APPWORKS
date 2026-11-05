<!--
@module app:views/features/data-platform/semi-structured/excel-import/ui/excel-import-reference-dialog
职责：标准组件绑定原宿主的表、物理视图和字典候选，确认交回原映射编辑命令。
边界：不复制候选、不查询业务数据、不保存；字典字段是可读定义的派生选项。
AI用途：为Excel映射设置引用时复用本次PageRuntime的命名视图，字段写回与持久化交由原映射命令和DataSet。
-->
<template>
  <RendererDialog :model-value="true" :data-view-key="dataViewKey" title="选择引用表／视图／字典字段" :width="1000" :append-to-body="true" @update:model-value="!busy && emit('close')">
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="loading" role="status">正在读取引用来源…</p>
    <RendererForm :data-view-key="dataViewKey" :auto-columns="false" :show-data-view-meta="false"><FieldText field="refTableDesc" label="当前引用" :readonly="true" /></RendererForm>
    <div :inert="busy || loading">
      <RendererButton label="表" :disabled="loading" @click="changeKind('Table')" />
      <RendererButton label="视图" :disabled="loading" @click="changeKind('View')" />
      <RendererButton label="字典" :disabled="loading" @click="changeKind('Dict')" />
      <template v-if="physicalReady && kind!=='Dict'">
        <RendererForm :data-view-key="appsKey" :auto-columns="false" :show-data-view-meta="false"><FieldSelect data-member="value" :option-data-view-key="appsKey" label="来源应用" /></RendererForm>
        <div class="reference-columns">
          <section><h3>数据库</h3><RendererTable :data-view-key="databasesKey" :children="databaseColumns" :highlight-current-row="true" :on-row-click="chooseDatabase" :max-height="200" /></section>
          <section><h3>{{ kind==='View'?'物理视图':'数据表' }}</h3><RendererTable :data-view-key="objectKey" :children="objectColumns" :highlight-current-row="true" :on-row-click="chooseObject" :max-height="200" /></section>
        </div>
      </template>
      <RendererTable v-if="dictionaryReady && kind==='Dict'" :data-view-key="dictionaryKey" :children="dictionaryColumns" :highlight-current-row="true" :on-row-click="chooseDictionary" :max-height="230" />
      <template v-if="kind!=='Dict'&&physicalReady || kind==='Dict'&&dictionaryFields">
        <RendererForm :data-view-key="textKey" :auto-columns="false" :show-data-view-meta="false"><FieldSelect data-member="value" :option-data-view-key="textKey" label="文本字段" /></RendererForm>
        <RendererForm :data-view-key="valueKey" :auto-columns="false" :show-data-view-meta="false"><FieldSelect data-member="value" :option-data-view-key="valueKey" label="值字段" /></RendererForm>
      </template>
    </div>
    <template #footer>
      <RendererButton label="取消引用选择" :disabled="busy" @click="emit('close')" />
      <RendererButton label="确认引用" button-type="primary" :disabled="busy || querying" @click="confirm" />
    </template>
  </RendererDialog>
</template>
<script setup lang="ts">
import {computed,onBeforeUnmount,onMounted,ref,shallowRef} from 'vue'
import {buildDataViewKey,RequestState,type DataRow,type DataSet,type SparkNode} from '@spark-appworks/spark-data'
import {PAGE_RUNTIME,FieldText,FieldSelect,RendererButton,RendererDialog,RendererForm,RendererTable,useSparkComponent} from '@spark-appworks/spark-component'
import {LowcodeExcelImport} from '@/lowcode/resources/semi-structured/excel-import/resource'
import {LowcodeDictionary} from '@/lowcode/resources/structured-config/dictionary/resource'
import {ExcelDictionaryReferenceFields,type ExcelFieldReference} from '@/lowcode/resources/semi-structured/excel-import/field-reference'
const props=defineProps<{dataViewKey:string;reference:ExcelFieldReference;busy:boolean}>(),emit=defineEmits<{close:[]}>()
const {sparkConsume}=useSparkComponent({type:'excel-import-reference-dialog'}),runtime=sparkConsume(PAGE_RUNTIME)
type Kind='Table'|'View'|'Dict'
const kind=ref<Kind>('Table'),error=ref(''),loading=ref(false),physicalReady=ref(false),dictionaryReady=ref(false),revision=ref(0),dictionaryFields=shallowRef<ExcelDictionaryReferenceFields>()
let active=true,source:DataSet|undefined,dictionary:DataSet|undefined
const unsubscribers:Array<()=>void>=[]
const key=(table:string,view='default')=>buildDataViewKey(table,view,LowcodeExcelImport.referenceScenarioId)
const appsKey=key('Base_AppSystemList'),databasesKey=key('Base_AppAndSource_Relation'),dictionaryKey=buildDataViewKey('_Base_DictType','excelReferences',LowcodeDictionary.editorScenarioId)
const objectKey=computed(()=>key(kind.value==='View'?'_Base_ViewList':'_Base_TblList'))
const textKey=computed(()=>kind.value==='Dict'?dictionaryFields.value?.text.dataViewKey??'':key('Base_TblField',kind.value==='View'?'viewTextFields':'textFields'))
const valueKey=computed(()=>kind.value==='Dict'?dictionaryFields.value?.value.dataViewKey??'':key('Base_TblField',kind.value==='View'?'viewValueFields':'valueFields'))
const databaseColumns:SparkNode[]=[{type:'r-text',props:{field:'conName',label:'数据库',readonly:true}}]
const objectColumns=computed<SparkNode[]>(()=>[{type:'r-text',props:{field:kind.value==='View'?'vewname':'tblname',label:'名称',readonly:true}},{type:'r-text',props:{field:kind.value==='View'?'vewdesc':'tbldesc',label:'描述',readonly:true}}])
const dictionaryColumns:SparkNode[]=[{type:'r-text',props:{field:'TypeName',label:'字典名称',readonly:true}},{type:'r-text',props:{field:'functiondesc',label:'功能描述',readonly:true}}]
const querying=computed(()=>{revision.value;return loading.value||[appsKey,databasesKey,objectKey.value,textKey.value,valueKey.value,dictionaryKey].some(binding=>{const view=runtime?.resolveView(binding);return view?.requestState===RequestState.Loading||view?.requestState===RequestState.Preparing})})
function observe(dataSet:DataSet):void{unsubscribers.push(dataSet.onAnyViewChange({rowsChanged:()=>revision.value++,requestStateChanged:()=>revision.value++}))}
async function loadViews():Promise<void>{const database=runtime?.resolveView(databasesKey);if(database?.getSelectedValues().length===1)await source?.getView('_Base_ViewList')?.refresh()}
async function changeKind(next:Kind):Promise<void>{
 if(props.busy||loading.value||!runtime||!active)return
 loading.value=true;error.value=''
 try{
  if(next==='Dict'&&!dictionary){
   const loaded=await runtime.ensureScenarioLoaded(LowcodeDictionary.editorScenarioId);if(!active)return
   dictionary=loaded;observe(loaded);dictionaryFields.value=new ExcelDictionaryReferenceFields(loaded)
   await loaded.getView('_Base_DictType','excelReferences')?.refresh();if(!active)return;dictionaryReady.value=true
  }
  kind.value=next
  if(next==='View')await loadViews()
 }catch(cause){if(active)error.value=cause instanceof Error?cause.message:String(cause)}
 finally{if(active)loading.value=false}
}
function choose(binding:string,row:DataRow):void{if(props.busy)return;const view=runtime?.resolveView(binding);view?.setCurrentRow(row);view?.setSelectedRows([row])}
async function chooseDatabase(row:DataRow):Promise<void>{choose(databasesKey,row);if(kind.value==='View'){try{await loadViews()}catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}}}
function chooseObject(row:DataRow):void{choose(objectKey.value,row)}
function chooseDictionary(row:DataRow):void{try{choose(dictionaryKey,row);dictionaryFields.value?.refresh();error.value=''}catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}}
async function confirm():Promise<void>{
 if(props.busy||querying.value)return
 loading.value=true
 try{const selected=kind.value==='Dict'?dictionary:source;if(!selected)throw new Error('引用来源未就绪');await props.reference.select({kind:kind.value,source:selected,...(dictionaryFields.value?{dictionaryFields:dictionaryFields.value}:{})});if(active)emit('close')}
 catch(cause){if(active)error.value=cause instanceof Error?cause.message:String(cause)}
 finally{if(active)loading.value=false}
}
onMounted(async()=>{
 loading.value=true
 try{
  if(!runtime)throw new Error('引用选择缺少原页面运行实例')
  const loaded=await runtime.ensureScenarioLoaded(LowcodeExcelImport.referenceScenarioId);if(!active)return
  source=loaded;observe(loaded)
  for(const binding of [appsKey,databasesKey,key('_Base_TblList'),key('_Base_ViewList'),key('Base_TblField','textFields'),key('Base_TblField','valueFields'),key('Base_TblField','viewTextFields'),key('Base_TblField','viewValueFields')]){const view=runtime.resolveView(binding);view?.clearSelectedRows();view?.setCurrentRow(null)}
  loaded.triggerAutoLoad();physicalReady.value=true
 }catch(cause){if(active)error.value=cause instanceof Error?cause.message:String(cause)}finally{if(active)loading.value=false}
})
onBeforeUnmount(()=>{active=false;unsubscribers.splice(0).forEach(dispose=>dispose());dictionaryFields.value?.dispose()})
</script>
<style scoped>
.reference-columns{display:grid;grid-template-columns:1fr 2fr;gap:16px}
.reference-columns section{min-width:0}
</style>
