import {defineComponent, nextTick, shallowRef} from 'vue'
import {mount} from '@vue/test-utils'
import {describe,expect,it,vi} from 'vitest'
import {DataSet, type DataRow, type DataView} from '@spark-appworks/spark-data'
import {LOWCODE_APPLICATION_CATALOG_FORM_KEY} from '@spark-appworks/spark-lowcode-api'
import {BlueprintWorkspaceDataView} from '@/services/project/blueprint-workspace-dataview'
import NodeStateConfig from '@/views/app/dev-system/components/NodeStateConfig.vue'
import type {DevState} from '@/views/app/dev-system/useDevState'

const fields=['rowid','SysId','prowid','FunOrderValue','NavigationShowType','HorizontalAlignment','IsShowAtNav','IsShowChildItem','BeginGroup']

function createOwner():{owner:BlueprintWorkspaceDataView;dataSet:DataSet} {
  const row:DataRow={rowid:'NODE-1',SysId:'APP-A',prowid:'000000',FunOrderValue:1,NavigationShowType:'0',HorizontalAlignment:'Center',IsShowAtNav:1,IsShowChildItem:1,BeginGroup:0}
  const dataSet=DataSet.fromJson({scenarioId:LOWCODE_APPLICATION_CATALOG_FORM_KEY,tables:{Base_NavigationInfo:{
    modelBinding:{modelId:`${LOWCODE_APPLICATION_CATALOG_FORM_KEY}p000`,modelName:'Base_NavigationInfo'},
    columns:fields.map(name=>({name,type:['FunOrderValue','IsShowAtNav','IsShowChildItem','BeginGroup'].includes(name)?'number':'string',isPrimaryKey:name==='rowid'})),
    views:{default:{autoLoad:false,fieldProjection:fields.map((name,index)=>({fieldId:`F${index}`,source:'resource',resourceFieldId:`F${index}`,
      resourceField:name,viewField:name,type:['FunOrderValue','IsShowAtNav','IsShowChildItem','BeginGroup'].includes(name)?'number':'string',label:name,
      output:true,sortOrder:0,sortDirection:null,group:0,distinct:false,primaryKey:name==='rowid',value:'',valueFunction:'',expression:''}))}},
  }}})
  const view=dataSet.getView('Base_NavigationInfo','default')!
  view.bindQueryExecutor({queryColumns:target=>target.columns,executeQuery:async()=>({
    rows:[row],total:1,countReported:true,resultPrimaryKey:'rowid',rowKey:(item:DataRow)=>item['rowid'],
    assertIdentity:(identity:{scenarioId:string;metaName:string})=>{if(identity.scenarioId!==LOWCODE_APPLICATION_CATALOG_FORM_KEY||identity.metaName!=='Base_NavigationInfo')throw new Error('identity mismatch')},
    fieldAccess:(key:unknown,field:string)=>{const visible=key==='NODE-1'&&fields.includes(field);return {read:visible?'visible' as const:'invisible' as const,write:visible?'allowed' as const:'denied' as const,
      component:visible?'editable' as const:'hidden' as const,required:false,writeMode:visible?'editable' as const:'readonly' as const}},
    readFieldAccess:(item:DataRow,field:string)=>Object.hasOwn(item,field)?'visible' as const:'invisible' as const,
    addActionState:()=>'hidden' as const,editActionState:()=>'enabled' as const,deleteActionState:()=>'hidden' as const,
    createChildActionState:()=>'hidden' as const,viewActionState:()=>'enabled' as const,
  })})
  return {owner:new BlueprintWorkspaceDataView(dataSet,'APP-A',()=>undefined),dataSet}
}

