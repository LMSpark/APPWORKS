<!--
@module app:views/features/data-platform/semi-structured/excel-import/ui/excel-import-sheet-layout-pane
职责：用标准绑定组件维护单组主表、明细和相对表尾；不持有布局草稿或保存owner。
-->
<template>
  <section class="excel-layout-pane">
    <h2>相对版式</h2>
    <p>配置单组主表、明细和相对表尾的导出版式。重复分段、汇总及导入尚未完成验收。</p>
    <p v-if="!root" role="status">请选择一个已保存的根配置。</p>
    <template v-else>
      <p v-if="problem || sourceError" role="status">{{ problem || sourceError }}</p>
      <RendererButton :data-view-key="dataViewKey" label="清空版式" perm-action="edit" :disabled="blocked || !raw || editing.size>0" @click="clear" />
      <template v-if="!part && !problem">
        <h3>选择明细配置</h3>
        <RendererTable :data-view-key="childrenKey" :children="childColumns" :highlight-current-row="true" :show-data-view-meta="false" />
        <RendererButton :data-view-key="dataViewKey" label="创建单组导出版式" perm-action="edit" :disabled="blocked || !directoriesReady || !modeReady || !detailId" @click="create" />
      </template>
      <RendererForm v-if="part" :key="rowEpoch" :data-view-key="dataViewKey" v-bind="rootId===undefined?{}:{contextRowId:rootId}" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1">
        <FieldJson field="sheet_layout_json" label="启用设置" mode="form" :schema="enabledSchema" :readonly="blocked || !directoriesReady || !modeReady" :on-change="beforeChange" :on-editing-change="value=>pending('enabled',value)" />
        <p>主表来源：{{ part.rootTable['table'] }}；明细来源：{{ part.detailTable['table'] }}</p>
        <section v-for="region in regions" :key="region.id" class="excel-layout-region">
          <h3>{{ region.label }}</h3>
          <FieldJson field="sheet_layout_json" :label="region.label+'范围'" mode="form" :value-path="['regions',region.index,'bounds']" :schema="boundsSchema" :readonly="blocked || !directoriesReady || !modeReady" :on-change="beforeChange" :on-editing-change="value=>pending(region.id+'.bounds',value)" />
          <FieldJson v-if="region.shape==='list'" field="sheet_layout_json" label="明细表头及数据起点" mode="form" :value-path="['regions',region.index,'scan']" :schema="scanSchema" :readonly="blocked || !directoriesReady || !modeReady" :on-change="beforeChange" :on-editing-change="value=>pending('scan',value)" />
          <FieldJson v-if="region.shape==='list'" field="sheet_layout_json" label="主表与明细关联" mode="form" :value-path="['regions',region.index,'link']" :schema="linkSchema" :readonly="blocked || !directoriesReady || !modeReady" :on-change="beforeChange" :on-editing-change="value=>pending('link',value)" />
          <FieldJson field="sheet_layout_json" :label="region.label+'字段'" mode="rows" :value-path="['regions',region.index,'fields']" :children="region.children" :row-adapter="region.adapter" :reorderable="true" :readonly="blocked || !directoriesReady || !modeReady" :on-change="beforeChange" :on-editing-change="value=>pending(region.id+'.fields',value)" />
        </section>
        <RendererButton label="检查版式结构" :disabled="blocked || editing.size>0" @click="diagnose" />
        <p v-if="diagnostic" role="status">{{ diagnostic }}</p>
      </RendererForm>
      <RendererForm v-else-if="problem" :data-view-key="dataViewKey" v-bind="rootId===undefined?{}:{contextRowId:rootId}" :auto-columns="false" :show-data-view-meta="false">
        <FieldJson field="sheet_layout_json" label="当前原定义（只读）" mode="text" :readonly="true" />
      </RendererForm>
      <p v-if="error" role="alert">{{ error }}</p>
    </template>
  </section>
