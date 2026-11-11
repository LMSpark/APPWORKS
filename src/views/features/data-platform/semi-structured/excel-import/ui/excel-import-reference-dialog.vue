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
    <RendererForm :data-view-key="dataViewKey" :auto-columns="false" :show-data-view-meta="false" :grid-columns="2">
      <FieldText field="refTableDesc" label="当前引用" :readonly="true" /><FieldText field="refTable" label="引用路径" :readonly="true" />
      <FieldText field="textField" label="原文本字段" :readonly="true" /><FieldText field="valueField" label="原值字段" :readonly="true" />
    </RendererForm>
    <RendererButton label="当前引用" :disabled="busy" @click="restoreCurrent" />
    <RendererButton label="浏览其他来源" :disabled="busy" @click="browse('Table')" />
    <div :inert="busy || loading">
      <template v-if="mode==='browse'">
        <RendererButton label="表" :disabled="loading" @click="browse('Table')" />
        <RendererButton label="视图" :disabled="loading" @click="browse('View')" />
        <RendererButton label="字典" :disabled="loading" @click="browse('Dict')" />
      </template>
      <template v-if="physicalReady && kind!=='Dict' && mode==='browse'">
        <RendererForm :data-view-key="appsKey" :auto-columns="false" :show-data-view-meta="false"><FieldSelect data-member="value" :option-data-view-key="appsKey" label="来源应用" /></RendererForm>
        <div class="reference-columns">
          <section><h3>数据库</h3><RendererTable :data-view-key="databasesKey" :children="databaseColumns" :highlight-current-row="true" :on-row-click="chooseDatabase" :max-height="200" /></section>
          <section><h3>{{ kind==='View'?'物理视图':'数据表' }}</h3><RendererTable :data-view-key="objectKey" :children="objectColumns" :highlight-current-row="true" :on-row-click="chooseObject" :max-height="200" /></section>
        </div>
      </template>
      <section v-if="physicalReady && kind!=='Dict' && mode==='stored'"><h3>已保存的引用对象</h3><RendererTable :data-view-key="objectKey" :children="objectColumns" :highlight-current-row="true" :max-height="180" /></section>
      <RendererTable v-if="dictionaryReady && kind==='Dict' && mode==='stored'" :data-view-key="dictionaryKey" :children="dictionaryColumns" :highlight-current-row="true" :max-height="230" />
      <RendererTable v-else-if="dictionaryReady && kind==='Dict'" :data-view-key="dictionaryKey" :children="dictionaryColumns" :highlight-current-row="true" :on-row-click="chooseDictionary" :max-height="230" />
      <template v-if="kind!=='Dict'&&physicalReady || kind==='Dict'&&dictionaryFields">
        <RendererForm :data-view-key="textKey" :auto-columns="false" :show-data-view-meta="false"><FieldSelect data-member="value" :option-data-view-key="textKey" :option-label-fields="kind==='Dict'?['label']:['cnname','enname']" label="文本字段" /></RendererForm>
        <RendererForm :data-view-key="valueKey" :auto-columns="false" :show-data-view-meta="false"><FieldSelect data-member="value" :option-data-view-key="valueKey" :option-label-fields="kind==='Dict'?['label']:['cnname','enname']" label="值字段" /></RendererForm>
      </template>
    </div>
    <template #footer>
      <RendererButton label="取消引用选择" :disabled="busy" @click="emit('close')" />
      <RendererButton label="确认引用" button-type="primary" :disabled="busy || querying || mode==='unresolved' || mode==='restoring'" @click="confirm" />
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
const mode=ref<'restoring'|'stored'|'browse'|'unresolved'>('restoring')
let active=true,generation=0,physicalBrowseInitialized=false,dictionaryBrowseInitialized=false,source:DataSet|undefined,dictionary:DataSet|undefined
const unsubscribers:Array<()=>void>=[]
const key=(table:string,view='default')=>buildDataViewKey(table,view,LowcodeExcelImport.referenceScenarioId)
const appsKey=key('Base_AppSystemList'),databasesKey=key('Base_AppAndSource_Relation'),dictionaryKey=computed(()=>buildDataViewKey('_Base_DictType',mode.value==='stored'?'excelStoredReference':'excelReferences',LowcodeDictionary.editorScenarioId))
const objectKey=computed(()=>key(kind.value==='View'?'_Base_ViewList':'_Base_TblList',mode.value==='stored'?'storedObject':'default'))
const textKey=computed(()=>kind.value==='Dict'?dictionaryFields.value?.text.dataViewKey??'':key('Base_TblField',mode.value==='stored'?(kind.value==='View'?'storedViewText':'storedTableText'):(kind.value==='View'?'viewTextFields':'textFields')))
const valueKey=computed(()=>kind.value==='Dict'?dictionaryFields.value?.value.dataViewKey??'':key('Base_TblField',mode.value==='stored'?(kind.value==='View'?'storedViewValue':'storedTableValue'):(kind.value==='View'?'viewValueFields':'valueFields')))
const databaseColumns:SparkNode[]=[{type:'r-text',props:{field:'conName',label:'数据库',readonly:true}}]
const objectColumns=computed<SparkNode[]>(()=>[{type:'r-text',props:{field:kind.value==='View'?'vewname':'tblname',label:'名称',readonly:true}},{type:'r-text',props:{field:kind.value==='View'?'vewdesc':'tbldesc',label:'描述',readonly:true}}])
const dictionaryColumns:SparkNode[]=[{type:'r-text',props:{field:'TypeName',label:'字典名称',readonly:true}},{type:'r-text',props:{field:'functiondesc',label:'功能描述',readonly:true}}]
const querying=computed(()=>{revision.value;const bindings=kind.value==='Dict'?[dictionaryKey.value,textKey.value,valueKey.value]:mode.value==='stored'?[objectKey.value,textKey.value,valueKey.value]:[appsKey,databasesKey,objectKey.value,textKey.value,valueKey.value];return loading.value||bindings.filter(Boolean).some(binding=>{const view=runtime?.resolveView(binding);return view?.requestState===RequestState.Loading||view?.requestState===RequestState.Preparing})})
function observe(dataSet:DataSet):void{unsubscribers.push(dataSet.onAnyViewChange({rowsChanged:()=>revision.value++,requestStateChanged:()=>revision.value++}))}
async function loadViews():Promise<void>{const database=runtime?.resolveView(databasesKey);if(database?.getSelectedValues().length===1)await source?.getView('_Base_ViewList')?.refresh()}
function check(own:number):void{if(!active||own!==generation)throw new Error('引用选择已关闭或切换')}
async function loadSource(id:string,own:number):Promise<DataSet>{
 if(!runtime)throw new Error('引用选择缺少原页面运行实例')
 const loaded=await runtime.ensureScenarioLoaded(id);check(own)
 if(id===LowcodeDictionary.editorScenarioId){if(dictionary!==loaded){dictionary=loaded;observe(loaded)}}
 else if(id===LowcodeExcelImport.referenceScenarioId){if(source!==loaded){source=loaded;observe(loaded)}}
 else throw new Error('引用来源场景未声明')
 return loaded
}
function clearPresentation():void{physicalReady.value=false;dictionaryReady.value=false;dictionaryFields.value?.dispose();dictionaryFields.value=undefined}
async function browse(next:Kind):Promise<void>{
 if(props.busy||!runtime||!active)return
 const own=++generation;mode.value='browse';kind.value=next;loading.value=true;error.value='';clearPresentation()
 try{
  if(next==='Dict'){
   const loaded=await loadSource(LowcodeDictionary.editorScenarioId,own),definition=loaded.getView('_Base_DictType','excelReferences')
   if(!dictionaryBrowseInitialized){check(own);definition?.clearSelectedRows();check(own);definition?.setCurrentRow(null);dictionaryBrowseInitialized=true}
   dictionaryFields.value=new ExcelDictionaryReferenceFields(loaded,'excelReferences');await definition?.refresh();check(own);dictionaryReady.value=true
  }else{
   const loaded=await loadSource(LowcodeExcelImport.referenceScenarioId,own)
   if(!physicalBrowseInitialized){
    for(const binding of [appsKey,databasesKey,key('_Base_TblList'),key('_Base_ViewList'),key('Base_TblField','textFields'),key('Base_TblField','valueFields'),key('Base_TblField','viewTextFields'),key('Base_TblField','viewValueFields')]){const view=runtime.resolveView(binding);check(own);view?.clearSelectedRows();check(own);view?.setCurrentRow(null)}
    physicalBrowseInitialized=true
   }
   loaded.triggerAutoLoad();if(next==='View')await loadViews();check(own);physicalReady.value=true
  }
 }catch(cause){if(active&&own===generation)error.value=cause instanceof Error?cause.message:String(cause)}
 finally{if(active&&own===generation)loading.value=false}
}
async function restoreCurrent():Promise<void>{
 if(props.busy||!active)return
 const own=++generation;mode.value='restoring';loading.value=true;error.value='';clearPresentation()
 try{
  const restored=await props.reference.restoreStored({loadSource:id=>loadSource(id,own),assertCurrent:()=>check(own)});check(own)
  if(!restored){await browse('Table');return}
  kind.value=restored.kind;mode.value='stored';dictionaryFields.value=restored.dictionaryFields
  if(restored.kind==='Dict')dictionaryReady.value=true;else physicalReady.value=true
 }catch(cause){if(active&&own===generation){mode.value='unresolved';error.value=`当前引用未能定位，原值已保留。${cause instanceof Error?cause.message:String(cause)}`}}
 finally{if(active&&own===generation)loading.value=false}
}
function choose(binding:string,row:DataRow):void{if(props.busy)return;const view=runtime?.resolveView(binding);view?.setCurrentRow(row);view?.setSelectedRows([row])}
async function chooseDatabase(row:DataRow):Promise<void>{choose(databasesKey,row);if(kind.value==='View'){try{await loadViews()}catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}}}
function chooseObject(row:DataRow):void{choose(objectKey.value,row)}
function chooseDictionary(row:DataRow):void{try{choose(dictionaryKey.value,row);dictionaryFields.value?.refresh();error.value=''}catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}}
async function confirm():Promise<void>{
 if(props.busy||querying.value||mode.value!=='stored'&&mode.value!=='browse')return
 const own=generation,scope=mode.value
 loading.value=true
 try{const selected=kind.value==='Dict'?dictionary:source;if(!selected)throw new Error('引用来源未就绪');await props.reference.select({scope,check:()=>check(own),kind:kind.value,source:selected,...(dictionaryFields.value?{dictionaryFields:dictionaryFields.value}:{})});check(own);emit('close')}
 catch(cause){if(active&&own===generation)error.value=cause instanceof Error?cause.message:String(cause)}
 finally{if(active&&own===generation)loading.value=false}
}
onMounted(restoreCurrent)
onBeforeUnmount(()=>{active=false;generation++;unsubscribers.splice(0).forEach(dispose=>dispose());dictionaryFields.value?.dispose()})
</script>
<style scoped>
.reference-columns{display:grid;grid-template-columns:1fr 2fr;gap:16px}
.reference-columns section{min-width:0}
</style>