describe('NodeStateConfig navigation display attributes',()=>{
  it('does not fall back to the internal table key when a formal model name is absent',async()=>{
    const {owner,dataSet}=createOwner()
    await owner.load('NODE-1')
    const dataViewWithoutModelName={dataTable:{modelBinding:undefined},dataSet:owner.view.dataSet,viewId:owner.view.viewId,
      tableName:owner.view.tableName,columns:owner.view.columns}
    const ownerWithoutModelName={projectId:owner.projectId,view:dataViewWithoutModelName} as unknown as BlueprintWorkspaceDataView
    const loadNavigationDictionaryOptions=vi.fn(async()=>{})
    const state={projectId:'APP-A',blueprintDraft:{navigation:{displayMode:'compact',horizontalAlignment:'center'}},blueprintWorkspaceDataView:shallowRef(ownerWithoutModelName),
      blueprintNodeFieldAccess:vi.fn(()=>({read:true,write:true})),notifyExternalDataViewChanged:vi.fn(),loadNavigationDictionaryOptions}
    const FormStub=defineComponent({template:'<form><slot /></form>'})
    const wrapper=mount(NodeStateConfig,{props:{state:state as unknown as DevState},global:{stubs:{RendererForm:FormStub,RendererDivider:true,
      FieldSelect:true,FieldRadio:true,FieldNumber:true,FieldSwitch:true}}})
    try{
      await nextTick()
      expect(wrapper.findComponent(FormStub).exists()).toBe(false)
      expect(wrapper.find('[data-view-key]').exists()).toBe(false)
      expect(loadNavigationDictionaryOptions).not.toHaveBeenCalled()
    }finally{wrapper.unmount();owner.dispose();dataSet.destroy()}
  })

  it('binds display attributes to current owner full key and formal dictionary option views',async()=>{
    const {owner,dataSet}=createOwner()
    await owner.load('NODE-1')
    const notifyExternalDataViewChanged=vi.fn()
    const loadNavigationDictionaryOptions=vi.fn(async()=>{})
    const state={projectId:'APP-A',blueprintDraft:{navigation:{title:'Reports',order:1,publishInMenu:true,showChildren:true,beginGroup:false,displayMode:'compact',horizontalAlignment:'center'}},
      blueprintWorkspaceDataView:shallowRef(owner),blueprintNodeFieldAccess:vi.fn(()=>({read:true,write:true})),notifyExternalDataViewChanged,loadNavigationDictionaryOptions}
    const FieldSelectStub=defineComponent({props:['dataViewKey','dataMember','dataField','optionDataViewKey','optionValueField','optionLabelField','readonly'],emits:['update:modelValue'],template:'<button :data-field="dataField" :disabled="readonly" />'})
    const FieldStub=defineComponent({props:['dataViewKey','dataMember','dataField'],template:'<span />'})
    const FormStub=defineComponent({props:['dataViewKey'],template:'<form :data-key="dataViewKey"><slot /></form>'})
    const wrapper=mount(NodeStateConfig,{props:{state:state as unknown as DevState},global:{stubs:{RendererForm:FormStub,RendererDivider:true,
      FieldSelect:FieldSelectStub,FieldRadio:FieldStub,FieldNumber:FieldStub,FieldSwitch:FieldStub}}})
    try{
      await nextTick();await Promise.resolve();await nextTick()
      expect(loadNavigationDictionaryOptions).toHaveBeenCalledOnce()
      const fullKey=`${LOWCODE_APPLICATION_CATALOG_FORM_KEY}@Base_NavigationInfo@default`
      expect(wrapper.getComponent(FormStub).props('dataViewKey')).toBe(fullKey)
      const fieldsFound=wrapper.findAllComponents(FieldSelectStub)
      expect(fieldsFound.map(field=>field.props('dataField'))).toEqual(['NavigationShowType','HorizontalAlignment'])
      expect(fieldsFound.every(field=>field.props('dataViewKey')===fullKey&&field.props('dataMember')==='currentRow')).toBe(true)
      expect(fieldsFound[0]?.props()).toMatchObject({optionValueField:'val',optionLabelField:'txt',readonly:false})
      expect(fieldsFound[0]?.props('optionDataViewKey')).toContain('NavigationShowType_Content')
      expect(fieldsFound[1]?.props('optionDataViewKey')).toContain('Navigationposition')
      fieldsFound[0]!.vm.$emit('update:modelValue','1')
      fieldsFound[1]!.vm.$emit('update:modelValue','Right')
      expect(notifyExternalDataViewChanged).toHaveBeenCalledTimes(2)
    }finally{wrapper.unmount();owner.dispose();dataSet.destroy()}
  })

  it('hides unreadable dictionary values and keeps readable values readonly without write permission',async()=>{
    const {owner,dataSet}=createOwner()
    await owner.load('NODE-1')
    const state={projectId:'APP-A',blueprintDraft:{navigation:{displayMode:'compact',horizontalAlignment:'center'}},blueprintWorkspaceDataView:shallowRef(owner),
      blueprintNodeFieldAccess:(field:string)=>({read:field!=='NavigationShowType',write:false}),notifyExternalDataViewChanged:vi.fn(),loadNavigationDictionaryOptions:vi.fn(async()=>{})}
    const FieldSelectStub=defineComponent({props:['dataField','readonly','label'],template:'<label>{{label}}<input :data-field="dataField" :disabled="readonly" /></label>'})
    const FormStub=defineComponent({template:'<form><slot /></form>'})
    const wrapper=mount(NodeStateConfig,{props:{state:state as unknown as DevState},global:{stubs:{RendererForm:FormStub,RendererDivider:true,
      FieldSelect:FieldSelectStub,FieldRadio:true,FieldNumber:true,FieldSwitch:true}}})
    try{
      await nextTick();await Promise.resolve()
      expect(wrapper.text()).not.toContain('显示方式')
      expect(wrapper.text()).toContain('水平对齐')
      expect(wrapper.findComponent(FieldSelectStub).props('readonly')).toBe(true)
    }finally{wrapper.unmount();owner.dispose();dataSet.destroy()}
  })
})