</template>
<script setup lang="ts">
import {computed,onBeforeUnmount,ref,watch} from 'vue'
import {buildDataViewKey,RequestState,type DataRow,type SparkNode} from '@spark-appworks/spark-data'
import {isJsonObject,type JsonSchemaObject} from '@spark-appworks/spark-json-document'
import * as Components from '@spark-appworks/spark-component'
import type {RJsonProps} from '@spark-appworks/spark-component'
import {createSingleExportLayout,readSingleExportLayout,validateSingleExportLayout} from '@/lowcode/resources/semi-structured/excel-import/layout/definition'
import {excelLayoutTableKey} from '@/lowcode/resources/semi-structured/excel-import/layout/routes'
import {ExcelPhysicalFieldDirectory} from '@/lowcode/resources/semi-structured/excel-import/transform/physical-fields'
const {PAGE_RUNTIME,RendererButton,RendererTable,RendererForm,FieldJson,useSparkComponent}=Components
type JsonArrayRowAdapter=NonNullable<RJsonProps['rowAdapter']>
const props=withDefaults(defineProps<{dataViewKey:string;disabled?:boolean;beforeChange?:(value:unknown,previous:unknown,control:{cancel:boolean})=>void}>(),{disabled:false})
const emit=defineEmits<{'session-change':[value:boolean]}>()
const {sparkConsume}=useSparkComponent({type:'excel-import-sheet-layout-pane'}),injected=sparkConsume(PAGE_RUNTIME),resolved=injected?.resolveView(props.dataViewKey),owned=resolved?.dataSet
if(!injected||!resolved||!owned||resolved.tableName!=='Base_ImportData_Config'||owned.scenarioId!=='0F93B82141CF40852021D704B0E30BF4')throw Error('版式编辑缺少原节点视图')
const runtime=injected,view=resolved,dataSet=owned,openedKey=props.dataViewKey,candidate=dataSet.getView(view.tableName,'layoutChildren')
if(!candidate)throw Error('版式编辑缺少原明细选择视图')
const childrenView=candidate
const childrenKey=buildDataViewKey(view.tableName,'layoutChildren',dataSet.scenarioId),revision=ref(0),rowEpoch=ref(0),rootEpoch=ref(0),editing=ref(new Set<string>()),error=ref(''),diagnostic=ref('')
let active=true,generation=0
const changed=()=>{revision.value++},stop=dataSet.onAnyViewChange({rowsChanged:changed,editingChanged:changed,requestStateChanged:changed,mutatingChanged:changed,currentRowChanged:changed})
const root=computed(()=>{revision.value;if(!active||view.destroyed||dataSet.destroyed)return null;const row=view.currentRow;try{return row&&row['schemeid']===view.queryContext['importConfigId']&&row['pid']===view.queryContext['importConfigId']&&['schemeid','pid'].every(field=>view.fieldAccess(row,field).read==='visible')?row:null}catch{return null}})
const rootId=computed(()=>root.value?view.getPkKey(root.value):undefined)
const raw=computed(()=>{revision.value;if(!active||dataSet.destroyed||view.destroyed||runtime.destroyed)return undefined;const row=root.value,id=rootId.value;if(!row||id===undefined||view.fieldAccess(row,'sheet_layout_json').read!=='visible')return undefined;return view.getEditingRow(id)?.['sheet_layout_json']})
const parsed=computed(()=>{try{return {value:readSingleExportLayout(raw.value),error:''}}catch(cause){return {value:undefined,error:cause instanceof Error?cause.message:String(cause)}}})
const part=computed(()=>parsed.value.value),problem=computed(()=>parsed.value.error)
const detailId=computed(()=>{
 revision.value
 if(part.value){const matches=view.rows.filter(row=>row['pid']===rootId.value&&row['schemeid']===view.queryContext['importConfigId']&&excelLayoutTableKey(row['table'])===excelLayoutTableKey(part.value?.detailTable['table']));return matches.length===1&&matches[0]?view.getPkKey(matches[0]):undefined}
 const selected=childrenView.currentRow
 return selected&&selected['pid']===rootId.value&&selected['schemeid']===view.queryContext['importConfigId']?childrenView.getPkKey(selected):undefined
})
const contextValid=()=>active&&!dataSet.destroyed&&!view.destroyed&&!runtime.destroyed&&props.dataViewKey===openedKey&&runtime.resolveView(openedKey)===view
const blocked=computed(()=>{revision.value;const row=root.value;return !contextValid()||props.disabled||!row||view.hasUnconfirmedSave||view.mutating||view.requestState!==RequestState.Loaded||view.editActionState(row)!=='enabled'||view.fieldAccess(row,'sheet_layout_json').read!=='visible'||view.fieldAccess(row,'sheet_layout_json').write!=='allowed'||view.fieldAccess(row,'sheet_layout_json').component!=='editable'})
const rootDirectory=new ExcelPhysicalFieldDirectory({dataSet,getPage:()=>runtime,viewId:'excelLayoutRootFields',recordId:()=>rootId.value,allowView:false},changed)
const detailDirectory=new ExcelPhysicalFieldDirectory({dataSet,getPage:()=>runtime,viewId:'excelLayoutDetailFields',recordId:()=>detailId.value,allowView:false},changed)
const directoriesReady=computed(()=>{revision.value;return rootDirectory.ready&&detailDirectory.ready&&(!part.value||excelLayoutTableKey(part.value.rootTable['table'])===excelLayoutTableKey(root.value?.['table']))})
const modeReady=computed(()=>{revision.value;const row=root.value,id=rootId.value,detail=detailId.value,child=detail===undefined?undefined:view.rows.find(row=>view.getPkKey(row)===detail);return !!row&&id!==undefined&&view.fieldAccess(row,'exportType').read==='visible'&&view.getEditingRow(id)?.['exportType']==='default'&&detail!==undefined&&!!child&&view.fieldAccess(child,'exportType').read==='visible'&&child['exportType']==='default'&&!Object.hasOwn(view.getDirtyChanges(detail),'exportType')&&view.getEditingRow(detail)?.['exportType']===child['exportType']})
const sourceError=computed(()=>{revision.value;return rootDirectory.error||detailDirectory.error||(!modeReady.value?'请选择已保存的default主表与明细配置':'')})
const signature=(row:DataRow|undefined|null)=>{if(!row)return null;const id=view.getPkKey(row),draft=id===undefined?undefined:view.getEditingRow(id);return ['rowid','schemeid','pid','relatedappid','table'].map(field=>[row[field],draft?.[field],view.fieldAccess(row,field).read])}
watch(root,()=>{rowEpoch.value++;editing.value=new Set();emit('session-change',false);diagnostic.value=''},{flush:'sync'})
watch(()=>{revision.value;try{return JSON.stringify([rowEpoch.value,view.queryContext,view.requestState,view.mutating,view.hasUnconfirmedSave,signature(root.value)])}catch{return 'invalid'}},()=>{
 const own=++generation;rootDirectory.invalidate();detailDirectory.invalidate();rootEpoch.value++
 if(!contextValid()||!root.value||rootId.value===undefined||view.mutating||view.hasUnconfirmedSave)return
 void Promise.all([rootDirectory.load(),childrenView.refresh()]).then(()=>{if(active&&own===generation){if(childrenView.loadingError||childrenView.requestState!==RequestState.Loaded||!childrenView.countReported||childrenView.total!==childrenView.rows.length)throw Error('明细选择未取得完整正式结果');childrenView.readSnapshot();if(childrenView.rows.some(row=>row['pid']!==rootId.value||row['schemeid']!==view.queryContext['importConfigId']))throw Error('明细选择超出当前根配置');changed()}}).catch(cause=>{if(active&&own===generation)error.value=cause instanceof Error?cause.message:String(cause)})
},{immediate:true,flush:'sync'})
watch(()=>{revision.value;try{return JSON.stringify([rootEpoch.value,detailId.value,signature(view.rows.find(row=>view.getPkKey(row)===detailId.value))])}catch{return 'invalid'}},()=>{void detailDirectory.load().finally(()=>{if(active)changed()})},{immediate:true,flush:'sync'})
function pending(id:string,value:boolean):void{const next=new Set(editing.value);if(value)next.add(id);else next.delete(id);editing.value=next;emit('session-change',next.size>0)}
function beforeChange(value:unknown,previous:unknown,control:unknown):void{const local={cancel:false};props.beforeChange?.(value,previous,local);if(local.cancel){if(control===null||typeof control!=='object')throw Error('缺少原字段交互控制');Reflect.set(control,'cancel',true)}}
function commit(value:string):void{
 const row=root.value,id=rootId.value
 if(blocked.value||!row||id===undefined||editing.value.size)throw Error('当前版式不能修改')
 const control={cancel:false};props.beforeChange?.(value,raw.value,control);if(control.cancel)throw Error('请先处理当前字段修改，再调整版式')
 view.updateEditingValue(id,'sheet_layout_json',value);error.value='';diagnostic.value='';changed()
}
function clear():void{try{commit('')}catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}}
function create():void{try{
 if(!directoriesReady.value||!modeReady.value||!root.value||detailId.value===undefined||childrenView.requestState!==RequestState.Loaded||childrenView.loadingError||!childrenView.countReported||childrenView.total!==childrenView.rows.length)throw Error('请先选择并保存主表与明细来源')
 childrenView.readSnapshot()
 const child=view.rows.find(row=>view.getPkKey(row)===detailId.value)
 if(!child||child['pid']!==rootId.value||typeof root.value['table']!=='string'||typeof child['table']!=='string')throw Error('缺少唯一的直接明细来源')
 const selected=childrenView.currentRow
 const draft=view.getEditingRow(detailId.value)
 if(!selected||['schemeid','pid','relatedappid','table','exportType'].some(field=>childrenView.fieldAccess(selected,field).read!=='visible'||view.fieldAccess(child,field).read!=='visible'||selected[field]!==child[field]||draft?.[field]!==child[field]))throw Error('明细来源正式快照不一致，请刷新配置后重新选择')
 const candidates=view.rows.filter(row=>row['pid']===rootId.value&&row['schemeid']===view.queryContext['importConfigId'])
 if(candidates.some(row=>view.fieldAccess(row,'table').read!=='visible')||candidates.filter(row=>excelLayoutTableKey(row['table'])===excelLayoutTableKey(child['table'])).length!==1||childrenView.rows.some(row=>childrenView.fieldAccess(row,'table').read!=='visible')||childrenView.rows.filter(row=>excelLayoutTableKey(row['table'])===excelLayoutTableKey(selected['table'])).length!==1)throw Error('明细物理路由不唯一或不可读，请先消除歧义')
 commit(JSON.stringify(createSingleExportLayout(root.value['table'],child['table'])))
}catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}}
function diagnose():void{try{validateSingleExportLayout(raw.value);diagnostic.value='结构检查通过；保存时仍沿原模型校验正式引用。'}catch(cause){diagnostic.value=cause instanceof Error?cause.message:String(cause)}}
const enabledSchema:JsonSchemaObject={type:'object',required:['enabled'],properties:{enabled:{type:'boolean',title:'启用单组导出版式'}}}
const boundsSchema:JsonSchemaObject={type:'object',required:['from','to'],properties:{from:{type:'string',title:'范围起点'},to:{type:'string',title:'范围终点'}}}
const scanSchema:JsonSchemaObject={type:'object',required:['headerRow','dataStartOffset'],properties:{headerRow:{type:'integer',title:'表头行',minimum:1,maximum:1048576},dataStartOffset:{type:'integer',title:'数据起始偏移',minimum:1,maximum:1048576}}}
const linkSchema=computed<JsonSchemaObject>(()=>({type:'object',required:['parentField','foreignKeyField'],properties:{parentField:{type:'string',title:'主表关联键','x-optionDataViewKey':rootDirectory.dataViewKey},foreignKeyField:{type:'string',title:'明细外键','x-optionDataViewKey':detailDirectory.dataViewKey}}}))
const childColumns:SparkNode[]=Object.entries({sheetName:'明细配置',table:'物理来源'}).map(([field,label])=>({type:'r-text',props:{field,label,readonly:true}}))
const adapter=(shape:string):JsonArrayRowAdapter=>({read:original=>{const locate=isJsonObject(original['locate'])?original['locate']:{};return Object.fromEntries(Object.entries({name:original['name'],title:original['title'],position:shape==='form'?locate['cell']:locate['column'],offset:locate['rowOffset']}).filter(([,value])=>value!==undefined))},write:(value,original)=>{
 const locate=original&&isJsonObject(original['locate'])?original['locate']:{}
 if(typeof value['name']!=='string'||!value['name'].trim()||typeof value['position']!=='string'||!value['position'].trim()||shape==='block'&&(typeof value['offset']!=='number'||!Number.isSafeInteger(value['offset'])||value['offset']<1))throw Error('请填写字段、位置和有效偏移')
 return {...original,name:value['name'],...(shape==='list'&&typeof value['title']==='string'?{title:value['title']}:{ }),locate:{...locate,mode:shape==='form'?'cell':shape==='list'?'listColumn':'afterList',...(shape==='form'?{cell:value['position']}:{column:value['position']}),...(shape==='block'?{rowOffset:value['offset']}:{})}}
}})
const adapters={form:adapter('form'),list:adapter('list'),block:adapter('block')}
const regions=computed(()=>{const current=part.value;if(!current)return [];return (['form','list','block'] as const).map(shape=>{
 const region=current[shape],key=shape==='list'?detailDirectory.dataViewKey:rootDirectory.dataViewKey
 const fields:SparkNode[]=[{type:'r-select',props:{field:'name',label:'物理字段',optionDataViewKey:key,optionLabelFields:['cnname','enname'],filterable:true,clearable:false}},...(shape==='list'?[{type:'r-text',props:{field:'title',label:'列标题'}}]:[]),{type:'r-text',props:{field:'position',label:shape==='form'?'固定单元格':'列号'}},...(shape==='block'?[{type:'r-number',props:{field:'offset',label:'明细后偏移',min:1}}]:[])]
 return {id:String(region['id']),label:shape==='form'?'主表':shape==='list'?'明细':'表尾',shape,index:current.indexes[shape],children:fields,adapter:adapters[shape]}
})})
onBeforeUnmount(()=>{active=false;generation++;stop();rootDirectory.dispose();detailDirectory.dispose();emit('session-change',false)})
</script>
<style scoped>
.excel-layout-pane{display:grid;gap:12px}.excel-layout-region{padding:12px;border:1px solid var(--el-border-color);border-radius:4px}
</style>
